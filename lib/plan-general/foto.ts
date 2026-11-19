/**
 * lib/plan-general/foto.ts — la foto del plan general que ve el cliente. Client-safe y puro.
 *
 * El cliente ve un SOLO plan: sin proyectos, sin ids, sin el detalle de cada actividad (es interno, como las notas de
 * una tarea del cronograma). La foto se congela al «Publicar» (AccesoAlPlanGeneral.publicado) y la página externa
 * pinta SOLO eso: nunca lo vivo. `FORMATO` sube cuando cambia la forma; una foto de otro formato no se sirve.
 */
import { esTipoDeTrabajo, type EstadoDelPlan, type PlanGeneral, type TipoDeTrabajo } from "./tipos";

export const FORMATO_DE_LA_FOTO = 1;

export interface FilaDeLaFoto {
  titulo: string;
  tipo: TipoDeTrabajo | null;
  desde: number;
  hasta: number;
  estado: EstadoDelPlan;
}

export interface GrupoDeLaFoto {
  loopNumero: number;
  nombre: string;
  filas: FilaDeLaFoto[];
}

export interface FotoDelPlan {
  formato: number;
  arranque: string | null;
  semanas: number;
  grupos: GrupoDeLaFoto[];
}

/** De lo que ve el equipo a lo que ve el cliente. Un loop sin actividades no sale. */
export function fotoDelPlan(plan: PlanGeneral): FotoDelPlan {
  return {
    formato: FORMATO_DE_LA_FOTO,
    arranque: plan.arranque,
    semanas: plan.semanas,
    grupos: plan.grupos
      .filter((g) => g.filas.length > 0)
      .map((g) => ({
        loopNumero: g.loopNumero,
        nombre: g.nombre,
        filas: g.filas.map((f) => ({ titulo: f.titulo, tipo: f.tipo, desde: f.desde, hasta: f.hasta, estado: f.estado })),
      })),
  };
}

const ESTADOS: readonly string[] = ["PENDING", "IN_PROGRESS", "DONE"];

/** Lee una foto guardada. null si no hay, o si es de otro formato o no se entiende (la página dice «todavía no está lista»). */
export function leerFoto(raw: unknown): FotoDelPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.formato !== FORMATO_DE_LA_FOTO || typeof r.semanas !== "number" || !Array.isArray(r.grupos)) return null;
  const grupos: GrupoDeLaFoto[] = [];
  for (const g of r.grupos as unknown[]) {
    if (!g || typeof g !== "object") return null;
    const gg = g as Record<string, unknown>;
    if (typeof gg.loopNumero !== "number" || typeof gg.nombre !== "string" || !Array.isArray(gg.filas)) return null;
    const filas: FilaDeLaFoto[] = [];
    for (const f of gg.filas as unknown[]) {
      const ff = (f ?? {}) as Record<string, unknown>;
      if (typeof ff.titulo !== "string" || typeof ff.desde !== "number" || typeof ff.hasta !== "number") return null;
      if (typeof ff.estado !== "string" || !ESTADOS.includes(ff.estado)) return null;
      filas.push({
        titulo: ff.titulo,
        tipo: esTipoDeTrabajo(ff.tipo) ? ff.tipo : null,
        desde: ff.desde,
        hasta: ff.hasta,
        estado: ff.estado as EstadoDelPlan,
      });
    }
    grupos.push({ loopNumero: gg.loopNumero, nombre: gg.nombre, filas });
  }
  return {
    formato: FORMATO_DE_LA_FOTO,
    arranque: typeof r.arranque === "string" ? r.arranque : null,
    semanas: r.semanas,
    grupos,
  };
}

/** ¿Lo de hoy difiere de lo publicado? Compara la foto que saldría hoy con la guardada, campo por campo. */
export function hayCambiosSinPublicar(hoy: FotoDelPlan, publicada: FotoDelPlan | null): boolean {
  if (!publicada) return hoy.grupos.length > 0;
  return JSON.stringify(hoy) !== JSON.stringify(publicada);
}
