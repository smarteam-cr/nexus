/**
 * lib/canvas/estado-del-documento-servidor.ts — lo que ESCRIBE el estado de un documento (2026-10-02).
 *
 * Las reglas (qué se puede y por qué no) viven puras en `estado-del-documento.ts`; acá se leen el
 * documento y su historial, y se guardan las fotos protegidas y los hitos. La aprobación (con su nota en
 * HubSpot) se quitó entera el 2026-10-28 (Elías): presentar alcanza para compartir el enlace.
 *
 * ⚠ Presentar toma la foto con `protegida: true`: es la evidencia de qué vio el cliente, y no la borra el
 * tope de 30 versiones (lib/canvas/versiones.ts).
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { hiddenKeysFrom } from "@/lib/business-cases/section-briefs";
import { POLITICA_RECTORA_KEY } from "@/components/landing/configs/diagnostico.defs";
import { revisarHilo, seccionesDelHilo, type SeccionDelHilo } from "./revisar-hilo";
import { fotoDelDocumento, guardarVersionDelDocumento, huellaDe, tieneContenido } from "./versiones";
import {
  aColumna,
  DESAFIO_KEY,
  leerEstado,
  revisarParaPresentar,
  type EstadoDocumento,
  type EstadoVista,
} from "./estado-del-documento";

export type { EstadoVista, HitoVista } from "./estado-del-documento";
export { MENSAJE_APROBADO } from "./estado-del-documento";

export type ResultadoDeEstado =
  | { ok: true; estado: EstadoVista }
  | {
      ok: false;
      status: number;
      error: string;
      motivos?: string[];
    };

async function cargarDocumento(canvasId: string) {
  return prisma.projectCanvas.findUnique({
    where: { id: canvasId },
    select: {
      id: true,
      name: true,
      slug: true,
      projectId: true,
      sections: true,
      estadoDocumento: true,
      versionDocumento: true,
      contentUpdatedAt: true,
      updatedAt: true,
      project: { select: { clientId: true, hubspotOwnerEmail: true, client: { select: { name: true, hubspotCompanyId: true } } } },
      canvasSections: {
        select: { key: true, blocks: { where: { blockType: "CARD" }, select: { data: true }, take: 1 } },
      },
    },
  });
}

type Documento = NonNullable<Awaited<ReturnType<typeof cargarDocumento>>>;

/** El data CARD de cada sección VISIBLE (lo oculto no se presenta). */
function dataVisible(doc: Documento): (key: string) => Record<string, unknown> | undefined {
  const ocultas = hiddenKeysFrom(doc.sections);
  const porKey = new Map(doc.canvasSections.map((s) => [s.key, s.blocks[0]?.data as Record<string, unknown> | undefined]));
  return (key) => (ocultas.has(key) ? undefined : porKey.get(key));
}

function revisar(doc: Documento, estado: EstadoDocumento, conContenido: boolean) {
  const dataDe = dataVisible(doc);
  const cabos = revisarHilo(seccionesDelHilo((k: SeccionDelHilo) => dataDe(k)));
  return revisarParaPresentar({
    estado,
    tieneContenido: conContenido,
    cabos,
    politica: dataDe(POLITICA_RECTORA_KEY),
    politicaOculta: hiddenKeysFrom(doc.sections).has(POLITICA_RECTORA_KEY),
    desafio: dataDe(DESAFIO_KEY),
    desafioOculto: hiddenKeysFrom(doc.sections).has(DESAFIO_KEY),
  });
}

async function ultimoPresentado(canvasId: string, version: number) {
  return prisma.hitoDeDocumento.findFirst({
    where: { canvasId, version, tipo: "presentado" },
    orderBy: { createdAt: "desc" },
    select: { id: true, fotoId: true, foto: { select: { huella: true } } },
  });
}

/** El estado del documento, su historial y lo que hoy impide presentarlo. */
export async function estadoDelDocumento(canvasId: string): Promise<EstadoVista | null> {
  const doc = await cargarDocumento(canvasId);
  if (!doc) return null;
  const estado = leerEstado(doc.estadoDocumento);
  const [hitos, foto] = await Promise.all([
    prisma.hitoDeDocumento.findMany({ where: { canvasId }, orderBy: { createdAt: "desc" }, take: 50 }),
    fotoDelDocumento(canvasId),
  ]);
  const revision = revisar(doc, estado, tieneContenido(foto));
  let cambios = false;
  if (estado === "presentado") {
    const p = await ultimoPresentado(canvasId, doc.versionDocumento);
    cambios = !!p?.foto?.huella && p.foto.huella !== huellaDe(foto);
  }
  const ultimoHito = hitos[0];
  const fecha = ultimoHito && estado !== "borrador" ? ultimoHito.aprobadoEl ?? ultimoHito.createdAt : doc.contentUpdatedAt ?? doc.updatedAt;
  return {
    estado,
    version: doc.versionDocumento,
    fecha: fecha ? fecha.toISOString() : null,
    cliente: doc.project?.client?.name ?? "",
    motivosParaNoPresentar: revision.ok ? [] : revision.motivos,
    motivosConSeccion: revision.detalle,
    cambiosDesdeLaPresentacion: cambios,
    hitos: hitos.map((h) => ({
      id: h.id,
      version: h.version,
      tipo: h.tipo,
      porEmail: h.porEmail,
      createdAt: h.createdAt.toISOString(),
      fotoId: h.fotoId,
      aprobadoPorNombre: h.aprobadoPorNombre,
      aprobadoPorEmail: h.aprobadoPorEmail,
      aprobadoEl: h.aprobadoEl ? h.aprobadoEl.toISOString() : null,
      evidencia: h.evidencia,
      evidenciaDocumentoId: h.evidenciaDocumentoId,
      hubspotNotaId: h.hubspotNotaId,
      hubspotError: h.hubspotError,
      motivo: h.motivo,
    })),
  };
}

async function devolver(canvasId: string): Promise<ResultadoDeEstado> {
  const estado = await estadoDelDocumento(canvasId);
  return estado ? { ok: true, estado } : { ok: false, status: 404, error: "El documento no existe." };
}

/**
 * PRESENTAR: exige contenido y que no esté aprobado (el hilo y lo revisado son avisos desde el 2026-10-28); deja la
 * foto protegida de lo presentado.
 *
 * El documento se TOMA al escribir (2026-10-05, como la aprobación): el cambio a «presentado» es
 * condicional al estado y la versión que se leyeron, en la misma transacción que el hito. Dos
 * «Presentar» a la vez dejan una sola presentación; presentar mientras el cliente aprueba (o mientras
 * se regenera) no pisa lo que pasó en el medio.
 */
export async function presentarDocumento(canvasId: string, por: string | null): Promise<ResultadoDeEstado> {
  const doc = await cargarDocumento(canvasId);
  if (!doc) return { ok: false, status: 404, error: "El documento no existe." };
  const estado = leerEstado(doc.estadoDocumento);
  const foto = await fotoDelDocumento(canvasId);
  const revision = revisar(doc, estado, tieneContenido(foto));
  if (!revision.ok) return { ok: false, status: 409, error: "Todavía no se puede presentar.", motivos: revision.motivos };

  let version = doc.versionDocumento;
  if (estado === "presentado") {
    const p = await ultimoPresentado(canvasId, version);
    // Volver a presentar lo mismo no cambia nada; presentar algo distinto es la versión siguiente.
    if (p?.foto?.huella === huellaDe(foto)) return devolver(canvasId);
    version += 1;
  }
  const v = await guardarVersionDelDocumento(canvasId, { origen: `Presentado al cliente (v${version})`, creadaPor: por, protegida: true });
  if (!v.id) return { ok: false, status: 500, error: "No se pudo guardar la foto de lo que se presenta. Vuelve a intentarlo." };
  const fotoId = v.id;

  // Tomar el documento: pasa a «presentado» solo si sigue en el estado y la versión que se leyeron.
  const hito = await prisma.$transaction(async (tx) => {
    const tomado = await tx.projectCanvas.updateMany({
      where: { id: canvasId, estadoDocumento: doc.estadoDocumento, versionDocumento: doc.versionDocumento },
      data: { estadoDocumento: aColumna("presentado"), versionDocumento: version },
    });
    if (tomado.count !== 1) return null;
    return tx.hitoDeDocumento.create({ data: { canvasId, version, tipo: "presentado", porEmail: por, fotoId }, select: { id: true } });
  });
  if (hito) return devolver(canvasId);

  // Alguien se adelantó. Si fue otro «Presentar» de esto mismo (doble clic), ya está presentado.
  const ahora = await prisma.projectCanvas.findUnique({ where: { id: canvasId }, select: { estadoDocumento: true, versionDocumento: true } });
  if (leerEstado(ahora?.estadoDocumento) === "presentado" && ahora?.versionDocumento === version) {
    const p = await ultimoPresentado(canvasId, version);
    if (p?.foto?.huella === huellaDe(foto)) return devolver(canvasId);
  }
  // La foto recién tomada no es evidencia de nada: si nadie la usa, vuelve a ser una versión común.
  if (!v.motivo) {
    const usada = await prisma.hitoDeDocumento.findFirst({ where: { fotoId }, select: { id: true } }).catch(() => ({ id: "?" }));
    if (!usada) {
      await prisma.versionDeDocumento
        .update({ where: { id: fotoId }, data: { protegida: false, origen: `Iba a presentarse (v${version}), pero el documento cambió antes` } })
        .catch(() => {});
    }
  }
  return { ok: false, status: 409, error: "El documento cambió mientras se presentaba: recarga y vuelve a intentarlo." };
}

/** REABRIR: vuelve a borrador en la versión siguiente. Lo presentado y lo aprobado quedan en el historial. */
export async function reabrirDocumento(canvasId: string, motivo: string, por: string | null): Promise<ResultadoDeEstado> {
  const doc = await cargarDocumento(canvasId);
  if (!doc) return { ok: false, status: 404, error: "El documento no existe." };
  const estado = leerEstado(doc.estadoDocumento);
  if (estado === "borrador") return { ok: false, status: 409, error: "Ya está en borrador." };
  if (motivo.trim().length < 3) return { ok: false, status: 400, error: "Escribe por qué se reabre." };
  const version = doc.versionDocumento + 1;
  await prisma.$transaction([
    prisma.projectCanvas.update({ where: { id: canvasId }, data: { estadoDocumento: aColumna("borrador"), versionDocumento: version } }),
    prisma.hitoDeDocumento.create({ data: { canvasId, version, tipo: "reabierto", porEmail: por, motivo: motivo.trim().slice(0, 1000) } }),
  ]);
  return devolver(canvasId);
}

/** ¿Está cerrado (aprobado)? Lo preguntan la regeneración, «Mejorar con IA» y restaurar versiones. */
export async function documentoAprobado(canvasId: string): Promise<boolean> {
  const c = await prisma.projectCanvas.findUnique({ where: { id: canvasId }, select: { estadoDocumento: true } });
  return leerEstado(c?.estadoDocumento) === "aprobado";
}

/** Lo que queda en la corrida si el cliente aprobó mientras la IA escribía: lo generado no se guarda. */
export const MENSAJE_APROBADO_MIENTRAS_SE_REGENERABA =
  "El cliente aprobó el diagnóstico mientras se regeneraba: lo generado no se guardó y queda lo que aprobó. Si hace falta cambiarlo, reábrelo y vuelve a generar.";

/**
 * Dentro de una transacción: si el documento está presentado, pasa a la versión siguiente en borrador
 * (la presentada queda en el historial, con su foto protegida) y deja el hito «reabierto».
 *
 * El cambio es condicional a que SIGA presentado en esa versión (2026-10-05): si entre la lectura y
 * la escritura alguien aprobó, reabrió o presentó otra, no se pisa.
 */
async function abrirVersionSiguiente(tx: Prisma.TransactionClient, canvasId: string): Promise<void> {
  const c = await tx.projectCanvas.findUnique({ where: { id: canvasId }, select: { estadoDocumento: true, versionDocumento: true } });
  if (!c || leerEstado(c.estadoDocumento) !== "presentado") return;
  const presentada = c.versionDocumento;
  const version = presentada + 1;
  const tomado = await tx.projectCanvas.updateMany({
    where: { id: canvasId, estadoDocumento: aColumna("presentado"), versionDocumento: presentada },
    data: { estadoDocumento: aColumna("borrador"), versionDocumento: version },
  });
  if (tomado.count !== 1) return;
  await tx.hitoDeDocumento.create({
    data: { canvasId, version, tipo: "reabierto", motivo: `Se regeneró después de presentarlo: la v${presentada} presentada queda en el historial.` },
  });
}

/**
 * Después de REGENERAR: si estaba presentado, lo que sigue es la versión siguiente en borrador. Nunca
 * tira: es un rastro, no la corrida. (El diagnóstico lo hace dentro de `escribirLoRegenerado`.)
 */
export async function trasRegenerar(canvasId: string): Promise<void> {
  try {
    await prisma.$transaction((tx) => abrirVersionSiguiente(tx, canvasId));
  } catch (e) {
    console.error(`[estado-del-documento] no se pudo abrir la versión siguiente de ${canvasId}:`, e instanceof Error ? e.message : e);
  }
}

/**
 * ESCRIBIR lo regenerado solo si el documento no quedó aprobado mientras corría la IA (2026-10-05).
 *
 * La regeneración revisa «aprobado» al arrancar, pero la IA tarda minutos: si el cliente aprueba en
 * el medio, lo nuevo se escribía igual sobre lo aprobado. Acá se TOMA el documento en la misma
 * transacción que la escritura: un UPDATE condicionado a «no aprobado» (bloquea la fila hasta el
 * commit). Una aprobación que llegó antes se ve y no se escribe nada (`{ tomado: false }`); una que
 * llega durante la escritura espera, y como lo presentado pasa en esa misma transacción a la versión
 * siguiente en borrador, encuentra otra versión y no aprueba lo que el cliente no vio.
 *
 * `escribir` devuelve cuántas secciones escribió; con cero no se abre versión nueva.
 */
export async function escribirLoRegenerado(
  canvasId: string,
  escribir: (tx: Prisma.TransactionClient) => Promise<number>,
): Promise<{ tomado: false } | { tomado: true; escritas: number }> {
  return prisma.$transaction(
    async (tx) => {
      const tomado = await tx.projectCanvas.updateMany({
        // `estadoDocumento` es null en el borrador: el null va explícito (un «distinto de» no lo incluye).
        where: { id: canvasId, OR: [{ estadoDocumento: null }, { estadoDocumento: { not: aColumna("aprobado") } }] },
        data: { contentUpdatedAt: new Date() },
      });
      if (tomado.count !== 1) return { tomado: false as const };
      const escritas = await escribir(tx);
      if (escritas > 0) await abrirVersionSiguiente(tx, canvasId);
      return { tomado: true as const, escritas };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}
