/**
 * lib/analizador-venta/criterio.ts — EL CRITERIO DEL ANALIZADOR DE REUNIONES DE VENTA, ESCRITO (S1, 2026-10-25;
 * docs/analizador-reuniones-venta-plan.md). PURO y client-safe.
 *
 * Elías, 23 oct: Ventas va muy directo a la solución y explora poco. El analizador le dice a cada vendedor qué tan
 * consultiva fue su reunión y cómo mejorar. Es COACHING, no control: no hay puntaje ni ranking, cada juicio trae su cita
 * y el vendedor lo comenta (S4).
 *
 * Acá vive, una sola vez, lo que el analizador mira:
 *   · el proceso consultivo de Smarteam como lista (identificar, investigar, conectar, explorar y asesorar), con qué se
 *     espera en cada etapa y las señales de que se hizo o no. ⚠ Es la propuesta de la primera versión: la revisan Elías
 *     y Andrés en Ventas › Reuniones de venta › «El criterio» y se corrige AQUÍ (`VERSION_DEL_CRITERIO` sube);
 *   · los diez puntos que responde el análisis de cada reunión (el punto 3, quién habló, lo calcula Nexus: no la IA);
 *   · cómo se le cuenta al agente, con el position statement de Smarteam si existe (K3) o «sin posicionamiento escrito».
 */

/** Sube cuando cambia el criterio: cada análisis guarda con cuál se hizo. */
export const VERSION_DEL_CRITERIO = "2026-10-25";

export const ETAPAS = ["identificar", "investigar", "conectar", "explorar", "asesorar"] as const;
export type EtapaDelProceso = (typeof ETAPAS)[number];

export interface EtapaDelCriterio {
  id: EtapaDelProceso;
  nombre: string;
  /** Qué se espera del vendedor en esta etapa, en una frase. */
  seEspera: string;
  /** Lo que, dicho en la reunión, muestra que se hizo. */
  seHizo: string[];
  /** Lo que muestra que se saltó. */
  seSalto: string[];
}

export const PROCESO_CONSULTIVO: readonly EtapaDelCriterio[] = [
  {
    id: "identificar",
    nombre: "Identificar",
    seEspera: "Saber con quién se habla: quién decide, quién influye, quién usa, y por qué la empresa está buscando ahora.",
    seHizo: ["pregunta por el rol y la decisión de cada persona", "pregunta qué pasó para buscar ayuda ahora", "nombra a quién más hay que sumar"],
    seSalto: ["da por hecho quién decide", "no sabe por qué el cliente está hablando con Smarteam"],
  },
  {
    id: "investigar",
    nombre: "Investigar",
    seEspera: "Llegar preparado: conocer la empresa, su industria, cómo vende hoy y qué usa de HubSpot, y usarlo en la conversación.",
    seHizo: ["menciona algo de la empresa o de su industria que investigó", "conecta lo que dice el cliente con su contexto"],
    seSalto: ["pregunta lo que estaba en la web de la empresa", "habla en genérico, igual que con cualquier cliente"],
  },
  {
    id: "conectar",
    nombre: "Conectar",
    seEspera: "Hacer que el cliente hable de sus prioridades y de los resultados que busca, escuchar y devolverle lo que se entendió.",
    seHizo: ["deja hablar al cliente y le pregunta por lo que le importa", "resume con las palabras del cliente lo que entendió"],
    seSalto: ["monólogo del vendedor", "demo o presentación antes de entender al cliente"],
  },
  {
    id: "explorar",
    nombre: "Explorar",
    seEspera:
      "Preguntar a fondo por los problemas, su impacto y sus consecuencias, los procesos, las métricas y lo que ya se intentó, antes de hablar de la solución.",
    seHizo: ["preguntas abiertas que profundizan (¿por qué?, ¿cuánto les cuesta?, ¿qué pasa si no se resuelve?)", "pide números y ejemplos concretos", "recorre las dimensiones de la escala del área"],
    seSalto: ["salta a licencias, precio o funcionalidades antes de entender el problema", "acepta la primera respuesta sin profundizar"],
  },
  {
    id: "asesorar",
    nombre: "Asesorar",
    seEspera:
      "Recomendar con criterio desde lo explorado, conectado con los resultados del cliente, y dejar un siguiente paso con fecha y dueño.",
    seHizo: ["recomienda algo que sale de lo que dijo el cliente", "explica el porqué en términos de resultados", "acuerda un siguiente paso con fecha y responsable"],
    seSalto: ["cotiza licencias sin diagnóstico", "cierra sin siguiente paso, o con uno vago («les mandamos info»)"],
  },
];

/** Los diez puntos que responde el análisis de cada reunión (el plan). El 3 lo calcula Nexus. */
export const PUNTOS_DEL_ANALISIS = [
  { id: "consultiva", titulo: "Qué tan consultiva fue" },
  { id: "temas", titulo: "De qué se habló: los problemas y resultados del cliente, o licencias, precio y producto" },
  { id: "quien_hablo", titulo: "Quién habló más (lo calcula Nexus)" },
  { id: "guia", titulo: "Si se siguió la guía de la preventa, y qué partes" },
  { id: "escala", titulo: "Si se usó la escala o el diagnóstico" },
  { id: "posicionamiento", titulo: "Si se transmitió el posicionamiento de Smarteam" },
  { id: "exploracion", titulo: "Qué se exploró y qué quedó sin explorar, por dimensión de la escala" },
  { id: "posicion", titulo: "En qué posición quedó el vendedor: asesor o vendedor de licencias" },
  { id: "siguiente_paso", titulo: "Cuál quedó como siguiente paso, y si tiene fecha y dueño" },
  { id: "recomendaciones", titulo: "Dos o tres recomendaciones para la siguiente reunión" },
] as const;
export type PuntoDelAnalisis = (typeof PUNTOS_DEL_ANALISIS)[number]["id"];

/** Lo que se le dice al agente cuando Smarteam todavía no escribió su position statement (K3). */
export const SIN_POSICIONAMIENTO = "Sin posicionamiento escrito: Smarteam todavía no escribió su position statement. No juzgues este punto.";

/** El criterio como texto, para el agente (y para la pantalla «El criterio»). */
export function criterioComoTexto(o: { positionStatement: string | null; propuestaDeValor?: string | null }): string {
  const etapas = PROCESO_CONSULTIVO.map(
    (e, i) =>
      `${i + 1}. ${e.nombre.toUpperCase()} (${e.id}): ${e.seEspera}\n   Se hizo si: ${e.seHizo.join("; ")}.\n   Se saltó si: ${e.seSalto.join("; ")}.`,
  ).join("\n");
  const posicionamiento = o.positionStatement?.trim()
    ? `EL POSICIONAMIENTO DE SMARTEAM (position statement):\n${o.positionStatement.trim()}`
    : `EL POSICIONAMIENTO DE SMARTEAM: ${SIN_POSICIONAMIENTO}`;
  const valor = o.propuestaDeValor?.trim() ? `\nLA PROPUESTA DE VALOR DE SMARTEAM:\n${o.propuestaDeValor.trim()}` : "";
  return `EL PROCESO CONSULTIVO DE SMARTEAM (criterio ${VERSION_DEL_CRITERIO}):\n${etapas}\n\n${posicionamiento}${valor}`;
}
