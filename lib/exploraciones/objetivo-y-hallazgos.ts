/**
 * lib/exploraciones/objetivo-y-hallazgos.ts — el objetivo de Smarteam, su ajuste para cada empresa, los hallazgos de la
 * exploración y lo que Nexus le pregunta al vendedor para armar la próxima guía (2026-11-08, tercera vuelta de Elías con
 * Centauro; DECISIONS «La exploración desde el vendedor»). PURO y client-safe.
 *
 *   · El OBJETIVO de toda exploración es el de Smarteam, fijo y general (`objetivoDeSmarteam`). Lo que cambia de una empresa
 *     a otra es un AJUSTE: lo propone Nexus desde cómo llegó el lead (como-llego.ts › `PISTA_DEL_AJUSTE`) y desde lo que
 *     dejaron las sesiones, y el vendedor lo usa o lo descarta. El confirmado vive en `contenido.contexto.objetivo` (el
 *     campo de siempre: lo que una exploración en curso ya confirmó pasa a leerse como su ajuste, sin migrar nada).
 *   · Los HALLAZGOS son lo más importante que se sabe hasta ahora, sumando todas las sesiones. Los escribe la misma llamada
 *     que arma la guía (una por guía armada) y se muestran arriba del Resumen. Sin ellos todavía, el Resumen muestra el
 *     resumen de cada sesión leída.
 *   · Si a Nexus le falta contexto para la próxima guía, deja de 1 a 3 PREGUNTAS cortas en su espacio; el vendedor las
 *     responde en una línea y la guía se rehace con esas respuestas, que mandan sobre las fuentes.
 * Todo vive en el Json de la exploración: sin SQL.
 */
import type { ClaveDeMarco } from "./marco";

/** El objetivo de Smarteam en toda exploración (Elías, 2026-11-08): lleva al diagnóstico, no a vender una implementación. */
export const OBJETIVO_DE_SMARTEAM =
  "Llevar a la empresa hacia el diagnóstico: ubicarla en la Escala de Rendimiento, entender su dolor, cómo está hoy y por qué está ahí.";
/** En la exploración de un proyecto el cliente ya compró: la misma idea, antes de planificar lo que se implementa. */
export const OBJETIVO_DE_SMARTEAM_EN_UN_PROYECTO =
  "Llevar la cuenta hacia el diagnóstico: ubicarla en la Escala de Rendimiento, entender su dolor, cómo está hoy y por qué está ahí, antes de planificar lo que se implementa.";

export function objetivoDeSmarteam(marco: ClaveDeMarco): string {
  return marco === "cs" ? OBJETIVO_DE_SMARTEAM_EN_UN_PROYECTO : OBJETIVO_DE_SMARTEAM;
}

export const MAX_HALLAZGOS = 5;
export const MAX_LARGO_DEL_HALLAZGO = 300;
export const MAX_PORQUE_DEL_AJUSTE = 300;
export const MAX_PREGUNTAS_PARA_LA_GUIA = 3;
export const MAX_LARGO_DE_LA_PREGUNTA_PARA_LA_GUIA = 200;
export const MAX_RESPUESTA_PARA_LA_GUIA = 500;
/** Las respuestas probables de cada pregunta (2026-11-08, quinta vuelta): tres tarjetas y una cuarta para escribir. */
export const MAX_OPCIONES_DE_LA_PREGUNTA = 3;
/**
 * Sexta vuelta (2026-11-08, Elías vio preguntas que solo traían una caja de texto): una pregunta sin respuestas probables
 * no se guarda ni se muestra. Se le piden 3 a la IA; con 2 todavía se elige de un clic, así que esa no se pierde.
 */
export const MIN_OPCIONES_DE_LA_PREGUNTA = 2;
/**
 * Cómo se le piden a la IA las respuestas probables de cada pregunta: siempre 3 (sexta vuelta). La comparten la guía
 * (guia-pedido.ts › `faltaContexto`) y la lectura de la sesión (agente-pedido.ts › `preguntasParaLaSiguiente`).
 */
export const DESCRIPCION_DE_LAS_OPCIONES = `SIEMPRE exactamente ${MAX_OPCIONES_DE_LA_PREGUNTA} respuestas probables, distintas entre sí, para elegir de un clic (10 palabras como mucho cada una); quien lleva la sesión también puede escribir la suya. Solo lo que las fuentes permiten suponer: NUNCA un nombre, un cargo, una fecha ni una cifra que no esté en ellas. Si la pregunta es justo eso, opciones genéricas (por ejemplo «Con una sola persona», «Con todo el equipo», «Todavía no lo sé»). Una pregunta sin respuestas probables no se muestra.`;
export const MAX_LARGO_DE_LA_OPCION = 120;
/** Las respuestas que se guardan (las últimas): son contexto de la exploración entera, no de una sesión. */
export const MAX_RESPUESTAS_PARA_LA_GUIA = 12;

/** El ajuste al objetivo que propuso Nexus al armar una guía (`propuesta.ajusteDelObjetivo`). */
export interface AjusteDelObjetivo {
  texto: string;
  /** Por qué lo propone: el hallazgo o cómo llegó. */
  porque: string | null;
  en: string;
  corridaId: string | null;
}

/** Lo más importante que se sabe hasta ahora (`propuesta.hallazgos`). La última guía armada los reemplaza. */
export interface HallazgosDeLaExploracion {
  lista: string[];
  en: string;
  corridaId: string | null;
}

/**
 * Lo que Nexus necesita saber para armar la guía de UNA sesión (`propuesta.preguntasParaLaGuia`). Hay un solo lugar para
 * toda la exploración, pero las preguntas son de la sesión cuya guía las dejó (`sesionId`, sexta vuelta): solo se muestran
 * en esa sesión (`preguntasDeLaSesion`).
 */
export interface PreguntasParaLaGuia {
  preguntas: string[];
  /** Las respuestas probables de cada pregunta, en su mismo orden (quinta vuelta). Las de antes no las tienen. */
  opciones?: string[][];
  /** La sesión cuya guía las dejó (sexta vuelta, 2026-11-08). Las de antes no lo tienen y ya no se muestran. */
  sesionId?: string;
  en: string;
  corridaId: string | null;
}

/** Una pregunta de Nexus con sus respuestas probables, como se muestra: tarjetas en una fila y una cuarta para escribir. */
export interface PreguntaConOpciones {
  pregunta: string;
  opciones: string[];
}

/** Lo que respondió el vendedor (`contenido.respuestasParaLaGuia`): entra a cada guía como lo más confiable. */
export interface RespuestaParaLaGuia {
  pregunta: string;
  respuesta: string;
  por: string | null;
  en: string;
}

/** El ajuste que se muestra para usar o descartar, o null. De dónde sale cambia el texto de la tarjeta. */
export interface AjusteSugerido {
  texto: string;
  porque: string | null;
  de: "sesiones" | "llegada";
}

const normal = (t: string) => t.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * El ajuste que Nexus sugiere ahora: el de la última guía (sale de las sesiones) si dice algo distinto de lo confirmado; si
 * no hay y nada se confirmó todavía, el que propuso la primera lectura de la exploración (sale de cómo llegó y de lo que
 * Nexus ya sabía). Lo confirmado nunca se repite como sugerencia. PURO.
 */
export function ajusteSugerido(
  propuesta: { ajusteDelObjetivo?: AjusteDelObjetivo | null; contextoPropuesto?: { objetivo?: string | null } | null },
  confirmado: string | null | undefined,
): AjusteSugerido | null {
  const vigente = confirmado?.trim() ? normal(confirmado) : null;
  const a = propuesta.ajusteDelObjetivo;
  if (a?.texto.trim() && normal(a.texto) !== vigente) return { texto: a.texto, porque: a.porque, de: "sesiones" };
  const inicial = propuesta.contextoPropuesto?.objetivo?.trim();
  if (inicial && !vigente) return { texto: inicial, porque: null, de: "llegada" };
  return null;
}

/** Una sesión de la exploración, como la necesita el Resumen: su número y en qué está su reunión. */
export interface SesionParaElResumen {
  clave: string;
  numero: number;
  hecha: boolean;
  noSeHizo?: boolean;
  /** `estadoDeLaReunionDeLaSesion` (guia.ts). */
  estado: string;
  fecha: string | null;
}

/** Lo que el Resumen dice arriba: en qué va la exploración y el botón del momento. */
export interface MomentoDeLaExploracion {
  titulo: string;
  detalle: string | null;
  accion: { tipo: "analizar" | "preparar"; numero: number; clave: string } | null;
}

/** Las reuniones que ya pasaron y nadie leyó: se analizan antes de preparar la siguiente. */
const SIN_ANALIZAR = new Set(["sinLeer", "soloNotasSinLeer", "sinTexto", "esperando"]);

/**
 * En qué va la exploración y qué toca (Elías, 2026-11-08): «Analizar la sesión N» si la última que pasó no se leyó, o
 * «Preparar la sesión N» con la próxima. Archivada, sin botón. `diaCorto` da la fecha como la pantalla. PURO.
 */
export function momentoDeLaExploracion(
  sesiones: readonly SesionParaElResumen[],
  proxima: { clave: string; numero: number },
  o: { archivada: boolean; diaCorto: (iso: string) => string },
): MomentoDeLaExploracion {
  const pasadas = sesiones.filter((s) => s.hecha && !s.noSeHizo);
  const ultima = pasadas.length ? pasadas[pasadas.length - 1] : null;
  const fue = ultima?.fecha ? ` (fue el ${o.diaCorto(ultima.fecha)})` : "";
  if (o.archivada) {
    return { titulo: "Archivada", detalle: pasadas.length ? `Llegó a ${pasadas.length === 1 ? "una sesión" : `${pasadas.length} sesiones`}.` : null, accion: null };
  }
  if (ultima && SIN_ANALIZAR.has(ultima.estado)) {
    return {
      titulo: `Activa · la sesión ${ultima.numero} ya pasó y falta analizarla`,
      detalle:
        ultima.estado === "esperando"
          ? `Esperando la transcripción de la reunión${fue}.`
          : ultima.estado === "sinTexto"
            ? `La reunión terminó sin transcripción${fue}: súmale las notas para que Nexus la lea.`
            : `Nexus todavía no la leyó${fue}. Al leerla, sugiere el objetivo de la sesión ${proxima.numero}.`,
      accion: { tipo: "analizar", numero: ultima.numero, clave: ultima.clave },
    };
  }
  return {
    titulo: ultima ? `Activa · va por la sesión ${proxima.numero}` : "Activa · todavía no hubo sesiones",
    detalle: ultima ? `La última fue la sesión ${ultima.numero}${fue}.` : null,
    accion: { tipo: "preparar", numero: proxima.numero, clave: proxima.clave },
  };
}

/**
 * Los hallazgos que muestra el Resumen: los que escribió Nexus al armar la última guía o, sin ellos todavía, el resumen de
 * cada sesión leída, de la más reciente a la más vieja (hasta `MAX_HALLAZGOS`). PURO.
 */
export function hallazgosParaMostrar(
  hallazgos: HallazgosDeLaExploracion | null | undefined,
  leidas: readonly { numero: number; resumen: string }[],
): { lista: string[]; de: "nexus" | "sesiones"; en: string | null } {
  if (hallazgos?.lista.length) return { lista: hallazgos.lista.slice(0, MAX_HALLAZGOS), de: "nexus", en: hallazgos.en };
  const lista = [...leidas]
    .filter((l) => l.resumen.trim())
    .sort((a, b) => b.numero - a.numero)
    .slice(0, MAX_HALLAZGOS)
    .map((l) => `Sesión ${l.numero}: ${l.resumen.trim()}`);
  return { lista, de: "sesiones", en: null };
}

/**
 * Lo que se manda al responder las preguntas de Nexus (quinta vuelta): por pregunta, la tarjeta elegida o, si no eligió
 * ninguna, lo que escribió en «Otra respuesta…». Vacías no van. PURO.
 */
export function respuestasParaMandar(
  preguntas: readonly string[],
  elegidas: Readonly<Record<string, string>>,
  escritas: Readonly<Record<string, string>>,
): { pregunta: string; respuesta: string }[] {
  return preguntas
    .map((pregunta) => ({ pregunta, respuesta: (elegidas[pregunta] ?? escritas[pregunta] ?? "").trim().slice(0, MAX_RESPUESTA_PARA_LA_GUIA) }))
    .filter((r) => r.respuesta);
}

/** ¿Elegir esta respuesta completa todas las preguntas? Entonces se manda sola, sin otro clic. PURO. */
export function completaLasPreguntas(preguntas: readonly string[], elegidas: Readonly<Record<string, string>>): boolean {
  return preguntas.length > 0 && preguntas.every((q) => !!elegidas[q]?.trim());
}

/**
 * Junta cada pregunta con sus respuestas probables y deja solo las que traen al menos `MIN_OPCIONES_DE_LA_PREGUNTA`
 * (hasta `MAX_PREGUNTAS_PARA_LA_GUIA`, con hasta `MAX_OPCIONES_DE_LA_PREGUNTA` cada una). PURO.
 */
export function preguntasConOpciones(preguntas: readonly string[], opciones: readonly (readonly string[])[] | undefined): PreguntaConOpciones[] {
  return preguntas
    .map((pregunta, i) => ({ pregunta, opciones: (opciones?.[i] ?? []).filter((o) => !!o.trim()).slice(0, MAX_OPCIONES_DE_LA_PREGUNTA) }))
    .filter((x) => !!x.pregunta.trim() && x.opciones.length >= MIN_OPCIONES_DE_LA_PREGUNTA)
    .slice(0, MAX_PREGUNTAS_PARA_LA_GUIA);
}

/**
 * Lee de la respuesta de la IA una lista de `{ pregunta, opciones }`: sin repetidas (ni preguntas ni opciones), con sus
 * topes de largo, y solo las que traen respuestas probables (`preguntasConOpciones`). Tolera cualquier forma. PURO.
 */
export function leerPreguntasConOpciones(x: unknown): PreguntaConOpciones[] {
  const texto = (t: unknown, max: number) => (typeof t === "string" ? t.trim().replace(/\s+/g, " ").slice(0, max) : "");
  const vistas = new Set<string>();
  const leidas = (Array.isArray(x) ? x : []).flatMap((y) => {
    if (!y || typeof y !== "object") return [];
    const o = y as { pregunta?: unknown; opciones?: unknown };
    const pregunta = texto(o.pregunta, MAX_LARGO_DE_LA_PREGUNTA_PARA_LA_GUIA);
    if (!pregunta || vistas.has(normal(pregunta))) return [];
    vistas.add(normal(pregunta));
    const opciones: string[] = [];
    for (const t of Array.isArray(o.opciones) ? o.opciones : []) {
      const op = texto(t, MAX_LARGO_DE_LA_OPCION);
      if (op && !opciones.some((v) => normal(v) === normal(op))) opciones.push(op);
    }
    return [{ pregunta, opciones }];
  });
  return preguntasConOpciones(
    leidas.map((l) => l.pregunta),
    leidas.map((l) => l.opciones),
  );
}

/**
 * Las preguntas de Nexus que se muestran en una sesión (sexta vuelta, 2026-11-08). PURO.
 *   · Las que dejó la guía de ESTA sesión (`pedido.sesionId`). Las de otra sesión, o las de antes sin `sesionId`, no.
 *   · Si la sesión todavía no tiene guía propia, las que dejó la lectura de la sesión anterior para la siguiente (la misma
 *     llamada que sugiere su objetivo): así una sesión nueva también pregunta lo que Nexus necesita para armarla.
 *   · Nunca una sin respuestas probables, ni una que el equipo ya respondió.
 */
export function preguntasDeLaSesion(o: {
  pedido: PreguntasParaLaGuia | null | undefined;
  sesionId: string | null | undefined;
  conGuiaPropia: boolean;
  deLaLecturaAnterior?: readonly PreguntaConOpciones[];
  respondidas?: readonly { pregunta: string }[];
}): PreguntaConOpciones[] {
  if (!o.sesionId) return [];
  const respondida = (q: string) => (o.respondidas ?? []).some((r) => normal(r.pregunta) === normal(q));
  const propias = o.pedido?.sesionId === o.sesionId ? preguntasConOpciones(o.pedido.preguntas, o.pedido.opciones) : [];
  const deLaLectura = o.deLaLecturaAnterior ?? [];
  const lista =
    propias.length || o.conGuiaPropia
      ? propias
      : preguntasConOpciones(
          deLaLectura.map((x) => x.pregunta),
          deLaLectura.map((x) => x.opciones),
        );
  return lista.filter((x) => !respondida(x.pregunta));
}

/** Cuánto después de la última respuesta puede arrancar la guía para contar como «la que lanzaron las respuestas». */
export const VENTANA_DE_LA_GUIA_DE_LAS_RESPUESTAS_MS = 2 * 60_000;

/**
 * ¿La corrida de la guía que arrancó en `empezo` la lanzaron las respuestas del vendedor? Sí si arrancó poco después de la
 * última respuesta guardada (las dos fechas son del servidor). Sexta vuelta: el texto «Rehaciendo la guía con tus
 * respuestas…» salía con cualquier corrida, también con la guía que se armó al aceptar el objetivo. PURO.
 */
export function vieneDeLasRespuestas(empezo: string | null | undefined, respuestas: readonly { en: string }[]): boolean {
  const inicio = empezo ? Date.parse(empezo) : NaN;
  if (Number.isNaN(inicio)) return false;
  const ultima = Math.max(...respuestas.map((r) => Date.parse(r.en)).filter((t) => !Number.isNaN(t)), -Infinity);
  const desde = inicio - ultima;
  return desde >= -5_000 && desde <= VENTANA_DE_LA_GUIA_DE_LAS_RESPUESTAS_MS;
}

/** Las respuestas nuevas se suman a las de antes; una pregunta ya respondida se reemplaza. Las últimas `MAX_RESPUESTAS_PARA_LA_GUIA`. PURO. */
export function sumarRespuestas(antes: readonly RespuestaParaLaGuia[], nuevas: readonly RespuestaParaLaGuia[]): RespuestaParaLaGuia[] {
  const otras = antes.filter((a) => !nuevas.some((n) => normal(n.pregunta) === normal(a.pregunta)));
  return [...otras, ...nuevas].slice(-MAX_RESPUESTAS_PARA_LA_GUIA);
}

/**
 * El objetivo de la sesión lo decide el vendedor (Elías, 2026-11-08, cuarta vuelta): la lectura de la sesión anterior lo
 * deja SUGERIDO y la guía no se arma hasta que el vendedor lo acepta o lo edita (`SesionPlaneada.objetivo`). Es su
 * oportunidad de decirle a Nexus cómo estructurar la sesión: el pedido lo pone como la instrucción de más peso.
 */
export function objetivoAceptado(objetivo: string | null | undefined): boolean {
  return !!objetivo?.trim();
}
export const FALTA_EL_OBJETIVO_DE_LA_SESION = "Antes de armar la guía, acepta o escribe el objetivo de la sesión: es lo que más pesa al armarla.";

/** Cuántos ajustes descartados se recuerdan (`propuesta.ajustesDescartados`): no se vuelven a sugerir. */
export const MAX_AJUSTES_DESCARTADOS = 20;

/** ¿Dos textos dicen lo mismo, sin mirar mayúsculas ni espacios? PURO. */
export function mismoTexto(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a?.trim() && !!b?.trim() && normal(a) === normal(b);
}

/** Lo que la llamada de la guía dijo de la exploración entera (guia-pedido.ts › `leerLoDeLaExploracion`). */
export interface LoQueDejoLaGuia {
  hallazgos: string[];
  ajuste: { texto: string; porque: string | null } | null;
  preguntas: string[];
  /** Las respuestas probables de cada pregunta, en su mismo orden. */
  opciones?: string[][];
}

type ConLoDeLaExploracion = {
  ajusteDelObjetivo?: AjusteDelObjetivo | null;
  hallazgos?: HallazgosDeLaExploracion | null;
  preguntasParaLaGuia?: PreguntasParaLaGuia | null;
  ajustesDescartados?: string[];
};

/**
 * Suma a lo propuesto lo que dejó la llamada de la guía (2026-11-08). PURO: lo usa `guardarGuia` con la fila bloqueada.
 *   · Los hallazgos nuevos reemplazan a los de antes; sin ninguno, quedan los de antes.
 *   · El ajuste se guarda solo si no es el confirmado ni uno que el vendedor descartó; si no, queda el que había.
 *   · Lo que falta saber reemplaza lo de antes: sin preguntas, no queda ninguna (la guía nueva ya no las necesita).
 *     Sexta vuelta: quedan con la sesión de la guía (`sesionId`; sin sesión no se guardan), solo las que traen respuestas
 *     probables y sin las que el equipo respondió mientras la guía se armaba (`respondidas`).
 */
export function conLoDeLaExploracion<P extends ConLoDeLaExploracion>(
  p: P,
  dejo: LoQueDejoLaGuia,
  o: { confirmado: string | null | undefined; en: string; corridaId: string | null; sesionId: string | null; respondidas?: readonly { pregunta: string }[] },
): P {
  const descartado = (t: string) => (p.ajustesDescartados ?? []).some((d) => mismoTexto(d, t));
  const ajusteNuevo = dejo.ajuste && !mismoTexto(dejo.ajuste.texto, o.confirmado) && !descartado(dejo.ajuste.texto) ? dejo.ajuste : null;
  const respondida = (q: string) => (o.respondidas ?? []).some((r) => normal(r.pregunta) === normal(q));
  const quedan = o.sesionId ? preguntasConOpciones(dejo.preguntas, dejo.opciones).filter((x) => !respondida(x.pregunta)) : [];
  return {
    ...p,
    ...(dejo.hallazgos.length ? { hallazgos: { lista: dejo.hallazgos.slice(0, MAX_HALLAZGOS), en: o.en, corridaId: o.corridaId } } : {}),
    ...(ajusteNuevo ? { ajusteDelObjetivo: { texto: ajusteNuevo.texto, porque: ajusteNuevo.porque, en: o.en, corridaId: o.corridaId } } : {}),
    preguntasParaLaGuia:
      quedan.length && o.sesionId
        ? { preguntas: quedan.map((x) => x.pregunta), opciones: quedan.map((x) => x.opciones), sesionId: o.sesionId, en: o.en, corridaId: o.corridaId }
        : null,
  };
}
