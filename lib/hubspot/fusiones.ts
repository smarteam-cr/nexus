/**
 * lib/hubspot/fusiones.ts — LAS FUSIONES DE HUBSPOT, DE UNA VEZ (U9, 2026-10-25). Solo LEE.
 *
 * Una fusión en HubSpot no deja ningún campo en el registro ABSORBIDO: su id sigue respondiendo con los datos del que
 * sobrevive (lib/hubspot/empresa-fusionada.ts, y el error conocido «Creé un proyecto en HubSpot y Nexus no lo ve»). Lo
 * que sí queda es del lado del SOBREVIVIENTE: `hs_merged_object_ids`, la lista de los ids que absorbió. Por eso se busca
 * al revés: los registros que TIENEN esa propiedad, una búsqueda por tipo de objeto, y de ahí los pares
 * absorbido → sobreviviente. Medido el 2026-10-24: 34 empresas, 8 contactos, 3 negocios y 1 proyecto.
 *
 * ⛔ «No se pudo leer» no es «no hay»: un error a mitad de la búsqueda vuelve como `completa: false` y quien escribe no
 * saca nada de lo que ya sabía.
 */
import type { Client as HsClient } from "./sdk";
import { parsearIdsFusionados } from "./empresa-fusionada";

export const OBJETOS_FUSIONABLES = ["empresa", "contacto", "negocio", "proyecto", "ticket"] as const;
export type ObjetoFusionable = (typeof OBJETOS_FUSIONABLES)[number];

/** El objeto de HubSpot de cada tipo. El proyecto es el objeto 0-970. */
export const OBJETO_DE_HUBSPOT: Record<ObjetoFusionable, string> = {
  empresa: "companies",
  contacto: "contacts",
  negocio: "deals",
  proyecto: "0-970",
  ticket: "tickets",
};

export interface ParDeFusion {
  objeto: ObjetoFusionable;
  idAbsorbido: string;
  idSobreviviente: string;
}

export interface BusquedaDeFusiones {
  objeto: ObjetoFusionable;
  sinPermiso: boolean;
  completa: boolean;
  pares: ParDeFusion[];
}

const POR_PAGINA = 200;
const MAX_PAGINAS = 40;

/** Los pares de un tipo de objeto. Un id absorbido por dos (no debería pasar) se queda con el último que se vio. */
export async function buscarFusiones(hs: HsClient, objeto: ObjetoFusionable): Promise<BusquedaDeFusiones> {
  const out: BusquedaDeFusiones = { objeto, sinPermiso: false, completa: false, pares: [] };
  let after: string | undefined;
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    let r: Awaited<ReturnType<HsClient["apiRequest"]>>;
    try {
      r = await hs.apiRequest({
        method: "POST",
        path: `/crm/v3/objects/${OBJETO_DE_HUBSPOT[objeto]}/search`,
        body: {
          filterGroups: [{ filters: [{ propertyName: "hs_merged_object_ids", operator: "HAS_PROPERTY" }] }],
          properties: ["hs_merged_object_ids"],
          limit: POR_PAGINA,
          ...(after ? { after } : {}),
        },
      });
    } catch {
      return out;
    }
    if (r.status === 403) return { ...out, sinPermiso: true };
    if (!r.ok) return out;
    const data = (await r.json()) as { results?: { id: string; properties?: Record<string, string | null> }[]; paging?: { next?: { after?: string } } };
    out.pares.push(...paresDe(objeto, data.results ?? []));
    after = data.paging?.next?.after;
    if (!after) {
      out.completa = true;
      return out;
    }
  }
  return out;
}

/** De los registros que devuelve la búsqueda, los pares absorbido → sobreviviente. PURO. */
export function paresDe(objeto: ObjetoFusionable, registros: readonly { id: string | number; properties?: Record<string, string | null | undefined> }[]): ParDeFusion[] {
  const porAbsorbido = new Map<string, ParDeFusion>();
  for (const x of registros) {
    const sobreviviente = String(x.id);
    for (const idAbsorbido of parsearIdsFusionados(x.properties?.hs_merged_object_ids, sobreviviente)) {
      porAbsorbido.set(idAbsorbido, { objeto, idAbsorbido, idSobreviviente: sobreviviente });
    }
  }
  return [...porAbsorbido.values()];
}

/**
 * Sigue la cadena: si A se fusionó en B y después B en C, A → C. PURO. Un ciclo (no debería existir) corta en el primer
 * id repetido.
 */
export function sobrevivienteFinal(idAbsorbido: string, porAbsorbido: ReadonlyMap<string, string>): string {
  const vistos = new Set<string>([idAbsorbido]);
  let actual = porAbsorbido.get(idAbsorbido) ?? idAbsorbido;
  while (porAbsorbido.has(actual) && !vistos.has(actual)) {
    vistos.add(actual);
    actual = porAbsorbido.get(actual)!;
  }
  return actual;
}
