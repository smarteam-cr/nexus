/**
 * lib/timeline/ciclo.ts — el CRONOGRAMA DEL CICLO de un servicio recurrente. PURO y CLIENT-SAFE.
 *
 * (docs/smartloop-plan.md, etapa 3; ficha E del roadmap.) En un servicio recurrente cada CASO DE USO del ciclo es una
 * FASE del cronograma del proyecto, con su criterio de aceptación. Las dependencias del cliente son tareas de esa fase
 * con responsable CLIENTE (no se crean tareas en Tareas). No hay un cronograma aparte: es el mismo `ProjectTimeline` del
 * proyecto, así el Gantt, «Lo que debe el cliente» y los hitos del Resumen lo leen sin cambiar nada.
 *
 * Lo que vive acá:
 *  · `cronogramaDelCiclo`: cada caso de uso con sus semanas, sus fechas, su avance y sus dependencias del cliente.
 *  · la VERSIÓN APROBADA: la foto que se le presentó al cliente (`fotoParaAprobar`) y lo que cambió desde ahí
 *    (`cambiosDesdeLaAprobada`).
 *  · la propuesta cuando una dependencia del cliente se atrasa (`propuestaPorDependencia`): Nexus PROPONE correr lo que
 *    destraba, con un clic; no lo mueve solo.
 *
 * ⚠ Esto NO cambia cómo funciona el cronograma de una implementación: solo lo usan los proyectos recurrentes.
 */
import { addWeeks, overduePlannedEnd } from "./weeks";

const DIA = 86_400_000;

// ── Semanas del ciclo ────────────────────────────────────────────────────────

/** La semana del cronograma (0 = la del ancla) en la que cae `desde`. Nunca negativa. */
export function semanaDelCiclo(anchor: string, desde: string): number {
  const d = Math.round((Date.parse(`${desde.slice(0, 10)}T00:00:00Z`) - Date.parse(`${anchor.slice(0, 10)}T00:00:00Z`)) / DIA);
  return Math.max(0, Math.floor(d / 7));
}

/** Cuántas semanas tiene el ciclo, de `desde` a `hasta` inclusive. 1 como mínimo; null sin fechas. */
export function semanasDelCiclo(desde: string | null, hasta: string | null): number | null {
  if (!desde || !hasta) return null;
  const d = Math.round((Date.parse(`${hasta.slice(0, 10)}T00:00:00Z`) - Date.parse(`${desde.slice(0, 10)}T00:00:00Z`)) / DIA) + 1;
  return Math.max(1, Math.ceil(d / 7));
}

/** Lo que lleva una fase de caso de uso en sus notas: su criterio de aceptación, a la vista en el Gantt. */
export function notasDeLaFase(caso: { criterio: string | null; metrica: string | null }): string | null {
  const partes = [
    caso.criterio?.trim() ? `Criterio de aceptación: ${caso.criterio.trim()}` : null,
    caso.metrica?.trim() ? `Métrica: ${caso.metrica.trim()}` : null,
  ].filter(Boolean);
  return partes.length ? partes.join("\n") : null;
}

// ── El cronograma del ciclo ──────────────────────────────────────────────────

export interface TareaDeLaFase {
  id: string;
  title: string;
  weekIndex: number;
  status: string;
  party: string | null;
  /** «Por validar»: el agente la inventó y el CSE no la revisó. Nunca cruza al cliente (`cruzaAlCliente`). */
  needsValidation: boolean;
}

export interface FaseDelCiclo {
  id: string;
  name: string;
  durationWeeks: number;
  /** Semana absoluta de inicio. Las fases de un ciclo la llevan siempre (las arma Nexus). */
  startWeek: number | null;
  status: string;
  tasks: TareaDeLaFase[];
}

export interface CasoParaElCronograma {
  id: string;
  titulo: string;
  criterio: string | null;
  metrica: string | null;
  estado: string;
  faseId: string | null;
}

export interface DependenciaDelCliente {
  id: string;
  titulo: string;
  /** Fin planeado (ISO) o null sin ancla. */
  vence: string | null;
  hecha: boolean;
  atrasada: boolean;
}

export type EstadoDelCasoEnElCronograma = "sin_fase" | "pendiente" | "en_curso" | "hecha";

export interface CasoEnElCronograma {
  casoId: string;
  titulo: string;
  criterio: string | null;
  metrica: string | null;
  faseId: string | null;
  /** Semanas absolutas del cronograma (fin exclusivo). null sin fase. */
  inicio: number | null;
  fin: number | null;
  /** Fechas (ISO) con ancla; null sin ancla o sin fase. `hasta` es el último día de la fase. */
  desde: string | null;
  hasta: string | null;
  estado: EstadoDelCasoEnElCronograma;
  /** La fase debía terminar y no terminó. */
  atrasado: boolean;
  /** Las tareas de Smarteam o de los dos (sin las dependencias del cliente). */
  tareas: { hechas: number; total: number };
  dependencias: DependenciaDelCliente[];
  /** Lo que Nexus propone cuando una dependencia del cliente se atrasó. null = nada que proponer. */
  propuesta: PropuestaPorDependencia | null;
}

export interface CronogramaDelCiclo {
  casos: CasoEnElCronograma[];
  /** Casos del ciclo que todavía no son una fase. */
  sinFase: number;
  /** Cuántos casos con fase están hechos, de cuántos. */
  avance: { hechos: number; total: number };
  /** Las dependencias del cliente atrasadas, en todo el ciclo. */
  dependenciasAtrasadas: number;
}

const resuelta = (s: string) => s === "DONE" || s === "SUSPENDED";

function estadoDeLaFase(status: string): Exclude<EstadoDelCasoEnElCronograma, "sin_fase"> {
  if (status === "DONE") return "hecha";
  if (status === "IN_PROGRESS") return "en_curso";
  return "pendiente";
}

export function cronogramaDelCiclo(input: {
  anchor: string | null;
  casos: readonly CasoParaElCronograma[];
  fases: readonly FaseDelCiclo[];
  ahora: Date;
}): CronogramaDelCiclo {
  const { anchor, ahora } = input;
  const porId = new Map(input.fases.map((f) => [f.id, f]));
  const casos = input.casos.map((c): CasoEnElCronograma => {
    const fase = c.faseId ? porId.get(c.faseId) : undefined;
    if (!fase) {
      return {
        casoId: c.id, titulo: c.titulo, criterio: c.criterio, metrica: c.metrica, faseId: null,
        inicio: null, fin: null, desde: null, hasta: null, estado: "sin_fase", atrasado: false,
        tareas: { hechas: 0, total: 0 }, dependencias: [], propuesta: null,
      };
    }
    const inicio = fase.startWeek ?? 0;
    const fin = inicio + Math.max(1, fase.durationWeeks || 1);
    const desde = anchor ? addWeeks(anchor, inicio).toISOString().slice(0, 10) : null;
    const hasta = anchor ? new Date(addWeeks(anchor, fin).getTime() - DIA).toISOString().slice(0, 10) : null;
    const delCliente = fase.tasks.filter((t) => t.party === "CLIENTE");
    const nuestras = fase.tasks.filter((t) => t.party !== "CLIENTE");
    const dependencias = delCliente.map((t): DependenciaDelCliente => {
      const vence = overduePlannedEnd(anchor, inicio, t.weekIndex);
      const hecha = resuelta(t.status);
      return { id: t.id, titulo: t.title, vence: vence ? vence.toISOString() : null, hecha, atrasada: !hecha && !!vence && vence < ahora };
    });
    const estado = estadoDeLaFase(fase.status);
    const finFecha = anchor ? addWeeks(anchor, fin) : null;
    return {
      casoId: c.id,
      titulo: c.titulo,
      criterio: c.criterio,
      metrica: c.metrica,
      faseId: fase.id,
      inicio,
      fin,
      desde,
      hasta,
      estado,
      atrasado: estado !== "hecha" && !!finFecha && finFecha < ahora,
      tareas: { hechas: nuestras.filter((t) => resuelta(t.status)).length, total: nuestras.length },
      dependencias,
      propuesta: estado === "hecha" ? null : propuestaPorDependencia({ fase, dependencias, ahora }),
    };
  });
  const conFase = casos.filter((c) => c.estado !== "sin_fase");
  return {
    casos,
    sinFase: casos.length - conFase.length,
    avance: { hechos: conFase.filter((c) => c.estado === "hecha").length, total: conFase.length },
    dependenciasAtrasadas: casos.reduce((n, c) => n + c.dependencias.filter((d) => d.atrasada).length, 0),
  };
}

// ── Dependencia del cliente atrasada → propuesta de un clic ──────────────────

export interface PropuestaPorDependencia {
  /** Cuántas semanas se corre el fin de la fase (y las dependencias atrasadas). */
  semanas: number;
  /** Las dependencias que se corren. */
  dependencias: string[];
  texto: string;
}

/**
 * Cuando una dependencia del cliente se atrasó, lo que destraba es el caso de uso: Nexus propone correr el fin de su
 * fase tantas semanas como lleva atrasada la dependencia más vieja, y pasar las dependencias atrasadas esas mismas
 * semanas más adelante. Solo propone: se aplica con un clic (docs/smartloop-plan.md).
 */
export function propuestaPorDependencia(input: {
  fase: Pick<FaseDelCiclo, "name">;
  dependencias: readonly DependenciaDelCliente[];
  ahora: Date;
}): PropuestaPorDependencia | null {
  const atrasadas = input.dependencias.filter((d) => d.atrasada && d.vence);
  if (atrasadas.length === 0) return null;
  const masVieja = atrasadas.reduce((a, b) => (a.vence! < b.vence! ? a : b));
  const semanas = Math.max(1, Math.ceil((input.ahora.getTime() - Date.parse(masVieja.vence!)) / (7 * DIA)));
  const cuales = atrasadas.length === 1 ? `«${atrasadas[0].titulo}»` : `${atrasadas.length} dependencias del cliente`;
  return {
    semanas,
    dependencias: atrasadas.map((d) => d.id),
    texto: `${cuales} ${atrasadas.length === 1 ? "está atrasada" : "están atrasadas"}: correr el fin de «${input.fase.name}» ${semanas} ${semanas === 1 ? "semana" : "semanas"}.`,
  };
}

/** Lo que cambia en la fase al aplicar la propuesta: la duración y la semana de cada dependencia que se corre. */
export function aplicarPropuestaALaFase(
  fase: Pick<FaseDelCiclo, "durationWeeks" | "tasks">,
  propuesta: Pick<PropuestaPorDependencia, "semanas" | "dependencias">,
): { durationWeeks: number; tareas: Array<{ id: string; weekIndex: number }> } {
  const durationWeeks = Math.max(1, fase.durationWeeks || 1) + propuesta.semanas;
  const mover = new Set(propuesta.dependencias);
  const tareas = fase.tasks
    .filter((t) => mover.has(t.id))
    .map((t) => ({ id: t.id, weekIndex: Math.min(durationWeeks - 1, t.weekIndex + propuesta.semanas) }));
  return { durationWeeks, tareas };
}

// ── La versión aprobada ──────────────────────────────────────────────────────

export interface FotoDelCasoAprobado {
  casoId: string;
  titulo: string;
  criterio: string | null;
  inicio: number | null;
  fin: number | null;
  desde: string | null;
  hasta: string | null;
  dependencias: string[];
}

export interface FotoDelCronogramaDelCiclo {
  formato: 1;
  casos: FotoDelCasoAprobado[];
}

/** La foto que queda como versión aprobada: lo que se le presentó al cliente. */
export function fotoParaAprobar(cronograma: Pick<CronogramaDelCiclo, "casos">): FotoDelCronogramaDelCiclo {
  return {
    formato: 1,
    casos: cronograma.casos.map((c) => ({
      casoId: c.casoId,
      titulo: c.titulo,
      criterio: c.criterio,
      inicio: c.inicio,
      fin: c.fin,
      desde: c.desde,
      hasta: c.hasta,
      dependencias: c.dependencias.map((d) => d.titulo),
    })),
  };
}

/** Lee la foto guardada; null si no hay o no tiene la forma (nunca lanza). */
export function leerFotoAprobada(v: unknown): FotoDelCronogramaDelCiclo | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.formato !== 1 || !Array.isArray(o.casos)) return null;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const str = (x: unknown) => (typeof x === "string" ? x : null);
  return {
    formato: 1,
    casos: o.casos
      .filter((c): c is Record<string, unknown> => !!c && typeof c === "object" && typeof (c as Record<string, unknown>).casoId === "string")
      .map((c) => ({
        casoId: c.casoId as string,
        titulo: str(c.titulo) ?? "",
        criterio: str(c.criterio),
        inicio: num(c.inicio),
        fin: num(c.fin),
        desde: str(c.desde),
        hasta: str(c.hasta),
        dependencias: Array.isArray(c.dependencias) ? c.dependencias.filter((d): d is string => typeof d === "string") : [],
      })),
  };
}

const rango = (c: { inicio: number | null; fin: number | null }) =>
  c.inicio == null || c.fin == null ? "sin semanas" : c.fin - c.inicio === 1 ? `S${c.inicio}` : `S${c.inicio}–S${c.fin - 1}`;

/** Lo que cambió desde la versión aprobada, en líneas que se leen («Entró …», «… pasó de S2–S4 a S3–S5»). */
export function cambiosDesdeLaAprobada(foto: FotoDelCronogramaDelCiclo | null, hoy: Pick<CronogramaDelCiclo, "casos">): string[] {
  if (!foto) return [];
  const antes = new Map(foto.casos.map((c) => [c.casoId, c]));
  const ahora = new Map(hoy.casos.map((c) => [c.casoId, c]));
  const lineas: string[] = [];
  for (const c of hoy.casos) {
    const a = antes.get(c.casoId);
    if (!a) {
      lineas.push(`Entró «${c.titulo}».`);
      continue;
    }
    if (a.inicio !== c.inicio || a.fin !== c.fin) lineas.push(`«${c.titulo}» pasó de ${rango(a)} a ${rango(c)}.`);
    if ((a.criterio ?? "").trim() !== (c.criterio ?? "").trim()) lineas.push(`Cambió el criterio de aceptación de «${c.titulo}».`);
    const deps = c.dependencias.map((d) => d.titulo);
    const nuevas = deps.filter((d) => !a.dependencias.includes(d));
    if (nuevas.length) lineas.push(`«${c.titulo}» suma ${nuevas.length === 1 ? "una dependencia del cliente" : `${nuevas.length} dependencias del cliente`}.`);
  }
  for (const a of foto.casos) if (!ahora.has(a.casoId)) lineas.push(`Salió «${a.titulo}».`);
  return lineas;
}
