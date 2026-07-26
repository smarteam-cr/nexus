/**
 * scripts/inspect-progress-model.ts — EL AVANCE NUEVO CONTRA EL VIEJO. Solo lectura.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * Este script es el PORTÓN de todo el rediseño del avance. La regla de peso (una fase pesa sus
 * semanas) es defendible en abstracto; lo que importa es si el número que sale se puede
 * explicar mirando un proyecto real. Si un ponderado no se explica, la regla está mal y hay que
 * corregirla ACÁ —donde no cuesta nada— y no después de que la vean 17 proyectos por CSE y,
 * por decisión del usuario, también los 5 clientes con cronograma publicado.
 *
 * No escribe absolutamente nada. Correrlo antes y después de tocar `progress-model.ts`, y
 * comparar. Un proyecto que salta de 20% a 80% no es un cronograma que avanzó: es una regla que
 * cambió de opinión.
 *
 *   npx tsx scripts/inspect-progress-model.ts
 *   npx tsx scripts/inspect-progress-model.ts --cliente=Wherex
 */
import { createScriptDb } from "./lib/db";
import { computeWeightedProgress, resolvedTaskCounts } from "@/lib/timeline/progress-model";
import { deriveMarking, MARKING_LABEL } from "@/lib/timeline/progress-freshness";
import { derivePhaseState, DIVERGENCE_LABEL } from "@/lib/timeline/phase-state";
import { computePhaseRanges, isOverdueByDate, overduePlannedEnd } from "@/lib/timeline/weeks";

// Presupuesto de conexiones ACOTADO (scripts/lib/db.ts): el pooler comparte ~15 slots con prod.
const { prisma, close } = createScriptDb();

const FILTRO = process.argv.find((a) => a.startsWith("--cliente="))?.split("=")[1]?.toLowerCase() ?? null;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const pctStr = (n: number | null) => (n === null ? "  —  " : `${String(Math.round(n * 100)).padStart(3)}%`);

async function main() {
  const now = new Date();
  const timelines = await prisma.projectTimeline.findMany({
    select: {
      anchorStartDate: true,
      project: { select: { name: true, timelinePublishedAt: true, client: { select: { name: true } } } },
      changes: { where: { kind: "PROGRESS" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      phases: {
        orderBy: { order: "asc" },
        select: {
          id: true, name: true, status: true, durationWeeks: true, startWeek: true,
          actualStart: true, actualEnd: true,
          tasks: { select: { status: true, weekIndex: true } },
        },
      },
    },
  });

  const filas = timelines
    .filter((t) => !FILTRO || (t.project?.client?.name ?? "").toLowerCase().includes(FILTRO))
    .map((t) => {
      const anchor = t.anchorStartDate;
      const tareas = t.phases.flatMap((p) => p.tasks);
      const c = resolvedTaskCounts(tareas);

      // El número VIEJO, tal cual lo calcula lib/portfolio/summary.ts hoy.
      const pctPlano =
        c.denominator > 0
          ? c.done / c.denominator
          : t.phases.length > 0
            ? t.phases.filter((p) => p.status === "DONE").length / t.phases.length
            : 0;

      const w = computeWeightedProgress({ phases: t.phases, anchorStartDate: anchor, now });

      // Vencidas con el predicado ÚNICO del sistema (no una segunda matemática).
      const ranges = computePhaseRanges(t.phases);
      let vencidas = 0;
      t.phases.forEach((p, i) => {
        for (const tk of p.tasks) {
          const fin = overduePlannedEnd(anchor?.toISOString() ?? null, ranges[i].start, tk.weekIndex);
          if (isOverdueByDate(fin, now, tk.status)) vencidas++;
        }
      });

      const marking = deriveMarking({
        tasksTotal: c.denominator,
        tasksResolved: c.resolved,
        overdueUnresolved: vencidas,
        lastProgressAt: t.changes[0]?.createdAt ?? null,
        // La columna todavía no existe (la agrega C1): hoy siempre null, y el script sirve igual.
        progressReviewedAt: null,
        now,
      });

      const curWeek = anchor ? (now.getTime() - anchor.getTime()) / WEEK_MS : null;
      const divergentes = t.phases.filter((p, i) =>
        derivePhaseState(p, { phaseStart: ranges[i].start, durationWeeks: p.durationWeeks, curWeek })
          .divergences.length > 0,
      );

      return {
        cliente: (t.project?.client?.name ?? "?").slice(0, 20),
        publicado: !!t.project?.timelinePublishedAt,
        pctPlano, w, c, vencidas, marking, divergentes, phases: t.phases, ranges, curWeek,
      };
    });

  filas.sort((a, b) => Math.abs((b.w.pct ?? 0) - b.pctPlano) - Math.abs((a.w.pct ?? 0) - a.pctPlano));

  console.log("cliente".padEnd(21), "pub", "plano", "ponder", "espera", " gap ", "tareas", "venc", "estado de marcado");
  console.log("─".repeat(110));
  for (const f of filas) {
    console.log(
      f.cliente.padEnd(21),
      (f.publicado ? " ✓ " : "   "),
      pctStr(f.pctPlano),
      pctStr(f.w.pct),
      pctStr(f.w.expectedPct),
      f.w.gapPct === null ? "  —  " : `${f.w.gapPct >= 0 ? "+" : ""}${Math.round(f.w.gapPct * 100)}%`.padStart(5),
      `${f.c.done}/${f.c.denominator}`.padStart(6),
      String(f.vencidas).padStart(4),
      ` ${MARKING_LABEL[f.marking.state]}${f.marking.daysSinceReview !== null ? ` (hace ${f.marking.daysSinceReview}d)` : ""}`,
    );
  }

  console.log(`\n${filas.length} cronograma(s).`);
  console.log(`sin fecha de arranque: ${filas.filter((f) => f.w.expectedPct === null).length}`);
  console.log(`sin ninguna tarea    : ${filas.filter((f) => f.c.total === 0).length}`);
  for (const estado of ["SIN_MARCAR", "DESACTUALIZADO", "SIN_DETALLE", "AL_DIA"] as const) {
    console.log(`${MARKING_LABEL[estado].padEnd(28)}: ${filas.filter((f) => f.marking.state === estado).length}`);
  }

  /* Lo que se le muestra a los 5 clientes con cronograma publicado cambia de número. Esa lista
     va aparte y con nombre: es la que hay que mirar antes de mergear C1. */
  const publicados = filas.filter((f) => f.publicado);
  if (publicados.length) {
    console.log(`\n══ LOS ${publicados.length} PUBLICADOS — su número cambia sin que nadie re-publique ══`);
    for (const f of publicados) {
      console.log(`   ${f.cliente.padEnd(21)} ${pctStr(f.pctPlano)} → ${pctStr(f.w.pct)}   (${f.c.done}/${f.c.denominator} tareas)`);
    }
  }

  /* Con `--cliente=` se imprime el desglose fase por fase. Es LA prueba del portón: si el
     ponderado no se puede reconstruir sumando estas líneas a mano, la regla de peso está mal. */
  if (FILTRO) {
    for (const f of filas) {
      console.log(`\n══ ${f.cliente} — de dónde sale el ${pctStr(f.w.pct).trim()} ══`);
      console.log("   fase".padEnd(42), "sem", "hecho", "esperado", "aporta");
      f.w.byPhase.forEach((bp, i) => {
        const nombre = f.phases[i].name.slice(0, 38);
        const t = resolvedTaskCounts(f.phases[i].tasks);
        console.log(
          `   ${nombre.padEnd(39)}`,
          String(bp.weight).padStart(3),
          `${pctStr(bp.donePct)}`,
          `${pctStr(bp.elapsedPct)}   `,
          `${(bp.weight * bp.donePct).toFixed(1).padStart(5)} sem`,
          bp.hasDetail ? `(${t.done}/${t.denominator} tareas)` : `(sin tareas · ${f.phases[i].status})`,
        );
      });
      console.log(`   ${"TOTAL".padEnd(39)} ${String(f.w.weightTotal).padStart(3)}                      ${f.w.weightDone.toFixed(1).padStart(5)} sem`);
      console.log(`   → ${f.w.weightDone.toFixed(1)} / ${f.w.weightTotal} = ${pctStr(f.w.pct).trim()}   (el plano decía ${pctStr(f.pctPlano).trim()})`);
    }
  }

  const conDivergencias = filas.filter((f) => f.divergentes.length > 0);
  console.log(`\n══ FASES CON EL ESTADO DESACTUALIZADO (${conDivergencias.length} proyecto(s)) ══`);
  for (const f of conDivergencias.slice(0, 10)) {
    console.log(`   ${f.cliente}:`);
    for (const p of f.divergentes.slice(0, 4)) {
      const i = f.phases.indexOf(p);
      const d = derivePhaseState(p, {
        phaseStart: f.ranges[i].start, durationWeeks: p.durationWeeks, curWeek: f.curWeek,
      });
      console.log(`      "${p.name.slice(0, 38)}" ${d.persisted} → ${d.derived}  · ${d.divergences.map((x) => DIVERGENCE_LABEL[x]).join(" · ")}`);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => close());
