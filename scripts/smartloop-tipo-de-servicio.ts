/**
 * scripts/smartloop-tipo-de-servicio.ts — los proyectos de SmartLoop que dicen ser «proyecto_temporal» (M1 etapa 4 del
 * roadmap, 2026-10-25).
 *
 * El espejo de HubSpot deducía `serviceType` del nombre del servicio y lo que no reconocía caía en `proyecto_temporal`:
 * 5 de los 7 proyectos del pipeline SmartLoop quedaron así, y el kickoff de RC Inmobiliaria le decía
 * «proyecto temporal» a un SmartLoop. Desde este deploy el espejo ya no lo escribe (lib/servicios/tipo-de-servicio.ts) y
 * el kickoff lee el servicio; este script limpia lo que quedó guardado.
 *
 * Qué hace: lista los proyectos de un pipeline de servicio recurrente con su `serviceType` y su `servicioRecurrente`. Con
 * `--apply` (detrás del guard) deja vacío (null) el `serviceType` de los que dicen `proyecto_temporal`. Correrlo dos veces
 * no hace nada la segunda.
 *
 * Qué NO hace: no escribe `servicioRecurrente` (lo escriben solo lib/servicios/servicio-server.ts y el alta: en un
 * proyecto del pipeline de SmartLoop el servicio lo da el pipeline, y vacío está bien), ni toca HubSpot, ni los
 * documentos del proyecto.
 *
 * ⚠ ORDEN: DESPUÉS del deploy. Antes, el espejo (cada sincronización de HubSpot) lo vuelve a escribir.
 *
 *   npx tsx scripts/smartloop-tipo-de-servicio.ts                          # simulacro (solo lee)
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/smartloop-tipo-de-servicio.ts --apply
 *
 * Deshacer: el script imprime el id de cada proyecto que cambió; `UPDATE "Project" SET "serviceType" = 'proyecto_temporal'
 * WHERE id IN (...)`. Con `--apply` además se respalda `Project` (pg_dump; `SIN_RESPALDO=1` lo salta a sabiendas).
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { imprimirDestino, resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { PROJECT_PIPELINES } from "@/lib/projects/kind";
import { tipoQueContradiceAlPipeline } from "@/lib/servicios/tipo-de-servicio";

const APPLY = resolverApply({ tablas: ["Project"] });

async function main() {
  imprimirDestino();
  const pipelines = PROJECT_PIPELINES.filter((p) => p.servicioRecurrente);
  const proyectos = await prisma.project.findMany({
    where: { hubspotPipelineId: { in: pipelines.map((p) => p.hubspotPipelineId) } },
    select: {
      id: true,
      name: true,
      status: true,
      serviceType: true,
      servicioRecurrente: true,
      hubspotPipelineId: true,
      client: { select: { name: true } },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  console.log(`\nProyectos de ${pipelines.map((p) => p.label).join(", ")}: ${proyectos.length}\n`);
  const aCorregir = proyectos.filter((p) => tipoQueContradiceAlPipeline(p));
  for (const p of proyectos) {
    const marca = aCorregir.includes(p) ? "✗" : "✓";
    console.log(
      `${marca} ${p.client?.name ?? "?"} › ${p.name}  [${p.status}]  serviceType=${p.serviceType ?? "(vacío)"}  servicioRecurrente=${p.servicioRecurrente ?? "(vacío: lo da el pipeline)"}  (${p.id})`,
    );
  }
  console.log(`\n${aCorregir.length} ${aCorregir.length === 1 ? "proyecto dice" : "proyectos dicen"} «proyecto_temporal».`);
  if (!aCorregir.length) return;

  if (!APPLY) {
    console.log("Simulacro: no se escribió nada. Con --apply (y ALLOW_PROD_WRITE=1) se deja vacío su serviceType.");
    return;
  }
  const r = await prisma.project.updateMany({
    where: { id: { in: aCorregir.map((p) => p.id) }, serviceType: "proyecto_temporal" },
    data: { serviceType: null },
  });
  console.log(`\nListo: ${r.count} ${r.count === 1 ? "proyecto quedó" : "proyectos quedaron"} sin «proyecto_temporal».`);
  console.log(`Para deshacer: UPDATE "Project" SET "serviceType" = 'proyecto_temporal' WHERE id IN (${aCorregir.map((p) => `'${p.id}'`).join(", ")});`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
