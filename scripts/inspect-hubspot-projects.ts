/**
 * scripts/inspect-hubspot-projects.ts  (READ-ONLY — Fase 5 paso 1+2)
 *
 * Confirma el scope (token-info) y lee del CRM de Smarteam (HubSpot sistema) todo lo
 * necesario para construir F5 SIN adivinar:
 *   - scope crm.objects.projects.read/write
 *   - objeto "projects": objectType + propiedad de nombre (primaryDisplayProperty)
 *   - pipeline 826270797 / etapa "Hand off" 1225193551
 *   - associationTypeId projects->companies
 *   - propiedad de COMPANY con internal name `true` (booleancheckbox) — el flag de Elías
 *
 * ORDEN ESTRICTO: token-info PRIMERO. No escribe nada (solo lectura).
 * Uso: npx tsx scripts/inspect-hubspot-projects.ts
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

const OT = "projects"; // objectType candidato (el diagnóstico previo leyó /crm/v3/properties/projects)

async function main() {
  const token = await systemToken();

  // ── PASO 1: token-info (GATE) ──────────────────────────────────────────────
  const info = (await (await fetch("https://api.hubapi.com/oauth/v1/access-tokens/" + token)).json()) as {
    scopes?: string[];
    hub_id?: number;
    hub_domain?: string;
    app_id?: number;
    user?: string;
    user_id?: number;
    token_type?: string;
  };
  const scopes = info.scopes ?? [];
  const hasWrite = scopes.includes("crm.objects.projects.write");
  const hasRead = scopes.includes("crm.objects.projects.read");
  console.log("=== PASO 1 · token-info (cuenta isSystem de Nexus) ===");
  console.log("hub_id (portal):", info.hub_id, "| hub_domain:", info.hub_domain);
  console.log("app_id:", info.app_id, "| user:", info.user, "| user_id:", info.user_id);
  console.log("crm.objects.projects.read :", hasRead);
  console.log("crm.objects.projects.write:", hasWrite);
  console.log("scopes con 'project':", scopes.filter((s) => s.includes("project")));
  if (!hasRead || !hasWrite) {
    console.log("\n⛔ Falta read y/o write de projects — PARAR. No sigo con la inspección de escritura.");
    return;
  }

  // ── PASO 2a: schema del objeto projects ────────────────────────────────────
  console.log("\n=== PASO 2a · objeto 'projects' ===");
  const schema = await getJson(token, `/crm/v3/schemas/${OT}`);
  if (schema.status === 200) {
    console.log({
      objectTypeId: schema.body.objectTypeId,
      fullyQualifiedName: schema.body.fullyQualifiedName,
      primaryDisplayProperty: schema.body.primaryDisplayProperty,
      requiredProperties: schema.body.requiredProperties,
      name: schema.body.name,
    });
  } else {
    console.log(`/crm/v3/schemas/${OT} status:`, schema.status, "→ pruebo propiedades directo");
  }

  // ── PASO 2b: propiedades de projects (candidatas a 'nombre') ────────────────
  const props = await getJson(token, `/crm/v3/properties/${OT}`);
  if (props.status === 200) {
    const all = (props.body.results ?? []) as Array<{ name: string; label: string; type: string; fieldType: string }>;
    console.log(`\nPropiedades de '${OT}': ${all.length} total. Candidatas a NOMBRE:`);
    all
      .filter((p) => /name|nombre|title|subject/i.test(p.name) || /name|nombre|title|asunto/i.test(p.label))
      .forEach((p) => console.log(`  - ${p.name}  (${p.label})  [${p.type}/${p.fieldType}]`));
    const reads = await getJson(token, `/crm/v3/objects/${OT}?limit=1&properties=hs_pipeline,hs_pipeline_stage`);
    console.log(`  read /crm/v3/objects/${OT} status:`, reads.status);
  } else {
    console.log(`/crm/v3/properties/${OT} status:`, props.status, JSON.stringify(props.body).slice(0, 300));
  }

  // ── PASO 2c: pipelines del objeto projects ─────────────────────────────────
  console.log("\n=== PASO 2c · pipelines ===");
  const pipes = await getJson(token, `/crm/v3/pipelines/${OT}`);
  if (pipes.status === 200) {
    for (const p of (pipes.body.results ?? []) as Array<{ id: string; label: string; stages?: Array<{ id: string; label: string }> }>) {
      console.log(`pipeline ${p.id} "${p.label}"${p.id === "826270797" ? "  <-- CS CRM ✓" : ""}`);
      for (const st of p.stages ?? []) {
        console.log(`  stage ${st.id} "${st.label}"${st.id === "1225193551" ? "  <-- Hand off ✓" : ""}`);
      }
    }
  } else {
    console.log(`/crm/v3/pipelines/${OT} status:`, pipes.status);
  }

  // ── PASO 2d: associationTypeId projects -> companies ───────────────────────
  console.log("\n=== PASO 2d · asociación projects->companies ===");
  const assoc = await getJson(token, `/crm/v4/associations/${OT}/companies/labels`);
  if (assoc.status === 200) {
    for (const a of (assoc.body.results ?? []) as Array<{ typeId: number; label: string | null; category: string }>) {
      console.log(`  typeId ${a.typeId}  label="${a.label ?? "(default)"}"  category=${a.category}`);
    }
  } else {
    console.log(`/crm/v4/associations/${OT}/companies/labels status:`, assoc.status, JSON.stringify(assoc.body).slice(0, 200));
  }

  // ── PASO 2e: propiedad de COMPANY 'true' (flag de Elías) ───────────────────
  console.log("\n=== PASO 2e · propiedad de company 'true' (el flag) ===");
  const flag = await getJson(token, "/crm/v3/properties/companies/true");
  if (flag.status === 200) {
    console.log("✓ EXISTE:", { name: flag.body.name, label: flag.body.label, type: flag.body.type, fieldType: flag.body.fieldType });
    if (flag.body.type === "bool" || flag.body.fieldType === "booleancheckbox") {
      console.log("  → tipo OK (booleancheckbox). Se puede setear { true: true }.");
    } else {
      console.log("  ⚠ el tipo NO es booleancheckbox — confirmar con Elías antes de escribir.");
    }
  } else {
    console.log(`✗ NO existe propiedad company con internal name 'true' (status ${flag.status}).`);
    console.log("  Candidatas booleanas/checkbox de company (para que Elías confirme):");
    const all = await getJson(token, "/crm/v3/properties/companies");
    if (all.status === 200) {
      (all.body.results ?? [])
        .filter((p: { type: string; fieldType: string }) => p.type === "bool" || p.fieldType === "booleancheckbox")
        .forEach((p: { name: string; label: string }) => console.log(`    - ${p.name}  (${p.label})`));
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
