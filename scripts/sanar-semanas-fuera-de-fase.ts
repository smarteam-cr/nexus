/**
 * scripts/sanar-semanas-fuera-de-fase.ts — las tareas que viven en una semana que su fase no tiene.
 *
 * ── QUÉ PASÓ ─────────────────────────────────────────────────────────────────────────────────
 * `tasks` es opcional en el PUT del cronograma («undefined = no tocar») y el validador solo mira
 * las tareas que vienen EN el payload. Así que un cuerpo que solo acorta `durationWeeks` pasaba
 * limpio y dejaba las tareas existentes en semanas que ya no existen — sin error y sin aviso.
 *
 * Medido el 2026-08-20: **34 tareas en 7 fases de 5 proyectos**. Multiquimica tiene 10 tareas en
 * una fase de UNA semana.
 *
 * ── POR QUÉ IMPORTA, Y NO ES COSMÉTICO ───────────────────────────────────────────────────────
 * El modificador de IA devuelve el cronograma COMPLETO, así que copia fielmente esas semanas
 * inválidas y `validateTimelinePayload` rechaza su propuesta ENTERA. O sea que esos proyectos
 * **no podían usar «Pedir cambio con IA» en absoluto**: 231 segundos y $0,29 de modelo quemados
 * por intento, con un mensaje que el CSE no puede accionar. Un apagón total de la funcionalidad
 * sobre el 10 % de la cartera, y nadie lo sabía.
 *
 * El PUT ya no las genera (`timeline/route.ts`, el bloque de reubicación) e INV22 vigila que no
 * vuelvan. Esto limpia las que quedaron.
 *
 * ── QUÉ HACE, Y QUÉ NO ───────────────────────────────────────────────────────────────────────
 * Mueve cada tarea desbordada a la ÚLTIMA semana que su fase tiene. Es el mismo criterio de
 * `repararPropuesta` y de `rescate-progreso`: conservador, no mueve la fecha de cierre del
 * proyecto, y coincide con lo que la pantalla ya muestra.
 *
 * ⛔ NO alarga las fases, aunque a veces sea lo correcto. Alargar corre el cierre del proyecto
 * —que el cliente puede estar mirando— y eso es una decisión de negocio, no un saneamiento.
 * El informe dice cuántas semanas haría falta agregar, para que se decida caso por caso.
 *
 * Correr:
 *   npx tsx --env-file=.env scripts/sanar-semanas-fuera-de-fase.ts
 *   $env:ALLOW_PROD_WRITE='1'; npx tsx --env-file=.env scripts/sanar-semanas-fuera-de-fase.ts --apply
 */
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { resolverApply } from "./lib/guard";

async function main() {
  const apply = resolverApply();

  const fases = await prisma.timelinePhase.findMany({
    select: {
      id: true,
      name: true,
      durationWeeks: true,
      timeline: { select: { project: { select: { name: true } } } },
      tasks: {
        orderBy: [{ weekIndex: "asc" }],
        select: { id: true, title: true, weekIndex: true, status: true, source: true },
      },
    },
  });

  let tareasTotal = 0;
  let fasesTotal = 0;
  let conTrabajoEncima = 0;

  console.log(`\n=== TAREAS FUERA DEL RANGO DE SU FASE ${apply ? "(APLICANDO)" : "(dry-run)"} ===\n`);

  for (const f of fases) {
    const ultima = f.durationWeeks - 1;
    const malas = f.tasks.filter((t) => t.weekIndex > ultima || t.weekIndex < 0);
    if (malas.length === 0) continue;
    fasesTotal++;
    tareasTotal += malas.length;

    /* Cuánto habría que alargar la fase para que TODAS entraran donde están hoy. Es el dato que
       convierte «se acomodó» en una decisión: si hacen falta 3 semanas más, capaz el problema es
       que la fase quedó corta, no que las tareas están mal puestas. */
    const maxSemana = Math.max(...malas.map((t) => t.weekIndex));
    const semanasQueFaltan = maxSemana + 1 - f.durationWeeks;

    console.log(
      `${f.timeline.project.name} · «${f.name}» — ${f.durationWeeks} sem ` +
        `(válidas 0..${ultima}) · ${malas.length} tarea(s) fuera` +
        `\n  → para que entraran donde están, la fase necesitaría ${semanasQueFaltan} semana(s) más`,
    );
    for (const t of malas) {
      const pesa = t.status !== "PENDING" || t.source === "HUMAN";
      if (pesa) conTrabajoEncima++;
      console.log(
        `    ${pesa ? "⚠" : " "} semana ${t.weekIndex} → ${ultima} · ${t.status.padEnd(11)} · ${t.title.slice(0, 60)}`,
      );
    }
    console.log("");

    if (apply) {
      const r = await prisma.timelineTask.updateMany({
        where: { id: { in: malas.map((t) => t.id) } },
        data: { weekIndex: ultima },
      });
      console.log(`    ✅ ${r.count} tarea(s) movidas a la semana ${ultima}.\n`);
    }
  }

  console.log("─".repeat(70));
  console.log(`${tareasTotal} tarea(s) en ${fasesTotal} fase(s).`);
  if (conTrabajoEncima > 0) {
    console.log(
      `⚠ ${conTrabajoEncima} tienen trabajo humano encima (no PENDING o source HUMAN): ` +
        `moverlas les cambia la fecha planificada. Vale leerlas antes de aplicar.`,
    );
  }
  if (!apply && tareasTotal > 0) {
    console.log("\n(dry-run — nada se escribió. Correr con --apply para acomodarlas.)");
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
