/**
 * lib/lifecycle/gate.ts — la puerta de las operaciones que SON de Customer Success.
 *
 * Las compuertas de salida, el override de etapa y la modalidad de adopción son de la
 * metodología de CS. Un proyecto de Desarrollo o de Sitios web mueve su etapa EN HUBSPOT:
 * acá no hay nada que marcar, y aceptar la escritura dejaría filas de un vocabulario ajeno
 * colgadas de un proyecto que nunca las va a leer (además de volverlo no borrable por
 * `scripts/limpiar-piezas-basura.ts`, que se niega ante "etapas marcadas").
 *
 * ── POR QUÉ 409 Y NO 403 ─────────────────────────────────────────────────────
 * No es falta de permisos: el recurso no admite la operación, y ningún permiso la va a
 * habilitar. Un 403 manda al usuario a pedirle accesos a alguien que no se los puede dar.
 *
 * ── LA EXCEPCIÓN QUE CADA ENDPOINT APLICA ────────────────────────────────────
 * LIMPIAR siempre se permite (desmarcar una compuerta, volver a la etapa inferida, borrar
 * la modalidad). Si un proyecto se reclasifica DESPUÉS de que alguien curó algo a mano, la
 * curación vieja quedaría encerrada sin forma de deshacerse. Por eso el veto se pide
 * después de leer el body, no antes.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { fuenteDelCiclo, type FuenteDelCiclo } from "@/lib/projects/kind";

/**
 * ¿Quién manda la etapa de este proyecto? Tres columnas del mismo row. `null` = no existe.
 */
export async function fuenteDelCicloDeProyecto(projectId: string): Promise<FuenteDelCiclo | null> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { hubspotPipelineId: true, proyectoInterno: true, hermanoCsProjectId: true },
  });
  if (!p) return null;
  return fuenteDelCiclo({
    hubspotPipelineId: p.hubspotPipelineId,
    interno: p.proyectoInterno,
    tieneHermanoCs: p.hermanoCsProjectId != null,
  });
}

/**
 * `null` si el proyecto corre el ciclo de Customer Success (seguí adelante); un
 * `NextResponse` listo (404 si no existe, 409 si su etapa la manda un pipeline) si no.
 */
export async function vetoSiNoCorreCicloDeCs(projectId: string): Promise<NextResponse | null> {
  const fuente = await fuenteDelCicloDeProyecto(projectId);
  if (!fuente) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  if (fuente.tipo === "customer-success") return null;
  return NextResponse.json(
    {
      error:
        `Este proyecto es de «${fuente.pipeline.label}»: su etapa la mueve el equipo en ` +
        `HubSpot, no se marca acá. Cambiala en el pipeline y Nexus la espeja.`,
      pipeline: fuente.pipeline.key,
    },
    { status: 409 },
  );
}
