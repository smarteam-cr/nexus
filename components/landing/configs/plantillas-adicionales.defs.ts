/**
 * components/landing/configs/plantillas-adicionales.defs.ts
 *
 * Las secciones y los templates de las PLANTILLAS que se suman a un tipo que ya existía (Elías, 30 oct: pocos artefactos; lo
 * que cambia es la plantilla). Viven aparte a propósito: el canon del documento de siempre (su canvas y su template) no
 * cambia, así que ningún documento existente gana una sección y generar con la plantilla de siempre manda lo mismo que antes.
 * Solo las toma una copia nueva, desde «Nuevo artefacto».
 *
 *   · Planificación: la campaña de marketing, cómo debería funcionar el marketing, y WhatsApp y agente.
 *   · Entrega: el informe de avance.
 */
import type { BCSectionDef } from "./business-case.defs";
import type { BcTemplateDef } from "./templates.defs";
import { NO_INVENTES, PROSA_DE_LA_PLANIFICACION, seccionDeTabla } from "./adopcion.defs";
import { PLANIFICACION_DEF_BY_KEY, PLANIFICACION_TEMPLATE } from "./planificacion.defs";
import { ENTREGA_DEF_BY_KEY, ENTREGA_TEMPLATE } from "./entrega.defs";

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

/** Un template de planificación con otras secciones. La portada y el cierre, los de siempre. */
function deLaPlanificacion(id: string, caseLabel: string, foco: string, keys: readonly string[]): BcTemplateDef {
  return {
    ...PLANIFICACION_TEMPLATE,
    id,
    caseLabel,
    agentIntro: `${PLANIFICACION_TEMPLATE.agentIntro}\n\n${foco} Escribe SOLO las secciones de tu formato.`,
    sections: keys.map((k) => PLANIFICACION_DEF_BY_KEY_CON_ADICIONALES[k]).filter((d): d is BCSectionDef => !!d),
  };
}

export const SECCIONES_DE_LA_CAMPANA = ["planificacion", "campana_objetivo", "campana_segmentos", "campana_piezas", "campana_presupuesto", "formularios", "automatizaciones", "campana_resultado", "cierre"] as const;
export const SECCIONES_DEL_MARKETING = ["planificacion", "definicion_procesos", "ciclo_vida_crm", "canales_entrada", "formularios", "automatizaciones", "informes", "cierre"] as const;
export const SECCIONES_DE_WHATSAPP = ["planificacion", "agente_objetivo", "agente_identidad", "agente_conocimiento", "conversaciones", "agente_derivacion", "whatsapp_plantillas", "agente_fases", "cierre"] as const;

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

/** Las secciones propias del informe de avance (catálogo n.º 15): lo que la entrega no tiene porque solo existe al cerrar. */
export const ENTREGA_DEFS_ADICIONALES: BCSectionDef[] = [
  seccionDeTabla({
    key: "avance_por_frente",
    label: "El avance por frente",
    eyebrow: "En este período",
    columnas: ["Frente", "Qué se avanzó", "Estado", "Qué sigue"],
    tip: "Lo avanzado en el período, por frente o por proyecto.",
    agentHint: "Una fila por frente, con lo avanzado en el período y lo que sigue.",
    brief: "EL AVANCE DEL PERÍODO: una fila por frente o proyecto. «Estado»: 'Al día', 'Con atraso' o 'Detenido'. El período sale del nombre del documento o de lo que pidió quien genera.",
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
];

export const ENTREGA_DEF_BY_KEY_CON_ADICIONALES: Record<string, BCSectionDef> = {
  ...ENTREGA_DEF_BY_KEY,
  ...Object.fromEntries(ENTREGA_DEFS_ADICIONALES.map((d) => [d.key, d])),
};

export const SECCIONES_DEL_INFORME_DE_AVANCE = ["portada", "resumen", "avance_por_frente", "logros", "riesgos_y_pendientes_del_cliente", "recomendaciones", "cierre"] as const;

export const INFORME_DE_AVANCE_TEMPLATE: BcTemplateDef = {
  ...ENTREGA_TEMPLATE,
  id: "informe_de_avance_v1",
  caseLabel: "Informe de avance",
  maxTokens: 10000,
  agentIntro:
    "ESTE NO ES EL CIERRE DEL PROYECTO: es un INFORME DE AVANCE periódico. El proyecto sigue abierto; cuenta lo avanzado en el período, lo logrado, lo que falta y lo que viene. Donde el texto de abajo hable de cierre, entiéndelo como este período.\n\n" +
    ENTREGA_TEMPLATE.agentIntro,
  sections: SECCIONES_DEL_INFORME_DE_AVANCE.map((k) => ENTREGA_DEF_BY_KEY_CON_ADICIONALES[k]).filter((d): d is BCSectionDef => !!d),
};
