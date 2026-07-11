/**
 * lib/external/kickoff-view-types.ts
 *
 * Contrato de tipos del shape LIMPIO que ve el cliente externo del Kickoff.
 * Archivo SOLO-tipos (sin imports de runtime) para que lo compartan el lib
 * server-side (kickoff-view.ts, que toca Prisma) y el componente client
 * (KickoffLanding/KickoffBlock) sin arrastrar Prisma al bundle del browser.
 *
 * CLAVE DE SEGURIDAD: el shape externo NO lleva `source` / `status` /
 * `agentRunId`. `RenderableBlock` deja `status`/`source` OPCIONALES: el modo
 * interno (editable) los trae vía BlockData; el shape externo los omite.
 */

export interface RenderableBlock {
  id: string;
  blockType: string;
  content: string | null;
  data: unknown;
  /** Solo presente en modo interno (editable). Ausente en el shape externo. */
  status?: string;
  /** Solo presente en modo interno (editable). Ausente en el shape externo. */
  source?: string;
}

/** Tipos del cronograma externo (D.1.5): viven en timeline-view-types.ts —
 *  compartidos por las DOS superficies. Acá quedan los alias históricos para
 *  no churnear a los consumidores del kickoff (KickoffLanding). */
import type {
  ExternalTimelineTask,
  ExternalTimelinePhase,
  ExternalTimelineData,
} from "./timeline-view-types";

export type KickoffTask = ExternalTimelineTask;
export type KickoffPhase = ExternalTimelinePhase;
export type KickoffTimelineData = ExternalTimelineData;

export interface KickoffSection {
  id: string;
  key: string;
  label: string;
  /** Título de cara al cliente editado por el CSE; null/ausente = título por defecto de la plantilla. */
  titleOverride?: string | null;
  /** Eyebrow (título pequeño) editado por el CSE; null/ausente = eyebrow por defecto. */
  eyebrowOverride?: string | null;
  /** Solo modo interno: valor previo para el deshacer de 1 nivel. Ausente en el shape externo. */
  previousTitleOverride?: string | null;
  previousEyebrowOverride?: string | null;
  order: number;
  blocks: RenderableBlock[];
}

/** Diagrama de proceso (FLOWCHART) del cliente, para la sección "Procesos" del kickoff. */
export interface KickoffProceso {
  id: string;
  title: string | null;
  /** { nodes, edges, description? } — shape de FlowchartViewer. */
  data: unknown;
  /** Solo modo interno (editable): DRAFT | CONFIRMED. El externo siempre trae CONFIRMED. */
  status?: string;
}

/** Lo que la ruta pública pasa como `data` a <KickoffLanding/>. */
export interface KickoffLandingData {
  projectName: string;
  /** Nombre de la EMPRESA cliente — fallback de texto de la brand-row del hero. */
  clientName?: string;
  /** Logo de la EMPRESA cliente (Client.logoUrl, bucket público) o null. */
  clientLogoUrl: string | null;
  /** Logo de Smarteam (config global) — imagen de la brand-row. */
  smarteamLogoUrl?: string | null;
  /** Mapa nombre→logo (hubspot / insider / smarteam): una marca de TEXTO cuyo nombre
   *  matchee se pinta como imagen en la brand-row. */
  brandLogos?: Record<string, string>;
  /** Logos de PLATAFORMA (HubSpot / Insider One, config global según tags del
   *  proyecto — platformLogosFor). Se pintan junto al logo del cliente en el hero. */
  platformLogos?: string[];
  sections: KickoffSection[];
  timeline: KickoffTimelineData;
  /** Procesos del cliente (solo CONFIRMED en la vista externa). */
  procesos: KickoffProceso[];
  /** Servicio recurrente (tag `recurrente` del handoff) — badge sutil client-facing.
   *  El CSE lo quita sacando el tag del proyecto en el editor. */
  recurrent: boolean;
}
