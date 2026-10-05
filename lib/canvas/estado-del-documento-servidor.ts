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
import { avisar } from "@/lib/para-ti/avisos-server";
import { urlDeProyecto } from "@/lib/agents/run-url";
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

export type ResultadoDeEstado =
  | { ok: true; estado: EstadoVista }
  | {
      ok: false;
      status: number;
      error: string;
      motivos?: string[];
      /** Por qué no se aprobó, para quien llama: ya estaba aprobada esa versión, o es otra versión. */
      codigo?: "ya-aprobado" | "otra-version";
      /** Con `ya-aprobado`: quién la aprobó de verdad y cuándo (nunca quien lo intentó después). */
      aprobado?: { nombre: string | null; fecha: string | null };
    };

/** Lo que dice el hito mientras se escribe la nota en HubSpot (si el proceso muere ahí, queda dicho). */
const NOTA_PENDIENTE = "La nota en HubSpot no se llegó a escribir.";

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

/** La aprobación que ya está registrada en esa versión: quién y cuándo, del hito real. */
async function yaAprobado(canvasId: string, version: number): Promise<ResultadoDeEstado> {
  const h = await prisma.hitoDeDocumento.findFirst({
    where: { canvasId, version, tipo: "aprobado" },
    orderBy: { createdAt: "desc" },
    select: { aprobadoPorNombre: true, aprobadoEl: true },
  });
  return {
    ok: false,
    status: 409,
    codigo: "ya-aprobado",
    error: "Ya está aprobado.",
    aprobado: { nombre: h?.aprobadoPorNombre?.trim() || null, fecha: h?.aprobadoEl ? h.aprobadoEl.toISOString() : null },
  };
}

/**
 * APROBAR: solo sobre lo presentado y sin cambios desde entonces. Deja la nota en HubSpot.
 *
 * `versionEsperada`: la versión que tiene a la vista quien aprueba (el cliente, en su enlace). Si el
 * equipo ya presentó otra, no se aprueba: el cliente aprueba lo que vio, nunca la versión siguiente.
 * `null` = quien registra ve el documento vivo (el equipo, desde la ficha).
 *
 * El documento se TOMA antes de escribir afuera (2026-10-05): el cambio a «aprobado» es condicional
 * a que siga presentado en la versión revisada, en la misma transacción que el hito. Dos
 * aprobaciones a la vez, o una regeneración en el medio, dejan una sola; la otra no escribe nada,
 * ni la nota en HubSpot.
 */
export async function registrarAprobacion(
  canvasId: string,
  datos: DatosDeAprobacion,
  por: string | null,
  versionEsperada: number | null,
): Promise<ResultadoDeEstado> {
  const doc = await cargarDocumento(canvasId);
  if (!doc) return { ok: false, status: 404, error: "El documento no existe." };
  const estado = leerEstado(doc.estadoDocumento);
  if (versionEsperada !== null && doc.versionDocumento !== versionEsperada) {
    return {
      ok: false,
      status: 409,
      codigo: "otra-version",
      error: `Lo que se quiere aprobar es la v${versionEsperada}, y el documento ya va en la v${doc.versionDocumento}.`,
    };
  }
  if (estado === "aprobado") return yaAprobado(canvasId, doc.versionDocumento);
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

  // Tomar el documento: pasa a «aprobado» solo si sigue presentado en la versión que se revisó.
  const hito = await prisma.$transaction(async (tx) => {
    const tomado = await tx.projectCanvas.updateMany({
      where: { id: canvasId, estadoDocumento: aColumna("presentado"), versionDocumento: doc.versionDocumento },
      data: { estadoDocumento: aColumna("aprobado") },
    });
    if (tomado.count !== 1) return null;
    return tx.hitoDeDocumento.create({
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
        hubspotNotaId: null,
        hubspotError: NOTA_PENDIENTE,
      },
      select: { id: true },
    });
  });
  if (!hito) {
    // Alguien se adelantó: si fue otra aprobación de esta misma versión, se dice quién de verdad.
    const ahora = await prisma.projectCanvas.findUnique({ where: { id: canvasId }, select: { estadoDocumento: true, versionDocumento: true } });
    if (leerEstado(ahora?.estadoDocumento) === "aprobado" && ahora?.versionDocumento === doc.versionDocumento) {
      return yaAprobado(canvasId, doc.versionDocumento);
    }
    return { ok: false, status: 409, error: "El documento cambió mientras se registraba la aprobación: recarga y vuelve a intentarlo." };
  }

  // La nota en la empresa en HubSpot: el registro queda donde el equipo comercial también mira. Si
  // HubSpot no responde, la aprobación igual queda registrada en Nexus (con el error a la vista).
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

  await prisma.hitoDeDocumento.update({ where: { id: hito.id }, data: { hubspotNotaId, hubspotError } }).catch((e) => {
    console.error(`[estado-del-documento] no se pudo anotar la nota de HubSpot en el hito ${hito.id}:`, e instanceof Error ? e.message : e);
  });
  // «Para ti» (2026-10-04): al encargado del proyecto le llega que el cliente aprobó (si no fue él quien lo registró).
  if (doc.project && doc.projectId) {
    await avisar({
      para: doc.project.hubspotOwnerEmail,
      tipo: "cliente.aprobo-documento",
      titulo: `${doc.project.client?.name ?? "El cliente"} aprobó ${doc.name || "el documento"}${por ? "" : " desde su enlace"}`,
      detalle: `Lo aprobó ${datos.nombre.trim()} sobre la versión ${doc.versionDocumento}.`,
      href: urlDeProyecto(doc.project.clientId, doc.projectId, canvasId),
      actorEmail: por,
      dedupeKey: `cliente.aprobo-documento:${canvasId}:${doc.versionDocumento}`,
    });
  }
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
 *
 * El cambio es condicional a que SIGA presentado en esa versión (2026-10-05): si entre la lectura y
 * la escritura alguien aprobó, reabrió o presentó otra, no se pisa.
 */
export async function trasRegenerar(canvasId: string): Promise<void> {
  try {
    const c = await prisma.projectCanvas.findUnique({ where: { id: canvasId }, select: { estadoDocumento: true, versionDocumento: true } });
    if (!c || leerEstado(c.estadoDocumento) !== "presentado") return;
    const presentada = c.versionDocumento;
    const version = presentada + 1;
    await prisma.$transaction(async (tx) => {
      const tomado = await tx.projectCanvas.updateMany({
        where: { id: canvasId, estadoDocumento: aColumna("presentado"), versionDocumento: presentada },
        data: { estadoDocumento: aColumna("borrador"), versionDocumento: version },
      });
      if (tomado.count !== 1) return;
      await tx.hitoDeDocumento.create({
        data: { canvasId, version, tipo: "reabierto", motivo: `Se regeneró después de presentarlo: la v${presentada} presentada queda en el historial.` },
      });
    });
  } catch (e) {
    console.error(`[estado-del-documento] no se pudo abrir la versión siguiente de ${canvasId}:`, e instanceof Error ? e.message : e);
  }
}
