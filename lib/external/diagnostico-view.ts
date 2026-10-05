/**
 * lib/external/diagnostico-view.ts
 *
 * CHOKEPOINT de seguridad del DIAGNÓSTICO externo (2026-10-02). Único lugar donde un token de acceso
 * se resuelve al contenido de ese documento. Corre SIEMPRE server-side, con los DOS checks a la vista
 * en cada lectura, como sus hermanos:
 *   1. token → acceso ACTIVO no revocado y que sea el que nombra la dirección.
 *   2. `diagnosticoPublishedAt != null`: el token es POR PROYECTO y se comparte con las otras
 *      superficies; sin este flag el cliente vería un borrador. Despublicar corta en el render siguiente.
 *
 * ── LO QUE VE EL CLIENTE: LA VERSIÓN PRESENTADA (decisión de Elías, 2026-10-02) ───────────────
 * El diagnóstico tiene estados (borrador · presentado · aprobado, lib/canvas/estado-del-documento.ts)
 * y al presentarlo se guarda una foto protegida. El enlace muestra ESA foto —la última presentada o
 * aprobada—, no lo que se esté editando: una sola versión oficial. Si se presenta una versión nueva,
 * el enlace pasa a mostrarla sola. Lo OCULTO se filtra contra el estado vivo (ocultar después de
 * presentar tiene efecto inmediato), y solo cruzan los bloques confirmados.
 *
 * La línea base y la meta de los objetivos salen de la lista de resultados VIVA (como el PDF): se
 * capturan una sola vez, en el handoff. Solo los campos aptos para el cliente.
 *
 * 2026-10-04 · `aprobacion`: si el cliente puede aprobar lo que ve (es lo vigente: presentado, la misma
 * versión y sin cambios), si ya está aprobado (quién y cuándo) o si el equipo está ajustando. La
 * escritura va por app/external/diagnostico/actions.ts.
 */
import { prisma } from "@/lib/db/prisma";
import { resolveActiveAccess, touchAccess } from "./access";
import { getBrandLogos } from "./smarteam-logo";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { hiddenKeysFrom } from "@/lib/business-cases/section-briefs";
import { aprobacionEnElEnlace, lineaDelDocumento, type AprobacionEnElEnlace } from "@/lib/canvas/estado-del-documento";
import { estadoDelDocumento } from "@/lib/canvas/estado-del-documento-servidor";
import { resultadosDelProyecto } from "@/lib/handoff/resultados";
import type { DocumentoPublicadoViewData } from "./snapshot-de-documento";
import type { LandingSectionRow } from "@/components/landing/build-landing";

export interface DiagnosticoViewData extends DocumentoPublicadoViewData {
  /** Cliente · Fecha · Versión · Estado de la versión PRESENTADA (la misma línea que el editor y el PDF). */
  lineaDelDocumento: string | null;
  /** Lo apto para el cliente de cada resultado (sin quién lo necesita ni retos). */
  resultados: Array<{ id: string; resultado: string; metrica: string; lineaBase: string; meta: string; plazo: string; confirmadoAt?: string }>;
  /** 2026-10-04: si el cliente puede aprobar lo que ve, si ya lo aprobó (quién y cuándo) o si el equipo está ajustando. */
  aprobacion: AprobacionEnElEnlace;
  /**
   * La versión de la foto que el cliente está viendo (2026-10-05). La página la ata a la acción de
   * aprobar: si el equipo presenta otra mientras tanto, la aprobación no pasa a la versión nueva.
   */
  versionPresentada: number;
}

interface SeccionDeFoto {
  key: string;
  titleOverride: string | null;
  eyebrowOverride: string | null;
  blocks: Array<{ blockType: string; content: string | null; data: unknown; status?: string }>;
}

/** Lo que se le PRESENTÓ (o aprobó) al cliente por última vez: el hito con su foto protegida. */
export async function ultimaVersionPresentada(canvasId: string) {
  return prisma.hitoDeDocumento.findFirst({
    where: { canvasId, tipo: { in: ["presentado", "aprobado"] }, fotoId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: {
      tipo: true,
      version: true,
      createdAt: true,
      aprobadoEl: true,
      aprobadoPorNombre: true,
      foto: { select: { secciones: true } },
    },
  });
}

export async function getDiagnosticoForToken(credencial: string, accesoId: string): Promise<DiagnosticoViewData | null> {
  const access = await resolveActiveAccess(credencial, accesoId);
  if (!access) return null;
  if (!access.project.diagnosticoPublishedAt) return null;

  const canvas = await prisma.projectCanvas.findFirst({
    where: { projectId: access.project.id, ...canvasOf("diagnosis") },
    select: { id: true, sections: true },
  });
  if (!canvas) return null;
  const presentada = await ultimaVersionPresentada(canvas.id);
  if (!presentada?.foto) return null;

  const secciones = Array.isArray(presentada.foto.secciones) ? (presentada.foto.secciones as unknown as SeccionDeFoto[]) : [];
  const ocultas = hiddenKeysFrom(canvas.sections);

  await touchAccess(access.accessId);

  const [logos, lista, vivo] = await Promise.all([
    getBrandLogos(),
    resultadosDelProyecto(access.project.id).catch(() => null),
    estadoDelDocumento(canvas.id).catch(() => null),
  ]);
  const brandLogos: Record<string, string> = Object.fromEntries(
    Object.entries(logos).filter((e): e is [string, string] => typeof e[1] === "string" && !!e[1]),
  );

  const fecha = presentada.tipo === "aprobado" ? (presentada.aprobadoEl ?? presentada.createdAt) : presentada.createdAt;
  return {
    projectName: access.project.name,
    clientName: access.project.client.name,
    clientLogoUrl: access.project.client.logoUrl,
    clientLogoDarkUrl: access.project.client.logoDarkUrl,
    clientLogoScale: access.project.client.logoScale,
    smarteamLogoUrl: logos.smarteam ?? null,
    brandLogos,
    publishedAt: fecha.toISOString(),
    lineaDelDocumento: lineaDelDocumento({
      cliente: access.project.client.name,
      fecha,
      version: presentada.version,
      estado: presentada.tipo === "aprobado" ? "aprobado" : "presentado",
    }),
    resultados: (lista?.resultados ?? []).map((r) => ({
      id: r.id,
      resultado: r.resultado,
      metrica: r.metrica,
      lineaBase: r.lineaBase,
      meta: r.meta,
      plazo: r.plazo,
      ...(r.confirmadoAt ? { confirmadoAt: r.confirmadoAt } : {}),
    })),
    // Solo quién del cliente aprobó y cuándo: ni el correo ni la evidencia ni quién lo registró.
    aprobacion: aprobacionEnElEnlace({
      vista: presentada,
      vivo: vivo && { estado: vivo.estado, version: vivo.version, cambiosDesdeLaPresentacion: vivo.cambiosDesdeLaPresentacion },
    }),
    versionPresentada: presentada.version,
    rows: secciones
      .filter((s) => !ocultas.has(s.key))
      .map((s) => ({
        key: s.key,
        titleOverride: s.titleOverride ?? null,
        eyebrowOverride: s.eyebrowOverride ?? null,
        // Una propuesta que nadie aceptó no se entrega (las fotos viejas no traen status: cuentan).
        blocks: s.blocks.filter((b) => !b.status || b.status === "CONFIRMED") as LandingSectionRow["blocks"],
      }))
      .filter((s) => s.blocks.length > 0),
  };
}
