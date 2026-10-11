/**
 * lib/canvas/presentacion-del-diagnostico-server.ts — leer y cambiar cuándo se le presenta el
 * diagnóstico al cliente, y avisar al vendedor cuando está listo. SERVIDOR.
 * Las reglas: ./presentacion-del-diagnostico.ts.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { avisar } from "@/lib/para-ti/avisos-server";
import { urlDeProyecto } from "@/lib/agents/run-url";
import { canvasOfNested } from "@/lib/pieces/canvas-query";
import { porQueNoSeAvisoAlVendedor, vendedorDeLaEmpresa } from "@/lib/hubspot/vendedor-de-la-empresa";
import {
  conPropuesta,
  descartarPropuesta,
  fechaEnPalabras,
  fijarFecha,
  leerPresentacion,
  marcarListo,
  sinFecha,
  usarPropuesta,
  type PresentacionDelDiagnostico,
  type ReunionDeLaPropuesta,
} from "./presentacion-del-diagnostico";

export async function presentacionDelProyecto(projectId: string): Promise<PresentacionDelDiagnostico> {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { diagnosticoPresentacion: true } });
  return leerPresentacion(p?.diagnosticoPresentacion);
}

async function guardar(projectId: string, p: PresentacionDelDiagnostico): Promise<void> {
  await prisma.project.update({
    where: { id: projectId },
    data: { diagnosticoPresentacion: p as unknown as Prisma.InputJsonValue },
  });
}

export type AccionDePresentacion =
  | { accion: "fijar"; fecha: string }
  | { accion: "sin-fecha" }
  | { accion: "usar-propuesta" }
  | { accion: "descartar-propuesta" }
  | { accion: "listo"; fecha: string };

export interface ResultadoDelAvisoAlVendedor {
  avisado: boolean;
  /** A quién se le avisó (nombre). */
  vendedor: string | null;
  /** Si no se le pudo avisar, por qué (se le dice al CSE). */
  motivo: string | null;
}

/** El aviso al vendedor dueño de la empresa en HubSpot: «está listo, revísalo antes de presentarlo». */
async function avisarAlVendedor(projectId: string, fecha: string, actorEmail: string): Promise<ResultadoDelAvisoAlVendedor> {
  const proyecto = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, clientId: true, client: { select: { name: true } } },
  });
  if (!proyecto) return { avisado: false, vendedor: null, motivo: null };
  const [vendedor, canvas] = await Promise.all([
    vendedorDeLaEmpresa(proyecto.clientId),
    prisma.projectCanvas.findFirst({ where: canvasOfNested("diagnosis", { projectId }), select: { id: true } }),
  ]);
  if (!vendedor.ok) return { avisado: false, vendedor: null, motivo: porQueNoSeAvisoAlVendedor(vendedor.motivo) };
  if (vendedor.email.toLowerCase() === actorEmail.toLowerCase()) {
    return { avisado: false, vendedor: vendedor.nombre, motivo: "Tú eres el vendedor de esta empresa en HubSpot: no te mandamos un aviso a ti." };
  }
  // El mismo aviso de la misma fecha ya le llegó: no se repite, y se dice que ya lo tiene.
  const dedupeKey = `diagnostico.listo:${projectId}:${fecha}`;
  const yaLoTiene = await prisma.aviso
    .findUnique({ where: { paraEmail_dedupeKey: { paraEmail: vendedor.email.toLowerCase(), dedupeKey } }, select: { id: true } })
    .catch(() => null);
  if (yaLoTiene) return { avisado: true, vendedor: vendedor.nombre, motivo: null };
  const n = await avisar({
    para: vendedor.email,
    tipo: "diagnostico.listo",
    titulo: `El diagnóstico de ${proyecto.client?.name ?? proyecto.name} está listo`,
    detalle: `Se presenta el ${fechaEnPalabras(fecha)}. Revísalo antes de la presentación.`,
    href: urlDeProyecto(proyecto.clientId, projectId, canvas?.id ?? null),
    actorEmail,
    dedupeKey,
  });
  return { avisado: n > 0, vendedor: vendedor.nombre, motivo: n > 0 ? null : "No se pudo escribir el aviso al vendedor." };
}

export class SinPropuesta extends Error {}

/** Aplica lo que hizo la persona. Al marcarlo listo, avisa al vendedor. */
export async function cambiarPresentacion(
  projectId: string,
  a: AccionDePresentacion,
  actorEmail: string,
): Promise<{ presentacion: PresentacionDelDiagnostico; aviso: ResultadoDelAvisoAlVendedor | null }> {
  const actual = await presentacionDelProyecto(projectId);
  const ahora = new Date().toISOString();
  let siguiente: PresentacionDelDiagnostico;
  switch (a.accion) {
    case "fijar":
      siguiente = fijarFecha(actual, a.fecha, actorEmail, ahora);
      break;
    case "sin-fecha":
      siguiente = sinFecha(actual, actorEmail, ahora);
      break;
    case "usar-propuesta": {
      const usada = usarPropuesta(actual, actorEmail, ahora);
      if (!usada) throw new SinPropuesta("No hay una fecha propuesta para usar.");
      siguiente = usada;
      break;
    }
    case "descartar-propuesta":
      siguiente = descartarPropuesta(actual, actorEmail, ahora);
      break;
    case "listo":
      siguiente = marcarListo(actual, a.fecha, actorEmail, ahora);
      break;
  }
  await guardar(projectId, siguiente);
  if (a.accion !== "listo") return { presentacion: siguiente, aviso: null };
  const aviso = await avisarAlVendedor(projectId, a.fecha, actorEmail);
  const conAviso: PresentacionDelDiagnostico = {
    ...siguiente,
    aviso: { en: ahora, para: aviso.avisado ? aviso.vendedor : null, motivo: aviso.motivo },
  };
  await guardar(projectId, conAviso);
  return { presentacion: conAviso, aviso };
}

/**
 * La fecha que leyó Nexus en una reunión (desde el análisis post-sesión). Nunca lanza: si no se pudo
 * guardar, la reunión sigue procesándose igual.
 */
export async function proponerFechaDesdeReunion(
  projectId: string,
  propuesta: { fecha: string; cita: string; reunion: ReunionDeLaPropuesta },
): Promise<boolean> {
  try {
    const siguiente = conPropuesta(await presentacionDelProyecto(projectId), propuesta, new Date().toISOString());
    if (!siguiente) return false;
    await guardar(projectId, siguiente);
    return true;
  } catch (e) {
    console.error(`[diagnostico] no se pudo guardar la fecha propuesta de ${projectId}: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/** ¿Este proyecto tiene un diagnóstico generado que todavía no se presentó? (para pedir la fecha en la reunión) */
export async function diagnosticoSinPresentar(projectId: string): Promise<boolean> {
  const canvas = await prisma.projectCanvas.findFirst({
    where: canvasOfNested("diagnosis", { projectId }),
    select: { estadoDocumento: true, canvasSections: { where: { key: { not: "cierre" }, blocks: { some: {} } }, select: { id: true }, take: 1 } },
  });
  if (!canvas || canvas.canvasSections.length === 0) return false;
  return canvas.estadoDocumento !== "presentado" && canvas.estadoDocumento !== "aprobado";
}
