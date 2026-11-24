import "server-only";

/**
 * lib/exploraciones/versiones-del-area-server.ts — el HISTORIAL DE VERSIONES de la página de cada área de La escala (23 nov,
 * etapa 3 del plan maestro de «Hablar con Nexus»; la foto, ./versiones-del-area.ts). SERVIDOR.
 *
 * Cuándo se guarda una versión (las mismas reglas del historial: DECISIONS «Historial de versiones»):
 *   · al aplicar lo que propuso «✨ Pedirle a Nexus»: lo de antes y «Cambiado con Nexus» (./escala-con-nexus-server.ts);
 *   · al publicar: «Publicado», protegida (`guardarLasAreasAlPublicar`, desde `guardarAlPublicar`);
 *   · al usar una versión: lo de antes y «Vuelta a una anterior».
 * Lo escrito a mano no deja una versión con cada texto: el popup lo muestra como «con cambios sin guardar como versión».
 * Una página sin nada escrito no deja versión. Nunca toca lo publicado. Como el Resumen, las versiones se guardan DESPUÉS de
 * soltar la fila (la tabla tiene una FK a la exploración).
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { modeloDisponible } from "@/lib/db/esquema";
import { guardarVersion, filasDelHistorial, type VersionNueva } from "@/lib/versiones/guardar-server";
import { armarHistorial } from "@/lib/versiones/historial";
import { conNombres, type VersionConNombre } from "@/lib/versiones/nombres-server";
import { fechaCorta } from "@/lib/canvas/versiones";
import type { ContenidoDeExploracion, EstadoDeExploracion } from "./contenido";
import { leerContenido } from "./esquemas";
import { areasDeLaPagina } from "./escala-para-el-cliente";
import { bloquearFila, escalaDeLaExploracion, escalaParaExplorar, estadoDesdeFila, leerExploracion } from "./servidor";
import { contenidoConLaFoto, fotoConAlgo, fotoDelArea, huellaDelArea, leerFotoDelArea, lineasDeLaFoto, piezaDelArea, type FotoDelArea } from "./versiones-del-area";

/** Las dimensiones de cada área de la escala de esta exploración (con su nombre). null: la escala no está publicada. */
export async function dimensionesDeLasAreas(estado: EstadoDeExploracion): Promise<Map<string, { id: string; nombre: string }[]> | null> {
  const general = await escalaParaExplorar();
  if (general.estado !== "ok") return null;
  const lienzo = escalaDeLaExploracion(general.general, estado);
  return new Map(lienzo.areas.map((a) => [a.id, a.dimensiones.map((d) => ({ id: d.id, nombre: d.nombre }))]));
}

/** Guarda una versión de la página de un área. No lanza. Sin nada escrito, no guarda. */
export async function guardarVersionDelArea(
  exploracionId: string,
  foto: FotoDelArea,
  v: { tipo: VersionNueva["tipo"]; nota: string; creadaPor: string | null; publicada?: boolean; aunVacia?: boolean },
) {
  // `aunVacia`: la de antes de un cambio de Nexus, aunque nadie hubiera escrito nada (es a la que vuelve «Deshacer»).
  if (!fotoConAlgo(foto) && !v.aunVacia && v.tipo !== "nexus" && v.tipo !== "restaurado") return { guardada: false, motivo: "sin nada escrito" };
  return guardarVersion(
    { exploracionId, pieza: piezaDelArea(foto.areaId) },
    {
      tipo: v.tipo,
      nota: v.nota,
      creadaPor: v.creadaPor,
      huella: huellaDelArea(foto),
      contenido: foto,
      ...(v.publicada ? { publicada: true, protegida: true } : {}),
    },
  );
}

/** Al publicar: la página de cada área que ve el cliente. No lanza. */
export async function guardarLasAreasAlPublicar(exploracionId: string, contenido: ContenidoDeExploracion, email: string | null) {
  try {
    const lectura = await leerExploracion(exploracionId);
    if (lectura.estado !== "ok") return;
    const estado = estadoDesdeFila(lectura.fila);
    const general = await escalaParaExplorar();
    if (general.estado !== "ok") return;
    const lienzo = escalaDeLaExploracion(general.general, estado);
    for (const areaId of areasDeLaPagina(lienzo, estado)) {
      const dims = lienzo.areas.find((a) => a.id === areaId)?.dimensiones.map((d) => d.id) ?? [];
      await guardarVersionDelArea(exploracionId, fotoDelArea(contenido, areaId, dims), { tipo: "publicado", nota: "Al publicar", creadaPor: email, publicada: true });
    }
  } catch (e) {
    console.error("[exploraciones/versiones-del-area] no se guardaron las áreas publicadas:", e instanceof Error ? e.message : e);
  }
}

export interface HistorialDelArea {
  versiones: VersionConNombre[];
  /** La huella de la página del área hoy: la pantalla la manda al usar una versión. */
  firma: string;
}

/** El historial de la página de un área. null: la exploración o el área no existen. */
export async function historialDelArea(exploracionId: string, areaId: string): Promise<HistorialDelArea | null> {
  const lectura = await leerExploracion(exploracionId);
  if (lectura.estado !== "ok") return null;
  const estado = estadoDesdeFila(lectura.fila);
  const dims = (await dimensionesDeLasAreas(estado))?.get(areaId);
  if (!dims) return null;
  const firma = huellaDelArea(fotoDelArea(estado.contenido, areaId, dims.map((d) => d.id)));
  if (!modeloDisponible(prisma.versionDeDocumento)) return { versiones: [], firma };
  const filas = await filasDelHistorial({ exploracionId, pieza: piezaDelArea(areaId) });
  const f = await prisma.exploracionDeVenta.findUnique({ where: { id: exploracionId }, select: { accesoALaEscala: { select: { publicadaEn: true, revokedAt: true } } } });
  const acceso = f?.accesoALaEscala;
  const publicado = !!acceso?.publicadaEn && !acceso.revokedAt;
  return { versiones: await conNombres(armarHistorial(filas, { huellaActual: firma, publicado })), firma };
}

/** Lo escrito en una versión, para la vista previa. null: no es de esta exploración y esta área. */
export async function lineasDeLaVersionDelArea(exploracionId: string, areaId: string, versionId: string) {
  const v = await prisma.versionDeDocumento.findFirst({ where: { id: versionId, exploracionId, pieza: piezaDelArea(areaId) }, select: { contenido: true } });
  const foto = v ? leerFotoDelArea(v.contenido) : null;
  if (!foto) return null;
  const lectura = await leerExploracion(exploracionId);
  const dims = lectura.estado === "ok" ? ((await dimensionesDeLasAreas(estadoDesdeFila(lectura.fila)))?.get(areaId) ?? []) : [];
  const nombre = new Map(dims.map((d) => [d.id, d.nombre]));
  return lineasDeLaFoto(foto, { dimension: (id) => nombre.get(id) ?? id });
}

export type ResultadoDeUsarElArea = { ok: true } | { ok: false; status: number; error: string };

/**
 * «Usar esta versión» de la página de un área: con la fila bloqueada, pone lo escrito de esa versión. `firma`: la de la
 * página que ve la pantalla; si cambió, 409. Lo publicado no se toca. Sube la versión de la exploración (los textos son
 * de lo confirmado: una edición abierta en otra pantalla choca en vez de pisar).
 */
export async function usarVersionDelArea(o: { exploracionId: string; areaId: string; versionId: string; email: string | null; firma: string }): Promise<ResultadoDeUsarElArea> {
  const v = await prisma.versionDeDocumento.findFirst({
    where: { id: o.versionId, exploracionId: o.exploracionId, pieza: piezaDelArea(o.areaId) },
    select: { contenido: true, createdAt: true },
  });
  const elegida = v ? leerFotoDelArea(v.contenido) : null;
  if (!v || !elegida || elegida.areaId !== o.areaId) return { ok: false, status: 404, error: "Esa versión no es de esta página." };
  const lectura = await leerExploracion(o.exploracionId);
  if (lectura.estado !== "ok") return { ok: false, status: 404, error: "Esa exploración no existe." };
  const dims = (await dimensionesDeLasAreas(estadoDesdeFila(lectura.fila)))?.get(o.areaId)?.map((d) => d.id);
  if (!dims) return { ok: false, status: 404, error: "Esa área no está en la escala." };

  const r = await prisma.$transaction(async (tx): Promise<ResultadoDeUsarElArea & { antes?: FotoDelArea; igual?: boolean }> => {
    await bloquearFila(tx, o.exploracionId);
    const f = await tx.exploracionDeVenta.findUnique({ where: { id: o.exploracionId }, select: { contenido: true, archivadaEn: true } });
    if (!f) return { ok: false, status: 404, error: "Esa exploración no existe." };
    if (f.archivadaEn) return { ok: false, status: 409, error: "La exploración está archivada: ya no se puede cambiar." };
    const c = leerContenido(f.contenido);
    const antes = fotoDelArea(c, o.areaId, dims);
    if (huellaDelArea(antes) !== o.firma)
      return { ok: false, status: 409, error: "La página cambió mientras mirabas el historial (otra persona, o Nexus). Se cargó lo último: revísala y vuelve a intentarlo." };
    if (huellaDelArea(elegida) === o.firma) return { ok: true, igual: true };
    const crudo = f.contenido && typeof f.contenido === "object" && !Array.isArray(f.contenido) ? (f.contenido as Record<string, unknown>) : {};
    const nuevo = contenidoConLaFoto(crudo as Pick<ContenidoDeExploracion, "descripcionesDeLaEscala" | "textosDelRadar" | "textosDeLaPagina">, elegida, dims);
    await tx.exploracionDeVenta.update({
      where: { id: o.exploracionId },
      data: { contenido: nuevo as unknown as Prisma.InputJsonValue, version: { increment: 1 } },
    });
    return { ok: true, antes };
  });
  if (!r.ok) return r;
  if (r.igual) return { ok: true };
  if (r.antes) await guardarVersionDelArea(o.exploracionId, r.antes, { tipo: "antes", nota: "Así estaba antes de usar otra versión.", creadaPor: null });
  await guardarVersionDelArea(o.exploracionId, elegida, { tipo: "restaurado", nota: `Volvió la del ${fechaCorta(v.createdAt)}.`, creadaPor: o.email });
  return { ok: true };
}
