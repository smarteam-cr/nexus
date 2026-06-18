/**
 * scripts/inspect-hubspot-client-assoc.ts  (READ-ONLY)
 *
 * Diagnostica por qué el sync de proyectos de un cliente no trae un proyecto que
 * SÍ existe en HubSpot. Para el cliente <term>:
 *   1. Resuelve su hubspotCompanyId (de la DB de Nexus).
 *   2. Lista los proyectos asociados a la Company por cada slug (projects/PROJECT/
 *      0-18/0-49) + por el objectTypeId del schema "projects" → con sus nombres.
 *   3. Busca en el objeto "projects" de HubSpot los que matchean <term> y reporta
 *      a qué Company(s) están asociados → revela si el proyecto está o no asociado
 *      a la Company del cliente.
 *
 * No escribe nada. Uso: npx tsx scripts/inspect-hubspot-client-assoc.ts multiquimica
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const SLUGS = ["projects", "PROJECT", "0-18", "0-49"];
const PROPS = "hs_name,nombre_del_proyecto,hs_status,estatus_del_proyecto,hs_pipeline,hs_pipeline_stage";

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

async function api(token: string, path: string, init?: RequestInit) {
  const r = await fetch("https://api.hubapi.com" + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  return { status: r.status, ok: r.ok, body: await r.json().catch(() => null) as any };
}

async function objName(token: string, ot: string, id: string): Promise<string> {
  const r = await api(token, `/crm/v3/objects/${ot}/${id}?properties=${PROPS}`);
  if (!r.ok) return `(no leído, status ${r.status})`;
  const p = r.body?.properties ?? {};
  const name = p.nombre_del_proyecto || p.hs_name || "(sin nombre)";
  const status = (p.hs_status || p.estatus_del_proyecto || "—");
  return `${name}  [status=${status} stage=${p.hs_pipeline_stage ?? "—"}]`;
}

async function main() {
  const term = process.argv[2] ?? "multiquimica";
  const client = await prisma.client.findFirst({
    where: { name: { contains: term, mode: "insensitive" } },
    select: { id: true, name: true, company: true, hubspotCompanyId: true },
  });
  if (!client) { console.log(`No hay cliente que matchee "${term}".`); return; }
  console.log(`Cliente: ${client.name}  company=${client.company ?? "—"}  hubspotCompanyId=${client.hubspotCompanyId ?? "—"}\n`);
  if (!client.hubspotCompanyId) { console.log("⚠ Sin hubspotCompanyId → el sync no puede consultar asociaciones."); return; }

  const token = await systemToken();
  const companyId = client.hubspotCompanyId;

  console.log("=== Proyectos asociados a la Company (lo que ve el sync), por slug ===");
  for (const slug of SLUGS) {
    const r = await api(token, `/crm/v4/objects/companies/${companyId}/associations/${slug}`);
    if (!r.ok) { console.log(`  slug "${slug}": HTTP ${r.status}`); continue; }
    const ids = (r.body?.results ?? []).map((x: any) => String(x.toObjectId));
    console.log(`  slug "${slug}": ${ids.length} asociaciones`);
    for (const id of ids.slice(0, 20)) console.log(`      ${id} → ${await objName(token, slug, id)}`);
  }

  // Schema del objeto Proyectos + asociación por objectTypeId
  console.log("\n=== Objeto Proyectos por schema (objectTypeId) ===");
  const schemas = await api(token, "/crm/v3/schemas");
  const projSchema = (schemas.body?.results ?? []).find((s: any) => {
    const n = (s.name + " " + s.labels?.singular + " " + s.labels?.plural).toLowerCase();
    return n.includes("project") || n.includes("proyecto");
  });
  if (projSchema) {
    console.log(`  schema: ${projSchema.name} (${projSchema.objectTypeId})`);
    const r = await api(token, `/crm/v4/objects/companies/${companyId}/associations/${projSchema.objectTypeId}`);
    if (r.ok) {
      const ids = (r.body?.results ?? []).map((x: any) => String(x.toObjectId));
      console.log(`  company→${projSchema.objectTypeId}: ${ids.length} asociaciones`);
      for (const id of ids.slice(0, 20)) console.log(`      ${id} → ${await objName(token, projSchema.objectTypeId, id)}`);
    } else { console.log(`  company→${projSchema.objectTypeId}: HTTP ${r.status}`); }
  } else {
    console.log(`  schemas: ${(schemas.body?.results ?? []).map((s: any) => s.name).join(", ") || "ninguno"}`);
  }

  // Buscar el proyecto por nombre y ver a qué companies está asociado
  console.log(`\n=== Búsqueda del proyecto por nombre (~ "${term}") y sus companies asociadas ===`);
  for (const ot of ["projects", projSchema?.objectTypeId].filter(Boolean) as string[]) {
    const search = await api(token, `/crm/v3/objects/${ot}/search`, {
      method: "POST",
      body: JSON.stringify({
        query: term,
        properties: ["hs_name", "nombre_del_proyecto", "hs_pipeline_stage", "estatus_del_proyecto"],
        limit: 10,
      }),
    });
    if (!search.ok) { console.log(`  [${ot}] search HTTP ${search.status}`); continue; }
    const results = search.body?.results ?? [];
    console.log(`  [${ot}] ${results.length} resultado(s):`);
    for (const r of results) {
      const p = r.properties ?? {};
      const name = p.nombre_del_proyecto || p.hs_name || "(sin nombre)";
      const assoc = await api(token, `/crm/v4/objects/${ot}/${r.id}/associations/companies`);
      const companyIds = assoc.ok ? (assoc.body?.results ?? []).map((x: any) => String(x.toObjectId)) : [];
      const matchesOurCompany = companyIds.includes(String(companyId)) ? "  ⟵ ASOCIADO A NUESTRA COMPANY" : "  ✗ NO asociado a nuestra company";
      console.log(`      ${r.id} "${name}"  companies=[${companyIds.join(", ")}]${matchesOurCompany}`);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
