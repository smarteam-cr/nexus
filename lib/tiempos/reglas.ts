/**
 * lib/tiempos/reglas.ts — las reglas de «¿cuánto te tomó?» (2026-10-05). CLIENT-SAFE y puras.
 *
 * Se le pregunta a quien termina algo, en el momento: al marcar una tarea del cronograma como hecha o al
 * publicar un documento por primera vez. Las respuestas calibran las horas POR TIPO DE FASE de la carga de
 * Customer Success: con 20 respuestas de un tipo, su mediana reemplaza el supuesto. Nunca se muestran por
 * persona ni sirven para evaluar a nadie (docs/DECISIONS.md › «Tiempos»).
 *
 * Acá vive todo lo que decide algo: a quién y en qué tareas se pregunta, cada cuánto (muestreo y tope por
 * día), qué tarea es demasiado vieja para acordarse, y cómo se leen las respuestas (mediana, tasa). El
 * servidor (lib/tiempos/disparar.ts, resultados.ts) solo carga datos y llama a estas funciones.
 */

/* ── Los momentos ─────────────────────────────────────────────────────────────────── */

export type Momento = "TAREA_HECHA" | "DOCUMENTO_PUBLICADO" | "CIERRE_SEMANA";

export interface DefinicionDeMomento {
  clave: Momento;
  nombre: string;
  /** Cuándo sale, en una línea. */
  cuando: string;
  /** false = el momento existe en el diseño pero todavía no tiene pantalla: no se puede activar. */
  disponible: boolean;
  motivoNoDisponible?: string;
}

/** Sumar un momento = una entrada acá + llamar a su disparador desde el código. Aparece solo en Feedback › Encuestas. */
export const MOMENTOS: readonly DefinicionDeMomento[] = [
  {
    clave: "TAREA_HECHA",
    nombre: "Al marcar una tarea como hecha",
    cuando: "Al marcar como hecha una tarea del cronograma, también al aplicar el avance que propone la IA",
    disponible: true,
  },
  {
    clave: "DOCUMENTO_PUBLICADO",
    nombre: "Al publicar un documento",
    cuando: "Al compartir con el cliente un diagnóstico, una planificación, un kickoff o una entrega, la primera vez",
    disponible: true,
  },
  {
    clave: "CIERRE_SEMANA",
    nombre: "«Tu semana», los viernes",
    cuando: "El viernes en la tarde: trae lo ya anotado y pide solo lo que falta, por cliente",
    disponible: false,
    motivoNoDisponible: "Se activa cuando exista su pantalla",
  },
];

export const CLAVES_DE_MOMENTO = MOMENTOS.map((m) => m.clave);

export function definicionDe(momento: Momento): DefinicionDeMomento {
  return MOMENTOS.find((m) => m.clave === momento)!;
}

/* ── Tipos de fase, quién la hace y documentos ───────────────────────────────────── */

/** Los de `TimelineActivityType` más «SIN» (fases sin tipo, las de antes de D.1). */
export type TipoDeFase = "EXPLORACION" | "PLANIFICACION" | "CONFIGURACION" | "ADOPCION" | "SEGUIMIENTO" | "SIN";

export const TIPOS_DE_FASE: readonly { clave: TipoDeFase; nombre: string }[] = [
  { clave: "CONFIGURACION", nombre: "Configuración" },
  { clave: "PLANIFICACION", nombre: "Planificación" },
  { clave: "ADOPCION", nombre: "Adopción" },
  { clave: "SEGUIMIENTO", nombre: "Seguimiento" },
  { clave: "EXPLORACION", nombre: "Exploración" },
  { clave: "SIN", nombre: "Sin tipo" },
];

export function nombreDeTipo(t: string | null | undefined): string {
  return TIPOS_DE_FASE.find((x) => x.clave === t)?.nombre ?? "Sin tipo";
}

/** El tipo de una fase como se guarda en la pregunta: el del enum o «SIN». */
export function tipoDeFase(activityType: string | null | undefined): TipoDeFase {
  return TIPOS_DE_FASE.some((t) => t.clave === activityType && t.clave !== "SIN") ? (activityType as TipoDeFase) : "SIN";
}

export type Party = "SMARTEAM" | "AMBOS" | "CLIENTE" | "DEV";

export const PARTIES: readonly { clave: Party; nombre: string }[] = [
  { clave: "SMARTEAM", nombre: "Smarteam" },
  { clave: "AMBOS", nombre: "Ambos" },
  { clave: "CLIENTE", nombre: "Cliente" },
  { clave: "DEV", nombre: "Dev" },
];

/** Como el Gantt: una tarea sin dueño es de Smarteam (`effParty`). */
export function partyDe(p: string | null | undefined): Party {
  return p === "CLIENTE" || p === "AMBOS" || p === "DEV" ? p : "SMARTEAM";
}

export type Documento = "kickoff" | "diagnostico" | "planificacion" | "entrega";

export const DOCUMENTOS: readonly { clave: Documento; nombre: string }[] = [
  { clave: "diagnostico", nombre: "Diagnóstico" },
  { clave: "planificacion", nombre: "Planificación" },
  { clave: "kickoff", nombre: "Kickoff" },
  { clave: "entrega", nombre: "Entrega" },
];

export function nombreDeDocumento(d: string | null | undefined): string {
  return DOCUMENTOS.find((x) => x.clave === d)?.nombre ?? "Documento";
}

/* ── Constantes ───────────────────────────────────────────────────────────────────── */

/** Con estas respuestas de un tipo, su mediana reemplaza el supuesto de la carga. */
export const META_PARA_CALIBRAR = 20;
/** Con menos, la mediana no se muestra: un número suelto engaña. */
export const MINIMO_PARA_MEDIANA = 5;
/** Lo que no se responde queda estos días en «Para ti»; después vence. */
export const DIAS_PARA_RESPONDER = 3;
/** Una tarea marcada más de estos días después de su semana no pregunta: nadie se acuerda. */
export const DIAS_DE_GRACIA = 14;
/** Al aplicar un avance, como mucho estas preguntas juntas. */
export const MAXIMO_POR_LOTE = 3;

/**
 * Lo que la carga supone hoy por tipo de fase, en minutos. Son los del diseño «Rentabilidad y carga»
 * (Configuración 2 h, Planificación 1,5 h…): todavía no hay una carga en el código que los tenga. Cuando
 * exista, lee estos mismos números y, con 20 respuestas, la mediana (`calibracionPorTipo`).
 */
export const SUPUESTO_MINUTOS: Readonly<Record<TipoDeFase, number>> = {
  CONFIGURACION: 120,
  PLANIFICACION: 90,
  EXPLORACION: 60,
  ADOPCION: 60,
  SEGUIMIENTO: 30,
  SIN: 90,
};

/* ── La configuración de una encuesta ─────────────────────────────────────────────── */

export interface OpcionDeTiempo {
  texto: string;
  minutos: number;
}

export type ModoDeEstimacion = "despues" | "lado" | "no";
export type ModoDeMuestreo = "todas" | "uno_de" | "calibrar";

export interface ConfigDeEncuesta {
  v: 1;
  /** A quién: alcanza con que la persona cumpla UNA de las tres listas. */
  aQuien: { roles: string[]; frentes: string[]; personas: string[] };
  /** Solo TAREA_HECHA: en qué tareas. `proyectos` vacío = todos. */
  tareas: { tipos: TipoDeFase[]; parties: Party[]; proyectos: string[] };
  /** Solo DOCUMENTO_PUBLICADO: qué documentos. */
  documentos: Documento[];
  pregunta: string;
  /** Las opciones de un clic. «Otro» va siempre, aparte. */
  opciones: OpcionDeTiempo[];
  /** Cuándo se ve lo que supone la carga: después de responder (no empuja la respuesta), al lado o nunca. */
  estimacion: ModoDeEstimacion;
  muestreo: { modo: ModoDeMuestreo; cadaN: number };
  /** Cuántas preguntas por persona y por día, como mucho. null = sin tope. */
  topePorDia: number | null;
}

const OPCIONES_DE_TAREA: OpcionDeTiempo[] = [
  { texto: "15 min", minutos: 15 },
  { texto: "30 min", minutos: 30 },
  { texto: "1 h", minutos: 60 },
  { texto: "2 h", minutos: 120 },
  { texto: "Medio día", minutos: 240 },
  { texto: "Un día", minutos: 480 },
];

const OPCIONES_DE_DOCUMENTO: OpcionDeTiempo[] = [
  { texto: "1 h", minutos: 60 },
  { texto: "2 h", minutos: 120 },
  { texto: "Medio día", minutos: 240 },
  { texto: "Un día", minutos: 480 },
  { texto: "Dos días", minutos: 960 },
];

const TODOS_LOS_TIPOS: TipoDeFase[] = TIPOS_DE_FASE.map((t) => t.clave);

export const CONFIG_POR_DEFECTO: Readonly<Record<Momento, ConfigDeEncuesta>> = {
  TAREA_HECHA: {
    v: 1,
    aQuien: { roles: ["CSE", "CSL"], frentes: [], personas: [] },
    tareas: { tipos: TODOS_LOS_TIPOS, parties: ["SMARTEAM", "AMBOS"], proyectos: [] },
    documentos: [],
    pregunta: "¿Cuánto te tomó?",
    opciones: OPCIONES_DE_TAREA,
    estimacion: "despues",
    muestreo: { modo: "calibrar", cadaN: 3 },
    topePorDia: 3,
  },
  DOCUMENTO_PUBLICADO: {
    v: 1,
    aQuien: { roles: ["CSE", "CSL"], frentes: [], personas: [] },
    tareas: { tipos: TODOS_LOS_TIPOS, parties: ["SMARTEAM", "AMBOS"], proyectos: [] },
    documentos: DOCUMENTOS.map((d) => d.clave),
    pregunta: "¿Cuánto tiempo le dedicaste?",
    opciones: OPCIONES_DE_DOCUMENTO,
    estimacion: "despues",
    muestreo: { modo: "todas", cadaN: 3 },
    topePorDia: null,
  },
  CIERRE_SEMANA: {
    v: 1,
    aQuien: { roles: ["CSE", "CSL"], frentes: [], personas: [] },
    tareas: { tipos: TODOS_LOS_TIPOS, parties: ["SMARTEAM", "AMBOS"], proyectos: [] },
    documentos: [],
    pregunta: "¿Hubo algo más que te tomó tiempo esta semana?",
    opciones: OPCIONES_DE_TAREA,
    estimacion: "no",
    muestreo: { modo: "todas", cadaN: 3 },
    topePorDia: 1,
  },
};

const esTexto = (x: unknown): x is string => typeof x === "string";
const listaDe = <T extends string>(x: unknown, validos: readonly T[]): T[] | null =>
  Array.isArray(x) ? (x.filter((v) => esTexto(v) && (validos as readonly string[]).includes(v)) as T[]) : null;

/**
 * La configuración guardada, leída con tolerancia: cada campo que falta o no se entiende toma el valor por
 * defecto del momento. Así una configuración vieja no rompe la pregunta.
 */
export function leerConfig(json: unknown, momento: Momento): ConfigDeEncuesta {
  const base = CONFIG_POR_DEFECTO[momento];
  if (!json || typeof json !== "object") return structuredClone(base);
  const j = json as Record<string, unknown>;
  const aq = (j.aQuien ?? {}) as Record<string, unknown>;
  const ta = (j.tareas ?? {}) as Record<string, unknown>;
  const mu = (j.muestreo ?? {}) as Record<string, unknown>;
  const opciones = Array.isArray(j.opciones)
    ? (j.opciones as unknown[])
        .map((o) => o as Record<string, unknown>)
        .filter((o) => esTexto(o?.texto) && o.texto.trim() && Number.isInteger(o.minutos) && (o.minutos as number) > 0)
        .map((o) => ({ texto: (o.texto as string).trim(), minutos: o.minutos as number }))
    : null;
  const cadaN = Number.isInteger(mu.cadaN) && (mu.cadaN as number) >= 2 ? (mu.cadaN as number) : base.muestreo.cadaN;
  const tope = j.topePorDia === null ? null : Number.isInteger(j.topePorDia) && (j.topePorDia as number) > 0 ? (j.topePorDia as number) : base.topePorDia;
  return {
    v: 1,
    aQuien: {
      roles: Array.isArray(aq.roles) ? aq.roles.filter(esTexto) : base.aQuien.roles,
      frentes: Array.isArray(aq.frentes) ? aq.frentes.filter(esTexto) : base.aQuien.frentes,
      personas: Array.isArray(aq.personas) ? aq.personas.filter(esTexto).map((e) => e.toLowerCase()) : base.aQuien.personas,
    },
    tareas: {
      tipos: listaDe(ta.tipos, TODOS_LOS_TIPOS) ?? base.tareas.tipos,
      parties: listaDe(ta.parties, PARTIES.map((p) => p.clave)) ?? base.tareas.parties,
      proyectos: Array.isArray(ta.proyectos) ? ta.proyectos.filter(esTexto) : base.tareas.proyectos,
    },
    documentos: listaDe(j.documentos, DOCUMENTOS.map((d) => d.clave)) ?? base.documentos,
    pregunta: esTexto(j.pregunta) && j.pregunta.trim() ? j.pregunta.trim() : base.pregunta,
    opciones: opciones && opciones.length > 0 ? opciones : base.opciones,
    estimacion: j.estimacion === "lado" || j.estimacion === "no" || j.estimacion === "despues" ? j.estimacion : base.estimacion,
    muestreo: {
      modo: mu.modo === "todas" || mu.modo === "uno_de" || mu.modo === "calibrar" ? mu.modo : base.muestreo.modo,
      cadaN,
    },
    topePorDia: tope,
  };
}

/* ── A quién y en qué ─────────────────────────────────────────────────────────────── */

export interface PersonaQueResponde {
  email: string;
  rol: string;
  frentes: readonly string[];
}

/** Le llega si su rol, uno de sus frentes o su correo está en la encuesta. */
export function aplicaAPersona(c: ConfigDeEncuesta, p: PersonaQueResponde): boolean {
  return (
    c.aQuien.roles.includes(p.rol) ||
    p.frentes.some((f) => c.aQuien.frentes.includes(f)) ||
    c.aQuien.personas.includes(p.email.toLowerCase())
  );
}

export interface TareaCandidata {
  id: string;
  titulo: string;
  tipo: TipoDeFase;
  party: Party;
  projectId: string;
  /** Fin de su semana según el arranque del cronograma (o su fecha fijada). null = sin fechas. */
  finPlaneado: Date | null;
}

export function aplicaATarea(c: ConfigDeEncuesta, t: Pick<TareaCandidata, "tipo" | "party" | "projectId">): boolean {
  return (
    c.tareas.tipos.includes(t.tipo) &&
    c.tareas.parties.includes(t.party) &&
    (c.tareas.proyectos.length === 0 || c.tareas.proyectos.includes(t.projectId))
  );
}

/** Marcada más de DIAS_DE_GRACIA días después del fin de su semana: ya nadie se acuerda de cuánto tomó. */
export function marcadaDemasiadoTarde(finPlaneado: Date | null, marcadaAt: Date): boolean {
  if (!finPlaneado) return false;
  return marcadaAt.getTime() - finPlaneado.getTime() > DIAS_DE_GRACIA * 24 * 60 * 60 * 1000;
}

/* ── Cada cuánto ──────────────────────────────────────────────────────────────────── */

/** FNV-1a de 32 bits: la misma clave cae siempre igual (desmarcar y volver a marcar no cambia nada). */
export function huella(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** ¿Le toca pregunta a esta cosa? `respuestasDelTipo` = cuántas respuestas ya tiene su tipo de fase. */
export function tocaPorMuestreo(c: ConfigDeEncuesta, clave: string, respuestasDelTipo: number): boolean {
  const uno = huella(clave) % Math.max(2, c.muestreo.cadaN) === 0;
  if (c.muestreo.modo === "todas") return true;
  if (c.muestreo.modo === "uno_de") return uno;
  return respuestasDelTipo < META_PARA_CALIBRAR || uno;
}

/** Cuántas preguntas más le caben hoy a la persona. */
export function caben(c: ConfigDeEncuesta, yaHoy: number): number {
  return c.topePorDia === null ? Number.POSITIVE_INFINITY : Math.max(0, c.topePorDia - yaHoy);
}

/**
 * Las tareas de un avance aplicado (varias a la vez) que llevan pregunta: las que pasan el muestreo, una por tipo
 * de fase, primero los tipos con menos respuestas, hasta MAXIMO_POR_LOTE y lo que quede del tope del día. Un
 * avance llegó a marcar 94 tareas en un día: preguntar por todas sería un formulario que se cierra sin leer.
 */
export function elegirDelLote<T extends { clave: string; tipo: TipoDeFase }>(
  c: ConfigDeEncuesta,
  candidatas: readonly T[],
  respuestasPorTipo: Readonly<Partial<Record<TipoDeFase, number>>>,
  yaHoy: number,
): T[] {
  const cupo = Math.min(MAXIMO_POR_LOTE, caben(c, yaHoy));
  if (cupo <= 0) return [];
  const pasan = candidatas.filter((t) => tocaPorMuestreo(c, t.clave, respuestasPorTipo[t.tipo] ?? 0));
  const porTipo = new Map<TipoDeFase, T>();
  for (const t of pasan) if (!porTipo.has(t.tipo)) porTipo.set(t.tipo, t);
  return [...porTipo.values()]
    .sort((a, b) => (respuestasPorTipo[a.tipo] ?? 0) - (respuestasPorTipo[b.tipo] ?? 0))
    .slice(0, cupo);
}

/* ── El estado de una pregunta ────────────────────────────────────────────────────── */

export type EstadoGuardado = "pendiente" | "respondida" | "omitida" | "retirada";
export type EstadoVisible = EstadoGuardado | "vencida";
export type MotivoDeOmision = "omitir" | "no_lo_hice";

/** Una pendiente que pasó su plazo cuenta como vencida: no se guarda, se deriva. */
export function estadoVisible(estado: string, venceAt: Date, ahora: Date): EstadoVisible {
  if (estado === "pendiente") return venceAt.getTime() <= ahora.getTime() ? "vencida" : "pendiente";
  return estado === "respondida" || estado === "omitida" || estado === "retirada" ? estado : "pendiente";
}

export function venceEn(desde: Date): Date {
  return new Date(desde.getTime() + DIAS_PARA_RESPONDER * 24 * 60 * 60 * 1000);
}

export const claveDeTarea = (taskId: string) => `tarea:${taskId}`;
/** Con esta clave «Para ti» reconoce el pendiente de tiempos y lo abre ahí mismo (components/tiempos/PendienteDeTiempos). */
export const PENDIENTE_DE_TIEMPOS = "tiempos";
export const claveDeDocumento = (projectId: string, doc: Documento) => `doc:${projectId}:${doc}`;

/* ── Fechas, en la hora de Costa Rica (UTC-6, sin horario de verano) ──────────────── */

const SEIS_HORAS = 6 * 60 * 60 * 1000;
const DIAS_DE_LA_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** La medianoche de hoy en Costa Rica: desde ahí cuenta el tope del día. */
export function inicioDelDiaCR(ahora: Date): Date {
  const cr = new Date(ahora.getTime() - SEIS_HORAS);
  return new Date(Date.UTC(cr.getUTCFullYear(), cr.getUTCMonth(), cr.getUTCDate()) + SEIS_HORAS);
}

/** «hoy», «ayer», «el miércoles» (esta semana) o «el 2 oct». */
export function cuandoFue(fecha: Date, ahora: Date): string {
  const dias = Math.round((inicioDelDiaCR(ahora).getTime() - inicioDelDiaCR(fecha).getTime()) / (24 * 60 * 60 * 1000));
  const cr = new Date(fecha.getTime() - SEIS_HORAS);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 7) return `el ${DIAS_DE_LA_SEMANA[cr.getUTCDay()]}`;
  return `el ${cr.getUTCDate()} ${MESES[cr.getUTCMonth()]}`;
}

/* ── Cómo se leen las respuestas ──────────────────────────────────────────────────── */

/** «45 min», «1 h», «1 h 30», «8 h». */
export function formatoMinutos(min: number): string {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min - h * 60);
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/** Cuantil por interpolación lineal sobre los valores ordenados. */
export function cuantil(valores: readonly number[], q: number): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return Math.round(v[lo] + (v[hi] - v[lo]) * (pos - lo));
}

export interface CalibracionDeTipo {
  tipo: TipoDeFase;
  nombre: string;
  respuestas: number;
  /** null con menos de MINIMO_PARA_MEDIANA respuestas. */
  mediana: number | null;
  /** La mitad del medio (percentiles 25 y 75), con la misma condición. */
  p25: number | null;
  p75: number | null;
  supuesto: number;
  calibra: boolean;
}

/** Por tipo de fase: cuántas respuestas hay, su mediana y si ya alcanzan para reemplazar el supuesto. */
export function calibracionPorTipo(respuestas: readonly { tipo: string | null; minutos: number }[]): CalibracionDeTipo[] {
  return TIPOS_DE_FASE.map(({ clave, nombre }) => {
    const mins = respuestas.filter((r) => tipoDeFase(r.tipo) === clave).map((r) => r.minutos);
    const alcanza = mins.length >= MINIMO_PARA_MEDIANA;
    return {
      tipo: clave,
      nombre,
      respuestas: mins.length,
      mediana: alcanza ? cuantil(mins, 0.5) : null,
      p25: alcanza ? cuantil(mins, 0.25) : null,
      p75: alcanza ? cuantil(mins, 0.75) : null,
      supuesto: SUPUESTO_MINUTOS[clave],
      calibra: mins.length >= META_PARA_CALIBRAR,
    };
  });
}

/** Lo que la carga usa hoy para un tipo: la mediana si ya calibra, si no el supuesto. */
export function minutosDeLaCarga(c: Pick<CalibracionDeTipo, "calibra" | "mediana" | "supuesto">): number {
  return c.calibra && c.mediana !== null ? c.mediana : c.supuesto;
}

export interface Tasa {
  /** Las que ya se cerraron: respondidas + omitidas + vencidas (las retiradas y las que esperan no cuentan). */
  cerradas: number;
  respondidas: number;
  omitidas: number;
  noLoHice: number;
  vencidas: number;
  esperando: number;
  retiradas: number;
  /** 0–100, o null sin preguntas cerradas. */
  porcentaje: number | null;
}

export function tasaDeRespuesta(
  preguntas: readonly { estado: string; motivoOmision: string | null; venceAt: Date }[],
  ahora: Date,
): Tasa {
  const t: Tasa = { cerradas: 0, respondidas: 0, omitidas: 0, noLoHice: 0, vencidas: 0, esperando: 0, retiradas: 0, porcentaje: null };
  for (const p of preguntas) {
    const e = estadoVisible(p.estado, p.venceAt, ahora);
    if (e === "respondida") t.respondidas++;
    else if (e === "omitida") {
      if (p.motivoOmision === "no_lo_hice") t.noLoHice++;
      else t.omitidas++;
    } else if (e === "vencida") t.vencidas++;
    else if (e === "retirada") t.retiradas++;
    else t.esperando++;
  }
  t.cerradas = t.respondidas + t.omitidas + t.noLoHice + t.vencidas;
  t.porcentaje = t.cerradas === 0 ? null : Math.round((t.respondidas / t.cerradas) * 100);
  return t;
}

/** La línea que dice qué supone la carga, para mostrar al lado o después de responder. null si no hay supuesto. */
export function textoDeEstimacion(tipo: TipoDeFase | null, minutos: number | null, calibrada: boolean): string | null {
  if (minutos === null || tipo === null) return null;
  const que = tipo === "SIN" ? "una tarea sin tipo de fase" : `una tarea de ${nombreDeTipo(tipo)}`;
  return calibrada
    ? `Lo que suele tomar ${que}, según lo que anotó el equipo: ${formatoMinutos(minutos)}.`
    : `La carga supone ${formatoMinutos(minutos)} para ${que}.`;
}
