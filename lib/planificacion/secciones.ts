/**
 * lib/planificacion/secciones.ts — la forma de las secciones de la Planificación práctica (2026-10-02)
 * y cómo se leen las versiones viejas.
 *
 * La Planificación pasó a ser lo que va a quedar configurado en HubSpot: procesos (solo lo que se
 * hará; cómo operan hoy vive en el Diagnóstico), etapas del ciclo de vida, propiedades por objeto,
 * pipelines de leads/ventas/servicio, automatizaciones y conversaciones.
 *
 * Varias secciones ya tenían contenido con otra forma —la prosa del ciclo de vida, el «hoy / cómo
 * será» de los procesos, y lo que se mudó desde Ejecución (pipelines como texto, procesos de
 * marketing como prosa)—. Cada `adoptar*` lleva lo viejo a la forma nueva SIN escribir: lo usan el
 * renderer (para pintar y, al primer cambio de una persona, guardar ya la forma nueva) y la migración.
 *
 * Puro: sin React ni Prisma.
 */

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const txt = (v: unknown): string => (typeof v === "string" ? v : "");
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/* ── Procesos: cómo van a funcionar ─────────────────────────────────────────── */

export interface PasoDeProceso {
  paso: string;
  detalle?: string;
  origen?: string;
}
export interface ProcesoFuturo {
  nombre: string;
  /** Titular de media línea: cómo va a funcionar. */
  resumen?: string;
  /** Las reuniones que lo respaldan. */
  fuente?: string;
  pasos: PasoDeProceso[];
  /** Legacy: el párrafo «cómo será» de antes. Se muestra mientras no haya pasos. */
  comoSera?: string;
}
export interface ProcesosFuturoData {
  intro?: string;
  procesos: ProcesoFuturo[];
}

/** El «hoy / cómo será» viejo → solo lo que se hará. Los campos de «hoy» quedan guardados, sin mostrarse. */
export function adoptarProcesos(data: unknown): ProcesosFuturoData {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    intro: txt(d.intro),
    procesos: arr<Record<string, unknown>>(d.procesos).map((p) => ({
      ...p,
      nombre: txt(p.nombre),
      resumen: txt(p.resumen) || txt(p.resumenSera),
      fuente: txt(p.fuente),
      pasos: arr<PasoDeProceso>(p.pasos),
      ...(txt(p.comoSera) ? { comoSera: txt(p.comoSera) } : {}),
    })),
  };
}

/* ── Etapas del ciclo de vida ───────────────────────────────────────────────── */

export const CAMBIOS_DE_ETAPA = [
  { value: "nueva", label: "Nueva" },
  { value: "se_mantiene", label: "Se mantiene" },
  { value: "renombrada", label: "Se renombra" },
  { value: "se_quita", label: "Se quita" },
] as const;

export interface EtapaDeCiclo {
  etapa: string;
  entraCuando: string;
  laMueve?: string;
  cambio?: string;
  origen?: string;
}
export interface CicloDeVidaData {
  intro?: string;
  etapas: EtapaDeCiclo[];
}

/** La prosa vieja (`items` título + detalle) → tabla. El detalle entero queda en «entra cuando». */
export function adoptarCicloDeVida(data: unknown): CicloDeVidaData {
  const d = (data ?? {}) as Record<string, unknown>;
  const etapas = arr<EtapaDeCiclo>(d.etapas);
  if (etapas.length) return { intro: txt(d.intro), etapas };
  return {
    intro: txt(d.intro),
    etapas: arr<Record<string, unknown>>(d.items)
      .filter((i) => txt(i.title).trim() || txt(i.detail).trim())
      .map((i) => ({ etapa: txt(i.title), entraCuando: txt(i.detail), laMueve: "", cambio: "", origen: "" })),
  };
}

/* ── Pipelines ──────────────────────────────────────────────────────────────── */

export const TIPOS_DE_PIPELINE = [
  { value: "leads", label: "Leads" },
  { value: "ventas", label: "Ventas" },
  { value: "servicio", label: "Servicio" },
  { value: "otro", label: "Otro" },
] as const;

export const CIERRES_DE_ETAPA = [
  { value: "", label: "Abierta" },
  { value: "ganado", label: "Cierra ganada" },
  { value: "perdido", label: "Cierra perdida" },
] as const;

export interface EtapaDePipeline {
  etapa: string;
  entraCuando?: string;
  /** Lo que tiene que estar completo para avanzar, separado por comas. */
  requisitos?: string;
  /** "" | ganado | perdido. */
  cierre?: string;
  origen?: string;
}
export interface Pipeline {
  tipo: string;
  nombre: string;
  objeto?: string;
  /** Una línea de contexto. En los pipelines que vinieron de Ejecución, el texto de las etapas. */
  nota?: string;
  origen?: string;
  etapas: EtapaDePipeline[];
}
export interface PipelinesData {
  intro?: string;
  pipelines: Pipeline[];
}

/** Leads, ventas o servicio, por las palabras del nombre o del objeto. */
export function inferirTipoDePipeline(...textos: unknown[]): string {
  const t = sinTildes(textos.map(txt).join(" ")).toLowerCase();
  if (/\blead/.test(t)) return "leads";
  if (/ticket|servicio|soporte|ayuda|atencion/.test(t)) return "servicio";
  if (/negocio|venta|deal|admision|comercial|oportunidad/.test(t)) return "ventas";
  return "otro";
}

/**
 * Los pipelines que vinieron de Ejecución (`procesos` con nombre / comoEsHoy / comoSera / sistemas)
 * → la forma nueva. El texto de las etapas propuestas queda como nota del pipeline: partirlo en
 * etapas sería adivinar dónde termina cada una.
 */
export function adoptarPipelines(data: unknown): PipelinesData {
  const d = (data ?? {}) as Record<string, unknown>;
  const pipelines = arr<Pipeline>(d.pipelines);
  if (pipelines.length || !Array.isArray(d.procesos)) {
    return { intro: txt(d.intro), pipelines: pipelines.map((p) => ({ ...p, etapas: arr<EtapaDePipeline>(p.etapas) })) };
  }
  return {
    intro: txt(d.intro),
    pipelines: arr<Record<string, unknown>>(d.procesos)
      .filter((p) => txt(p.nombre).trim())
      .map((p) => ({
        tipo: inferirTipoDePipeline(p.nombre, p.sistemas),
        nombre: txt(p.nombre),
        objeto: txt(p.sistemas),
        nota: txt(p.comoSera),
        origen: "",
        etapas: [],
      })),
  };
}

/** «Proyecto, Tipo de programa» → ["Proyecto", "Tipo de programa"]. */
export function listaDeRequisitos(v: unknown): string[] {
  return txt(v)
    .split(/[,;·\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/* ── Automatizaciones ───────────────────────────────────────────────────────── */

export interface Automatizacion {
  nombre: string;
  /** Objeto y hub, en una línea: «Contacto · Marketing Hub». */
  donde?: string;
  cuando?: string;
  hace?: string;
  resuelve?: string;
  /** Lo que todavía no está definido. */
  falta?: string;
  origen?: string;
  fuente?: string;
}
export interface AutomatizacionesData {
  intro?: string;
  items: Automatizacion[];
}

/** Los «procesos de marketing» de Ejecución (prosa título + detalle) → automatizaciones. */
export function adoptarAutomatizaciones(data: unknown): AutomatizacionesData {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    intro: txt(d.intro),
    items: arr<Record<string, unknown>>(d.items)
      .filter((i) => txt(i.nombre).trim() || txt(i.title).trim() || txt(i.detail).trim())
      .map((i) =>
        txt(i.nombre) || !txt(i.title)
          ? (i as unknown as Automatizacion)
          : { nombre: txt(i.title), donde: "", cuando: "", hace: txt(i.detail), resuelve: "", falta: "", origen: "", fuente: "" },
      ),
  };
}

/* ── Conversaciones (mensajería instantánea y agentes de IA) ───────────────── */

export const QUIEN_RESPONDE = [
  { value: "persona", label: "Una persona" },
  { value: "chatbot", label: "Chatbot con reglas" },
  { value: "agente_ia", label: "Agente de IA" },
] as const;

export interface Conversacion {
  nombre: string;
  /** Canal y hub: «WhatsApp Business · Service Hub». */
  canal?: string;
  /** persona | chatbot | agente_ia. */
  responde?: string;
  paraQue?: string;
  pasaA?: string;
  registra?: string;
  falta?: string;
  origen?: string;
  fuente?: string;
}
export interface ConversacionesData {
  intro?: string;
  items: Conversacion[];
}

export function adoptarConversaciones(data: unknown): ConversacionesData {
  const d = (data ?? {}) as Record<string, unknown>;
  return { intro: txt(d.intro), items: arr<Conversacion>(d.items) };
}

/* ── Utilidad de los renderers ──────────────────────────────────────────────── */

/** Mueve el elemento `i` una posición (`-1` antes, `+1` después). Fuera de rango, igual. */
export function mover<T>(lista: readonly T[], i: number, delta: -1 | 1): T[] {
  const j = i + delta;
  if (i < 0 || i >= lista.length || j < 0 || j >= lista.length) return lista.slice();
  const copia = lista.slice();
  [copia[i], copia[j]] = [copia[j], copia[i]];
  return copia;
}
