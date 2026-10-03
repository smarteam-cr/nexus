/**
 * lib/exploraciones/guia.ts — la guía de la PRÓXIMA reunión y las sesiones que planea el vendedor. PURO.
 *
 * Pedido de Elías (2026-10-01), tras tres sesiones con HubSpot y con el equipo: Ventas llega a la
 * exploración sin prepararse y termina vendiendo licencias en vez de diagnosticar. Lo que necesita
 * es llegar sabiendo qué preguntar, cómo profundizar y cómo manejar las objeciones. Por eso:
 *
 *   - Ya no hay «Reunión 1» y «Reunión 2» fijas: el vendedor agrega las sesiones que necesite, y la
 *     guía es siempre la de la PRÓXIMA.
 *   - La guía apunta a lo que todavía falta: las tarjetas vacías del resumen (el marco de
 *     calificación) y hasta 4 dimensiones sin evidencia (`enfoqueDeLaGuia`). El código elige cuáles;
 *     el agente escribe las preguntas, tres repreguntas por cada una (la siguiente pregunta lógica:
 *     ir al dolor real y cuantificarlo) y las objeciones adaptadas a la empresa.
 *   - Sin la guía del agente igual hay guía: las preguntas de base de cada tarjeta, la pregunta de
 *     cada dimensión (sale de la escala, nunca de este archivo) y las objeciones de base.
 *
 * La guía es material de preparación, no un dato del cliente: vive en la mitad del agente
 * (`propuesta.guia`), se muestra directo, sin «usar», y NUNCA llega a la propuesta ni al handoff.
 */
import { LETRAS, type Letra } from "@/lib/escala/documento/tipos";
import { CASILLAS_DEL_RESUMEN, type ClaveDeCasilla } from "./casillas";
import type { EscalaDelLienzo } from "./escala-del-lienzo";
import { aFecha, hoyEnCostaRica } from "./fechas";

// ── Las sesiones ──────────────────────────────────────────────────────────────

/** De dónde viene una reunión: Google Meet, HubSpot (el notetaker) o sumada a mano. */
export type OrigenDeReunion = "meet" | "hubspot" | "documento";

/** Una sesión que planea el vendedor. La fecha es `AAAA-MM-DD`; sin fecha, todavía no se agendó. */
export interface SesionPlaneada {
  id: string;
  titulo?: string;
  fecha?: string;
  /** La marcó hecha el vendedor. Una con fecha pasada también cuenta como hecha. */
  hecha?: boolean;
  /**
   * La reunión de esta sesión, elegida a mano. Sin ella, es la del mismo día (`reunionDeLaSesion`).
   * Pedido de Elías (2026-10-03): «por fecha, y se corrige a mano».
   */
  reunion?: { id: string; origen: OrigenDeReunion };
  /** Lo que quedó de una sesión anterior para explorar en esta (lo que se dijo y nadie siguió). */
  explorar?: string[];
}

export const MAX_SESIONES = 12;
/** Cuántos puntos se llevan a una sesión: más no entran en una reunión. */
export const MAX_PARA_EXPLORAR = 10;

/** Una reunión de la exploración, leída o no: lo que se liga a una sesión. */
export interface ReunionDeLaExploracion {
  id: string;
  titulo: string;
  /** ISO. */
  fecha: string;
  origen: OrigenDeReunion;
  leida: boolean;
}

/** El día de Costa Rica (`AAAA-MM-DD`) de una fecha ISO; una de solo día es ese día (no la medianoche UTC). */
function diaDe(iso: string): string {
  return hoyEnCostaRica(aFecha(iso));
}

/** La reunión de una sesión: la elegida a mano o, si no hay, la del mismo día. */
export function reunionDeLaSesion(s: SesionPlaneada, reuniones: readonly ReunionDeLaExploracion[]): ReunionDeLaExploracion | null {
  if (s.reunion) return reuniones.find((r) => r.id === s.reunion?.id && r.origen === s.reunion?.origen) ?? null;
  if (!s.fecha) return null;
  return reuniones.find((r) => diaDe(r.fecha) === s.fecha) ?? null;
}

/** Una pestaña de Exploración: una sesión planeada o una reunión que no está en ninguna. */
export interface PestanaDeSesion {
  /** El id de la sesión, o `r-<id>` para una reunión suelta. */
  clave: string;
  numero: number;
  sesion: SesionPlaneada | null;
  reunion: ReunionDeLaExploracion | null;
  fecha: string | null;
  hecha: boolean;
}

/**
 * Las pestañas, en orden de fecha: las sesiones planeadas (con su reunión) y las reuniones que no
 * quedaron en ninguna sesión (para no perder ninguna: se suman a las sesiones con un clic). Las sin
 * fecha van al final, en el orden en que se agregaron.
 */
export function pestanasDeSesiones(sesiones: readonly SesionPlaneada[], reuniones: readonly ReunionDeLaExploracion[], hoy: string): PestanaDeSesion[] {
  const usadas = new Set<string>();
  const deSesiones = sesiones.map((s, i) => {
    const r = reunionDeLaSesion(s, reuniones);
    if (r) usadas.add(`${r.origen}:${r.id}`);
    return { s, r, i };
  });
  const sueltas = reuniones.filter((r) => !usadas.has(`${r.origen}:${r.id}`));
  const todas = [
    ...deSesiones.map(({ s, r, i }) => ({
      clave: s.id,
      sesion: s,
      reunion: r,
      fecha: s.fecha ?? (r ? diaDe(r.fecha) : null),
      hecha: sesionHecha(s, hoy) || !!r,
      orden: i,
    })),
    ...sueltas.map((r, i) => ({ clave: `r-${r.origen}-${r.id}`, sesion: null, reunion: r, fecha: diaDe(r.fecha), hecha: true, orden: sesiones.length + i })),
  ];
  todas.sort((a, b) => (a.fecha && b.fecha ? a.fecha.localeCompare(b.fecha) || a.orden - b.orden : a.fecha ? -1 : b.fecha ? 1 : a.orden - b.orden));
  return todas.map((p, i) => ({ clave: p.clave, sesion: p.sesion, reunion: p.reunion, fecha: p.fecha, hecha: p.hecha, numero: i + 1 }));
}

/** ¿Ya pasó? La marcó el vendedor, o su fecha es anterior a hoy. */
export function sesionHecha(s: SesionPlaneada, hoy: string): boolean {
  return !!s.hecha || (!!s.fecha && s.fecha < hoy);
}

/**
 * La próxima reunión: la primera sesión planeada que no pasó (las con fecha primero) o, si no hay, la
 * agendada en HubSpot. Su número cuenta lo que ya pasó: las sesiones hechas o, si son más, las
 * reuniones que el agente ya leyó (el vendedor no siempre planea las sesiones en el lienzo).
 */
export function proximaReunion(
  sesiones: readonly SesionPlaneada[],
  agenda: readonly { titulo: string; inicio: string }[],
  hoy: string,
  reunionesLeidas = 0,
): { numero: number; titulo: string | null; fecha: string | null; desde: "sesion" | "hubspot" | null; sesionId: string | null } {
  const hechas = Math.max(sesiones.filter((s) => sesionHecha(s, hoy)).length, reunionesLeidas);
  const pendientes = sesiones
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !sesionHecha(s, hoy))
    .sort((a, b) => (a.s.fecha && b.s.fecha ? a.s.fecha.localeCompare(b.s.fecha) : a.s.fecha ? -1 : b.s.fecha ? 1 : a.i - b.i));
  const numero = hechas + 1;
  if (pendientes[0]) {
    const s = pendientes[0].s;
    return { numero, titulo: s.titulo ?? null, fecha: s.fecha ?? null, desde: "sesion", sesionId: s.id };
  }
  if (agenda[0]) return { numero, titulo: agenda[0].titulo, fecha: agenda[0].inicio, desde: "hubspot", sesionId: null };
  return { numero, titulo: null, fecha: null, desde: null, sesionId: null };
}

// ── Qué cubre la guía ─────────────────────────────────────────────────────────

/** Hasta cuántas dimensiones apunta la guía: las que más importan, no las ocho. */
export const MAX_DIMENSIONES_EN_FOCO = 4;
/** Hasta cuántas tarjetas vacías pregunta una reunión. */
export const MAX_TARJETAS_EN_LA_GUIA = 5;
/**
 * Cuántas preguntas tiene una guía, entre tarjetas y dimensiones. Probado contra la API: con las ocho
 * tarjetas y cuatro dimensiones salían doce preguntas, demasiadas para una reunión.
 */
export const MAX_PREGUNTAS_POR_REUNION = 8;

/**
 * En qué orden se preguntan las tarjetas vacías: primero adónde quiere llegar, qué lo frena y qué le
 * cuesta no actuar; el presupuesto al final (hablar de plata antes de la meta es vender antes de
 * diagnosticar).
 */
export const PRIORIDAD_DE_LAS_TARJETAS: readonly (typeof CASILLAS_DEL_RESUMEN)[number][] = [
  "metas",
  "retos",
  "consecuencias",
  "autoridad",
  "tiempos",
  "implicaciones",
  "planes",
  "presupuesto",
];

/** Las tarjetas del resumen que siguen vacías, en el orden en que conviene preguntarlas. */
export function huecosDelResumen(casillas: Partial<Record<ClaveDeCasilla, unknown>>): ClaveDeCasilla[] {
  return PRIORIDAD_DE_LAS_TARJETAS.filter((clave) => {
    const v = casillas[clave];
    return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
  });
}

/** Lo mínimo que la guía necesita saber de dónde parece estar cada dimensión. */
export interface PosicionParaLaGuia {
  nivel: Letra;
  clase: "evidencia" | "hipotesis";
}

/**
 * Las dimensiones en foco de la próxima reunión, hasta 4 en total: las de las áreas en juego que
 * todavía no tienen evidencia. Primero las que el vendedor marcó para explorar a fondo; después las
 * más bajas (sin dato cuenta como la más baja: hay que preguntarla), la base operativa antes que la
 * producción, y en el orden de las áreas.
 */
export function enfoqueDeLaGuia(
  escala: EscalaDelLienzo,
  areas: readonly string[],
  posiciones: Readonly<Record<string, PosicionParaLaGuia | undefined>>,
  aExplorar: Readonly<Record<string, unknown>>,
  max = MAX_DIMENSIONES_EN_FOCO,
): string[] {
  const candidatas: { id: string; marcada: boolean; nivel: number; capa: number; orden: number }[] = [];
  let orden = 0;
  for (const areaId of areas) {
    const area = escala.areas.find((a) => a.id === areaId);
    if (!area) continue;
    for (const d of area.dimensiones) {
      orden++;
      if (!d.aplica) continue;
      const p = posiciones[d.id];
      if (p?.clase === "evidencia") continue;
      candidatas.push({ id: d.id, marcada: d.id in aExplorar, nivel: p ? LETRAS.indexOf(p.nivel) : -1, capa: d.capa === "base" ? 0 : 1, orden });
    }
  }
  return candidatas
    .sort((a, b) => Number(b.marcada) - Number(a.marcada) || a.nivel - b.nivel || a.capa - b.capa || a.orden - b.orden)
    .slice(0, max)
    .map((c) => c.id);
}

/**
 * Qué cubre la próxima reunión: hasta 5 tarjetas vacías y, con lo que queda hasta 8 preguntas, hasta
 * 4 dimensiones sin evidencia. Lo usan la pantalla y el pedido al agente: tienen que decir lo mismo.
 */
export function focoDeLaGuia(
  casillas: Partial<Record<ClaveDeCasilla, unknown>>,
  escala: EscalaDelLienzo,
  areas: readonly string[],
  posiciones: Readonly<Record<string, PosicionParaLaGuia | undefined>>,
  aExplorar: Readonly<Record<string, unknown>>,
): { huecos: ClaveDeCasilla[]; enfoque: string[] } {
  const huecos = huecosDelResumen(casillas).slice(0, MAX_TARJETAS_EN_LA_GUIA);
  const enfoque = enfoqueDeLaGuia(escala, areas, posiciones, aExplorar, Math.min(MAX_DIMENSIONES_EN_FOCO, MAX_PREGUNTAS_POR_REUNION - huecos.length));
  return { huecos, enfoque };
}

// ── Lo de base: lo que la guía muestra aunque el agente no la haya armado ─────

/** La pregunta de base de cada tarjeta del resumen (en lenguaje llano, tuteando al cliente). */
export const PREGUNTA_DE_BASE: Record<(typeof CASILLAS_DEL_RESUMEN)[number], string> = {
  metas: "¿Qué quieres lograr este año? ¿De cuánto a cuánto, y para cuándo?",
  planes: "¿Qué han intentado hasta ahora para llegar?",
  retos: "¿Qué los frena hoy?",
  tiempos: "¿Para cuándo lo necesitan? ¿Hay alguna fecha que mande, como una renovación o un lanzamiento?",
  presupuesto: "¿Tienen un rango de inversión pensado para esto, o contra qué lo van a comparar?",
  autoridad: "Además de ti, ¿quién tiene que estar de acuerdo para avanzar? ¿Quién da el visto bueno final?",
  consecuencias: "Si esto sigue igual seis meses más, ¿qué pasa? ¿Cuánto les cuesta?",
  implicaciones: "Si lo logran, ¿qué cambia para el negocio, y para ti?",
};

/** Para conectar cuando la empresa no hizo el test y todavía no se habló: preguntas de conexión. */
export const CONEXION_DE_BASE: readonly string[] = [
  "¿Cómo llegaron a hablar con nosotros? ¿Qué te hizo buscarnos ahora?",
  "Cuéntame cómo funciona hoy tu equipo: ¿cómo consiguen clientes y cómo los atienden?",
  "Si en seis meses esto estuviera resuelto, ¿qué sería distinto?",
];

/** Las objeciones típicas de una exploración, con LAER: escuchar, reconocer, explorar y responder. */
export const TIPOS_DE_OBJECION = ["precio", "herramienta", "momento", "propuesta"] as const;
export type TipoDeObjecion = (typeof TIPOS_DE_OBJECION)[number];
export const OBJECION: Record<TipoDeObjecion, string> = {
  precio: "«Está muy caro»",
  herramienta: "«Ya tenemos una herramienta»",
  momento: "«No es el momento»",
  propuesta: "«Mándame la propuesta»",
};

export const PASOS_LAER = [
  { clave: "escuchar", nombre: "Escuchar" },
  { clave: "reconocer", nombre: "Reconocer" },
  { clave: "explorar", nombre: "Explorar" },
  { clave: "responder", nombre: "Responder" },
] as const;
export type PasoLaer = (typeof PASOS_LAER)[number]["clave"];

export type Objecion = { tipo: TipoDeObjecion } & Record<PasoLaer, string>;

export const OBJECIONES_DE_BASE: readonly Objecion[] = [
  {
    tipo: "precio",
    escuchar: "Deja que termine. No defiendas el precio todavía.",
    reconocer: "Tiene sentido cuidar la inversión.",
    explorar: "¿Caro comparado con qué? ¿Cuánto les cuesta hoy no resolverlo?",
    responder: "Vuelve a su meta en cifras: lo que cuesta quedarse como está contra lo que cuesta resolverlo.",
  },
  {
    tipo: "herramienta",
    escuchar: "Pregunta cuál y desde cuándo la usan.",
    reconocer: "Qué bueno que ya tengan algo andando.",
    explorar: "¿Qué tanto la usa el equipo? ¿Qué no les resuelve hoy?",
    responder: "No se trata de cambiar de herramienta, sino de que funcione lo que ya pagan para llegar a su meta.",
  },
  {
    tipo: "momento",
    escuchar: "Pregunta qué está pasando ahora en la empresa.",
    reconocer: "Entiendo que hay prioridades que mandan.",
    explorar: "¿Qué tendría que pasar para que sí lo fuera? ¿Qué pasa si esperan seis meses?",
    responder: "Acuerda una fecha concreta para retomarlo, atada a su meta.",
  },
  {
    tipo: "propuesta",
    escuchar: "No la mandes todavía: pregunta para qué la quiere.",
    reconocer: "Claro, es normal querer verlo por escrito.",
    explorar: "¿Qué tendría que traer para que tenga sentido? ¿Quién más la va a leer?",
    responder: "Una propuesta sin su meta en cifras se compara solo por precio: propón revisarla juntos en una reunión corta.",
  },
];

/** La señal de poca apertura, y qué hacer con ella. */
export const POCA_APERTURA_DE_BASE =
  "Si no te deja explorar (responde corto, pide el precio de una vez, no quiere hablar de su operación): o se descarta, o se le vende un caso concreto para el resultado que pide, sin diagnóstico.";

export const CIERRE_DE_BASE = "Resume lo que entendiste, pregunta si falta algo y agenda ahí mismo la próxima reunión, con fecha y con quien decide.";

// ── La guía que arma el agente ────────────────────────────────────────────────

/** Una pregunta de la guía: a qué apunta (una tarjeta del resumen o una dimensión), y tres repreguntas. */
export interface PreguntaDeLaGuia {
  /** La clave de una tarjeta del resumen o el id de una dimensión (`1.7`). */
  para: string;
  pregunta: string;
  repreguntas: string[];
}

export interface GuiaDeLaSesion {
  en: string;
  corridaId: string | null;
  /** Las tarjetas vacías y las dimensiones en foco con que se armó: si cambian, la guía quedó vieja. */
  huecos: string[];
  enfoque: string[];
  /** Cómo abrir la conversación, desde algo de la empresa. */
  apertura: string[];
  /** La escala explicada en simple: solo cuando no hizo el test y todavía no se habló. */
  escalaEnSimple: string | null;
  preguntas: PreguntaDeLaGuia[];
  objeciones: Objecion[];
  pocaApertura: string | null;
  cierre: string | null;
}

export const REPREGUNTAS_POR_PREGUNTA = 3;
export const MAX_PREGUNTAS_EN_LA_GUIA = 12;

/** ¿La guía se armó con otras tarjetas vacías u otras dimensiones en foco que las de hoy? */
export function guiaVieja(guia: Pick<GuiaDeLaSesion, "huecos" | "enfoque">, huecos: readonly string[], enfoque: readonly string[]): boolean {
  const igual = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
  return !igual(guia.huecos, huecos) || !igual(guia.enfoque, enfoque);
}

// ── Lo que se muestra ─────────────────────────────────────────────────────────

export interface PreguntaParaMostrar {
  para: string;
  tipo: "tarjeta" | "dimension";
  pregunta: string;
  repreguntas: string[];
}

/**
 * Las preguntas de la próxima reunión: las de la guía del agente que todavía apuntan a algo que
 * falta y, para lo que la guía no cubre, la pregunta de base (la de la tarjeta, o la de la
 * dimensión en la escala). Primero las tarjetas, después las dimensiones.
 */
export function preguntasParaMostrar(
  guia: Pick<GuiaDeLaSesion, "preguntas"> | null,
  huecos: readonly string[],
  enfoque: readonly string[],
  escala: EscalaDelLienzo,
): PreguntaParaMostrar[] {
  const preguntaDeLaDimension = (id: string) => escala.areas.flatMap((a) => a.dimensiones).find((d) => d.id === id)?.pregunta ?? null;
  const out: PreguntaParaMostrar[] = [];
  const armar = (para: string, tipo: PreguntaParaMostrar["tipo"], base: string | null) => {
    const delAgente = guia?.preguntas.filter((p) => p.para === para) ?? [];
    if (delAgente.length) for (const p of delAgente) out.push({ para, tipo, pregunta: p.pregunta, repreguntas: p.repreguntas });
    else if (base) out.push({ para, tipo, pregunta: base, repreguntas: [] });
  };
  for (const h of huecos) armar(h, "tarjeta", PREGUNTA_DE_BASE[h as keyof typeof PREGUNTA_DE_BASE] ?? null);
  for (const d of enfoque) armar(d, "dimension", preguntaDeLaDimension(d));
  return out;
}
