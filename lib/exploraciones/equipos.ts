/**
 * lib/exploraciones/equipos.ts — con qué EQUIPO del cliente es una sesión, y qué se le pregunta a ese equipo. PURO.
 *
 * Feedback de Ventas del 22 oct (docs/preventa-por-area-plan.md). Andrés, preparando el diagnóstico de Cicadex: las
 * sesiones van por equipo (un día marketing, otro servicio al cliente, otro tecnología) y Nexus armaba la guía con la
 * empresa entera. Marco, con CEMACO: en una sesión de marketing se pregunta cómo está armado el departamento, qué roles
 * hay, cómo funciona cada canal, qué duele en cada uno y qué metas tienen y cómo las miden. La nota que Andrés pegó en la
 * preventa de Cicadex («Como debemos llevar las sesiones con los departamentos», 9 oct) es la fuente de los temas: una
 * hora (objetivos del área, proceso, dolor e impacto, futuro, validación) y cinco lentes (proceso, personas, tecnología,
 * datos, métricas), con un banco por área.
 *
 * Un equipo vive en la sesión (`SesionPlaneada.equipo`), no en la reunión: se elige antes de que la reunión exista.
 * Ventas, Marketing y Servicio son las áreas 1, 2 y 3 de la escala (lib/escala/areas-por-hub.ts); Dirección, Operaciones
 * y Tecnología no tienen área.
 *
 * Los temas de un equipo se escriben `<equipo>.<tema>` (`marketing.medicion`): van en el mismo campo `para` que las
 * tarjetas del marco (`metas`) y las dimensiones de la escala (`1.3`), así «En vivo», la lectura de la reunión, los
 * ajustes y el asistente los llevan sin otra estructura. `empresa.sistemas` es la pregunta de sistemas y datos de una
 * sesión sin equipo (cuando la conversación se puso técnica).
 */
import type { PasoDeLaPregunta } from "./plan-de-la-guia";

export const EQUIPOS_DEL_CLIENTE = ["direccion", "ventas", "marketing", "servicio", "operaciones", "tecnologia"] as const;
export type ClaveDeEquipo = (typeof EQUIPOS_DEL_CLIENTE)[number];

/** Lo que se le pregunta a un equipo, en el orden de la conversación. */
export const TEMAS_DEL_EQUIPO = ["prioridades", "estructura", "medicion", "proceso", "sistemas", "datos", "dolor"] as const;
export type TemaDelEquipo = (typeof TEMAS_DEL_EQUIPO)[number];

export interface DefinicionDelTema {
  tema: TemaDelEquipo;
  /** Cómo se nombra en pantalla, después del equipo: «Marketing · Cómo lo miden». */
  nombre: string;
  /** Qué tiene que salir sabiendo quien lleva la sesión (para el agente y para la pantalla). */
  busca: string;
  /** El paso de la siguiente pregunta lógica (plan-de-la-guia.ts). */
  paso: PasoDeLaPregunta;
  /** La pregunta de base, tuteando al cliente. */
  pregunta: string;
  repreguntas: readonly string[];
}

export interface DefinicionDelEquipo {
  clave: ClaveDeEquipo;
  nombre: string;
  /** El área de la escala del equipo (`1` Ventas, `2` Marketing, `3` Servicio), o null si la escala no lo mide. */
  area: "1" | "2" | "3" | null;
  /** Con quién suele ser la sesión, para elegirlo sin dudar. */
  quienes: string;
  /** Sus temas, en el orden de la conversación. */
  temas: readonly DefinicionDelTema[];
  /** Cuáles entran primero cuando no hay lugar para todos (lo que viene de antes ocupa lugar). */
  prioridad: readonly TemaDelEquipo[];
  /** La pregunta de cierre: cómo sería si funcionara (el «futuro ideal» de la nota de Andrés). */
  cierre: string;
}

const DIRECCION: DefinicionDelEquipo = {
  clave: "direccion",
  nombre: "Dirección",
  area: null,
  quienes: "Gerencia general, dueños o la persona que prioriza: valida la estrategia y decide qué va primero.",
  temas: [
    {
      tema: "prioridades",
      nombre: "Prioridades del negocio",
      busca: "las prioridades de los próximos 12 a 24 meses y dónde quieren crecer",
      paso: "situacion",
      pregunta: "¿Cuáles son las prioridades del negocio para los próximos 12 a 24 meses, y dónde quieren crecer?",
      repreguntas: ["¿Qué tendría que pasar este año para decir que fue un buen año?", "¿Qué frena hoy ese crecimiento?", "¿Qué parte del negocio te preocupa más?"],
    },
    {
      tema: "medicion",
      nombre: "Cómo mide el negocio",
      busca: "qué indicadores mira la dirección y cuáles no puede ver hoy",
      paso: "impacto",
      pregunta: "¿Qué números miras para saber cómo va el negocio, y cuáles te gustaría ver y hoy no puedes?",
      repreguntas: [
        "¿Qué pregunta del negocio debería poder responderse en 30 segundos?",
        "¿Cuánto tarda hoy armar ese número?",
        "¿Qué decisión tomarías distinto si lo tuvieras?",
      ],
    },
    {
      tema: "dolor",
      nombre: "Qué atacar primero",
      busca: "cuál de los problemas que se encontraron pesa más en ingresos, riesgo o experiencia, y cuál va primero",
      paso: "impacto",
      pregunta: "De lo que vimos con tus equipos, ¿qué problema le pega más a los ingresos y cuál atacarías primero?",
      repreguntas: ["¿Cuál genera más riesgo?", "¿Cuál afecta más la experiencia del cliente?", "¿Cuánto les cuesta, más o menos, no resolverlo este año?"],
    },
  ],
  prioridad: ["prioridades", "medicion", "dolor"],
  cierre: "Si dentro de un año la operación fuera mucho más madura, ¿qué podrían hacer que hoy no pueden?",
};

const VENTAS: DefinicionDelEquipo = {
  clave: "ventas",
  nombre: "Ventas",
  area: "1",
  quienes: "Gerentes comerciales, gerentes de marca o vendedores: cómo venden de verdad.",
  temas: [
    {
      tema: "estructura",
      nombre: "Cómo está armado",
      busca: "cuántas personas, qué roles, qué vende cada uno y cómo se reparten los clientes",
      paso: "situacion",
      pregunta: "¿Cómo está armado el equipo comercial: cuántas personas, qué rol tiene cada una y qué vende?",
      repreguntas: ["¿Quién compra y cómo llegan normalmente los clientes?", "¿Cómo se reparten los clientes o los contactos?", "¿Quién revisa cómo va cada vendedor?"],
    },
    {
      tema: "medicion",
      nombre: "Cómo lo miden",
      busca: "la meta del equipo en números, con qué se mide a cada vendedor y de dónde sale ese número",
      paso: "impacto",
      pregunta: "¿Qué meta tiene el equipo este año y con qué número mides a cada vendedor?",
      repreguntas: ["¿Cuánto es hoy ese número y cuánto debería ser?", "¿De dónde lo sacas y cuánto tarda armarlo?", "¿Cuánto dura, en promedio, una venta?"],
    },
    {
      tema: "proceso",
      nombre: "Cómo vende",
      busca: "el proceso de punta a punta: cómo empieza una oportunidad, sus etapas, qué se necesita para cotizar y el seguimiento",
      paso: "situacion",
      pregunta: "Muéstrame cómo gestionaste tu última venta, desde que apareció el cliente hasta que compró.",
      repreguntas: ["¿Qué etapas tiene la venta?", "¿Qué información necesitas antes de cotizar?", "¿Qué haces cuando alguien deja de responder?"],
    },
    {
      tema: "sistemas",
      nombre: "Sistemas y datos",
      busca: "en qué herramientas vive un negocio, qué datos del cliente se ven y cuáles se pasan a mano",
      paso: "situacion",
      pregunta: "¿En qué herramientas vive un negocio, desde el primer mensaje hasta la factura?",
      repreguntas: [
        "¿Qué datos del cliente necesitas ver y no tienes a mano?",
        "¿Qué pasas a mano de un sistema a otro?",
        "¿Cómo usan WhatsApp con los clientes y queda registro?",
      ],
    },
    {
      tema: "dolor",
      nombre: "Dónde se pierde",
      busca: "dónde se pierden oportunidades, cuántas y cuánto cuestan; qué tareas le quitan tiempo al vendedor",
      paso: "impacto",
      pregunta: "¿Dónde se les pierden más oportunidades y cuántas, más o menos, al mes?",
      repreguntas: ["¿Cuánto representa eso en ventas?", "¿Qué tareas administrativas te quitan más tiempo?", "¿Qué intentaron para evitarlo?"],
    },
  ],
  prioridad: ["medicion", "proceso", "dolor", "sistemas", "estructura"],
  cierre: "Si esto funcionara perfecto en seis meses, ¿qué tendría que hacer el CRM para facilitarte de verdad el trabajo?",
};

const MARKETING: DefinicionDelEquipo = {
  clave: "marketing",
  nombre: "Marketing",
  area: "2",
  quienes: "La líder de marketing, su equipo y las agencias: cómo generan demanda y cómo saben si funciona.",
  temas: [
    {
      tema: "estructura",
      nombre: "Cómo está armado",
      busca: "cuántas personas, qué hace cada una, con qué agencias trabajan y quién decide qué campaña sale",
      paso: "situacion",
      pregunta: "¿Cómo está armado hoy marketing: cuántas personas, qué hace cada una y con qué agencias trabajan?",
      repreguntas: ["¿Qué hace la agencia y qué hacen ustedes?", "¿Quién decide qué campaña sale y cuándo?", "¿Quién responde los mensajes que llegan de las campañas?"],
    },
    {
      tema: "medicion",
      nombre: "Cómo lo miden",
      busca: "las metas del área en números y con qué indicador miden a marketing (si puede ligar una campaña a una venta)",
      paso: "impacto",
      pregunta: "¿Cuáles son las tres metas de marketing este año y con qué número te miden?",
      repreguntas: [
        "¿Cuánto es hoy ese número y cuánto debería ser?",
        "¿Cada cuánto lo revisas y de dónde lo sacas?",
        "¿Puedes saber cuántas ventas salieron de una campaña?",
      ],
    },
    {
      tema: "proceso",
      nombre: "Cómo funciona cada canal",
      busca: "canal por canal: inversión, volumen, qué pasa después del clic, quién responde, conversión y atribución",
      paso: "situacion",
      pregunta: "Recórreme un canal: desde que alguien ve un anuncio hasta que compra, ¿qué pasa y quién interviene?",
      repreguntas: [
        "¿Qué canal te trae más contactos y cuánto inviertes en él al mes?",
        "¿Cómo sabes qué campaña originó una conversación?",
        "¿Qué pasa con quien preguntó y no compró?",
      ],
    },
    {
      tema: "sistemas",
      nombre: "Sistemas y datos",
      busca: "con qué herramientas hacen campañas, correos y mensajes, qué datos quedan en cada una y qué se cruza a mano",
      paso: "situacion",
      pregunta: "¿Con qué herramientas hacen las campañas, los correos y los mensajes, y qué datos quedan en cada una?",
      repreguntas: [
        "¿Qué datos de un contacto tienen y cuáles les faltan para segmentar?",
        "¿Qué tienen que pasar a mano de un sistema a otro?",
        "¿Cómo distinguen a un cliente nuevo de uno que ya compró?",
      ],
    },
    {
      tema: "dolor",
      nombre: "Qué duele en cada canal",
      busca: "en qué canal se pierde más gente o más tiempo, y cuánto cuesta",
      paso: "impacto",
      pregunta: "¿En qué canal se les pierde más gente hoy, y cuánto les cuesta?",
      repreguntas: [
        "¿Cuántos contactos al mes quedan sin seguimiento?",
        "¿Cuántas horas se van en armar listas o reportes?",
        "¿Cuánto representa eso en ventas, más o menos?",
      ],
    },
  ],
  prioridad: ["medicion", "proceso", "dolor", "sistemas", "estructura"],
  cierre: "Si marketing funcionara perfecto en seis meses, ¿qué sería distinto y qué número te gustaría poder mostrar?",
};

const SERVICIO: DefinicionDelEquipo = {
  clave: "servicio",
  nombre: "Servicio al cliente",
  area: "3",
  quienes: "Servicio al cliente, soporte o posventa: cómo atienden, qué casos reciben y qué recuperan.",
  temas: [
    {
      tema: "estructura",
      nombre: "Cómo está armado",
      busca: "cuántas personas, turnos, qué casos atiende cada una y por qué canales",
      paso: "situacion",
      pregunta: "¿Cómo está armado servicio al cliente: cuántas personas, en qué turnos y qué casos atiende cada una?",
      repreguntas: ["¿Por qué canales llegan los casos?", "¿Qué volumen manejan al mes?", "¿Quién decide cuándo un caso escala?"],
    },
    {
      tema: "medicion",
      nombre: "Cómo lo miden",
      busca: "con qué números miden el servicio (tiempo de respuesta, casos resueltos, satisfacción, lo que recuperan)",
      paso: "impacto",
      pregunta: "¿Con qué números miden hoy el servicio, y cuánto es cada uno?",
      repreguntas: ["¿Cuál es el tiempo de respuesta promedio?", "¿De dónde sacan esos números?", "¿Cuánto debería ser para que digas que va bien?"],
    },
    {
      tema: "proceso",
      nombre: "Cómo se atiende un caso",
      busca: "cómo entra un caso, quién lo toma, qué pasa hasta que se cierra y cómo detectan lo que quedó abandonado",
      paso: "situacion",
      pregunta: "¿Cómo entra un caso y qué pasa con él hasta que se cierra?",
      repreguntas: [
        "¿Cómo saben hoy que una conversación o una oportunidad quedó abandonada?",
        "¿Después de cuántos días la consideran enfriada?",
        "¿Qué excepciones se les complican?",
      ],
    },
    {
      tema: "sistemas",
      nombre: "Sistemas y datos",
      busca: "dónde queda registrado cada caso y qué ve quien atiende: qué compró, quién lo atendió, qué conversó antes",
      paso: "situacion",
      pregunta: "¿Dónde queda registrado cada caso, y qué ves del cliente cuando lo atiendes?",
      repreguntas: [
        "¿Puedes ver qué compró, quién lo atendió y qué conversó antes?",
        "¿Qué información suele faltar para resolverlo?",
        "¿Qué pasas a mano de un sistema a otro?",
      ],
    },
    {
      tema: "dolor",
      nombre: "Qué se pierde",
      busca: "qué casos se complican o se pierden, cuántos al mes, cuántos recuperan y cuánto vale eso",
      paso: "impacto",
      pregunta: "¿Qué casos se les complican o se pierden, y cuántos son al mes?",
      repreguntas: ["¿Cuántas oportunidades recuperan para ventas y cuántas terminan en venta?", "¿Cuánto tiempo se va en eso?", "¿Cuánto representa en plata?"],
    },
  ],
  prioridad: ["medicion", "proceso", "dolor", "sistemas", "estructura"],
  cierre: "Si el servicio funcionara perfecto en seis meses, ¿qué sería distinto para el cliente y para tu equipo?",
};

const OPERACIONES: DefinicionDelEquipo = {
  clave: "operaciones",
  nombre: "Operaciones",
  area: null,
  quienes: "Logística, entregas, bodega, devoluciones o administración: cómo se cumple lo que se vende.",
  temas: [
    {
      tema: "estructura",
      nombre: "Cómo está armado",
      busca: "quién coordina pedidos, entregas, devoluciones y cobros, y con qué proveedores",
      paso: "situacion",
      pregunta: "¿Cómo está armada la operación: quién coordina los pedidos, las entregas, las devoluciones y los cobros?",
      repreguntas: ["¿Con qué proveedores o centros de distribución trabajan?", "¿Quién responde cuando algo sale mal?", "¿Cuántas personas tocan un pedido?"],
    },
    {
      tema: "medicion",
      nombre: "Cómo lo miden",
      busca: "con qué números miden la operación: entregas a tiempo, devoluciones, errores, tiempos",
      paso: "impacto",
      pregunta: "¿Con qué números miden la operación hoy: entregas a tiempo, devoluciones, errores?",
      repreguntas: ["¿Cuánto es hoy cada uno?", "¿De dónde los sacan?", "¿Cuánto debería ser para que digas que va bien?"],
    },
    {
      tema: "proceso",
      nombre: "De la venta a la entrega",
      busca: "cómo pasa un pedido de la venta a la entrega (y una devolución), qué pasos son manuales y dónde se rompe",
      paso: "situacion",
      pregunta: "¿Cómo pasa un pedido desde la venta hasta la entrega, y qué pasos son a mano?",
      repreguntas: ["¿Cómo se hace una devolución o un reintegro?", "¿Qué excepciones existen?", "¿Dónde suele romperse el proceso?"],
    },
    {
      tema: "sistemas",
      nombre: "Sistemas y datos",
      busca: "en qué sistemas queda cada paso del pedido y qué se coordina por correo, hojas o papel",
      paso: "situacion",
      pregunta: "¿En qué sistemas queda cada paso del pedido, y qué se coordina por correo, hojas o papel?",
      repreguntas: ["¿Qué datos del pedido ve el equipo comercial?", "¿Qué se registra dos veces?", "¿Con qué dato identifican al cliente en cada paso?"],
    },
    {
      tema: "dolor",
      nombre: "Dónde se traba",
      busca: "dónde se traba la operación y cuánto cuesta en tiempo, errores o clientes",
      paso: "impacto",
      pregunta: "¿Dónde se traba hoy la operación, y cuánto les cuesta al mes en tiempo o en errores?",
      repreguntas: ["¿Cuántos pedidos al mes tienen algún problema?", "¿Cuántas horas se van en coordinar a mano?", "¿Qué le pasa al cliente cuando falla?"],
    },
  ],
  prioridad: ["proceso", "dolor", "sistemas", "medicion", "estructura"],
  cierre: "¿Qué tendría que pasar para que la operación no dependa de pasos a mano?",
};

const TECNOLOGIA: DefinicionDelEquipo = {
  clave: "tecnologia",
  nombre: "Tecnología",
  area: null,
  quienes: "TI, sistemas o el desarrollador del cliente: el mapa técnico, dónde vive cada dato y qué se integra.",
  temas: [
    {
      tema: "estructura",
      nombre: "Quién lleva los sistemas",
      busca: "quién mantiene los sistemas y las integraciones, y con qué proveedores",
      paso: "situacion",
      pregunta: "¿Quién lleva hoy los sistemas y las integraciones, y con qué proveedores trabajan?",
      repreguntas: ["¿Cuánto del trabajo hacen ustedes y cuánto un proveedor?", "¿Quién aprueba un cambio en un sistema?", "¿Qué tan rápido pueden sacar un cambio?"],
    },
    {
      tema: "proceso",
      nombre: "El mapa de sistemas",
      busca: "qué sistemas existen (ERP, POS, e-commerce, canales) y dónde vive cada dato: clientes, ventas, productos, conversaciones",
      paso: "situacion",
      pregunta: "¿Qué sistemas usan hoy, y dónde vive cada dato: clientes, ventas, productos y conversaciones?",
      repreguntas: ["¿Dónde están las compras históricas?", "¿Dónde quedan las conversaciones con el cliente?", "¿Qué sistema manda cuando dos dicen distinto?"],
    },
    {
      tema: "sistemas",
      nombre: "Integraciones",
      busca: "qué sistemas se hablan entre sí, cómo (API, archivos, a mano), cada cuánto y qué falla",
      paso: "situacion",
      pregunta: "¿Qué sistemas se hablan entre sí, de qué manera, y qué falla hoy en esas integraciones?",
      repreguntas: ["¿Tienen API o se pasa por archivos?", "¿Cada cuánto se sincronizan?", "¿Qué datos tendrían que ir a HubSpot y cuáles volver?"],
    },
    {
      tema: "datos",
      nombre: "Calidad de los datos",
      busca: "con qué identificador reconocen a un mismo cliente en todos los sistemas, qué campos existen y qué tan limpios están",
      paso: "situacion",
      pregunta: "¿Con qué dato reconocen a un mismo cliente en todos los sistemas, y qué tan limpio está?",
      repreguntas: ["¿Cuántos registros duplicados estiman que hay?", "¿Qué campos son obligatorios y cuáles llegan vacíos?", "¿Quién se encarga de depurarlos?"],
    },
    {
      tema: "dolor",
      nombre: "Qué se rompe",
      busca: "qué se rompe más seguido en datos o integraciones y cuánto tiempo o dinero cuesta",
      paso: "impacto",
      pregunta: "¿Qué se rompe más seguido en los datos o las integraciones, y cuánto tiempo les cuesta al mes?",
      repreguntas: ["¿Qué reporte no pueden armar por eso?", "¿Cuántas horas se van en corregir datos?", "¿Qué intentaron y no funcionó?"],
    },
  ],
  prioridad: ["proceso", "sistemas", "datos", "dolor", "estructura"],
  cierre: "Si los datos estuvieran donde los necesitas, ¿qué podrían hacer que hoy no pueden?",
};

export const EQUIPOS: Readonly<Record<ClaveDeEquipo, DefinicionDelEquipo>> = {
  direccion: DIRECCION,
  ventas: VENTAS,
  marketing: MARKETING,
  servicio: SERVICIO,
  operaciones: OPERACIONES,
  tecnologia: TECNOLOGIA,
};

export function esEquipo(x: unknown): x is ClaveDeEquipo {
  return typeof x === "string" && (EQUIPOS_DEL_CLIENTE as readonly string[]).includes(x);
}

/**
 * El área de la escala que se suma a las áreas en juego al elegir un equipo: la suya, si la escala la trae y todavía no
 * está. null si ya está, si el equipo no tiene área (Dirección, Operaciones, Tecnología) o si ya hay tres en juego.
 */
export function areaQueSuma(equipo: ClaveDeEquipo, enJuego: readonly string[], areasDeLaEscala: readonly { id: string }[]): string | null {
  const area = EQUIPOS[equipo].area;
  if (!area || enJuego.includes(area) || enJuego.length >= 3 || !areasDeLaEscala.some((a) => a.id === area)) return null;
  return area;
}

// ── Los temas como `para` ─────────────────────────────────────────────────────

/** La pregunta de sistemas y datos de una sesión sin equipo: entra cuando la conversación se puso técnica. */
export const TEMA_DE_SISTEMAS_DE_LA_EMPRESA = "empresa.sistemas";
const SISTEMAS_DE_LA_EMPRESA: DefinicionDelTema = {
  tema: "sistemas",
  nombre: "Sistemas y datos",
  busca: "qué sistemas usan, dónde vive cada dato, qué campos existen y qué tendría que conectarse con HubSpot",
  paso: "situacion",
  pregunta: "¿Qué sistemas usan hoy, y qué datos tendrían que conectarse con HubSpot: dónde vive cada uno y con qué campos?",
  repreguntas: ["¿Qué sistemas se hablan entre sí y cuáles no?", "¿Con qué dato reconocen a un mismo cliente?", "¿Qué pasan a mano de un sistema a otro?"],
};

/** El `para` de un tema de un equipo: `marketing.medicion`. */
export function temaDeEquipo(equipo: ClaveDeEquipo, tema: TemaDelEquipo): string {
  return `${equipo}.${tema}`;
}

/** Qué es un `para` de equipo: el equipo (null en `empresa.sistemas`) y la definición de su tema. null si no es de un equipo. */
export function leerTemaDeEquipo(para: string): { equipo: ClaveDeEquipo | null; definicion: DefinicionDelTema } | null {
  if (para === TEMA_DE_SISTEMAS_DE_LA_EMPRESA) return { equipo: null, definicion: SISTEMAS_DE_LA_EMPRESA };
  const m = /^([a-z]+)\.([a-z]+)$/.exec(para);
  if (!m || !esEquipo(m[1])) return null;
  const definicion = EQUIPOS[m[1]].temas.find((t) => t.tema === m[2]);
  return definicion ? { equipo: m[1], definicion } : null;
}

export function esTemaDeEquipo(para: string): boolean {
  return leerTemaDeEquipo(para) !== null;
}

/** «Marketing · Cómo lo miden» (o «Sistemas y datos» en una sesión sin equipo). null si no es un tema de equipo. */
export function nombreDelTemaDeEquipo(para: string, o: { conEquipo?: boolean } = {}): string | null {
  const t = leerTemaDeEquipo(para);
  if (!t) return null;
  return t.equipo && o.conEquipo !== false ? `${EQUIPOS[t.equipo].nombre} · ${t.definicion.nombre}` : t.definicion.nombre;
}

/** La letra de la etiqueta cuadrada de una pregunta del equipo: la inicial del equipo («M»), o «S» de sistemas. */
export function letraDelTemaDeEquipo(para: string): string {
  const t = leerTemaDeEquipo(para);
  if (!t) return "·";
  return t.equipo ? (t.equipo === "tecnologia" ? "TI" : EQUIPOS[t.equipo].nombre.charAt(0)) : "S";
}

// ── Sugerir el equipo de una sesión ───────────────────────────────────────────

const sinTildes = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

/**
 * Las palabras que delatan a cada equipo en el título o el objetivo de una sesión. Sin «marca» (los gerentes de marca
 * son Ventas, y «la marca» también es de Marketing) ni «datos» u «operación» sueltos (todo equipo habla de eso).
 */
const PALABRAS: Readonly<Record<ClaveDeEquipo, RegExp>> = {
  direccion: /\b(direccion|gerencia general|gerente general|ceo|junta directiva|duenos?|estrategia del negocio)\b/,
  ventas: /\b(ventas|comercial(es)?|sales hub|vendedor(es|as)?|gerentes? de marca|pipeline|cotizacion(es)?)\b/,
  marketing: /\b(marketing|mercadeo|marketing hub|pauta|campanas?|redes sociales|email marketing|agencias?)\b/,
  servicio: /\b(servicio al cliente|atencion al cliente|sac|soporte|service hub|postventa|posventa|tickets?)\b/,
  operaciones: /\b(operaciones|operativ[oa]s?|logistica|entregas?|bodega|inventarios?|despachos?|devoluciones|talleres?|anticipos?)\b/,
  // Sin «ti» (es «para ti») ni «desarrollo» suelto (el del negocio).
  tecnologia: /\b(tecnologia|sistemas|data hub|integracion(es)?|erp|api|arquitectura tecnica|desarrollo a la medida)\b/,
};

/** Los equipos que nombra un texto, en el orden de `EQUIPOS_DEL_CLIENTE`. */
export function equiposQueNombra(texto: string): ClaveDeEquipo[] {
  const t = sinTildes(texto);
  return EQUIPOS_DEL_CLIENTE.filter((e) => PALABRAS[e].test(t));
}

/**
 * El equipo que sugiere Nexus para una sesión: el primer texto (el objetivo, que escribió la persona para ESTA sesión,
 * antes que el título del calendario) que nombra UN solo equipo. Si un texto nombra dos («ventas y marketing»), no
 * decide: se mira el siguiente. null = no se sabe; nunca se guarda solo.
 */
export function sugerirEquipo(textos: readonly (string | null | undefined)[]): ClaveDeEquipo | null {
  for (const t of textos) {
    if (!t?.trim()) continue;
    const nombrados = equiposQueNombra(t);
    if (nombrados.length === 1) return nombrados[0];
  }
  return null;
}
