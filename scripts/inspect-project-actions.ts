/**
 * scripts/inspect-project-actions.ts — QUÉ TIENE PENDIENTE CADA PROYECTO. Solo lectura.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * El motor de "Qué hacer acá" vivía adentro del canvas: para saber qué decía de un proyecto
 * había que abrirlo. Al mudarse a un cargador batch (`lib/timeline/project-actions-loader.ts`)
 * se puede leer la cartera entera de una — y hace falta, porque el motor ahora alimenta la
 * bandeja del CSE, donde un error no se ve en un proyecto sino repetido 17 veces.
 *
 * La primera corrida de este script ya pagó su costo: mostró que el cargador emitía
 * "El cronograma no tiene fecha de arranque" para **24 proyectos que no tenían cronograma**.
 * El canvas nunca lo mostró porque solo pinta el panel cuando hay fases; el cargador no tenía
 * esa compuerta. Ningún test unitario lo iba a encontrar: hacía falta la cartera real.
 *
 * Correr esto ANTES de tocar el catálogo de acciones y DESPUÉS, y comparar la tabla de
 * frecuencias. Una clase que salta de 16 a 40 apariciones es una regla mal calibrada, no una
 * cartera que empeoró de golpe.
 *
 *   npx tsx scripts/inspect-project-actions.ts            # top 12 + frecuencias
 *   npx tsx scripts/inspect-project-actions.ts --todos    # todos los proyectos
 *   npx tsx scripts/inspect-project-actions.ts --cse=hgomez@smarteamcr.com
 */
import { loadProjectActions } from "@/lib/timeline/project-actions-loader";

const TODOS = process.argv.includes("--todos");
const CSE = process.argv.find((a) => a.startsWith("--cse="))?.split("=")[1]?.toLowerCase() ?? null;

async function main() {
  const t0 = Date.now();
  const todas = await loadProjectActions(null);
  const ms = Date.now() - t0;

  const rows = CSE ? todas.filter((r) => (r.cseEmail ?? "").toLowerCase() === CSE) : todas;
  console.log(
    `${rows.length} proyecto(s)${CSE ? ` de ${CSE}` : ""} en ${ms} ms` +
      `${CSE ? ` (la carga completa trajo ${todas.length})` : ""}\n`,
  );

  const conPendientes = [...rows]
    .filter((r) => r.actions.length > 0)
    .sort((a, b) => b.actions.length - a.actions.length);
  console.log(`con pendientes: ${conPendientes.length} · al día o sin cronograma: ${rows.length - conPendientes.length}\n`);

  for (const r of TODOS || CSE ? conPendientes : conPendientes.slice(0, 12)) {
    const enlace = r.timelineCanvasId ? "" : "  ⚠ SIN CANVAS (no enlazable)";
    console.log(`── ${r.clientName} / ${r.projectName}  (${r.actions.length})  ${r.cseEmail ?? "SIN ENCARGADO"}${enlace}`);
    for (const a of r.actions) {
      console.log(`     [${a.group}${a.blocking ? "/BLOQUEA" : ""}] ${a.title}`);
    }
  }

  const porClase = new Map<string, number>();
  for (const r of rows) for (const a of r.actions) porClase.set(a.id, (porClase.get(a.id) ?? 0) + 1);
  console.log(`\n── frecuencia por CLASE de acción (el panel crece con las clases, no con los datos):`);
  for (const [id, n] of [...porClase].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(4)}  ${id}`);
  }

  const sinEnlace = rows.filter((r) => !r.timelineCanvasId && r.actions.length > 0).length;
  const sinEncargado = rows.filter((r) => !r.cseEmail).length;
  console.log(`\ncon pendientes pero sin canvas de cronograma: ${sinEnlace}`);
  console.log(`sin encargado en HubSpot: ${sinEncargado}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
