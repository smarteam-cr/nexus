/**
 * components/landing/configs/adopcion.defs.ts
 *
 * Defs SERVER-SAFE (sin React) del PLAN DE ADOPCIÓN, el primer tipo de artefacto nuevo (etapa V6 de
 * docs/artefactos-plan.md, adelantada por Elías el 29 oct). Catálogo n.º 10 de docs/artefactos-sugeridos.md (11 cuentas):
 * que lo entregado se USE — qué se espera de cada rol, qué no se negocia, cómo se mide y cómo se suma el equipo. Es
 * distinto de la capacitación, que enseña: esto fija hábitos y los mide.
 *
 * No hay renderers nuevos: las tablas son la tabla genérica del motor (`tabla`, con sus columnas ya sembradas en
 * `empty`), las reglas son la grilla de tarjetas con ícono, la prosa es `kickoff_prose`, la portada es la del
 * requerimiento técnico y el cierre, el suyo. «Rutinas de adopción» y «Despliegue por olas» son las MISMAS defs de la
 * Planificación (prestadas, no copiadas: un renderer, un contrato de datos).
 *
 * Las tres plantillas (equipo comercial, organización por niveles, componente técnico) viven en lib/artefactos/tipos.ts.
 */
import type { BCSectionDef } from "./business-case.defs";
import type { BcTemplateDef } from "./templates.defs";
import { PLAN_DESPLIEGUE_DEF, PLANIFICACION_DEF_BY_KEY, PLANIFICACION_HANDOFF_KEYS, RUTINAS_ADOPCION_DEF } from "./planificacion.defs";
import { DESARROLLO_DEF_BY_KEY } from "./desarrollo.defs";
import { PROSA_EMPTY, PROSA_SCHEMA, TABLA_SCHEMA, TABLA_TYPE, TARJETAS_TYPE } from "@/lib/landing/catalogo-de-secciones";
import { heroTitleBrief } from "@/lib/landing/hero-title";

const asSchema = (s: unknown) => s as unknown as Record<string, unknown>;

/** El `empty` de una tabla con sus columnas ya sembradas: la persona y el agente solo escriben filas. */
export function tablaConColumnas(columnas: readonly string[], nota = ""): { intro: string; columnas: Array<{ titulo: string; alineacion: string }>; filas: never[]; nota: string } {
  return { intro: "", columnas: columnas.map((titulo) => ({ titulo, alineacion: "izquierda" })), filas: [], nota };
}

/** La regla de las tablas con columnas fijas, para el brief de cada una. */
export function reglaDeLasColumnas(columnas: readonly string[]): string {
  return (
    `Es una TABLA con estas columnas, en este orden: ${columnas.map((c) => `«${c}»`).join(" · ")}. ` +
    "Devuelve `columnas` con EXACTAMENTE esos títulos y en ese orden (no sumes, no quites, no renombres) y escribe `filas`: una por renglón, con `celdas` en el MISMO orden que las columnas. Celdas cortas: una celda no es un párrafo. "
  );
}

const HERO = DESARROLLO_DEF_BY_KEY["requerimiento"];
const CIERRE_DE_DESARROLLO = DESARROLLO_DEF_BY_KEY["cierre"];
export const PROSA_DE_LA_PLANIFICACION = RUTINAS_ADOPCION_DEF;

/** El cierre por defecto del plan de adopción. */
export const ADOPCION_CIERRE_DEFAULT = {
  eyebrow: "El siguiente paso",
  headline: "Que se vuelva costumbre",
  subhead: "Revisamos estos indicadores con tu equipo en cada seguimiento hasta que el uso se sostenga solo.",
  buttonLabel: "",
  buttonUrl: "",
  buttonTarget: "_blank",
} as const;

export const COLUMNAS_DE_COMPORTAMIENTOS = ["Rol", "Qué hace en HubSpot", "Cada cuánto"] as const;
export const COLUMNAS_DE_NIVELES = ["Grupo", "Quiénes", "Cuándo entra", "Con qué empieza"] as const;
export const COLUMNAS_DE_COMUNICACION = ["Mensaje", "A quién", "Canal", "Cuándo"] as const;
export const COLUMNAS_DE_MEDICION = ["Indicador", "Cómo se mide", "Umbral", "Quién lo mira"] as const;

export const NO_INVENTES =
  "No inventes cargos, personas, cifras ni umbrales que la fuente no respalde: lo que no esté confirmado va con `⚠️ Por validar`. Sin precios ni horas de Smarteam.";

export const COLUMNAS_DE_LA_ESTRUCTURA = ["Equipo", "Quién lo lidera", "Quiénes lo forman", "Qué cambia para ellos"] as const;
export const COLUMNAS_DEL_PLAN_POR_EQUIPO = ["Equipo", "Qué tiene que aprender", "Cómo", "Quién lo acompaña"] as const;
export const COLUMNAS_DE_LOS_ENTRENAMIENTOS = ["Sesión", "Para quién", "Qué se ve", "Duración"] as const;
export const COLUMNAS_DE_LOS_PILOTOS = ["Piloto", "Quién participa", "Qué se prueba", "Cómo se sabe que funcionó"] as const;

/** Una sección de tabla del motor, con sus columnas fijas (la usan los artefactos sin componentes propios). */
export function seccionDeTabla(o: {
  key: string;
  label: string;
  eyebrow: string;
  columnas: readonly string[];
  tip: string;
  agentHint: string;
  brief: string;
  theme?: "light" | "soft";
}): BCSectionDef {
  return {
    key: o.key,
    label: o.label,
    eyebrow: o.eyebrow,
    theme: o.theme ?? "light",
    sectionType: TABLA_TYPE,
    agentGenerated: true,
    empty: tablaConColumnas(o.columnas),
    tip: o.tip,
    agentHint: o.agentHint,
    brief: `${reglaDeLasColumnas(o.columnas)}${o.brief} ${NO_INVENTES}`,
    schema: asSchema(TABLA_SCHEMA),
  };
}

export const ADOPCION_SECTION_DEFS: BCSectionDef[] = [
  {
    ...HERO,
    key: "adopcion",
    label: "Plan de adopción",
    eyebrow: "Plan de adopción",
    agentHint: "Título del plan + una bajada de para quién es y qué hábito fija + chips de los equipos que entran.",
    brief:
      heroTitleBrief("Plan de adopción") +
      "Portada del plan de adopción. `headline`: patrón `Plan de adopción: [quién] usando HubSpot [para qué]` (ej. 'Plan de adopción: el equipo comercial registrando cada negocio en HubSpot'). `subhead`: UNA frase en lenguaje llano de qué cambia en el día a día cuando el plan funciona. `tags`: 2-5 chips de los equipos o hubs que entran ('Ventas', 'Gerencia', 'Sales Hub'). Fuente: lo vendido y las reuniones del proyecto. " +
      NO_INVENTES,
  },
  {
    key: "comportamientos",
    label: "Lo que se espera de cada rol",
    eyebrow: "Comportamientos",
    theme: "light",
    sectionType: TABLA_TYPE,
    agentGenerated: true,
    empty: tablaConColumnas(COLUMNAS_DE_COMPORTAMIENTOS),
    tip: "Una fila por rol: qué tiene que hacer en HubSpot y con qué frecuencia. Es lo que la gerencia revisa para saber si se usa.",
    agentHint: "Una fila por rol del cliente: la acción concreta en HubSpot y su frecuencia.",
    brief:
      reglaDeLasColumnas(COLUMNAS_DE_COMPORTAMIENTOS) +
      "Los COMPORTAMIENTOS ESPERADOS: una fila por rol que va a usar HubSpot (vendedor, líder, gerencia, servicio…). «Qué hace en HubSpot» es una acción observable ('Registra cada llamada en el contacto', 'Mueve el negocio de etapa el mismo día'), no una intención ('usa el CRM'). «Cada cuánto»: 'Cada interacción', 'Diario', 'Semanal'. `intro`: una frase de por qué estos hábitos importan para este cliente (opcional). 3 a 8 filas. " +
      NO_INVENTES,
    schema: asSchema(TABLA_SCHEMA),
  },
  {
    key: "reglas",
    label: "Lo que no se negocia",
    eyebrow: "Reglas de uso",
    theme: "soft",
    sectionType: TARJETAS_TYPE,
    agentGenerated: true,
    empty: PROSA_EMPTY,
    tip: "Las reglas que no se pueden romper: campos obligatorios, motivo de pérdida, registro de interacciones. Sin ellas el dato no sirve para medir.",
    agentHint: "3 a 6 reglas firmes: campos obligatorios, motivo de pérdida, registro de interacciones.",
    brief:
      "LAS REGLAS QUE NO SE PUEDEN ROMPER, como tarjetas. `items`: 3 a 6; `title` = la regla en pocas palabras ('Ningún negocio sin monto', 'Todo negocio perdido lleva su motivo', 'Cada reunión queda registrada'); `detail` = UNA línea con por qué importa o qué pasa si no se cumple. Prioriza las que habilitan un informe que el cliente pidió. `intro` opcional. " +
      NO_INVENTES,
    schema: asSchema(PROSA_SCHEMA),
  },
  {
    key: "niveles",
    label: "Quién entra y cuándo",
    eyebrow: "Por niveles",
    theme: "light",
    sectionType: TABLA_TYPE,
    agentGenerated: true,
    empty: tablaConColumnas(COLUMNAS_DE_NIVELES),
    tip: "Para una organización grande o por zonas: los grupos que se suman, en orden, y con qué empieza cada uno.",
    agentHint: "Una fila por grupo o zona, en el orden en que entran (dirección, líderes, representantes; zona 1 primero).",
    brief:
      reglaDeLasColumnas(COLUMNAS_DE_NIVELES) +
      "LOS NIVELES DE LA ORGANIZACIÓN y el orden en que se suman: una fila por grupo (dirección, líderes, representantes; o zona 1, zona 2…). «Quiénes»: el equipo o la cantidad de personas si la fuente la dice ('50 asesores de la zona 1'). «Cuándo entra»: el momento relativo ('Primero', 'Cuando la zona 1 sostenga el uso'), nunca una fecha. «Con qué empieza»: los módulos o el hábito inicial. Si la adopción no es por niveles, deja `filas` vacío: vacío es correcto. " +
      NO_INVENTES,
    schema: asSchema(TABLA_SCHEMA),
  },
  RUTINAS_ADOPCION_DEF,
  PLAN_DESPLIEGUE_DEF,
  {
    key: "comunicacion",
    label: "Cómo se lo contamos al equipo",
    eyebrow: "Plan de comunicación",
    theme: "soft",
    sectionType: TABLA_TYPE,
    agentGenerated: true,
    empty: tablaConColumnas(COLUMNAS_DE_COMUNICACION),
    tip: "Qué se le dice al equipo que va a usar HubSpot, quién lo dice y por dónde, para que nadie se sienta excluido.",
    agentHint: "Una fila por mensaje al equipo que opera: qué se dice, a quién, por qué canal y cuándo.",
    brief:
      reglaDeLasColumnas(COLUMNAS_DE_COMUNICACION) +
      "EL PLAN DE COMUNICACIÓN al equipo que va a operar: una fila por mensaje ('Por qué cambiamos a HubSpot', 'Qué se espera de ti desde el lunes', 'Dónde pedir ayuda'). «A quién»: el grupo. «Canal»: reunión, correo, WhatsApp, el canal que la fuente nombre. «Cuándo»: el momento relativo ('Antes de la capacitación', 'Al arrancar la ola 2'), sin fechas. 3 a 6 filas. " +
      NO_INVENTES,
    schema: asSchema(TABLA_SCHEMA),
  },
  {
    ...PROSA_DE_LA_PLANIFICACION,
    key: "administradores",
    label: "Quién administra el portal",
    eyebrow: "El traspaso",
    theme: "light",
    agentHint: "El traspaso a quien administra el portal del lado del cliente: qué queda a su cargo y cómo se le entrega.",
    brief:
      "EL TRASPASO A LOS ADMINISTRADORES del cliente (TI, Sistemas o quien quede a cargo del portal). `intro`: una frase de quién queda a cargo y desde cuándo (relativo, sin fechas). `items` (3-6): `title` = lo que pasa a su cargo ('Altas de usuarios', 'Cambios a los pipelines', 'Revisar los flujos que fallan'); `detail` = UNA línea con cómo se le entrega (una sesión, la guía, el acompañamiento) o el límite ('Los cambios a la integración se piden a Smarteam'). " +
      NO_INVENTES,
  },
  {
    ...PROSA_DE_LA_PLANIFICACION,
    key: "altas_bajas",
    label: "Altas y bajas de usuarios",
    eyebrow: "Protocolo",
    theme: "soft",
    agentHint: "Los pasos para dar de alta y de baja a una persona, y a quién se le reasignan sus registros.",
    brief:
      "EL PROTOCOLO DE ALTAS Y BAJAS. `intro`: una frase de quién lo pide y quién lo ejecuta. `items` (3-6), en orden: `title` = el paso ('Pedir el alta con el rol', 'Asignar equipo y permisos', 'Antes de la baja: reasignar contactos, negocios y tareas', 'Desactivar el usuario'); `detail` = UNA línea con el detalle (a quién se le reasignan los registros, quién lo aprueba). La reasignación antes de la baja es lo que más se olvida: no la dejes afuera. " +
      NO_INVENTES,
  },
  {
    ...PROSA_DE_LA_PLANIFICACION,
    key: "introduccion",
    label: "Por qué este plan",
    eyebrow: "Introducción",
    theme: "soft",
    agentHint: "Por qué se capacita y qué cambia para el equipo cuando el plan funciona.",
    brief: "LA INTRODUCCIÓN: `intro` con por qué este plan y qué cambia en el día a día del equipo. `items` (0-4): lo que se espera lograr. " + NO_INVENTES,
  },
  seccionDeTabla({
    key: "estructura_equipo",
    label: "La estructura del equipo",
    eyebrow: "Quiénes son",
    columnas: COLUMNAS_DE_LA_ESTRUCTURA,
    tip: "Los equipos que entran: quién los lidera y qué cambia para cada uno.",
    agentHint: "Una fila por equipo del cliente.",
    brief: "LA ESTRUCTURA DEL EQUIPO: una fila por equipo o área que entra al plan.",
  }),
  seccionDeTabla({
    key: "plan_por_equipo",
    label: "El plan por equipo",
    eyebrow: "Qué aprende cada uno",
    theme: "soft",
    columnas: COLUMNAS_DEL_PLAN_POR_EQUIPO,
    tip: "Qué tiene que aprender cada equipo, cómo y quién lo acompaña.",
    agentHint: "Una fila por equipo: lo que aprende, cómo y con quién.",
    brief: "EL PLAN POR EQUIPO: una fila por equipo. «Cómo»: sesión en vivo, HubSpot Academy, acompañamiento en el puesto.",
  }),
  seccionDeTabla({
    key: "entrenamientos",
    label: "Los entrenamientos",
    eyebrow: "Sesión por sesión",
    columnas: COLUMNAS_DE_LOS_ENTRENAMIENTOS,
    tip: "Cada sesión de capacitación: para quién, qué se ve y cuánto dura.",
    agentHint: "Una fila por sesión de capacitación.",
    brief: "LOS ENTRENAMIENTOS: una fila por sesión, en el orden en que se dan. Sin fechas: el calendario vive en el Cronograma.",
  }),
  seccionDeTabla({
    key: "pilotos",
    label: "Los pilotos",
    eyebrow: "Probar antes de extender",
    theme: "soft",
    columnas: COLUMNAS_DE_LOS_PILOTOS,
    tip: "Con quién se prueba primero, qué se prueba y cómo se decide extenderlo.",
    agentHint: "Una fila por piloto, si el plan los lleva.",
    brief: "LOS PILOTOS: una fila por piloto: con quién se prueba primero, qué se prueba y qué señal dice que se puede extender.",
  }),
  {
    key: "medicion",
    label: "Cómo medimos la adopción",
    eyebrow: "Indicadores",
    theme: "light",
    sectionType: TABLA_TYPE,
    agentGenerated: true,
    empty: tablaConColumnas(COLUMNAS_DE_MEDICION),
    tip: "Cómo se sabe que el plan funciona: el indicador, de dónde sale en HubSpot, el umbral y quién lo revisa.",
    agentHint: "Una fila por indicador de uso: cómo se mide en HubSpot, el umbral para darlo por adoptado y quién lo mira.",
    brief:
      reglaDeLasColumnas(COLUMNAS_DE_MEDICION) +
      "CÓMO SE MIDE LA ADOPCIÓN: una fila por indicador ('Negocios con actividad en los últimos 7 días', 'Negocios perdidos con motivo', 'Usuarios activos por semana'). «Cómo se mide»: de dónde sale en HubSpot (un informe, una propiedad, el registro de actividad). «Umbral»: el nivel que da el hábito por adoptado ('80% de los negocios'); si la fuente no lo dice, propónlo marcado `⚠️ Por validar`. «Quién lo mira»: el rol y la cadencia ('Gerente comercial, cada lunes'). 3 a 6 filas. " +
      NO_INVENTES,
    schema: asSchema(TABLA_SCHEMA),
  },
  {
    ...CIERRE_DE_DESARROLLO,
    label: "Cierre",
    eyebrow: "El siguiente paso",
    empty: ADOPCION_CIERRE_DEFAULT,
    brief: "Cierre curado por el equipo: titular + subtítulo + botón opcional (ej. el enlace al informe de adopción o a agendar el seguimiento).",
  },
];

export const ADOPCION_TEMPLATE: BcTemplateDef = {
  id: "adopcion_v1",
  caseLabel: "Plan de adopción",
  maxTokens: 12000,
  brandVoice: false, // documento de TRABAJO (se discute con el cliente), como la Planificación
  features: { useCaseChecklist: false },
  agentIntro:
    "Eres el consultor de adopción de Smarteam y escribes el PLAN DE ADOPCIÓN de un proyecto de HubSpot: lo que hace que lo implementado se USE todos los días. No es una capacitación (eso enseña): este plan fija hábitos y los mide. Dice qué se espera de cada rol, qué reglas no se rompen, quién entra y cuándo, cómo se le cuenta al equipo, quién administra el portal, cómo se dan altas y bajas, y cómo se sabe que funcionó.\n\n" +
    "TU FUENTE: lo vendido (el handoff, solo lo apto para el cliente), las reuniones del proyecto, los demás documentos del proyecto (el diagnóstico, la planificación) y lo que pidió quien genera. Lo que dicen otros documentos del proyecto pesa según su estado: lo «terminado» ya se acordó; lo «en construcción» todavía cambia.\n\n" +
    "DISCIPLINA ANTI-ALUCINACIÓN (dura): NUNCA inventes cargos, personas, cantidades, umbrales ni herramientas. Lo que no esté confirmado se escribe igual pero marcado con `⚠️ Por validar`. Si el contexto es delgado, el plan sale más corto: corto y cierto gana a largo e inventado. Sin fechas (el calendario vive en el Cronograma) y sin precios ni horas de Smarteam.\n\n" +
    "ESTE DOCUMENTO LO LEE EL CLIENTE: se le habla de tú, sin jerga interna, y nada de lo que Smarteam dice puertas adentro llega acá.\n\n" +
    "FORMATO: cada sección tiene su PROPIO shape (su `schema` y su guía) — NO es prosa libre. En las tablas, conserva las columnas que trae la sección, en su orden, y escribe solo las filas. Líneas cortas. Español, tuteo. Arrays vacíos donde no haya respaldo.",
  sections: ADOPCION_SECTION_DEFS,
};

/** Lookup key → def. */
export const ADOPCION_DEF_BY_KEY: Record<string, BCSectionDef> = Object.fromEntries(ADOPCION_SECTION_DEFS.map((d) => [d.key, d]));

/** El handoff que lee: el MISMO allowlist de la Planificación (documento que lee el cliente). */
export const ADOPCION_HANDOFF_KEYS = PLANIFICACION_HANDOFF_KEYS;
