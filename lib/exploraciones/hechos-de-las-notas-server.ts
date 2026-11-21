/**
 * lib/exploraciones/hechos-de-las-notas-server.ts — el ÚNICO lector de los hechos de las notas de una preventa (21 nov).
 * SERVIDOR.
 *
 * Acotado a UNA preventa y a SU cliente: la exploración pone el `clientId` (de la fila, nunca del navegador) y la lectura
 * pide los dos, así un hecho que por error quedara con otro cliente no se muestra acá (INV45 lo caza). Solo los de una
 * nota (`notaClave`), nunca los de una reunión. Internos: lo llama solo la ruta de la preventa, con su guardia.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { agruparPorNota, type HechosDeLasNotas } from "./hechos-de-las-notas";
import { loQueSabeElEquipo } from "./lo-que-sabes";
import { estadoDesdeFila, leerExploracion } from "./servidor";

/** Cuántos hechos lee como mucho (12 por nota y hasta 20 notas: de sobra). */
const TOPE = 300;

/** Los hechos de cada nota de «Lo que sabes del cliente» de esta preventa. Vacío si no hay, o si la base no los tiene. */
export async function hechosDeLasNotas(exploracionId: string): Promise<HechosDeLasNotas> {
  const lectura = await leerExploracion(exploracionId);
  if (lectura.estado !== "ok") return {};
  const fila = lectura.fila;
  const notas = new Set(loQueSabeElEquipo(estadoDesdeFila(fila).contenido.notas).map((n) => n.clave));
  if (!notas.size) return {};
  try {
    const filas = await prisma.hechoDeReunion.findMany({
      where: { exploracionId, clientId: fila.clientId, notaClave: { in: [...notas] } },
      orderBy: { createdAt: "asc" },
      take: TOPE,
      select: { id: true, notaClave: true, tipo: true, frase: true, dichoPorEmail: true, fechaDeLaReunion: true },
    });
    const correos = [...new Set(filas.map((f) => f.dichoPorEmail).filter((x): x is string => !!x))];
    const miembros = correos.length
      ? await prisma.teamMember.findMany({ where: { email: { in: correos, mode: "insensitive" } }, select: { email: true, name: true } })
      : [];
    const nombres = new Map(miembros.filter((m) => m.name?.trim()).map((m) => [m.email.toLowerCase(), m.name!.trim()]));
    return agruparPorNota(filas, nombres, notas);
  } catch (e) {
    if (esquemaDesactualizado(e)) return {};
    throw e;
  }
}
