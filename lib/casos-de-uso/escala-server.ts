/**
 * lib/casos-de-uso/escala-server.ts — los nombres de la escala publicada para las pantallas del catálogo. SERVIDOR.
 *
 * El catálogo cita dimensiones y criterios por su identificador; los nombres y los textos salen de la escala
 * vigente en Nexus, palabra por palabra. Si la escala no se puede leer, las pantallas muestran los identificadores
 * y lo dicen: el catálogo se sigue viendo.
 */
import "server-only";
import { leerEscalaVigente } from "@/lib/escala/documento/vigente";
import { todosLosCriterios } from "@/lib/escala/documento/parsear";
import type { AreaDeLaEscala } from "./catalogo";
import type { EscalaDelCatalogo } from "./vista";

export interface EscalaLeida {
  escala: EscalaDelCatalogo;
  /** Id del criterio → su texto en la escala general. */
  criterios: Record<string, string>;
}

export async function escalaDelCatalogo(): Promise<EscalaLeida | null> {
  const v = await leerEscalaVigente();
  if (v.estado !== "ok") return null;
  const e = v.escala;
  return {
    escala: {
      version: e.version,
      niveles: e.niveles.map((n) => ({ letra: n.letra, nombre: n.nombre })),
      areas: e.areas
        .filter((a): a is typeof a & { id: AreaDeLaEscala } => a.id === "1" || a.id === "2" || a.id === "3")
        .map((a) => ({ id: a.id, nombre: a.nombre, dimensiones: a.dimensiones.map((d) => ({ id: d.id, nombre: d.nombre, capa: d.capa })) })),
    },
    criterios: Object.fromEntries(todosLosCriterios(e).map((c) => [c.id, c.texto])),
  };
}
