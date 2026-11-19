/**
 * lib/timeline/limites.ts — LOS LÍMITES ACORDADOS DEL CRONOGRAMA (2026-10-02). PURO: lo usan el
 * servidor (handoff, API, contexto del chat) y la pantalla (aviso, mensaje de la propuesta).
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * Validación del 2026-10-02 sobre los 50 cronogramas activos: la fecha límite del cliente y la
 * duración vendida no existían como dato en ningún lado, así que nada podía compararse contra
 * ellas. En 7 de las 14 cuentas donde el handoff nombraba la duración, el plan que armó la IA se
 * pasaba, y nadie lo avisó. Caso real: Club Amantes del Vino, vendido en 12 semanas con la
 * suscripción de Salesforce venciendo el 31 de diciembre; el handoff lo sabía, propuso 16 semanas
 * hasta el 11 de enero, y el aviso de la propuesta lo presentó como mejora.
 *
 * ── LAS DECISIONES (Elías, 2026-10-02) ───────────────────────────────────────
 *  1. La duración vendida NO incluye la Semana 0: se compara contra el plan sin ella.
 *  2. Pasarse AVISA, no bloquea (ni «Subir al cliente» ni aplicar una propuesta).
 *  3. La IA del handoff propone los dos límites, con la frase de donde los sacó. Los confirma
 *     Ventas; si Ventas no, el CSL o el CSE. Queda escrito quién (`ConfirmacionDeLimite`).
 *  4. Mover un límite ya confirmado es un acuerdo con el cliente: pide motivo y con quién se
 *     acordó (`validarCambioDeLimite`), y queda en el historial del cronograma.
 *
 * ── QUÉ VALE MIENTRAS NADIE CONFIRMA ─────────────────────────────────────────
 * El límite confirmado manda. Sin confirmado, vale lo que propuso la IA SOLO si su cita aparece tal
 * cual en las fuentes que leyó (`citaVerificada`): el aviso funciona desde que la IA lo propone, y
 * dice que está sin confirmar. Una propuesta sin cita verificada se muestra para revisar, pero no
 * dispara ningún aviso: un límite inventado no puede alarmar a nadie.
 *
 * ── LA CUENTA ────────────────────────────────────────────────────────────────
 * CORREGIDO 2026-11-18 (RC · DocuSign): la fecha límite se compara contra el ÚLTIMO DÍA de la última
 * semana (`ultimoDiaDelPlan`), no contra `projectedEnd`, que es el día SIGUIENTE (arranque + ancho de
 * calendario, exclusivo). Un plan de 4 semanas desde el martes 17 nov termina el lunes 14 dic: con el
 * martes 15 el aviso decía «se pasa 4 días» cuando eran 3, y el botón no tenía qué fecha proponer. La
 * fecha límite se compara por día de calendario UTC, como el resto de las fechas que salen del ancla.
 *
 * ── LAS HORAS (2026-11-18, Elías: «sí debería poder, pero debe avisar») ──────
 * Un tercer límite para el proyecto que sale de un contrato de horas: `horasVendidas`. Se compara
 * contra la suma de las horas estimadas de las tareas (`TimelineTask.horasEstimadas`, que pone el
 * detalle desde las actividades). Sin tareas con horas no hay cuenta: el aviso lo dice.
 */
import { PRIMERA_FASE_ES_ARRANQUE } from "./arranque";
import { addWeeks, computePhaseRanges, fmtFull, plural, projectedEnd, type ProjectedEnd } from "./weeks";

export const MAX_SEMANAS_VENDIDAS = 104;
export const MAX_HORAS_VENDIDAS = 5000;
export const MAX_LARGO_CITA = 300;
export const MAX_LARGO_NO_CABE = 400;
export const MAX_LARGO_MOTIVO = 500;
/** Lo mínimo que se le pide a «con quién se acordó» y al motivo de mover un límite confirmado. */
export const MIN_LARGO_ACUERDO = 3;

export type CampoDeLimite = "fechaLimite" | "duracionVendida" | "horasVendidas";

/** Quién confirmó un límite. `rol` es el de esa persona EN ESE MOMENTO (si cambia de rol, no se reescribe). */
export interface ConfirmacionDeLimite {
  /** El correo de quien lo confirmó. */
  por: string;
  /** Su nombre, para mostrarlo sin ir a buscarlo. */
  nombre: string | null;
  rol: string | null;
  en: string;
  /** De dónde salió: la cita que confirmó, o lo que escribió quien lo cargó a mano. */
  fuente: string | null;
}

export interface ConfirmacionesDeLimites {
  fechaLimite?: ConfirmacionDeLimite;
  duracionVendida?: ConfirmacionDeLimite;
  horasVendidas?: ConfirmacionDeLimite;
}

export interface PropuestaDeLimite<T> {
  valor: T;
  /** La frase de la fuente, copiada tal cual. */
  cita: string;
  /** ¿La cita aparece en lo que la IA leyó? Sin eso, la propuesta no dispara avisos. */
  citaVerificada: boolean;
}

export interface LimitesPropuestos {
  runId: string | null;
  en: string;
  fechaLimite?: PropuestaDeLimite<string>;
  duracionVendida?: PropuestaDeLimite<number>;
  horasVendidas?: PropuestaDeLimite<number>;
  /** Lo que la IA dijo que no cabe en el plazo, en una oración. */
  noCabe?: string;
}

/** Lo que viaja a la pantalla y al chat. */
export interface LimitesDelCronograma {
  /** YYYY-MM-DD, o null. */
  fechaLimite: string | null;
  duracionVendidaSemanas: number | null;
  /** Las horas vendidas para ESTE proyecto (2026-11-18), o null. */
  horasVendidas: number | null;
  confirmacion: ConfirmacionesDeLimites;
  propuestos: LimitesPropuestos | null;
  /** ¿El proyecto tiene Semana 0? (Customer Success sí; Desarrollo y Web no). Lo vendido se cuenta sin ella. */
  conSemanaCero: boolean;
}

export const SIN_LIMITES: Omit<LimitesDelCronograma, "conSemanaCero"> = {
  fechaLimite: null,
  duracionVendidaSemanas: null,
  horasVendidas: null,
  confirmacion: {},
  propuestos: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// ── LEER LO GUARDADO (tolerante: es Json) ────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const esObjeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const texto = (x: unknown, max: number): string | null => {
  if (typeof x !== "string") return null;
  const t = x.trim();
  return t ? t.slice(0, max) : null;
};

/** ¿«AAAA-MM-DD» de un día que existe, entre 2020 y 2100? */
export function esFechaYmd(x: unknown): x is string {
  if (typeof x !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const [y, m, d] = x.split("-").map(Number);
  if (y < 2020 || y > 2100) return false;
  const f = new Date(Date.UTC(y, m - 1, d));
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

export function esSemanasVendidas(x: unknown): x is number {
  return typeof x === "number" && Number.isInteger(x) && x >= 1 && x <= MAX_SEMANAS_VENDIDAS;
}

export function esHorasVendidas(x: unknown): x is number {
  return typeof x === "number" && Number.isInteger(x) && x >= 1 && x <= MAX_HORAS_VENDIDAS;
}

/** El día de una fecha guardada (DateTime a medianoche UTC) como «AAAA-MM-DD». */
export function ymdDeFecha(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const f = new Date(d);
  return Number.isNaN(f.getTime()) ? null : f.toISOString().slice(0, 10);
}

function leerConfirmacionDe(x: unknown): ConfirmacionDeLimite | undefined {
  if (!esObjeto(x)) return undefined;
  const por = texto(x.por, 200);
  const en = texto(x.en, 40);
  if (!por || !en) return undefined;
  return { por, nombre: texto(x.nombre, 120), rol: texto(x.rol, 40), en, fuente: texto(x.fuente, MAX_LARGO_CITA + MAX_LARGO_MOTIVO) };
}

export function leerConfirmaciones(json: unknown): ConfirmacionesDeLimites {
  if (!esObjeto(json)) return {};
  const fechaLimite = leerConfirmacionDe(json.fechaLimite);
  const duracionVendida = leerConfirmacionDe(json.duracionVendida);
  const horasVendidas = leerConfirmacionDe(json.horasVendidas);
  return {
    ...(fechaLimite ? { fechaLimite } : {}),
    ...(duracionVendida ? { duracionVendida } : {}),
    ...(horasVendidas ? { horasVendidas } : {}),
  };
}

export function leerPropuestos(json: unknown): LimitesPropuestos | null {
  if (!esObjeto(json)) return null;
  const out: LimitesPropuestos = { runId: texto(json.runId, 60), en: texto(json.en, 40) ?? "" };
  const f = json.fechaLimite;
  if (esObjeto(f) && esFechaYmd(f.valor) && texto(f.cita, MAX_LARGO_CITA)) {
    out.fechaLimite = { valor: f.valor, cita: texto(f.cita, MAX_LARGO_CITA)!, citaVerificada: f.citaVerificada === true };
  }
  const d = json.duracionVendida;
  if (esObjeto(d) && esSemanasVendidas(d.valor) && texto(d.cita, MAX_LARGO_CITA)) {
    out.duracionVendida = { valor: d.valor, cita: texto(d.cita, MAX_LARGO_CITA)!, citaVerificada: d.citaVerificada === true };
  }
  const h = json.horasVendidas;
  if (esObjeto(h) && esHorasVendidas(h.valor) && texto(h.cita, MAX_LARGO_CITA)) {
    out.horasVendidas = { valor: h.valor, cita: texto(h.cita, MAX_LARGO_CITA)!, citaVerificada: h.citaVerificada === true };
  }
  const noCabe = texto(json.noCabe, MAX_LARGO_NO_CABE);
  if (noCabe) out.noCabe = noCabe;
  return hayAlgoPropuesto(out) ? out : null;
}

const hayAlgoPropuesto = (p: LimitesPropuestos) => !!(p.fechaLimite || p.duracionVendida || p.horasVendidas || p.noCabe);

/** Las filas de la base → lo que viaja. */
export function limitesDeLaFila(fila: {
  fechaLimite: Date | string | null;
  duracionVendidaSemanas: number | null;
  /** Opcional: las lecturas de antes del 2026-11-18 no la traen. */
  horasVendidas?: number | null;
  limitesConfirmacion: unknown;
  limitesPropuestos: unknown;
  conSemanaCero: boolean;
}): LimitesDelCronograma {
  return {
    fechaLimite: ymdDeFecha(fila.fechaLimite),
    duracionVendidaSemanas: esSemanasVendidas(fila.duracionVendidaSemanas) ? fila.duracionVendidaSemanas : null,
    horasVendidas: esHorasVendidas(fila.horasVendidas) ? fila.horasVendidas : null,
    confirmacion: leerConfirmaciones(fila.limitesConfirmacion),
    propuestos: leerPropuestos(fila.limitesPropuestos),
    conSemanaCero: fila.conSemanaCero,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LO QUE VALE ──────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export interface LimiteVigente<T> {
  valor: T;
  origen: "confirmado" | "propuesto";
}

/** Lo que leen los límites: `horasVendidas` es opcional para las lecturas de antes del 2026-11-18. */
export type LimitesParaRevisar = Pick<LimitesDelCronograma, "fechaLimite" | "duracionVendidaSemanas" | "propuestos"> &
  Partial<Pick<LimitesDelCronograma, "horasVendidas">>;

/** El confirmado; si no hay, el propuesto con cita verificada; si no, ninguno. */
export function limitesVigentes(l: LimitesParaRevisar): {
  fecha: LimiteVigente<string> | null;
  duracion: LimiteVigente<number> | null;
  horas: LimiteVigente<number> | null;
} {
  const pf = l.propuestos?.fechaLimite;
  const pd = l.propuestos?.duracionVendida;
  const ph = l.propuestos?.horasVendidas;
  return {
    horas:
      l.horasVendidas != null
        ? { valor: l.horasVendidas, origen: "confirmado" }
        : ph?.citaVerificada
          ? { valor: ph.valor, origen: "propuesto" }
          : null,
    fecha: l.fechaLimite
      ? { valor: l.fechaLimite, origen: "confirmado" }
      : pf?.citaVerificada
        ? { valor: pf.valor, origen: "propuesto" }
        : null,
    duracion:
      l.duracionVendidaSemanas != null
        ? { valor: l.duracionVendidaSemanas, origen: "confirmado" }
        : pd?.citaVerificada
          ? { valor: pd.valor, origen: "propuesto" }
          : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LA REVISIÓN ──────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export interface FaseConNombre {
  name: string;
  durationWeeks: number;
  startWeek?: number | null;
  /** Sus tareas, para sumar las horas (opcional: sin ellas no hay cuenta de horas). */
  tasks?: ReadonlyArray<{ horasEstimadas?: number | null; status?: string | null; party?: string | null }>;
}

/**
 * Las semanas que ocupa la Semana 0 al principio del plan: el fin de la primera fase si es un
 * arranque que empieza en la semana 0 y el proyecto tiene Semana 0. Si no, 0.
 */
export function semanasDeArranque(fases: readonly FaseConNombre[], conSemanaCero: boolean): number {
  if (!conSemanaCero || fases.length === 0 || !PRIMERA_FASE_ES_ARRANQUE.test(fases[0].name)) return 0;
  const r = computePhaseRanges(fases as FaseConNombre[])[0];
  return r.start === 0 ? r.end : 0;
}

const DIA_MS = 86_400_000;
const SEMANA_MS = 7 * DIA_MS;
const diaUTC = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const diaDe = (ymd: string) => Date.parse(`${ymd}T00:00:00.000Z`);

/**
 * El ÚLTIMO DÍA de trabajo de un plan (o de una fase) que termina en la semana `fin` (exclusiva) contando desde el
 * ancla: el día antes de `addWeeks(ancla, fin)`. Es contra este día que se compara la fecha límite (2026-11-18).
 */
export function ultimoDiaDeLaSemana(ancla: string, fin: number): number {
  return diaUTC(addWeeks(ancla, fin)) - DIA_MS;
}

/** El último día del plan como «AAAA-MM-DD», o null sin ancla. */
export function ultimoDiaDelPlan(ancla: string | null | undefined, fases: readonly FaseConNombre[]): string | null {
  if (!ancla) return null;
  const c = projectedEnd(ancla, fases as FaseConNombre[]);
  if (!c.date) return null;
  return new Date(ultimoDiaDeLaSemana(ancla, c.spanWeeks)).toISOString().slice(0, 10);
}

/** Las horas estimadas del plan: la suma de las tareas que las tienen (sin las suspendidas ni las que hace solo el
 *  cliente: no gastan las horas vendidas de Smarteam). */
export function horasDelPlan(fases: readonly FaseConNombre[]): { horas: number; conHoras: number; sinHoras: number } {
  let horas = 0;
  let conHoras = 0;
  let sinHoras = 0;
  for (const f of fases) {
    for (const t of f.tasks ?? []) {
      if (t.status === "SUSPENDED" || t.party === "CLIENTE") continue;
      if (typeof t.horasEstimadas === "number" && Number.isFinite(t.horasEstimadas) && t.horasEstimadas > 0) {
        horas += t.horasEstimadas;
        conHoras++;
      } else sinHoras++;
    }
  }
  return { horas: Math.round(horas * 10) / 10, conHoras, sinHoras };
}

export interface RevisionDeLimites {
  /** Semanas de la Semana 0 al principio (no cuentan contra lo vendido). */
  semanasDeArranque: number;
  /** El ancho de calendario SIN la Semana 0: lo que se compara contra lo vendido. */
  semanasDelPlan: number;
  cierre: ProjectedEnd;
  duracion: null | { vendidas: number; delPlan: number; deMas: number; origen: LimiteVigente<number>["origen"] };
  /** Las horas vendidas contra las estimadas de las tareas. `delPlan` null = ninguna tarea tiene horas. */
  horas: null | {
    vendidas: number;
    delPlan: number | null;
    deMas: number | null;
    sinHoras: number;
    origen: LimiteVigente<number>["origen"];
  };
  fecha: null | {
    limite: string;
    origen: LimiteVigente<string>["origen"];
    /** «AAAA-MM-DD» del ÚLTIMO DÍA del plan, o null sin fecha de arranque (no se puede comparar). */
    cierre: string | null;
    /** Días del cierre después de la fecha límite (negativo = antes). null sin arranque. */
    diasDeMas: number | null;
    /** Las fases que terminan después de la fecha límite, en orden. */
    fasesQueSePasan: string[];
    /** Cuántas semanas del plan caben antes de la fecha límite, contando desde el arranque. */
    semanasQueCaben: number | null;
  };
  /** ¿Algún límite vigente se pasa? */
  seSale: boolean;
}

/** ⭐ El plan contra los límites vigentes. `fases` YA ordenadas por `order`. */
export function revisarLimites(i: {
  ancla: string | null | undefined;
  fases: readonly FaseConNombre[];
  limites: LimitesParaRevisar & Pick<LimitesDelCronograma, "conSemanaCero">;
}): RevisionDeLimites {
  const fases = i.fases as FaseConNombre[];
  const cierre = projectedEnd(i.ancla ?? null, fases);
  const arranque = semanasDeArranque(fases, i.limites.conSemanaCero);
  const semanasDelPlan = Math.max(0, cierre.spanWeeks - arranque);
  const vigentes = limitesVigentes(i.limites);

  const duracion = vigentes.duracion
    ? {
        vendidas: vigentes.duracion.valor,
        delPlan: semanasDelPlan,
        deMas: semanasDelPlan - vigentes.duracion.valor,
        origen: vigentes.duracion.origen,
      }
    : null;

  let horas: RevisionDeLimites["horas"] = null;
  if (vigentes.horas) {
    const h = horasDelPlan(fases);
    const delPlan = h.conHoras > 0 ? h.horas : null;
    horas = {
      vendidas: vigentes.horas.valor,
      delPlan,
      deMas: delPlan === null ? null : Math.round((delPlan - vigentes.horas.valor) * 10) / 10,
      sinHoras: h.sinHoras,
      origen: vigentes.horas.origen,
    };
  }

  let fecha: RevisionDeLimites["fecha"] = null;
  if (vigentes.fecha) {
    const limite = diaDe(vigentes.fecha.valor);
    const rangos = computePhaseRanges(fases);
    const conAncla = !!i.ancla && cierre.date !== null;
    const ultimo = conAncla ? ultimoDiaDeLaSemana(i.ancla!, cierre.spanWeeks) : null;
    fecha = {
      limite: vigentes.fecha.valor,
      origen: vigentes.fecha.origen,
      cierre: ultimo !== null ? new Date(ultimo).toISOString().slice(0, 10) : null,
      diasDeMas: ultimo !== null ? Math.round((ultimo - limite) / DIA_MS) : null,
      fasesQueSePasan: conAncla
        ? fases.filter((_, k) => ultimoDiaDeLaSemana(i.ancla!, rangos[k].end) > limite).map((f) => f.name)
        : [],
      semanasQueCaben: conAncla ? Math.max(0, Math.floor((limite + DIA_MS - diaUTC(new Date(i.ancla!))) / SEMANA_MS)) : null,
    };
  }

  const seSale =
    (duracion !== null && duracion.deMas > 0) ||
    (fecha !== null && (fecha.diasDeMas ?? 0) > 0) ||
    (horas !== null && (horas.deMas ?? 0) > 0);
  return { semanasDeArranque: arranque, semanasDelPlan, cierre, duracion, horas, fecha, seSale };
}

/**
 * ¿El plan pasa un límite CONFIRMADO? Es la condición para que el revisor de fases pueda JUNTAR fases y para ofrecer
 * «Ajustar el plan a lo vendido» (2026-11-18, decisión de Elías: juntar solo con una duración confirmada). Lo propuesto
 * por la IA y sin confirmar no alcanza.
 */
export function pasaUnLimiteConfirmado(r: RevisionDeLimites): boolean {
  return (
    (r.duracion?.origen === "confirmado" && r.duracion.deMas > 0) ||
    (r.fecha?.origen === "confirmado" && (r.fecha.diasDeMas ?? 0) > 0) ||
    (r.horas?.origen === "confirmado" && (r.horas.deMas ?? 0) > 0)
  );
}

/** La fecha que propone «Mover la fecha límite»: el último día del plan si se pasa; si no, null (no hay que moverla). */
export function fechaQueCabe(r: RevisionDeLimites): string | null {
  return r.fecha && (r.fecha.diasDeMas ?? 0) > 0 ? r.fecha.cierre : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LOS TEXTOS (tuteo) ───────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export const fmtYmd = (ymd: string) => fmtFull(`${ymd}T00:00:00.000Z`);
const nombres = (xs: readonly string[], tope = 3) =>
  xs.length <= tope
    ? xs.map((n) => `«${n}»`).join(", ")
    : `${xs.slice(0, tope).map((n) => `«${n}»`).join(", ")} y ${plural(xs.length - tope, "fase más", "fases más")}`;
const sinConfirmar = (o: "confirmado" | "propuesto") => (o === "propuesto" ? " (lo propuso la IA; falta confirmarlo)" : "");

/** «Lo vendido: 12 semanas sin la Semana 0». */
export function textoDeLoVendido(semanas: number, conSemanaCero: boolean): string {
  return `${plural(semanas, "semana", "semanas")}${conSemanaCero ? " sin la Semana 0" : ""}`;
}

/**
 * La línea de la duración: null si no hay duración vigente. ⭐ LO VENDIDO VA PRIMERO (2026-11-18): con «El plan dura 8
 * semanas y se vendieron 4» el CSE de RC entendió que la IA decía que se vendieron 8, y cambió el límite a 8.
 */
export function lineaDeLaDuracion(r: RevisionDeLimites, conSemanaCero: boolean): string | null {
  const d = r.duracion;
  if (!d) return null;
  const sinSemanaCero = conSemanaCero && r.semanasDeArranque > 0 ? " sin la Semana 0" : "";
  const vendidas = `Se ${d.vendidas === 1 ? "vendió" : "vendieron"} ${plural(d.vendidas, "semana", "semanas")}${sinConfirmar(d.origen)}`;
  if (d.deMas > 0) return `${vendidas}; el plan dura ${d.delPlan}${sinSemanaCero} (${d.deMas} de más).`;
  return `${vendidas}; el plan dura ${d.delPlan}${sinSemanaCero}: cabe${d.deMas < 0 ? ` (${plural(-d.deMas, "semana", "semanas")} de margen)` : ""}.`;
}

const fmtHoras = (h: number) => (Number.isInteger(h) ? String(h) : h.toFixed(1).replace(".", ","));

/** La línea de las horas: null si no hay horas vendidas vigentes. Lo vendido primero, como la duración. */
export function lineaDeLasHoras(r: RevisionDeLimites): string | null {
  const h = r.horas;
  if (!h) return null;
  const vendidas = `Se ${h.vendidas === 1 ? "vendió" : "vendieron"} ${plural(h.vendidas, "hora", "horas")}${sinConfirmar(h.origen)}`;
  if (h.delPlan === null || h.deMas === null) return `${vendidas}; las tareas todavía no tienen horas estimadas.`;
  const faltan = h.sinHoras > 0 ? ` ${plural(h.sinHoras, "tarea no tiene", "tareas no tienen")} horas.` : "";
  if (h.deMas > 0) return `${vendidas}; las tareas suman ${fmtHoras(h.delPlan)} (${fmtHoras(h.deMas)} de más).${faltan}`;
  return `${vendidas}; las tareas suman ${fmtHoras(h.delPlan)}: cabe${h.deMas < 0 ? ` (${fmtHoras(-h.deMas)} de margen)` : ""}.${faltan}`;
}

/** La línea de la fecha límite: null si no hay fecha vigente. El plan se cuenta hasta su último día. */
export function lineaDeLaFecha(r: RevisionDeLimites): string | null {
  const f = r.fecha;
  if (!f) return null;
  const limite = `La fecha límite es el ${fmtYmd(f.limite)}${sinConfirmar(f.origen)}`;
  if (f.diasDeMas === null) return `${limite}: sin fecha de arranque no se puede saber si el plan llega.`;
  if (f.diasDeMas > 0) {
    const cuales = f.fasesQueSePasan.length > 0 ? ` Terminan después: ${nombres(f.fasesQueSePasan)}.` : "";
    return `${limite}; el plan termina el ${fmtYmd(f.cierre!)} (${plural(f.diasDeMas, "día", "días")} de más).${cuales}`;
  }
  return `${limite}; el plan termina el ${fmtYmd(f.cierre!)}: cabe.`;
}

/** El aviso del cronograma: título y líneas, o null si no hay ningún límite vigente. */
export function avisoDeLimites(r: RevisionDeLimites, l: Pick<LimitesDelCronograma, "conSemanaCero" | "propuestos">): {
  seSale: boolean;
  titulo: string;
  lineas: string[];
} | null {
  const lineas = [lineaDeLaDuracion(r, l.conSemanaCero), lineaDeLasHoras(r), lineaDeLaFecha(r)].filter((x): x is string => !!x);
  if (lineas.length === 0) return null;
  if (r.seSale && l.propuestos?.noCabe) lineas.push(`La IA avisó: ${l.propuestos.noCabe}`);
  return {
    seSale: r.seSale,
    titulo: r.seSale ? "El cronograma no cabe en lo acordado" : "El cronograma cabe en lo acordado",
    lineas,
  };
}

/**
 * Para la barra de la propuesta: el plan de HOY y el de la PROPUESTA contra los límites. null si no hay
 * límites vigentes, o si ni hoy ni con la propuesta se pasa (no hay nada que decir).
 */
export function avisoDeLaPropuestaContraLimites(antes: RevisionDeLimites, despues: RevisionDeLimites): string | null {
  if (!despues.duracion && !despues.fecha && !despues.horas) return null;
  if (!antes.seSale && !despues.seSale) return null;
  const partes: string[] = [];
  if (despues.duracion && despues.duracion.deMas > 0) {
    partes.push(`dura ${despues.duracion.delPlan} semanas y se vendieron ${despues.duracion.vendidas}`);
  }
  if (despues.horas && (despues.horas.deMas ?? 0) > 0) {
    partes.push(`suma ${fmtHoras(despues.horas.delPlan!)} horas y se vendieron ${despues.horas.vendidas}`);
  }
  if (despues.fecha && (despues.fecha.diasDeMas ?? 0) > 0) {
    partes.push(`cierra el ${fmtYmd(despues.fecha.cierre!)}, ${plural(despues.fecha.diasDeMas!, "día", "días")} después de la fecha límite`);
  }
  if (partes.length === 0) return "Con la propuesta, el plan vuelve a caber en lo acordado.";
  const empeora =
    (despues.duracion?.deMas ?? 0) > (antes.duracion?.deMas ?? 0) ||
    (despues.horas?.deMas ?? 0) > (antes.horas?.deMas ?? 0) ||
    (despues.fecha?.diasDeMas ?? 0) > (antes.fecha?.diasDeMas ?? 0);
  return `⚠ Con la propuesta, el plan ${partes.join(" y ")}${empeora ? "" : " (hoy ya se pasa)"}. Avísale a Ventas o mueve el límite con el cliente.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LO QUE PROPONE LA IA DEL HANDOFF ─────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** Para comparar una cita contra las fuentes: sin tildes, sin marcas de formato, espacios simples. */
export function normalizarParaCita(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\\n/g, " ")
    .replace(/[*_`«»"“”'‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Una cita corta (menos de 8 caracteres útiles) no prueba nada: «12 semanas» aparece en cualquier lado. */
const MIN_LARGO_CITA_VERIFICABLE = 12;

export function citaEstaEnLasFuentes(cita: string, fuentesNormalizadas: string): boolean {
  const c = normalizarParaCita(cita).replace(/[.…]+$/, "").trim();
  return c.length >= MIN_LARGO_CITA_VERIFICABLE && fuentesNormalizadas.includes(c);
}

/**
 * Los límites que devolvió el agente de handoff en su clave `limites`. Un valor sin cita se descarta
 * (no se fabrica un límite); con cita, queda propuesto y `citaVerificada` dice si la frase está en lo
 * que leyó. `fuentes` es el mensaje que recibió el agente SIN el bloque de los límites (si no, la IA
 * podría «citar» la instrucción). null si no hay nada que proponer.
 */
export function limitesDeLaSalidaDelHandoff(salida: unknown, fuentes: string | null, runId: string, en: Date): LimitesPropuestos | null {
  const raw = esObjeto(salida) ? salida.limites : null;
  if (!esObjeto(raw)) return null;
  const norm = fuentes ? normalizarParaCita(fuentes) : "";
  const out: LimitesPropuestos = { runId, en: en.toISOString() };

  const durRaw = typeof raw.duracionVendidaSemanas === "string" ? Number(raw.duracionVendidaSemanas) : raw.duracionVendidaSemanas;
  const citaDur = texto(raw.citaDuracion, MAX_LARGO_CITA);
  if (esSemanasVendidas(durRaw) && citaDur) {
    out.duracionVendida = { valor: durRaw, cita: citaDur, citaVerificada: citaEstaEnLasFuentes(citaDur, norm) };
  }
  const horasRaw = typeof raw.horasVendidas === "string" ? Number(raw.horasVendidas) : raw.horasVendidas;
  const citaHoras = texto(raw.citaHoras, MAX_LARGO_CITA);
  if (esHorasVendidas(horasRaw) && citaHoras) {
    out.horasVendidas = { valor: horasRaw, cita: citaHoras, citaVerificada: citaEstaEnLasFuentes(citaHoras, norm) };
  }
  const citaFecha = texto(raw.citaFechaLimite, MAX_LARGO_CITA);
  if (esFechaYmd(raw.fechaLimite) && citaFecha) {
    out.fechaLimite = { valor: raw.fechaLimite, cita: citaFecha, citaVerificada: citaEstaEnLasFuentes(citaFecha, norm) };
  }
  const noCabe = texto(raw.noCabe, MAX_LARGO_NO_CABE);
  if (noCabe && !/^(null|ninguno|nada|n\/a)\.?$/i.test(noCabe)) out.noCabe = noCabe;
  return hayAlgoPropuesto(out) ? out : null;
}

/**
 * La propuesta que queda guardada: la nueva reemplaza a la anterior si trae algo (cada handoff relee
 * todo); si no trae nada, se conserva la anterior. Lo que ya coincide con lo confirmado no se propone.
 */
export function fusionarPropuestos(
  anterior: LimitesPropuestos | null,
  nueva: LimitesPropuestos | null,
  confirmados: Pick<LimitesDelCronograma, "fechaLimite" | "duracionVendidaSemanas"> & Partial<Pick<LimitesDelCronograma, "horasVendidas">>,
): LimitesPropuestos | null {
  const base = nueva ?? anterior;
  if (!base) return null;
  const out: LimitesPropuestos = { runId: base.runId, en: base.en };
  if (base.fechaLimite && base.fechaLimite.valor !== confirmados.fechaLimite) out.fechaLimite = base.fechaLimite;
  if (base.duracionVendida && base.duracionVendida.valor !== confirmados.duracionVendidaSemanas) out.duracionVendida = base.duracionVendida;
  if (base.horasVendidas && base.horasVendidas.valor !== (confirmados.horasVendidas ?? null)) out.horasVendidas = base.horasVendidas;
  if (base.noCabe) out.noCabe = base.noCabe;
  return hayAlgoPropuesto(out) ? out : null;
}

/** La propuesta sin un campo (al confirmarlo o al descartarlo). null si no queda nada. */
export function propuestosSin(p: LimitesPropuestos | null, campo: CampoDeLimite): LimitesPropuestos | null {
  if (!p) return null;
  const out: LimitesPropuestos = { ...p };
  delete out[campo];
  return hayAlgoPropuesto(out) ? out : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── CAMBIAR UN LÍMITE (lo hace una persona) ──────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export interface CambioDeLimite {
  campo: CampoDeLimite;
  /** «AAAA-MM-DD» para la fecha, entero para la duración; null = quitarlo. */
  valor: string | number | null;
  /** De dónde sale (la primera vez), o por qué se mueve. */
  motivo?: string | null;
  /** Con quién del cliente se acordó moverlo. */
  acordadoCon?: string | null;
}

export type ValidacionDeCambio = { ok: true; reason: string } | { ok: false; error: string };

const comoTexto = (campo: CampoDeLimite, v: string | number) =>
  campo === "fechaLimite"
    ? fmtYmd(String(v))
    : campo === "horasVendidas"
      ? plural(Number(v), "hora", "horas")
      : plural(Number(v), "semana", "semanas");

/** El nombre de un límite en el historial y en los errores. */
export function etiquetaDelLimite(campo: CampoDeLimite): string {
  return campo === "fechaLimite" ? "Fecha límite" : campo === "horasVendidas" ? "Horas vendidas" : "Duración vendida (sin la Semana 0)";
}

/**
 * ⭐ La regla del acuerdo. Confirmar un límite por primera vez no pide nada más. Moverlo o quitarlo
 * cuando ya estaba confirmado pide el motivo y con quién se acordó: es un compromiso con el cliente.
 * Devuelve la razón que queda en el historial del cronograma.
 */
export function validarCambioDeLimite(actual: string | number | null, c: CambioDeLimite): ValidacionDeCambio {
  const etiqueta = etiquetaDelLimite(c.campo);
  if (c.valor !== null) {
    if (c.campo === "fechaLimite" && !esFechaYmd(c.valor)) return { ok: false, error: "La fecha límite no es una fecha válida." };
    if (c.campo === "duracionVendida" && !esSemanasVendidas(c.valor)) {
      return { ok: false, error: `La duración vendida tiene que ser un número entero de semanas, de 1 a ${MAX_SEMANAS_VENDIDAS}.` };
    }
    if (c.campo === "horasVendidas" && !esHorasVendidas(c.valor)) {
      return { ok: false, error: `Las horas vendidas tienen que ser un número entero, de 1 a ${MAX_HORAS_VENDIDAS}.` };
    }
  }
  const motivo = c.motivo?.trim() ?? "";
  const acordadoCon = c.acordadoCon?.trim() ?? "";
  if (actual === null) {
    if (c.valor === null) return { ok: false, error: "No hay nada que quitar." };
    return { ok: true, reason: `${etiqueta} ${c.campo === "horasVendidas" ? "confirmadas" : "confirmada"}: ${comoTexto(c.campo, c.valor)}${motivo ? ` (${motivo})` : ""}.` };
  }
  if (c.valor !== null && c.valor === actual) return { ok: false, error: "Ese ya es el valor confirmado." };
  if (motivo.length < MIN_LARGO_ACUERDO) return { ok: false, error: "Mover un límite ya confirmado pide el motivo." };
  if (acordadoCon.length < MIN_LARGO_ACUERDO) {
    return { ok: false, error: "Mover un límite ya confirmado pide con quién del cliente se acordó." };
  }
  if (c.valor === null) {
    return { ok: true, reason: `Se quitó la ${etiqueta.toLowerCase()} (era ${comoTexto(c.campo, actual)}). Acordado con ${acordadoCon}: ${motivo}.` };
  }
  return {
    ok: true,
    reason: `${etiqueta}: ${comoTexto(c.campo, actual)} → ${comoTexto(c.campo, c.valor)}. Acordado con ${acordadoCon}: ${motivo}.`,
  };
}
