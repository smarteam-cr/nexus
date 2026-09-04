/**
 * lib/invariantes/sesiones.ts — los invariantes de reuniones y su dueño (extraídos de
 * scripts/check-invariants.ts en B-07, 2026-09-04; el texto de cada uno viene de ahí).
 */
import { cumple, viola, type Invariante } from "./contrato";

/**
 * INV1 · Ningún `SessionProject` cruza cliente: la sesión (resolvedClientId/manualClientId)
 * pertenece al cliente del proyecto. Es EL invariante del leak cross-empresa de handoffs — la
 * red dura aunque el chokepoint ya filtre en runtime.
 */
export const INV1: Invariante = {
  id: "1",
  nombre: "ningún SessionProject cruza cliente",
  async correr(db) {
    const links = await db.sessionProject.findMany({
      select: {
        project: { select: { clientId: true } },
        session: { select: { id: true, title: true, resolvedClientId: true, manualClientId: true } },
      },
    });
    const cross = links.filter((l) => {
      const pc = l.project.clientId;
      const { resolvedClientId: r, manualClientId: m } = l.session;
      return r !== null && pc !== r && pc !== m;
    });
    if (cross.length > 0) {
      return viola(
        `✗ INV1 VIOLADO: ${cross.length} SessionProject cruzan cliente (contexto de un cliente alimentaría a otro).`,
        "  Corré: npx tsx scripts/cleanup-cross-client-session-projects.ts --apply",
        ...cross.slice(0, 10).map((l) => `    - "${l.session.title}" (${l.session.id})`),
      );
    }
    return cumple("✓ INV1: ningún SessionProject cruza cliente.");
  },
};

/**
 * INV21 · Ningún proyecto activo se quedó SIN NINGUNA reunión vinculada mientras su cliente sí
 * tiene sesiones (2026-08-18). El alta sella `Project.altaReclasificadoAt` para pagar la
 * reclasificación una sola vez. El sello es correcto; lo que faltaba es que la corrida tuviera
 * algo que mirar. Dos formas de que no lo tenga, las dos vistas en producción el mismo día:
 *   (a) el cliente acaba de nacer en el alta y todavía ninguna sesión le fue atribuida
 *       («Discover Puerto Rico»: cliente creado 2 segundos antes de reclasificar);
 *   (b) el historial del cliente es más viejo que la ventana de la reclasificación
 *       («kamalio»: 3 sesiones de 2025, alta de agosto 2026).
 * En los dos casos el CSE ve lo mismo —el proyecto no tiene ninguna reunión— y como el sello ya
 * está puesto, no se arregla solo nunca. Este invariante lo hace visible.
 * Remedio: `scripts/sanar-vinculos-de-alta.ts` (dry-run primero). ⚠ Si se cambia el criterio de
 * acá, cambiarlo también allá: el invariante y su remedio tienen que mirar lo mismo, o el gate
 * reporta algo que el script no cubre.
 */
export const INV21: Invariante = {
  id: "21",
  nombre: "ningún proyecto activo sin reuniones teniendo el cliente sesiones",
  async correr(db, ahora) {
    const conSello = await db.project.findMany({
      where: { status: "active", altaReclasificadoAt: { not: null } },
      select: { id: true, name: true, clientId: true, _count: { select: { sessions: true } } },
    });
    const huerfanos: string[] = [];
    for (const p of conSello) {
      if (p._count.sessions > 0) continue;
      const sesionesDelCliente = await db.firefliesSession.count({
        where: {
          OR: [{ manualClientId: p.clientId }, { manualClientId: null, resolvedClientId: p.clientId }],
          date: { lte: ahora },
        },
      });
      if (sesionesDelCliente > 0) huerfanos.push(`${p.name} (${sesionesDelCliente} sesión/es del cliente)`);
    }
    if (huerfanos.length > 0) {
      return viola(
        `✗ INV21 VIOLADO: ${huerfanos.length} proyecto(s) sin NINGUNA reunión vinculada aunque su cliente sí tiene:\n` +
          huerfanos.map((h) => `    · ${h}`).join("\n") +
          `\n    Remedio: npx tsx --env-file=.env scripts/sanar-vinculos-de-alta.ts (dry-run primero).`,
      );
    }
    return cumple(
      `✓ INV21: ningún proyecto quedó sin reuniones teniendo el cliente sesiones (${conSello.length} con sello).`,
    );
  },
};
