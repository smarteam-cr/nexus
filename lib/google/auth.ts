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
 */

import { google } from "googleapis";
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
 */
export function getImpersonatedAuth(userEmail: string): JWT {
  const { client_email, private_key } = getServiceAccountKey();
  return new JWT({
    email: client_email,
    key: private_key,
    scopes: SCOPES_IMPERSONATE,
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

  const admin = google.admin({ version: "directory_v1", auth: adminAuth });
  const users: DomainUser[] = [];

  // Extraer dominio del adminEmail
  const domain = adminEmail.split("@")[1];
  if (!domain) throw new Error("[google/auth] GOOGLE_ADMIN_EMAIL no tiene dominio válido");

  let pageToken: string | undefined = undefined;

  do {
    try {
      // Anotación explícita: sin ella, `res` queda implícitamente `any` porque
      // `pageToken` (asignado desde res abajo) crea una inferencia circular.
      const res: { data: import("googleapis").admin_directory_v1.Schema$Users } = await admin.users.list({
        domain,
        maxResults: 500,
        orderBy: "email",
        pageToken,
        projection: "basic",
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
