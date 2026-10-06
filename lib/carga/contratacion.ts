/**
 * lib/carga/contratacion.ts — la carga que viene con el pipeline, y cuándo abrir la búsqueda de un CSE. PURO.
 *
 * ── LA CUENTA ────────────────────────────────────────────────────────────────
 * Demanda del mes = la carga de hoy (base) + lo que suman los tratos que se ganarían. Un trato suma, desde el mes
 * siguiente a su cierre, las horas por semana de su TIPO (implementación nueva, caso de uso, licencias…). Tres
 * escenarios: solo lo casi cerrado (probabilidad ≥ 80 %), ponderado (horas × probabilidad) y todo.
 *
 * ── EL TIPO SE DEDUCE ────────────────────────────────────────────────────────
 * Los tratos no dicen qué trabajo traen: el tipo sale de palabras del nombre y, si no hay ninguna, de si la empresa ya
 * es cliente (un caso de uso más) o no (una implementación nueva). La pantalla lo dice «deducido del nombre»; cuando
 * el catálogo de casos de uso tenga horas, el tipo y las horas salen de ahí.
 *
 * ── LA PROPUESTA ─────────────────────────────────────────────────────────────
 * Si en el horizonte el equipo pasa el umbral de sobrecarga, Nexus PROPONE cuántos CSE faltan y desde cuándo buscar
 * (el tiempo de contratar y formar, hacia atrás). La confirma dirección; Nexus no contrata ni reasigna.
 */
import { semaforoDe, type ConfigCarga, type Semaforo, type TipoDeTrato } from "./config";

export type Escenario = "seguro" | "ponderado" | "todo";

export const ETIQUETA_DE_ESCENARIO: Record<Escenario, string> = {
  seguro: "Solo lo casi cerrado",
  ponderado: "Ponderado por probabilidad",
  todo: "Si se gana todo",
};

/** Probabilidad desde la que un trato cuenta como «casi cerrado». */
export const PROBABILIDAD_CASI_CERRADO = 0.8;

export interface TratoParaProyectar {
  id: string;
  nombre: string;
  pipeline: string | null;
  /** De 0 a 1. */
  probabilidad: number;
  cierre: Date | string | null;
  /** La empresa del trato ya es cliente de la cartera. */
  esClienteActual: boolean;
}

const QUITAR_TILDES = /[̀-ͯ]/g;
const normal = (s: string) => s.normalize("NFD").replace(QUITAR_TILDES, "").toLowerCase();

const REGLAS: Array<[TipoDeTrato, RegExp]> = [
  ["marca", /\b(marca|branding|logo|identidad)\b/],
  ["web", /\b(landing|sitio|website|pagina web|web)\b/],
  ["integ", /\b(integracion|integraciones|intelisis|erp|sap|api|conector)\b/],
  ["lic", /\b(licencia|licencias|seats?|asientos|objeto|upgrade|usuarios)\b/],
  ["soporte", /\b(soporte|acuerdo macro|retainer|bolsa de horas|continuo|mantenimiento)\b/],
  ["ses", /\b(sesiones|sesion extra|horas extra)\b/],
  ["impl", /\b(implementacion|crm|insider|onboarding|migracion|proyecto)\b/],
];

/** El tipo de trabajo que trae un trato, deducido del nombre. */
export function tipoDeTrato(nombre: string, esClienteActual: boolean): { tipo: TipoDeTrato; porNombre: boolean } {
  const n = normal(nombre);
  for (const [tipo, re] of REGLAS) if (re.test(n)) return { tipo, porNombre: true };
  return { tipo: esClienteActual ? "caso" : "impl", porNombre: false };
}

/** «2026-11» a partir de una fecha, en hora de Costa Rica. */
export function periodoDe(fecha: Date | string): string {
  const d = new Date(+new Date(fecha) - 6 * 3_600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function sumarMeses(periodo: string, n: number): string {
  const [a, m] = periodo.split("-").map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export function etiquetaDelPeriodo(periodo: string): string {
  return MESES[Number(periodo.slice(5, 7)) - 1] ?? periodo;
}

export interface TratoProyectado extends TratoParaProyectar {
  tipo: TipoDeTrato;
  tipoPorNombre: boolean;
  /** Horas por semana si se gana. */
  horasSemana: number;
  /** Horas que cuenta en el escenario elegido. */
  cuenta: number;
  /** Primer mes en que suma. */
  llega: string;
  cierreVencido: boolean;
}

export interface MesProyectado {
  periodo: string;
  etiqueta: string;
  base: number;
  pipeline: number;
  total: number;
  utilizacion: number;
  semaforo: Semaforo;
}

export interface Proyeccion {
  escenario: Escenario;
  capacidad: number;
  meses: MesProyectado[];
  tratos: TratoProyectado[];
  /** Primer mes sobre el umbral de sobrecarga, o null. */
  primerMesSobre: string | null;
  /** CSE que faltan para quedar bajo el umbral en el peor mes del horizonte. */
  cseQueFaltan: number;
  /** Fecha («AAAA-MM-DD») hasta la que conviene abrir la búsqueda, o null si no hace falta. */
  abrirBusquedaAntesDe: string | null;
  tratosConCierreVencido: number;
}

export interface EntradaDeProyeccion {
  /** Horas comprometidas por semana hoy, del equipo que lleva cuentas. */
  base: number;
  /** Horas disponibles por semana del equipo. */
  capacidad: number;
  /** Horas disponibles de un CSE nuevo. */
  horasPorCse: number;
  tratos: TratoParaProyectar[];
  escenario: Escenario;
  hoy: Date;
  /** Meses del horizonte, contando el actual. */
  meses?: number;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

export function proyectarDemanda(e: EntradaDeProyeccion, config: ConfigCarga): Proyeccion {
  const actual = periodoDe(e.hoy);
  const periodos = Array.from({ length: e.meses ?? 3 }, (_, i) => sumarMeses(actual, i));
  const tratos: TratoProyectado[] = e.tratos.map((t) => {
    const { tipo, porNombre } = tipoDeTrato(t.nombre, t.esClienteActual);
    const horasSemana = config.horasPorTrato[tipo];
    const p = Math.max(0, Math.min(1, t.probabilidad));
    const cuenta = e.escenario === "todo" ? horasSemana : e.escenario === "ponderado" ? horasSemana * p : p >= PROBABILIDAD_CASI_CERRADO ? horasSemana : 0;
    const cierre = t.cierre ? new Date(t.cierre) : null;
    const cierreVencido = !cierre || cierre < e.hoy;
    const desde = cierreVencido ? e.hoy : cierre!;
    return { ...t, tipo, tipoPorNombre: porNombre, horasSemana: r1(horasSemana), cuenta: r1(cuenta), llega: sumarMeses(periodoDe(desde), 1), cierreVencido };
  });

  const meses = periodos.map((periodo) => {
    const pipeline = tratos.filter((t) => t.llega <= periodo).reduce((a, t) => a + t.cuenta, 0);
    const total = e.base + pipeline;
    const utilizacion = e.capacidad > 0 ? (total / e.capacidad) * 100 : 0;
    return { periodo, etiqueta: etiquetaDelPeriodo(periodo), base: r1(e.base), pipeline: r1(pipeline), total: r1(total), utilizacion: Math.round(utilizacion), semaforo: semaforoDe(utilizacion, config) };
  });

  const umbral = config.semaforo.sobrecarga / 100;
  const primer = meses.find((m) => m.utilizacion > config.semaforo.sobrecarga) ?? null;
  const peor = meses.reduce((a, m) => (m.total > a ? m.total : a), 0);
  const faltan = Math.max(0, peor - e.capacidad * umbral);
  const cseQueFaltan = primer && e.horasPorCse > 0 ? Math.ceil(faltan / (e.horasPorCse * umbral)) : 0;
  let abrirBusquedaAntesDe: string | null = null;
  if (primer) {
    const inicio = Date.parse(`${primer.periodo}-01T00:00:00Z`) - config.semanasParaContratar * 7 * 86_400_000;
    abrirBusquedaAntesDe = new Date(inicio).toISOString().slice(0, 10);
  }
  return {
    escenario: e.escenario,
    capacidad: r1(e.capacidad),
    meses,
    tratos,
    primerMesSobre: primer?.periodo ?? null,
    cseQueFaltan,
    abrirBusquedaAntesDe,
    tratosConCierreVencido: tratos.filter((t) => t.cierreVencido).length,
  };
}
