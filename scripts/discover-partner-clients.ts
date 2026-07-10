/**
 * scripts/discover-partner-clients.ts  (READ-ONLY — CS360 Fase 0)
 *
 * Descubre TODO lo necesario para integrar el objeto Partner Clients de HubSpot
 * y las propiedades nuevas del objeto Proyectos 0-970, SIN adivinar:
 *   1. token-info: ¿la cuenta sistema tiene scope para partner clients?
 *   2. /crm/v3/schemas: fqn real del objeto partner (no asumir "partner_clients")
 *   3. /crm/v3/properties/{fqn}: internal names cruzados contra los labels del
 *      export CSV (UUS, scores por hub, licencias, MRR, renovación, señales…)
 *   4. GET list de prueba (limit 5) — un 403 acá define la degradación
 *   5. /crm/v3/properties/0-970: Prioridad / atrasado / bloqueado / Razón de
 *      bloqueo / Detalle del motivo — internal names + options + fieldType
 *
 * ORDEN ESTRICTO: token-info PRIMERO. No escribe nada (solo lectura).
 * Uso: npx tsx scripts/discover-partner-clients.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function systemToken(): Promise<string> {
  const acc = await prisma.hubspotAccount.findFirst({ where: { isSystem: true } });
  if (!acc) throw new Error("No hay cuenta HubSpot del sistema");
  if (new Date(acc.expiresAt) > new Date(Date.now() + 5 * 60 * 1000)) return acc.accessToken;
  const res = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.HUBSPOT_CLIENT_ID!,
      client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
      refresh_token: acc.refreshToken,
    }),
  });
  if (!res.ok) throw new Error("refresh falló: " + (await res.text()));
  const j = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  await prisma.hubspotAccount.update({
    where: { id: acc.id },
    data: { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: new Date(Date.now() + j.expires_in * 1000) },
  });
  return j.access_token;
}

async function getJson(token: string, path: string): Promise<{ status: number; body: any }> {
  const r = await fetch("https://api.hubapi.com" + path, { headers: { Authorization: `Bearer ${token}` } });
  return { status: r.status, body: await r.json().catch(() => null) };
}

interface HsProp {
  name: string;
  label: string;
  type: string;
  fieldType: string;
  options?: Array<{ label: string; value: string }>;
}

// Labels del export CSV → qué buscamos en las properties del objeto partner.
// (regex flexible: el label de la API puede venir en EN o ES)
const PARTNER_WANTED: Array<{ key: string; re: RegExp }> = [
  { key: "uusScore", re: /calificaci.n de uso unificada|unified usage/i },
  { key: "uusTrend", re: /tendencia de la calificaci.n|usage rating trend/i },
  { key: "activationScore", re: /activaci.n|activation/i },
  { key: "toolUsageScore", re: /uso de (las )?herramientas|tool usage/i },
  { key: "valueMetricsScore", re: /m.tricas de valor|value metrics/i },
  { key: "consumptionScore", re: /^consumo|consumption/i },
  { key: "marketingScore", re: /puntuaci.n del uso de marketing|marketing hub usage score/i },
  { key: "salesScore", re: /puntuaci.n del uso de sales|sales hub usage score/i },
  { key: "serviceScore", re: /puntuaci.n del uso de service|service hub usage score/i },
  { key: "commerceScore", re: /puntuaci.n de uso de commerce|commerce hub usage score/i },
  { key: "seatsSalesAssigned", re: /licencias de sales hub asignadas|sales hub seats assigned/i },
  { key: "seatsSalesAvailable", re: /licencias de sales hub disponibles|sales hub seats available/i },
  { key: "seatsSalesLimit", re: /l.mite de licencias de sales|sales hub seat limit/i },
  { key: "seatsServiceAssigned", re: /licencias de service hub asignadas|service hub seats assigned/i },
  { key: "seatsServiceAvailable", re: /licencias de service hub disponibles|service hub seats available/i },
  { key: "seatsServiceLimit", re: /l.mite de licencias de service|service hub seat limit/i },
  { key: "seatsCoreAssigned", re: /licencias principales asignadas|core seats assigned/i },
  { key: "seatsCoreAvailable", re: /licencias principales disponibles|core seats available/i },
  { key: "seatsCoreLimit", re: /l.mite de licencias principales|core seat limit/i },
  { key: "mktContactsLimit", re: /l.mite de contactos de marketing|marketing contact.? (tier|limit)/i },
  { key: "mktContactsUsed", re: /uso de los contactos de marketing|marketing contacts? usage/i },
  { key: "mrrTotal", re: /mrr totales|total mrr/i },
  { key: "mrrManaged", re: /mrr gestionado dividido|split managed mrr/i },
  { key: "mrrRenewal", re: /mrr por renovaci.n|mrr up for renewal/i },
  { key: "mrrSold", re: /mrr de venta|sold mrr/i },
  { key: "nextRenewalAt", re: /pr.xima fecha de renovaci.n|next renewal date/i },
  { key: "renewalMarketing", re: /renovaci.n de marketing hub|marketing hub renewal/i },
  { key: "renewalSales", re: /renovaci.n de sales hub|sales hub renewal/i },
  { key: "renewalService", re: /renovaci.n de service hub|service hub renewal/i },
  { key: "managedExpiryAt", re: /caducidad estimada de la relaci.n gestionada|managed relationship estimated expiration/i },
  { key: "cancellationAt", re: /fecha de pr.xima cancelaci.n|next cancellation date/i },
  { key: "cancellationHubs", re: /hubs de pr.xima cancelaci.n|hubs (of |up for )?next cancellation/i },
  { key: "revenueSignal", re: /^se.ales de ingresos$|^revenue signals?$/i },
  { key: "revenueSignalDetail", re: /explicaci.n de la se.al de ingresos|revenue signal (explanation|detail)/i },
  { key: "revenueSignalPitch", re: /posicionamiento de la se.al|revenue signal positioning/i },
  { key: "editionMarketing", re: /marketing hub edition/i },
  { key: "editionSales", re: /sales hub edition/i },
  { key: "editionService", re: /service hub edition/i },
  { key: "editionOps", re: /operations hub edition/i },
  { key: "activeProducts", re: /todos los productos activos|all active products/i },
  { key: "productLines", re: /l.neas de producto de venta|sold product lines/i },
  { key: "hsCsmName", re: /nombre del customer success manager|customer success manager name/i },
  { key: "hsCsmEmail", re: /correo electr.nico del customer success manager|customer success manager email/i },
  { key: "hsGrowthName", re: /nombre del especialista en crecimiento|growth specialist name/i },
  { key: "hsGrowthEmail", re: /correo electr.nico del especialista en crecimiento|growth specialist email/i },
  { key: "cslImplementaciones", re: /csl \| implementaciones/i },
  { key: "clientName", re: /^nombre del cliente$|^client name$/i },
  { key: "accountName", re: /nombre de la cuenta del cliente|client account name/i },
  { key: "domain", re: /nombre de dominio de la empresa|company domain name|dominio original comprado|original purchased domain/i },
  { key: "hubId", re: /^id de hub$|^hub id$/i },
  { key: "country", re: /^pa.s$|^country$/i },
  { key: "isManaged", re: /est. gestionado|is managed/i },
  { key: "isSold", re: /se ha vendido|is sold/i },
  { key: "relationType", re: /tipo de relaci.n|relationship type/i },
  { key: "portalLink", re: /enlace de la cuenta del cliente|client account link/i },
];

// Labels de las propiedades nuevas del objeto Proyectos 0-970 (dashboards de la CSL).
const PROJECT_WANTED: Array<{ key: string; re: RegExp }> = [
  { key: "priority", re: /prioridad|priority/i },
  { key: "isOverdue", re: /atrasad|overdue|retrasad/i },
  { key: "isBlocked", re: /bloquead|blocked/i },
  { key: "blockReason", re: /raz.n de(l)? bloqueo|block(ed)? reason|motivo de(l)? bloqueo/i },
  { key: "blockDetail", re: /detalle del motivo|detalle de(l)? bloqueo|block(ed)? detail/i },
];

function printMatches(all: HsProp[], wanted: Array<{ key: string; re: RegExp }>, title: string) {
  console.log(`\n— ${title} —`);
  const usedNames = new Set<string>();
  for (const w of wanted) {
    const hits = all.filter((p) => w.re.test(p.label) || w.re.test(p.name));
    if (hits.length === 0) {
      console.log(`  ${w.key}: ✗ SIN MATCH`);
      continue;
    }
    for (const h of hits.slice(0, 3)) {
      usedNames.add(h.name);
      const opts = h.options && h.options.length > 0 && h.options.length <= 12
        ? ` options=[${h.options.map((o) => `"${o.value}"→"${o.label}"`).join(", ")}]`
        : h.options && h.options.length > 12 ? ` options=${h.options.length}` : "";
      console.log(`  ${w.key}: ${h.name}  ("${h.label}")  [${h.type}/${h.fieldType}]${opts}`);
    }
  }
  console.log(`\n// Constante lista para pegar (${title}):`);
  console.log(JSON.stringify([...usedNames], null, 2));
}

async function main() {
  const token = await systemToken();

  // ── PASO 1: token-info (GATE) ──────────────────────────────────────────────
  const info = (await (await fetch("https://api.hubapi.com/oauth/v1/access-tokens/" + token)).json()) as {
    scopes?: string[]; hub_id?: number; hub_domain?: string;
  };
  const scopes = info.scopes ?? [];
  console.log("=== PASO 1 · token-info ===");
  console.log("hub_id:", info.hub_id, "| hub_domain:", info.hub_domain);
  console.log("scopes con 'partner':", scopes.filter((s) => s.includes("partner")));
  console.log("scopes con 'custom':", scopes.filter((s) => s.includes("custom")));
  console.log(`scopes totales: ${scopes.length}`);

  // ── PASO 2: fqn del objeto partner ─────────────────────────────────────────
  console.log("\n=== PASO 2 · buscar el objeto partner ===");
  const schemas = await getJson(token, "/crm/v3/schemas");
  let partnerFqn: string | null = null;
  if (schemas.status === 200) {
    const list = (schemas.body.results ?? []) as Array<{ objectTypeId: string; fullyQualifiedName: string; name: string; labels?: { singular?: string } }>;
    console.log(`custom objects en el portal: ${list.length}`);
    for (const s of list) {
      const isPartner = /partner|cliente/i.test(s.name) || /partner|cliente/i.test(s.labels?.singular ?? "");
      console.log(`  ${s.objectTypeId}  ${s.fullyQualifiedName}  name="${s.name}"${isPartner ? "  <-- ¿PARTNER?" : ""}`);
      if (isPartner && /partner/i.test(s.name + (s.labels?.singular ?? ""))) partnerFqn = s.fullyQualifiedName;
    }
  } else {
    console.log("/crm/v3/schemas status:", schemas.status);
  }
  // El objeto partner_clients es HubSpot-defined (no aparece en /schemas de custom):
  // probar los slugs documentados directo.
  const candidates = [partnerFqn, "partner_clients", "0-145", "PARTNER_CLIENT"].filter(Boolean) as string[];
  let workingFqn: string | null = null;
  for (const fqn of candidates) {
    const probe = await getJson(token, `/crm/v3/properties/${encodeURIComponent(fqn)}`);
    console.log(`  properties de "${fqn}": status ${probe.status}${probe.status === 200 ? ` (${(probe.body.results ?? []).length} props)` : ""}`);
    if (probe.status === 200) { workingFqn = fqn; break; }
    if (probe.status === 403) console.log("    → 403: el objeto existe pero FALTA SCOPE (anotar para re-autorizar la app)");
  }

  // ── PASO 3: properties del objeto partner ──────────────────────────────────
  if (workingFqn) {
    console.log(`\n=== PASO 3 · properties de ${workingFqn} ===`);
    const props = await getJson(token, `/crm/v3/properties/${encodeURIComponent(workingFqn)}`);
    const all = (props.body.results ?? []) as HsProp[];
    printMatches(all, PARTNER_WANTED, `PARTNER_PROPERTIES (${workingFqn})`);

    // ── PASO 4: read de prueba ───────────────────────────────────────────────
    console.log(`\n=== PASO 4 · GET list de prueba (${workingFqn}) ===`);
    const sample = await getJson(token, `/crm/v3/objects/${encodeURIComponent(workingFqn)}?limit=5`);
    console.log("status:", sample.status, "| total en página:", (sample.body?.results ?? []).length, "| paging:", !!sample.body?.paging);
    if (sample.status === 200 && sample.body.results?.[0]) {
      console.log("primer record (props default):", JSON.stringify(sample.body.results[0].properties, null, 2).slice(0, 800));
      // asociaciones a companies del primer record
      const id = sample.body.results[0].id;
      const assoc = await getJson(token, `/crm/v4/objects/${encodeURIComponent(workingFqn)}/${id}/associations/companies`);
      console.log(`asociaciones a companies del record ${id}: status ${assoc.status}, ${(assoc.body?.results ?? []).length} companies`);
    }
    if (sample.status === 403) console.log("→ 403 en el read: properties visibles pero records NO — scope de objeto faltante.");
  } else {
    console.log("\n⛔ Ningún fqn candidato respondió 200 en properties — anotar el 403/404 y diseñar con degradación.");
  }

  // ── PASO 5: properties nuevas del 0-970 ────────────────────────────────────
  console.log("\n=== PASO 5 · properties del objeto Proyectos (0-970) ===");
  const pprops = await getJson(token, "/crm/v3/properties/0-970");
  if (pprops.status === 200) {
    const all = (pprops.body.results ?? []) as HsProp[];
    console.log(`props totales: ${all.length}`);
    printMatches(all, PROJECT_WANTED, "PROYECTOS 0-970 (nuevas para el dashboard)");
  } else {
    console.log("status:", pprops.status, "→ probar slug 'projects'");
    const alt = await getJson(token, "/crm/v3/properties/projects");
    if (alt.status === 200) {
      printMatches((alt.body.results ?? []) as HsProp[], PROJECT_WANTED, "PROYECTOS (slug projects)");
    } else {
      console.log("projects status:", alt.status);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
