/**
 * lib/invariantes/exploraciones.ts — las sesiones de una exploración y su empresa (K5 del roadmap, 2026-10-27).
 */
import type { PrismaClient } from "@prisma/client";
import { cumple, viola, type Invariante } from "./contrato";

/** Lo que hace falta de cada sesión guardada (el Json `contenido` de `ExploracionDeVenta`). */
function reunionesDeMeet(contenido: unknown): string[] {
  const sesiones = (contenido as { sesiones?: unknown } | null)?.sesiones;
  if (!Array.isArray(sesiones)) return [];
  return sesiones.flatMap((s) => {
    const r = (s as { reunion?: { id?: unknown; origen?: unknown } } | null)?.reunion;
    return r && r.origen === "meet" && typeof r.id === "string" ? [r.id] : [];
  });
}

/**
 * INV61 · Ninguna sesión de una exploración está unida a una reunión de OTRA empresa (invariante 1). Desde el 2026-10-27
 * Nexus une solo a su sesión la reunión que calza sin duda (lib/exploraciones/asociar-server.ts, job
 * `exploraciones-asociar`), y las candidatas salen del chokepoint; esta es la red en la base: la reunión de cada sesión
 * es de la empresa de su exploración (`resolvedClientId` o `manualClientId`, el mismo criterio que INV1). Una reunión sin
 * dueña no cuenta (unirla a mano la adopta).
 */
export const INV61: Invariante = {
  id: "61",
  nombre: "ninguna sesión de una exploración está unida a una reunión de otra empresa",
  async correr(db: PrismaClient) {
    const filas = await db.exploracionDeVenta.findMany({ select: { id: true, clientId: true, contenido: true } });
    const pares = filas.flatMap((f) => reunionesDeMeet(f.contenido).map((sessionId) => ({ exploracionId: f.id, clientId: f.clientId, sessionId })));
    if (!pares.length) return cumple("✓ INV61: ninguna sesión de una exploración está unida a una reunión de Meet todavía.");
    const reuniones = await db.firefliesSession.findMany({
      where: { id: { in: [...new Set(pares.map((p) => p.sessionId))] } },
      select: { id: true, title: true, resolvedClientId: true, manualClientId: true },
    });
    const porId = new Map(reuniones.map((r) => [r.id, r]));
    /* La regla del chokepoint (`belongsToClient`, lib/sessions/project-sources.ts): es de la empresa si el dueño resuelto
       o el puesto a mano es ella. Cruza si tiene dueño (cualquiera de los dos) y ninguno es la empresa: también la que
       solo tiene el puesto a mano, de otra, todavía sin pasar al resuelto. Sin ningún dueño no cuenta. */
    const cruzadas = pares.filter((p) => {
      const r = porId.get(p.sessionId);
      if (!r || (r.resolvedClientId === null && r.manualClientId === null)) return false;
      return r.resolvedClientId !== p.clientId && r.manualClientId !== p.clientId;
    });
    if (!cruzadas.length) return cumple(`✓ INV61: las ${pares.length} sesiones unidas a una reunión de Meet son de la empresa de su exploración.`);
    return viola(
      `✗ INV61 VIOLADO: ${cruzadas.length} sesión(es) de una exploración unidas a una reunión de otra empresa (la guía leería lo que dijo otro cliente).`,
      ...cruzadas.slice(0, 10).map((p) => `    - «${porId.get(p.sessionId)?.title ?? p.sessionId}» (${p.sessionId}) en la exploración ${p.exploracionId}`),
      "    Remedio: abrir la exploración y quitar esa reunión de la sesión (o corregir el dueño de la reunión en /sessions si el que está mal es el dueño).",
    );
  },
};
