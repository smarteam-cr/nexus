import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient, guardCapability, guardInternalUser, guardPermission } from "@/lib/auth/api-guards";
import {
  COOKIE_NONCE_OAUTH,
  PATH_COOKIE_NONCE_OAUTH,
  VIDA_DEL_NONCE_SEG,
  firmarState,
  nuevoNonce,
  type PayloadDeState,
} from "@/lib/hubspot/oauth-state";

const HUBSPOT_SCOPES = [
  // ── CRM Objects ─────────────────────────────────────────────
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "crm.objects.companies.read",
  "crm.objects.companies.write",
  "crm.objects.deals.read",
  "crm.objects.deals.write",
  "crm.objects.line_items.read",
  "crm.objects.line_items.write",
  "crm.objects.custom.read",
  "crm.objects.custom.write",
  "crm.objects.owners.read",
  // ── CRM Schemas ─────────────────────────────────────────────
  "crm.schemas.contacts.read",
  "crm.schemas.contacts.write",
  "crm.schemas.companies.read",
  "crm.schemas.companies.write",
  "crm.schemas.deals.read",
  "crm.schemas.deals.write",
  "crm.schemas.custom.read",
  // ── Lists ───────────────────────────────────────────────────
  "crm.lists.read",
  "crm.lists.write",
  // ── Tickets ──────────────────────────────────────────────────
  "tickets",
  // ── Marketing ───────────────────────────────────────────────
  "forms",
  // ── Automation ──────────────────────────────────────────────
  "automation",
  "automation.sequences.read",
  "automation.sequences.enrollments.write",
  // ── Projects ────────────────────────────────────────────────
  "crm.objects.projects.read",
  "crm.objects.projects.write", // Fase 5 fundación: crear el record "projects" del handoff
  "crm.schemas.projects.read",
  // ── Settings / Users ────────────────────────────────────────
  "settings.users.read",
].join(" ");

// Scopes OPCIONALES (optional_scope): se piden pero NO rompen el OAuth si el
// portal no los concede. Todos tienen que estar marcados como "Opcional" en la
// config de la app pública: HubSpot rechaza la instalación si la URL manda un scope
// que no está declarado con ese tipo.
//
// · `social` es un scope DEPRECADO de HubSpot (API legacy de broadcast, para dejar
//   posts sociales como borrador) — va acá a propósito para que, si HubSpot lo
//   elimina algún día, no tumbe la conexión entera (CRM/tickets/proyectos).
// · `crm.objects.partner-clients.read` (objeto 0-145, CS360) SOLO lo puede conceder
//   el portal de Smarteam, que es Solutions Partner. Esta MISMA lista se usa para
//   conectar los portales de los CLIENTES, así que como obligatorio rompería su
//   instalación. Lectura nada más: el sync hace GET properties + POST search +
//   associations batch/read, nunca escribe. Sin él, `partner-clients.ts` degrada
//   con `supported:false` y el panel de CS muestra el aviso de "sin permiso".
// · `files` lo pide el módulo SICOP: el cartel de una licitación llega como un PDF
//   colgado de una nota del ticket —medido el 2026-08-23, 33 de las 58 notas del
//   pipeline «Gobiernos» llevan archivo y 30 no tienen una sola letra de texto— y sin
//   este scope `/files/v3/*` devuelve 403 MISSING_SCOPES. Va como OPCIONAL por el
//   MISMO motivo que partner-clients: esta lista arma también la instalación de los
//   portales de los CLIENTES, y como obligatorio se la rompería a todos por algo que
//   solo usa el portal de Smarteam. Sin él, `lib/ventas/sicop-archivos.ts` deja los
//   archivos en SIN_PERMISO y la pantalla explica qué falta en vez de fingir que no
//   hay nada. ⚠ Pedirlo acá NO alcanza: hay que declararlo "Opcional" en la config de
//   la app pública y volver a autorizar la conexión del sistema.
const HUBSPOT_OPTIONAL_SCOPES = ["social", "crm.objects.partner-clients.read", "files"].join(" ");

/**
 * GET /api/auth/hubspot — arranca el OAuth con HubSpot.
 *
 * ⛔ YA NO ES PÚBLICA. Era un prefijo abierto en el middleware y el `state` iba sin firma: cualquiera
 * podía arrancar el flujo con su portal y el callback lo tomaba por bueno. Ahora:
 *   1. exige usuario interno, y por variante el permiso que corresponde —`system=1` la misma celda
 *      que gobierna la pantalla de Integraciones (`configuracion.manage`), `clientId` el acceso a
 *      ESE cliente, `newClient` la capacidad de crear clientes—;
 *   2. firma el `state` con `HUBSPOT_CLIENT_SECRET` y lo ata a un nonce que viaja en una cookie
 *      httpOnly acotada al callback. Ver `lib/hubspot/oauth-state.ts`.
 */
export async function GET(request: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  const newClient = searchParams.get("newClient") === "1";
  const isSystem = searchParams.get("system") === "1";

  /* El permiso se decide por lo que se va a HACER, no por quién pregunta. La misma regla se
     vuelve a aplicar en el callback: el state firmado dice qué se pidió, no quién puede. */
  if (isSystem) {
    const g = await guardPermission("configuracion", "manage");
    if (g instanceof NextResponse) return g;
  } else if (clientId) {
    const g = await guardAccessToClient(clientId);
    if (g instanceof NextResponse) return g;
  } else if (newClient) {
    const g = await guardCapability("seeAllClients");
    if (g instanceof NextResponse) return g;
  }

  const secreto = process.env.HUBSPOT_CLIENT_SECRET;
  if (!secreto) {
    return NextResponse.redirect(`${process.env.APP_URL}/integrations?error=oauth_config`);
  }

  const payload: PayloadDeState = isSystem
    ? { system: true }
    : clientId
      ? { clientId }
      : newClient
        ? { newClient: true }
        : {};

  const nonce = nuevoNonce();
  const state = firmarState(payload, nonce, secreto);

  const params = new URLSearchParams({
    client_id: process.env.HUBSPOT_CLIENT_ID!,
    redirect_uri: process.env.HUBSPOT_REDIRECT_URI!,
    scope: HUBSPOT_SCOPES,
    optional_scope: HUBSPOT_OPTIONAL_SCOPES,
    response_type: "code",
    state,
  });

  const res = NextResponse.redirect(`https://app.hubspot.com/oauth/authorize?${params}`);
  /* El nonce vive SOLO en el navegador que arrancó el flujo, y solo se manda al callback. */
  res.cookies.set(COOKIE_NONCE_OAUTH, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: PATH_COOKIE_NONCE_OAUTH,
    maxAge: VIDA_DEL_NONCE_SEG,
  });
  return res;
}
