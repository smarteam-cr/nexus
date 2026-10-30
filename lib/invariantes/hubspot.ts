/**
 * lib/invariantes/hubspot.ts — los invariantes de la integración con HubSpot que se contestan con la base (U9, 2026-10-25).
 */
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { cumple, viola, type Invariante } from "./contrato";

/**
 * ¿Esta empresa fusionada es la de una ENTIDAD cuya dueña tiene la sobreviviente? Es el TEC, a propósito
 * (DECISIONS «Dos fichas que comparten dominio»): HubSpot tiene una empresa para las dos, la sobreviviente ya es de la
 * dueña (R7b) y fusionarlas desharía la separación. El criterio de INV13 y de INV54, en un solo lugar.
 */
export function fusionadaEsperada(empresaDeLaDuena: string | null | undefined, idSobreviviente: string | null | undefined): boolean {
  return !!empresaDeLaDuena && empresaDeLaDuena === idSobreviviente;
}

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
    const todas = await db.client.findMany({
      where: { hubspotCompanyId: { in: [...nueva.keys()] } },
      select: { id: true, name: true, hubspotCompanyId: true, comparteDominioConId: true },
      orderBy: { name: "asc" },
    });
    const duenas = todas.some((f) => f.comparteDominioConId)
      ? await db.client.findMany({
          where: { id: { in: todas.flatMap((f) => (f.comparteDominioConId ? [f.comparteDominioConId] : [])) } },
          select: { id: true, hubspotCompanyId: true },
        })
      : [];
    const empresaDe = new Map(duenas.map((c) => [c.id, c.hubspotCompanyId]));
    const esEntidad = (f: (typeof todas)[number]) =>
      fusionadaEsperada(f.comparteDominioConId ? empresaDe.get(f.comparteDominioConId) : null, nueva.get(f.hubspotCompanyId!));
    const fichas = todas.filter((f) => !esEntidad(f));
    const entidades = todas.length - fichas.length;
    const aparte = entidades ? ` (${entidades} entidad(es) que comparten dominio con la dueña de la sobreviviente: a propósito)` : "";
    if (!fichas.length) return cumple(`✓ INV54: ninguna ficha apunta a una de las ${nueva.size} empresas absorbidas en HubSpot${aparte}.`);
    return viola(
      `✗ INV54 VIOLADO: ${fichas.length} ficha(s) apuntan a una empresa de HubSpot que se fusionó: no ven sus proyectos, contactos ni correos nuevos.`,
      ...fichas.slice(0, 15).map((f) => `    · ${f.name} (${f.id}): ${f.hubspotCompanyId} → ${nueva.get(f.hubspotCompanyId!)}`),
      "    Remedio: npx tsx scripts/fusiones-de-hubspot.ts (simulacro, dice si la nueva ya es de otra ficha) y después",
      "    scripts/reapuntar-empresa-fusionada.ts; si la nueva ya es de otra ficha, son la misma empresa: scripts/merge-duplicate-clients.ts",
      "    (salvo que sean dos entidades de verdad, como el TEC: ahí se marca `comparteDominioConId`, no se fusiona).",
      ...(aparte ? [`    ${aparte.trim()}`] : []),
    );
  },
};
