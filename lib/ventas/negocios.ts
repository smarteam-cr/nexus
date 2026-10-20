/**
 * lib/ventas/negocios.ts — las reglas de los negocios abiertos de un vendedor (2026-10-14, «Para ti» por equipo,
 * docs/mi-dia-plan.md). PURO y CLIENT-SAFE: sin base ni red, para que la pantalla y las pruebas usen la misma regla.
 *
 * Sobre la copia de los negocios abiertos (`NegocioAbierto`) responde:
 *   · ¿qué le falta a un negocio? (`senalesDelNegocio`)
 *   · ¿qué tan vivo está? (`temperaturaDelNegocio`: caliente, en movimiento, frío)
 *   · ¿hay que preguntarle la fecha de cierre o el monto al vendedor? (`preguntaDelNegocio`)
 *   · ¿qué le toca hacer con él? (`accionDelNegocio`)
 *   · ¿cómo se reparte la cartera? (`vistasDeCartera`: para mover hoy, pipeline, por limpiar, sin negocio)
 *
 * ⛔ Los montos NO se convierten: lo que está en dólares se suma en dólares, y lo que está en otra moneda se cuenta
 * aparte («+1 en CRC»). Convertir es solo de lib/finanzas/equilibrio.ts.
 *
 * El siguiente paso es el de Ventas en Nexus (`SiguientePaso`, etapa 2): `hs_next_step` de HubSpot solo se ofrece como
 * sugerencia (decisión de Elías, 2026-10-14).
 */
import { diasHastaElPaso, type SiguientePasoVisto } from "@/lib/siguiente-paso/reglas";

/** Hay interacción si la última actividad (en HubSpot o una reunión) es de estos días, o hay una agendada en ellos. */
export const DIAS_DE_INTERACCION = 14;
/** Un negocio sin actividad en estos días está frío y lo dice. */
export const DIAS_SIN_ACTIVIDAD = 21;
/** «Ahora no» calla la pregunta estos días. */
export const DIAS_DE_POSPONER = 7;
/**
 * «Cierres más cerca»: los que cierran desde hoy hasta estos días. 60 y no 30: las fechas de cierre se ponen a fin de
 * mes (23 de los 42 negocios de Andrés cerraban el 31 de octubre), así que entran este mes y el que sigue.
 */
export const DIAS_DE_CIERRE_CERCANO = 60;
/** «Preparar la reunión»: hay algo agendado en el negocio dentro de estas horas. */
const HORAS_PARA_PREPARAR = 36;

const DIA_MS = 86_400_000;

export interface PropuestaDeCierre {
  /** `YYYY-MM-DD`. */
  fechaCierre?: { valor: string; cita: string; fuente: string };
  monto?: { valor: number; moneda: string; cita: string; fuente: string };
  /** Cuándo se calculó (ISO). */
  calculadaAt: string;
}

/** Qué es la empresa para Nexus: cliente, prospecto, otra cosa (aliado, interna) o ninguna (no está en Nexus). */
export type TipoDeEmpresa = "CLIENTE" | "PROSPECTO" | "OTRO" | null;

export interface NegocioVisto {
  id: string;
  hubspotDealId: string;
  nombre: string;
  pipeline: string;
  etapa: string;
  /** De 0 a 1. */
  probabilidad: number | null;
  /** `YYYY-MM-DD`. */
  fechaCierre: string | null;
  monto: number | null;
  moneda: string;
  siguientePasoHubspot: string | null;
  /** ISO. */
  proximaActividad: string | null;
  /** ISO: la última actividad registrada en HubSpot. */
  ultimaActividad: string | null;
  /** ISO: la última reunión de Nexus con la empresa (Meet). */
  ultimaReunion: string | null;
  empresa: string;
  /** El negocio no tiene empresa asociada en HubSpot: `empresa` sale de su nombre. */
  sinEmpresa: boolean;
  tipoDeEmpresa: TipoDeEmpresa;
  clientId: string | null;
  hubspotCompanyId: string | null;
  /** ISO. */
  pospuestaHasta: string | null;
  propuesta: PropuestaDeCierre | null;
  /** Los siguientes pasos vigentes del negocio, uno por equipo (lib/siguiente-paso). */
  pasos?: SiguientePasoVisto[];
  /**
   * La próxima reunión con la empresa del negocio en los próximos 8 días, en el calendario del vendedor (de UNA sola
   * empresa, por `cuentaDelEvento`). Una reunión agendada ES el siguiente paso (2026-10-19). undefined/null = no hay.
   */
  reunion?: ReunionDelNegocio | null;
}

/** Una reunión agendada con la empresa de un negocio. */
export interface ReunionDelNegocio {
  /** ISO. */
  inicio: string;
  titulo: string;
}

/** El siguiente paso de Ventas del negocio (o de la empresa), si tiene. */
export function pasoDeVentas(x: { pasos?: SiguientePasoVisto[] }): SiguientePasoVisto | null {
  return x.pasos?.find((p) => p.equipo === "ventas") ?? null;
}

/** El de Ventas, con la fecha pasada: hay que hacerlo, darlo por hecho o definir el que sigue. */
export function pasoVencido(x: { pasos?: SiguientePasoVisto[] }, hoyISO: string): boolean {
  const p = pasoDeVentas(x);
  return !!p?.fecha && diasHastaElPaso(p.fecha, hoyISO) < 0;
}

/**
 * ¿El negocio tiene siguiente paso? La misma regla de las cuentas de Customer Success (lib/mi-dia/servicio.ts ›
 * siguientePasoDeLaCuenta, 2026-10-19): el de Ventas vigente (una tarea con fecha que no venció) o una reunión agendada
 * con la empresa en los próximos 8 días. Con la reunión, no se pide «Definir siguiente paso».
 */
export function tieneSiguientePasoDeVentas(x: { pasos?: SiguientePasoVisto[]; reunion?: ReunionDelNegocio | null }, hoyISO: string): boolean {
  return (!!pasoDeVentas(x) && !pasoVencido(x, hoyISO)) || !!x.reunion;
}

/** Un negocio en una etapa «Pausados» no se está vendiendo: no cuenta en el pipeline ni en lo ponderado. */
export function esPausado(n: Pick<NegocioVisto, "etapa">): boolean {
  return /paus/i.test(n.etapa);
}

/** La empresa de un negocio sin empresa en HubSpot, sacada de su nombre: «CCN - Implementación…» → «CCN». */
export function empresaDesdeElNombre(nombre: string): string {
  const corte = nombre.split(/\s+[-–|]\s+/)[0]?.trim();
  return corte && corte.length < nombre.length ? corte : nombre;
}

export type Senal =
  | "cierre-vencido"
  | "sin-fecha"
  | "sin-monto"
  | "sin-siguiente-paso"
  | "siguiente-paso-vencido"
  | "sin-actividad"
  | "sin-empresa"
  | "pausado";

export const TEXTO_DE_SENAL: Record<Senal, string> = {
  "cierre-vencido": "Cierre vencido",
  "sin-fecha": "Sin fecha de cierre",
  "sin-monto": "Sin monto",
  "sin-siguiente-paso": "Sin siguiente paso",
  "siguiente-paso-vencido": "El siguiente paso venció",
  "sin-actividad": `Sin actividad hace más de ${DIAS_SIN_ACTIVIDAD} días`,
  "sin-empresa": "Sin empresa en HubSpot",
  pausado: "Pausado",
};

export type Temperatura = "caliente" | "en-movimiento" | "frio";

export const TEXTO_DE_TEMPERATURA: Record<Temperatura, string> = {
  caliente: "Caliente",
  "en-movimiento": "En movimiento",
  frio: "Frío",
};

/** Días de `hoyISO` a `fechaISO` (`YYYY-MM-DD`): 0 = hoy, negativo = ya pasó. */
export function diasHasta(fechaISO: string, hoyISO: string): number {
  return Math.round((Date.parse(`${fechaISO.slice(0, 10)}T00:00:00Z`) - Date.parse(`${hoyISO}T00:00:00Z`)) / DIA_MS);
}

/** La interacción más reciente que ya pasó: la última actividad de HubSpot o la última reunión, la que sea posterior. */
export function ultimaInteraccion(n: Pick<NegocioVisto, "ultimaActividad" | "ultimaReunion">): string | null {
  const fechas = [n.ultimaActividad, n.ultimaReunion].filter((x): x is string => !!x);
  if (fechas.length === 0) return null;
  return fechas.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b));
}

/** Días desde un instante ISO hasta ahora, o null. */
export function diasDesde(iso: string | null, ahora: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.floor((ahora.getTime() - t) / DIA_MS) : null;
}

export function senalesDelNegocio(n: NegocioVisto, hoyISO: string, ahora: Date): Senal[] {
  const out: Senal[] = [];
  if (esPausado(n)) out.push("pausado");
  if (!n.fechaCierre) out.push("sin-fecha");
  else if (diasHasta(n.fechaCierre, hoyISO) < 0) out.push("cierre-vencido");
  if (n.monto === null) out.push("sin-monto");
  if (!tieneSiguientePasoDeVentas(n, hoyISO)) out.push(pasoDeVentas(n) ? "siguiente-paso-vencido" : "sin-siguiente-paso");
  const d = diasDesde(ultimaInteraccion(n), ahora);
  if (d === null || d > DIAS_SIN_ACTIVIDAD) out.push("sin-actividad");
  if (n.sinEmpresa) out.push("sin-empresa");
  return out;
}

/**
 * Regla inicial, a calibrar con Ventas:
 *   · frío: pausado, sin actividad hace más de 21 días, o el cierre venció hace más de 30;
 *   · caliente: probabilidad de 50 % o más, actividad en los últimos 7 días, y el cierre en 30 días o una actividad
 *     agendada en los próximos 7;
 *   · en movimiento: el resto.
 */
export function temperaturaDelNegocio(n: NegocioVisto, hoyISO: string, ahora: Date): Temperatura {
  const d = diasDesde(ultimaInteraccion(n), ahora);
  const cierre = n.fechaCierre ? diasHasta(n.fechaCierre, hoyISO) : null;
  if (esPausado(n) || d === null || d > DIAS_SIN_ACTIVIDAD || (cierre !== null && cierre < -30)) return "frio";
  const proxima = n.proximaActividad ? (Date.parse(n.proximaActividad) - ahora.getTime()) / DIA_MS : null;
  const cerca = (cierre !== null && cierre >= 0 && cierre <= 30) || (proxima !== null && proxima >= 0 && proxima <= 7);
  if ((n.probabilidad ?? 0) >= 0.5 && d <= 7 && cerca) return "caliente";
  return "en-movimiento";
}

/** ¿Hubo o hay interacción con este negocio? La última que pasó, o una agendada, dentro de los 14 días. */
export function tieneInteraccion(n: NegocioVisto, ahora: Date): boolean {
  const d = diasDesde(ultimaInteraccion(n), ahora);
  if (d !== null && d <= DIAS_DE_INTERACCION) return true;
  if (n.proximaActividad) {
    const dias = (Date.parse(n.proximaActividad) - ahora.getTime()) / DIA_MS;
    if (dias >= 0 && dias <= DIAS_DE_INTERACCION) return true;
  }
  return false;
}

/**
 * ¿Está por limpiar? Pausado, o con el cierre vencido y nadie lo trabaja, o sin empresa en HubSpot. No es un negocio
 * que se esté vendiendo: hay que moverlo de etapa, darle fecha, asociarlo o cerrarlo en HubSpot.
 */
export function motivoParaLimpiar(n: NegocioVisto, hoyISO: string, ahora: Date): string | null {
  if (esPausado(n)) return "Está pausado";
  if (n.fechaCierre && diasHasta(n.fechaCierre, hoyISO) < 0 && !tieneInteraccion(n, ahora)) {
    return `El cierre venció hace ${-diasHasta(n.fechaCierre, hoyISO)} días y nadie lo trabaja`;
  }
  if (n.sinEmpresa) return "No tiene empresa asociada en HubSpot";
  return null;
}

/** ¿Es un negocio que se está vendiendo? (lo que entra al pipeline). */
export function estaActivo(n: NegocioVisto, hoyISO: string, ahora: Date): boolean {
  if (esPausado(n)) return false;
  return !(n.fechaCierre && diasHasta(n.fechaCierre, hoyISO) < 0 && !tieneInteraccion(n, ahora));
}

export interface PreguntaDelNegocio {
  /** Lo que falta: la fecha (no tiene o venció) y el monto. */
  fecha: boolean;
  monto: boolean;
  /** La fecha está, pero ya pasó. */
  vencida: boolean;
}

/**
 * Decisión de Elías (2026-10-14): Nexus pregunta la fecha de cierre y el monto de un negocio que no los tiene (o tiene
 * la fecha vencida), solo cuando Ventas lo está trabajando: con interacción en los últimos 14 días o una agendada.
 * «Ahora no» lo calla 7 días. Un negocio pausado no se pregunta: no se está vendiendo.
 */
export function preguntaDelNegocio(n: NegocioVisto, hoyISO: string, ahora: Date): PreguntaDelNegocio | null {
  if (esPausado(n)) return null;
  const vencida = !!n.fechaCierre && diasHasta(n.fechaCierre, hoyISO) < 0;
  const fecha = !n.fechaCierre || vencida;
  const monto = n.monto === null;
  if (!fecha && !monto) return null;
  if (n.pospuestaHasta && Date.parse(n.pospuestaHasta) > ahora.getTime()) return null;
  if (!tieneInteraccion(n, ahora)) return null;
  return { fecha, monto, vencida };
}

export type ClaveDeAccion = "completar" | "preparar" | "retomar" | "definir" | "limpiar";

export interface AccionDelNegocio {
  clave: ClaveDeAccion;
  /** El botón. */
  boton: string;
  /** Por qué, en una línea. */
  motivo: string;
  /** 1 = lo más urgente. */
  prioridad: number;
}

const PRIORIDAD: Record<ClaveDeAccion, number> = { completar: 1, preparar: 2, retomar: 3, definir: 4, limpiar: 5 };

/** «hoy 4:00 p. m.» / «mañana 9:30 a. m.» / «17 oct», en hora de Costa Rica, armado a mano. */
export function cuandoEs(iso: string, hoyISO: string): string {
  const t = new Date(Date.parse(iso) - 6 * 3_600_000);
  const dia = t.toISOString().slice(0, 10);
  const h = t.getUTCHours();
  const m = String(t.getUTCMinutes()).padStart(2, "0");
  const hora = `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "a. m." : "p. m."}`;
  const d = diasHasta(dia, hoyISO);
  if (d === 0) return `hoy ${hora}`;
  if (d === 1) return `mañana ${hora}`;
  return `${fechaCorta(dia)} ${hora}`;
}

/** Lo que le toca al vendedor con este negocio, lo más urgente primero. null = está al día. */
export function accionDelNegocio(n: NegocioVisto, hoyISO: string, ahora: Date): AccionDelNegocio | null {
  const accion = (clave: ClaveDeAccion, boton: string, motivo: string): AccionDelNegocio => ({ clave, boton, motivo, prioridad: PRIORIDAD[clave] });
  const limpiar = motivoParaLimpiar(n, hoyISO, ahora);
  if (limpiar) return accion("limpiar", "Revisar en HubSpot", limpiar);
  const p = preguntaDelNegocio(n, hoyISO, ahora);
  if (p) {
    const que = p.fecha && p.monto ? "Le faltan la fecha de cierre y el monto" : p.fecha ? (p.vencida ? "La fecha de cierre ya pasó" : "Le falta la fecha de cierre") : "Le falta el monto";
    return accion("completar", "Completar", que);
  }
  if (n.reunion) {
    const horas = (Date.parse(n.reunion.inicio) - ahora.getTime()) / 3_600_000;
    if (horas >= 0 && horas <= HORAS_PARA_PREPARAR) return accion("preparar", "Preparar", `Tienes una reunión ${cuandoEs(n.reunion.inicio, hoyISO)}`);
  }
  if (n.proximaActividad) {
    const horas = (Date.parse(n.proximaActividad) - ahora.getTime()) / 3_600_000;
    if (horas >= 0 && horas <= HORAS_PARA_PREPARAR) return accion("preparar", "Preparar", `Tienes una actividad ${cuandoEs(n.proximaActividad, hoyISO)}`);
  }
  const d = diasDesde(ultimaInteraccion(n), ahora);
  const agendado = (n.proximaActividad && Date.parse(n.proximaActividad) > ahora.getTime()) || !!n.reunion;
  if (!agendado && (d === null || d > DIAS_DE_INTERACCION)) {
    return accion("retomar", "Retomar", d === null ? "No tiene actividad registrada" : `Sin actividad hace ${d} días y nada agendado`);
  }
  // Una reunión agendada con la empresa ya es el siguiente paso (2026-10-19).
  if (tieneSiguientePasoDeVentas(n, hoyISO)) return null;
  const paso = pasoDeVentas(n);
  if (!paso) {
    const hs = n.siguientePasoHubspot?.trim();
    return accion("definir", "Definir siguiente paso", hs ? `No tiene siguiente paso. En HubSpot dice: «${hs}»` : "No tiene siguiente paso");
  }
  if (paso.fecha && pasoVencido(n, hoyISO)) return accion("definir", "Definir siguiente paso", `El siguiente paso venció el ${fechaCorta(paso.fecha)}: «${paso.que}»`);
  return null;
}

/** Los que cierran desde hoy hasta 60 días (sin pausados), el más cercano primero; a igual fecha, el de más monto. */
export function cierresMasCerca<T extends NegocioVisto>(negocios: readonly T[], hoyISO: string): T[] {
  return negocios
    .filter((n) => !esPausado(n) && n.fechaCierre && diasHasta(n.fechaCierre, hoyISO) >= 0 && diasHasta(n.fechaCierre, hoyISO) <= DIAS_DE_CIERRE_CERCANO)
    .sort((a, b) => a.fechaCierre!.localeCompare(b.fechaCierre!) || (b.monto ?? 0) - (a.monto ?? 0));
}

export interface Ponderado {
  /** Suma de monto × probabilidad de los negocios activos en dólares que cierran en el año. */
  usd: number;
  /** Suma de los montos en dólares de los negocios activos (sin ponderar). */
  pipelineUsd: number;
  activos: number;
  pausados: number;
  enOtraMoneda: number;
  sinMonto: number;
  /** Con monto en dólares pero sin fecha de cierre o con cierre en otro año: no entran a lo ponderado del año. */
  fueraDelAnio: number;
}

/** Lo ponderado y el pipeline, sin los pausados: un negocio pausado no se está vendiendo. */
export function ponderadoDelAnio(negocios: readonly NegocioVisto[], anio: number): Ponderado {
  const r: Ponderado = { usd: 0, pipelineUsd: 0, activos: 0, pausados: 0, enOtraMoneda: 0, sinMonto: 0, fueraDelAnio: 0 };
  for (const n of negocios) {
    if (esPausado(n)) {
      r.pausados++;
      continue;
    }
    r.activos++;
    if (n.monto === null) {
      r.sinMonto++;
      continue;
    }
    if (n.moneda !== "USD") {
      r.enOtraMoneda++;
      continue;
    }
    r.pipelineUsd += n.monto;
    if (!n.fechaCierre || Number(n.fechaCierre.slice(0, 4)) !== anio) {
      r.fueraDelAnio++;
      continue;
    }
    r.usd += n.monto * (n.probabilidad ?? 0);
  }
  r.usd = Math.round(r.usd);
  r.pipelineUsd = Math.round(r.pipelineUsd);
  return r;
}

/** Una empresa de la cartera de un vendedor: con sus negocios abiertos, o solo porque es su dueño en HubSpot. */
export interface EmpresaDeCartera {
  clave: string;
  nombre: string;
  clientId: string | null;
  hubspotCompanyId: string | null;
  tipo: TipoDeEmpresa;
  /** Es el dueño de la empresa en HubSpot. */
  esDueno: boolean;
  negocios: NegocioVisto[];
  /** `YYYY-MM-DD`: el cierre más cercano que no venció, o el vencido más reciente si todos vencieron. */
  proximoCierre: string | null;
  montoUsd: number;
  enOtraMoneda: number;
  /** ISO. */
  ultimaInteraccion: string | null;
  temperatura: Temperatura | null;
  /** Los siguientes pasos vigentes de la empresa (el de la cuenta entera), uno por equipo. */
  pasos?: SiguientePasoVisto[];
}

export interface EmpresaPropia {
  clientId: string;
  nombre: string;
  hubspotCompanyId: string | null;
  tipo: TipoDeEmpresa;
  /** ISO: la última reunión de Nexus con la empresa. */
  ultimaReunion: string | null;
}

const ORDEN_DE_TEMPERATURA: Record<Temperatura, number> = { caliente: 0, "en-movimiento": 1, frio: 2 };

const masReciente = (a: string | null, b: string | null) => (!a ? b : !b ? a : Date.parse(a) >= Date.parse(b) ? a : b);

/** Las empresas de la cartera, con sus negocios juntos. La cartera de un vendedor (Elías, 2026-10-14): las empresas de
 *  Nexus de las que es dueño en HubSpot más las de sus negocios abiertos, aunque no sea el dueño de la empresa. */
export function empresasDeLaCartera(negocios: readonly NegocioVisto[], propias: readonly EmpresaPropia[], hoyISO: string, ahora: Date): EmpresaDeCartera[] {
  const porClave = new Map<string, EmpresaDeCartera>();
  const claveDe = (clientId: string | null, companyId: string | null, respaldo: string) =>
    clientId ? `c:${clientId}` : companyId ? `h:${companyId}` : `n:${respaldo}`;
  const propiasPorCompany = new Map(propias.filter((p) => p.hubspotCompanyId).map((p) => [p.hubspotCompanyId!, p]));

  for (const n of negocios) {
    const propia = !n.clientId && n.hubspotCompanyId ? propiasPorCompany.get(n.hubspotCompanyId) : undefined;
    const clientId = n.clientId ?? propia?.clientId ?? null;
    const clave = claveDe(clientId, n.hubspotCompanyId, n.id);
    const e =
      porClave.get(clave) ??
      ({
        clave,
        nombre: n.empresa,
        clientId,
        hubspotCompanyId: n.hubspotCompanyId,
        tipo: n.tipoDeEmpresa ?? propia?.tipo ?? null,
        esDueno: false,
        negocios: [],
        proximoCierre: null,
        montoUsd: 0,
        enOtraMoneda: 0,
        ultimaInteraccion: null,
        temperatura: null,
      } satisfies EmpresaDeCartera);
    e.negocios.push(n);
    porClave.set(clave, e);
  }
  for (const p of propias) {
    const clave = claveDe(p.clientId, null, p.clientId);
    const e = porClave.get(clave);
    if (e) {
      e.esDueno = true;
      e.nombre = p.nombre;
      e.tipo = p.tipo;
      e.ultimaInteraccion = masReciente(e.ultimaInteraccion, p.ultimaReunion);
      continue;
    }
    porClave.set(clave, {
      clave,
      nombre: p.nombre,
      clientId: p.clientId,
      hubspotCompanyId: p.hubspotCompanyId,
      tipo: p.tipo,
      esDueno: true,
      negocios: [],
      proximoCierre: null,
      montoUsd: 0,
      enOtraMoneda: 0,
      ultimaInteraccion: p.ultimaReunion,
      temperatura: null,
    });
  }

  for (const e of porClave.values()) {
    if (e.negocios.length === 0) continue;
    const activos = e.negocios.filter((n) => !esPausado(n));
    const futuros = activos.filter((n) => n.fechaCierre && diasHasta(n.fechaCierre, hoyISO) >= 0).map((n) => n.fechaCierre!);
    const todos = e.negocios.filter((n) => n.fechaCierre).map((n) => n.fechaCierre!);
    e.proximoCierre = futuros.length ? futuros.sort()[0]! : todos.length ? todos.sort().at(-1)! : null;
    for (const n of activos) {
      if (n.monto === null) continue;
      if (n.moneda === "USD") e.montoUsd += n.monto;
      else e.enOtraMoneda++;
    }
    for (const n of e.negocios) e.ultimaInteraccion = masReciente(e.ultimaInteraccion, ultimaInteraccion(n));
    e.temperatura = e.negocios
      .map((n) => temperaturaDelNegocio(n, hoyISO, ahora))
      .sort((a, b) => ORDEN_DE_TEMPERATURA[a] - ORDEN_DE_TEMPERATURA[b])[0]!;
    e.negocios.sort((a, b) => (a.fechaCierre ?? "9999").localeCompare(b.fechaCierre ?? "9999"));
  }
  return [...porClave.values()];
}

/** Lo que muestra «Para mover hoy»: una empresa, el negocio que pide algo y qué. */
export interface Movimiento {
  empresa: EmpresaDeCartera;
  negocio: NegocioVisto;
  accion: AccionDelNegocio;
  /** Otros negocios de la misma empresa que también piden algo. */
  otros: number;
}

export interface VistasDeCartera {
  /** Una por empresa con negocios activos que piden algo: lo más urgente primero. */
  moverHoy: Movimiento[];
  /** Los negocios que se están vendiendo, en el orden de Elías: con fecha y monto, después a los que les falta uno. */
  pipeline: { completos: NegocioVisto[]; incompletos: NegocioVisto[] };
  /** Los que hay que mover de etapa, darles fecha, asociar o cerrar en HubSpot. */
  porLimpiar: Array<{ negocio: NegocioVisto; motivo: string }>;
  /** Empresas tuyas sin ningún negocio abierto: clientes primero, la interacción más reciente primero. */
  sinNegocio: EmpresaDeCartera[];
}

export function vistasDeCartera(empresas: readonly EmpresaDeCartera[], hoyISO: string, ahora: Date): VistasDeCartera {
  const moverHoy: Movimiento[] = [];
  const completos: NegocioVisto[] = [];
  const incompletos: NegocioVisto[] = [];
  const porLimpiar: VistasDeCartera["porLimpiar"] = [];
  const sinNegocio: EmpresaDeCartera[] = [];

  for (const e of empresas) {
    if (e.negocios.length === 0) {
      sinNegocio.push(e);
      continue;
    }
    const pendientes: Array<{ negocio: NegocioVisto; accion: AccionDelNegocio }> = [];
    for (const n of e.negocios) {
      const limpiar = motivoParaLimpiar(n, hoyISO, ahora);
      if (limpiar) porLimpiar.push({ negocio: n, motivo: limpiar });
      if (estaActivo(n, hoyISO, ahora)) (n.fechaCierre && n.monto !== null ? completos : incompletos).push(n);
      const a = accionDelNegocio(n, hoyISO, ahora);
      if (a && a.clave !== "limpiar") pendientes.push({ negocio: n, accion: a });
    }
    if (pendientes.length) {
      pendientes.sort((x, y) => x.accion.prioridad - y.accion.prioridad || (x.negocio.fechaCierre ?? "9999").localeCompare(y.negocio.fechaCierre ?? "9999"));
      moverHoy.push({ empresa: e, ...pendientes[0]!, otros: pendientes.length - 1 });
    }
  }

  const porCierre = (a: NegocioVisto, b: NegocioVisto) =>
    (a.fechaCierre ?? "9999").localeCompare(b.fechaCierre ?? "9999") || (b.monto ?? 0) - (a.monto ?? 0);
  moverHoy.sort((a, b) => a.accion.prioridad - b.accion.prioridad || porCierre(a.negocio, b.negocio));
  completos.sort(porCierre);
  incompletos.sort(porCierre);
  porLimpiar.sort((a, b) => porCierre(a.negocio, b.negocio));
  const peso = (t: TipoDeEmpresa) => (t === "CLIENTE" ? 0 : t === "PROSPECTO" ? 1 : 2);
  sinNegocio.sort(
    (a, b) =>
      peso(a.tipo) - peso(b.tipo) ||
      (b.ultimaInteraccion ? Date.parse(b.ultimaInteraccion) : 0) - (a.ultimaInteraccion ? Date.parse(a.ultimaInteraccion) : 0) ||
      a.nombre.localeCompare(b.nombre, "es"),
  );
  return { moverHoy, pipeline: { completos, incompletos }, porLimpiar, sinNegocio };
}

/** «US$4.500»: armado a mano (con `toLocaleString`, el servidor y el navegador lo escriben distinto). */
export function montoCorto(monto: number, moneda: string): string {
  const entero = Math.round(Math.abs(monto))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const signo = monto < 0 ? "−" : "";
  if (moneda === "USD") return `${signo}US$${entero}`;
  if (moneda === "CRC") return `${signo}₡${entero}`;
  return `${signo}${entero} ${moneda}`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_DE_LA_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** «31 oct»: armado a mano, por la misma razón. */
export function fechaCorta(fechaISO: string): string {
  const [, m, d] = fechaISO.slice(0, 10).split("-");
  return `${Number(d)} ${MESES[Number(m) - 1] ?? ""}`;
}

/** «Miércoles 15 de octubre». */
export function fechaLarga(fechaISO: string): string {
  const [a, m, d] = fechaISO.slice(0, 10).split("-").map(Number);
  const dia = DIAS_DE_LA_SEMANA[new Date(Date.UTC(a!, m! - 1, d!)).getUTCDay()]!;
  return `${dia[0]!.toUpperCase()}${dia.slice(1)} ${d} de ${MESES_LARGOS[m! - 1]}`;
}

/** «Buenos días» hasta las 12, «Buenas tardes» hasta las 19, «Buenas noches» después (hora de Costa Rica). */
export function saludo(horaCR: number): string {
  return horaCR < 12 ? "Buenos días" : horaCR < 19 ? "Buenas tardes" : "Buenas noches";
}
