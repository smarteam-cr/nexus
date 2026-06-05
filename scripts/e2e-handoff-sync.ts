/**
 * scripts/e2e-handoff-sync.ts  (Fase 5 paso 4+5 — E2E + idempotencia)
 *
 * Prueba el código REAL (lib/hubspot/handoff-sync.ts) contra el CRM de Smarteam:
 *   RUN 1  → crea el record "projects" + asocia company/deal + marca flag nexus.
 *   RUN 2,3 (retry) → NO deben recrear el project (created=false, mismo id).
 * Verifica: pipeline/stage/nombre del project, flag nexus de la company, y que el
 * set de projects asociados a la company crece en EXACTAMENTE 1 (sin duplicar).
 *
 * Uso: npx tsx scripts/e2e-handoff-sync.ts [términoCliente]   (default: almotec)
 */
import "dotenv/config"; // DEBE ir primero: el módulo @/lib/db/prisma lee DATABASE_URL al cargar.
import { prisma } from "@/lib/db/prisma";
import { syncHandoffToHubspot } from "@/lib/hubspot/handoff-sync";
import { getSystemHubspotClient } from "@/lib/hubspot/client";

const OT = "0-970";

async function getJson(hs: Awaited<ReturnType<typeof getSystemHubspotClient>>, path: string) {
  const r = await hs.apiRequest({ method: "GET", path });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
}
async function assocProjectIds(hs: Awaited<ReturnType<typeof getSystemHubspotClient>>, companyId: string): Promise<string[]> {
  const { body } = await getJson(hs, `/crm/v4/objects/companies/${companyId}/associations/${OT}?limit=200`);
  return ((body?.results ?? []) as Array<{ toObjectId: string }>).map((x) => String(x.toObjectId)).sort();
}

async function main() {
  const term = process.argv[2] ?? "almotec";
  const handoff = await prisma.handoff.findFirst({
    where: { client: { name: { contains: term, mode: "insensitive" } } },
    include: { client: { select: { name: true, hubspotCompanyId: true } }, project: { select: { name: true } } },
  });
  if (!handoff) throw new Error("no hay Handoff para: " + term);
  const companyId = handoff.client.hubspotCompanyId;
  console.log(
    `Handoff ${handoff.id} · ${handoff.client.name} · company=${companyId} · deal=${handoff.hubspotDealId ?? "-"}`,
  );
  console.log(`ANTES: hubspotProjectId=${handoff.hubspotProjectId} status=${handoff.hubspotSyncStatus}`);

  const hs = await getSystemHubspotClient();
  const before = companyId ? await assocProjectIds(hs, companyId) : [];
  console.log(`projects asociados a la company ANTES: ${before.length}`);

  // RUN 1 — debe crear
  const r1 = await syncHandoffToHubspot(handoff.id);
  console.log("\nRUN 1:", JSON.stringify(r1));
  if (r1.hubspotProjectId) {
    const p = await getJson(hs, `/crm/v3/objects/${OT}/${r1.hubspotProjectId}?properties=hs_name,hs_pipeline,hs_pipeline_stage`);
    console.log("  project props:", JSON.stringify(p.body?.properties));
  }
  if (companyId) {
    const c = await getJson(hs, `/crm/v3/objects/companies/${companyId}?properties=name,nexus`);
    console.log("  company nexus flag:", c.body?.properties?.nexus);
  }

  // RUN 2 y RUN 3 — retry, NO deben recrear
  const r2 = await syncHandoffToHubspot(handoff.id);
  console.log("RUN 2 (retry):", JSON.stringify(r2));
  const r3 = await syncHandoffToHubspot(handoff.id);
  console.log("RUN 3 (retry):", JSON.stringify(r3));

  const after = companyId ? await assocProjectIds(hs, companyId) : [];
  const nuevos = after.filter((id) => !before.includes(id));
  console.log(`\nprojects asociados DESPUÉS: ${after.length} (nuevos: ${nuevos.length} → ${nuevos.join(",")})`);

  const sameId = r1.hubspotProjectId && r1.hubspotProjectId === r2.hubspotProjectId && r2.hubspotProjectId === r3.hubspotProjectId;
  console.log("\n=== VEREDICTO IDEMPOTENCIA ===");
  console.log(`r1.created=${r1.created} (esperado true) · r2.created=${r2.created} (esperado false) · r3.created=${r3.created} (esperado false)`);
  console.log(`mismo hubspotProjectId en las 3 corridas: ${sameId}`);
  console.log(`projects nuevos en la company: ${nuevos.length} (esperado 1 → sin duplicado)`);
  const ok = r1.created === true && r2.created === false && r3.created === false && sameId && nuevos.length === 1;
  console.log(ok ? "✅ IDEMPOTENCIA OK" : "❌ REVISAR");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
