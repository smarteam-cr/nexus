/**
 * lib/cs/propuestas-del-vigia-server.ts — las propuestas de salud del vigía que todavía piden decisión (2026-10-19).
 *
 * UNA sola lectura para los dos lugares que las muestran: la línea de «Para ti» (lib/para-ti/fuentes/cs.ts) y la lista
 * donde se deciden (Éxito del cliente › «Propuestas del vigía»). Así el número del aviso y las filas de la lista no
 * pueden contar cosas distintas.
 *
 * La salud de hoy y el porqué salen del summary de la cartera (`loadPortfolio`), con las señales de hoy: es lo mismo
 * que pinta la pestaña «Proyectos» de cada cuenta. Solo lee.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { loadPortfolio } from "@/lib/portfolio/load";
import { sinExclientes } from "@/lib/cs/exclientes";
import { cuentasExcliente } from "@/lib/cs/exclientes-server";
import { estadoDeLaPropuesta, ordenarPropuestas, razonDelRiesgo, type PropuestaDelVigia } from "./propuestas-del-vigia";

export async function cargarPropuestasDelVigia(): Promise<PropuestaDelVigia[]> {
  const conPropuesta = await prisma.project.findMany({
    where: { healthProposed: { not: null }, esPrueba: false },
    select: { clientId: true },
  });
  if (conPropuesta.length === 0) return [];
  const exclientes = await cuentasExcliente();
  const clientIds = [...new Set(sinExclientes(conPropuesta, exclientes, (p) => p.clientId).map((p) => p.clientId))];
  if (clientIds.length === 0) return [];

  // Solo la cartera de Customer Success: un proyecto cerrado, de prueba o fuera de la cartera no pide decisión.
  const filas = await loadPortfolio({ id: { in: clientIds } });
  const out: PropuestaDelVigia[] = [];
  for (const r of filas) {
    if (!r.healthProposed) continue;
    const s = r.summary;
    const estado = estadoDeLaPropuesta({ propuesta: r.healthProposed, saludFijada: s.health.override, riskCandidate: s.riskCandidate });
    if (estado !== "vigente") continue;
    out.push({
      projectId: r.projectId,
      proyecto: r.projectName,
      clientId: r.clientId,
      cuenta: r.clientName,
      cse: r.cseName,
      actual: s.health.resolved,
      propuesta: r.healthProposed,
      razon: razonDelRiesgo(s),
      desde: r.healthProposedAt,
    });
  }
  return ordenarPropuestas(out);
}
