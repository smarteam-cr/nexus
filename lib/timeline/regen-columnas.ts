/**
 * lib/timeline/regen-columnas.ts
 *
 * El reparto inicial de las DOS COLUMNAS del modal de curación (regen de una fase o de todo
 * el cronograma). Puro y en `lib/` a propósito: el project `unit` de vitest solo incluye
 * `lib/**`, así que un test al lado del componente NO correría.
 *
 * Tipado estructural (no importa nada de components/): `RegenCurrentTask` de
 * PhaseRegenPanel.tsx satisface `TareaActualParaReparto` sin acoplar lib → components.
 */

export interface TareaActualParaReparto {
  status: string;
  source?: string | null;
}

/**
 * Se PRESERVA automáticamente (columna derecha, ya pre-aceptada): lo que tiene progreso
 * humano encima — iniciada/hecha/suspendida (≠ PENDING) o cargada a mano (HUMAN). El resto
 * (PENDING + AGENT/MODIFIED) es material que el agente puede reemplazar.
 */
export const isKept = (t: TareaActualParaReparto): boolean =>
  t.status !== "PENDING" || t.source === "HUMAN";

/**
 * Cómo se reparten las tareas ACTUALES entre las dos columnas al abrir el panel.
 *
 * ⚠ LA REGLA QUE IMPORTA: "el agente no propuso nada para esta fase" NO significa "borrá
 * todo lo que hay". Sin propuesta, las tareas actuales se preservan ENTERAS (derecha) y la
 * izquierda queda vacía — si no, aplicar borraría la fase completa en silencio.
 *
 * No es teórico: desde que el agente aprende a dejar en paz las fases que las instrucciones
 * del CSE dan por resueltas (ej. "Service ya está terminado"), `cantidadPropuesta === 0` pasó
 * de ser un borde raro a ser el camino esperado para esas fases.
 */
export function repartoInicial<T extends TareaActualParaReparto>(
  actuales: T[],
  cantidadPropuesta: number,
): { descartables: T[]; preservadas: T[] } {
  if (cantidadPropuesta === 0) return { descartables: [], preservadas: actuales };
  return {
    descartables: actuales.filter((t) => !isKept(t)),
    preservadas: actuales.filter(isKept),
  };
}

/**
 * ¿Esta fase tiene algo que revisar? Con `repartoInicial`, sin propuesta no se toca nada —
 * así que "hay cambios" ⇔ el agente propuso algo. Lo usa el acordeón para decidir qué fase
 * abre expandida y cuál arranca colapsada con el badge "sin cambios".
 */
export function phaseHasChanges(cantidadPropuesta: number): boolean {
  return cantidadPropuesta > 0;
}
