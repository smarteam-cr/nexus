/**
 * lib/timeline/ciclo.ts — los casos de uso de un ciclo como fases del cronograma. PURO y CLIENT-SAFE.
 *
 * Cada caso de uso puede ser una FASE del `ProjectTimeline` del proyecto (`CasoDeUso.faseId`), y sus dependencias del
 * cliente, tareas de esa fase con responsable CLIENTE. Hoy solo lo lee la ruta del servicio (lib/servicios/
 * ruta-del-servicio-server.ts): Nexus ya no arma ni aprueba cronogramas por ciclo (Elías, 31 oct).
 */
import { addWeeks, overduePlannedEnd } from "./weeks";

const DIA = 86_400_000;

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
        tareas: { hechas: 0, total: 0 }, dependencias: [],
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
