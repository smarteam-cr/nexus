/**
 * lib/escala/herramientas/vigente.ts — el mapa de herramientas que está publicado en Nexus. SERVIDOR.
 *
 * Se publica junto con la escala (`scripts/publicar-escala.ts`), en la misma tabla, como documento
 * `herramientas`. Se lee y se parsea UNA vez por versión, como la escala. Si la última publicada no
 * se entiende con ESTE código, se usa la anterior que sí; y si no hay ninguna, la sección se ve igual,
 * sin el filtro de herramientas.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { ErrorDeFormato } from "../documento/tipos";
import { parsearMapaDeHerramientas } from "./parsear";
import type { MapaDeHerramientas } from "./tipos";

const parseados = new Map<string, MapaDeHerramientas | ErrorDeFormato>();

function parsearConCache(huella: string, texto: string): MapaDeHerramientas | ErrorDeFormato {
  const previo = parseados.get(huella);
  if (previo) return previo;
  let r: MapaDeHerramientas | ErrorDeFormato;
  try {
    r = parsearMapaDeHerramientas(texto);
  } catch (e) {
    r = e instanceof ErrorDeFormato ? e : new ErrorDeFormato(e instanceof Error ? e.message : String(e));
  }
  parseados.set(huella, r);
  return r;
}

export async function leerMapaDeHerramientasVigente(): Promise<MapaDeHerramientas | null> {
  if (!modeloDisponible(prisma.escalaDocumento)) return null;
  try {
    const publicados = await prisma.escalaDocumento.findMany({
      where: { documento: "herramientas" },
      orderBy: { publicadaEn: "desc" },
      select: { id: true, version: true, huella: true },
      take: 5,
    });
    for (const p of publicados) {
      let resultado = parseados.get(p.huella);
      if (!resultado) {
        const fila = await prisma.escalaDocumento.findUnique({ where: { id: p.id }, select: { texto: true } });
        if (!fila) continue;
        resultado = parsearConCache(p.huella, fila.texto);
      }
      if (resultado instanceof ErrorDeFormato) {
        console.error(`[escala] el mapa de herramientas publicado ${p.version} no se puede leer con este código:`, resultado.message);
        continue;
      }
      return resultado;
    }
    return null;
  } catch (e) {
    if (esquemaDesactualizado(e)) return null;
    throw e;
  }
}
