/**
 * lib/timeline/tarea-repetida.ts
 *
 * ¿ESTA TAREA QUE EL AGENTE PROPONE YA EXISTE EN OTRA FASE? Puro, sin Prisma.
 *
 * ── EL CASO REAL (Wherex, 2026-08-11) ────────────────────────────────────────
 * «Construir dashboards de ventas» quedó HECHA en «Desarrollo / Integración» (creada el 7-jul,
 * marcada a mano por una persona) y PENDIENTE en «Sales Hub» (creada el 10-ago por "Regenerar
 * todo el cronograma"). El agente volvió a proponer un trabajo ya terminado, en otra fase, y la
 * ventana de revisión no dijo nada: sobre 101 tareas es imposible verlo a ojo. El avance del
 * proyecto la cuenta dos veces — una como deuda y otra como logro.
 *
 * ── POR QUÉ COINCIDENCIA EXACTA, Y NO DIFUSA ─────────────────────────────────
 * Los 3 casos que hay en toda la cartera activa son títulos IDÉNTICOS, así que la comparación
 * exacta normalizada los detecta a los tres con cero falsos positivos.
 *
 * Se descartó reusar `phaseNamesLikelySameWork` (lib/timeline/phase-identity.ts): su umbral es
 * "≥1 token compartido de ≥5 chars", calibrado para NOMBRES DE FASE de 2-4 palabras. Sobre
 * títulos de tarea —frases largas— daría falsos positivos masivos: «Configurar pipeline de
 * ventas» y «Configurar propiedades de contacto» comparten *configurar*. Y un aviso que salta de
 * más en una lista de 101 ítems se vuelve ruido, se ignora, y deja de servir justo para el caso
 * que importa. Conservador a propósito: mejor no avisar de una reformulada que enseñar a
 * ignorar el aviso.
 *
 * La normalización es `fingerprintFromTitle` (lib/timeline/particularidad-identity.ts), ya
 * probada y usada para el mismo problema en particularidades: lowercase + NFD sin diacríticos +
 * slug. Dos redacciones que solo difieren en tildes o puntuación caen en la misma huella.
 */
import { fingerprintFromTitle } from "./particularidad-identity";

export interface TareaConEstado {
  title: string;
  /** PENDING | IN_PROGRESS | DONE | SUSPENDED */
  status: string;
}

export interface FaseConTareas {
  phaseId: string;
  phaseName: string;
  /** Las tareas REALES de la fase (no las propuestas). */
  current: TareaConEstado[];
}

export interface AvisoRepetida {
  /** La fase donde ya existe. */
  fase: string;
  status: string;
  /** true si allá está hecha o en curso — el caso caro: se re-propone trabajo ya avanzado. */
  yaAvanzada: boolean;
}

/** Índice de las tareas que YA existen, por huella de título. */
export type IndiceDeTareas = Map<string, Array<{ phaseId: string; phaseName: string; status: string }>>;

export function indexarTareasPorTitulo(fases: readonly FaseConTareas[]): IndiceDeTareas {
  const idx: IndiceDeTareas = new Map();
  for (const f of fases) {
    for (const t of f.current) {
      const huella = fingerprintFromTitle(t.title);
      if (!huella) continue;
      const arr = idx.get(huella) ?? [];
      arr.push({ phaseId: f.phaseId, phaseName: f.phaseName, status: t.status });
      idx.set(huella, arr);
    }
  }
  return idx;
}

/**
 * ¿Hay que avisar por esta tarea? Devuelve la coincidencia de OTRA fase, o null.
 *
 * Se ignoran a propósito las coincidencias dentro de la MISMA fase: ahí la tarea propuesta y la
 * existente son la misma cosa (el modal ya las reparte en sus dos columnas) y avisar sería
 * marcar como problema el funcionamiento normal.
 *
 * Ante varias coincidencias gana la más avanzada: si en una fase está hecha y en otra pendiente,
 * lo que el CSE necesita saber es que YA SE HIZO.
 */
export function avisoDeRepetida(
  titulo: string,
  phaseIdActual: string,
  indice: IndiceDeTareas,
): AvisoRepetida | null {
  const huella = fingerprintFromTitle(titulo);
  if (!huella) return null;
  const enOtrasFases = (indice.get(huella) ?? []).filter((c) => c.phaseId !== phaseIdActual);
  if (enOtrasFases.length === 0) return null;

  const avanzada = (s: string) => s === "DONE" || s === "IN_PROGRESS";
  const ganadora = enOtrasFases.find((c) => avanzada(c.status)) ?? enOtrasFases[0];
  return {
    fase: ganadora.phaseName,
    status: ganadora.status,
    yaAvanzada: avanzada(ganadora.status),
  };
}
