/**
 * lib/lifecycle/load.ts
 *
 * Loader Prisma del ciclo de vida: junta las señales (proyecto + gates + snapshot
 * Partner + umbral UUS) en BATCH (sin N+1 — lo consume lib/portfolio/load.ts para
 * toda la cartera) y computa la etapa con el motor puro (stage-engine.ts).
 *
 * `getProjectLifecycle(projectId)` es el export que consume todo Nexus (watchdog,
 * account-brief, Cobranza v1 lectura) — siempre vía lib/lifecycle/index.ts.
 */
import { cache } from "react";
import type { ProjectLifecycleStage, ProjectStageGateKey } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { KICKOFF_TITLE_FILTERS, pickKickoffSessionDate } from "@/lib/sessions/kickoff-pick";
import { RECURRENTE_TAG } from "@/lib/tags/catalog";
import {
  buscarEtapa,
  fuenteDelCiclo,
  hechosDeProyecto,
  lineaDeAvance,
  type PipelineStage,
  type ProjectPipelineKey,
} from "@/lib/projects/kind";
import {
  inferLifecycleStage,
  resolveLifecycleStage,
  resolveLifecycleCycle,
  suggestAdoptionMode,
  stagePosition,
  STAGE_LABEL_ES,
  type AdoptionMode,
  type LifecycleCycle,
} from "./stage-engine";

/** Lo que todo proyecto tiene, mande su etapa quien la mande. */
interface LifecycleComun {
  projectId: string;
  /** Rótulo de la etapa actual, EN EL VOCABULARIO DE SU FUENTE. */
  label: string;
  /** El servicio es recurrente/de continuidad (tag `recurrente`) — ciclo corto. */
  recurrent: boolean;
  /** hubspotCreatedAt ?? createdAt — "edad" del proyecto para alarmas tempranas. */
  projectCreatedAt: Date;
  isSuccessCase: boolean;
}

/**
 * La rama de Customer Success: el ciclo de 8 etapas de Nexus, con sus compuertas. Es todo
 * lo que existía antes de la tanda de multi-pipeline, sin un solo campo de menos.
 */
export interface LifecycleCs extends LifecycleComun {
  fuente: "customer-success";
  cycle: LifecycleCycle;
  /** El handoff CORRIÓ y clasificó este proyecto (Project.handoffGeneratedAt != null).
   *  Compuerta: sin esto el portal CS muestra un aviso en vez de etapas. */
  defined: boolean;
  /** Etapa EFECTIVA (override del CSE ?? inferida). */
  effective: ProjectLifecycleStage;
  source: "override" | "inferred";
  inferred: ProjectLifecycleStage;
  /** Por qué (cumplido + pendiente), en español legible. */
  reasons: string[];
  position: { index: number; total: number };
  override: {
    stage: ProjectLifecycleStage;
    reason: string | null;
    at: Date | null;
    by: string | null;
  } | null;
  gates: Array<{
    gate: ProjectStageGateKey;
    markedAt: Date;
    markedBy: string | null;
    source: string;
    note: string | null;
  }>;
  kickoffPublishedAt: Date | null;
  /** Fecha de la sesión de Kick Off real (pickKickoffSessionDate), si hay. */
  kickoffSessionAt: Date | null;
  /** Fecha del gate CRONOGRAMA_CONSENSUADO (insumo de las alarmas por etapa). */
  cronogramaConsensuadoAt: Date | null;
  adoptionMode: {
    confirmed: AdoptionMode | null;
    suggested: AdoptionMode | null;
    confirmedAt: Date | null;
    confirmedBy: string | null;
  };
  uus: { score: number | null; threshold: number };
}

/**
 * La rama de pipeline: la etapa la mueve el equipo EN HUBSPOT y Nexus la espeja. No hay
 * compuertas que marcar ni override que fijar — no porque falte implementarlo, sino porque
 * no hay nada acá que curar: el dato vive del otro lado.
 */
export interface LifecyclePipeline extends LifecycleComun {
  fuente: "pipeline";
  pipeline: { key: ProjectPipelineKey; label: string };
  /** La etapa según la tabla. `null` si Nexus no vio ninguna, o si HubSpot la movió a una
   *  que `PROJECT_PIPELINES` no declara (entonces `label` cae al rótulo materializado). */
  etapa: PipelineStage | null;
  /** El id crudo materializado por el sync — para diagnosticar el caso "no declarada". */
  stageId: string | null;
  stageSyncedAt: Date | null;
  /** Las etapas EN LÍNEA de su pipeline, en orden — el stepper. */
  linea: readonly PipelineStage[];
  /** Posición en la línea. `null` si la etapa está FUERA de ella (Cancelado) o se desconoce. */
  position: { index: number; total: number } | null;
}

/**
 * ⚠ UNIÓN DISCRIMINADA, y eso es el punto.
 *
 * Las alternativas eran peores: MAPEAR "Pruebas" de Development a `CONFIGURACION_TECNICA`
 * inventa una equivalencia entre dos metodologías (lo mismo que `regenerate-progress.ts` ya
 * se negó a hacer), y RELLENAR con `HAND_OFF` + `gates: []` es una mentira que compila.
 *
 * Así, TypeScript enumera los consumidores: nadie puede leer `gates` en una rama que no los
 * tiene sin que el compilador lo diga.
 */
export type ProjectLifecycle = LifecycleCs | LifecyclePipeline;

/** Suma de seats.limit de todos los hubs del snapshot Partner ({ core|sales|…: {limit} }). */
function seatsTotalFrom(seats: unknown): number | null {
  if (!seats || typeof seats !== "object") return null;
  let total = 0;
  let found = false;
  for (const v of Object.values(seats as Record<string, unknown>)) {
    if (v && typeof v === "object" && typeof (v as { limit?: unknown }).limit === "number") {
      total += (v as { limit: number }).limit;
      found = true;
    }
  }
  return found ? total : null;
}

function asAdoptionMode(v: string | null): AdoptionMode | null {
  return v === "directa" || v === "por_pilotos" ? v : null;
}

/**
 * Batch: 1 query proyectos + 1 gates + 1 snapshots Partner + 1 settings →
 * Map<projectId, ProjectLifecycle>. Proyectos inexistentes no aparecen en el Map.
 *
 * PERF: memoizado INTRA-REQUEST con React cache() — /timeline (y cualquier página
 * que compone summary + lifecycle) lo dispara más de una vez por render con los
 * mismos ids; ahora la segunda llamada es gratis. cache() memoiza por identidad
 * de argumentos, y el array llega como referencia NUEVA cada vez → la clave real
 * es el string canónico (ids únicos ordenados). Fuera de un render RSC no dedupea
 * (cada llamada es un scope nuevo) — comportamiento idéntico al de antes.
 */
export async function loadLifecycleBatch(
  projectIds: string[],
): Promise<Map<string, ProjectLifecycle>> {
  const key = [...new Set(projectIds)].sort().join(",");
  return loadLifecycleBatchByKey(key);
}

const loadLifecycleBatchByKey = cache(async (key: string) => {
  return loadLifecycleBatchUncached(key === "" ? [] : key.split(","));
});

async function loadLifecycleBatchUncached(
  projectIds: string[],
): Promise<Map<string, ProjectLifecycle>> {
  const out = new Map<string, ProjectLifecycle>();
  if (projectIds.length === 0) return out;

  const [projects, gates, settings, kickoffLinks] = await Promise.all([
    prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: {
        id: true,
        name: true,
        status: true,
        clientId: true,
        createdAt: true,
        hubspotCreatedAt: true,
        kickoffPublishedAt: true,
        handoffGeneratedAt: true,
        tags: true,
        lifecycleCycle: true,
        lifecycleStageOverride: true,
        lifecycleStageOverrideReason: true,
        lifecycleStageOverrideAt: true,
        lifecycleStageOverrideBy: true,
        adoptionMode: true,
        adoptionModeConfirmedAt: true,
        adoptionModeConfirmedBy: true,
        isSuccessCase: true,
        // De qué CLASE es el proyecto (lib/projects/kind.ts). Mismo row, cero queries
        // nuevas. Decide si este proyecto CORRE el ciclo de 8 etapas de Customer Success
        // o si su etapa la manda su pipeline de HubSpot.
        hubspotPipelineId: true,
        proyectoInterno: true,
        hermanoCsProjectId: true,
        altaEstado: true,
        // La etapa de HubSpot, YA materializada por el sync. Mismo row otra vez: la rama
        // de pipeline no cuesta una sola query más que la de Customer Success.
        hubspotPipelineStageId: true,
        hubspotPipelineStageLabel: true,
        hubspotStageSyncedAt: true,
      },
    }),
    prisma.projectStageGate.findMany({
      where: { projectId: { in: projectIds } },
      select: { projectId: true, gate: true, markedAt: true, markedBy: true, source: true, note: true },
    }),
    prisma.csSettings.findUnique({ where: { id: "cs" }, select: { uusValidationThreshold: true } }),
    /* Sesiones tituladas kickoff (señal alternativa de salida de HAND_OFF para
       proyectos previos al botón "Publicar kickoff").
       ⚠ Solo las que YA OCURRIERON: un kickoff AGENDADO para la semana que viene sacaba
       al proyecto de HAND_OFF hoy — la etapa del ciclo de vida decía que ya pasó algo que
       todavía no pasó. Ver `lib/sessions/ocurridas.ts`. */
    prisma.sessionProject.findMany({
      where: {
        projectId: { in: projectIds },
        included: true,
        session: { AND: [{ OR: KICKOFF_TITLE_FILTERS }, { date: { lte: new Date() } }] },
      },
      select: { projectId: true, session: { select: { date: true } } },
    }),
  ]);

  const clientIds = [...new Set(projects.map((p) => p.clientId))];
  const snapshots = clientIds.length
    ? await prisma.clientPartnerSnapshot.findMany({
        where: { clientId: { in: clientIds } },
        select: { clientId: true, uusScore: true, seats: true, marketingContactsLimit: true },
      })
    : [];
  const snapshotByClient = new Map(snapshots.map((s) => [s.clientId as string, s]));
  const uusThreshold = settings?.uusValidationThreshold ?? 60;

  const gatesByProject = new Map<string, typeof gates>();
  for (const g of gates) {
    const list = gatesByProject.get(g.projectId) ?? [];
    list.push(g);
    gatesByProject.set(g.projectId, list);
  }

  const kickoffDatesByProject = new Map<string, Date[]>();
  for (const l of kickoffLinks) {
    const list = kickoffDatesByProject.get(l.projectId) ?? [];
    list.push(l.session.date);
    kickoffDatesByProject.set(l.projectId, list);
  }

  for (const p of projects) {
    const comun = {
      projectId: p.id,
      recurrent: p.tags.includes(RECURRENTE_TAG),
      projectCreatedAt: p.hubspotCreatedAt ?? p.createdAt,
      isSuccessCase: p.isSuccessCase,
    };

    /* ── ¿Quién manda la etapa de este proyecto? ────────────────────────────
       Un desarrollo o un sitio web NO corre el ciclo de 8 etapas de Customer Success: su
       metodología es la de su propio pipeline, y la mueve el equipo en HubSpot. Todo lo
       de abajo —compuertas, override, modalidad de adopción, UUS— es vocabulario de CS y
       no le aplica; forzárselo sería inventarle una equivalencia. */
    const fuente = fuenteDelCiclo(hechosDeProyecto(p));

    if (fuente.tipo === "pipeline") {
      const def = fuente.pipeline;
      const etapa = buscarEtapa(def, p.hubspotPipelineStageId);
      const linea = lineaDeAvance(def);
      const idx = etapa ? linea.findIndex((s) => s.id === etapa.id) : -1;
      out.set(p.id, {
        ...comun,
        fuente: "pipeline",
        pipeline: { key: def.key, label: def.label },
        etapa,
        stageId: p.hubspotPipelineStageId,
        stageSyncedAt: p.hubspotStageSyncedAt,
        linea,
        // Fuera de línea (Cancelado, Bloqueado) → sin posición: un "Etapa 8/7" o un
        // "Cancelado" contado como avance dicen algo que no es.
        position: idx >= 0 ? { index: idx + 1, total: linea.length } : null,
        /* El rótulo cae al que materializó el sync antes que a "sin etapa": si alguien
           agrega una etapa en el portal y nadie la transcribe en la tabla, se ve el nombre
           real de HubSpot en vez de un hueco. */
        label: etapa?.label ?? p.hubspotPipelineStageLabel ?? "Sin etapa en HubSpot",
      });
      continue;
    }

    const projectGates = gatesByProject.get(p.id) ?? [];
    const gateDates: Partial<Record<ProjectStageGateKey, Date>> = {};
    for (const g of projectGates) gateDates[g.gate] = g.markedAt;

    const snapshot = p.clientId ? snapshotByClient.get(p.clientId) : undefined;
    const cycle = resolveLifecycleCycle({ lifecycleCycle: p.lifecycleCycle, tags: p.tags });
    const kickoffSessionAt = pickKickoffSessionDate(
      kickoffDatesByProject.get(p.id) ?? [],
      p.hubspotCreatedAt ?? p.createdAt,
    );

    const inferred = inferLifecycleStage({
      cycle,
      projectStatus: p.status,
      kickoffPublishedAt: p.kickoffPublishedAt,
      kickoffSessionAt,
      gates: gateDates,
      uusScore: snapshot?.uusScore ?? null,
      uusThreshold,
    });
    const { effective, source } = resolveLifecycleStage(inferred, p.lifecycleStageOverride);

    out.set(p.id, {
      ...comun,
      fuente: "customer-success",
      cycle,
      defined: p.handoffGeneratedAt != null,
      effective,
      source,
      inferred: inferred.stage,
      reasons: inferred.reasons,
      label: STAGE_LABEL_ES[effective],
      position: stagePosition(effective, cycle),
      override: p.lifecycleStageOverride
        ? {
            stage: p.lifecycleStageOverride,
            reason: p.lifecycleStageOverrideReason,
            at: p.lifecycleStageOverrideAt,
            by: p.lifecycleStageOverrideBy,
          }
        : null,
      gates: projectGates.map(({ gate, markedAt, markedBy, source: gateSource, note }) => ({
        gate,
        markedAt,
        markedBy,
        source: gateSource,
        note,
      })),
      kickoffPublishedAt: p.kickoffPublishedAt,
      kickoffSessionAt,
      cronogramaConsensuadoAt: gateDates.CRONOGRAMA_CONSENSUADO ?? null,
      adoptionMode: {
        confirmed: asAdoptionMode(p.adoptionMode),
        suggested: suggestAdoptionMode({
          seatsTotal: seatsTotalFrom(snapshot?.seats),
          marketingContactsLimit: snapshot?.marketingContactsLimit ?? null,
        }),
        confirmedAt: p.adoptionModeConfirmedAt,
        confirmedBy: p.adoptionModeConfirmedBy,
      },
      uus: { score: snapshot?.uusScore ?? null, threshold: uusThreshold },
    });
  }
  return out;
}

/**
 * Materializa perezosamente el gate USO_VALIDADO con `source: "system"` cuando el UUS lo
 * cumple y nadie lo marcó. Best-effort: el motor ya lo da por cumplido sin la fila — la fila
 * deja el EVENTO durable aunque el puntaje baje después.
 *
 * ── DOS COSAS QUE HAY QUE SABER ──────────────────────────────────────────────
 *
 * 1. **Solo para proyectos que corren el ciclo de Customer Success.** `USO_VALIDADO` es una
 *    compuerta de ESA metodología, y el puntaje que la dispara es del CLIENTE, no del
 *    proyecto. Sin este filtro, un desarrollo de un cliente sano acumulaba compuertas de CS
 *    con solo abrir su pestaña — el panel de ciclo de vida se monta para todo proyecto y
 *    hace fetch al endpoint que llama a esta función. Y esa fila lo volvía **no borrable**
 *    por `scripts/limpiar-piezas-basura.ts`, que se niega ante "etapas marcadas".
 *
 *    El freno `effective !== "HAND_OFF"` no alcanzaba: el clasificador de sesiones incluye a
 *    los desarrollos a propósito, así que la sesión de kickoff del cliente puede quedar
 *    linkeada al desarrollo y sacarlo de esa etapa.
 *
 * 2. **Es una ESCRITURA disparada por una LECTURA**, y eso es un smell conocido. El lugar
 *    correcto es donde se escribe el puntaje (`lib/cs/partner-sync.ts`), porque el evento
 *    real es "el puntaje cruzó el umbral". Mudarla necesita un backfill —los que ya cruzaron
 *    y nadie leyó nunca materializaron la fila—, así que es su propia tanda. Mientras tanto
 *    vive acá pero con nombre propio: una función con verbo se ve en un diff, un bloque
 *    suelto adentro de un getter no.
 */
async function materializarUsoValidado(
  projectId: string,
  lifecycle: ProjectLifecycle,
): Promise<void> {
  if (lifecycle.fuente !== "customer-success") return;
  const uusPasses = lifecycle.uus.score != null && lifecycle.uus.score >= lifecycle.uus.threshold;
  const hasGate = lifecycle.gates.some((g) => g.gate === "USO_VALIDADO");
  if (!uusPasses || hasGate || lifecycle.effective === "HAND_OFF") return;

  try {
    await prisma.projectStageGate.upsert({
      where: { projectId_gate: { projectId, gate: "USO_VALIDADO" } },
      create: {
        projectId,
        gate: "USO_VALIDADO",
        source: "system",
        evidence: { uusScore: lifecycle.uus.score, threshold: lifecycle.uus.threshold },
      },
      update: {},
    });
  } catch (e) {
    // Solo durabilidad del evento — la etapa ya salió bien sin la fila.
    console.error("[lifecycle] no se pudo materializar USO_VALIDADO:", e);
  }
}

/** Ciclo de vida de UN proyecto (null si no existe). */
export async function getProjectLifecycle(projectId: string): Promise<ProjectLifecycle | null> {
  const lifecycle = (await loadLifecycleBatch([projectId])).get(projectId) ?? null;
  if (!lifecycle) return null;

  await materializarUsoValidado(projectId, lifecycle);
  return lifecycle;
}
