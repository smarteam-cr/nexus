/**
 * lib/kickoff/academy-server.ts — el catálogo de HubSpot Academy en la base (Q1, 2026-10-27). SERVER-ONLY.
 *
 * Lectura y escritura de `ListaDeAcademy`, y la ruta sugerida de un proyecto (sus hubs vendidos contra el catálogo). La
 * regla de qué se sugiere vive en lib/kickoff/academy.ts (pura). Sin la tabla (el SQL todavía no corrió) se lee como
 * catálogo vacío: el kickoff sigue funcionando y la sección simplemente no sugiere nada.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { HUBS_DE_ACADEMY, porQueNoSeGuarda, rutaSugerida, type ListaDelCatalogo, type ListaEnElKickoff } from "./academy";

const SELECT = {
  id: true,
  nombre: true,
  enlace: true,
  hub: true,
  rol: true,
  duracionMinutos: true,
  descripcion: true,
  orden: true,
  activa: true,
} as const;

/** El catálogo, en orden (las archivadas al final). [] sin la tabla. */
export async function catalogoDeAcademy(o: { soloActivas?: boolean } = {}): Promise<ListaDelCatalogo[]> {
  try {
    return await prisma.listaDeAcademy.findMany({
      where: o.soloActivas ? { activa: true } : undefined,
      orderBy: [{ activa: "desc" }, { rol: "asc" }, { orden: "asc" }, { nombre: "asc" }],
      select: SELECT,
    });
  } catch (e) {
    if (esquemaDesactualizado(e)) return [];
    throw e;
  }
}

export class ErrorDeAcademy extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface DatosDeLista {
  nombre: string;
  enlace: string;
  hub: string;
  rol: string;
  duracionMinutos: number | null;
  descripcion: string | null;
  orden?: number;
}

export async function crearListaDeAcademy(d: DatosDeLista, porEmail: string | null): Promise<ListaDelCatalogo> {
  const motivo = porQueNoSeGuarda(d);
  if (motivo) throw new ErrorDeAcademy(400, motivo);
  const orden = d.orden ?? ((await prisma.listaDeAcademy.aggregate({ where: { rol: d.rol }, _max: { orden: true } }))._max.orden ?? 0) + 1;
  return prisma.listaDeAcademy.create({
    data: { nombre: d.nombre.trim(), enlace: d.enlace.trim(), hub: d.hub, rol: d.rol, duracionMinutos: d.duracionMinutos, descripcion: d.descripcion?.trim() || null, orden, creadaPor: porEmail },
    select: SELECT,
  });
}

export async function actualizarListaDeAcademy(id: string, cambios: Partial<DatosDeLista> & { activa?: boolean }): Promise<ListaDelCatalogo> {
  const actual = await prisma.listaDeAcademy.findUnique({ where: { id }, select: SELECT });
  if (!actual) throw new ErrorDeAcademy(404, "Esa lista ya no está en el catálogo.");
  const siguiente = { ...actual, ...cambios };
  const motivo = porQueNoSeGuarda(siguiente);
  if (motivo) throw new ErrorDeAcademy(400, motivo);
  return prisma.listaDeAcademy.update({
    where: { id },
    data: {
      nombre: siguiente.nombre.trim(),
      enlace: siguiente.enlace.trim(),
      hub: siguiente.hub,
      rol: siguiente.rol,
      duracionMinutos: siguiente.duracionMinutos,
      descripcion: siguiente.descripcion?.trim() || null,
      orden: siguiente.orden,
      activa: siguiente.activa,
    },
    select: SELECT,
  });
}

/** Los hubs vendidos del proyecto (sus etiquetas que son hubs). */
export function hubsDeLasEtiquetas(etiquetas: readonly string[] | null | undefined): string[] {
  const hubs = new Set<string>(HUBS_DE_ACADEMY.map((h) => h.value).filter((h) => h !== "general"));
  return (etiquetas ?? []).filter((t) => hubs.has(t));
}

/** Lo que el editor del kickoff necesita para la sección: el catálogo activo, los hubs del proyecto y la ruta sugerida. */
export async function academyDelProyecto(projectId: string): Promise<{ catalogo: ListaDelCatalogo[]; hubs: string[]; sugerida: ListaEnElKickoff[] }> {
  const [proyecto, catalogo] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { tags: true } }),
    catalogoDeAcademy({ soloActivas: true }),
  ]);
  const hubs = hubsDeLasEtiquetas(proyecto?.tags);
  return { catalogo, hubs, sugerida: rutaSugerida(catalogo, hubs) };
}
