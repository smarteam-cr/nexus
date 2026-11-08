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

/** Lo que Nexus necesita saber para armar la próxima guía (`propuesta.preguntasParaLaGuia`). */
export interface PreguntasParaLaGuia {
  preguntas: string[];
  en: string;
  corridaId: string | null;
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
 */
export function conLoDeLaExploracion<P extends ConLoDeLaExploracion>(
  p: P,
  dejo: LoQueDejoLaGuia,
  o: { confirmado: string | null | undefined; en: string; corridaId: string | null },
): P {
  const descartado = (t: string) => (p.ajustesDescartados ?? []).some((d) => mismoTexto(d, t));
  const ajusteNuevo = dejo.ajuste && !mismoTexto(dejo.ajuste.texto, o.confirmado) && !descartado(dejo.ajuste.texto) ? dejo.ajuste : null;
  return {
    ...p,
    ...(dejo.hallazgos.length ? { hallazgos: { lista: dejo.hallazgos.slice(0, MAX_HALLAZGOS), en: o.en, corridaId: o.corridaId } } : {}),
    ...(ajusteNuevo ? { ajusteDelObjetivo: { texto: ajusteNuevo.texto, porque: ajusteNuevo.porque, en: o.en, corridaId: o.corridaId } } : {}),
    preguntasParaLaGuia: dejo.preguntas.length ? { preguntas: dejo.preguntas.slice(0, MAX_PREGUNTAS_PARA_LA_GUIA), en: o.en, corridaId: o.corridaId } : null,
  };
}
