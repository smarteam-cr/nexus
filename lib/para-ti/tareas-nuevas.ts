/**
 * lib/para-ti/tareas-nuevas.ts — la línea de «Para ti» con las tareas que Nexus te propuso al leer tus reuniones
 * (2026-10-20, decisión de Elías: las tareas se deciden solo en Tareas). PURO. La usa
 * lib/para-ti/fuentes/reuniones.ts.
 */
import { plural } from "./armar";
import type { Pendiente } from "./tipos";

/** La línea de las tareas nuevas: «Tienes tareas nuevas de las reuniones con Cayalá, CEMACO y Honda». */
export function lineaDeLasTareasNuevas(xs: readonly { r: { sessionId: string; fecha: string; conAcceso: boolean }; partes: { tareas: number }; empresa: string }[]): Pendiente {
  const total = xs.reduce((s, x) => s + x.partes.tareas, 0);
  const empresas = [...new Set(xs.filter((x) => x.r.conAcceso && x.empresa).map((x) => x.empresa))];
  const otras = xs.some((x) => !x.r.conAcceso || !x.empresa);
  const nombres = empresas.length > 3 ? [...empresas.slice(0, 3), `${empresas.length - 3} más`] : empresas;
  const deQuien = nombres.length ? `de las reuniones con ${unirConY(nombres)}${otras ? " y otras" : ""}` : "de tus reuniones";
  const masReciente = [...xs].sort((a, b) => b.r.fecha.localeCompare(a.r.fecha))[0]!;
  return {
    clave: "reuniones-por-revisar-lo-que-dejaron:tareas",
    fuente: "reuniones-por-revisar-lo-que-dejaron",
    cuando: "semana",
    delAgente: true,
    clientId: null,
    titulo: `Tienes tareas nuevas ${deQuien}`,
    detalle: `Nexus te propuso ${plural(total, "tarea", "tareas")} al leerlas. Las usas o las descartas en Tareas, agrupadas por reunión.`,
    meta: "Reuniones",
    accion: "Revisar en Tareas",
    href: "/tareas",
    desde: masReciente.r.fecha,
  };
}

const unirConY = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

