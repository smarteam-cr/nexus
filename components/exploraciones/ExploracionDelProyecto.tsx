"use client";

/**
 * ExploracionDelProyecto — la pieza Exploración de un proyecto: el lienzo de la preventa con las
 * preguntas de Customer Success (2026-10-07, pedido de Elías: «copia todo el módulo de exploración de las
 * preventas y aplícalo a los proyectos… la única diferencia deberían ser las preguntas»).
 *
 * Pide la exploración del proyecto (`/api/projects/[projectId]/exploracion`); si todavía no hay y quien
 * mira puede trabajarla, la abre (con lo que dejó la preventa). Después monta `LienzoDeExploracion` en
 * modo proyecto: las sesiones cuelgan de la fila «Exploración» del riel de la ficha (con «Informe
 * anterior») y el panel de la derecha es el de la ficha. Los cuestionarios salieron de acá el 2026-10-11:
 * son su propia pieza, entre el Kickoff y la Exploración (ProjectCanvasPanel monta CuestionarioPanel).
 */
import { useEffect, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui";
import { SkeletonPanel } from "@/components/ui/Skeleton";
import type { EscalaDelLienzo } from "@/lib/exploraciones/escala-del-lienzo";
import type { ExploracionParaLaPantalla } from "@/lib/exploraciones/servidor";
import LienzoDeExploracion from "./LienzoDeExploracion";

interface Respuesta {
  exploracion: ExploracionParaLaPantalla | null;
  escala: EscalaDelLienzo | null;
  puedeEditar: boolean;
  /** Puede conversar con el chat de la cuenta: la guía ofrece «Mejorar con el asistente». */
  conAsistente?: boolean;
  error?: string;
}

type Estado = { tipo: "cargando" } | { tipo: "error"; mensaje: string } | { tipo: "sin-empezar" } | { tipo: "lista"; r: Respuesta & { exploracion: ExploracionParaLaPantalla; escala: EscalaDelLienzo } };

async function pedir(url: string, method: "GET" | "POST"): Promise<Respuesta> {
  const res = await fetch(url, { method });
  const data = (await res.json().catch(() => ({}))) as Respuesta;
  if (!res.ok) throw new Error(data.error ?? "No se pudo abrir la exploración.");
  return data;
}

export default function ExploracionDelProyecto({
  projectId,
  slotDelPanel,
  slotDeSesiones,
  informeAnterior,
}: {
  projectId: string;
  /** El panel de la derecha de la ficha (null si está oculto). */
  slotDelPanel: HTMLElement | null;
  /** Debajo de la fila «Exploración» del riel de la ficha. */
  slotDeSesiones: HTMLElement | null;
  /** El informe viejo en solo lectura (ya dentro de su marco); null si el proyecto no tenía. */
  informeAnterior: ReactNode | null;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });

  useEffect(() => {
    let vivo = true;
    const url = `/api/projects/${projectId}/exploracion`;
    (async () => {
      try {
        let r = await pedir(url, "GET");
        // Sin exploración todavía: quien puede trabajarla la abre al entrar (con lo que dejó la preventa).
        if (!r.exploracion && r.puedeEditar) r = await pedir(url, "POST");
        if (!vivo) return;
        if (r.exploracion && r.escala) setEstado({ tipo: "lista", r: { ...r, exploracion: r.exploracion, escala: r.escala } });
        else setEstado({ tipo: "sin-empezar" });
      } catch (e) {
        if (vivo) setEstado({ tipo: "error", mensaje: e instanceof Error ? e.message : "No se pudo abrir la exploración." });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [projectId]);

  if (estado.tipo === "cargando") return <SkeletonPanel minH="min-h-[420px]" />;
  if (estado.tipo === "error") return <Alert variant="danger">{estado.mensaje}</Alert>;
  if (estado.tipo === "sin-empezar") {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-10 text-center">
        <p className="text-sm font-medium text-fg">La exploración de este proyecto todavía no empezó.</p>
        <p className="mt-1 text-sm text-fg-muted">La abre quien puede trabajarla: el CSE del proyecto.</p>
      </div>
    );
  }
  const { r } = estado;
  return (
    <LienzoDeExploracion
      key={r.exploracion.id}
      inicial={r.exploracion}
      escala={r.escala}
      puedeEditar={r.puedeEditar}
      puedeProponer={false}
      conAsistente={!!r.conAsistente}
      proyecto={{
        slotDelPanel,
        slotDeSesiones,
        informeAnterior,
      }}
    />
  );
}
