/**
 * lib/invariantes/hubspot.ts — los invariantes de la integración con HubSpot que se contestan con la base (U9, 2026-10-25).
 */
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { cumple, viola, type Invariante } from "./contrato";

/**
 * INV54 · Ninguna ficha de Nexus apunta a una empresa de HubSpot que se fusionó dentro de otra.
 *
 * Una empresa absorbida sigue respondiendo con los datos de la que sobrevive, pero sus asociaciones (proyectos,
 * contactos, correos) se mudaron: la ficha que guarda el id viejo deja de ver lo nuevo sin ningún error (KNOWN-ERRORS,
 * «Creé un proyecto en HubSpot y Nexus no lo ve»). La búsqueda diaria de fusiones (job `hubspot-fusiones`,
 * lib/hubspot/fusiones-server.ts) guarda los pares en `FusionDeHubspot`; este invariante cruza esos pares con
 * `Client.hubspotCompanyId`. Medido el 2026-10-25: kölbi y «TEC- AE» (que es la misma empresa que «TEC»).
 *
 * Es el gemelo de INV13 (scripts/check-invariants.ts), que pregunta lo mismo a HubSpot y corre solo a mano: este se
 * contesta con la base, así lo corre el job diario y llega al semáforo de Integraciones.
 *
 * Sin la tabla (el SQL sin aplicar) o sin ninguna fusión guardada (el job no corrió) cumple: no hay nada de qué avisar.
 */
export const INV54: Invariante = {
  id: "54",
  nombre: "ninguna ficha apunta a una empresa de HubSpot fusionada",
  async correr(db) {
    let absorbidas: { idAbsorbido: string; idSobreviviente: string }[];
    try {
      absorbidas = await db.fusionDeHubspot.findMany({ where: { objeto: "empresa" }, select: { idAbsorbido: true, idSobreviviente: true } });
    } catch (e) {
      if (esquemaDesactualizado(e)) return cumple("✓ INV54: todavía no está la tabla de fusiones (scripts/sql/2026-10-25-hubspot-contexto.sql): nada que cruzar.");
      throw e;
    }
    if (!absorbidas.length) return cumple("✓ INV54: no hay fusiones de empresas guardadas (la búsqueda diaria no corrió o no encontró ninguna).");
    const nueva = new Map(absorbidas.map((a) => [a.idAbsorbido, a.idSobreviviente]));
    const fichas = await db.client.findMany({
      where: { hubspotCompanyId: { in: [...nueva.keys()] } },
      select: { id: true, name: true, hubspotCompanyId: true },
      orderBy: { name: "asc" },
    });
    if (!fichas.length) return cumple(`✓ INV54: ninguna ficha apunta a una de las ${nueva.size} empresas absorbidas en HubSpot.`);
    return viola(
      `✗ INV54 VIOLADO: ${fichas.length} ficha(s) apuntan a una empresa de HubSpot que se fusionó: no ven sus proyectos, contactos ni correos nuevos.`,
      ...fichas.slice(0, 15).map((f) => `    · ${f.name} (${f.id}): ${f.hubspotCompanyId} → ${nueva.get(f.hubspotCompanyId!)}`),
      "    Remedio: npx tsx scripts/fusiones-de-hubspot.ts (simulacro, dice si la nueva ya es de otra ficha) y después",
      "    scripts/reapuntar-empresa-fusionada.ts; si la nueva ya es de otra ficha, son la misma empresa: scripts/merge-duplicate-clients.ts.",
    );
  },
};
