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
 * 1. **No basta la columna `hermanoCsProjectId`: el pipeline tiene que DECLARAR que su handoff
 *    es el del hermano** (`handoffDelHermano`). Así la regla sigue derivada del registro y un
 *    pipeline que nadie declaró nunca redirige — el mismo principio que hace invisible el
 *    deploy en toda esta tanda.
 *
 *    ⚠ DESDE EL 2026-08-07 LAS TRES FILAS DICEN `false`, así que este freno corta SIEMPRE y
 *    la redirección no ocurre nunca. No es código muerto: es un interruptor. Antes se leía
 *    `canBeSiblingOf`, que ataba dos decisiones distintas —quién factura y de quién es el
 *    documento— y le quitaba al hermano menor no solo su handoff sino también las FASES de su
 *    cronograma, que las escribe el mismo agente. Si algún día dos documentos del mismo trato
 *    empiezan a contradecirse, la vuelta atrás es poner `true` en esa celda: este archivo, el
 *    veto y sus cuatro guardas siguen enteros.
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
  if (!def?.handoffDelHermano) return propio;

  return { ownerProjectId: facts.hermanoCsProjectId, redirigido: true };
}

/**
 * ── LA NOTA POR DEFECTO: «ESTE PROYECTO NO ES LA IMPLEMENTACIÓN» ─────────────
 *
 * Un Desarrollo o Sitio web comparte cliente con una Implementación de HubSpot, así que sus
 * reuniones se mezclan en la MISMA línea de tiempo de la empresa. Sin esta nota, la IA vuelve
 * a redactar el alcance de la Implementación adentro del documento del otro proyecto.
 *
 * ⚠ ESTA NOTA ES LA COMPENSACIÓN DE UNA DECISIÓN DE NEGOCIO, Y CONVIENE SABERLO. Elías eligió
 * el 2026-08-06 que el hermano menor vea TODO el material y no un subconjunto filtrado. Medido
 * sobre el «Conector SAAS posventa» de Spectrum: **22 de 22** registros de HubSpot que
 * alimentarían su handoff son de la implementación (kickoff, sesiones semanales de Marketing y
 * Sales, llamadas de venta) y ninguno menciona el conector. El repo ya documentó el caso gemelo
 * y su lección —«filtrar datos, no rogarle al modelo»— tras un incidente en el que el deal del
 * vecino era un dato tan fuerte que ninguna instrucción de exclusión podía contra él.
 *
 * Por eso la nota NOMBRA al hermano mayor en vez de ser genérica: una exclusión con nombre
 * propio pesa mucho más que «ignorá la implementación». Y por eso el prompt por tipo (T3) es la
 * palanca de verdad — un agente que es consultor de desarrollo no produce fases de adopción de
 * hubs. Si al leer los documentos generados hablan de la implementación, la decisión se revisa:
 * el filtro estructural queda a un `if` de distancia porque las fuentes ya están separadas.
 *
 * Es un VALOR POR DEFECTO, no una regla: se escribe una vez al nacer el handoff y cualquier CSE
 * la edita o la borra desde la pestaña Contexto como toda `contextExclusions`. No toca
 * `duenioDelHandoff` ni el veto.
 */
export const EXCLUSION_IMPLEMENTACION_HUBSPOT = "Ignora todo lo relacionado a la implementación de HubSpot.";

/** La versión con nombre propio, que es la que de verdad pesa. */
export function exclusionNombrada(nombreDelHermanoMayor: string, nombreDelProyecto?: string | null): string {
  const foco = nombreDelProyecto
    ? ` Este proyecto es ÚNICAMENTE «${nombreDelProyecto}»: escribí solo sobre su alcance.`
    : "";
  return (
    `Ignora todo lo relacionado a «${nombreDelHermanoMayor}» —su implementación de HubSpot, ` +
    `su kickoff, sus sesiones de seguimiento y su alcance vendido—, aunque aparezca en las ` +
    `reuniones y en el historial del cliente.${foco}`
  );
}

/**
 * PURA. Solo aplica a lo que acompaña a una Implementación (Desarrollo, Sitios web) — reusa
 * `canBeSiblingOf`, la misma tabla que declara esa relación, para no duplicar "cuáles son los
 * pipelines que acompañan a una Implementación" en un segundo lugar. Una Implementación de
 * HubSpot nunca se excluye a sí misma.
 *
 * Dos formas de la misma nota, y el orden importa:
 *
 *  1. **Cuelga de un hermano mayor concreto** → la nota lo NOMBRA. Es el caso fuerte y el que
 *     motivó la Tanda F.
 *  2. **No cuelga de nadie, pero la empresa tiene (o tuvo) una Implementación** → la nota
 *     genérica. Es el caso de los 17 proyectos «Integración con X» del 2026-08-06: comparten
 *     cliente con una Implementación sin estar asociados a ella en HubSpot.
 */
export function contextExclusionesPorDefecto(input: {
  hubspotPipelineId: string | null;
  /** Nombre del hermano mayor del que cuelga, si cuelga. Es lo que vuelve nombrada la nota. */
  nombreDelHermanoMayor?: string | null;
  /** Nombre de ESTE proyecto, para cerrar la nota con el foco. */
  nombreDelProyecto?: string | null;
  /** ¿La empresa tiene, o tuvo, una Implementación de HubSpot aparte? */
  tieneImplementacionHubSpot: boolean;
}): string | null {
  const def = resolvePipeline(input.hubspotPipelineId);
  if (!def?.canBeSiblingOf.includes("customer-success")) return null;
  if (input.nombreDelHermanoMayor) {
    return exclusionNombrada(input.nombreDelHermanoMayor, input.nombreDelProyecto);
  }
  if (!input.tieneImplementacionHubSpot) return null;
  return EXCLUSION_IMPLEMENTACION_HUBSPOT;
}

/**
 * PURA. Junta la exclusión que pone LA APP con las que escribió el CSE.
 *
 * ── POR QUÉ SE COMPONE EN LECTURA Y NO SE GUARDA (decisión de Elías, 2026-08-08) ──
 * Hasta hoy la nota del sistema se ESCRIBÍA una sola vez, en el instante en que nacía la entidad
 * `Handoff`, y nunca más. Eso tenía tres agujeros que se descubrieron midiendo:
 *
 *  1. **«Regenerar» la borraba.** El textarea de la pantalla se sembraba una única vez —cuando el
 *     handoff todavía no existía, o sea vacío— y no se volvía a sembrar nunca. Al regenerar, la
 *     pantalla veía «vacío ≠ la nota guardada», lo interpretaba como «el CSE la borró» y mandaba
 *     un PATCH a null. La segunda corrida —justo la que uno hace porque el documento no le gustó—
 *     salía SIN exclusiones, y la nota quedaba destruida para siempre.
 *  2. **Cinco puertas crean un `Handoff` y solo dos escribían la nota** (el asistente viejo, el
 *     upsert del PATCH, el de excluir engagements, un script de migración).
 *  3. Un handoff nacido antes de todo esto se quedaba sin exclusión **para siempre**: nada la
 *     reponía.
 *
 * Componiendo en lectura, los tres desaparecen a la vez y sin migración: la exclusión del sistema
 * se RECALCULA en cada corrida, así que no se puede borrar, no depende de quién creó la fila, y
 * un handoff viejo la recibe igual. `Handoff.contextExclusions` pasa a significar una sola cosa:
 * **lo que escribió el CSE**.
 *
 * ⚠ La deduplicación no es cosmética: hay handoffs con la nota YA persistida (los que nacieron
 * entre la Tanda F y hoy). Sin el `includes`, esos verían la misma frase dos veces.
 */
export function componerExclusiones(
  delSistema: string | null | undefined,
  delCse: string | null | undefined,
): string | null {
  const sis = delSistema?.trim() || null;
  const cse = delCse?.trim() || null;
  if (!sis) return cse;
  if (!cse) return sis;
  if (cse.includes(sis)) return cse;
  return `${sis}\n${cse}`;
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

/**
 * La exclusión que pone LA APP para este proyecto, resuelta contra la base. Un solo lugar, para
 * que la generación y la pantalla no puedan mostrar cosas distintas.
 *
 * `null` cuando no corresponde (una Implementación de HubSpot, un pipeline sin declarar, o un
 * Desarrollo/Sitio de una empresa que nunca tuvo implementación).
 */
export async function exclusionDelSistema(projectId: string): Promise<string | null> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, clientId: true, hubspotPipelineId: true, hermanoCsProjectId: true },
  });
  if (!p) return null;

  const def = resolvePipeline(p.hubspotPipelineId);
  // Corte temprano: una Implementación nunca se excluye a sí misma, y sin este `return` la
  // consulta de abajo se pagaría para los ~100 proyectos de Customer Success.
  if (!def?.canBeSiblingOf.includes("customer-success")) return null;

  const hermanoMayor = p.hermanoCsProjectId
    ? await prisma.project.findUnique({
        where: { id: p.hermanoCsProjectId },
        select: { name: true },
      })
    : null;

  return contextExclusionesPorDefecto({
    hubspotPipelineId: p.hubspotPipelineId,
    nombreDelHermanoMayor: hermanoMayor?.name ?? null,
    nombreDelProyecto: p.name,
    // Solo se paga si NO cuelga de nadie: con hermano, la nota nombrada ya está decidida.
    tieneImplementacionHubSpot: hermanoMayor
      ? true
      : await tieneOTuvoImplementacionHubSpot(p.clientId, projectId),
  });
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
