/**
 * lib/ventas/sicop.ts — el tablero de licitaciones públicas (SICOP).
 *
 * Las licitaciones del Estado NO viven como tratos: viven como TICKETS del pipeline
 * "Gobiernos" del CRM de Smarteam, con etapas propias (análisis del cartel, aclaraciones,
 * entrega de oferta, adjudicación…) y propiedades propias (`*__sicop_`). Por eso este
 * módulo no pasa por `lib/ventas/pipelines.ts`, que declara los pipelines de TRATOS: son
 * dos objetos distintos de HubSpot y compartir la lista mezclaría dos cosas que no lo son.
 *
 * ⛔ LO ÚNICO TRANSCRITO ACÁ ES EL ID DEL PIPELINE. Los nombres de las etapas, su ORDEN y
 * cuáles cierran salen de `/crm/v3/pipelines/tickets/{id}` en cada carga. Si Ventas agrega,
 * renombra o reordena una etapa en el portal, la pantalla lo refleja sola — sin deploy y
 * sin una lista que mantener a mano. Es la misma decisión que "HubSpot manda la etapa".
 *
 * DEGRADACIÓN DE SCOPE (patrón de lib/hubspot/tickets.ts): si la app OAuth perdiera el
 * scope `tickets`, un 403 NO es un error rojo — devuelve `soportado: false` y la pantalla
 * explica que falta el permiso en vez de mentir con una lista vacía.
 *
 * Retry-401 con `forceRefreshSystemToken`: la cuenta del sistema es compartida (PROD +
 * local + scripts) y el refresh token ROTA.
 */
import type { Client as HsClient } from "@hubspot/api-client";
import { getSystemHubspotClient, forceRefreshSystemToken } from "@/lib/hubspot/client";
import { prisma } from "@/lib/db/prisma";

/** El pipeline de TICKETS "Gobiernos" del portal de Smarteam (6553628). */
export const PIPELINE_GOBIERNOS = "4007093";

/** Bucket para un ticket cuya etapa ya no existe en el pipeline: se muestra, no se pierde. */
export const ETAPA_HUERFANA = "__sin-etapa__";

/** Las propiedades que la pantalla lee de cada ticket. */
const PROPIEDADES = [
  "subject",
  "content",
  "hs_pipeline_stage",
  "hs_ticket_priority",
  "createdate",
  "hs_lastmodifieddate",
  "hubspot_owner_id",
  "nro_de_procedimiento__sicopp_",
  "presupuesto__sicop_",
  "tipo_de_contratacion__sicop_",
  "formato_de_evaluacion__sicop_",
  "fecha_de_recepcion_de_aclaraciones__sicop_",
  "motivo_de_perdida__sicop_",
] as const;

// ── Tipos ──────────────────────────────────────────────────────────────────────

/** Una licitación (= un ticket del pipeline Gobiernos). */
export interface LicitacionSicop {
  id: string;
  asunto: string;
  /** El id crudo de la etapa en HubSpot — la resolución a rótulo la hace `agruparPorEtapa`. */
  etapaId: string;
  detalle: string | null;
  /** Nro de procedimiento (SICOP) — el identificador con el que se busca en el sistema. */
  procedimiento: string | null;
  presupuesto: number | null;
  tipoContratacion: string | null;
  formatoEvaluacion: string | null;
  fechaAclaraciones: string | null;
  motivoPerdida: string | null;
  responsable: string | null;
  prioridad: string | null;
  creadaEl: string | null;
  actualizadaEl: string | null;
}

/** Una etapa tal como la declara HubSpot (sin los tickets todavía). */
export interface EtapaDeclarada {
  id: string;
  label: string;
  orden: number;
  /** `metadata.isClosed` del portal: la etapa saca la licitación del juego. */
  cerrada: boolean;
}

/** Una etapa con sus licitaciones — la unidad que pinta la pantalla. */
export interface EtapaSicop extends EtapaDeclarada {
  licitaciones: LicitacionSicop[];
}

export interface TableroSicop {
  /** false = la app OAuth no tiene el scope `tickets` (403). No es lo mismo que "no hay nada". */
  soportado: boolean;
  etapas: EtapaSicop[];
  total: number;
  /** Para armar los links a HubSpot; null si no hay cuenta del sistema configurada. */
  portalId: string | null;
  /** Mensaje corto cuando HubSpot no contestó — la pantalla lo muestra, no lo esconde. */
  error: string | null;
}

// ── Agrupado (PURO — lo que prueba lib/ventas/sicop.test.ts) ────────────────────

/**
 * Reparte las licitaciones en las etapas declaradas, respetando el ORDEN del portal.
 *
 * Dos reglas que no son obvias:
 *  · Una etapa vacía SE MUESTRA igual. El tablero es el proceso completo; esconder las
 *    vacías haría que "no hay nada en Aclaraciones" se leyera como "esa etapa no existe".
 *  · Un ticket cuya etapa ya no está en el pipeline (borrada, o movido a otro pipeline
 *    mientras se leía) NO se descarta: cae en `ETAPA_HUERFANA`, al final. Descartarlo
 *    sería perder una licitación en silencio, que es el modo de falla caro.
 */
export function agruparPorEtapa(
  etapas: readonly EtapaDeclarada[],
  licitaciones: readonly LicitacionSicop[],
): EtapaSicop[] {
  const ordenadas = [...etapas].sort((a, b) => a.orden - b.orden);
  const porId = new Map<string, EtapaSicop>();
  const salida: EtapaSicop[] = ordenadas.map((e) => {
    const conLista: EtapaSicop = { ...e, licitaciones: [] };
    porId.set(e.id, conLista);
    return conLista;
  });

  let huerfana: EtapaSicop | null = null;
  for (const l of licitaciones) {
    const destino = porId.get(l.etapaId);
    if (destino) {
      destino.licitaciones.push(l);
      continue;
    }
    if (!huerfana) {
      huerfana = {
        id: ETAPA_HUERFANA,
        label: "Sin etapa reconocida",
        orden: Number.MAX_SAFE_INTEGER,
        cerrada: false,
        licitaciones: [],
      };
      salida.push(huerfana);
    }
    huerfana.licitaciones.push(l);
  }

  // Dentro de cada etapa: lo movido más recientemente arriba (es lo que se está trabajando).
  for (const etapa of salida) {
    etapa.licitaciones.sort((a, b) => msDe(b.actualizadaEl) - msDe(a.actualizadaEl));
  }
  return salida;
}

function msDe(iso: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

// ── Lectura de HubSpot ─────────────────────────────────────────────────────────

interface RespuestaCruda {
  status: number;
  etapas: EtapaDeclarada[];
  licitaciones: LicitacionSicop[];
}

async function leerEtapas(hs: HsClient): Promise<{ status: number; etapas: EtapaDeclarada[] }> {
  const res = await hs.apiRequest({
    method: "GET",
    path: `/crm/v3/pipelines/tickets/${PIPELINE_GOBIERNOS}`,
  });
  if (res.status !== 200) return { status: res.status, etapas: [] };
  const data = (await res.json()) as {
    stages?: { id: string; label: string; displayOrder?: number; metadata?: Record<string, string> }[];
  };
  const etapas = (data.stages ?? []).map((s, i) => ({
    id: s.id,
    label: s.label,
    orden: typeof s.displayOrder === "number" ? s.displayOrder : i,
    cerrada: s.metadata?.isClosed === "true",
  }));
  return { status: 200, etapas };
}

/** id de owner → nombre legible. Sin nombre, la tarjeta muestra "—" (nunca el id crudo). */
async function leerResponsables(hs: HsClient): Promise<Map<string, string>> {
  const nombres = new Map<string, string>();
  let after: string | undefined;
  for (let pagina = 0; pagina < 5; pagina++) {
    const path = `/crm/v3/owners?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`;
    const res = await hs.apiRequest({ method: "GET", path });
    if (res.status !== 200) break;
    const data = (await res.json()) as {
      results?: { id: string; email?: string; firstName?: string; lastName?: string }[];
      paging?: { next?: { after?: string } };
    };
    for (const o of data.results ?? []) {
      const nombre = [o.firstName, o.lastName].filter(Boolean).join(" ").trim();
      nombres.set(o.id, nombre || o.email || o.id);
    }
    after = data.paging?.next?.after;
    if (!after) break;
  }
  return nombres;
}

async function leerLicitaciones(
  hs: HsClient,
  responsables: Map<string, string>,
): Promise<{ status: number; licitaciones: LicitacionSicop[] }> {
  const licitaciones: LicitacionSicop[] = [];
  let after: string | undefined;
  // Hasta 1.000 (10 páginas). Hoy son ~40 y el pipeline crece de a poco, pero un tope
  // explícito es mejor que un bucle infinito contra una API paginada.
  for (let pagina = 0; pagina < 10; pagina++) {
    const res = await hs.apiRequest({
      method: "POST",
      path: "/crm/v3/objects/tickets/search",
      body: {
        filterGroups: [
          { filters: [{ propertyName: "hs_pipeline", operator: "EQ", value: PIPELINE_GOBIERNOS }] },
        ],
        properties: [...PROPIEDADES],
        sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
        limit: 100,
        ...(after ? { after } : {}),
      },
    });
    if (res.status !== 200) return { status: res.status, licitaciones };
    const data = (await res.json()) as {
      results?: { id: string; properties: Record<string, string | null> }[];
      paging?: { next?: { after?: string } };
    };
    for (const t of data.results ?? []) {
      const p = t.properties;
      const ownerId = p.hubspot_owner_id ?? null;
      licitaciones.push({
        id: t.id,
        asunto: limpiar(p.subject) ?? "Licitación sin asunto",
        etapaId: p.hs_pipeline_stage ?? "",
        detalle: limpiar(p.content),
        // El campo del portal se llama `nro_de_procedimiento__sicopp_` (con doble P: es un
        // typo del CRM, no de acá). Se recorta porque varios vienen con un espacio adelante.
        procedimiento: limpiar(p.nro_de_procedimiento__sicopp_),
        presupuesto: aNumero(p.presupuesto__sicop_),
        tipoContratacion: limpiar(p.tipo_de_contratacion__sicop_),
        formatoEvaluacion: limpiar(p.formato_de_evaluacion__sicop_),
        fechaAclaraciones: limpiar(p.fecha_de_recepcion_de_aclaraciones__sicop_),
        // Es un checkbox múltiple: HubSpot lo devuelve como "Precio;Requisitos".
        motivoPerdida: limpiar(p.motivo_de_perdida__sicop_)?.split(";").join(" · ") ?? null,
        responsable: ownerId ? (responsables.get(ownerId) ?? null) : null,
        prioridad: limpiar(p.hs_ticket_priority),
        creadaEl: p.createdate ?? null,
        actualizadaEl: p.hs_lastmodifieddate ?? null,
      });
    }
    after = data.paging?.next?.after;
    if (!after) break;
  }
  return { status: 200, licitaciones };
}

function limpiar(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}

function aNumero(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function unaPasada(hs: HsClient): Promise<RespuestaCruda> {
  const { status: sEtapas, etapas } = await leerEtapas(hs);
  if (sEtapas !== 200) return { status: sEtapas, etapas: [], licitaciones: [] };
  const responsables = await leerResponsables(hs);
  const { status: sTickets, licitaciones } = await leerLicitaciones(hs, responsables);
  return { status: sTickets, etapas, licitaciones };
}

/**
 * El tablero completo, listo para pintar. Nunca tira: un fallo de HubSpot devuelve el
 * tablero con `error` y las etapas vacías — la pantalla dice qué pasó en vez de romperse.
 */
export async function leerTableroSicop(): Promise<TableroSicop> {
  const cuenta = await prisma.hubspotAccount
    .findFirst({ where: { isSystem: true }, select: { hubspotPortalId: true } })
    .catch(() => null);
  const portalId = cuenta?.hubspotPortalId ?? null;

  try {
    let cruda = await unaPasada(await getSystemHubspotClient());
    if (cruda.status === 401) {
      await forceRefreshSystemToken();
      cruda = await unaPasada(await getSystemHubspotClient());
    }
    if (cruda.status === 403) {
      return { soportado: false, etapas: [], total: 0, portalId, error: null };
    }
    if (cruda.status !== 200) {
      return {
        soportado: true,
        etapas: [],
        total: 0,
        portalId,
        error: `HubSpot respondió ${cruda.status}`,
      };
    }
    return {
      soportado: true,
      etapas: agruparPorEtapa(cruda.etapas, cruda.licitaciones),
      total: cruda.licitaciones.length,
      portalId,
      error: null,
    };
  } catch (e) {
    return {
      soportado: true,
      etapas: [],
      total: 0,
      portalId,
      error: e instanceof Error ? e.message : "No se pudo consultar HubSpot",
    };
  }
}
