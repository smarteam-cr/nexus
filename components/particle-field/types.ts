export type Density = "low" | "medium" | "high" | "ultra";

export type Palette = {
  background: string;
  nodes: string;
  packets: string;
  hexagons: string;
};

export type ResolvedConfig = {
  density: Density;
  palette: Palette;
  connectionDistance: number;
  paused: boolean;
  startDelayMs: number;
};

export type ParticleFieldProps = {
  density?: Density;
  palette?: Partial<Palette>;
  paused?: boolean;
  className?: string;
  connectionDistance?: number;
  startDelayMs?: number;
};

export interface Particle {
  update(dt: number, width: number, height: number): boolean;
  draw(ctx: CanvasRenderingContext2D): void;
}

export const DEFAULT_PALETTE: Palette = {
  background: "#f7faff",
  nodes: "#3b82f6",
  packets: "#22d3ee",
  hexagons: "#2563eb",
};

export const DENSITY_PRESETS: Record<
  Density,
  { nodes: number; packets: number; hexagons: number }
> = {
  low: { nodes: 160, packets: 110, hexagons: 22 },
  medium: { nodes: 320, packets: 210, hexagons: 38 },
  high: { nodes: 520, packets: 340, hexagons: 55 },
  ultra: { nodes: 780, packets: 520, hexagons: 75 },
};

export const SPAWN_RADIUS = 260;
