/**
 * lib/invariantes/cronograma.ts — el invariante del cronograma (extraído de
 * scripts/check-invariants.ts en B-07, 2026-09-04).
 */
import { cumple, viola, type Invariante } from "./contrato";

/**
 * INV22 · Ninguna tarea vive en una semana que su fase no tiene. Medido el 2026-08-20: **34 tareas
 * en 7 fases de 5 proyectos** con `weekIndex >= durationWeeks`. Multiquimica tenía 10 tareas en
 * una fase de UNA semana.
 *
 * Cómo llegaron ahí: `tasks` es opcional en el PUT («undefined = no tocar») y el validador solo
 * mira las tareas que vienen EN el payload. Un cuerpo que solo acorta `durationWeeks` pasa limpio
 * y deja las existentes fuera de rango, sin error y sin aviso.
 *
 * ⭐ Por qué es un invariante y no una curiosidad: el PUT valida las semanas de toda tarea que
 * viaja, así que un guardado que trae esas tareas en esa semana se rechaza ENTERO, con un mensaje que
 * nadie puede accionar. Antes lo sufría el modificador de IA (devolvía el cronograma completo: 231 s y
 * $0,29 por intento perdido; se retiró en E4); hoy, un cambio del chat que toque esa fase. El PUT ya no
 * las genera; esto vigila que no vuelvan.
 * Remedio: `scripts/sanar-semanas-fuera-de-fase.ts` (dry-run primero).
 */
export const INV22: Invariante = {
  id: "22",
  nombre: "ninguna tarea fuera del rango de semanas de su fase",
  async correr(db) {
    const fasesConTareas = await db.timelinePhase.findMany({
      select: {
        name: true,
        durationWeeks: true,
        timeline: { select: { project: { select: { name: true } } } },
        tasks: { select: { weekIndex: true } },
      },
    });
    const desbordadas: string[] = [];
    let tareasDesbordadas = 0;
    for (const f of fasesConTareas) {
      const malas = f.tasks.filter((t) => t.weekIndex >= f.durationWeeks || t.weekIndex < 0).length;
      if (malas === 0) continue;
      tareasDesbordadas += malas;
      desbordadas.push(`${f.timeline.project.name} · «${f.name}» (${f.durationWeeks} sem): ${malas} tarea(s)`);
    }
    if (desbordadas.length > 0) {
      return viola(
        `✗ INV22 VIOLADO: ${tareasDesbordadas} tarea(s) en ${desbordadas.length} fase(s) viven en una semana que su fase no tiene.\n` +
          desbordadas.map((d) => `    · ${d}`).join("\n") +
          `\n    Efecto: el PUT rechaza cualquier guardado que traiga esas tareas en esa semana, por ejemplo un cambio del chat que toque esa fase.` +
          `\n    Remedio: npx tsx --env-file=.env scripts/sanar-semanas-fuera-de-fase.ts (dry-run primero).`,
      );
    }
    return cumple(`✓ INV22: ninguna tarea fuera del rango de semanas de su fase (${fasesConTareas.length} fases).`);
  },
};
