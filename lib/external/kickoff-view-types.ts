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

export interface KickoffPhase {
  id: string;
  name: string;
  order: number;
  durationWeeks: number;
  sessionCount: number | null;
  notes: string | null;
}

export interface KickoffTimelineData {
  exists: boolean;
  anchorStartDate: string | null;
  phases: KickoffPhase[];
}

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
