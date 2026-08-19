/**
 * lib/timeline/capacidades.ts — QUÉ PUEDE Y QUÉ NO PUEDE HACERSE CON EL CRONOGRAMA.
 *
 * PURO. Sin Prisma, sin fetch, sin React.
 *
 * ── POR QUÉ EXISTE, Y ES LITERALMENTE LO QUE PIDIÓ ELÍAS ─────────────────────────────────────
 * Su queja, textual:
 *
 *   «Si el usuario solo pide un cambio y se genera, puede dar información inconclusa, puede que
 *    el modificador de canvas no sea capaz de generar ese tipo; pero el usuario no obtiene esa
 *    respuesta. La idea es hablar de los cambios, consensuarlo conforme las capacidades, y luego
 *    dar el ok.»
 *
 * Eso NO lo arregla el mecanismo de aplicar. Lo arregla que las restricciones del modificador
 * estén escritas en UN SOLO LUGAR que puedan leer los dos: el modificador, para obedecerlas, y el
 * asistente que conversa, para poder decir «eso no se puede» ANTES de proponerlo.
 *
 * ⛔ COPIARLAS AL PROMPT DEL CHAT SERÍA EL PEOR RESULTADO POSIBLE. Dos copias divergen calladas, y
 * la divergencia se manifiesta como el chat prometiéndole al CSE algo que el modificador no puede
 * hacer — que es exactamente el problema que este archivo viene a resolver, pero peor: ahora con
 * el sistema afirmándolo por escrito.
 *
 * Por eso el prompt del modificador (`lib/agents/timeline-assist.ts`) las INTERPOLA de acá en vez
 * de transcribirlas, y hay una guarda que lo hace cumplir.
 */

/**
 * Las reglas duras que el modificador obedece al reescribir un cronograma. Van tal cual dentro de
 * su prompt, y las lee también quien tenga que explicar qué se puede pedir.
 *
 * ⚠ El texto está redactado PARA UN MODELO (segunda persona, imperativo). Si algún día una
 * pantalla necesita mostrárselo a una persona, la traducción va aparte — reescribir esto para que
 * «se lea mejor» le cambia las instrucciones al agente sin que nadie lo note.
 */
export const REGLAS_DURAS_DEL_CRONOGRAMA = `- Conserva los ids EXACTOS de las fases y tareas que siguen existiendo (las edites o no). Elementos NUEVOS van sin id. Para BORRAR algo, simplemente omítelo del resultado.
- Si mueves una tarea a OTRA fase: en la fase destino va SIN id (es nueva ahí) y en la fase origen desaparece.
- Cada tarea trae "status" y "source". Las que NO están en PENDING (DONE, IN_PROGRESS, SUSPENDED) o tienen source HUMAN ya tienen trabajo real encima: consérvalas SIEMPRE con su id, aunque la instrucción reorganice la fase. NO las omitas: omitir es borrar. Si la instrucción pide explícitamente quitar una de ellas, quítala igual — el servidor avisa.
- weekIndex es 0-indexed y RELATIVO a su fase; siempre < durationWeeks de esa fase. order: reasigna secuencial (0,1,2…) dentro de cada semana.
- Puedes cambiar duraciones, nombres, orden de fases, tipos y la fecha de arranque SOLO si la instrucción lo pide o es consecuencia necesaria (p.ej. agregar una semana de tareas a una fase de 1 semana → durationWeeks 2).
- activityType ∈ EXPLORACION|PLANIFICACION|CONFIGURACION|ADOPCION|SEGUIMIENTO o null.
- anchorStartDate: inclúyelo SOLO si la instrucción pide cambiar la fecha de arranque (ISO). Si no, omítelo.
- TODO el texto (títulos y notas de tareas, nombres y notas de fases) es DE CARA AL CLIENTE: claro, profesional, sin nombres del equipo interno de Smarteam, sin instrucciones operativas internas, sin jerga. Los textos existentes que no toques se conservan tal cual.
- ESTILO (OBLIGATORIO): español con TUTEO neutro (segunda persona con "tú"): "Transforma", "centraliza", "tienes", "puedes". PROHIBIDO el voseo: NUNCA "Transformá", "centralizá", "tenés", "querés", "podés" ni "vos".
- Si la instrucción es ambigua, interpreta lo más razonable y conservador.`;

/** Una consecuencia de las reglas que el CSE tiene que saber ANTES de pedir el cambio. */
export interface AdvertenciaDeCapacidad {
  /** Palabra clave por la que se reconoce el pedido. Minúsculas, sin tildes. */
  gatillo: readonly string[];
  /** Qué le pasa a su cronograma si lo pide igual. Redactado para una persona, en voseo. */
  aviso: string;
}

/**
 * Lo que un pedido razonable produce y el CSE no espera. No son prohibiciones —el modificador
 * las hace igual— son CONSECUENCIAS que hoy se descubren después de aplicar.
 *
 * ⚠ Esto es lo único de este archivo redactado para una PERSONA. Es la materia prima de la
 * respuesta «eso se puede, pero mirá lo que te va a costar» que Elías pidió.
 */
export const ADVERTENCIAS_DEL_CRONOGRAMA: readonly AdvertenciaDeCapacidad[] = [
  {
    gatillo: ["mover", "mové", "mueve", "pasar", "pasá", "cambiar de fase", "a otra fase"],
    aviso:
      "Mover una tarea a otra fase la RECREA: pierde su estado (si estaba hecha o en curso) y " +
      "cualquier fecha propia que le hayas puesto. El cronograma no sabe mudar una tarea, la " +
      "borra de un lado y la crea del otro.",
  },
  {
    gatillo: ["borrar", "borrá", "eliminar", "eliminá", "sacar", "sacá", "quitar", "quitá"],
    aviso:
      "Si la tarea tiene trabajo encima (hecha, en curso, suspendida, o la escribiste vos), el " +
      "servidor la RESCATA y la deja igual, aunque la IA la haya sacado. Para borrarla de verdad, " +
      "pedilo explícitamente — y aun así te va a avisar.",
  },
  {
    gatillo: ["fecha", "arranque", "arranca", "empieza", "inicio"],
    aviso:
      "Cambiar la fecha de arranque REDEFINE todas las fechas del cronograma, no solo la primera: " +
      "las semanas de cada fase se cuentan desde ahí.",
  },
  {
    gatillo: ["semana", "semanas", "alargar", "alargá", "acortar", "acortá", "duracion", "duración"],
    aviso:
      "Alargar o acortar una fase corre la fecha de cierre del proyecto. Si el cronograma ya está " +
      "publicado, el cliente lo va a ver recién cuando lo vuelvas a subir.",
  },
];

/**
 * Las advertencias que aplican a una instrucción en lenguaje natural.
 * Determinista y sin modelo: es un filtro por palabras, no una interpretación.
 */
export function advertenciasParaLaInstruccion(
  instruccion: string,
): readonly AdvertenciaDeCapacidad[] {
  const texto = instruccion
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return ADVERTENCIAS_DEL_CRONOGRAMA.filter((a) =>
    a.gatillo.some((g) => texto.includes(g.normalize("NFD").replace(/[̀-ͯ]/g, ""))),
  );
}
