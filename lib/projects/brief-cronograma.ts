/**
 * lib/projects/brief-cronograma.ts — EL CRONOGRAMA, EN UNA FUENTE CITABLE.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * El resumen del proyecto contestaba «qué pasó» (reuniones, estado en HubSpot, desviaciones) sin
 * saber NUNCA dónde está parado el plan: cuántas fases cerraron, si hay atraso, para cuándo cierra
 * hoy y cuánto se corrió respecto de lo prometido. Sin eso, una desviación es un hecho suelto —
 * «se pausó la capacitación» no dice si el proyecto va bien igual o si arrastra dos meses.
 *
 * ── PURO A PROPÓSITO ─────────────────────────────────────────────────────────
 * Recibe el summary ya cargado (`lib/portfolio/load.ts`), no un `projectId`. Así la decisión de
 * QUÉ se le cuenta al modelo —y sobre todo qué se CALLA cuando no se puede afirmar— se prueba sin
 * base ni red.
 *
 * ⚠ Cada línea se omite cuando su dato no existe, en vez de escribir un cero. «0 % de avance» y
 * «todavía no hay fases» son cosas distintas, y el modelo no puede distinguirlas si las dos
 * llegan como un número. Lo mismo con el cierre: sin ancla NO hay fecha, y la mitad de la cartera
 * no la tiene (medido en la Tanda J).
 *
 * ⛔ NADA de plata acá. El cronograma no sabe de cobranza y esta fuente alimenta un documento
 * interno que se lee al lado del cliente: ver el docblock de `projectedEnd` en lib/timeline/weeks.ts.
 */
import type { ProjectSummary } from "@/lib/portfolio/summary";

const fmt = (iso: string | null): string | null =>
  iso
    ? new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" })
    : null;

/**
 * Cuánto se corrió el cierre, dicho como lo diría una persona.
 *
 * El signo importa: `driftDays > 0` es «se fue para adelante DESPUÉS de prometerlo», que es lo que
 * el cliente siente. Un adelanto también se dice — un resumen que solo trae malas noticias miente.
 */
function corrimiento(dias: number): string {
  const abs = Math.abs(dias);
  const cuanto = abs === 1 ? "1 día" : `${abs} días`;
  return dias > 0 ? `se corrió ${cuanto} respecto de lo prometido` : `se adelantó ${cuanto}`;
}

/**
 * El texto del cronograma para el contexto del brief. `null` cuando no hay NADA que decir —
 * un proyecto sin fases no gana una fuente hueca que el modelo pueda citar.
 */
export function textoDeCronogramaParaBrief(s: ProjectSummary | null): string | null {
  if (!s) return null;
  const lineas: string[] = [];

  if (s.progress.phasesTotal > 0) {
    lineas.push(
      `Avance del plan: ${s.progress.phasesDone} de ${s.progress.phasesTotal} fases cerradas y ` +
        `${s.progress.tasksDone} de ${s.progress.tasksTotal} tareas hechas (${s.progress.pct} %).`,
    );
  }

  if (s.overduePhases > 0 || s.overdueTasks > 0) {
    const peor = s.worstOverduePhase
      ? ` La más atrasada es «${s.worstOverduePhase.name}», ${s.worstOverduePhase.daysLate} días.`
      : "";
    lineas.push(
      `Atraso: ${s.overduePhases} fase(s) y ${s.overdueTasks} tarea(s) pasadas de fecha.${peor}`,
    );
  }

  const proyectado = fmt(s.closing.projectedISO);
  const prometido = fmt(s.closing.promisedISO);
  if (proyectado) {
    const contra =
      prometido && s.closing.driftDays !== null && s.closing.driftDays !== 0
        ? ` Se había prometido para el ${prometido}: ${corrimiento(s.closing.driftDays)}.`
        : prometido
          ? ` Es la misma fecha que se prometió.`
          : "";
    lineas.push(`Hoy el plan cierra el ${proyectado}.${contra}`);
  } else if (s.progress.phasesTotal > 0) {
    /* Decirlo es mejor que callarlo: sin fecha de arranque el cronograma no puede proyectar un
       cierre, y el modelo tiene que saber que el silencio no significa «va en fecha». */
    lineas.push(
      "El cronograma no tiene fecha de arranque registrada, así que Nexus no puede decir para " +
        "cuándo cierra: no afirmes fechas de cierre.",
    );
  }

  /* El alcance agregado solo se afirma con línea base FIRME. Con una débil, el «extra» suele ser
     detalle que se agregó al planificar, no trabajo nuevo — afirmarlo sería acusar al cliente de
     pedir de más con un número que no se sostiene. */
  if (s.scope.measurable && !s.scope.attenuated && (s.scope.addedPhases > 0 || s.scope.addedTasks > 0)) {
    lineas.push(
      `Sobre lo que se prometió se sumaron ${s.scope.addedPhases} fase(s) y ` +
        `${s.scope.addedTasks} tarea(s).`,
    );
  }

  if (s.stalled && s.daysSinceActivity !== null) {
    lineas.push(`Hace ${s.daysSinceActivity} días que nadie toca el cronograma.`);
  }

  return lineas.length > 0 ? lineas.join("\n") : null;
}
