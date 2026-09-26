/**
 * lib/cuestionario/avance.ts — cuánto lleva contestado cada pestaña, y cómo se funde lo que manda
 * el cliente con lo que ya estaba guardado. Módulo PURO.
 */
import { IDS_DE_ETAPA, PREGUNTAS_DE_ETAPA } from "./plantilla";
import {
  estaContestada,
  leerEtapas,
  leerRespuestas,
  type Etapa,
  type Pregunta,
  type Respuesta,
  type Respuestas,
  type TipoPestana,
} from "./tipos";

export interface Avance {
  contestadas: number;
  total: number;
  /** Pestaña de etapas sin ninguna etapa cargada: el total no dice nada todavía. */
  sinEtapas: boolean;
}

export function avanceDePestana(p: {
  tipo: TipoPestana;
  preguntas: Pregunta[];
  respuestas: Respuestas;
  etapas: Etapa[];
}): Avance {
  let total = p.preguntas.length;
  let contestadas = p.preguntas.filter((q) => estaContestada(p.respuestas[q.id])).length;
  if (p.tipo === "etapas") {
    for (const e of p.etapas) {
      total += PREGUNTAS_DE_ETAPA.length;
      contestadas += PREGUNTAS_DE_ETAPA.filter((q) => estaContestada(e.respuestas[q.id])).length;
    }
  }
  return { contestadas, total, sinEtapas: p.tipo === "etapas" && p.etapas.length === 0 };
}

export function porcentaje(a: Avance): number {
  return a.total === 0 ? 0 : Math.round((a.contestadas / a.total) * 100);
}

/**
 * Funde UNA respuesta que llega del cliente con la guardada.
 *
 * El `origen` y la fecha los decide el servidor, nunca el navegador: si el valor no cambió respecto
 * de lo guardado, se conserva el origen (una respuesta prellenada que el cliente no tocó sigue
 * siendo prellenada, salvo que la confirme); si cambió, pasa a ser del cliente.
 */
function fundirUna(previa: Respuesta | undefined, entrante: Respuesta, ahora: string): Respuesta | null {
  const valor = entrante.valor;
  const enSesion = entrante.enSesion === true;
  if (!valor.trim() && !enSesion) return null; // vaciada = sin respuesta
  const mismoValor = previa && previa.valor === valor;
  const origen = mismoValor ? previa.origen : "cliente";
  const confirmada = origen === "prellenado" && entrante.confirmada === true;
  const igual =
    mismoValor && (previa.enSesion === true) === enSesion && (previa.confirmada === true) === confirmada;
  return {
    valor,
    origen,
    ...(enSesion ? { enSesion: true } : {}),
    ...(confirmada ? { confirmada: true } : {}),
    actualizadoAt: igual ? previa.actualizadoAt : ahora,
  };
}

function fundirMapa(previas: Respuestas, entrantes: Respuestas, idsValidos: ReadonlySet<string>, ahora: string) {
  const out: Respuestas = {};
  // Lo guardado que el cliente NO puede tocar (ids que ya no están en la estructura) se conserva:
  // una pregunta que el CSE quitó no se lleva su respuesta con ella.
  for (const [id, r] of Object.entries(previas)) if (!idsValidos.has(id)) out[id] = r;
  for (const id of idsValidos) {
    if (!(id in entrantes)) {
      if (previas[id]) out[id] = previas[id];
      continue;
    }
    const r = fundirUna(previas[id], entrantes[id], ahora);
    if (r) out[id] = r;
  }
  return out;
}

export interface GuardadoDelCliente {
  respuestas: Respuestas;
  etapas: Etapa[];
  contextoAdicional: string | null;
}

/** Lee el body del guardado del cliente con la misma tolerancia que las columnas. */
export function leerGuardado(raw: unknown): GuardadoDelCliente | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const ctx = typeof r.contextoAdicional === "string" ? r.contextoAdicional.slice(0, 20_000) : null;
  return { respuestas: leerRespuestas(r.respuestas), etapas: leerEtapas(r.etapas), contextoAdicional: ctx };
}

export function fundirGuardado(
  previo: { tipo: TipoPestana; preguntas: Pregunta[]; respuestas: Respuestas; etapas: Etapa[] },
  entrante: GuardadoDelCliente,
  ahora: string,
): { respuestas: Respuestas; etapas: Etapa[] } {
  const ids = new Set(previo.preguntas.map((q) => q.id));
  const respuestas = fundirMapa(previo.respuestas, entrante.respuestas, ids, ahora);
  if (previo.tipo !== "etapas") return { respuestas, etapas: previo.etapas };

  // Las etapas son del cliente: las agrega, las nombra, las ordena y las quita. Se respeta su
  // lista tal cual llega, fundiendo cada una con su versión guardada por id.
  const porId = new Map(previo.etapas.map((e) => [e.id, e]));
  const etapas = entrante.etapas.map((e) => ({
    id: e.id,
    nombre: e.nombre.replace(/\s+/g, " ").trim().slice(0, 120),
    respuestas: fundirMapa(porId.get(e.id)?.respuestas ?? {}, e.respuestas, IDS_DE_ETAPA, ahora),
  }));
  return { respuestas, etapas };
}

export { leerEtapas, leerRespuestas };
