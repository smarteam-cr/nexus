/**
 * lib/timeline/agrupar-items.ts — VEINTE RENGLONES QUE SON DOS DECISIONES.
 *
 * PURO. Sin Prisma, sin React.
 *
 * ── EL PROBLEMA, REPORTADO MIRANDO LA PANTALLA (2026-08-20) ──────────────────────────────────
 * Elías conversó UNA cosa —«unificá estas dos fases»— y la vista previa le devolvió una lista
 * plana de veinte barras iguales: la fase que se fusiona, la que se elimina con sus 7 tareas, y
 * dieciocho tareas que se corren una semana. Todas del mismo color, del mismo tamaño, con el
 * mismo par de botones. Su reacción, textual: *«debemos encontrar una forma más fácil de
 * visualizar esos cambios»*.
 *
 * ⭐ EL DIAGNÓSTICO NO ES «SON MUCHOS RENGLONES», ES QUE **NO SON LA MISMA CLASE DE COSA**.
 * Eliminar una fase que se lleva 7 tareas es una DECISIÓN. Que una tarea pase de la semana 2 a la
 * 3 porque su fase absorbió otra es la ARITMÉTICA de esa decisión. Pintarlas iguales hace dos
 * daños a la vez: entierra lo que hay que revisar, y le pide al CSE que apruebe uno por uno lo
 * que no eligió.
 *
 * Y hay un tercer caso que ni siquiera es consecuencia del pedido: las tareas que el reparador
 * acomodó porque ya estaban fuera de rango en la base (ver `reparar-propuesta.ts`). Ésas son una
 * corrección de datos rotos, y revisarlas ítem por ítem no tiene ningún sentido.
 *
 * ── LA REGLA ─────────────────────────────────────────────────────────────────────────────────
 * Se agrupa por FASE —el campo `fase` de `ItemDeAssist` existe desde el día uno con el comentario
 * «para agrupar la lista», y nunca se usó— y dentro de cada fase se parte en dos:
 *
 *   · DECISIONES: la fase nace, se va, cambia de duración/tipo/nombre; una tarea nace, se va, se
 *     muda de fase, o le reescribieron el título. Se muestran abiertas, con su ✓/✗.
 *   · CONSECUENCIAS: tareas cuyo ÚNICO cambio es en qué semana caen. Se pliegan detrás de una
 *     línea que las cuenta, con un solo ✓/✗ para todas.
 *
 * ⛔ Las consecuencias NO se aceptan solas ni se esconden: se pueden abrir y se pueden descartar
 * en bloque. Esconderlas del todo sería la otra mitad del mismo error — el CSE tiene que poder
 * ver que una tarea DONE se movió de semana.
 */
import type { ItemDeAssist } from "./assist-items";

export interface GrupoDeItems {
  /** El nombre de la fase, o el rótulo del grupo global. */
  fase: string;
  /** Lo que alguien eligió. Se pinta abierto. */
  decisiones: ItemDeAssist[];
  /** La aritmética de esas elecciones. Se pinta plegada, con un ✓/✗ para todo el bloque. */
  consecuencias: ItemDeAssist[];
  /** Todas las claves del grupo — para aceptar o descartar el bloque entero de un clic. */
  claves: string[];
  /** El grupo toca algo con trabajo humano encima. */
  pesado: boolean;
}

/**
 * El rótulo del grupo de los cambios que NO son de una fase en particular (la fecha de arranque,
 * el reordenamiento). Van primero porque afectan a todo el cronograma.
 */
export const GRUPO_GLOBAL = "Todo el cronograma";

const CLASES_GLOBALES = new Set(["ancla", "orden-fases"]);

/**
 * Cuánto pesa un grupo, para ordenar la lista. Lo irreversible primero: una fase que se va se
 * lleva sus tareas, y eso es lo que hay que mirar antes de apretar «Aplicar».
 */
function pesoDelGrupo(g: GrupoDeItems): number {
  if (g.fase === GRUPO_GLOBAL) return 0;
  const clases = new Set(g.decisiones.map((i) => i.clase));
  if (clases.has("fase-se-va")) return 1;
  if (clases.has("fase-nueva")) return 2;
  if (clases.has("fase-cambia")) return 3;
  if (g.decisiones.length > 0) return 4;
  return 5; // solo consecuencias
}

/** Agrupa por fase y separa decisiones de consecuencias. El orden de los ítems se conserva. */
export function agruparItems(items: readonly ItemDeAssist[]): GrupoDeItems[] {
  const porFase = new Map<string, GrupoDeItems>();

  const grupo = (nombre: string): GrupoDeItems => {
    let g = porFase.get(nombre);
    if (!g) {
      g = { fase: nombre, decisiones: [], consecuencias: [], claves: [], pesado: false };
      porFase.set(nombre, g);
    }
    return g;
  };

  for (const item of items) {
    const g = grupo(CLASES_GLOBALES.has(item.clase) ? GRUPO_GLOBAL : item.fase);
    (item.soloSemana ? g.consecuencias : g.decisiones).push(item);
    g.claves.push(item.key);
    if (item.pesado) g.pesado = true;
  }

  return [...porFase.values()].sort((a, b) => {
    const d = pesoDelGrupo(a) - pesoDelGrupo(b);
    /* Empate → se conserva el orden en que aparecieron, que es el orden real de las fases. */
    return d !== 0 ? d : 0;
  });
}

/** «3 tareas se corren de semana» — el renglón que reemplaza a tres barras iguales. */
export function resumenDeConsecuencias(g: GrupoDeItems): string {
  const n = g.consecuencias.length;
  if (n === 0) return "";
  return n === 1 ? "1 tarea se corre de semana" : `${n} tareas se corren de semana`;
}
