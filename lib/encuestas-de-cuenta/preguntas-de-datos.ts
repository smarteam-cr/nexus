/**
 * lib/encuestas-de-cuenta/preguntas-de-datos.ts — lo que falta de los datos de la empresa, preguntado al entrar a su ficha
 * (R2 etapa 3, «lo que falta lo pregunta», 2026-10-25). PURO y client-safe.
 *
 * Elías, 24 oct: con el mecanismo de «Preguntas sobre la cuenta», Nexus le pregunta a quien ve la empresa (según su rol)
 * lo que nadie anotó, y la respuesta se escribe en HubSpot. A diferencia de la pregunta de Sí o No:
 *   - se responde con OPCIONES (las del catálogo de los datos: rangos de tráfico y de base, el perfil de negocio…);
 *   - Nexus PROPONE la respuesta cuando la tiene (una propuesta de la investigación o de una reunión que espera, o un valor
 *     que puso la IA) y la persona solo confirma o corrige;
 *   - pregunta solo lo que FALTA, una cosa por vez, y no vuelve a preguntar lo que ya está confirmado (un dato con fuente
 *     de persona: alguien del equipo, Ventas en HubSpot, la preventa o el test).
 * La respuesta pasa por el motor de los datos (lib/clients/datos-de-la-empresa-server.ts) con fuente `persona`, y de ahí a
 * HubSpot (R2, con la bandera). Se le pregunta a quien tiene `clientes.decidirDatos` (CSE, CSL, Ventas y los super admin):
 * su respuesta se aplica. Cada evento queda en `RespuestaDeCuenta` (append-only) con la clave `dato:<dato>`.
 */
import {
  datoDeLaEmpresa,
  esFuenteDeIA,
  ETIQUETA_DE_LA_FUENTE,
  valorParaMostrar,
  type ClaveDeDato,
  type FuenteDeDato,
  type ValorDeDato,
} from "@/lib/clients/datos-de-la-empresa";

export const PREFIJO_DE_DATO = "dato:";
export const NO_SE = "no_se";

export interface PreguntaDeDato {
  /** `dato:<clave del dato>`. Estable: va en la base. */
  clave: string;
  dato: ClaveDeDato;
  version: number;
  /** Con «{cliente}» donde va el nombre de la empresa. */
  pregunta: string;
  descripcion: string;
  diasParaVolverConNoSe: number;
  diasParaVolverConAhoraNo: number;
}

const p = (dato: ClaveDeDato, pregunta: string, descripcion: string): PreguntaDeDato => ({
  clave: `${PREFIJO_DE_DATO}${dato}`,
  dato,
  version: 1,
  pregunta,
  descripcion,
  diasParaVolverConNoSe: 14,
  diasParaVolverConAhoraNo: 3,
});

/**
 * Las que se preguntan, en este orden: primero lo que decide la edición de la escala y el TAM (la industria, el modelo
 * de negocio y el tamaño), al final el tráfico y la base. Solo datos que decide una persona y que tienen opciones.
 */
export const PREGUNTAS_DE_DATOS: readonly PreguntaDeDato[] = [
  p("industriaSmarteam", "¿En qué industria está {cliente}?", "Decide la edición de la escala, la exploración y el diagnóstico."),
  p("aQuienVende", "¿A quién le vende {cliente}?", "Su cliente, no el nuestro. Decide qué hubs le sirven."),
  p("perfilCierre", "¿Cómo cierra sus ventas {cliente}?", "Con un equipo de ventas, sin vendedor (transaccional) o las dos."),
  p("perfilDespues", "Después de la primera compra, ¿qué pasa con los clientes de {cliente}?", "Si vuelven a comprar o tienen una relación continua."),
  p("estructura", "¿{cliente} es una casa matriz, una filial o una empresa sin filiales?", "Una casa matriz con filiales necesita más asientos y a veces Enterprise."),
  p("baseConsentimiento", "¿Cuántos contactos con consentimiento tiene {cliente}?", "Los que aceptaron recibir sus comunicaciones. Un rango alcanza."),
  p("trafico", "¿Cuántas visitas al mes tiene el sitio de {cliente}?", "Un rango alcanza. Personalizar al visitante anónimo solo funciona con tráfico suficiente."),
];

export function preguntaDeDato(clave: string): PreguntaDeDato | null {
  return PREGUNTAS_DE_DATOS.find((x) => x.clave === clave) ?? null;
}

export function esClaveDeDato(clave: string): boolean {
  return clave.startsWith(PREFIJO_DE_DATO);
}

/** El texto de la pregunta para una empresa. */
export function textoDeLaPregunta(q: PreguntaDeDato, cliente: string): string {
  return q.pregunta.replace("{cliente}", cliente);
}

/** Las respuestas: las opciones del catálogo y «No sé». */
export function respuestasDelDato(q: PreguntaDeDato): { valor: string; rotulo: string }[] {
  return [...(datoDeLaEmpresa(q.dato).opciones ?? []).map((o) => ({ valor: o.valor, rotulo: o.etiqueta })), { valor: NO_SE, rotulo: "No sé" }];
}

export function esRespuestaValida(q: PreguntaDeDato, valor: string): boolean {
  return respuestasDelDato(q).some((r) => r.valor === valor);
}

/** El estado del dato hoy, lo mínimo para decidir. */
export interface DatoHoy {
  valor: ValorDeDato | null;
  fuente: FuenteDeDato | null;
}

/**
 * ¿Falta? Vacío, o con un valor que puso la IA y nadie confirmó. Lo que dijo una persona (en Nexus, Ventas en HubSpot, la
 * preventa o el test) ya está confirmado: no se pregunta. Lo vacío que una persona dejó a propósito, tampoco.
 */
export function faltaElDato(d: DatoHoy): boolean {
  if (d.fuente === null) return d.valor === null;
  return esFuenteDeIA(d.fuente);
}

export interface PropuestaPendiente {
  valor: ValorDeDato | null;
  fuente: FuenteDeDato;
  cita: string | null;
}

export interface PropuestaDeNexus {
  valor: string;
  rotulo: string;
  /** De dónde la sacó, en palabras («Investigación», «Reunión»…). */
  deDonde: string;
  cita: string | null;
}

/**
 * Lo que Nexus propone responder: la propuesta que espera (la más reciente primero), o el valor que puso la IA. Solo si
 * es una de las opciones.
 */
export function propuestaDeNexus(q: PreguntaDeDato, d: DatoHoy, pendientes: readonly PropuestaPendiente[]): PropuestaDeNexus | null {
  const dato = datoDeLaEmpresa(q.dato);
  const candidatos: { valor: ValorDeDato | null; fuente: FuenteDeDato | null; cita: string | null }[] = [...pendientes, { valor: d.valor, fuente: d.fuente, cita: null }];
  for (const c of candidatos) {
    if (c.valor === null || typeof c.valor !== "string" || !c.fuente) continue;
    if (!dato.opciones?.some((o) => o.valor === c.valor)) continue;
    return { valor: c.valor, rotulo: valorParaMostrar(dato, c.valor) ?? c.valor, deDonde: ETIQUETA_DE_LA_FUENTE[c.fuente], cita: c.cita };
  }
  return null;
}
