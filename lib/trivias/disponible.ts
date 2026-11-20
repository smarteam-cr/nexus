/**
 * lib/trivias/disponible.ts — ¿están las tablas de Trivias? SERVIDOR.
 *
 * Mira las DOS puntas (KNOWN-ERRORS, Tareas 2026-10-09): que el cliente de Prisma conozca los modelos Y que la base
 * tenga las tablas. Sin eso, en el 3004 (cliente regenerado contra producción todavía sin el SQL) la pantalla reventaría
 * con P2021 en vez de decir qué falta. En verde no se vuelve a preguntar (el esquema solo crece); sin las tablas, se
 * vuelve a mirar como mucho cada 30 s, así correr el SQL lo pone en verde sin reiniciar.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { modeloDisponible } from "@/lib/db/esquema";

export const SQL_DE_TRIVIAS = "scripts/sql/2026-11-19-trivias.sql";

export const TABLAS_DE_TRIVIAS = [
  "Trivia",
  "PreguntaDeTrivia",
  "PartidaDeTrivia",
  "JugadorDeTrivia",
  "RespuestaDeTrivia",
] as const;

const REMIRAR_SIN_TABLAS_MS = 30_000;
let miradas: { ok: boolean; en: number } | null = null;
let mirando: Promise<boolean> | null = null;

async function tablasEnLaBase(): Promise<boolean> {
  if (miradas?.ok) return true;
  if (miradas && performance.now() - miradas.en < REMIRAR_SIN_TABLAS_MS) return false;
  mirando ??= (async () => {
    try {
      const filas = await prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n
        FROM unnest(${[...TABLAS_DE_TRIVIAS]}::text[]) AS t(nombre)
        WHERE to_regclass(format('public.%I', t.nombre)) IS NOT NULL`;
      const ok = Number(filas[0]?.n ?? 0) === TABLAS_DE_TRIVIAS.length;
      miradas = { ok, en: performance.now() };
      return ok;
    } catch {
      // Si el catálogo no responde no se afirma que falte nada: la consulta de la pantalla dirá lo suyo.
      return true;
    } finally {
      mirando = null;
    }
  })();
  return mirando;
}

export async function triviasDisponible(): Promise<boolean> {
  const modelos =
    modeloDisponible(prisma.trivia) &&
    modeloDisponible(prisma.preguntaDeTrivia) &&
    modeloDisponible(prisma.partidaDeTrivia) &&
    modeloDisponible(prisma.jugadorDeTrivia) &&
    modeloDisponible(prisma.respuestaDeTrivia);
  return modelos && (await tablasEnLaBase());
}

/** Para las pruebas: olvida lo mirado. */
export function olvidarTablasMiradas(): void {
  miradas = null;
  mirando = null;
}
