/**
 * lib/uso/ia.ts — la IA de Nexus en «Uso de Nexus»: de qué PROCESO es cada llamada a Claude y cómo se suman por
 * proceso, por cliente y por semana. PURO (sin base): lo prueba lib/uso/ia.test.ts y lo lee lib/uso/ia-server.ts.
 *
 * Un proceso es una familia de agentes que hacen lo mismo para quien lo usa (leer una reunión, el vigía, el chat…). Se
 * reconoce por el `agentSlug` que dejó el medidor (lib/ai/contexto-de-corrida.ts) y, sin slug, por el `origen`. Lo que
 * no se reconoce no se adivina: va a «Otros» con su slug, o a «No se sabe de qué proceso es».
 *
 * ⚠ El avance del cronograma que corre tras cada reunión no es uso de nadie: aunque la llamada herede el correo de quien
 * pidió leer la reunión, cuenta como «corre solo» (`esDeUnaPersona`).
 *
 * ⚠ Es una estimación con la tarifa de Anthropic (lib/ai/precios.ts), no contabilidad: lo que no tiene tarifa se cuenta
 * aparte (`sinTarifa`) y no suma 0 al costo.
 */
import type { ClaveDeTipo } from "@/lib/lo-propuesto/tipos";

export type ClaveDeProceso =
  | "lectura"
  | "tareas"
  | "hechos"
  | "avance"
  | "vigia"
  | "chat"
  | "handoff"
  | "cronograma"
  | "documentos"
  | "venta"
  | "procesos"
  | "ficha"
  | "resumenes"
  | "marketing"
  | "finanzas"
  | "otros"
  | "sin-identificar";

export interface DefinicionDeProceso {
  clave: ClaveDeProceso;
  nombre: string;
  queHace: string;
  /** Cómo se dispara, en palabras de la pantalla. */
  disparo: string;
  /**
   * Lo que propone este proceso y se puede usar o desestimar (lib/lo-propuesto). Una tarea propuesta es de las
   * reuniones o del chat según su origen (`fuentes`).
   */
  propone: readonly { tipo: ClaveDeTipo; fuentes?: readonly string[] }[];
}

export const PROCESOS: readonly DefinicionDeProceso[] = [
  {
    clave: "lectura",
    nombre: "Leer cada reunión",
    queHace: "Lee cada reunión con un cliente: la minuta, los compromisos, los pedidos fuera de alcance y la nota para HubSpot.",
    disparo: "Solo, al llegar la transcripción",
    propone: [{ tipo: "minuta" }, { tipo: "pedido-fuera-de-alcance" }, { tipo: "nota-para-hubspot" }, { tipo: "fecha-del-diagnostico" }, { tipo: "compromiso-legacy" }],
  },
  {
    clave: "tareas",
    nombre: "Tareas de las reuniones",
    queHace: "Saca de cada reunión lo que alguien se comprometió a hacer y lo propone como tarea, con su contexto.",
    disparo: "Solo, y con «¿Faltó algo?»",
    propone: [{ tipo: "tarea-propuesta", fuentes: ["reunion", "notas"] }],
  },
  {
    clave: "hechos",
    nombre: "Hechos de las reuniones",
    queHace: "Saca los hechos de cada reunión y los manda a la ficha, a los documentos, a Procesos o al vigía.",
    disparo: "Solo, después de leer la reunión",
    propone: [{ tipo: "novedad" }, { tipo: "hecho" }],
  },
  {
    clave: "avance",
    nombre: "Avance del cronograma",
    queHace: "Después de cada reunión, propone qué tareas del cronograma avanzaron y qué se desvió.",
    disparo: "Solo, tras cada reunión (no cuenta como uso de nadie)",
    propone: [],
  },
  {
    clave: "vigia",
    nombre: "Vigía de las cuentas",
    queHace: "Revisa cada cuenta y levanta alertas: riesgo, frialdad, licencias sin usar, oportunidades.",
    disparo: "Al entrar a una cuenta y cada día",
    propone: [{ tipo: "alerta-del-vigia" }],
  },
  {
    clave: "chat",
    nombre: "Chat",
    queHace: "El chat de Nexus, el de los documentos y el de Tareas: propone cambios que una persona aplica.",
    disparo: "Lo pide una persona",
    propone: [{ tipo: "tarea-propuesta", fuentes: ["chat"] }],
  },
  {
    clave: "handoff",
    nombre: "Handoff",
    queHace: "Escribe el handoff de lo vendido, sus resultados y, ya congelado, lo nuevo de las reuniones.",
    disparo: "Lo pide una persona",
    propone: [{ tipo: "sugerencia-del-handoff" }],
  },
  {
    clave: "cronograma",
    nombre: "Cronograma",
    queHace: "Arma y revisa el cronograma: las fases, el detalle y lo que explica cada propuesta.",
    disparo: "Lo pide una persona",
    propone: [],
  },
  {
    clave: "documentos",
    nombre: "Documentos del proyecto",
    queHace: "Escribe el kickoff, el diagnóstico, la planificación, la ejecución, las integraciones y la entrega.",
    disparo: "Lo pide una persona",
    propone: [],
  },
  {
    clave: "venta",
    nombre: "Preventa y propuestas",
    queHace: "Prepara y lee la preventa, arma las propuestas comerciales y propone la fecha de cierre.",
    disparo: "Lo pide una persona, y al abrir la preventa",
    propone: [],
  },
  {
    clave: "procesos",
    nombre: "Mapeo de procesos",
    queHace: "Lee las reuniones de una cuenta y dibuja sus procesos de hoy y de después.",
    disparo: "Lo pide una persona",
    propone: [],
  },
  {
    clave: "ficha",
    nombre: "Ficha y etapa",
    queHace: "Propone campos de la información del cliente y la etapa del proyecto a partir de lo que se dijo.",
    disparo: "Solo, después de cada reunión",
    propone: [{ tipo: "campo-de-ficha" }, { tipo: "etapa-sugerida" }],
  },
  {
    clave: "resumenes",
    nombre: "Resúmenes",
    queHace: "Escribe el resumen del proyecto y el de la cuenta.",
    disparo: "Al abrir el proyecto o la cuenta",
    propone: [],
  },
  {
    clave: "marketing",
    nombre: "Marketing",
    queHace: "Ideas de contenido, embudo y diagnóstico de marketing.",
    disparo: "Cada semana y a pedido",
    propone: [],
  },
  {
    clave: "finanzas",
    nombre: "Finanzas",
    queHace: "Los borradores de cobro, el reporte de finanzas y la lectura de los números de Rentabilidad.",
    disparo: "Lo pide una persona; la lectura de los números, también una vez por mes",
    propone: [{ tipo: "lectura-de-rentabilidad" }],
  },
  {
    clave: "otros",
    nombre: "Otros",
    queHace: "Agentes que no están en ninguna familia de esta lista: se ven por su nombre técnico.",
    disparo: "—",
    propone: [],
  },
  {
    clave: "sin-identificar",
    nombre: "No se sabe de qué proceso es",
    queHace: "Llamadas que no dicen qué agente las hizo. No se adivinan.",
    disparo: "—",
    propone: [],
  },
];

export const PROCESO_POR_CLAVE = new Map<ClaveDeProceso, DefinicionDeProceso>(PROCESOS.map((p) => [p.clave, p]));

/** El `origen` del avance cuando lo dispara la lectura de una reunión (lib/timeline/regenerate-progress.ts). */
const ORIGEN_DEL_AVANCE_SOLO = "post-process › avance";

/** Reglas por slug, en orden: la primera que calza gana. */
const REGLAS: readonly [RegExp, ClaveDeProceso][] = [
  [/^agent-timeline-progress$/, "avance"],
  [/^agent-(post-session|session-processor|session-project-classifier|participants-analyzer)$/, "lectura"],
  [/^tareas-(lectura|conversacion|contexto)$/, "tareas"],
  [/^(seguimiento-hechos|sondeo-de-hechos)$/, "hechos"],
  [/^(agent-)?cs-(watchdog|account-brief)$/, "vigia"],
  [/^(asistente-chat|asistente-tareas|nexus-chat)$/, "chat"],
  [/^agent-handoff|^resultados-del-cliente$/, "handoff"],
  [/^agent-timeline|^(explicacion-de-la-propuesta|hechas-fuera-de-lugar)$/, "cronograma"],
  [/-canvas$|^agent-kickoff$|^agent-roles-assist$/, "documentos"],
  [/^(exploracion-de-venta|business-case|propuesta-de-cierre|agent-entrevistas-prep)$|sales-analysis/, "venta"],
  [/^(procesos-mapeo|procesos-lectura|agent-mapeo-inicial)$/, "procesos"],
  [/^(ficha-del-cliente|etapa-desde-reunion)$/, "ficha"],
  [/^(agent-)?project-brief$/, "resumenes"],
  [/^agent-(marketing|analisis-funnel|diagnostico-marketing)/, "marketing"],
  [/^agent-(cobranza-borrador|finanzas-reporter)$/, "finanzas"],
  [/^rentabilidad-lectura$/, "finanzas"],
];

/** El proceso de una llamada, por su slug y, sin slug, por su origen. */
export function procesoDeLaLlamada(f: { agentSlug: string | null; origen: string | null }): ClaveDeProceso {
  const slug = f.agentSlug?.trim();
  if (slug) return REGLAS.find(([re]) => re.test(slug))?.[1] ?? "otros";
  const origen = f.origen ?? "";
  if (origen.includes("avance")) return "avance";
  if (origen.includes("sessions/post-process")) return "lectura";
  return "sin-identificar";
}

/**
 * ¿La llamada la pidió una persona? El avance que corre tras una reunión no, aunque herede el correo de quien pidió
 * leer la reunión.
 */
export function esDeUnaPersona(f: { triggeredByEmail: string | null; origen: string | null }): boolean {
  if (!f.triggeredByEmail) return false;
  return !(f.origen ?? "").includes(ORIGEN_DEL_AVANCE_SOLO);
}

/** El proceso de una propuesta (lib/lo-propuesto), o null si no la propone la IA (una alerta de regla). */
export function procesoDeLaPropuesta(tipo: ClaveDeTipo, fuente?: string | null): ClaveDeProceso | null {
  for (const p of PROCESOS) {
    for (const x of p.propone) {
      if (x.tipo !== tipo) continue;
      if (!x.fuentes || (fuente && x.fuentes.includes(fuente))) return p.clave;
    }
  }
  return null;
}

// ── La suma ────────────────────────────────────────────────────────────────────

/** Cómo se supo de qué empresa es la llamada. */
export type ComoSeUbico = "llamada" | "corrida" | "reunion";

export interface LlamadaDeIA {
  at: Date;
  costUsd: number | null;
  ok: boolean;
  agentSlug: string | null;
  agentRunId: string | null;
  origen: string | null;
  triggeredByEmail: string | null;
  /** La empresa ya resuelta (la de la llamada, la de su corrida o la dueña de su reunión), o null. */
  clientId: string | null;
  ubicada: ComoSeUbico | null;
}

export interface SumaDeIA {
  costo: number;
  llamadas: number;
  conError: number;
  /** Llamadas de un modelo sin tarifa: no están en `costo`. */
  sinTarifa: number;
  /** Costo de lo que pidió una persona; el resto corre solo. */
  costoDePersonas: number;
}

export const sumaVacia = (): SumaDeIA => ({ costo: 0, llamadas: 0, conError: 0, sinTarifa: 0, costoDePersonas: 0 });

function sumar(s: SumaDeIA, f: LlamadaDeIA): void {
  s.llamadas++;
  if (!f.ok) s.conError++;
  if (f.costUsd === null) s.sinTarifa++;
  else {
    s.costo += f.costUsd;
    if (esDeUnaPersona(f)) s.costoDePersonas += f.costUsd;
  }
}

export interface IaPorProceso extends SumaDeIA {
  clave: ClaveDeProceso;
  corridas: number;
  clientes: number;
  /** Los slugs que cayeron en «Otros», para nombrarlos. */
  slugs: string[];
}

export interface IaPorCliente extends SumaDeIA {
  clientId: string;
  corridas: number;
  /** Cuántas llamadas se ubicaron por su corrida o por su reunión, no por la llamada misma. */
  porAproximacion: number;
  procesos: { clave: ClaveDeProceso; costo: number; llamadas: number }[];
}

export interface SemanaDeIA {
  /** El lunes de la semana (AAAA-MM-DD, Costa Rica). */
  lunes: string;
  porProceso: Partial<Record<ClaveDeProceso, number>>;
}

export interface ResumenDeIA {
  total: SumaDeIA;
  conCliente: SumaDeIA;
  sinCliente: SumaDeIA;
  porProceso: IaPorProceso[];
  porCliente: IaPorCliente[];
  semanas: SemanaDeIA[];
  /** Llamadas leídas: si llega al tope, el total es un piso. */
  leidas: number;
}

const DIA_MS = 86_400_000;

/** El lunes (Costa Rica, UTC−6) de la semana de un instante. */
export function lunesEnCostaRica(at: Date): string {
  const cr = new Date(at.getTime() - 6 * 3_600_000);
  const dow = (cr.getUTCDay() + 6) % 7;
  return new Date(cr.getTime() - dow * DIA_MS).toISOString().slice(0, 10);
}

/** Suma las llamadas por proceso, por cliente y por semana. Los procesos y los clientes van de más a menos costo. */
export function resumirIa(llamadas: readonly LlamadaDeIA[]): ResumenDeIA {
  const total = sumaVacia();
  const conCliente = sumaVacia();
  const sinCliente = sumaVacia();
  const procesos = new Map<ClaveDeProceso, IaPorProceso & { _corridas: Set<string>; _clientes: Set<string>; _slugs: Set<string> }>();
  const clientes = new Map<string, IaPorCliente & { _corridas: Set<string>; _procesos: Map<ClaveDeProceso, { costo: number; llamadas: number }> }>();
  const semanas = new Map<string, Partial<Record<ClaveDeProceso, number>>>();

  for (const f of llamadas) {
    const clave = procesoDeLaLlamada(f);
    sumar(total, f);
    sumar(f.clientId ? conCliente : sinCliente, f);

    let p = procesos.get(clave);
    if (!p) {
      p = { ...sumaVacia(), clave, corridas: 0, clientes: 0, slugs: [], _corridas: new Set(), _clientes: new Set(), _slugs: new Set() };
      procesos.set(clave, p);
    }
    sumar(p, f);
    if (f.agentRunId) p._corridas.add(f.agentRunId);
    if (f.clientId) p._clientes.add(f.clientId);
    if (clave === "otros" && f.agentSlug) p._slugs.add(f.agentSlug);

    if (f.clientId) {
      let c = clientes.get(f.clientId);
      if (!c) {
        c = { ...sumaVacia(), clientId: f.clientId, corridas: 0, porAproximacion: 0, procesos: [], _corridas: new Set(), _procesos: new Map() };
        clientes.set(f.clientId, c);
      }
      sumar(c, f);
      if (f.agentRunId) c._corridas.add(f.agentRunId);
      if (f.ubicada && f.ubicada !== "llamada") c.porAproximacion++;
      const cp = c._procesos.get(clave) ?? { costo: 0, llamadas: 0 };
      cp.costo += f.costUsd ?? 0;
      cp.llamadas++;
      c._procesos.set(clave, cp);
    }

    const lunes = lunesEnCostaRica(f.at);
    const s = semanas.get(lunes) ?? {};
    s[clave] = (s[clave] ?? 0) + (f.costUsd ?? 0);
    semanas.set(lunes, s);
  }

  return {
    total,
    conCliente,
    sinCliente,
    porProceso: [...procesos.values()]
      .map(({ _corridas, _clientes, _slugs, ...p }) => ({ ...p, corridas: _corridas.size, clientes: _clientes.size, slugs: [..._slugs].sort() }))
      .sort((a, b) => b.costo - a.costo || b.llamadas - a.llamadas),
    porCliente: [...clientes.values()]
      .map(({ _corridas, _procesos, ...c }) => ({
        ...c,
        corridas: _corridas.size,
        procesos: [..._procesos.entries()].map(([clave, x]) => ({ clave, ...x })).sort((a, b) => b.costo - a.costo),
      }))
      .sort((a, b) => b.costo - a.costo || b.llamadas - a.llamadas),
    semanas: [...semanas.entries()].map(([lunes, porProceso]) => ({ lunes, porProceso })).sort((a, b) => a.lunes.localeCompare(b.lunes)),
    leidas: llamadas.length,
  };
}

// ── Lo que se usa de lo que propone ───────────────────────────────────────────

export interface UsoDeLoQuePropone {
  nacieron: number;
  usados: number;
  desestimados: number;
  vencidos: number;
  pendientes: number;
}

export const usoVacio = (): UsoDeLoQuePropone => ({ nacieron: 0, usados: 0, desestimados: 0, vencidos: 0, pendientes: 0 });

/** Qué parte de lo decidido se usó (0–1), o null si nada se decidió ni venció: sin decisiones no hay porcentaje. */
export function parteUsada(u: UsoDeLoQuePropone): number | null {
  const cerrados = u.usados + u.desestimados + u.vencidos;
  return cerrados > 0 ? u.usados / cerrados : null;
}

// ── Formato ────────────────────────────────────────────────────────────────────

/** Un número con punto de miles y coma decimal, igual en el servidor y en el navegador (sin `toLocaleString`). */
export function numero(n: number, decimales = 0): string {
  const [entero, dec] = Math.abs(n).toFixed(decimales).split(".");
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "−" : ""}${conMiles}${dec ? `,${dec}` : ""}`;
}

/** Dólares: «US$6,47»; lo que no llega a un centavo, «menos de US$0,01». */
export function usd(n: number): string {
  if (n > 0 && n < 0.005) return "menos de US$0,01";
  return `US$${numero(n, 2)}`;
}

/** Un porcentaje entero: «12 %». */
export const pct = (parte: number) => `${Math.round(parte * 100)} %`;
