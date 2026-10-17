/**
 * lib/tareas/de-la-cuenta.ts — las tareas de Smarteam con una cuenta, por equipo (ficha A del roadmap, 2026-10-17).
 * CLIENT-SAFE y puro.
 *
 * En la ficha del cliente se ve todo lo que Smarteam tiene que hacer con esa empresa, de cualquier equipo: qué es, para
 * cuándo, de quién y de dónde viene. La lista sale de `cargarTareasDeLaCuenta` (lib/tareas/consultas.ts) con la regla de
 * visibilidad de todas las listas; acá solo se agrupa y se ordena lo que ya llegó serializado.
 */
import { EQUIPOS } from "./equipos";
import type { TareaVista } from "./tipos";

/** El orden de los equipos en la ficha: lo que más toca al cliente primero. */
const ORDEN_DE_EQUIPOS = ["cs", "ventas", "desarrollo", "marketing", "pm", "revops", "admin"] as const;

export interface GrupoDeLaCuenta {
  /** La clave del sprint; null = sin equipo. */
  clave: string | null;
  nombre: string;
  /** Lo que espera una decisión (una propuesta de una reunión, un pedido). */
  porDecidir: TareaVista[];
  /** Pendiente o en curso. */
  abiertas: TareaVista[];
  /** Hechas en el período. */
  hechas: TareaVista[];
}

/** «Para cuándo»: el vencimiento, o la semana en que está. */
export function paraCuando(t: Pick<TareaVista, "venceEl" | "semana">): string | null {
  return t.venceEl ?? t.semana;
}

/** Atrasadas primero, después la que vence antes; lo que no tiene fecha al final. */
function porFecha(a: TareaVista, b: TareaVista): number {
  if (a.atrasada !== b.atrasada) return a.atrasada ? -1 : 1;
  return (paraCuando(a) ?? "9999").localeCompare(paraCuando(b) ?? "9999") || a.numero - b.numero;
}

function nombreDelGrupo(clave: string | null): string {
  if (!clave) return "Sin equipo";
  if (clave.startsWith("persona:")) return "Tareas personales";
  return EQUIPOS.find((e) => e.clave === clave)?.nombre ?? clave;
}

function rango(clave: string | null): number {
  if (!clave) return 99;
  const i = (ORDEN_DE_EQUIPOS as readonly string[]).indexOf(clave);
  return i === -1 ? 50 : i;
}

/** Agrupa por el sprint de la tarea. Un grupo sin nada no aparece. */
export function agruparPorEquipo(tareas: readonly TareaVista[]): GrupoDeLaCuenta[] {
  const por = new Map<string, GrupoDeLaCuenta>();
  for (const t of tareas) {
    const k = t.equipo ?? "";
    const g = por.get(k) ?? { clave: t.equipo, nombre: nombreDelGrupo(t.equipo), porDecidir: [], abiertas: [], hechas: [] };
    if (t.estado === "propuesta") g.porDecidir.push(t);
    else if (t.estado === "pendiente" || t.estado === "en_curso") g.abiertas.push(t);
    else if (t.estado === "hecha") g.hechas.push(t);
    else continue;
    por.set(k, g);
  }
  const grupos = [...por.values()];
  for (const g of grupos) {
    g.porDecidir.sort(porFecha);
    g.abiertas.sort(porFecha);
    g.hechas.sort((a, b) => (b.completadaAt ?? "").localeCompare(a.completadaAt ?? ""));
  }
  return grupos.sort((a, b) => rango(a.clave) - rango(b.clave) || a.nombre.localeCompare(b.nombre));
}
