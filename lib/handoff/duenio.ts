/**
 * lib/handoff/duenio.ts — DE QUIÉN es el handoff que le corresponde a este proyecto.
 *
 * Un desarrollo que cuelga de una implementación de Customer Success no tiene un alcance
 * vendido propio: es el MISMO. El handoff del hermano es la fuente, y generarle uno aparte
 * produciría dos documentos del mismo trato que se contradicen a la primera edición.
 *
 * ── EL BUG QUE ESTO ARREGLA, Y QUE NO ERA VISIBLE ────────────────────────────
 * `runDesarrolloGeneration` lee la sección `desarrollo` del handoff y la etiqueta en el
 * prompt como "TU ÚNICA FUENTE". Para un desarrollo hermano eso devolvía vacío, y el prompt
 * caía a su rama degradada: "Sin handoff con detalle técnico. Proponé la estructura desde
 * buenas prácticas de HubSpot…". O sea: el requerimiento técnico se generaba A CIEGAS
 * mientras el alcance vendido estaba escrito en el proyecto de al lado. No fallaba, no
 * logueaba: entregaba un documento genérico con cara de específico.
 *
 * ── LO QUE SE REDIRIGE Y LO QUE NO ───────────────────────────────────────────
 * Se redirige el DOCUMENTO. Los tags, la modalidad y las sesiones siguen siendo del
 * desarrollo: son la clasificación de ESTE proyecto, y confundirlos haría que editar los
 * tags del desarrollo escriba sobre la implementación.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { resolvePipeline, pipelineByKey } from "@/lib/projects/kind";
import { canvasOfNested } from "@/lib/pieces/canvas-query";

export interface HechosDelHandoff {
  projectId: string;
  /** `Project.hubspotPipelineId`. */
  hubspotPipelineId: string | null;
  /** `Project.hermanoCsProjectId` — la implementación de la que cuelga, si cuelga. */
  hermanoCsProjectId: string | null;
  /**
   * ¿Este proyecto YA tiene un handoff propio CON CONTENIDO? (bloques en su canvas).
   * Entra como primitivo para que la decisión se pueda escribir entera en un test.
   */
  tieneHandoffPropioConContenido: boolean;
}

export interface DuenioDelHandoff {
  /** El proyecto cuyo handoff hay que leer/escribir. */
  ownerProjectId: string;
  /** ¿Es el de OTRO proyecto? Si es false, `ownerProjectId === projectId`. */
  redirigido: boolean;
}

/**
 * PURA. Cuatro hechos → de quién es el handoff.
 *
 * Tres frenos, y cada uno tiene su motivo:
 *
 * 1. **No basta la columna `hermanoCsProjectId`: el pipeline tiene que DECLARAR que puede
 *    ser hermano.** Así la regla sigue derivada del registro (`canBeSiblingOf`) y un
 *    pipeline que nadie declaró nunca redirige — el mismo principio que hace invisible el
 *    deploy en toda esta tanda.
 *
 * 2. **Si el desarrollo YA tiene handoff propio con contenido, NO se redirige.** Redirigir
 *    sin mirar escondería trabajo real detrás de una regla nueva; alguien lo escribió y de
 *    golpe dejaría de verlo. (Al escribir esto: cero casos.)
 *
 * 3. **Un proyecto nunca es su propio hermano.** Un dato malo en HubSpot no puede producir
 *    un ciclo.
 */
export function duenioDelHandoff(facts: HechosDelHandoff): DuenioDelHandoff {
  const propio = { ownerProjectId: facts.projectId, redirigido: false };
  if (!facts.hermanoCsProjectId) return propio;
  if (facts.hermanoCsProjectId === facts.projectId) return propio;
  if (facts.tieneHandoffPropioConContenido) return propio;

  const def = resolvePipeline(facts.hubspotPipelineId);
  if (!def?.canBeSiblingOf.includes("customer-success")) return propio;

  return { ownerProjectId: facts.hermanoCsProjectId, redirigido: true };
}

/**
 * ── LA NOTA POR DEFECTO PARA UN DESARROLLO/SITIO QUE VA SOLO ─────────────────
 *
 * `duenioDelHandoff` de arriba cubre el caso "cuelga de una implementación": ese handoff ni
 * siquiera nace, se redirige. Éste es el caso DISTINTO que pidió Elías el 2026-08-06: un
 * Desarrollo o Sitio web que SÍ tiene su propio handoff —no está formalmente colgado como
 * hermano en HubSpot— pero cuya empresa tiene (o tuvo) una Implementación de HubSpot aparte.
 * Los 17 proyectos "Integración con X" de ese día son el caso de uso: comparten cliente con
 * una Implementación, así que sus reuniones se mezclan en la misma línea de tiempo de HubSpot,
 * y sin esta nota la IA redacta de nuevo el alcance de la Implementación en cada uno.
 *
 * Es un VALOR POR DEFECTO, no una regla nueva: se escribe una vez al nacer el handoff y
 * cualquier CSE la edita o la borra desde la pestaña Contexto como toda `contextExclusions`.
 * No toca `duenioDelHandoff` ni el veto — ésos siguen siendo la única fuente de verdad sobre
 * DE QUIÉN es el documento.
 */
export const EXCLUSION_IMPLEMENTACION_HUBSPOT = "Ignora todo lo relacionado a la implementación de HubSpot.";

/**
 * PURA. Solo aplica a lo que PUEDE ser hermano de una implementación (Desarrollo, Sitios web)
 * — reusa `canBeSiblingOf`, la misma tabla que decide la redirección de arriba, para no
 * duplicar "cuáles son los pipelines que acompañan a una Implementación" en un segundo lugar.
 * Una Implementación de HubSpot nunca se excluye a sí misma.
 */
export function contextExclusionesPorDefecto(input: {
  hubspotPipelineId: string | null;
  tieneImplementacionHubSpot: boolean;
}): string | null {
  if (!input.tieneImplementacionHubSpot) return null;
  const def = resolvePipeline(input.hubspotPipelineId);
  if (!def?.canBeSiblingOf.includes("customer-success")) return null;
  return EXCLUSION_IMPLEMENTACION_HUBSPOT;
}

/**
 * ¿La empresa tiene, o tuvo alguna vez, un proyecto en el pipeline de Implementación de
 * HubSpot? "Tuvo" a propósito —sin filtrar por activo—: aunque esa implementación ya haya
 * cerrado, sus reuniones viejas siguen en la misma línea de tiempo de la company y le siguen
 * bajando línea a la IA si no se las excluye.
 */
export async function tieneOTuvoImplementacionHubSpot(
  clientId: string,
  excludeProjectId?: string,
): Promise<boolean> {
  const csPipelineId = pipelineByKey("customer-success").hubspotPipelineId;
  const n = await prisma.project.count({
    where: {
      clientId,
      hubspotPipelineId: csPipelineId,
      ...(excludeProjectId ? { id: { not: excludeProjectId } } : {}),
    },
  });
  return n > 0;
}

export interface DuenioResuelto extends DuenioDelHandoff {
  /** Datos del hermano, para la pantalla. `null` cuando no hay redirección. */
  hermano: { id: string; name: string } | null;
}

/**
 * Resuelve el dueño contra la base. Dos queries como máximo, y la segunda solo cuando de
 * verdad hay redirección (para traer el nombre que muestra la pantalla).
 *
 * Devuelve el propio proyecto ante cualquier rareza —proyecto inexistente, hermano
 * inexistente—: el lado seguro de equivocarse es que cada uno se quede con lo suyo.
 */
export async function resolverDuenioDelHandoff(projectId: string): Promise<DuenioResuelto> {
  const propio: DuenioResuelto = { ownerProjectId: projectId, redirigido: false, hermano: null };
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { hubspotPipelineId: true, hermanoCsProjectId: true },
  });
  if (!p) return propio;

  const base = { projectId, hubspotPipelineId: p.hubspotPipelineId, hermanoCsProjectId: p.hermanoCsProjectId };

  /* La cuenta de bloques SOLO se paga si todo lo demás ya apunta a redirigir. El caso común
     —un proyecto sin hermano— se resuelve con la sola lectura de arriba, que es un
     findUnique por clave primaria. Este loader lo llama cada armado de contexto de agente. */
  if (!duenioDelHandoff({ ...base, tieneHandoffPropioConContenido: false }).redirigido) return propio;

  // Un canvas vacío NO cuenta: los proyectos nacen con el canvas y sin bloques, y eso no es
  // trabajo que haya que proteger.
  const bloques = await prisma.canvasBlock.count({
    where: { section: { canvas: canvasOfNested("handoff", { projectId }) } },
  });
  const veredicto = duenioDelHandoff({ ...base, tieneHandoffPropioConContenido: bloques > 0 });
  if (!veredicto.redirigido) return propio;

  const hermano = await prisma.project.findUnique({
    where: { id: veredicto.ownerProjectId },
    select: { id: true, name: true },
  });
  // El hermano apuntado ya no existe → cada uno con lo suyo, en vez de un 404 en cascada.
  if (!hermano) return propio;

  return { ...veredicto, hermano };
}

/**
 * `null` si este proyecto puede ESCRIBIR su propio handoff; un 409 listo si su handoff es
 * el de otro proyecto.
 *
 * ── ES LO LOAD-BEARING DE TODA LA PIEZA ──────────────────────────────────────
 * La solo-lectura de la pantalla es una afordancia: quien podría editar desde acá tiene la
 * pestaña del hermano a un clic con el mismo permiso. Lo que de verdad impide que existan
 * DOS documentos del mismo trato es este veto, y por eso va en las cinco puertas —
 * incluida la regeneración vía `/analyze`, que es la única que se puede saltear el botón.
 *
 * 409 y no 403, igual que en el resto de la tanda: no falta un permiso, el recurso no
 * admite la operación acá.
 */
export async function vetoSiElHandoffEsDeOtro(projectId: string): Promise<NextResponse | null> {
  const duenio = await resolverDuenioDelHandoff(projectId);
  if (!duenio.redirigido) return null;
  return NextResponse.json(
    {
      error:
        `El handoff de este desarrollo es el de "${duenio.hermano?.name ?? "el proyecto principal"}": ` +
        `es el mismo alcance vendido. Editalo o regeneralo desde ese proyecto.`,
      ownerProjectId: duenio.ownerProjectId,
    },
    { status: 409 },
  );
}
