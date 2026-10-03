import "server-only";

/**
 * lib/exploraciones/para-el-cuestionario.ts — la PUERTA por la que el cuestionario de escala del CSE
 * lee dónde ubicó al cliente la venta (2026-10-02).
 *
 * Lo que sale de acá llega al CLIENTE: el cuestionario de escala le muestra la opción del nivel ya
 * marcada («esto es lo que entendimos») para que la confirme. Por eso la puerta entrega SOLO el nivel
 * por dimensión (lo confirmado por el vendedor y lo que el propio cliente contestó en el test), la
 * edición y el perfil: nada de evidencias, razones, objeciones ni notas internas del lienzo.
 *
 * Declarada en el censo (lib/exploraciones/lectores.test.ts) con destino «cuestionario-al-cliente».
 */
import { prisma } from "@/lib/db/prisma";
import type { Letra } from "@/lib/escala/documento/tipos";
import { CIERRES, DESPUES, type Perfil } from "@/lib/escala/documento/perfil";
import { leerContenido } from "./esquemas";
import { exploracionDelProyecto } from "./handoff";
import { leerLoLeido } from "./lo-leido";

export interface UbicacionPrevia {
  edicion: string | null;
  perfil: Perfil | null;
  /** Áreas que miró el preliminar (ids de la escala). */
  areas: string[];
  /** El nivel por dimensión y de dónde salió. Sin texto: lo que sale de acá lo ve el cliente. */
  porDimension: Record<string, { nivel: Letra; fuente: "exploracion" | "test" }>;
}

const LETRAS: ReadonlySet<string> = new Set(["D", "I", "F", "E", "O"]);

export async function ubicacionPreviaDelProyecto(projectId: string): Promise<UbicacionPrevia | null> {
  const id = await exploracionDelProyecto(projectId).catch(() => null);
  if (!id) return null;
  const e = await prisma.exploracionDeVenta.findUnique({
    where: { id },
    select: { edicion: true, perfilCierre: true, perfilDespues: true, areas: true, contenido: true, test: true },
  });
  if (!e) return null;

  const porDimension: UbicacionPrevia["porDimension"] = {};
  const areas = new Set<string>(e.areas ?? []);
  // El test primero: lo que confirmó el vendedor lo pisa donde las dos hablan.
  for (const t of leerLoLeido(e.test).tests) {
    areas.add(t.resultado.areaId);
    for (const r of t.resultado.respuestas) {
      if (LETRAS.has(r.nivel)) porDimension[r.dimensionId] = { nivel: r.nivel, fuente: "test" };
    }
  }
  for (const [dim, est] of Object.entries(leerContenido(e.contenido).chequeo)) {
    if (est && LETRAS.has(est.nivel)) porDimension[dim] = { nivel: est.nivel, fuente: "exploracion" };
  }

  const cierre = CIERRES.find((c) => c === e.perfilCierre) ?? null;
  const despues = DESPUES.find((d) => d === e.perfilDespues) ?? null;
  return {
    edicion: e.edicion ?? null,
    perfil: cierre || despues ? { cierre, despues } : null,
    areas: [...areas].sort(),
    porDimension,
  };
}
