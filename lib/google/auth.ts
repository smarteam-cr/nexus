/**
 * lib/google/auth.ts
 *
 * Autenticación Google con Service Account + Domain-Wide Delegation (DWD).
 *
 * Variables de entorno requeridas:
 *   GOOGLE_SERVICE_ACCOUNT_KEY  — JSON string de la clave de service account
 *   GOOGLE_ADMIN_EMAIL          — Email del Super Admin del dominio (para DWD)
 *
 * Scopes usados:
 *   - https://www.googleapis.com/auth/drive.readonly
 *   - https://www.googleapis.com/auth/documents.readonly
 *   - https://www.googleapis.com/auth/admin.directory.user.readonly
 *   - https://www.googleapis.com/auth/calendar.readonly
 *   - https://www.googleapis.com/auth/calendar.events.owned (solo getAgendaWriteAuth, aparte)
 */

// Import profundo a propósito, nunca la raíz "googleapis": la raíz carga los tipos de ~400 APIs y
// dejó sin memoria el build del VPS (2026-09-26). Ver lib/google/googleapis-sin-raiz.test.ts.
import { admin as apiAdmin, type admin_directory_v1 } from "googleapis/build/src/apis/admin";
import { JWT } from "google-auth-library";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface DomainUser {
  email: string;
  name: string;
}

// ── Scopes ────────────────────────────────────────────────────────────────────

const SCOPES_IMPERSONATE = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/documents.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
];

const SCOPES_ADMIN = [
  "https://www.googleapis.com/auth/admin.directory.user.readonly",
];

// ── Helper: parsear clave de service account ──────────────────────────────────

function getServiceAccountKey(): {
  client_email: string;
  private_key: string;
} {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("[google/auth] GOOGLE_SERVICE_ACCOUNT_KEY no configurada");
  try {
    const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("[google/auth] Service account key inválida: faltan client_email o private_key");
    }
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("[google/auth]")) throw err;
    throw new Error("[google/auth] GOOGLE_SERVICE_ACCOUNT_KEY no es JSON válido");
  }
}

// ── getImpersonatedAuth ───────────────────────────────────────────────────────

/**
 * Crea un cliente JWT con DWD impersonando al usuario dado.
 * Útil para acceder a Calendar, Drive y Docs de ese usuario.
 *
 * Se reusa el MISMO cliente por persona (2026-10-17): el JWT guarda su token de acceso (una hora) y lo renueva solo, así
 * que cada lectura del calendario no paga otro intercambio de token con Google. Medido en la agenda del inicio: la
 * primera lectura con un cliente nuevo tardó ~1 s; con el token ya en mano, ~0,4 s.
 */
const CLIENTES_IMPERSONADOS = new Map<string, JWT>();
const MAX_CLIENTES_IMPERSONADOS = 200;

export function getImpersonatedAuth(userEmail: string): JWT {
  const k = userEmail.trim().toLowerCase();
  const ya = CLIENTES_IMPERSONADOS.get(k);
  if (ya) return ya;
  const { client_email, private_key } = getServiceAccountKey();
  const nuevo = new JWT({
    email: client_email,
    key: private_key,
    scopes: SCOPES_IMPERSONATE,
    subject: userEmail,
  });
  if (CLIENTES_IMPERSONADOS.size >= MAX_CLIENTES_IMPERSONADOS) CLIENTES_IMPERSONADOS.delete(CLIENTES_IMPERSONADOS.keys().next().value!);
  CLIENTES_IMPERSONADOS.set(k, nuevo);
  return nuevo;
}

// ── getAgendaWriteAuth ────────────────────────────────────────────────────────

/**
 * Tareas internas (2026-10-09): crear y quitar los bloques de una tarea en el calendario de su dueña. Es un JWT APARTE
 * con `calendar.events.owned` (ver, crear, cambiar y borrar eventos solo en los calendarios de los que la persona es
 * dueña), impersonando SOLO a quien hace clic.
 *
 * ⛔ No se suma a SCOPES_IMPERSONATE: si Google Admin no autorizó este permiso, pedirlo junto a los de lectura haría
 * fallar TODAS las lecturas (Meet, Drive, Docs). Aparte, si falta, falla solo agendar y la pantalla ofrece el enlace.
 */
export function getAgendaWriteAuth(userEmail: string): JWT {
  const { client_email, private_key } = getServiceAccountKey();
  return new JWT({
    email: client_email,
    key: private_key,
    scopes: ["https://www.googleapis.com/auth/calendar.events.owned"],
    subject: userEmail,
  });
}

// ── listDomainUsers ───────────────────────────────────────────────────────────

/**
 * Lista todos los usuarios del dominio usando Admin SDK.
 * Impersona al GOOGLE_ADMIN_EMAIL para tener permisos de Admin.
 * Maneja paginación automáticamente.
 */
export async function listDomainUsers(): Promise<DomainUser[]> {
  const adminEmail = process.env.GOOGLE_ADMIN_EMAIL;
  if (!adminEmail) throw new Error("[google/auth] GOOGLE_ADMIN_EMAIL no configurada");

  const { client_email, private_key } = getServiceAccountKey();
  const adminAuth = new JWT({
    email: client_email,
    key: private_key,
    scopes: SCOPES_ADMIN,
    subject: adminEmail,
  });

  const admin = apiAdmin({ version: "directory_v1", auth: adminAuth });
  const users: DomainUser[] = [];

  // Extraer dominio del adminEmail
  const domain = adminEmail.split("@")[1];
  if (!domain) throw new Error("[google/auth] GOOGLE_ADMIN_EMAIL no tiene dominio válido");

  let pageToken: string | undefined = undefined;

  do {
    try {
      // Anotación explícita: sin ella, `res` queda implícitamente `any` porque
      // `pageToken` (asignado desde res abajo) crea una inferencia circular.
      const res: { data: admin_directory_v1.Schema$Users } = await admin.users.list({
        domain,
        maxResults: 500,
        orderBy: "email",
        pageToken,
        projection: "basic",
        // U1 (2026-10-25): sin las suspendidas. Su calendario falla en cada corrida (no se puede impersonar), y un
        // calendario sin leer frena la marca de canceladas y el borrado de invitados de sus reuniones.
        query: "isSuspended=false",
      });

      const page = res.data.users ?? [];
      for (const u of page) {
        const email = u.primaryEmail;
        if (!email) continue;
        const name =
          u.name?.fullName ??
          (`${u.name?.givenName ?? ""} ${u.name?.familyName ?? ""}`.trim() || email);
        users.push({ email, name });
      }

      pageToken = res.data.nextPageToken ?? undefined;
    } catch (err) {
      console.error("[google/auth] Error listando usuarios del dominio:", err);
      break;
    }
  } while (pageToken);

  console.log(`[google/auth] ${users.length} usuarios encontrados en el dominio ${domain}`);
  return users;
}
