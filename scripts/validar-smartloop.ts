/**
 * scripts/validar-smartloop.ts — SOLO LECTURA. ¿Cómo se ve SmartLoop y el servicio recurrente? (pasada de validación del
 * 2026-10-19, docs/validacion-2026-10-19.md › área 5).
 *
 * Con las MISMAS funciones de la ficha (`estadoDelCicloParaElRiel`) dice, de cada proyecto recurrente (pipeline de
 * SmartLoop, servicio elegido en Nexus o proyecto de prueba): el servicio, la etapa de HubSpot y la que muestra. Y de la recomendación
 * de pasar a SmartLoop: qué proyectos de Customer Success están en «Entrega» o recién «Finalizado», cuáles califican, a
 * quién le llega y cuáles ya se decidieron.
 *
 *   npx tsx scripts/validar-smartloop.ts
 */
import "dotenv/config";
import "./lib/permitir-server-only";

process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");
process.env.DB_POOL_MAX ??= "2";

async function main() {
  const { prisma } = await import("@/lib/db/prisma");
  const { estadoDelCicloParaElRiel } = await import("@/lib/servicios/ciclos-server");
  const { recomendacionesPendientesPara, recomendacionDelProyecto } = await import("@/lib/servicios/recurrencia-server");
  const { ETAPA_DE_ENTREGA, ETAPA_FINALIZADO } = await import("@/lib/servicios/recurrencia");
  const { pipelineByKey } = await import("@/lib/projects/kind");

  const smartloop = pipelineByKey("smartloop").hubspotPipelineId;
  const proyectos = await prisma.project.findMany({
    where: { OR: [{ hubspotPipelineId: smartloop }, { servicioRecurrente: { not: null } }, { esPrueba: true }] },
    select: { id: true, name: true, status: true, esPrueba: true, servicioRecurrente: true, servicioDesde: true, hubspotPipelineStageLabel: true, hubspotServiceId: true, client: { select: { name: true } } },
  });
  console.log(`══ Proyectos recurrentes o de prueba: ${proyectos.length}`);
  for (const p of proyectos) {
    const riel = await estadoDelCicloParaElRiel(p.id).catch(() => null);
    console.log(`\n── ${p.client.name} · «${p.name}» (${p.status}${p.esPrueba ? ", prueba" : ""}) · servicio ${p.servicioRecurrente ?? "(del pipeline)"} · HubSpot: ${p.hubspotServiceId ? (p.hubspotPipelineStageLabel ?? "sin etapa") : "no existe"}`);
    console.log(riel ? `   etapa que muestra: «${riel.corto}» · exploración: ${riel.arranque?.lecturasDeExploracion ?? 0} lecturas · kickoff anterior al servicio: ${riel.arranque?.kickoffAnteriorAlServicio ? "sí" : "no"}` : "   no es un servicio con ciclo");
  }

  console.log("\n══ La recomendación de pasar a SmartLoop");
  const etapas = [ETAPA_DE_ENTREGA, ETAPA_FINALIZADO].filter((x): x is string => !!x);
  const enEntrega = await prisma.project.findMany({
    where: { hubspotPipelineStageId: { in: etapas }, esPrueba: false },
    select: { id: true, name: true, hubspotPipelineStageLabel: true, hubspotOwnerEmail: true, client: { select: { name: true, kind: true } } },
  });
  console.log(`   ${enEntrega.length} proyectos en Entrega o Finalizado`);
  const alex = await prisma.teamMember.findFirst({ where: { roleEnum: "CSL", deactivatedAt: null } });
  for (const p of enEntrega) {
    const r = await recomendacionDelProyecto(p.id, { email: alex?.email ?? "", rol: "CSL" }).catch(() => null);
    console.log(`   · ${p.client.name} · «${p.name}» · ${p.hubspotPipelineStageLabel} · ${p.client.kind} · encargado ${p.hubspotOwnerEmail ?? "—"} → ${r ? `recomienda (${r.motivo}, ${r.estado.estado}${r.decision ? `, ${r.decision.estado}` : ""}) · ${r.lineas.length} líneas de porqué` : "no califica"}`);
  }
  const csl = alex ? await recomendacionesPendientesPara(alex.email, new Date(), { lideraCs: true }) : [];
  console.log(`   Pendientes que ve la CSL: ${csl.length}`);
  for (const r of csl) console.log(`     · ${r.empresa} · ${r.proyecto} (${r.motivo}${r.sinEncargado !== null ? `, sin encargado vigente: ${r.sinEncargado || "nadie"}` : ""})`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
