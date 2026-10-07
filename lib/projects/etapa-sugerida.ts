/**
 * lib/projects/etapa-sugerida.ts — LA ETAPA QUE NEXUS SUGIERE MOVER EN HUBSPOT, y si sigue en pie.
 * PURO y CLIENT-SAFE.
 *
 * ── EL PEDIDO ────────────────────────────────────────────────────────────────
 * Elías (2026-10-07): «Haz que las etapas sincronizadas con HubSpot en ambos sentidos, con
 * sugerencia de mover la etapa cuando Nexus lo detecte en una reunión. Para escribir en HS debe
 * salir un pop-up, como si fuese una encuesta. Y el CSE debe aprobarlo.»
 *
 * Los dos sentidos:
 *  · HubSpot → Nexus: el espejo (`hubspotPipelineStageId`), como siempre. HubSpot manda para LEER.
 *  · Nexus → HubSpot: SOLO por la encuesta de la etapa (components/clients/EncuestaDeEtapa.tsx),
 *    que escribe por `estado-hubspot/route.ts` y trae el valor que volvió.
 *
 * La sugerencia que deja una reunión vive en `Project.etapaPropuesta*` (las columnas de 2026-08-16,
 * hasta hoy sin escritor). Este módulo decide si una sugerencia guardada SIGUE EN PIE contra la
 * etapa de HOY, sin escribir nada: si alguien ya movió la tarjeta en HubSpot (a esa etapa o más
 * allá), la sugerencia se apaga sola, sin que nadie tenga que descartarla.
 */
import { buscarEtapa, lineaDeAvance, type PipelineDef } from "./kind";
import { etapasProponibles, saltoDeEtapas } from "./etapa-hubspot";

/** La reunión de la que salió la sugerencia. */
export interface ReunionDeLaSugerencia {
  id: string;
  titulo: string;
  /** ISO. */
  fecha: string;
}

/**
 * Lo que se guarda en `etapaPropuestaMotivo`. Es TEXT: se guarda como JSON con versión para no
 * pedir columnas nuevas (SQL coordinado entre dos PCs) por la cita y la reunión. Un texto plano
 * (de antes, o escrito a mano) se lee como motivo solo.
 */
export interface MotivoDeEtapa {
  motivo: string;
  /** La frase de la reunión, copiada tal cual. */
  cita: string | null;
  reunion: ReunionDeLaSugerencia | null;
}

export function escribirMotivoDeEtapa(m: MotivoDeEtapa): string {
  return JSON.stringify({ v: 1, motivo: m.motivo, cita: m.cita, reunion: m.reunion });
}

export function leerMotivoDeEtapa(texto: string | null | undefined): MotivoDeEtapa | null {
  if (!texto || !texto.trim()) return null;
  try {
    const j = JSON.parse(texto) as Record<string, unknown>;
    if (j && j.v === 1 && typeof j.motivo === "string") {
      const r = j.reunion as Record<string, unknown> | null | undefined;
      const reunion =
        r && typeof r.id === "string" && typeof r.titulo === "string" && typeof r.fecha === "string"
          ? { id: r.id, titulo: r.titulo, fecha: r.fecha }
          : null;
      return { motivo: j.motivo, cita: typeof j.cita === "string" && j.cita.trim() ? j.cita : null, reunion };
    }
  } catch {
    /* texto plano: cae abajo */
  }
  return { motivo: texto.trim(), cita: null, reunion: null };
}

/** Una sugerencia lista para mostrar. */
export interface SugerenciaDeEtapa {
  stageId: string;
  hasta: string;
  desde: string | null;
  /** Cuántas etapas avanza; `null` si la de hoy está fuera de la línea o no se conoce. */
  salto: number | null;
  motivo: string;
  cita: string | null;
  reunion: ReunionDeLaSugerencia | null;
  /** Cuándo se detectó (ISO). */
  at: string | null;
}

export interface SugerenciaGuardada {
  stageId: string | null;
  motivo: string | null;
  at: Date | string | null;
}

/**
 * ¿La sugerencia guardada sigue en pie contra la etapa de HOY?
 *
 * `null` cuando: no hay sugerencia; la etapa sugerida no es movible en ESTE pipeline (terminal, de
 * otro tablero o retirada); el proyecto ya está ahí o más adelante (alguien la movió en HubSpot); la
 * etapa de hoy es de cierre; o la de hoy quedó FUERA de la línea (Bloqueado, Continuidad): la
 * situación cambió desde la reunión y una sugerencia de avance ya no responde a lo que pasa.
 */
export function sugerenciaVigente(
  def: PipelineDef | null,
  actualStageId: string | null | undefined,
  guardada: SugerenciaGuardada | null | undefined,
): SugerenciaDeEtapa | null {
  if (!def || !guardada?.stageId) return null;
  const destino = etapasProponibles(def).find((e) => e.id === guardada.stageId);
  if (!destino) return null;
  if (actualStageId && def.closedStageIds.includes(actualStageId)) return null;
  const actual = buscarEtapa(def, actualStageId);
  if (actual?.id === destino.id) return null;
  if (actual && !lineaDeAvance(def).some((s) => s.id === actual.id)) return null;
  const salto = saltoDeEtapas(def, actual?.id ?? null, destino.id);
  if (salto != null && salto <= 0) return null;
  const m = leerMotivoDeEtapa(guardada.motivo);
  const at = guardada.at instanceof Date ? guardada.at.toISOString() : guardada.at ?? null;
  return {
    stageId: destino.id,
    hasta: destino.label,
    desde: actual?.label ?? null,
    salto,
    motivo: m?.motivo ?? "",
    cita: m?.cita ?? null,
    reunion: m?.reunion ?? null,
    at,
  };
}

/**
 * ¿Una sugerencia nueva reemplaza a la que ya hay? Solo si va MÁS LEJOS: una reunión que muestra
 * Configuración implica que Diagnóstico ya pasó, pero no al revés. Con la misma etapa se queda la
 * primera: es la primera evidencia, y reemplazarla movería el «desde cuándo» de la espera.
 */
export function reemplazaA(def: PipelineDef, existenteStageId: string | null | undefined, nuevaStageId: string): boolean {
  if (!existenteStageId) return true;
  if (existenteStageId === nuevaStageId) return false;
  const linea = lineaDeAvance(def);
  const i = linea.findIndex((s) => s.id === existenteStageId);
  const j = linea.findIndex((s) => s.id === nuevaStageId);
  if (i < 0) return j >= 0;
  return j > i;
}

/** Lo que la ficha necesita para la encuesta de la etapa. */
export interface EtapaEnHubspot {
  actualStageId: string | null;
  actualLabel: string | null;
  /** Las etapas que se pueden elegir, en orden (sin las de cierre). */
  opciones: Array<{ id: string; label: string }>;
  sugerencia: SugerenciaDeEtapa | null;
  /** Por qué no se puede mover desde Nexus. `null` = se puede. */
  bloqueo: string | null;
}

/**
 * Arma lo de la encuesta. `null` cuando el proyecto no tiene nada que ver con un tablero de HubSpot
 * (sin registro y sin pipeline conocido): ahí no hay etapa que mover.
 */
export function etapaEnHubspot(input: {
  def: PipelineDef | null;
  hubspotServiceId: string | null | undefined;
  actualStageId: string | null | undefined;
  actualLabel: string | null | undefined;
  guardada: SugerenciaGuardada | null | undefined;
}): EtapaEnHubspot | null {
  const { def } = input;
  if (!def && !input.hubspotServiceId) return null;
  const actual = def ? buscarEtapa(def, input.actualStageId) : null;
  const base = {
    actualStageId: input.actualStageId ?? null,
    actualLabel: actual?.label ?? input.actualLabel ?? null,
    opciones: def ? etapasProponibles(def).map((e) => ({ id: e.id, label: e.label })) : [],
  };
  if (!input.hubspotServiceId) {
    return { ...base, sugerencia: null, bloqueo: "Este proyecto todavía no existe en HubSpot: termina el alta primero." };
  }
  if (!def) {
    return {
      ...base,
      sugerencia: null,
      bloqueo: "Nexus no reconoce el tablero de este proyecto en HubSpot, así que no mueve su etapa desde acá.",
    };
  }
  if (input.actualStageId && def.closedStageIds.includes(input.actualStageId)) {
    return {
      ...base,
      sugerencia: null,
      bloqueo: "Está en una etapa de cierre. Sacarlo de ahí lo reabre, y eso se decide en HubSpot.",
    };
  }
  return { ...base, sugerencia: sugerenciaVigente(def, input.actualStageId, input.guardada), bloqueo: null };
}
