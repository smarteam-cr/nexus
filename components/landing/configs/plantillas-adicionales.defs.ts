/**
 * components/landing/configs/plantillas-adicionales.defs.ts
 *
 * Las secciones y los templates de las PLANTILLAS que se suman a un tipo que ya existía (Elías, 30 oct: pocos artefactos; lo
 * que cambia es la plantilla). Viven aparte a propósito: el canon del documento de siempre (su canvas y su template) no
 * cambia, así que ningún documento existente gana una sección y generar con la plantilla de siempre manda lo mismo que antes.
 * Solo las toma una copia nueva, desde «Nuevo artefacto».
 *
 *   · Planificación: la campaña de marketing, cómo debería funcionar el marketing, y WhatsApp y agente.
 *   · Entrega: el informe de avance y el aprendizaje de un servicio recurrente.
 */
import type { BCSectionDef } from "./business-case.defs";
import type { BcTemplateDef } from "./templates.defs";
import { NO_INVENTES, PROSA_DE_LA_PLANIFICACION, seccionDeTabla } from "./adopcion.defs";
import { PLANIFICACION_DEF_BY_KEY, PLANIFICACION_TEMPLATE } from "./planificacion.defs";
import { ENTREGA_DEF_BY_KEY, ENTREGA_TEMPLATE } from "./entrega.defs";
import { SECCIONES_DE_LA_CAMPANA, SECCIONES_DE_WHATSAPP, SECCIONES_DEL_APRENDIZAJE, SECCIONES_DEL_INFORME_DE_AVANCE, SECCIONES_DEL_MARKETING } from "@/lib/artefactos/tipos";

const prosa = (o: { key: string; label: string; eyebrow: string; agentHint: string; brief: string }): BCSectionDef => ({
  ...PROSA_DE_LA_PLANIFICACION,
  ...o,
  theme: "soft",
  brief: `${o.brief} ${NO_INVENTES}`,
});

/** Las secciones de la campaña (catálogo n.º 8) y de WhatsApp y agente (n.º 12). */
export const PLANIFICACION_DEFS_ADICIONALES: BCSectionDef[] = [
  prosa({
    key: "campana_objetivo",
    label: "El objetivo de la campaña",
    eyebrow: "Para qué",
    agentHint: "La meta de la campaña en una frase y cómo se sabe que funcionó.",
    brief: "EL OBJETIVO: `intro` con la meta de la campaña, en una frase. `items` (1-3): `title` = la meta; `detail` = el número o la señal que dice que se cumplió.",
  }),
  seccionDeTabla({
    key: "campana_segmentos",
    label: "A quién le llega",
    eyebrow: "Segmentos y exclusiones",
    columnas: ["Segmento", "Criterio en HubSpot", "Quién queda afuera"],
    tip: "El segmento, el criterio con que se arma la lista y las exclusiones.",
    agentHint: "Una fila por segmento, con su criterio y sus exclusiones.",
    brief: "LOS SEGMENTOS: una fila por segmento, con el criterio con que se arma la lista y quién queda excluido.",
  }),
  seccionDeTabla({
    key: "campana_piezas",
    label: "Las piezas y los canales",
    eyebrow: "Qué sale y por dónde",
    theme: "soft",
    columnas: ["Pieza", "Canal", "Cuándo sale", "Estado"],
    tip: "Cada pieza, por qué canal sale, cuándo y en qué estado está.",
    agentHint: "Una fila por pieza de la campaña.",
    brief: "LAS PIEZAS: una fila por pieza (correo, plantilla de WhatsApp, landing, anuncio). «Estado»: 'Por hacer', 'En revisión' o 'Lista'.",
  }),
  seccionDeTabla({
    key: "campana_presupuesto",
    label: "Presupuesto y fechas",
    eyebrow: "Con cuánto y cuándo",
    columnas: ["Concepto", "Monto", "Desde", "Hasta"],
    tip: "El presupuesto de la campaña y sus fechas. Solo lo que el cliente haya dicho.",
    agentHint: "Una fila por rubro, solo con números que la fuente diga.",
    brief: "EL PRESUPUESTO: solo montos y fechas que la fuente diga. Sin esos datos, deja `filas` vacío.",
  }),
  seccionDeTabla({
    key: "campana_resultado",
    label: "El resultado",
    eyebrow: "Contra la meta",
    theme: "soft",
    columnas: ["Indicador", "Meta", "Resultado", "Qué aprendimos"],
    tip: "Se llena al cerrar la campaña: el resultado contra la meta.",
    agentHint: "Una fila por indicador; el resultado solo si la campaña ya cerró.",
    brief: "EL RESULTADO contra la meta. Antes de cerrar la campaña, deja «Resultado» vacío.",
  }),
  prosa({
    key: "agente_objetivo",
    label: "Qué atiende el agente",
    eyebrow: "Objetivo e intenciones",
    agentHint: "Para qué es el agente y qué intenciones atiende.",
    brief: "EL OBJETIVO DEL AGENTE: `intro` con para qué existe. `items`: `title` = una intención que atiende ('Cotizar', 'Agendar test drive'); `detail` = cómo la resuelve.",
  }),
  prosa({
    key: "agente_identidad",
    label: "Identidad y tono",
    eyebrow: "Cómo habla",
    agentHint: "Cómo se presenta, cómo habla y qué no dice nunca.",
    brief: "LA IDENTIDAD: `items`: `title` = el rasgo ('Se presenta como Camila', 'Nunca promete precios'); `detail` = una línea con el ejemplo o el motivo.",
  }),
  seccionDeTabla({
    key: "agente_conocimiento",
    label: "La base de conocimiento",
    eyebrow: "De dónde responde",
    theme: "soft",
    columnas: ["Tema", "Fuente", "Quién la mantiene", "Estado"],
    tip: "De qué documentos o datos responde el agente, por línea de negocio.",
    agentHint: "Una fila por tema o línea de negocio.",
    brief: "LA BASE DE CONOCIMIENTO: una fila por tema o línea de negocio, de dónde sale y quién la mantiene al día.",
  }),
  seccionDeTabla({
    key: "agente_derivacion",
    label: "Derivación a una persona",
    eyebrow: "Cuándo pasa a humano",
    columnas: ["Cuándo", "A quién", "Horario", "Si no hay nadie"],
    tip: "Cuándo la conversación pasa a una persona, a quién y qué pasa fuera de horario.",
    agentHint: "Una fila por regla de derivación o de asignación.",
    brief: "LA DERIVACIÓN Y LA ASIGNACIÓN: una fila por regla. Incluye quién se queda la conversación y qué pasa fuera de horario.",
  }),
  seccionDeTabla({
    key: "whatsapp_plantillas",
    label: "Plantillas de mensajes",
    eyebrow: "Aprobadas por Meta",
    theme: "soft",
    columnas: ["Plantilla", "Para qué", "Idioma", "Estado de aprobación"],
    tip: "Las plantillas que hay que aprobar y en qué estado están.",
    agentHint: "Una fila por plantilla de mensaje.",
    brief: "LAS PLANTILLAS DE WHATSAPP: una fila por plantilla. «Estado de aprobación»: 'Por enviar', 'En revisión' o 'Aprobada'.",
  }),
  seccionDeTabla({
    key: "agente_fases",
    label: "Fases y créditos",
    eyebrow: "Por etapas",
    columnas: ["Fase", "Qué incluye", "Volumen esperado", "Créditos"],
    tip: "Qué entra en cada fase, el volumen esperado y los créditos que consume.",
    agentHint: "Una fila por fase; volumen y créditos solo si la fuente los da.",
    brief: "LAS FASES: una fila por fase. Volumen y créditos solo si la fuente los da.",
  }),
];

export const PLANIFICACION_DEF_BY_KEY_CON_ADICIONALES: Record<string, BCSectionDef> = {
  ...PLANIFICACION_DEF_BY_KEY,
  ...Object.fromEntries(PLANIFICACION_DEFS_ADICIONALES.map((d) => [d.key, d])),
};

/**
 * Lo que en la planificación completa llena el equipo y en una plantilla de marketing es el corazón del documento (Elías, 31
 * oct: una planificación de marketing no puede salir con los canales, los formularios y los informes en blanco). Curadas
 * allá por el tope de tokens de la corrida; estas plantillas son cortas y el motivo no aplica. El documento de siempre no
 * cambia: esto vive solo en estos templates, que solo usan las copias.
 */
const ESCRITAS_POR_EL_AGENTE: Readonly<Record<string, Pick<BCSectionDef, "agentHint" | "brief">>> = {
  canales_entrada: {
    agentHint: "Un canal por fila: de dónde llegan los contactos, quién los atiende y a dónde pasan.",
    brief: `POR DÓNDE ENTRAN LOS CONTACTOS: un canal por fila, solo los que salen en las fuentes (formulario, WhatsApp, redes, llamada, evento…). «responsable»: la persona o el rol que lo atiende; «atencion»: cómo se atiende, paso a paso; «pasaA»: a qué equipo pasa. ${NO_INVENTES}`,
  },
  formularios: {
    agentHint: "Un formulario por tarjeta: dónde vive, qué pide y qué pasa al enviarlo.",
    brief: `LOS FORMULARIOS: una tarjeta por formulario que salga en las fuentes. «donde»: en qué página o pieza vive; «campos»: lo que pide, con su etiqueta y si es obligatorio (deja «propiedadId» vacío); «alEnviar»: qué pasa después. ${NO_INVENTES}`,
  },
  informes: {
    agentHint: "Un indicador por fila: qué mide, cada cuánto y de qué área.",
    brief: `LO QUE SE VA A MEDIR: un indicador por fila, sacado de las metas y resultados de las fuentes. «mide»: qué número; «frecuencia»: cada cuánto se mira; «area»: de quién es; «objetivo»: el código del diagnóstico (OBJ-01…) si existe. ${NO_INVENTES}`,
  },
};

/** Un template de planificación con otras secciones. La portada y el cierre, los de siempre. */
function deLaPlanificacion(id: string, caseLabel: string, foco: string, keys: readonly string[]): BcTemplateDef {
  return {
    ...PLANIFICACION_TEMPLATE,
    id,
    caseLabel,
    agentIntro: `${PLANIFICACION_TEMPLATE.agentIntro}\n\n${foco} Escribe SOLO las secciones de tu formato.`,
    sections: keys
      .map((k) => PLANIFICACION_DEF_BY_KEY_CON_ADICIONALES[k])
      .filter((d): d is BCSectionDef => !!d)
      .map((d) => (ESCRITAS_POR_EL_AGENTE[d.key] ? { ...d, ...ESCRITAS_POR_EL_AGENTE[d.key], agentGenerated: true } : d)),
  };
}

export const PLANIFICACION_CAMPANA_TEMPLATE = deLaPlanificacion(
  "planificacion_campana_v1",
  "Campaña de marketing",
  "ESTA ES LA FICHA DE UNA CAMPAÑA: su objetivo, a quién le llega, las piezas, el presupuesto y el resultado. Una sola campaña, la que dice el nombre del documento.",
  SECCIONES_DE_LA_CAMPANA,
);
export const PLANIFICACION_MARKETING_TEMPLATE = deLaPlanificacion(
  "planificacion_marketing_v1",
  "Cómo debería funcionar el marketing",
  "ESTA PLANIFICACIÓN ES SOLO DE MARKETING: cómo debería funcionar de punta a punta, por dónde entran los contactos, cómo se nutren y cómo se mide.",
  SECCIONES_DEL_MARKETING,
);
export const PLANIFICACION_WHATSAPP_TEMPLATE = deLaPlanificacion(
  "planificacion_whatsapp_v1",
  "WhatsApp y agente",
  "ESTA PLANIFICACIÓN ES DE WHATSAPP Y SU AGENTE: qué atiende, cómo habla, de dónde responde, cuándo pasa a una persona, las plantillas y las fases.",
  SECCIONES_DE_WHATSAPP,
);

/** El cierre de un informe de avance y de un aprendizaje: el trabajo sigue, así que no puede decir que terminó (el de la Entrega lo dice). */
export const CIERRE_DEL_INFORME_DE_AVANCE = {
  eyebrow: "Lo que sigue",
  headline: "Así vamos, y esto es lo que viene",
  subhead: "Tu equipo de Smarteam sigue trabajando contigo. Cualquier duda sobre este documento, escríbenos.",
  buttonLabel: "",
  buttonUrl: "",
  buttonTarget: "_blank",
};

/** Las secciones propias del informe de avance (catálogo n.º 15): lo que la entrega no tiene porque solo existe al cerrar. */
export const ENTREGA_DEFS_ADICIONALES: BCSectionDef[] = [
  seccionDeTabla({
    key: "avance_por_frente",
    label: "El avance por frente",
    eyebrow: "En este período",
    columnas: ["Frente", "Qué se avanzó", "Estado", "Qué sigue"],
    tip: "Lo avanzado en el período, por frente o por proyecto.",
    agentHint: "Una fila por frente, con lo avanzado en el período y lo que sigue.",
    brief: "EL AVANCE DEL PERÍODO: una fila por frente o proyecto. «Estado»: 'Al día', 'Con atraso' o 'Detenido', solo si la fuente lo dice; si no, `⚠️ Por validar`. El período sale del nombre del documento o de lo que pidió quien genera.",
  }),
  seccionDeTabla({
    key: "logros_del_periodo",
    label: "Lo logrado",
    eyebrow: "El valor de este período",
    theme: "soft",
    columnas: ["Qué se logró", "Qué cambia para ti", "De dónde sale"],
    tip: "Lo logrado en el período y qué cambia para el cliente, solo con lo que la fuente respalde.",
    agentHint: "Una fila por logro respaldado por una reunión o un documento.",
    brief: "LO LOGRADO EN EL PERÍODO: una fila por logro, en lenguaje del cliente. «De dónde sale»: la reunión o el documento que lo respalda. Sin respaldo, no va.",
  }),
  seccionDeTabla({
    key: "riesgos_y_pendientes_del_cliente",
    label: "Riesgos y lo que falta de tu lado",
    eyebrow: "Para no detenernos",
    theme: "soft",
    columnas: ["Qué", "Por qué importa", "Quién", "Para cuándo"],
    tip: "Los riesgos y lo que debe el cliente o un tercero.",
    agentHint: "Una fila por riesgo o por lo que falta que entreguen.",
    brief: "LOS RIESGOS Y LO QUE FALTA: una fila por cada uno. Sin culpar a nadie: qué falta y qué pasa si no llega.",
  }),
  seccionDeTabla({
    key: "resultados_medidos",
    label: "Lo que se midió",
    eyebrow: "El resultado",
    columnas: ["Qué se buscaba", "Qué pasó", "De dónde sale"],
    tip: "Lo que se buscaba y lo que pasó, solo con lo que la fuente respalde.",
    agentHint: "Una fila por resultado respaldado por una reunión o un documento.",
    brief: "LO QUE SE MIDIÓ: una fila por cosa que se buscaba. «Qué pasó»: el resultado con su número si la fuente lo trae; si no, `⚠️ Por validar`. «De dónde sale»: la reunión o el documento que lo respalda.",
  }),
  seccionDeTabla({
    key: "lo_que_aprendimos",
    label: "Lo que aprendimos",
    eyebrow: "Para la próxima",
    theme: "soft",
    columnas: ["Qué aprendimos", "Qué cambia desde ahora", "De dónde sale"],
    tip: "Lo que dejó el trabajo con el equipo del cliente y qué cambia desde ahora.",
    agentHint: "Una fila por aprendizaje dicho en una reunión o que salga de un documento.",
    brief: "LO QUE APRENDIMOS JUNTOS: una fila por aprendizaje, en lenguaje del cliente. Incluye lo que no funcionó, sin culpar a nadie. Sin respaldo en una reunión o un documento, no va.",
  }),
];

export const ENTREGA_DEF_BY_KEY_CON_ADICIONALES: Record<string, BCSectionDef> = {
  ...ENTREGA_DEF_BY_KEY,
  ...Object.fromEntries(ENTREGA_DEFS_ADICIONALES.map((d) => [d.key, d])),
};

export const INFORME_DE_AVANCE_TEMPLATE: BcTemplateDef = {
  ...ENTREGA_TEMPLATE,
  id: "informe_de_avance_v1",
  caseLabel: "Informe de avance",
  maxTokens: 10000,
  agentIntro:
    "Eres quien escribe el INFORME DE AVANCE que Smarteam le manda a su cliente mientras el proyecto sigue abierto. No es el cierre: cuenta lo avanzado en el período, lo logrado, lo que falta y lo que viene.\n\n" +
    "TU FUENTE: lo vendido (el handoff, solo lo apto para el cliente), las reuniones y notas de este documento, y los demás documentos del proyecto. Lo que dicen otros documentos pesa según su estado: lo «terminado» ya se acordó; lo «en construcción» todavía cambia.\n\n" +
    "DISCIPLINA: no inventes avances, cifras, fechas ni responsables. No tienes el cronograma: no afirmes que algo va a tiempo o atrasado si la fuente no lo dice; escribe `⚠️ Por validar`. Si la fuente es delgada, el informe sale más corto.\n\n" +
    "ESTE DOCUMENTO LO LEE EL CLIENTE: se le habla de tú, sin jerga interna.\n\n" +
    "FORMATO: cada sección tiene su propio shape. En las tablas, conserva las columnas que trae la sección, en su orden, y escribe solo las filas. Español, tuteo. Arrays vacíos donde no haya respaldo.",
  sections: SECCIONES_DEL_INFORME_DE_AVANCE.map((k) => ENTREGA_DEF_BY_KEY_CON_ADICIONALES[k]).filter((d): d is BCSectionDef => !!d),
};

export const APRENDIZAJE_TEMPLATE: BcTemplateDef = {
  ...ENTREGA_TEMPLATE,
  id: "aprendizaje_v1",
  caseLabel: "Aprendizaje",
  maxTokens: 10000,
  agentIntro:
    "Eres quien escribe el APRENDIZAJE que Smarteam comparte con su cliente en un servicio recurrente: qué se buscaba, qué pasó, qué aprendimos juntos y qué conviene hacer ahora. No es el cierre del proyecto: el servicio sigue.\n\n" +
    "TU FUENTE: el contexto del proyecto, las reuniones y notas de este documento, y los demás documentos del proyecto. Lo que dicen otros documentos pesa según su estado: lo «terminado» ya se acordó; lo «en construcción» todavía cambia.\n\n" +
    "DISCIPLINA: no inventes resultados, cifras, fechas ni responsables. Lo que no se pueda respaldar va como `⚠️ Por validar`. Si la fuente es delgada, el documento sale más corto.\n\n" +
    "ESTE DOCUMENTO LO LEE EL CLIENTE: se le habla de tú, sin jerga interna y sin contar vueltas ni ciclos.\n\n" +
    "FORMATO: cada sección tiene su propio shape. En las tablas, conserva las columnas que trae la sección, en su orden, y escribe solo las filas. Español, tuteo. Arrays vacíos donde no haya respaldo.",
  sections: SECCIONES_DEL_APRENDIZAJE.map((k) => ENTREGA_DEF_BY_KEY_CON_ADICIONALES[k]).filter((d): d is BCSectionDef => !!d),
};
