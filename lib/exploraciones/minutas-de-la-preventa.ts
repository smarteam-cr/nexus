/**
 * lib/exploraciones/minutas-de-la-preventa.ts — las minutas de las reuniones más recientes DE LA PREVENTA. SERVIDOR.
 *
 * Salió de personalizar-caso.ts (décima vuelta, 2026-11-08) para que la usen también el agente que ordena los casos
 * (orden-de-los-casos.ts) y el de «Mejorar con IA» de las actividades (mejorar-actividades.ts), sin importar uno del otro.
 *
 * ⛔ Invariante 1: las reuniones salen de `reunionesDeLaExploracion`, que las toma del chokepoint de sesiones de su empresa.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { EstadoDeExploracion } from "./contenido";
import { diaConAnio } from "./fechas";
import { reunionesDeLaExploracion } from "./fuentes";
import { claveDeReunion } from "./guia";
import { leerLoLeido } from "./lo-leido";
import type { FilaDeExploracion } from "./servidor";

/** Cuántas reuniones recientes lee y cuánto de cada minuta: alcanza para el contexto sin inflar el pedido. */
const REUNIONES_QUE_LEE = 6;
const LARGO_DE_UNA_MINUTA = 1500;

/** Lo de la fila que hace falta para saber cuáles son las reuniones de la preventa. */
export type FilaParaLasReuniones = Pick<FilaDeExploracion, "id" | "clientId" | "projectId" | "createdAt" | "test">;

/**
 * Las minutas de las reuniones más recientes DE LA PREVENTA, con la misma regla con que la preventa decide cuáles son
 * suyas (`reunionesDeLaExploracion`, que las toma del chokepoint de sesiones: invariante 1): las de sus sesiones y, en un
 * prospecto, las que entraron solas. Sin las de puertas adentro, sin las que se sacaron ni las de antes que ya no son de
 * ninguna sesión (revisión del 2026-11-08: antes se tomaban las 6 últimas de la empresa, y en un cliente con Customer
 * Success activo entraban sus seguimientos semanales).
 */
export async function minutasRecientes(fila: FilaParaLasReuniones, estado: EstadoDeExploracion): Promise<string> {
  const fuera = new Set(estado.contenido.fuera);
  const todas = await reunionesDeLaExploracion({
    exploracionId: fila.id,
    clientId: fila.clientId,
    projectId: fila.projectId,
    creadaEn: fila.createdAt,
    propuesta: estado.propuesta,
    leido: leerLoLeido(fila.test),
    sesiones: estado.contenido.sesiones,
    fuera: estado.contenido.fuera,
    elegidas: estado.contenido.reunionesElegidas,
  }).catch(() => []);
  const reuniones = todas
    .filter((r) => r.origen === "meet" && !r.legado && !r.puertasAdentro && !fuera.has(claveDeReunion(r)))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, REUNIONES_QUE_LEE)
    .map((r) => ({ id: r.id, title: r.titulo, date: r.fecha }));
  if (!reuniones.length) return "";
  const minutas = await prisma.sessionMinute
    .findMany({ where: { sessionId: { in: reuniones.map((r) => r.id) } }, select: { sessionId: true, summary: true } })
    .catch(() => []);
  return reuniones
    .map((r) => ({ r, m: minutas.find((x) => x.sessionId === r.id)?.summary?.trim() }))
    .filter((x) => x.m)
    .map((x) => `- ${x.r.title} (${diaConAnio(x.r.date)}): ${x.m!.slice(0, LARGO_DE_UNA_MINUTA)}`)
    .join("\n");
}
