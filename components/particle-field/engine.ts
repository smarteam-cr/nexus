import { drawConnections } from "./connections";
import { DataNode, DataPacket, Hexagon } from "./particles";
import { DENSITY_PRESETS, type ResolvedConfig } from "./types";

const RESIZE_DEBOUNCE_MS = 150;
const DPR_CAP = 2;
const FILL_TIME_SEC = 2.2;

export class ParticleEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private config: ResolvedConfig;

  private nodes: DataNode[] = [];
  private packets: DataPacket[] = [];
  private hexagons: Hexagon[] = [];
  private spawnAccum = { nodes: 0, packets: 0, hexagons: 0 };

  private rafId: number | null = null;
  private lastTime = 0;
  private cssWidth = 0;
  private cssHeight = 0;
  private dpr = 1;

  private resizeTimeout: number | null = null;
  private startTimeout: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readonly motionMql: MediaQueryList | null;
  private reducedMotion = false;

  private readonly handleResize = (): void => {
    if (this.resizeTimeout !== null) {
      window.clearTimeout(this.resizeTimeout);
    }
    this.resizeTimeout = window.setTimeout(() => {
      this.resizeTimeout = null;
      this.applyDimensions();
      if (this.reducedMotion) this.tick(0);
    }, RESIZE_DEBOUNCE_MS);
  };

  private readonly handleVisibility = (): void => {
    if (document.hidden) {
      this.cancelFrame();
    } else if (!this.reducedMotion && !this.config.paused) {
      this.lastTime = performance.now();
      this.scheduleFrame();
    }
  };

  private readonly handleMotionChange = (e: MediaQueryListEvent): void => {
    this.reducedMotion = e.matches;
    if (this.reducedMotion) {
      this.cancelFrame();
      this.tick(0);
    } else if (!this.config.paused && !document.hidden) {
      this.lastTime = performance.now();
      this.scheduleFrame();
    }
  };

  constructor(canvas: HTMLCanvasElement, config: ResolvedConfig) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context not available");
    this.ctx = ctx;
    this.config = config;

    this.motionMql =
      typeof window !== "undefined" && "matchMedia" in window
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    this.reducedMotion = this.motionMql?.matches ?? false;
  }

  start(): void {
    this.applyDimensions();

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(this.handleResize);
      this.resizeObserver.observe(this.canvas);
    } else {
      window.addEventListener("resize", this.handleResize);
    }
    document.addEventListener("visibilitychange", this.handleVisibility);
    this.motionMql?.addEventListener("change", this.handleMotionChange);

    if (this.reducedMotion) {
      this.tick(0);
      return;
    }
    if (!this.config.paused && !document.hidden) {
      const beginLoop = () => {
        this.startTimeout = null;
        this.lastTime = performance.now();
        this.scheduleFrame();
      };
      if (this.config.startDelayMs > 0) {
        this.startTimeout = window.setTimeout(beginLoop, this.config.startDelayMs);
      } else {
        beginLoop();
      }
    }
  }

  stop(): void {
    this.cancelFrame();
    if (this.startTimeout !== null) {
      window.clearTimeout(this.startTimeout);
      this.startTimeout = null;
    }
    if (this.resizeTimeout !== null) {
      window.clearTimeout(this.resizeTimeout);
      this.resizeTimeout = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    } else {
      window.removeEventListener("resize", this.handleResize);
    }
    document.removeEventListener("visibilitychange", this.handleVisibility);
    this.motionMql?.removeEventListener("change", this.handleMotionChange);
  }

  updateConfig(config: ResolvedConfig): void {
    const wasPaused = this.config.paused;
    this.config = config;
    this.applyPaletteToParticles();

    if (config.paused && !wasPaused) {
      this.cancelFrame();
    } else if (!config.paused && wasPaused && !this.reducedMotion && !document.hidden) {
      this.lastTime = performance.now();
      this.scheduleFrame();
    }
  }

  private applyDimensions(): void {
    const parent = this.canvas.parentElement;
    const source = parent ?? this.canvas;
    const rect = source.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.floor(rect.width));
    const cssHeight = Math.max(1, Math.floor(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);

    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.dpr = dpr;

    this.canvas.width = cssWidth * dpr;
    this.canvas.height = cssHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private applyPaletteToParticles(): void {
    const { nodes, packets, hexagons } = this.config.palette;
    for (const n of this.nodes) n.color = nodes;
    for (const p of this.packets) p.color = packets;
    for (const h of this.hexagons) h.color = hexagons;
  }

  private respawn(dt: number): void {
    const target = DENSITY_PRESETS[this.config.density];
    const { nodes: nc, packets: pc, hexagons: hc } = this.config.palette;
    const w = this.cssWidth;
    const h = this.cssHeight;

    const rateNodes = target.nodes / FILL_TIME_SEC;
    const ratePackets = target.packets / FILL_TIME_SEC;
    const rateHex = target.hexagons / FILL_TIME_SEC;

    this.spawnAccum.nodes += rateNodes * dt;
    while (this.spawnAccum.nodes >= 1 && this.nodes.length < target.nodes) {
      this.nodes.push(new DataNode(w, h, nc));
      this.spawnAccum.nodes -= 1;
    }
    if (this.nodes.length >= target.nodes) this.spawnAccum.nodes = 0;

    this.spawnAccum.packets += ratePackets * dt;
    while (this.spawnAccum.packets >= 1 && this.packets.length < target.packets) {
      this.packets.push(new DataPacket(w, h, pc));
      this.spawnAccum.packets -= 1;
    }
    if (this.packets.length >= target.packets) this.spawnAccum.packets = 0;

    this.spawnAccum.hexagons += rateHex * dt;
    while (this.spawnAccum.hexagons >= 1 && this.hexagons.length < target.hexagons) {
      this.hexagons.push(new Hexagon(w, h, hc));
      this.spawnAccum.hexagons -= 1;
    }
    if (this.hexagons.length >= target.hexagons) this.spawnAccum.hexagons = 0;
  }

  private scheduleFrame(): void {
    this.rafId = requestAnimationFrame(this.frame);
  }

  private cancelFrame(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private readonly frame = (now: number): void => {
    const dt = Math.min(0.05, (now - this.lastTime) / 1000 || 0);
    this.lastTime = now;
    this.tick(dt);
    if (!this.config.paused && !this.reducedMotion) {
      this.scheduleFrame();
    }
  };

  private tick(dt: number): void {
    const { ctx, cssWidth, cssHeight } = this;

    ctx.clearRect(0, 0, cssWidth, cssHeight);

    this.hexagons = this.hexagons.filter((h) => h.update(dt, cssWidth, cssHeight));
    this.nodes = this.nodes.filter((n) => n.update(dt, cssWidth, cssHeight));
    this.packets = this.packets.filter((p) => p.update(dt, cssWidth, cssHeight));

    if (dt > 0) this.respawn(dt);

    for (const h of this.hexagons) h.draw(ctx);

    drawConnections(
      ctx,
      this.nodes,
      this.config.connectionDistance,
      this.config.palette.nodes,
    );

    for (const n of this.nodes) n.draw(ctx);
    for (const p of this.packets) p.draw(ctx);

    ctx.globalAlpha = 1;
  }
}
