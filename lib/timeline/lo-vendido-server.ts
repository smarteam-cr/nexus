/**
 * lib/timeline/lo-vendido-server.ts — leer LO VENDIDO de un proyecto (2026-11-18). SERVIDOR. La forma y los bloques
 * que lee la IA viven en lib/timeline/lo-vendido.ts (puro); acá solo la base.
 *
 * ⛔ Invariante 1: todo sale del proyecto y de SU cliente: la propuesta se busca con el `clientId` del proyecto.
 *
 * ⛔ El cronograma lo lee el cliente, así que esto NO lee la exploración de la preventa (lib/exploraciones/lectores.test.ts:
 * ningún documento del cliente la lee directo). Los casos salen de la PROPUESTA PUBLICADA (lo que el cliente ya vio:
 * la sección «Casos de uso») y sus actividades, de la ficha de cada caso en el catálogo (lib/casos-de-uso), no de lo
 * personalizado en la preventa. Un caso con un título que el catálogo no reconoce entra sin actividades.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { actividadesDelCaso, bibliotecaDeActividades } from "@/lib/casos-de-uso/actividades-server";
import { actividadesPorDefecto, bibliotecaLigera, repartoDeLaActividad } from "@/lib/casos-de-uso/armado";
import { CATALOGO_DE_CASOS } from "@/lib/casos-de-uso/catalogo";
import { leerLimitesDelProyecto } from "./limites-servidor";
import { loVendidoDe, titulosDeLosCasosDeLaPropuesta, type CasoVendido, type LoVendido, type PropuestaVendida } from "./lo-vendido";

interface PropuestaLeida extends PropuestaVendida {
  publishedSnapshot: unknown;
}

/**
 * ⭐ LA PROPUESTA DEL PROYECTO, de lo que ya existe: la del servicio recurrente (`servicioPropuestaId`) o el caso de
 * negocio de SU trato (`Project.hubspotDealId`). null si no hay ninguna.
 *
 * Es el único punto que cambia cuando se construya el cambio 1 (el CSE elige qué venta es de este proyecto, o la
 * escribe a mano): esta función pasa a leer esa elección primero.
 */
export async function propuestaDelProyecto(projectId: string): Promise<PropuestaLeida | null> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientId: true, hubspotDealId: true, servicioPropuestaId: true },
  });
  if (!p) return null;
  const select = { id: true, name: true, status: true, publishedSnapshot: true } as const;
  const bc =
    (p.servicioPropuestaId
      ? await prisma.businessCase.findFirst({ where: { id: p.servicioPropuestaId, clientId: p.clientId }, select })
      : null) ??
    (p.hubspotDealId
      ? await prisma.businessCase.findFirst({
          where: { clientId: p.clientId, hubspotDealId: p.hubspotDealId },
          orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
          select,
        })
      : null);
  if (!bc) return null;
  return { id: bc.id, nombre: bc.name, publicada: bc.status === "PUBLISHED", publishedSnapshot: bc.publishedSnapshot };
}

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Los casos de uso de la propuesta publicada, cada uno con las actividades de su ficha del catálogo y sus horas con el
 * cliente e internas. [] sin propuesta publicada o sin casos.
 */
export function casosVendidos(publishedSnapshot: unknown): CasoVendido[] {
  const titulos = titulosDeLosCasosDeLaPropuesta(publishedSnapshot);
  if (titulos.length === 0) return [];
  const porTitulo = new Map(CATALOGO_DE_CASOS.map((c) => [normalizar(c.titulo), c]));
  const porId = new Map(bibliotecaLigera(bibliotecaDeActividades()).map((a) => [a.id, a]));
  return titulos.map((titulo) => {
    const delCatalogo = porTitulo.get(normalizar(titulo));
    const ficha = delCatalogo ? actividadesDelCaso(delCatalogo.id) : null;
    return {
      titulo,
      actividades: (ficha ? actividadesPorDefecto(ficha) : []).flatMap((a) => {
        const lib = porId.get(a.actividadId);
        if (!lib) return [];
        const r = repartoDeLaActividad(a, lib);
        return [{ nombre: a.nombre, veces: a.veces, conElCliente: r.conElCliente, internas: r.internas }];
      }),
    };
  });
}

/** ⭐ Lo vendido del proyecto: los límites vigentes y la propuesta con sus casos y actividades. Nunca tira. */
export async function cargarLoVendido(projectId: string): Promise<LoVendido> {
  try {
    const [limites, propuesta] = await Promise.all([leerLimitesDelProyecto(projectId), propuestaDelProyecto(projectId)]);
    return loVendidoDe({
      limites,
      propuesta: propuesta ? { id: propuesta.id, nombre: propuesta.nombre, publicada: propuesta.publicada } : null,
      casos: propuesta?.publicada ? casosVendidos(propuesta.publishedSnapshot) : [],
    });
  } catch (e) {
    console.warn("[lo-vendido] no se pudo leer lo vendido:", e instanceof Error ? e.message : e);
    return loVendidoDe({ limites: null, propuesta: null, casos: [] });
  }
}
