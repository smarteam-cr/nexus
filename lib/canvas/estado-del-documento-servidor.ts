/**
 * lib/canvas/estado-del-documento-servidor.ts — lo que ESCRIBE el estado de un documento (2026-10-02).
 *
 * Las reglas (qué se puede y por qué no) viven puras en `estado-del-documento.ts`; acá se leen el
 * documento y su historial, se guardan las fotos protegidas y los hitos, y se deja la nota de la
 * aprobación en la empresa en HubSpot.
 *
 * ⚠ Presentar y aprobar toman la foto con `protegida: true`: es la evidencia de qué vio y qué aprobó
 * el cliente, y no la borra el tope de 30 versiones (lib/canvas/versiones.ts).
 */
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { hiddenKeysFrom } from "@/lib/business-cases/section-briefs";
import { POLITICA_RECTORA_KEY } from "@/components/landing/configs/diagnostico.defs";
import { revisarHilo, seccionesDelHilo, type SeccionDelHilo } from "./revisar-hilo";
import { fotoDelDocumento, guardarVersionDelDocumento, huellaDe, tieneContenido } from "./versiones";
import {
  aColumna,
  leerEstado,
  notaDeAprobacion,
  revisarParaPresentar,
  validarAprobacion,
  type DatosDeAprobacion,
  type EstadoDocumento,
  type EstadoVista,
} from "./estado-del-documento";

export type { EstadoVista, HitoVista } from "./estado-del-documento";
export { MENSAJE_APROBADO } from "./estado-del-documento";

const NOTA_A_EMPRESA = 190; // asociación nota → empresa (HUBSPOT_DEFINED), la misma que usa la ficha

export type ResultadoDeEstado = { ok: true; estado: EstadoVista } | { ok: false; status: number; error: string; motivos?: string[] };

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
      project: { select: { client: { select: { name: true, hubspotCompanyId: true } } } },
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
  return revisarParaPresentar({ estado, tieneContenido: conContenido, cabos, politica: dataDe(POLITICA_RECTORA_KEY) });
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

/** PRESENTAR: exige el hilo cerrado y la política revisada; deja la foto protegida de lo presentado. */
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

  await prisma.$transaction([
    prisma.projectCanvas.update({ where: { id: canvasId }, data: { estadoDocumento: aColumna("presentado"), versionDocumento: version } }),
    prisma.hitoDeDocumento.create({ data: { canvasId, version, tipo: "presentado", porEmail: por, fotoId: v.id } }),
  ]);
  return devolver(canvasId);
}

/** APROBAR: solo sobre lo presentado y sin cambios desde entonces. Deja la nota en HubSpot. */
export async function registrarAprobacion(canvasId: string, datos: DatosDeAprobacion, por: string | null): Promise<ResultadoDeEstado> {
  const doc = await cargarDocumento(canvasId);
  if (!doc) return { ok: false, status: 404, error: "El documento no existe." };
  const estado = leerEstado(doc.estadoDocumento);
  if (estado === "aprobado") return { ok: false, status: 409, error: "Ya está aprobado." };
  if (estado !== "presentado") return { ok: false, status: 409, error: "Primero preséntalo: la aprobación es sobre lo que vio el cliente." };

  const presentado = await ultimoPresentado(canvasId, doc.versionDocumento);
  const foto = await fotoDelDocumento(canvasId);
  if (presentado?.foto?.huella && presentado.foto.huella !== huellaDe(foto)) {
    return {
      ok: false,
      status: 409,
      error: "Cambió desde que se presentó: preséntalo de nuevo (será la versión siguiente) y registra la aprobación sobre esa.",
    };
  }
  const v = validarAprobacion(datos, new Date());
  if (!v.ok) return { ok: false, status: 400, error: v.error };

  // La nota en la empresa en HubSpot: el registro queda donde el equipo comercial también mira. Si
  // HubSpot no responde, la aprobación igual se registra en Nexus (con el error a la vista).
  let hubspotNotaId: string | null = null;
  let hubspotError: string | null = null;
  const companyId = doc.project?.client?.hubspotCompanyId ?? null;
  if (!companyId) {
    hubspotError = "El cliente no tiene empresa de HubSpot vinculada: la nota no se escribió.";
  } else {
    try {
      const hs = await getSystemHubspotClient();
      const res = await hs.apiRequest({
        method: "POST",
        path: "/crm/v3/objects/notes",
        body: {
          properties: {
            hs_timestamp: new Date().toISOString(),
            hs_note_body: notaDeAprobacion({
              documento: doc.name || "Diagnóstico",
              version: doc.versionDocumento,
              nombre: datos.nombre.trim(),
              email: datos.email.trim(),
              fecha: v.fecha,
              evidencia: datos.evidencia,
              registradoPor: por,
            }),
          },
          associations: [
            { to: { id: companyId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: NOTA_A_EMPRESA }] },
          ],
        },
      });
      if (res.ok) hubspotNotaId = ((await res.json()) as { id?: string }).id ?? null;
      else hubspotError = `HubSpot no aceptó la nota (${res.status}).`;
    } catch (e) {
      hubspotError = `HubSpot no respondió: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  await prisma.$transaction([
    prisma.projectCanvas.update({ where: { id: canvasId }, data: { estadoDocumento: aColumna("aprobado") } }),
    prisma.hitoDeDocumento.create({
      data: {
        canvasId,
        version: doc.versionDocumento,
        tipo: "aprobado",
        porEmail: por,
        fotoId: presentado?.fotoId ?? null,
        aprobadoPorNombre: datos.nombre.trim(),
        aprobadoPorEmail: datos.email.trim() || null,
        aprobadoEl: v.fecha,
        evidencia: datos.evidencia.trim() || null,
        evidenciaDocumentoId: datos.evidenciaDocumentoId ?? null,
        hubspotNotaId,
        hubspotError,
      },
    }),
  ]);
  return devolver(canvasId);
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


/**
 * Después de REGENERAR: si estaba presentado, lo que sigue es la versión siguiente en borrador (la
 * presentada queda en el historial, con su foto protegida). Nunca tira: es un rastro, no la corrida.
 */
export async function trasRegenerar(canvasId: string): Promise<void> {
  try {
    const c = await prisma.projectCanvas.findUnique({ where: { id: canvasId }, select: { estadoDocumento: true, versionDocumento: true } });
    if (leerEstado(c?.estadoDocumento) !== "presentado") return;
    const version = (c?.versionDocumento ?? 1) + 1;
    await prisma.$transaction([
      prisma.projectCanvas.update({ where: { id: canvasId }, data: { estadoDocumento: null, versionDocumento: version } }),
      prisma.hitoDeDocumento.create({
        data: { canvasId, version, tipo: "reabierto", motivo: `Se regeneró después de presentarlo: la v${version - 1} presentada queda en el historial.` },
      }),
    ]);
  } catch (e) {
    console.error(`[estado-del-documento] no se pudo abrir la versión siguiente de ${canvasId}:`, e instanceof Error ? e.message : e);
  }
}
