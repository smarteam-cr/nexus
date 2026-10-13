/**
 * lib/servicios/panel-del-servicio.ts — lo que el Resumen de un proyecto recurrente muestra a la derecha: lo que debe
 * el cliente, los hitos y las sesiones fijas (2026-10-12, pedido de Elías). PURO.
 *
 * Todo sale del cronograma del proyecto (las tareas con responsable CLIENTE y el fin de cada fase) y del calendario
 * (las reuniones con la empresa que son de una serie). No se guarda nada: se calcula al abrir el Resumen.
 */
import { addWeeks, computePhaseRanges, overduePlannedEnd } from "@/lib/timeline/weeks";

export interface FaseParaElPanel {
  name: string;
  order: number;
  durationWeeks: number;
  startWeek: number | null;
  status: string;
  tasks: Array<{ title: string; weekIndex: number; status: string; party: string | null }>;
}

export interface DeudaDelCliente {
  titulo: string;
  fase: string;
  /** Fin de la semana de la tarea (ISO), o null sin fecha de arranque. */
  vence: string | null;
  atrasada: boolean;
}

export interface HitoDelPanel {
  fase: string;
  /** Fin planeado de la fase (ISO), o null sin fecha de arranque. */
  fin: string | null;
  estado: "hecho" | "atrasado" | "proximo" | "pendiente";
}

export interface SesionFija {
  titulo: string;
  /** La próxima instancia (ISO). */
  proxima: string;
  /** Cada cuánto, deducido de las instancias de las próximas semanas («cada semana»). null = no se sabe. */
  cada: string | null;
}

const ordenar = (f: readonly FaseParaElPanel[]) => [...f].sort((a, b) => a.order - b.order);

/** Las tareas del CLIENTE sin resolver: las atrasadas primero (la más vieja arriba), después las que vienen. */
export function loQueDebeElCliente(
  fases: readonly FaseParaElPanel[],
  anchor: string | null,
  ahora: Date,
  max = 6,
): { items: DeudaDelCliente[]; total: number } {
  const ordenadas = ordenar(fases);
  const rangos = computePhaseRanges(ordenadas);
  const todas: DeudaDelCliente[] = [];
  ordenadas.forEach((f, i) => {
    for (const t of f.tasks) {
      if (t.party !== "CLIENTE" || t.status === "DONE" || t.status === "SUSPENDED") continue;
      const vence = overduePlannedEnd(anchor, rangos[i].start, t.weekIndex);
      todas.push({ titulo: t.title, fase: f.name, vence: vence ? vence.toISOString() : null, atrasada: !!vence && vence < ahora });
    }
  });
  todas.sort((a, b) => {
    if (a.atrasada !== b.atrasada) return a.atrasada ? -1 : 1;
    return (a.vence ?? "9999").localeCompare(b.vence ?? "9999");
  });
  return { items: todas.slice(0, max), total: todas.length };
}

/** El fin de cada fase como hito: hecho, atrasado, el próximo y los que siguen. */
export function hitosDelCronograma(fases: readonly FaseParaElPanel[], anchor: string | null, ahora: Date): HitoDelPanel[] {
  const ordenadas = ordenar(fases);
  const rangos = computePhaseRanges(ordenadas);
  let proximoMarcado = false;
  return ordenadas
    .map((f, i) => ({ f, fin: anchor ? addWeeks(anchor, rangos[i].end) : null }))
    .sort((a, b) => (a.fin?.getTime() ?? 0) - (b.fin?.getTime() ?? 0))
    .map(({ f, fin }) => {
      let estado: HitoDelPanel["estado"];
      if (f.status === "DONE") estado = "hecho";
      else if (fin && fin < ahora) estado = "atrasado";
      else if (!proximoMarcado) {
        estado = "proximo";
        proximoMarcado = true;
      } else estado = "pendiente";
      return { fase: f.name, fin: fin ? fin.toISOString() : null, estado };
    });
}

/** «cada semana», «cada 15 días», «cada mes», desde la distancia típica entre instancias. null con una sola. */
export function cadaCuanto(inicios: readonly string[]): string | null {
  if (inicios.length < 2) return null;
  const ms = [...inicios].sort().map((i) => new Date(i).getTime());
  const dias = ms.slice(1).map((t, k) => Math.round((t - ms[k]) / 86_400_000));
  const tipico = dias.sort((a, b) => a - b)[Math.floor(dias.length / 2)];
  if (tipico <= 1) return "cada día";
  if (tipico <= 8) return "cada semana";
  if (tipico <= 16) return "cada 15 días";
  if (tipico <= 35) return "cada mes";
  return null;
}

/** Las sesiones fijas: las reuniones de una serie, una por título, con su próxima fecha. */
export function sesionesFijas(agendadas: ReadonlyArray<{ titulo: string; inicio: string; serie: boolean }>, max = 4): SesionFija[] {
  const porTitulo = new Map<string, string[]>();
  for (const a of agendadas) {
    if (!a.serie) continue;
    const clave = a.titulo.trim();
    porTitulo.set(clave, [...(porTitulo.get(clave) ?? []), a.inicio]);
  }
  return [...porTitulo.entries()]
    .map(([titulo, inicios]) => ({ titulo, proxima: [...inicios].sort()[0], cada: cadaCuanto(inicios) }))
    .sort((a, b) => a.proxima.localeCompare(b.proxima))
    .slice(0, max);
}
