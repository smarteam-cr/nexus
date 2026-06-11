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
  order: number;
  blocks: RenderableBlock[];
}

/** Lo que la ruta pública pasa como `data` a <KickoffLanding/>. */
export interface KickoffLandingData {
  projectName: string;
  sections: KickoffSection[];
  timeline: KickoffTimelineData;
}
