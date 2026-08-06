/**
 * scripts/sellar-pipeline-del-alta.ts — DESTRABAR UN ALTA QUE NO PUEDE TERMINAR NUNCA.
 *
 * ── QUÉ ARREGLA ─────────────────────────────────────────────────────────────
 * El motor del alta, antes de dar un proyecto por bueno, confirma que el tipo que volvió de
 * HubSpot es el que se eligió:
 *
 *     if (post.hubspotPipelineId !== p.altaPipelineElegido) → el alta espera
 *
 * El camino «Traer de HubSpot» nacía SIN escribir `altaPipelineElegido`, así que la comparación
 * era `"826270797" !== null` — verdadera siempre, para siempre. El proyecto quedaba en
 * cuarentena permanente: no cobra, no suma a la cartera, no le nace el handoff, no se le publica
 * nada al cliente, y el botón «Reintentar» no podía ganar aunque se apretara mil veces.
 *
 * El código ya no produce filas así (el endpoint sella el pipeline al crear). Este script es
 * para las que quedaron: escribirles el pipeline que HubSpot YA dijo, y correr el motor.
 *
 * ── POR QUÉ SE ESCRIBE `hubspotPipelineId` Y NO OTRA COSA ───────────────────
 * `hubspotPipelineId` es lo que el ESPEJO materializó: es la verdad de HubSpot, ya traída y ya
 * guardada por el único escritor autorizado. Sellarlo como «el elegido» no inventa un dato ni
 * relaja la confirmación — deja constancia de que, en este camino, lo elegido ES lo que dijo
 * HubSpot, que es la regla del repo cuando el record ya existía allá.
 *
 * ⚠ Por eso NO toca filas sin `hubspotPipelineId`: ahí el espejo no llegó a escribir, y sellar
 * un null haría que la comparación pase por coincidencia (`null === null`) sobre un proyecto que
 * HubSpot nunca confirmó. Eso terminaría el alta con el pipeline vacío = fila por defecto = COBRA.
 * Esas filas tienen otro problema y se miran a mano.
 *
 * Uso:
 *   npx tsx scripts/sellar-pipeline-del-alta.ts                    # dry-run, lista qué haría
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/sellar-pipeline-del-alta.ts --apply
 *   …--apply --project <id>                                        # una sola fila
 */
import "dotenv/config";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { resolvePipeline } from "@/lib/projects/kind";
import { avanzarAlta } from "@/lib/projects/alta-runner";

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}
const APPLY = resolverApply();
const SOLO = argValue("--project");

async function main() {
  const filas = await prisma.project.findMany({
    where: {
      altaEstado: { not: null },
      altaPipelineElegido: null,
      hubspotPipelineId: { not: null },
      ...(SOLO ? { id: SOLO } : {}),
    },
    select: {
      id: true,
      name: true,
      altaEstado: true,
      altaError: true,
      altaIntentos: true,
      hubspotPipelineId: true,
      hubspotServiceId: true,
      client: { select: { name: true } },
    },
    orderBy: { altaIniciadaAt: "asc" },
  });

  // Las que el espejo no llegó a materializar: se REPORTAN y no se tocan. Ver la cabecera.
  const sinEspejo = await prisma.project.count({
    where: { altaEstado: { not: null }, altaPipelineElegido: null, hubspotPipelineId: null },
  });

  if (filas.length === 0) {
    console.log("✓ No hay altas trabadas por falta de pipeline sellado.");
  }

  for (const f of filas) {
    const def = resolvePipeline(f.hubspotPipelineId);
    console.log(`\n· ${f.client.name} / ${f.name}`);
    console.log(`  ${f.altaEstado} · ${f.altaIntentos} intento(s) · hs=${f.hubspotServiceId}`);
    console.log(`  HubSpot dice: ${f.hubspotPipelineId} (${def?.label ?? "⚠ pipeline NO declarado"})`);
    console.log(`  motivo: ${f.altaError ?? "-"}`);

    /* Un pipeline que Nexus no declara no se sella: el alta tiene que seguir esperando. Darlo
       por bueno lo mandaría a la fila por defecto, que factura. */
    if (!def) {
      console.log("  ⛔ se saltea: primero hay que declarar ese pipeline o moverlo en HubSpot.");
      continue;
    }
    if (!APPLY) {
      console.log(`  → sellaría altaPipelineElegido=${f.hubspotPipelineId} y correría el motor`);
      continue;
    }
    await prisma.project.update({
      where: { id: f.id },
      // El motor toma el reclamo de la fila mirando `altaError`; se limpia para que el
      // `avanzarAlta` de acá abajo no choque con su propio guardia de concurrencia.
      data: { altaPipelineElegido: f.hubspotPipelineId, altaError: null },
    });
    const r = await avanzarAlta(f.id);
    console.log(`  ✓ ${r.termino ? "ALTA TERMINADA" : `sigue en ${r.estado}: ${r.error ?? "sin motivo"}`}`);
  }

  if (sinEspejo > 0) {
    console.log(
      `\n⚠ ${sinEspejo} alta(s) sin pipeline elegido Y sin pipeline espejado. No se tocan: ` +
        `HubSpot nunca confirmó nada de esas filas (¿proyecto cerrado, borrado o suprimido?). ` +
        `Revisalas a mano.`,
    );
  }
  if (!APPLY && filas.length > 0) {
    console.log("\nDry-run. Para aplicar: ALLOW_PROD_WRITE=1 npx tsx scripts/sellar-pipeline-del-alta.ts --apply");
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
