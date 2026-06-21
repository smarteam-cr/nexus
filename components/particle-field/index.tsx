"use client";

import { useEffect, useRef } from "react";

import { ParticleEngine } from "./engine";
import {
  DEFAULT_PALETTE,
  type ParticleFieldProps,
  type ResolvedConfig,
} from "./types";

export type { ParticleFieldProps } from "./types";

function resolveConfig(props: ParticleFieldProps): ResolvedConfig {
  return {
    density: props.density ?? "low",
    palette: { ...DEFAULT_PALETTE, ...props.palette },
    connectionDistance: props.connectionDistance ?? 140,
    paused: props.paused ?? false,
    startDelayMs: props.startDelayMs ?? 0,
  };
}

export default function ParticleField(props: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ParticleEngine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new ParticleEngine(canvas, resolveConfig(props));
    engineRef.current = engine;
    engine.start();

    return () => {
      engine.stop();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.updateConfig(resolveConfig(props));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    props.density,
    props.connectionDistance,
    props.paused,
    props.startDelayMs,
    props.palette?.background,
    props.palette?.nodes,
    props.palette?.packets,
    props.palette?.hexagons,
  ]);

  const className = props.className
    ? `nx-login__canvas ${props.className}`
    : "nx-login__canvas";

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
