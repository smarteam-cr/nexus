/**
 * lib/exploraciones/versiones-del-resumen-server.ts — el HISTORIAL DE VERSIONES del Resumen de La escala (Elías, 21 nov;
 * DECISIONS «Historial de versiones»). SERVIDOR. Reemplaza a «Volver a la versión anterior» (./resumen-anterior.ts).
 *
 *   · Rehacer con IA guarda el de antes («Editado» si alguien lo cambió a mano después de la última versión) y el nuevo
 *     («Rehecho con IA»): lo hace `generarElResumenDeLaEscala` con `guardarAlRehacer`.
 *   · «Publicar» guarda el Resumen publicado («Publicado», protegida): `guardarAlPublicar`, desde `publicarLaEscala`.
 *   · «Usar esta versión» guarda el de ahora, pone la elegida y deja «Vuelta a una anterior». Nunca toca lo publicado.
 *
 * Las versiones se guardan DESPUÉS de soltar la fila de la exploración: la tabla tiene una FK a ella y, con la fila
 * bloqueada (FOR UPDATE), insertar desde otra conexión esperaría a la transacción que la bloqueó.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { modeloDisponible } from "@/lib/db/esquema";
import { guardarVersion, filasDelHistorial } from "@/lib/versiones/guardar-server";
import { armarHistorial, huellaDeContenido } from "@/lib/versiones/historial";
import { conNombres, type VersionConNombre } from "@/lib/versiones/nombres-server";
import { fechaCorta } from "@/lib/canvas/versiones";
import { leerContenido, leerResumenGuardado } from "./esquemas";
import type { ResumenGuardado } from "./resumen-de-la-escala";
import { paginaParaElCse, type PaginaParaElCse } from "./escala-para-el-cliente-server";
import { bloquearFila } from "./servidor";

/**
 * El Resumen como queda al leerlo de la base (`leerResumenGuardado` completa y ordena lo que falta): así un Resumen recién
 * escrito y el mismo leído después dan la misma huella.
 */
function normalizado(r: ResumenGuardado): ResumenGuardado {
  return leerResumenGuardado(JSON.parse(JSON.stringify(r))) ?? r;
}

/** La huella con que se compara un Resumen (la misma en la lista, al guardar y en la firma de la pantalla). */
export function huellaDelResumen(r: ResumenGuardado | null | undefined): string | null {
  return r ? huellaDeContenido(normalizado(r)) : null;
}

async function guardar(exploracionId: string, crudo: ResumenGuardado, v: { tipo: Parameters<typeof guardarVersion>[1]["tipo"]; nota: string; creadaPor: string | null; publicada?: boolean; createdAt?: Date }) {
  const r = normalizado(crudo);
  return guardarVersion(
    { exploracionId },
    {
      tipo: v.tipo,
      nota: v.nota,
      creadaPor: v.creadaPor,
      huella: huellaDeContenido(r),
      contenido: r,
      ...(v.publicada ? { publicada: true, protegida: true } : {}),
      ...(v.createdAt ? { createdAt: v.createdAt } : {}),
    },
  );
}

/** Al rehacer con IA: el de antes (si había) y el nuevo. No lanza. */
export async function guardarAlRehacer(exploracionId: string, o: { antes: ResumenGuardado | null | undefined; nuevo: ResumenGuardado; email: string | null }) {
  if (o.antes) await guardar(exploracionId, o.antes, { tipo: "antes", nota: "Así estaba antes de rehacerlo con IA.", creadaPor: null });
  await guardar(exploracionId, o.nuevo, { tipo: "ia", nota: "Después de rehacerlo con IA", creadaPor: o.email });
}

/** Al publicar: el Resumen que quedó publicado. No lanza. */
export async function guardarAlPublicar(exploracionId: string, email: string | null) {
  try {
    const f = await prisma.exploracionDeVenta.findUnique({ where: { id: exploracionId }, select: { contenido: true } });
    const r = f ? leerContenido(f.contenido).resumenDeLaEscala : undefined;
    if (r) await guardar(exploracionId, r, { tipo: "publicado", nota: "Al publicar", creadaPor: email, publicada: true });
  } catch (e) {
    console.error("[exploraciones/versiones-del-resumen] no se guardó la versión publicada:", e instanceof Error ? e.message : e);
  }
}

/**
 * La anterior que guardaba el botón de la mañana del 21 nov entra al historial una vez, con su fecha. Es la única
 * escritura al abrir el historial. Se reconoce por su huella, con un candado por exploración (pg_advisory_xact_lock):
 * dos personas que abren el historial a la vez no la guardan dos veces. Sin FOR UPDATE de la fila (ver arriba: la FK).
 */
async function pasarLaAnterior(exploracionId: string, contenido: ReturnType<typeof leerContenido>) {
  const anterior = contenido.resumenAnterior;
  if (!anterior) return;
  const r = normalizado(anterior.resumen);
  const huella = huellaDeContenido(r);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`versiones-del-resumen:${exploracionId}`}))`;
    const ya = await tx.versionDeDocumento.findFirst({ where: { exploracionId, huella }, select: { id: true } });
    if (ya) return;
    await tx.versionDeDocumento.create({
      data: {
        exploracionId,
        origen: anterior.motivo === "volver" ? "La que se reemplazó al volver a la versión anterior." : "La que había antes de rehacerlo con IA.",
        tipo: "guardada",
        creadaPor: anterior.por,
        huella,
        secciones: [],
        contenido: r as unknown as Prisma.InputJsonValue,
        createdAt: new Date(new Date(anterior.en).getTime() - 1000),
      },
    });
  });
}

export interface HistorialDelResumen {
  versiones: VersionConNombre[];
  /** La huella del Resumen de hoy: la pantalla la manda al usar una versión (null: no hay Resumen). */
  firma: string | null;
}

export async function historialDelResumen(exploracionId: string): Promise<HistorialDelResumen | null> {
  const f = await prisma.exploracionDeVenta.findUnique({
    where: { id: exploracionId },
    select: { contenido: true, accesoALaEscala: { select: { publicadaEn: true, revokedAt: true } } },
  });
  if (!f) return null;
  const c = leerContenido(f.contenido);
  const firma = huellaDelResumen(c.resumenDeLaEscala);
  if (!modeloDisponible(prisma.versionDeDocumento)) return { versiones: [], firma };
  await pasarLaAnterior(exploracionId, c);
  const filas = await filasDelHistorial({ exploracionId });
  const publicado = !!f.accesoALaEscala?.publicadaEn && !f.accesoALaEscala.revokedAt;
  return { versiones: await conNombres(armarHistorial(filas, { huellaActual: firma, publicado })), firma };
}

/** La página del Resumen armada con esa versión (la vista previa). null: no es de esta exploración. */
export async function paginaDeLaVersion(exploracionId: string, versionId: string): Promise<PaginaParaElCse | null> {
  const v = await prisma.versionDeDocumento.findFirst({ where: { id: versionId, exploracionId }, select: { contenido: true } });
  if (!v) return null;
  const r = leerResumenGuardado(v.contenido);
  if (!r) return null;
  return paginaParaElCse(exploracionId, { resumen: r });
}

export type ResultadoDeUsar = { ok: true } | { ok: false; status: number; error: string };

/**
 * «Usar esta versión»: con la fila bloqueada, pone el Resumen de esa versión. `firma`: la del Resumen que ve la pantalla;
 * si cambió (otra persona, o Nexus al rehacerlo), 409. `enCurso`: el candado de «Rehacer con IA» (una corrida a la vez).
 * Lo publicado no se toca: el cliente ve lo mismo hasta «Publicar».
 */
export async function usarVersionDelResumen(o: {
  exploracionId: string;
  versionId: string;
  email: string | null;
  firma: string | null;
  enCurso: (tx: Prisma.TransactionClient) => Promise<boolean>;
}): Promise<ResultadoDeUsar> {
  const v = await prisma.versionDeDocumento.findFirst({
    where: { id: o.versionId, exploracionId: o.exploracionId },
    select: { contenido: true, createdAt: true },
  });
  const elegido = v ? leerResumenGuardado(v.contenido) : undefined;
  if (!v || !elegido) return { ok: false, status: 404, error: "Esa versión no es de esta escala." };

  const r = await prisma.$transaction(async (tx): Promise<ResultadoDeUsar & { antes?: ResumenGuardado; igual?: boolean }> => {
    await bloquearFila(tx, o.exploracionId);
    const f = await tx.exploracionDeVenta.findUnique({ where: { id: o.exploracionId }, select: { contenido: true, archivadaEn: true } });
    if (!f) return { ok: false, status: 404, error: "Esa exploración no existe." };
    if (f.archivadaEn) return { ok: false, status: 409, error: "La exploración está archivada: ya no se puede cambiar." };
    if (await o.enCurso(tx)) return { ok: false, status: 409, error: "Nexus está rehaciendo el Resumen. Cuando termine, puedes usar otra versión." };
    const c = leerContenido(f.contenido);
    if (huellaDelResumen(c.resumenDeLaEscala) !== o.firma)
      return { ok: false, status: 409, error: "El Resumen cambió mientras mirabas el historial (otra persona, o Nexus al rehacerlo). Se cargó lo último: revísalo y vuelve a intentarlo." };
    // La elegida es igual a la de ahora: no hay nada que cambiar ni que guardar.
    if (huellaDelResumen(elegido) === o.firma) return { ok: true, igual: true };
    const crudo = f.contenido && typeof f.contenido === "object" && !Array.isArray(f.contenido) ? (f.contenido as Record<string, unknown>) : {};
    await tx.exploracionDeVenta.update({
      where: { id: o.exploracionId },
      data: { contenido: { ...crudo, resumenDeLaEscala: elegido } as unknown as Prisma.InputJsonValue },
    });
    return { ok: true, antes: c.resumenDeLaEscala };
  });
  if (!r.ok) return r;
  if (r.igual) return { ok: true };
  if (r.antes) await guardar(o.exploracionId, r.antes, { tipo: "antes", nota: "Así estaba antes de usar otra versión.", creadaPor: null });
  await guardar(o.exploracionId, elegido, { tipo: "restaurado", nota: `Volvió la del ${fechaCorta(v.createdAt)}.`, creadaPor: o.email });
  return { ok: true };
}
