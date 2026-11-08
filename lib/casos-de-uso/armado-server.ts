/**
 * lib/casos-de-uso/armado-server.ts — lo que el paso «Casos de uso» de la preventa necesita para contar horas y precio
 * (2026-11-08): la biblioteca de actividades (sin lo que pesa), las actividades por defecto de cada caso del catálogo y
 * la tarifa del segmento de la empresa. SERVIDOR: el JSON de las actividades no viaja entero al navegador.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { actividadesDelCaso, bibliotecaDeActividades } from "./actividades-server";
import { actividadesPorDefecto, bibliotecaLigera, tarifaDe, type ActividadDelCaso, type ActividadLigera, type TarifaDeLaEmpresa } from "./armado";
import { CATALOGO_DE_CASOS } from "./catalogo";

export interface ArmadoParaLaPreventa {
  biblioteca: ActividadLigera[];
  /** Las actividades marcadas por defecto de cada caso del catálogo, por el id del catálogo (sin `cat-`). */
  porDefecto: Record<string, ActividadDelCaso[]>;
  tarifa: TarifaDeLaEmpresa;
}

export async function armadoParaLaPreventa(clientId: string): Promise<ArmadoParaLaPreventa> {
  const empresa = await prisma.client.findUnique({ where: { id: clientId }, select: { segmento: true } });
  const porDefecto: Record<string, ActividadDelCaso[]> = {};
  for (const c of CATALOGO_DE_CASOS) {
    const a = actividadesDelCaso(c.id);
    if (a) porDefecto[c.id] = actividadesPorDefecto(a);
  }
  return { biblioteca: bibliotecaLigera(bibliotecaDeActividades()), porDefecto, tarifa: tarifaDe(empresa?.segmento) };
}
