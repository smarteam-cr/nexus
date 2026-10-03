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
 * El cierre es el de siempre (`projectedEnd`: arranque + ancho de calendario), así el aviso dice la
 * misma fecha que el chip de «Cierre». La fecha límite se compara por día de calendario UTC, como
 * el resto de las fechas que salen del ancla.
 */
import { PRIMERA_FASE_ES_ARRANQUE } from "./arranque";
import { addWeeks, computePhaseRanges, fmtFull, plural, projectedEnd, type ProjectedEnd } from "./weeks";

export const MAX_SEMANAS_VENDIDAS = 104;
export const MAX_LARGO_CITA = 300;
export const MAX_LARGO_NO_CABE = 400;
export const MAX_LARGO_MOTIVO = 500;
/** Lo mínimo que se le pide a «con quién se acordó» y al motivo de mover un límite confirmado. */
export const MIN_LARGO_ACUERDO = 3;

export type CampoDeLimite = "fechaLimite" | "duracionVendida";

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
  /** Lo que la IA dijo que no cabe en el plazo, en una oración. */
  noCabe?: string;
}

/** Lo que viaja a la pantalla y al chat. */
export interface LimitesDelCronograma {
  /** YYYY-MM-DD, o null. */
  fechaLimite: string | null;
  duracionVendidaSemanas: number | null;
  confirmacion: ConfirmacionesDeLimites;
  propuestos: LimitesPropuestos | null;
  /** ¿El proyecto tiene Semana 0? (Customer Success sí; Desarrollo y Web no). Lo vendido se cuenta sin ella. */
  conSemanaCero: boolean;
}

export const SIN_LIMITES: Omit<LimitesDelCronograma, "conSemanaCero"> = {
  fechaLimite: null,
  duracionVendidaSemanas: null,
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
  return { ...(fechaLimite ? { fechaLimite } : {}), ...(duracionVendida ? { duracionVendida } : {}) };
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
  const noCabe = texto(json.noCabe, MAX_LARGO_NO_CABE);
  if (noCabe) out.noCabe = noCabe;
  return out.fechaLimite || out.duracionVendida || out.noCabe ? out : null;
}

/** Las filas de la base → lo que viaja. */
export function limitesDeLaFila(fila: {
  fechaLimite: Date | string | null;
  duracionVendidaSemanas: number | null;
  limitesConfirmacion: unknown;
  limitesPropuestos: unknown;
  conSemanaCero: boolean;
}): LimitesDelCronograma {
  return {
    fechaLimite: ymdDeFecha(fila.fechaLimite),
    duracionVendidaSemanas: esSemanasVendidas(fila.duracionVendidaSemanas) ? fila.duracionVendidaSemanas : null,
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

/** El confirmado; si no hay, el propuesto con cita verificada; si no, ninguno. */
export function limitesVigentes(l: Pick<LimitesDelCronograma, "fechaLimite" | "duracionVendidaSemanas" | "propuestos">): {
  fecha: LimiteVigente<string> | null;
  duracion: LimiteVigente<number> | null;
} {
  const pf = l.propuestos?.fechaLimite;
  const pd = l.propuestos?.duracionVendida;
  return {
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

const SEMANA_MS = 7 * 86_400_000;
const diaUTC = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const diaDe = (ymd: string) => Date.parse(`${ymd}T00:00:00.000Z`);

export interface RevisionDeLimites {
  /** Semanas de la Semana 0 al principio (no cuentan contra lo vendido). */
  semanasDeArranque: number;
  /** El ancho de calendario SIN la Semana 0: lo que se compara contra lo vendido. */
  semanasDelPlan: number;
  cierre: ProjectedEnd;
  duracion: null | { vendidas: number; delPlan: number; deMas: number; origen: LimiteVigente<number>["origen"] };
  fecha: null | {
    limite: string;
    origen: LimiteVigente<string>["origen"];
    /** «AAAA-MM-DD» del cierre del plan, o null sin fecha de arranque (no se puede comparar). */
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
  limites: Pick<LimitesDelCronograma, "fechaLimite" | "duracionVendidaSemanas" | "propuestos" | "conSemanaCero">;
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

  let fecha: RevisionDeLimites["fecha"] = null;
  if (vigentes.fecha) {
    const limite = diaDe(vigentes.fecha.valor);
    const rangos = computePhaseRanges(fases);
    const conAncla = !!i.ancla && cierre.date !== null;
    fecha = {
      limite: vigentes.fecha.valor,
      origen: vigentes.fecha.origen,
      cierre: conAncla ? cierre.date!.toISOString().slice(0, 10) : null,
      diasDeMas: conAncla ? Math.round((diaUTC(cierre.date!) - limite) / 86_400_000) : null,
      fasesQueSePasan: conAncla
        ? fases.filter((_, k) => diaUTC(addWeeks(i.ancla!, rangos[k].end)) > limite).map((f) => f.name)
        : [],
      semanasQueCaben: conAncla ? Math.max(0, Math.floor((limite - diaUTC(new Date(i.ancla!))) / SEMANA_MS)) : null,
    };
  }

  const seSale = (duracion !== null && duracion.deMas > 0) || (fecha !== null && (fecha.diasDeMas ?? 0) > 0);
  return { semanasDeArranque: arranque, semanasDelPlan, cierre, duracion, fecha, seSale };
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

/** La línea de la duración: null si no hay duración vigente. */
export function lineaDeLaDuracion(r: RevisionDeLimites, conSemanaCero: boolean): string | null {
  const d = r.duracion;
  if (!d) return null;
  const plan = `${plural(d.delPlan, "semana", "semanas")}${conSemanaCero && r.semanasDeArranque > 0 ? " sin la Semana 0" : ""}`;
  if (d.deMas > 0) {
    return `El plan dura ${plan} y se vendieron ${d.vendidas}: se pasa ${plural(d.deMas, "semana", "semanas")}${sinConfirmar(d.origen)}.`;
  }
  return `El plan dura ${plan}: cabe en las ${d.vendidas} vendidas${d.deMas < 0 ? ` (${plural(-d.deMas, "semana", "semanas")} de margen)` : ""}${sinConfirmar(d.origen)}.`;
}

/** La línea de la fecha límite: null si no hay fecha vigente. */
export function lineaDeLaFecha(r: RevisionDeLimites): string | null {
  const f = r.fecha;
  if (!f) return null;
  if (f.diasDeMas === null) {
    return `La fecha límite es el ${fmtYmd(f.limite)}: sin fecha de arranque no se puede saber si el plan llega${sinConfirmar(f.origen)}.`;
  }
  if (f.diasDeMas > 0) {
    const cuales = f.fasesQueSePasan.length > 0 ? ` Terminan después: ${nombres(f.fasesQueSePasan)}.` : "";
    return `El plan cierra el ${fmtYmd(f.cierre!)} y la fecha límite es el ${fmtYmd(f.limite)}: se pasa ${plural(f.diasDeMas, "día", "días")}${sinConfirmar(f.origen)}.${cuales}`;
  }
  return `El plan cierra el ${fmtYmd(f.cierre!)}, antes de la fecha límite del ${fmtYmd(f.limite)}${sinConfirmar(f.origen)}.`;
}

/** El aviso del cronograma: título y líneas, o null si no hay ningún límite vigente. */
export function avisoDeLimites(r: RevisionDeLimites, l: Pick<LimitesDelCronograma, "conSemanaCero" | "propuestos">): {
  seSale: boolean;
  titulo: string;
  lineas: string[];
} | null {
  const lineas = [lineaDeLaDuracion(r, l.conSemanaCero), lineaDeLaFecha(r)].filter((x): x is string => !!x);
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
  if (!despues.duracion && !despues.fecha) return null;
  if (!antes.seSale && !despues.seSale) return null;
  const partes: string[] = [];
  if (despues.duracion && despues.duracion.deMas > 0) {
    partes.push(`dura ${despues.duracion.delPlan} de las ${despues.duracion.vendidas} semanas vendidas`);
  }
  if (despues.fecha && (despues.fecha.diasDeMas ?? 0) > 0) {
    partes.push(`cierra el ${fmtYmd(despues.fecha.cierre!)}, ${plural(despues.fecha.diasDeMas!, "día", "días")} después de la fecha límite`);
  }
  if (partes.length === 0) return "Con la propuesta, el plan vuelve a caber en lo acordado.";
  const empeora =
    (despues.duracion?.deMas ?? 0) > (antes.duracion?.deMas ?? 0) ||
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
  const citaFecha = texto(raw.citaFechaLimite, MAX_LARGO_CITA);
  if (esFechaYmd(raw.fechaLimite) && citaFecha) {
    out.fechaLimite = { valor: raw.fechaLimite, cita: citaFecha, citaVerificada: citaEstaEnLasFuentes(citaFecha, norm) };
  }
  const noCabe = texto(raw.noCabe, MAX_LARGO_NO_CABE);
  if (noCabe && !/^(null|ninguno|nada|n\/a)\.?$/i.test(noCabe)) out.noCabe = noCabe;
  return out.fechaLimite || out.duracionVendida || out.noCabe ? out : null;
}

/**
 * La propuesta que queda guardada: la nueva reemplaza a la anterior si trae algo (cada handoff relee
 * todo); si no trae nada, se conserva la anterior. Lo que ya coincide con lo confirmado no se propone.
 */
export function fusionarPropuestos(
  anterior: LimitesPropuestos | null,
  nueva: LimitesPropuestos | null,
  confirmados: Pick<LimitesDelCronograma, "fechaLimite" | "duracionVendidaSemanas">,
): LimitesPropuestos | null {
  const base = nueva ?? anterior;
  if (!base) return null;
  const out: LimitesPropuestos = { runId: base.runId, en: base.en };
  if (base.fechaLimite && base.fechaLimite.valor !== confirmados.fechaLimite) out.fechaLimite = base.fechaLimite;
  if (base.duracionVendida && base.duracionVendida.valor !== confirmados.duracionVendidaSemanas) out.duracionVendida = base.duracionVendida;
  if (base.noCabe) out.noCabe = base.noCabe;
  return out.fechaLimite || out.duracionVendida || out.noCabe ? out : null;
}

/** La propuesta sin un campo (al confirmarlo o al descartarlo). null si no queda nada. */
export function propuestosSin(p: LimitesPropuestos | null, campo: CampoDeLimite): LimitesPropuestos | null {
  if (!p) return null;
  const out: LimitesPropuestos = { ...p };
  delete out[campo];
  return out.fechaLimite || out.duracionVendida || out.noCabe ? out : null;
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
  campo === "fechaLimite" ? fmtYmd(String(v)) : plural(Number(v), "semana", "semanas");

/**
 * ⭐ La regla del acuerdo. Confirmar un límite por primera vez no pide nada más. Moverlo o quitarlo
 * cuando ya estaba confirmado pide el motivo y con quién se acordó: es un compromiso con el cliente.
 * Devuelve la razón que queda en el historial del cronograma.
 */
export function validarCambioDeLimite(actual: string | number | null, c: CambioDeLimite): ValidacionDeCambio {
  const etiqueta = c.campo === "fechaLimite" ? "Fecha límite" : "Duración vendida (sin la Semana 0)";
  if (c.valor !== null) {
    if (c.campo === "fechaLimite" && !esFechaYmd(c.valor)) return { ok: false, error: "La fecha límite no es una fecha válida." };
    if (c.campo === "duracionVendida" && !esSemanasVendidas(c.valor)) {
      return { ok: false, error: `La duración vendida tiene que ser un número entero de semanas, de 1 a ${MAX_SEMANAS_VENDIDAS}.` };
    }
  }
  const motivo = c.motivo?.trim() ?? "";
  const acordadoCon = c.acordadoCon?.trim() ?? "";
  if (actual === null) {
    if (c.valor === null) return { ok: false, error: "No hay nada que quitar." };
    return { ok: true, reason: `${etiqueta} confirmada: ${comoTexto(c.campo, c.valor)}${motivo ? ` (${motivo})` : ""}.` };
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
