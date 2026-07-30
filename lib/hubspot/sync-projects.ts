import { getHubspotClient, getSystemHubspotClient } from "./client";
import { prisma } from "@/lib/db/prisma";
import { createDefaultCanvases } from "@/lib/canvas/default-canvases";
import { sanitizeTags, normalizeTag } from "@/lib/tags/catalog";
import { cerradoPorEstadoCrudo, decidirCierre, resolvePipeline } from "@/lib/projects/kind";
import type { Client } from "@hubspot/api-client";

// ── Mapeo de nombre del proyecto → serviceType + projectType ─────────────────

interface ServiceMapping {
  serviceType: string | null;
  projectType: "USE_CASE" | "BASE_IMPLEMENTATION";
  hubTag: string | null;
}

const SERVICE_MAP: Record<string, ServiceMapping> = {
  "Loop Marketing Transformation": { serviceType: "loop_marketing", projectType: "USE_CASE", hubTag: "Marketing Hub" },
  "Loop Sales Transformation": { serviceType: "loop_sales", projectType: "USE_CASE", hubTag: "Sales Hub" },
  "Loop Service Transformation": { serviceType: "loop_service", projectType: "USE_CASE", hubTag: "Service Hub" },
  "Implementación de Marketing Hub": { serviceType: "loop_marketing", projectType: "BASE_IMPLEMENTATION", hubTag: "Marketing Hub" },
  "Implementación de Sales Hub": { serviceType: "loop_sales", projectType: "BASE_IMPLEMENTATION", hubTag: "Sales Hub" },
  "Implementación de Service Hub": { serviceType: "loop_service", projectType: "BASE_IMPLEMENTATION", hubTag: "Service Hub" },
  "Implementación de Data Hub": { serviceType: null, projectType: "BASE_IMPLEMENTATION", hubTag: null },
  "Signals Based Marketing": { serviceType: "loop_marketing", projectType: "USE_CASE", hubTag: "Marketing Hub" },
};

/**
 * Tags del proyecto tras el sync: ADITIVO, nunca destructivo.
 *
 * ⚠ Antes esto era `tags: hubTag ? [hubTag] : []` — un REEMPLAZO derivado solo del nombre
 * del servicio en HubSpot. Como `inferServiceMapping` devuelve `hubTag: null` para todo
 * nombre fuera de su catálogo de 8 plantillas, cualquier proyecto con nombre libre
 * ("Wherex - Nuevo tipo de objeto Deal") quedaba con `tags: []` en CADA sync — borrando lo
 * que el agente de handoff clasificó Y lo que el CSE agregó a mano en la tira. Como el sync
 * corre al entrar al cliente (cooldown 10 min), los tags "se perdían solos" cada tanto.
 *
 * La política ahora es la MISMA que la de `analyze` (persistTimelineFromAgentOutput): unir,
 * no reemplazar. El sync solo puede SUMAR su tag derivado.
 *
 * Trade-off aceptado: si en HubSpot cambian el servicio de "Marketing Hub" a "Sales Hub",
 * el proyecto queda con los dos y el CSE quita el que sobra. Es preferible a que un dato
 * curado desaparezca sin aviso — retirar un tag es una decisión humana, no un efecto
 * secundario de abrir una pantalla.
 */
export function mergeHubTag(currentTags: string[], hubTag: string | null): string[] {
  const next = sanitizeTags(currentTags); // normaliza labels legacy → slugs
  // `hubTag` viene como LABEL ("Marketing Hub"); se guarda como SLUG canónico.
  const slug = hubTag ? normalizeTag(hubTag) : null;
  if (slug && !next.includes(slug)) next.push(slug);
  return next;
}

/**
 * UNA LÍNEA POR CAMBIO DE ESTADO. No es opcional.
 *
 * Este archivo pasó de 862 líneas con CERO logs a decidir el cierre de un proyecto con una
 * regla nueva, y el cierre es el único paso del sync que pierde información: apagar un
 * proyecto no guarda el valor anterior, así que revertir el código no lo reenciende. Sin
 * este rastro, "¿por qué desapareció el proyecto de Fulano?" no tiene respuesta.
 *
 * Va a `console.log` y no a `result.debug` a propósito: `debug` se le devuelve a quien
 * disparó el sync y muere con la respuesta HTTP; esto tiene que quedar en el log del
 * contenedor, que es donde se mira una semana después.
 */
function logTransicion(o: {
  project: string;
  de: string;
  a: string;
  pipelineId: string | null;
  stageId: string | null;
  stageLabel: string | null;
  rawStatus: string;
  motivo: string;
}): void {
  const pipe = resolvePipeline(o.pipelineId);
  console.log(
    `[sync-projects] ${o.de} → ${o.a}  "${o.project}"  ` +
      `pipeline=${pipe ? pipe.label : o.pipelineId ?? "(ninguno)"}  ` +
      `etapa=${o.stageLabel ?? o.stageId ?? "(ninguna)"}  ` +
      `estadoCrudo=${o.rawStatus || "(vacío)"}  motivo=${o.motivo}`,
  );
}

/**
 * Un `booleancheckbox` de HubSpot. Sin marcar llega como `null`, como `""` o directamente
 * ausente de la respuesta — nunca como `"false"` hasta que alguien lo marca y lo desmarca.
 * Los tres casos son "no", que es el default de negocio.
 */
function parseCheckbox(v: string | null | undefined): boolean {
  return (v ?? "").trim().toLowerCase() === "true";
}

function inferServiceMapping(projectName: string | null): ServiceMapping {
  if (!projectName) return { serviceType: "proyecto_temporal", projectType: "USE_CASE", hubTag: null };

  if (SERVICE_MAP[projectName]) return SERVICE_MAP[projectName];

  const lower = projectName.toLowerCase();
  if (lower.includes("marketing")) return { serviceType: "loop_marketing", projectType: lower.includes("implementa") ? "BASE_IMPLEMENTATION" : "USE_CASE", hubTag: "Marketing Hub" };
  if (lower.includes("sales") || lower.includes("ventas")) return { serviceType: "loop_sales", projectType: lower.includes("implementa") ? "BASE_IMPLEMENTATION" : "USE_CASE", hubTag: "Sales Hub" };
  if (lower.includes("service") || lower.includes("servicio")) return { serviceType: "loop_service", projectType: lower.includes("implementa") ? "BASE_IMPLEMENTATION" : "USE_CASE", hubTag: "Service Hub" };

  return { serviceType: "proyecto_temporal", projectType: "USE_CASE", hubTag: null };
}

// ── Propiedades a leer del objeto Proyectos de HubSpot ──────────────────────
const PROJECT_PROPERTIES = [
  "hs_name",
  "hs_status",
  "hs_object_id",
  "nombre_del_proyecto",
  "servicio_contratado",
  "estatus_del_proyecto",
  "tipo_de_servicio",
  "account_manager",
  // Para meta info del proyecto que se muestra en el GPS
  "hubspot_owner_id",
  "hs_createdate",
  "hs_pipeline",
  "hs_pipeline_stage",    // D.2: etapa actual del pipeline de CS (ancla del cronograma vivo)
  "proyecto_interno",     // booleancheckbox: proyecto de Smarteam para Smarteam (ver lib/projects/kind.ts)
  "csl_encargado",        // propiedad custom OWNER = CSE encargado (fuente de verdad de la asignación → visibilidad)
  // CS360 — dashboard de la CSL (internal names confirmados por discover-partner-clients.ts):
  "hs_priority",          // low | medium | high
  "motivo_de_bloqueo",    // enum radio 7 valores ("Cliente pidió pausa", "Atraso por Smarteam", …)
  "detalle_del_motivo_de_bloqueo", // texto libre "| Desarrollo"
  "detalle_del_motivo_de_bloqueo__implementaciones", // texto libre "| Implementaciones"
  "estado_de_adopcion",   // No iniciado | Bajo | Medio | Alto
];

// ── Slugs del objeto Proyectos ───────────────────────────────────────────────
// CANÓNICOS: "projects"/"PROJECT" son el objeto Proyectos estándar de HubSpot.
// FALLBACK numérico ("0-18"/"0-49"): guesses de ÚLTIMO recurso para portales donde
// el slug nombrado no existe. Peligrosos si matchean OTRO objeto (p.ej. en este
// portal "0-49" devuelve 28 objetos que NO son proyectos), así que SOLO se usan
// cuando no pudimos identificar el objeto Proyectos ni por slug nombrado ni por schema.
const NAMED_PROJECT_SLUGS = ["projects", "PROJECT"];
const FALLBACK_PROJECT_SLUGS = ["0-18", "0-49"];
const ASSOCIATION_SLUGS = [...NAMED_PROJECT_SLUGS, ...FALLBACK_PROJECT_SLUGS]; // para mensajes
const READ_SLUGS = ["projects", "PROJECT", "0-18", "0-49"];

/**
 * Ids de los records "projects" (0-970) asociados a una company en HubSpot.
 * Versión LIVIANA para lecturas (el stepper de handoff lista los proyectos de una
 * company) contra el portal SISTEMA, donde el objeto Proyectos es conocido. Prueba los
 * slugs nombrados y el tipo 0-970; NO usa los fallbacks numéricos peligrosos (0-18/0-49)
 * ni el schema-discovery del sync completo — `syncProjectsForClient` mantiene esa
 * robustez para portales de clientes arbitrarios.
 */
export async function resolveCompanyProjectIds(hs: Client, companyId: string): Promise<string[]> {
  for (const slug of [...NAMED_PROJECT_SLUGS, "0-970"]) {
    try {
      const res = await hs.apiRequest({
        method: "GET",
        path: `/crm/v4/objects/companies/${companyId}/associations/${slug}`,
      });
      if (res.ok) {
        const data = (await res.json()) as { results?: Array<{ toObjectId: number }> };
        const ids = (data.results ?? []).map((r) => String(r.toObjectId));
        if (ids.length > 0) return ids;
      }
    } catch {
      /* probar el siguiente slug */
    }
  }
  return [];
}

// ── Helpers para resolver owner y pipeline ──────────────────────────────────

// Cache en memoria por proceso para evitar fetches repetidos durante un sync
const ownerCache = new Map<string, { name: string | null; email: string | null }>();
const pipelineNameCache = new Map<string, string | null>();
// D.2 — cache de las etapas de un pipeline (slug:pipelineId → Map<stageId,label>).
const pipelineStagesCache = new Map<string, Map<string, string>>();

async function resolveOwner(
  hs: Client,
  ownerId: string | null | undefined,
): Promise<{ name: string | null; email: string | null }> {
  if (!ownerId) return { name: null, email: null };
  if (ownerCache.has(ownerId)) return ownerCache.get(ownerId)!;
  try {
    const res = await hs.apiRequest({
      method: "GET",
      path: `/crm/v3/owners/${ownerId}`,
    });
    const data = (await res.json()) as {
      firstName?: string;
      lastName?: string;
      email?: string;
      id?: string;
    };
    const name = [data.firstName, data.lastName].filter(Boolean).join(" ").trim() || null;
    const result = { name, email: data.email ?? null };
    ownerCache.set(ownerId, result);
    return result;
  } catch {
    const result = { name: null, email: null };
    ownerCache.set(ownerId, result);
    return result;
  }
}

async function resolvePipelineName(
  hs: Client,
  pipelineId: string | null | undefined,
  workingSlug: string,
): Promise<string | null> {
  if (!pipelineId) return null;
  const cacheKey = `${workingSlug}:${pipelineId}`;
  if (pipelineNameCache.has(cacheKey)) return pipelineNameCache.get(cacheKey)!;
  try {
    const res = await hs.apiRequest({
      method: "GET",
      path: `/crm/v3/pipelines/${workingSlug}/${pipelineId}`,
    });
    const data = (await res.json()) as { label?: string };
    const label = data.label ?? null;
    pipelineNameCache.set(cacheKey, label);
    return label;
  } catch {
    pipelineNameCache.set(cacheKey, null);
    return null;
  }
}

// D.2 — resuelve el label legible de una etapa (hs_pipeline_stage) del pipeline.
// Cachea TODAS las etapas del pipeline en una sola llamada (slug:pipelineId).
async function resolvePipelineStageLabel(
  hs: Client,
  pipelineId: string | null | undefined,
  stageId: string | null | undefined,
  workingSlug: string,
): Promise<string | null> {
  if (!pipelineId || !stageId) return null;
  const cacheKey = `${workingSlug}:${pipelineId}`;
  let stages = pipelineStagesCache.get(cacheKey);
  if (!stages) {
    stages = new Map<string, string>();
    try {
      const res = await hs.apiRequest({
        method: "GET",
        path: `/crm/v3/pipelines/${workingSlug}/${pipelineId}/stages`,
      });
      const data = (await res.json()) as { results?: Array<{ id: string; label: string }> };
      for (const s of data.results ?? []) stages.set(s.id, s.label);
    } catch {
      // cache vacío → no reintenta este pipeline en la corrida
    }
    pipelineStagesCache.set(cacheKey, stages);
  }
  return stages.get(stageId) ?? null;
}

// ── El HERMANO: asociación proyecto ↔ proyecto ───────────────────────────────

/**
 * Ids de proyectos asociados a cada proyecto, en UNA llamada por lote de 100.
 *
 * En HubSpot un desarrollo o un sitio se cuelga de la implementación de Customer Success
 * con la asociación por defecto del objeto consigo mismo (typeId 1254, confirmada por
 * `scripts/inspect-project-pipelines.ts`). Ese vínculo es lo que dice "no me factures
 * aparte: cobra el hermano".
 *
 * Lotes de 100 desde el minuto uno —el techo del endpoint— aunque el resto del sync todavía
 * pagine a mano: es una llamada nueva y no hay razón para nacer con la deuda.
 *
 * ── DEVUELVE `null` CUANDO NO SE PUDO LEER, Y ESO ES LO IMPORTANTE ───────────
 * Nunca tira: un hipo de la API no puede tumbar el sync entero. Pero tampoco puede devolver
 * un mapa vacío, porque "no hay asociaciones" y "no pude preguntar" **no son lo mismo** y el
 * que llama las trataba igual: escribía `hubspotRelatedProjectIds: []`, y después
 * `resolverHermanos` no encontraba nada y limpiaba `hermanoCsProjectId`.
 *
 * O sea: **un solo 429 desvinculaba a todos los hermanos de ese cliente y volvía facturables
 * a los desarrollos que cuelgan de una implementación.** Sin error, sin excepción, y
 * auto-sanándose en la corrida siguiente — que es justo lo que garantizaba que nunca se
 * diagnosticara.
 *
 * `null` = no preguntamos. El que llama OMITE el campo y deja el último valor bueno. Es el
 * mismo criterio que `anyTransient` aplica 500 líneas más arriba para no reconciliar con un
 * set incompleto: ante la duda, no tocar.
 */
async function leerProyectosAsociados(
  hsClient: Client,
  ids: string[],
  slug: string,
): Promise<Map<string, string[]> | null> {
  const out = new Map<string, string[]>();
  const LOTE = 100;
  for (let i = 0; i < ids.length; i += LOTE) {
    const tanda = ids.slice(i, i + LOTE);
    try {
      const res = await hsClient.apiRequest({
        method: "POST",
        path: `/crm/v4/associations/${slug}/${slug}/batch/read`,
        body: { inputs: tanda.map((id) => ({ id })) },
      });
      // Un lote que falla invalida la corrida ENTERA, no solo su tanda: con un mapa parcial
      // los proyectos de los lotes que sí respondieron se verían "sin hermano".
      if (!res.ok) return null;
      const data = (await res.json()) as {
        results?: Array<{ from?: { id?: string }; to?: Array<{ toObjectId?: number | string }> }>;
      };
      for (const r of data.results ?? []) {
        const desde = r.from?.id;
        if (!desde) continue;
        const hacia = (r.to ?? [])
          .map((t) => (t.toObjectId === undefined ? null : String(t.toObjectId)))
          .filter((v): v is string => !!v);
        if (hacia.length) out.set(desde, hacia);
      }
    } catch {
      return null;
    }
  }
  return out;
}

/**
 * Resuelve `hermanoCsProjectId` para TODOS los proyectos de un cliente, de una.
 *
 * Corre DESPUÉS del loop principal a propósito, y eso es lo que lo hace independiente del
 * orden: no importa si el desarrollo entró antes o después que su implementación, porque
 * cuando esta pasada corre los dos ya están en la base. Si el hermano todavía no existe, la
 * fila queda con el HECHO guardado (`hubspotRelatedProjectIds`) y sin resolución — y la
 * próxima corrida la completa sola. Por eso no hace falta un cron ni un barrido aparte.
 *
 * Se recalcula entero cada vez (mismo patrón que `hubspotPipelineStageLabel`): si en HubSpot
 * desasocian los proyectos, el vínculo se limpia solo y el desarrollo vuelve a facturarse.
 *
 * EXPORTADA porque el backfill también la necesita: después de cargar proyectos a mano en
 * HubSpot hay que poder resolver los vínculos de una, sin esperar a que alguien abra la ficha
 * de cada cliente. Entre "sé el pipeline" y "sé de quién cuelgo" hay una ventana en la que un
 * desarrollo hermano se ve FACTURABLE, y esa ventana es plata mal contada.
 *
 * `log` es opcional: el sync le pasa su `debug`, el backfill la consola. Devuelve cuántos
 * vínculos cambiaron.
 */
export async function resolverHermanos(
  clientId: string,
  log?: (mensaje: string) => void,
): Promise<number> {
  const delCliente = await prisma.project.findMany({
    where: { clientId, hubspotServiceId: { not: null } },
    select: {
      id: true,
      name: true,
      hubspotServiceId: true,
      hubspotPipelineId: true,
      hubspotRelatedProjectIds: true,
      hermanoCsProjectId: true,
    },
  });
  const porHsId = new Map(delCliente.map((p) => [p.hubspotServiceId!, p]));
  let cambios = 0;

  for (const p of delCliente) {
    const def = resolvePipeline(p.hubspotPipelineId);
    // Solo los pipelines que DECLARARON poder ser hermanos. Una implementación de CS nunca
    // es hermana de nadie: es de quien cuelgan los demás.
    const puedeSerHermano = def?.canBeSiblingOf.includes("customer-success") ?? false;

    let nuevo: string | null = null;
    if (puedeSerHermano) {
      for (const relId of p.hubspotRelatedProjectIds) {
        const otro = porHsId.get(relId);
        // Se resuelve SOLO dentro del mismo cliente. Un vínculo que cruza empresas sería un
        // error de datos en HubSpot, y dejarlo sin resolver (→ "aparte", o sea que se
        // factura) es el lado seguro de equivocarse.
        if (!otro || otro.id === p.id) continue;
        if (resolvePipeline(otro.hubspotPipelineId)?.key === "customer-success") {
          nuevo = otro.id;
          break;
        }
      }
    }

    if (nuevo !== p.hermanoCsProjectId) {
      await prisma.project.update({ where: { id: p.id }, data: { hermanoCsProjectId: nuevo } });
      cambios++;
      const nombreDelHermano = delCliente.find((o) => o.id === nuevo)?.name ?? nuevo;
      log?.(
        nuevo
          ? `Hermano: "${p.name}" cuelga de "${nombreDelHermano}" → no se factura aparte`
          : `Hermano: "${p.name}" ya no cuelga de ninguna implementación → vuelve a facturarse`,
      );
    }
  }
  return cambios;
}

// ── Sync principal ───────────────────────────────────────────────────────────

export interface SyncResult {
  found: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  debug?: string[];
}

/**
 * Verifica el estado REAL de un objeto proyecto en HubSpot antes de que la
 * reconciliación lo desactive. El set `projectIds` de asociaciones puede salir
 * mal (hipo de la API → fallback a un slug equivocado), así que NUNCA confiamos
 * solo en "no vino en la lista". Devuelve:
 *   - "alive":  el objeto existe y no está cerrado → NO desactivar.
 *   - "closed": existe pero en estado cerrado/terminado → desactivar.
 *   - "gone":   confirmado 404 (borrado/desasociado) → desactivar.
 * Ante CUALQUIER ambigüedad (timeout, scope, error transitorio) devuelve "alive"
 * (conservador): preferimos conservar un proyecto vivo que ocultarlo por error.
 */
async function verifyProjectInHubspot(hsClient: Client, objectId: string): Promise<"alive" | "closed" | "gone"> {
  let confirmedNotFound = false;
  let ambiguous = false;
  for (const slug of READ_SLUGS) {
    try {
      const res = await hsClient.apiRequest({
        method: "GET",
        // ⚠ `hs_pipeline` y `hs_pipeline_stage` NO se pedían acá, y sin ellos esta función
        // no podía aplicar la misma regla de cierre que el loop principal: era una copia
        // más pobre de la misma decisión, que es la forma más segura de que dos reglas
        // diverjan. Ahora las dos llaman a `decidirCierre`.
        path: `/crm/v3/objects/${slug}/${objectId}?properties=hs_name,hs_status,nombre_del_proyecto,estatus_del_proyecto,hs_pipeline,hs_pipeline_stage`,
      });
      if (res.status === 404) { confirmedNotFound = true; continue; }
      if (!res.ok) { ambiguous = true; continue; } // 429/5xx → no concluir nada
      const data = (await res.json()) as { id?: string; properties?: Record<string, string | null> };
      if (data?.id) {
        const p = data.properties ?? {};
        const cierre = decidirCierre({
          hubspotPipelineId: (p.hs_pipeline ?? "").trim() || null,
          stageId: (p.hs_pipeline_stage ?? "").trim() || null,
          rawStatus: p.hs_status || p.estatus_del_proyecto || "",
        });
        return cierre === "cerrado" ? "closed" : "alive";
      }
      ambiguous = true;
    } catch (e) {
      const msg = String((e as Error)?.message ?? "");
      if (msg.includes("404") || /not found/i.test(msg)) confirmedNotFound = true;
      else ambiguous = true;
    }
  }
  // No lo encontramos vivo por ningún slug. Solo confirmamos "gone" si hubo un 404
  // claro y CERO errores ambiguos; sino, conservador: "alive" (no desactivar).
  return confirmedNotFound && !ambiguous ? "gone" : "alive";
}

// Cooldown EN MEMORIA de la auto-sync: corre en CADA montaje de la vista de cliente y es el peor
// consumidor del pool (muchas queries + round-trips lentos a HubSpot). Prod es proceso único → este
// Map cubre a todos los usuarios: el primero en entrar sincroniza, el resto (dentro del cooldown)
// salta sin tocar DB ni HubSpot. El botón "Reintentar" pasa force=true para saltearlo. Se setea al
// arrancar (claim), así un fallo por presión de pool TAMBIÉN hace back-off en vez de reintentar en
// cada navegación y empeorar la congestión.
const SYNC_COOLDOWN_MS = 10 * 60 * 1000; // 10 min
const lastSyncByClient = new Map<string, number>();

export async function syncProjectsForClient(
  clientId: string,
  opts: { force?: boolean } = {},
): Promise<SyncResult> {
  const result: SyncResult = { found: 0, created: 0, updated: 0, skipped: 0, errors: [], debug: [] };

  if (!opts.force) {
    const last = lastSyncByClient.get(clientId) ?? 0;
    if (Date.now() - last < SYNC_COOLDOWN_MS) {
      result.debug!.push("Cooldown activo — sync omitida (usá 'Reintentar' para forzar).");
      return result;
    }
  }
  lastSyncByClient.set(clientId, Date.now());

  // 1. Obtener client + HubspotAccount (query directa para evitar quirks del relation lookup)
  const [client, hubspotAccount] = await Promise.all([
    prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, company: true, hubspotCompanyId: true },
    }),
    prisma.hubspotAccount.findFirst({
      where: { clientId },
      select: { id: true, hubName: true },
    }),
  ]);

  if (!client) {
    result.errors.push("Cliente no encontrado");
    return result;
  }

  // 2. Obtener HubSpot client:
  //    Caso A: cliente tiene su propio portal HubSpot → usar su cuenta
  //    Caso B: cliente está en el portal del sistema (Smarteam) → usar cuenta del sistema
  let hsClient: Client;
  const usingSystemAccount = !hubspotAccount;

  if (hubspotAccount) {
    try {
      hsClient = await getHubspotClient(hubspotAccount.id);
      result.debug!.push(`✓ Usando cuenta HubSpot del cliente: ${hubspotAccount.hubName ?? hubspotAccount.id}`);
    } catch (e) {
      result.errors.push(`Error al obtener HubSpot client del cliente: ${(e as Error).message}`);
      return result;
    }
  } else if (client.hubspotCompanyId) {
    // Caso B: usar sistema
    try {
      hsClient = await getSystemHubspotClient();
      result.debug!.push("✓ Usando cuenta HubSpot del sistema (Smarteam)");
    } catch (e) {
      result.errors.push(`Error al obtener HubSpot client del sistema: ${(e as Error).message}`);
      return result;
    }
  } else {
    result.errors.push("Cliente no tiene cuenta HubSpot ni hubspotCompanyId configurado");
    return result;
  }

  // 3. Resolver hubspotCompanyId — si no está guardado, buscarlo por nombre
  let companyId = client.hubspotCompanyId;

  if (!companyId) {
    result.debug!.push("hubspotCompanyId no guardado — buscando empresa en HubSpot por nombre...");
    companyId = await findCompanyId(hsClient, {
      clientName: client.name,
      companyName: client.company,
      hubName: !usingSystemAccount ? hubspotAccount?.hubName ?? null : null,
    });

    if (companyId) {
      result.debug!.push(`✓ Empresa encontrada: ${companyId} — guardando en DB`);
      await prisma.client.update({
        where: { id: clientId },
        data: { hubspotCompanyId: companyId },
      }).catch(() => {});
    } else {
      result.errors.push(
        `No se encontró la empresa en HubSpot. ` +
        `Busca: nombre="${client.name}", company="${client.company ?? ""}". ` +
        `Asegúrate de que la empresa existe en el portal de HubSpot.`
      );
      return result;
    }
  } else {
    result.debug!.push(`✓ hubspotCompanyId: ${companyId}`);
  }

  // 4. Buscar proyectos HubSpot asociados a la empresa.
  //    Estrategia robusta (evita ocultar/crear proyectos por datos basura):
  //      a) slugs nombrados canónicos ("projects"/"PROJECT")
  //      b) descubrimiento por schema (objeto cuyo nombre incluye project/proyecto) — autoritativo
  //      c) fallbacks numéricos SOLO si no identificamos el objeto y NO hubo error transitorio
  //         (sino abortamos la corrida para no reconciliar con un set incompleto).
  let projectIds: string[] = [];
  let workingAssocSlug: string | null = null;
  let objectIdentified = false; // ¿pudimos identificar el objeto Proyectos del portal?
  let anyTransient = false;     // ¿hubo algún error transitorio (timeout/5xx) consultando?

  // Consulta company→slug. Distingue OK / ausente (4xx) / transitorio (5xx/throw).
  const queryAssoc = async (
    slug: string,
  ): Promise<{ kind: "ok"; ids: string[] } | { kind: "absent" } | { kind: "transient" }> => {
    try {
      const res = await hsClient.apiRequest({
        method: "GET",
        path: `/crm/v4/objects/companies/${companyId}/associations/${slug}`,
      });
      if (res.ok) {
        const data = (await res.json()) as { results?: Array<{ toObjectId: number }> };
        return { kind: "ok", ids: (data.results ?? []).map((r) => String(r.toObjectId)) };
      }
      if (res.status >= 400 && res.status < 500) {
        result.debug!.push(`Slug "${slug}": HTTP ${res.status} (objeto/asociación ausente)`);
        return { kind: "absent" };
      }
      result.debug!.push(`Slug "${slug}": HTTP ${res.status} (transitorio)`);
      return { kind: "transient" };
    } catch (e) {
      const msg = String((e as Error)?.message ?? "");
      result.debug!.push(`Slug "${slug}": error - ${msg.slice(0, 80)}`);
      return /\b40\d\b|not found|invalid/i.test(msg) ? { kind: "absent" } : { kind: "transient" };
    }
  };

  // a) Slugs nombrados canónicos.
  for (const slug of NAMED_PROJECT_SLUGS) {
    const r = await queryAssoc(slug);
    if (r.kind === "transient") anyTransient = true;
    if (r.kind === "ok") {
      objectIdentified = true;
      if (r.ids.length > 0) {
        projectIds = r.ids;
        workingAssocSlug = slug;
        result.debug!.push(`✓ ${r.ids.length} proyectos via slug "${slug}"`);
        break;
      }
      result.debug!.push(`Slug "${slug}": 0 asociaciones (objeto existe, empresa sin proyectos)`);
    }
  }

  // b) Descubrimiento por schema (autoritativo: objeto cuyo nombre incluye project/proyecto).
  if (projectIds.length === 0) {
    try {
      const schemasRes = await hsClient.apiRequest({ method: "GET", path: "/crm/v3/schemas" });
      if (schemasRes.ok) {
        const schemas = (await schemasRes.json()) as {
          results?: Array<{ name: string; objectTypeId: string; labels: { singular: string; plural: string } }>;
        };
        const customSchemas = schemas.results ?? [];
        result.debug!.push(
          `Custom schemas: ${customSchemas.map((s) => `${s.name}(${s.objectTypeId})`).join(", ") || "ninguno"}`,
        );
        const projectSchema = customSchemas.find((s) => {
          const n = (s.name + " " + s.labels?.singular + " " + s.labels?.plural).toLowerCase();
          return n.includes("project") || n.includes("proyecto");
        });
        if (projectSchema) {
          result.debug!.push(`Schema candidato: ${projectSchema.name} (${projectSchema.objectTypeId})`);
          const r = await queryAssoc(projectSchema.objectTypeId);
          if (r.kind === "transient") anyTransient = true;
          if (r.kind === "ok") {
            objectIdentified = true;
            if (r.ids.length > 0) {
              projectIds = r.ids;
              workingAssocSlug = projectSchema.objectTypeId;
              result.debug!.push(`✓ ${r.ids.length} proyectos via schema ${projectSchema.name}`);
            }
          }
        }
      } else {
        anyTransient = true;
        result.debug!.push(`Schemas: HTTP ${schemasRes.status}`);
      }
    } catch (e) {
      anyTransient = true;
      result.debug!.push(`Error obteniendo schemas: ${(e as Error).message?.slice(0, 100)}`);
    }
  }

  // c) Fallbacks numéricos: ÚLTIMO recurso, solo si NO identificamos el objeto y NO hubo
  //    error transitorio. Así nunca ingerimos objetos no-proyecto cuando el objeto real
  //    respondió (aunque vacío) ni cuando hubo un hipo de la API.
  if (projectIds.length === 0 && !objectIdentified && !anyTransient) {
    for (const slug of FALLBACK_PROJECT_SLUGS) {
      const r = await queryAssoc(slug);
      if (r.kind === "ok" && r.ids.length > 0) {
        projectIds = r.ids;
        workingAssocSlug = slug;
        result.debug!.push(`✓ ${r.ids.length} proyectos via fallback "${slug}"`);
        break;
      }
    }
  }

  if (projectIds.length === 0) {
    // Error transitorio sin objeto identificado → ABORTAR la corrida SIN reconciliar:
    // no podemos confiar en un set incompleto, así que no desactivamos nada.
    if (anyTransient && !objectIdentified) {
      result.errors.push(
        `No se pudieron consultar las asociaciones de proyectos de la empresa ${companyId} ` +
        `(error transitorio de HubSpot). Se omite esta corrida para no reconciliar con datos incompletos.`,
      );
      return result;
    }
    result.errors.push(
      objectIdentified
        ? `La empresa ${companyId} no tiene proyectos asociados (objeto Proyectos identificado, 0 asociaciones).`
        : `No se identificó el objeto Proyectos para la empresa ${companyId}. ` +
          `Slugs intentados: ${ASSOCIATION_SLUGS.join(", ")}. Verifica que los Proyectos estén asociados en HubSpot.`,
    );
    return result;
  }

  // 5. Leer propiedades de cada proyecto
  //    Estrategia: primero intenta batch POST; si falla por MISSING_SCOPES,
  //    intenta GET individual (diferente scope requirement).
  let projects: Array<{ id: string; properties: Record<string, string | null> }> = [];
  const readSlugs = workingAssocSlug ? [workingAssocSlug, ...READ_SLUGS] : READ_SLUGS;
  const uniqueReadSlugs = [...new Set(readSlugs)];
  const propsParam = PROJECT_PROPERTIES.join(",");

  // 5a. Intentar batch POST
  for (const slug of uniqueReadSlugs) {
    try {
      const batchResponse = await hsClient.apiRequest({
        method: "POST",
        path: `/crm/v3/objects/${slug}/batch/read`,
        body: {
          inputs: projectIds.map((id) => ({ id })),
          properties: PROJECT_PROPERTIES,
        },
      });
      const batchData = (await batchResponse.json()) as {
        results?: Array<{ id: string; properties: Record<string, string | null> }>;
        status?: string;
        category?: string;
      };
      // Ignorar respuestas de error de scope
      if (batchData.category === "MISSING_SCOPES" || batchData.status === "error") {
        result.debug!.push(`Batch read "${slug}": MISSING_SCOPES — intentando GET individual`);
        break;
      }
      const found = batchData.results ?? [];
      if (found.length > 0) {
        projects = found;
        result.debug!.push(`✓ Propiedades leídas via batch "${slug}"`);
        break;
      }
    } catch {
      continue;
    }
  }

  // 5b. Si el batch falló, intentar GET individual por proyecto
  if (projects.length === 0 && projectIds.length > 0) {
    result.debug!.push("Intentando GET individual por proyecto...");
    const readSlug = workingAssocSlug ?? "projects";
    const fetched = await Promise.all(
      projectIds.map(async (id) => {
        try {
          const res = await hsClient.apiRequest({
            method: "GET",
            path: `/crm/v3/objects/${readSlug}/${id}?properties=${propsParam}`,
          });
          const data = (await res.json()) as {
            id?: string;
            properties?: Record<string, string | null>;
            status?: string;
            category?: string;
          };
          if (data.id && data.properties) return { id: data.id, properties: data.properties };
        } catch { /* ignorar */ }
        return null;
      })
    );
    const valid = fetched.filter((p): p is { id: string; properties: Record<string, string | null> } => p !== null);
    if (valid.length > 0) {
      projects = valid;
      result.debug!.push(`✓ ${valid.length} proyectos leídos via GET individual`);
    }
  }

  // 5c. Intentar search con filtro por IDs (scope diferente al batch)
  if (projects.length === 0 && projectIds.length > 0) {
    result.debug!.push("Intentando search por IDs...");
    const readSlug = workingAssocSlug ?? "projects";
    try {
      const res = await hsClient.apiRequest({
        method: "POST",
        path: `/crm/v3/objects/${readSlug}/search`,
        body: {
          // IN con values: los filtros DENTRO de un filterGroup se AND-ean —
          // N filtros EQ sobre hs_object_id era insatisfacible para N>1 (y HubSpot
          // rechaza >6 filtros por grupo), así que el fallback devolvía 0 siempre.
          filterGroups: [{
            filters: [{
              propertyName: "hs_object_id",
              operator: "IN",
              values: projectIds.slice(0, 100),
            }],
          }],
          properties: PROJECT_PROPERTIES,
          limit: 100,
        },
      });
      const data = (await res.json()) as {
        results?: Array<{ id: string; properties: Record<string, string | null> }>;
        status?: string;
        category?: string;
      };
      if (data.results && data.results.length > 0) {
        projects = data.results;
        result.debug!.push(`✓ ${projects.length} proyectos leídos via search`);
      } else if (data.category === "MISSING_SCOPES") {
        result.debug!.push("Search también requiere scope adicional");
      }
    } catch { /* ignorar */ }
  }

  if (projects.length === 0 && projectIds.length > 0) {
    // Último recurso: crear proyectos con solo el ID
    // Al menos aparecen las tabs; el nombre se puede editar después
    result.debug!.push("⚠ No se pudieron leer propiedades — creando proyectos con ID como nombre temporal");
    projects = projectIds.map((id) => ({ id, properties: {} }));
  }

  result.found = projects.length;

  /* Las asociaciones proyecto↔proyecto de TODA la corrida, en una sola llamada. Como los
     proyectos de una empresa vienen todos juntos, el grafo del hermano se arma sin pedir
     nada extra por proyecto. */
  const asociados = await leerProyectosAsociados(
    hsClient,
    projects.map((p) => p.id),
    workingAssocSlug ?? "projects",
  );

  // Supresión de re-sync: hubspotServiceId de proyectos BORRADOS a mano desde Nexus. El sync
  // no los vuelve a crear NI a reactivar (desasociación durable; el objeto en HubSpot queda
  // intacto). Se limpia sacándolo de la lista para "re-agregar a mano".
  const suppressed = new Set(
    (await prisma.client.findUnique({ where: { id: clientId }, select: { ignoredHubspotServiceIds: true } }))
      ?.ignoredHubspotServiceIds ?? [],
  );

  // 6. Sincronizar cada proyecto HubSpot → DB
  for (const project of projects) {
    const props = project.properties;

    // Proyecto borrado a mano en Nexus → no recrear (antes del lookup: ni create ni reactivate).
    if (suppressed.has(project.id)) {
      result.skipped++;
      result.debug!.push(`Proyecto suprimido (borrado a mano en Nexus): ${project.id}`);
      continue;
    }

    const realName = props.nombre_del_proyecto || props.hs_name || null;
    const projectName = realName ?? `Proyecto ${project.id}`;

    const rawStatus = (props.hs_status || props.estatus_del_proyecto || "").toLowerCase().trim();

    // ── Proyectos sin propiedades legibles (fallback de último recurso) ────────
    // Si no hay nombre real ni estado, HubSpot no pudo devolver los datos.
    // Si ya existe en DB con nombre fantasma → ocultarlo (inactive).
    // Si no existe → no crear tab vacío.
    const hasRealProps = !!(realName || rawStatus);
    if (!hasRealProps) {
      const ghost = await prisma.project.findUnique({ where: { hubspotServiceId: project.id } });
      if (ghost && ghost.status === "active") {
        await prisma.project.update({
          where: { id: ghost.id },
          data: { status: "inactive" },
        });
        result.updated++; // dispara router.refresh() en WorkspaceClient
        result.debug!.push(`Ocultando proyecto fantasma: ${ghost.name} (${project.id})`);
      } else {
        result.skipped++;
      }
      continue;
    }

    /* ── Resolver PIPELINE y ETAPA ────────────────────────────────────────────
       Va ANTES de decidir si el proyecto está terminado, y ése es el arreglo: el
       `continue` de "terminados" corría antes de que la etapa se resolviera, así que la
       decisión se tomaba sin el dato del que ahora depende. Es barato acá porque las
       etapas de un pipeline se cachean por corrida (y la primera llamada se paga igual
       más abajo para los proyectos que siguen). */
    const pipelineId = (props.hs_pipeline ?? "").trim() || null;
    const readSlugForPipeline = workingAssocSlug ?? "projects";
    const stageId = (props.hs_pipeline_stage ?? "").trim() || null;
    const stageLabel = await resolvePipelineStageLabel(hsClient, pipelineId, stageId, readSlugForPipeline);

    // ── ¿Terminado? ───────────────────────────────────────────────────────────
    // La regla vive en lib/projects/kind.ts y la comparte `verifyProjectInHubspot`, que
    // antes tenía su propia copia (y ni siquiera pedía la etapa).
    if (decidirCierre({ hubspotPipelineId: pipelineId, stageId, rawStatus }) === "cerrado") {
      const finished = await prisma.project.findUnique({ where: { hubspotServiceId: project.id } });
      if (finished && finished.status === "active") {
        await prisma.project.update({
          where: { id: finished.id },
          data: { status: "inactive" },
        });
        result.updated++; // dispara router.refresh() en WorkspaceClient
        logTransicion({
          project: `${finished.name} (${project.id})`,
          de: "active",
          a: "inactive",
          pipelineId,
          stageLabel,
          stageId,
          rawStatus,
          motivo: cerradoPorEstadoCrudo(rawStatus) ? "estado crudo cerrado" : "etapa terminal del pipeline",
        });
      } else {
        result.skipped++;
      }
      continue;
    }

    const servicioContratado = props.servicio_contratado || props.tipo_de_servicio || projectName;
    const mapping = inferServiceMapping(servicioContratado);

    // ── Resolver CSE encargado (gobierna la VISIBILIDAD del cliente) ──────────
    // La asignación del CSE vive en la propiedad custom "CSL Encargado" (csl_encargado),
    // un campo OWNER (guarda un owner id). La visibilidad (lib/auth/access) matchea por
    // EMAIL, así que resolvemos ESE owner → email/nombre y lo priorizamos sobre el owner
    // estándar (hubspot_owner_id, que suele ser el SA/líder técnico cuando el servicio
    // lleva integraciones, NO el CSE). Fallback al owner estándar si no hay csl_encargado.
    const cslOwnerId = (props.csl_encargado ?? "").trim() || null;
    const stdOwnerId = (props.hubspot_owner_id ?? "").trim() || null;
    const [cslOwner, stdOwner] = await Promise.all([
      resolveOwner(hsClient, cslOwnerId),
      resolveOwner(hsClient, stdOwnerId),
    ]);
    const hubOwnerId = cslOwnerId ?? stdOwnerId;
    const ownerName = cslOwner.name ?? stdOwner.name;
    const ownerEmail = cslOwner.email ?? stdOwner.email;

    /* El NOMBRE del pipeline es solo el rótulo que se muestra; el id (resuelto arriba, antes
       de decidir el cierre) es el HECHO del que cuelga toda la tabla de decisiones. */
    const pipelineName = await resolvePipelineName(hsClient, pipelineId, readSlugForPipeline);

    // `proyecto_interno`: booleancheckbox. Sin marcar llega VACÍO (o ausente), no "false",
    // y eso SIGNIFICA "no interno" — el default de negocio y el de la columna coinciden.
    const proyectoInterno = parseCheckbox(props.proyecto_interno);

    // ── Parsear fecha de creación ──────────────────────────────────────────
    const createdAtRaw = (props.hs_createdate ?? "").trim();
    const hubCreatedAt = createdAtRaw ? new Date(createdAtRaw) : null;
    const hubCreatedAtValid = hubCreatedAt && !isNaN(hubCreatedAt.getTime()) ? hubCreatedAt : null;

    // ── CS360: propiedades operativas para el dashboard de la CSL ─────────
    // Valores CRUDOS de HubSpot (labels ES en la UI, no acá). Ausente → null
    // (un select sin valor NO es "low"/"on_track"). El detalle prefiere el campo
    // "| Desarrollo" y cae al "| Implementaciones" si aquel está vacío.
    const trimOrNull = (v: string | null | undefined) => (v ?? "").trim() || null;
    const csOps = {
      hubspotPriority: trimOrNull(props.hs_priority),
      hubspotStatus: trimOrNull(props.hs_status),
      hubspotBlockReason: trimOrNull(props.motivo_de_bloqueo),
      hubspotBlockDetail:
        trimOrNull(props.detalle_del_motivo_de_bloqueo) ??
        trimOrNull(props.detalle_del_motivo_de_bloqueo__implementaciones),
      hubspotAdoptionState: trimOrNull(props.estado_de_adopcion),
    };

    /* ── EL ESPEJO: todo lo que este proyecto COPIA de HubSpot ────────────────
       Una sola vez, y las dos ramas (crear y actualizar) lo spreadean.

       Antes eran dos listas escritas a mano, y divergieron: la rama de creación se quedó
       sin `hubspotPipelineId`, `proyectoInterno` ni `hubspotRelatedProjectIds` — o sea,
       justo los tres campos que deciden si un proyecto se factura, si suma a la cartera y
       si lo vigila el watchdog. Los proyectos que NACEN son los que entran por esa rama,
       así que en su primera sincronización se comportaban como Customer Success legacy.

       Lo que lo hizo invisible en la revisión: la rama SÍ escribía `hubspotPipelineName` y
       `hubspotPipelineStageId/Label`. El gemelo cosmético de cada campo que faltaba estaba
       presente, así que el bloque se leía completo.

       Con una sola fuente, olvidarse deja de ser posible. Lo que NO va acá es lo que las
       dos ramas tratan distinto a propósito: `tags` (aditivo al actualizar, desde cero al
       crear), `status` y `clientId`. Están escritos aparte en cada rama, a la vista.
       La guarda de paridad en lib/projects/scope-coverage.test.ts congela esta división. */
    const espejo = {
      name: projectName,
      hubspotServiceId: project.id,
      serviceType: mapping.serviceType,
      projectType: mapping.projectType,
      hubspotOwnerId: hubOwnerId,
      hubspotOwnerName: ownerName,
      hubspotOwnerEmail: ownerEmail,
      hubspotCreatedAt: hubCreatedAtValid,
      hubspotPipelineName: pipelineName,
      hubspotPipelineId: pipelineId,
      proyectoInterno,
      hubspotPipelineStageId: stageId,
      hubspotPipelineStageLabel: stageLabel,
      hubspotStageSyncedAt: stageId ? new Date() : null,
      ...csOps,
      /* El HECHO crudo de la asociación proyecto↔proyecto. Se guarda aunque el hermano
         todavía no exista en Nexus; la resolución la hace `resolverHermanos` al final.
         ⚠ Se OMITE cuando la lectura de asociaciones falló (`asociados === null`): pisar
         con `[]` un dato que no pudimos leer desvincularía a todos los hermanos del cliente
         y los volvería facturables. Ver `leerProyectosAsociados`. */
      ...(asociados ? { hubspotRelatedProjectIds: asociados.get(project.id) ?? [] } : {}),
    };

    // Buscar existente por hubspotServiceId o por nombre (evitar duplicados)
    const existing =
      (await prisma.project.findUnique({ where: { hubspotServiceId: project.id } })) ??
      (await prisma.project.findFirst({
        where: { clientId, name: projectName, hubspotServiceId: null },
      }));

    if (existing) {
      /* ── Sobre REACTIVAR ────────────────────────────────────────────────────
         Esta rama escribe `status: "active"` siempre, y se deja así. La preocupación era
         que la regla nueva resucitara un proyecto apagado, pero `decidirCierre` UNE las
         dos señales (etapa terminal o estado crudo) en vez de darle precedencia a una: no
         puede devolver "abierto" para algo que la regla vieja cerraba, así que la regla
         no reabre nada por sí sola. Que un proyecto vuelva a `active` exige que una
         persona lo saque de la etapa terminal Y le cambie el estado en HubSpot, o que lo
         re-asocie a la empresa — las dos cosas son pedidos explícitos, y hay caminos
         legítimos que dependen de esto (un proyecto que se desasoció por error).
         Los borrados a mano DESDE Nexus están protegidos aparte, por `suppressed`.
         Igual se registra la transición: si alguna vez pasa, tiene que verse. */
      if (existing.status !== "active") {
        logTransicion({
          project: `${existing.name} (${project.id})`,
          de: existing.status,
          a: "active",
          pipelineId,
          stageId,
          stageLabel,
          rawStatus,
          motivo: "vino en la asociación de la empresa y no está terminado",
        });
      }
      await prisma.project.update({
        where: { id: existing.id },
        data: {
          ...espejo,
          // ADITIVO (ver mergeHubTag): el sync no puede borrar la clasificación del
          // agente ni la del CSE. Solo suma su tag derivado del servicio de HubSpot.
          tags: mergeHubTag(existing.tags, mapping.hubTag),
          status: "active",
        },
      });
      result.updated++;
    } else {
      // Proyecto + canvases default en UNA transacción: si el proceso muere entre
      // ambos, quedaba un proyecto SIN canvases para siempre (la próxima corrida
      // lo encuentra existente → rama update → nunca los crea). Todo-o-nada:
      // si algo falla, el próximo sync lo re-crea completo.
      await prisma.$transaction(async (tx) => {
        const created = await tx.project.create({
          data: {
            ...espejo,
            clientId,
            // Proyecto NUEVO: no hay nada curado que preservar, pero igual pasa por
            // mergeHubTag para guardar el SLUG canónico (antes guardaba el label).
            tags: mergeHubTag([], mapping.hubTag),
            status: "active",
          },
        });
        // El pipeline decide QUÉ piezas nacen. Ya está en la mano dentro de la transacción.
        await createDefaultCanvases(created.id, pipelineId, tx);
        return created;
      });
      result.created++;
    }
  }

  /* ── Re-clasificar las sesiones del cliente: UNA vez, no una por proyecto ──────
     Un proyecto nuevo cambia el panorama del cliente, así que hay que reconsiderar a qué
     proyecto va cada sesión reciente (huérfanas + links de IA sin revisar; los locks
     humanos se respetan).

     ⚠ Esto vivía DENTRO del loop, en la rama de creación. Con N proyectos creados en una
     corrida disparaba N `reclassifyClientSessions(clientId)` concurrentes **para el mismo
     cliente**, sin mutex, compitiendo por escribir las mismas filas `SessionProject` — y
     cada corrida cuesta ~US$1 de LLM (ver el encabezado de reclassify.ts). Con Desarrollo
     cargando ~21 proyectos de golpe eso dejaba de ser teórico.

     El clasificador ya recorre TODAS las sesiones recientes del cliente y ve todos sus
     proyectos, así que una sola corrida al final hace exactamente el mismo trabajo.
     Fire-and-forget (no bloquea el sync) + import dinámico (no arrastra el clasificador
     al grafo del sync). */
  if (result.created > 0) {
    void import("@/lib/sessions/reclassify")
      .then((m) => m.reclassifyClientSessions(clientId))
      .catch(() => {});
  }

  // ── Reconciliación: ocultar proyectos sincronizados que YA NO están en HubSpot ──
  // (borrados o desasociados de la empresa). Solo si tenemos un set confiable de
  // projectIds (>0) — si fuera 0 el flujo ya cortó antes (L276), así un fallo de la
  // API de HubSpot NO desactiva todo. NUNCA toca proyectos sin hubspotServiceId
  // (manuales / handoff / sentinel __strategy__): esos no son de HubSpot.
  if (projectIds.length > 0) {
    // Candidatos: proyectos sincronizados (hubspotServiceId) activos que NO vinieron
    // en el set de asociaciones de ESTA corrida. ANTES era un updateMany ciego — pero
    // `projectIds` puede estar incompleto/erróneo (hipo de la API → fallback a un slug
    // equivocado), y eso desactivaba proyectos VIVOS. Ahora verificamos cada uno
    // directamente en HubSpot y solo desactivamos si está confirmado gone/closed.
    const candidates = await prisma.project.findMany({
      where: { clientId, status: "active", hubspotServiceId: { not: null, notIn: projectIds } },
      select: { id: true, name: true, hubspotServiceId: true },
    });
    for (const cand of candidates) {
      const verdict = await verifyProjectInHubspot(hsClient, cand.hubspotServiceId!);
      if (verdict === "alive") {
        result.debug!.push(
          `Reconciliación: "${cand.name}" (${cand.hubspotServiceId}) no vino en la asociación pero SIGUE vivo en HubSpot → se conserva activo (probable hipo de la API o slug equivocado)`,
        );
        continue;
      }
      await prisma.project.update({ where: { id: cand.id }, data: { status: "inactive" } });
      result.updated++; // dispara router.refresh() en WorkspaceClient
      const porQue = verdict === "gone" ? "no existe (404)" : "en estado cerrado";
      result.debug!.push(
        `Reconciliación: "${cand.name}" (${cand.hubspotServiceId}) ${porQue} en HubSpot → inactive`,
      );
      logTransicion({
        project: `${cand.name} (${cand.hubspotServiceId})`,
        de: "active",
        a: "inactive",
        pipelineId: null,
        stageId: null,
        stageLabel: null,
        rawStatus: "",
        motivo: `reconciliación: no vino en la asociación y ${porQue}`,
      });
    }
  }

  /* Al final del todo: con todos los proyectos del cliente ya en la base, se resuelve quién
     cuelga de quién. Va acá y no dentro del loop porque así el orden de llegada no importa. */
  await resolverHermanos(clientId, (m) => result.debug!.push(m)).catch((e) => {
    result.debug!.push(`No se pudo resolver el hermano: ${(e as Error).message?.slice(0, 120)}`);
  });

  result.debug!.push(`Sync completo: ${result.created} creados, ${result.updated} actualizados, ${result.skipped} saltados`);
  return result;
}

// ── Buscar empresa en HubSpot por nombre/dominio ─────────────────────────────

async function findCompanyId(
  hsClient: Client,
  opts: { clientName: string; companyName: string | null; hubName: string | null }
): Promise<string | null> {
  const { clientName, companyName, hubName } = opts;

  const searches = [
    hubName && { propertyName: "domain", operator: "EQ", value: hubName },
    companyName && { propertyName: "name", operator: "EQ", value: companyName },
    companyName && { propertyName: "name", operator: "CONTAINS_TOKEN", value: companyName },
    clientName !== companyName && { propertyName: "name", operator: "CONTAINS_TOKEN", value: clientName },
  ].filter(Boolean) as Array<{ propertyName: string; operator: string; value: string }>;

  for (const filter of searches) {
    try {
      const res = await hsClient.apiRequest({
        method: "POST",
        path: "/crm/v3/objects/companies/search",
        body: {
          filterGroups: [{ filters: [filter] }],
          properties: ["name", "domain"],
          limit: 1,
        },
      });
      const data = (await res.json()) as { results?: Array<{ id: string }> };
      if (data.results?.length) return data.results[0].id;
    } catch {
      continue;
    }
  }

  return null;
}
