/**
 * scripts/fusionar-fases-cronograma.ts
 *
 * FUSIONA dos fases de un cronograma en una sola. Dry-run por default: NO toca nada sin `--apply`.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * Regenerar el handoff propone una estructura de fases nueva y `reconcileAgentProposal` decide,
 * por nombre exacto y si no por posición, cuáles son "la misma fase de antes". Cuando el agente
 * rebautiza el mismo trabajo ("Integraciones" donde antes decía "Desarrollo / Integración"),
 * ninguno de los dos matches dispara: el modo aditivo (que existe para no borrar nunca una fase
 * con progreso) deja las DOS. La Tanda O agregó el aviso de fusión para que eso no vuelva a
 * nacer; esto limpia los duplicados que ya nacieron.
 *
 * Medido en Wherex (2026-08-11): «Desarrollo / Integración» e «Integraciones» ocupaban la MISMA
 * ventana (S1-S5) y cada una declaraba las mismas 17 reuniones de entrega.
 *
 * ── EL ORDEN DE LAS OPERACIONES NO ES NEGOCIABLE ─────────────────────────────
 * `TimelineTask.phaseId` es `onDelete: Cascade`. Borrar la fase absorbida ANTES de mover sus
 * tareas las destruye en silencio — con su progreso, sus fechas y su procedencia. Por eso todo
 * corre en UNA transacción y en este orden: mover tareas → re-apuntar particularidades →
 * borrar la fase vacía. Si algo falla en el medio, no se aplica nada.
 *
 * Lo que la fusión NO hace, a propósito:
 *   · No toca el estado de ninguna tarea (el status lo escribe el humano — invariante D.1/D.2).
 *   · No borra tareas: si el mismo título existe en las dos fases, quedan las dos y se REPORTAN
 *     para que un humano decida. Deduplicar por título sería adivinar cuál conserva el progreso.
 *   · No cambia duración ni fechas de la fase que sobrevive: fusionar no es re-planificar.
 *
 * Uso:
 *   npx tsx scripts/fusionar-fases-cronograma.ts --project=<id> --absorbe=<faseId> --absorbida=<faseId>
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/fusionar-fases-cronograma.ts --project=... --absorbe=... --absorbida=... --apply
 *
 * Sin `--absorbe/--absorbida` lista las fases del proyecto con sus ventanas, para elegir.
 */
import "dotenv/config";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { computePhaseRanges } from "@/lib/timeline/weeks";

const APPLY = resolverApply();

function arg(nombre: string): string | undefined {
  const p = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return p?.split("=").slice(1).join("=") || undefined;
}

async function main() {
  const projectId = arg("project");
  if (!projectId) {
    console.error("Falta --project=<projectId>.");
    process.exitCode = 1;
    return;
  }

  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: {
      id: true,
      phases: {
        orderBy: { order: "asc" },
        select: {
          id: true, name: true, order: true, durationWeeks: true, startWeek: true, status: true,
          tasks: { select: { id: true, title: true, status: true, weekIndex: true, order: true } },
          particularidades: { select: { id: true } },
        },
      },
    },
  });
  if (!tl) {
    console.error(`El proyecto ${projectId} no tiene cronograma.`);
    process.exitCode = 1;
    return;
  }

  const ranges = computePhaseRanges(tl.phases);
  const idAbsorbe = arg("absorbe");
  const idAbsorbida = arg("absorbida");

  if (!idAbsorbe || !idAbsorbida) {
    console.log(`Fases de ${projectId} — elegí --absorbe (la que sobrevive) y --absorbida:\n`);
    tl.phases.forEach((p, i) => {
      console.log(`  ${p.id}  [${p.order}] ${p.name.padEnd(32)} S${ranges[i].start}-S${ranges[i].end}  ${String(p.tasks.length).padStart(3)} tareas  ${p.particularidades.length} particularidad(es)`);
    });
    return;
  }

  const absorbe = tl.phases.find((p) => p.id === idAbsorbe);
  const absorbida = tl.phases.find((p) => p.id === idAbsorbida);
  if (!absorbe || !absorbida) {
    console.error("Alguna de las dos fases no pertenece a este cronograma. Abortado.");
    process.exitCode = 1;
    return;
  }
  if (absorbe.id === absorbida.id) {
    console.error("Son la misma fase. Abortado.");
    process.exitCode = 1;
    return;
  }

  const iAbsorbe = tl.phases.indexOf(absorbe);
  console.log(`\n=== FUSIÓN ===`);
  console.log(`  SOBREVIVE : «${absorbe.name}»  S${ranges[iAbsorbe].start}-S${ranges[iAbsorbe].end}  ${absorbe.tasks.length} tareas`);
  console.log(`  SE ABSORBE: «${absorbida.name}»  S${ranges[tl.phases.indexOf(absorbida)].start}-S${ranges[tl.phases.indexOf(absorbida)].end}  ${absorbida.tasks.length} tareas · ${absorbida.particularidades.length} particularidad(es)`);

  /* La fase que sobrevive puede ser MÁS CORTA que la absorbida: una tarea en la semana 3 de una
     fase de 4 no cabe en una de 2. Se recorta a la última semana válida en vez de perderla —
     una tarea fuera de rango no se dibuja en el Gantt y desaparece de la vista. */
  const ultimaSemana = Math.max(0, absorbe.durationWeeks - 1);
  const recortadas = absorbida.tasks.filter((t) => t.weekIndex > ultimaSemana);

  // `order` es por (fase, semana): al mezclar dos fases hay colisiones. Se re-numera densamente
  // respetando el orden actual, y las que llegan van DESPUÉS de las que ya estaban.
  const porSemana = new Map<number, Array<{ id: string; title: string; desde: "actual" | "absorbida"; order: number }>>();
  for (const t of absorbe.tasks) {
    const arr = porSemana.get(t.weekIndex) ?? [];
    arr.push({ id: t.id, title: t.title, desde: "actual", order: t.order });
    porSemana.set(t.weekIndex, arr);
  }
  for (const t of absorbida.tasks) {
    const w = Math.min(t.weekIndex, ultimaSemana);
    const arr = porSemana.get(w) ?? [];
    arr.push({ id: t.id, title: t.title, desde: "absorbida", order: 10_000 + t.order });
    porSemana.set(w, arr);
  }

  const nuevoOrden: Array<{ id: string; weekIndex: number; order: number }> = [];
  for (const [semana, items] of [...porSemana.entries()].sort((a, b) => a[0] - b[0])) {
    items.sort((a, b) => a.order - b.order);
    items.forEach((it, i) => nuevoOrden.push({ id: it.id, weekIndex: semana, order: i }));
  }

  // Títulos que quedarían repetidos DENTRO de la fase fusionada — se reportan, no se borran.
  const cuenta = new Map<string, number>();
  for (const [, items] of porSemana) for (const it of items) {
    const k = it.title.trim().toLowerCase();
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
  }
  const repetidos = [...cuenta.entries()].filter(([, n]) => n > 1);

  console.log(`\n  Tareas al terminar: ${absorbe.tasks.length + absorbida.tasks.length} en «${absorbe.name}»`);
  if (recortadas.length > 0) {
    console.log(`  ⚠ ${recortadas.length} tarea(s) caían fuera de la ventana y se recortan a la semana ${ultimaSemana + 1}:`);
    recortadas.forEach((t) => console.log(`      «${t.title}» (semana ${t.weekIndex + 1} → ${ultimaSemana + 1})`));
  }
  if (repetidos.length > 0) {
    console.log(`  ⚠ ${repetidos.length} título(s) quedan repetidos — NO se borran, decidilo a mano después:`);
    repetidos.forEach(([t, n]) => console.log(`      «${t}» ×${n}`));
  }
  if (absorbida.particularidades.length > 0) {
    console.log(`  ${absorbida.particularidades.length} particularidad(es) se re-apuntan a «${absorbe.name}» (si no, quedarían sin fase).`);
  }

  if (!APPLY) {
    console.log(`\n(dry-run — nada se escribió. Agregá --apply para aplicarlo.)`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    // 1) Las tareas se MUEVEN antes de borrar nada (phaseId es Cascade: el orden importa).
    for (const t of nuevoOrden) {
      await tx.timelineTask.update({
        where: { id: t.id },
        data: { phaseId: absorbe.id, weekIndex: t.weekIndex, order: t.order },
      });
    }
    // 2) Las particularidades ancladas a la fase que se va (su FK es SetNull: sin esto
    //    perderían el ancla y dejarían de contarse en la fase).
    await tx.particularidad.updateMany({
      where: { phaseId: absorbida.id },
      data: { phaseId: absorbe.id },
    });
    // 3) Recién ahora, la fase vacía.
    await tx.timelinePhase.delete({ where: { id: absorbida.id } });

    // 4) El orden de las fases queda denso (0..N-1) tras sacar una del medio.
    const quedan = await tx.timelinePhase.findMany({
      where: { timelineId: tl.id },
      orderBy: { order: "asc" },
      select: { id: true, order: true },
    });
    for (const [i, p] of quedan.entries()) {
      if (p.order !== i) await tx.timelinePhase.update({ where: { id: p.id }, data: { order: i } });
    }

    // 5) Auditoría con el estado RESULTANTE (snapshot es obligatorio, y es lo que hace
    //    reconstruible el "antes" si alguien quiere revisar la fusión más adelante).
    const snapPhases = await tx.timelinePhase.findMany({
      where: { timelineId: tl.id },
      orderBy: { order: "asc" },
      select: {
        id: true, name: true, order: true, durationWeeks: true, startWeek: true,
        sessionCount: true, notes: true, activityType: true, status: true,
        tasks: {
          orderBy: [{ weekIndex: "asc" }, { order: "asc" }],
          select: { id: true, title: true, weekIndex: true, order: true, status: true },
        },
      },
    });
    const tlRow = await tx.projectTimeline.findUnique({
      where: { id: tl.id },
      select: { anchorStartDate: true },
    });
    await tx.timelineChange.create({
      data: {
        timelineId: tl.id,
        reason: `Fusión de fases: «${absorbida.name}» (${absorbida.tasks.length} tareas) se absorbió dentro de «${absorbe.name}». Ninguna tarea se borró.`,
        kind: "MANUAL",
        instruction: null,
        changedByEmail: null,
        snapshot: {
          anchorStartDate: tlRow?.anchorStartDate?.toISOString() ?? null,
          phases: snapPhases,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }, { maxWait: 10000, timeout: 30000 });

  console.log(`\n✓ Fusionadas. «${absorbida.name}» ya no existe; sus tareas viven en «${absorbe.name}».`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
