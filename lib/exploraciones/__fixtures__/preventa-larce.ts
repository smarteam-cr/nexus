/**
 * lib/exploraciones/__fixtures__/preventa-larce.ts — la preventa de Distribuidora Larce al 16 de octubre de 2026, sin
 * nombres reales («Distribuidora Ejemplo», «Ana», «Luis»), para las pruebas de la guía (iniciativa A del roadmap). Lo
 * que importa está igual que en la base: lo que marcó Ana en el test, lo que dice la nota del test en HubSpot, la
 * evidencia de la primera reunión, las casillas confirmadas y la guía vieja, que preguntaba «¿Qué pasa cuando un deal
 * se queda quieto?». Solo lo importan pruebas.
 */
import type { Letra } from "@/lib/escala/documento/tipos";
import { contenidoVacio, idDelItem, propuestaVacia, type EstadoDeExploracion, type EstimadoGuardado, type FuenteCitada, type ItemPropuesto } from "../contenido";
import type { GuiaDeLaSesion } from "../guia";
import type { LoLeidoDeHubspot } from "../lo-leido";
import type { PosicionParaLaGuia } from "../guia";

const RESPUESTAS_DEL_TEST: [string, Letra, string][] = [
  ["1.1", "F", "Hay un pipeline con etapas y criterios que cualquier rep explica igual, una definición escrita de \"oportunidad calificada\", cadencia de contacto definida y pipeline review en cadencia formal."],
  ["1.2", "I", "El CRM se usa en lo básico con carga manual y adopción desigual: unos lo usan y otros siguen con sus hojas."],
  ["1.3", "I", "La data está parcialmente limpia: empezamos a depurar pero persisten vacíos (emails, teléfonos) y el traceo de canal es básico."],
  ["1.4", "I", "Hay estructura básica por proyecto o segmento, pero el liderazgo revisa números básicos en hojas manuales y los informes son rudimentarios."],
  ["1.5", "I", "Hay algo de coherencia, pero el mensaje y la propuesta todavía varían bastante entre reps."],
  ["1.6", "I", "Priorizamos por intuición o listas estáticas; la segmentación es rudimentaria y no hay datos que guíen el foco."],
  ["1.7", "D", "El vendedor está solo: el seguimiento es de un solo canal y los deals que se enfrían mueren sin que nadie reaccione."],
  ["1.8", "I", "Solo de vez en cuando se comentan en reuniones los deals perdidos; el aprendizaje vive en las cabezas, sin estructura."],
];

export const TESTS_DE_LARCE: LoLeidoDeHubspot["tests"] = [
  {
    contacto: "Ana Pérez",
    resultado: {
      areaId: "1",
      fecha: "2026-10-15",
      url: "https://ejemplo.test/diagnostico",
      respuestas: RESPUESTAS_DEL_TEST.map(([dimensionId, nivel, respuesta]) => ({ dimensionId, nivel, respuesta, matiz: null })),
    },
  },
];

const T1 = (cita: string): FuenteCitada => ({ id: "T1", etiqueta: "Test de Ventas del 15 oct 2026", cita });
const H = (n: number, cita?: string): FuenteCitada => ({ id: `H${n}`, etiqueta: "Nota del 14 oct 2026", ...(cita ? { cita } : {}) });
const S1: FuenteCitada = { id: "S1", etiqueta: "Reunión del 16 oct 2026: EJEMPLO | DIAGNOSTICO + COTIZACIONES" };

function hipotesis(dimensionId: string, nivel: Letra, fuentes: FuenteCitada[]): ItemPropuesto {
  const destino = { tipo: "nivel" as const, dimensionId };
  const valor: EstimadoGuardado = { nivel, fuente: "hipotesis", porQue: "Lo que marcaron en el test." };
  return { id: idDelItem(destino, valor), destino, valor, fuentes, corridaId: "r-larce", en: "2026-10-16T19:26:30.041Z" };
}

const ITEMS: ItemPropuesto[] = [
  hipotesis("1.2", "I", [T1(RESPUESTAS_DEL_TEST[1][2]), H(3), S1]),
  hipotesis("1.5", "I", [T1(RESPUESTAS_DEL_TEST[4][2]), H(3, 'Lo marcó así: "El cliente recibe mensajes y propuestas distintos según el vendedor; la calidad depende de cada uno."'), S1]),
  hipotesis("1.6", "I", [T1(RESPUESTAS_DEL_TEST[5][2]), H(3, 'Lo marcó así: "Atendemos leads por orden de llegada: no hay criterios para distinguir oportunidades."')]),
  hipotesis("1.7", "D", [T1(RESPUESTAS_DEL_TEST[6][2]), H(1, "Cuando un deal se enfría no hay red de contención: el vendedor lo deja morir y nadie en el equipo lo detecta.")]),
  hipotesis("1.8", "I", [T1(RESPUESTAS_DEL_TEST[7][2]), H(3, 'Lo marcó así: "No hay análisis después de la venta ni de la no-venta: los errores se repiten."')]),
  // Una nota del vendedor: no son palabras del cliente.
  {
    id: "casilla:noExplorado:vendedor",
    destino: { tipo: "casilla", clave: "noExplorado" },
    valor: "Revisar las cotizaciones de Crown.",
    fuentes: [{ id: "N0", etiqueta: "Tus notas", cita: "El presupuesto lo maneja Luis, ojo con eso." }],
    corridaId: "r-larce",
    en: "2026-10-16T19:26:30.041Z",
  },
];

/** Las casillas tal como estaban cuando se armó la guía de la sesión 2 (16 oct): tiempos, planes y consecuencias vacías. */
const CASILLAS_AL_ARMAR_LA_GUIA: EstadoDeExploracion["contenido"]["casillas"] = {
  metas: [
    { que: "Facturación anual de la empresa", actual: "33 millones de dólares proyectados para el año" },
    { que: "KPI de cotizaciones mensuales por vendedor", objetivo: "35 cotizaciones al mes por vendedor" },
  ],
  retos: [
    { texto: "Los deals que se enfrían mueren sin que nadie los detecte: el vendedor está solo y el seguimiento es de un solo canal.", dimensionId: "1.7" },
    { texto: "Adopción desigual de HubSpot: parte del equipo sigue con hojas propias.", dimensionId: "1.2" },
  ],
  autoridad: [{ nombre: "Luis Gómez", cargo: "Gerente General", rol: "influye", nota: "Completó el diagnóstico el 14 oct." }],
  presupuesto: "",
  contexto: "Ya son clientes; conviene abrir desde los avances, no desde los pendientes.",
};

/** Las casillas de hoy (18 oct): la lectura de la sesión 1 llenó tiempos, planes, consecuencias e implicaciones. */
const CASILLAS_DE_HOY: EstadoDeExploracion["contenido"]["casillas"] = {
  ...CASILLAS_AL_ARMAR_LA_GUIA,
  planes: ["La asistente de ventas está implementando una revisión semanal de negocios con cada vendedor."],
  tiempos: ["Los negocios tienen ciclos de 3 meses a un año: lo que se planifica hoy se concreta entre diciembre y marzo."],
  consecuencias: ["La falta de seguimiento estructurado genera pérdida de oportunidades."],
  implicaciones: ["Con WhatsApp y llamadas en el CRM, podrían ver si un cliente no ha recibido respuesta."],
};

const CHEQUEO: EstadoDeExploracion["contenido"]["chequeo"] = {
  "1.1": { nivel: "I", fuente: "reunion", evidencia: "cada ejecutivo tiene su propio flow, digamos, de trabajo en el día y eso hace que también no tengamos cierta estandarización" },
  "1.3": { nivel: "I", fuente: "reunion", evidencia: "hay veces que se factura en dólares y luego en colones y sale que el promedio de tal persona ya va al 1200%", riesgo: true },
  "1.4": { nivel: "I", fuente: "reunion", evidencia: "Se actualiza una vez al mes con el mes anterior." },
};

/** La guía que vio Marco: 8 preguntas, la primera sobre lo que el cliente ya había dicho. */
export const GUIA_VIEJA_DE_LARCE: GuiaDeLaSesion = {
  en: "2026-10-16T22:18:28.892Z",
  corridaId: "r-guia",
  huecos: ["consecuencias", "tiempos", "implicaciones", "planes", "presupuesto"],
  enfoque: ["1.7", "1.2", "1.5"],
  objetivo: "Confirmar dónde está la operación comercial hoy, qué le cuesta quedarse así y quién decide sobre la inversión.",
  apertura: ["Llevan casi un año trabajando juntos."],
  escalaEnSimple: null,
  preguntas: [
    {
      para: "1.7",
      pregunta: "¿Qué pasa en el equipo cuando un negocio deja de avanzar, cuando un deal se queda quieto?",
      repreguntas: ["¿Me cuentas la última vez que un deal se enfrió?", "¿Por qué crees que pasa eso?", "¿Cuánto crees que les ha costado ese silencio?"],
    },
    {
      para: "1.2",
      pregunta: "¿Qué pasa en el sistema, sin que nadie lo haga a mano, cuando entra un lead o se cierra una venta?",
      repreguntas: ["¿Me cuentas la última vez que entró un lead importante?", "¿Por qué el equipo no carga todo en el CRM?", "¿Cuántas horas a la semana se van en tareas manuales?"],
    },
    { para: "1.5", pregunta: "¿Cómo sabe alguien que entra nuevo al equipo a quién le venden y con qué mensaje?", repreguntas: [] },
    { para: "consecuencias", pregunta: "Si la operación sigue igual seis meses más, ¿qué pasa, qué les cuesta?", repreguntas: [] },
    { para: "tiempos", pregunta: "¿Para cuándo necesitan tener esto resuelto, hay alguna fecha que mande?", repreguntas: [] },
    { para: "implicaciones", pregunta: "Si logran estructurar todo esto, ¿qué cambia para el negocio y para ti?", repreguntas: [] },
    { para: "planes", pregunta: "¿Qué han intentado hasta ahora para llegar a eso?", repreguntas: [] },
    { para: "presupuesto", pregunta: "¿Tienen un rango de inversión pensado para esto, o contra qué lo van a comparar para decidir?", repreguntas: [] },
  ],
  objeciones: [],
  pocaApertura: null,
  cierre: "Confirma quién más debería estar en la siguiente reunión y propone una fecha concreta.",
};

function estadoDeLarce(casillas: EstadoDeExploracion["contenido"]["casillas"]): EstadoDeExploracion {
  return {
    contenido: {
      ...contenidoVacio(),
      casillas,
      chequeo: CHEQUEO,
      sesiones: [{ id: "s-uno", fecha: "2026-10-16", titulo: "Sesión 1 · Iteración sobre diagnóstico" }],
    },
    propuesta: { ...propuestaVacia(), items: ITEMS, guia: GUIA_VIEJA_DE_LARCE },
    areas: ["1"],
    edicion: null,
    perfilCierre: "con equipo",
    perfilDespues: "continua",
    responsableEmail: null,
    archivada: false,
  };
}

/** La preventa cuando se armó la guía de la sesión 2. */
export const LARCE_AL_ARMAR_LA_GUIA = estadoDeLarce(CASILLAS_AL_ARMAR_LA_GUIA);
/** La preventa hoy: ya se saben los tiempos, los planes y las consecuencias. */
export const LARCE_HOY = estadoDeLarce(CASILLAS_DE_HOY);

/** Dónde parece estar cada dimensión (lo confirmado en la reunión y, si no, lo que marcó el test). */
export const POSICIONES_DE_LARCE: Record<string, PosicionParaLaGuia> = Object.fromEntries(
  RESPUESTAS_DEL_TEST.map(([id, nivel]) => [id, CHEQUEO[id] ? { nivel: CHEQUEO[id].nivel, clase: "evidencia" as const } : { nivel, clase: "hipotesis" as const }]),
);
