/**
 * lib/contexto/material-cronograma.ts — LO QUE EL CSE LE DA AL CRONOGRAMA, LISTO PARA EL AGENTE.
 * Puro: sin Prisma. Lo carga `cargarMaterialDelCronograma` (./cargar.ts) y lo importa también la
 * pantalla (los topes son los mismos para los dos lados).
 *
 * ── POR QUÉ EXISTE (2026-09-23) ──────────────────────────────────────────────
 * El agente que detalla el cronograma —el que decide las tareas por semana y cuáles son reuniones—
 * no leía NINGUNA reunión: solo las fases, el handoff confirmado, el requerimiento técnico y las
 * instrucciones del CSE. Todo lo que pasó en la implementación le llegaba, como mucho, a través
 * del handoff. El «Contexto del cronograma» le da las reuniones que el CSE deja entrar y las notas
 * que pega a mano, rotuladas.
 *
 * ── LA FRONTERA VA ADENTRO DEL RÓTULO ────────────────────────────────────────
 * Las transcripciones y las notas son material INTERNO, y los títulos de las tareas los lee el
 * cliente. La regla («no copies nombres, montos ni frases») viaja pegada al bloque —no en el prompt
 * sembrado— por dos motivos: los tres agentes que lo leen la reciben igual sin re-sembrar ninguno, y
 * la procedencia que viaja FUERA del texto se pierde por descuido de un call site (Tanda H).
 */
import { HANDOFF_SESSION_CHAR_TIERS, planHandoffSessionBudget } from "@/lib/handoff/session-budget";

/** Tope total de las reuniones: el mismo presupuesto que usa el handoff para las suyas. */
export const TOPE_REUNIONES_CRONOGRAMA = 32_000;

/**
 * Tope total de las notas manuales. Lo lee también la pantalla, para avisar cuando lo que se pegó
 * no entra entero: un tope que solo conoce el servidor es texto que el CSE cree que el agente leyó.
 */
export const TOPE_NOTAS_CRONOGRAMA = 12_000;

/** Parte del presupuesto que se reserva para las reuniones que el CSE agregó A MANO. */
export const PRESUPUESTO_AGREGADAS = 16_000;

/**
 * Cuántas reuniones como máximo se LEEN (además de las agregadas a mano, que se leen todas). Un
 * proyecto con 200 reuniones no necesita leer 200 transcripciones para llenar 32.000 caracteres:
 * con la cota mínima del reparto (400) no entran más de ~60. Las más recientes primero.
 */
export const MAX_REUNIONES_A_LEER = 80;

export interface ReunionConContenido {
  id: string;
  title: string;
  /** epoch ms */
  date: number;
  agregadaAMano: boolean;
}

/**
 * EL REPARTO DEL ESPACIO, sobre reuniones que YA se sabe que tienen contenido.
 *
 * ── POR QUÉ SE REPARTE DESPUÉS DE LEER (revisión adversarial, 2026-09-23) ────
 * La primera versión repartía ANTES de saber qué había adentro: las cotas grandes (4.000, 3.000…)
 * iban a las más recientes aunque estuvieran vacías —medido en el repo: la mitad de las reuniones
 * no dejan transcripción—, y la reunión con material real llegaba recortada a 400 caracteres o
 * afuera. Ahora quien llama lee primero, descarta las vacías y recién ahí reparte.
 *
 * Las agregadas a mano van primero con su propio cupo; las que no entran en él NO se pierden:
 * compiten en el reparto general con el resto.
 *
 * @returns id → cota de caracteres. Una reunión que no aparece no entra.
 */
export function repartirEspacio(
  reuniones: readonly ReunionConContenido[],
  ahora: number,
): Map<string, number> {
  const cupo = (total: number) => ({
    beforeBudgetChars: Math.floor(total / 2),
    afterBudgetChars: total - Math.floor(total / 2),
    perSessionCharTiers: HANDOFF_SESSION_CHAR_TIERS,
  });
  const planAgregadas = planHandoffSessionBudget(
    reuniones.filter((r) => r.agregadaAMano),
    null,
    ahora,
    cupo(PRESUPUESTO_AGREGADAS),
  );
  const usado = planAgregadas.reduce((acc, p) => acc + p.maxChars, 0);
  const yaEntraron = new Set(planAgregadas.map((p) => p.id));
  const planResto = planHandoffSessionBudget(
    reuniones.filter((r) => !yaEntraron.has(r.id)),
    null,
    ahora,
    cupo(TOPE_REUNIONES_CRONOGRAMA - usado),
  );
  return new Map([...planAgregadas, ...planResto].map((p) => [p.id, p.maxChars]));
}

export interface ReunionParaElCronograma {
  title: string;
  /** epoch ms */
  date: number;
  /** «[CON EL CLIENTE] » / «[PUERTAS ADENTRO] » / "" — de `prefijoDeSala`. */
  prefijoDeSala: string;
  /** El contenido ya recortado a su cota. `null` = la reunión no dejó nada. */
  contenido: string | null;
  /** La agregó el CSE a mano (el «Agregar» del Contexto del cronograma). */
  agregadaAMano: boolean;
}

export interface NotaParaElCronograma {
  title: string | null;
  content: string;
}

const fmt = (ms: number) =>
  new Date(ms).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" });

/**
 * El bloque de REUNIONES para el agente. `""` si no hay ninguna con contenido — un rótulo sin nada
 * abajo le dice al modelo que le falta material, y gasta presupuesto.
 */
export function bloqueDeReunionesDelCronograma(reuniones: readonly ReunionParaElCronograma[]): string {
  const conContenido = reuniones.filter((r) => r.contenido && r.contenido.trim());
  if (conContenido.length === 0) return "";
  const cuerpo = conContenido
    .map(
      (r) =>
        `### ${r.prefijoDeSala}${r.title || "(sin título)"} — ${fmt(r.date)}` +
        `${r.agregadaAMano ? " · la agregó el CSE a mano" : ""}\n${(r.contenido ?? "").trim()}`,
    )
    .join("\n\n---\n\n");
  return (
    `=== REUNIONES DEL PROYECTO QUE EL CSE DEJA ENTRAR AL CRONOGRAMA (material INTERNO) ===\n` +
    `Úsalas para decidir qué tareas hay en cada fase, en qué semana van y cuáles son reuniones con el ` +
    `cliente. Lo que se acordó o se hizo en una reunión pesa más que la tarea típica del tipo de fase. ` +
    `⛔ NUNCA copies a un título de tarea nombres de personas, montos, frases textuales ni opiniones ` +
    `internas: los títulos los lee el cliente. Las que dicen «la agregó el CSE a mano» las eligió ` +
    `alguien a propósito: no las ignores.\n\n${cuerpo}`
  );
}

/**
 * El bloque de NOTAS MANUALES para el agente. `""` sin notas. Se recorta al tope TOTAL (no por nota):
 * el orden es el de carga, así que lo que no entra es lo último que se pegó — la pantalla lo avisa.
 */
export function bloqueDeNotasDelCronograma(notas: readonly NotaParaElCronograma[]): string {
  const completo = cuerpoDeNotas(notas);
  if (!completo) return "";
  const cuerpo = completo.slice(0, TOPE_NOTAS_CRONOGRAMA);
  return (
    `=== NOTAS DEL CSE PARA EL CRONOGRAMA (pegadas a mano — material INTERNO) ===\n` +
    `Son hechos que no quedaron en ninguna reunión (una decisión, un cambio de prioridad, algo que ` +
    `ya se hizo). Tienen el mismo peso que una reunión. ⛔ NUNCA copies a un título de tarea ` +
    `nombres de personas, montos ni frases textuales: los títulos los lee el cliente.\n\n${cuerpo}`
  );
}

/** El texto de las notas SIN recortar — el mismo armado que lee el agente. `""` sin notas. */
function cuerpoDeNotas(notas: readonly NotaParaElCronograma[]): string {
  return notas
    .filter((n) => n.content.trim())
    .map((n, i) => `### Nota: ${n.title?.trim() || `(sin título ${i + 1})`}\n${n.content.trim()}`)
    .join("\n\n---\n\n");
}

/**
 * ¿Lo que se pegó pasa el tope? Para el aviso de la pantalla. Mide el MISMO texto que se recorta
 * (`cuerpoDeNotas`): contar solo título + contenido dejaba afuera rótulos y separadores, y el aviso
 * llegaba después de que el agente ya estaba perdiendo el final.
 */
export function notasPasanElTope(notas: readonly NotaParaElCronograma[]): boolean {
  return cuerpoDeNotas(notas).length > TOPE_NOTAS_CRONOGRAMA;
}
