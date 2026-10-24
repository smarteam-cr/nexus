import { Client } from "./sdk";
import { prisma } from "@/lib/db/prisma";
import { jobEnCurso } from "@/lib/jobs/contexto";
import {
  PRESUPUESTO_DE_JOB,
  PRESUPUESTO_DE_RUTA,
  pedirAHubspot,
  type Credencial,
  type DependenciasDelTransporte,
  type PedidoAHubspot,
  type Presupuesto,
} from "./transporte";
import { eventosQueSeCuentan } from "./registro-de-fallas";

/**
 * C-25 (2026-09-04) — EL ÚNICO lugar que sabe cómo se lee el token de una cuenta de HubSpot.
 *
 * Paso (i) de cifrar los tokens en reposo. Hoy devuelve la columna tal cual; el paso (ii) va a
 * descifrar ACÁ (prefijo `enc:`, lectura dual) sin que ningún lector cambie, y el (iii) va a
 * rechazar el texto plano. Para que eso sea posible, NADIE lee `.accessToken` de una
 * HubspotAccount fuera de este archivo — ni en lib, ni en app, ni en scripts. Lo vigila
 * lib/hubspot/creador-unico.test.ts: un archivo que nombra `hubspotAccount` y lee
 * `.accessToken` es un rojo.
 *
 * ⚠ Los tokens de los ENLACES EXTERNOS (`ProjectExternalAccess.accessToken`, Business Case)
 * son otra cosa: identifican un link, no autentican contra HubSpot. No pasan por acá.
 */
export function tokenDeCuenta(cuenta: { accessToken: string }): string {
  return cuenta.accessToken;
}

// ── El transporte (U6, 2026-10-24) ───────────────────────────────────────────
//
// UN solo lugar refresca el token, reintenta ante un 401 y espera ante un 429: `pedirAHubspot`
// (lib/hubspot/transporte.ts). Los clientes del SDK que devuelve este archivo mandan su
// `apiRequest` por ahí, así que ningún llamador tiene que acordarse: el reintento propio ante un
// 401 que había en 14 lugares se borró. Lo vigila lib/hubspot/transporte.test.ts (nadie llama a
// api.hubapi.com fuera de acá) y lo cuenta lib/hubspot/registro-de-fallas.ts.
//
// ⚠ Las APIs tipadas del SDK (`client.crm.companies…`, `client.settings.users…`, 7 llamadas en
// companies.ts y reader.ts) NO pasan por el transporte: van por el http propio del SDK, que ante
// un 401 o un 429 lanza su `ApiException` como siempre. Si una de ellas empieza a chocar con el
// límite, se pasa a `apiRequest`.

/** Un token se renueva si vence en menos de esto. */
const MARGEN_DE_VENCIMIENTO_MS = 5 * 60 * 1000;

/** Los refresh en curso, por cuenta: dos pedidos que reciben un 401 a la vez comparten UNO. */
const renovando = new Map<string, Promise<string>>();
/** El último token que este proceso sabe válido, por cuenta. */
const ultimoToken = new Map<string, string>();

type FilaDeCuenta = { id: string; accessToken: string; refreshToken: string; expiresAt: Date };

/**
 * Refresca el token de la cuenta y lo guarda. El ÚNICO bloque de refrescar y guardar (antes había 5).
 * Si no se puede guardar (una base en solo lectura, como el simulacro de `scripts/merge-duplicate-clients.ts`), el
 * token nuevo se usa igual y queda el aviso: HubSpot no invalida el token anterior al refrescar, así que los demás
 * entornos siguen entrando con el que tienen.
 */
async function refrescarYGuardar(cuenta: FilaDeCuenta): Promise<string> {
  const refreshed = await refreshAccessToken(cuenta.refreshToken);
  try {
    await prisma.hubspotAccount.update({
      where: { id: cuenta.id },
      data: {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      },
    });
  } catch (e) {
    console.error(`[hubspot/client] el token renovado no se pudo guardar (se usa igual): ${e instanceof Error ? e.message : String(e)}`);
  }
  ultimoToken.set(cuenta.id, refreshed.access_token);
  return refreshed.access_token;
}

/**
 * Un token nuevo para la cuenta, con un solo refresh aunque lo pidan varios a la vez.
 *
 * Con `rechazado` (el token que acaba de dar 401): si otro pedido de este proceso, u otro proceso
 * que comparte la cuenta, ya lo renovó, se usa ese y no se refresca de nuevo.
 */
async function renovarToken(cuentaId: string, rechazado?: string): Promise<string> {
  const conocido = ultimoToken.get(cuentaId);
  if (rechazado && conocido && conocido !== rechazado) return conocido;
  const enCurso = renovando.get(cuentaId);
  if (enCurso) return enCurso;

  const promesa = (async () => {
    const cuenta = await prisma.hubspotAccount.findUnique({ where: { id: cuentaId } });
    if (!cuenta) throw new Error(`HubSpot account not found: ${cuentaId}`);
    const guardado = tokenDeCuenta(cuenta);
    if (rechazado && guardado !== rechazado && cuenta.expiresAt > new Date(Date.now() + MARGEN_DE_VENCIMIENTO_MS)) {
      ultimoToken.set(cuentaId, guardado);
      return guardado;
    }
    return refrescarYGuardar(cuenta);
  })().finally(() => renovando.delete(cuentaId));
  renovando.set(cuentaId, promesa);
  return promesa;
}

/** El token vigente de la cuenta, renovado si vence en menos de 5 minutos. */
async function tokenVigente(cuenta: FilaDeCuenta): Promise<string> {
  if (cuenta.expiresAt <= new Date(Date.now() + MARGEN_DE_VENCIMIENTO_MS)) return renovarToken(cuenta.id);
  const token = tokenDeCuenta(cuenta);
  ultimoToken.set(cuenta.id, token);
  return token;
}

/**
 * Cuánto puede esperar el pedido ante un 429: en un job del scheduler o en un script (fuera de Next), lo que diga
 * `Retry-After`; en una ruta del usuario, 2 s como máximo, y el llamador degrada con lo que tenga.
 */
export function presupuestoVigente(): Presupuesto {
  return jobEnCurso() || !process.env.NEXT_RUNTIME ? PRESUPUESTO_DE_JOB : PRESUPUESTO_DE_RUTA;
}

const depsReales: DependenciasDelTransporte = {
  fetch: (url, init) => fetch(url, init),
  esperar: (ms) => new Promise<void>((r) => setTimeout(r, ms)),
  ahora: () => Date.now(),
  eventos: eventosQueSeCuentan,
};

/** El tipo de respuesta que declara el SDK (node-fetch); el transporte devuelve la del `fetch` global, que se usa igual. */
type RespuestaDelSdk = Awaited<ReturnType<Client["apiRequest"]>>;

/**
 * Un cliente del SDK cuyo `apiRequest` va por el transporte, con la credencial de la cuenta. Una cuenta sin refresh
 * token (las Private Apps que se conectan pegando el token, app/api/clients/connect) no se renueva: su 401 vuelve.
 */
function clienteConTransporte(cuenta: FilaDeCuenta, token: string): Client {
  const client = new Client({ accessToken: token });
  let vigente = token;
  const credencial: Credencial = {
    token: () => vigente,
    renovar: cuenta.refreshToken
      ? async (rechazado) => {
          vigente = await renovarToken(cuenta.id, rechazado);
          // Las APIs tipadas del SDK usan el token de la configuración: que también vean el nuevo.
          client.setAccessToken(vigente);
          return vigente;
        }
      : null,
  };
  client.apiRequest = (opts) =>
    pedirAHubspot((opts ?? {}) as PedidoAHubspot, credencial, presupuestoVigente(), depsReales) as unknown as Promise<RespuestaDelSdk>;
  return client;
}

/**
 * Un pedido con un token suelto (el de una conexión que todavía no está guardada, como en el callback de OAuth): el
 * mismo transporte, sin renovar ante un 401 (no hay cuenta de dónde sacar otro token).
 */
export function pedirConToken(token: string, pedido: PedidoAHubspot): Promise<Response> {
  return pedirAHubspot(pedido, { token: () => token, renovar: null }, presupuestoVigente(), depsReales);
}

// ── Cuenta del sistema (Smarteam) ─────────────────────────────────────────────

async function cuentaDelSistema(): Promise<FilaDeCuenta> {
  const account = await prisma.hubspotAccount.findFirst({ where: { isSystem: true } });
  if (!account) throw new Error("No hay cuenta HubSpot del sistema configurada");
  return account;
}

/** El cliente de la cuenta del sistema. Su `apiRequest` renueva el token ante un 401 y espera ante un 429. */
export async function getSystemHubspotClient(): Promise<Client> {
  const account = await cuentaDelSistema();
  return clienteConTransporte(account, await tokenVigente(account));
}

/**
 * Fuerza el refresh del token del sistema y lo guarda, IGNORANDO `expiresAt`.
 *
 * @deprecated Desde U6 (2026-10-24) no hace falta: el transporte renueva solo ante un 401, con un
 * solo refresh aunque lleguen varios a la vez. Queda para los scripts y ramas que todavía la
 * llaman; comparte el mismo refresh en curso.
 */
export async function forceRefreshSystemToken(): Promise<void> {
  const account = await cuentaDelSistema();
  await renovarToken(account.id, tokenDeCuenta(account));
}

/** El token vigente de la cuenta del sistema, para quien arma su pedido a mano (mejor: `getSystemHubspotClient`). */
export async function getSystemAccessToken(): Promise<string> {
  return tokenVigente(await cuentaDelSistema());
}

// ── Cuentas de clientes (sus portales) ───────────────────────────────────────

export async function getHubspotClient(accountId: string): Promise<Client> {
  const account = await prisma.hubspotAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    throw new Error(`HubSpot account not found: ${accountId}`);
  }

  return clienteConTransporte(account, await tokenVigente(account));
}

/** El token vigente de una cuenta (renovado si vence en menos de 5 minutos). Lo usa la auditoría de portales. */
export async function getAccountAccessToken(accountId: string): Promise<string> {
  const account = await prisma.hubspotAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new Error(`Account not found: ${accountId}`);
  return tokenVigente(account);
}

// ── OAuth ────────────────────────────────────────────────────────────────────

/**
 * La llamada HTTP del refresh. ⚠ No la llames para obtener un token: no guarda el nuevo ni junta los
 * pedidos a la vez. Usa `getSystemAccessToken` / `getAccountAccessToken`.
 */
export async function refreshAccessToken(refreshToken: string) {
  const response = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.HUBSPOT_CLIENT_ID!,
      client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to refresh HubSpot token");
  }

  return response.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>;
}

export async function exchangeCodeForTokens(code: string) {
  const response = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.HUBSPOT_CLIENT_ID!,
      client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
      redirect_uri: process.env.HUBSPOT_REDIRECT_URI!,
      code,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HubSpot OAuth error: ${error}`);
  }

  return response.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    hub_id: number;
    hub_domain: string;
    token_type: string;
  }>;
}

export async function getPortalInfo(accessToken: string) {
  const response = await fetch(
    "https://api.hubapi.com/oauth/v1/access-tokens/" + accessToken
  );
  if (!response.ok) throw new Error("Failed to get portal info");
  return response.json() as Promise<{
    hub_id: number;
    hub_domain: string;
    app_id: number;
    token_type: string;
    user: string;
    scopes: string[];
  }>;
}

/** Para las pruebas: olvida los tokens y los refresh en curso de este proceso. */
export function _olvidarTokensParaPruebas(): void {
  renovando.clear();
  ultimoToken.clear();
}
