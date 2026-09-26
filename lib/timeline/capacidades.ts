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
 * Por eso el contexto del chat del cronograma SIN propuesta abierta (`lib/asistente/contexto.ts`) las
 * INTERPOLA de acá en vez de transcribirlas, y hay una guarda que lo hace cumplir
 * (capacidades.test.ts). E4 (2026-09): el prompt del modificador («Pedir cambio con IA»), que también
 * las interpolaba, se retiró con él; el texto no se recortó (recortarlo cambia lo que lee el modelo y
 * se mide antes con `probar-asistente`). Revisión de E4 (#7): lo que decía de BORRAR sí se reescribió,
 * porque le prometía al CSE un rescate que el chat no hace (falta medirlo con `probar-asistente`).
 */

/**
 * Las reglas duras del cronograma. Nacieron para el modificador que reescribía el cronograma entero
 * (retirado en E4); hoy las lee el chat, tal cual, para explicar qué se puede pedir.
 *
 * ⚠ El texto está redactado PARA UN MODELO (segunda persona, imperativo). Si algún día una
 * pantalla necesita mostrárselo a una persona, la traducción va aparte — reescribir esto para que
 * «se lea mejor» le cambia las instrucciones al agente sin que nadie lo note.
 */
export const REGLAS_DURAS_DEL_CRONOGRAMA = `- Conserva los ids EXACTOS de las fases y tareas que siguen existiendo (las edites o no). Elementos NUEVOS van sin id. Para BORRAR algo, simplemente omítelo del resultado.
- Si mueves una tarea a OTRA fase: en la fase destino va SIN id (es nueva ahí) y en la fase origen desaparece.
- Cada tarea trae "status" y "source". Las que NO están en PENDING (DONE, IN_PROGRESS, SUSPENDED) o tienen source HUMAN ya tienen trabajo real encima: consérvalas SIEMPRE con su id, aunque la instrucción reorganice la fase. NO las omitas: omitir es borrar. Tampoco se quitan desde el chat aunque la instrucción lo pida: se quitan a mano en el Gantt.
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
  /** Qué le pasa a su cronograma si lo pide igual. Redactado para una persona, en TUTEO neutro. */
  aviso: string;
}

/** Cambiar el arranque: vale igual con o sin una propuesta abierta (las dos listas la comparten). */
const ADVERTENCIA_DEL_ARRANQUE: AdvertenciaDeCapacidad = {
  gatillo: ["fecha", "arranque", "arranca", "empieza", "inicio"],
  aviso:
    "Cambiar la fecha de arranque REDEFINE todas las fechas del cronograma, no solo la primera: " +
    "las semanas de cada fase se cuentan desde ahí.",
};

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
      "cualquier fecha propia que le hayas puesto. El cronograma no sabe mudar una tarea: la " +
      "borra de un lado y la crea del otro.",
  },
  {
    gatillo: ["borrar", "borrá", "eliminar", "eliminá", "sacar", "sacá", "quitar", "quitá"],
    /* Revisión de E4 (#7): decía que el servidor «RESCATA» la tarea y que se pidiera «explícitamente» para
       borrarla. Eso valía solo en «Pedir cambio con IA» (retirado): el chat rechaza borrar una tarea
       protegida (`motivoDeTareaProtegida`, operaciones.ts) y `fase.borrar` sin propuesta borra todo. */
    aviso:
      "Una tarea con avance (hecha, en curso o suspendida) o cargada a mano no se borra desde el chat: " +
      "se borra a mano en el Gantt. Quitar una fase sin propuesta abierta la borra con TODAS sus " +
      "tareas, también las hechas, y se confirma dos veces; con una propuesta abierta, lo que tiene " +
      "avance se queda.",
  },
  ADVERTENCIA_DEL_ARRANQUE,
  {
    gatillo: ["semana", "semanas", "alargar", "alargá", "acortar", "acortá", "duracion", "duración"],
    aviso:
      "Alargar o acortar una fase corre la fecha de cierre del proyecto. Si el cronograma ya está " +
      "publicado, el cliente lo verá recién cuando lo vuelvas a subir.",
  },
];

/**
 * E3: las consecuencias cuando lo que se pide edita la PROPUESTA abierta (no el cronograma). Cambian
 * dos respecto de las de arriba: mover una tarea la MUDA (conserva su estado) y quitar una fase deja
 * lo que tiene trabajo encima. Redactadas para una persona, en tuteo neutro, igual que las de arriba.
 */
export const ADVERTENCIAS_SOBRE_LA_PROPUESTA: readonly AdvertenciaDeCapacidad[] = [
  {
    gatillo: ["mover", "mové", "mueve", "pasar", "pasá", "cambiar de fase", "a otra fase"],
    aviso:
      "Con la propuesta abierta, mover una tarea a otra fase la MUDA: conserva su estado y las " +
      "fechas que le hayas puesto. El cambio se ve en la propuesta hasta que la apliques.",
  },
  {
    gatillo: ["borrar", "borrá", "eliminar", "eliminá", "sacar", "sacá", "quitar", "quitá"],
    aviso:
      "Quitar una fase en la propuesta deja lo que tiene avance o se cargó a mano, y la fase se " +
      "queda con eso. Quitar una tarea solo quita las pendientes.",
  },
  {
    gatillo: ["semana", "semanas", "alargar", "alargá", "acortar", "acortá", "duracion", "duración"],
    aviso:
      "Alargar o acortar una fase corre la fecha de cierre cuando apliques la propuesta, y sus " +
      "tareas se acomodan a las semanas que quedan.",
  },
  {
    gatillo: ["aplicala", "aplicar", "aplica la"],
    aviso:
      "Aplicar escribe la propuesta ENTERA en el cronograma, de una sola vez: todo lo marcado. Lo " +
      "que dejaste como estaba se descarta con ella.",
  },
  ADVERTENCIA_DEL_ARRANQUE,
];

/**
 * Las advertencias que aplican a una instrucción en lenguaje natural. `modo`: «vivo» (sin propuesta,
 * lo que se acuerda se escribe en el cronograma) o «propuesta» (edita la propuesta abierta, E3).
 * Determinista y sin modelo: es un filtro por palabras, no una interpretación.
 */
export function advertenciasParaLaInstruccion(
  instruccion: string,
  modo: "vivo" | "propuesta" = "vivo",
): readonly AdvertenciaDeCapacidad[] {
  const texto = instruccion
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const lista = modo === "propuesta" ? ADVERTENCIAS_SOBRE_LA_PROPUESTA : ADVERTENCIAS_DEL_CRONOGRAMA;
  return lista.filter((a) =>
    a.gatillo.some((g) => texto.includes(g.normalize("NFD").replace(/[̀-ͯ]/g, ""))),
  );
}
