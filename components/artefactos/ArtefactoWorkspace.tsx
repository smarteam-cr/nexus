"use client";

/**
 * components/artefactos/ArtefactoWorkspace.tsx — el editor de una COPIA de un tipo (etapa V3 de docs/artefactos-plan.md):
 * una segunda planificación, otro kickoff, un plan de adopción, una integración técnica.
 *
 * No reusa el editor de siempre de cada tipo a propósito: esos traen sus botones (generar por /analyze, el selector de
 * plantilla, publicar el kickoff), que buscan el documento por su `slug` y le escribirían al de siempre. Este pinta el
 * MISMO motor con el MISMO adaptador del tipo (components/artefactos/adaptadores.ts, que comparten la vista del enlace y
 * el PDF: quien escribe ve lo que se comparte), edita por id, y genera por su propia puerta
 * (`/artefactos/[canvasId]/generar`). «Mejorar con IA» es el assist de siempre (`canvas-assist`, por id).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LandingView, { type LandingSectionData } from "@/components/landing/LandingView";
import type { LandingContext } from "@/components/landing/types";
import { useCanvasSections } from "@/components/canvas/useCanvasSections";
import DocumentAssist from "@/components/ai/DocumentAssist";
import { Alert, Button, Input } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { adaptadorDelTipo } from "./adaptadores";
import { tipoDeArtefacto } from "@/lib/artefactos/tipos";

interface Corrida {
  id: string;
  estado: "RUNNING" | "DONE" | "ERROR";
  fase: string | null;
  error: string | null;
}

export default function ArtefactoWorkspace({
  projectId,
  canvasId,
  tipo,
  clientName,
  onGenerado,
}: {
  projectId: string;
  canvasId: string;
  tipo: string;
  clientName: string;
  /** Terminó una corrida: el panel vuelve a leer el listado (el punto del riel pasa a verde). */
  onGenerado?: () => void;
}) {
  const [nonce, setNonce] = useState(0);
  const cs = useCanvasSections(`/api/projects/${projectId}`, canvasId, undefined, { poll: false });
  const t = tipoDeArtefacto(tipo);
  const adaptador = adaptadorDelTipo(tipo);
  const toast = useToast();
  const [corrida, setCorrida] = useState<Corrida | null>(null);
  const [instrucciones, setInstrucciones] = useState("");
  const base = `/api/projects/${projectId}/artefactos/${canvasId}/generar`;
  const vigilando = useRef<ReturnType<typeof setInterval> | null>(null);

  const leerCorrida = useCallback(async (): Promise<Corrida | null> => {
    const r = await fetch(base).catch(() => null);
    if (!r?.ok) return null;
    const j = (await r.json().catch(() => null)) as { corrida: Corrida | null } | null;
    return j?.corrida ?? null;
  }, [base]);

  const vigilar = useCallback(() => {
    if (vigilando.current) return;
    vigilando.current = setInterval(() => {
      void leerCorrida().then((c) => {
        setCorrida(c);
        if (c && c.estado !== "RUNNING") {
          if (vigilando.current) clearInterval(vigilando.current);
          vigilando.current = null;
          if (c.estado === "DONE") {
            void cs.refetch();
            setNonce((n) => n + 1);
            onGenerado?.();
            toast.success(`Listo: ${t?.conArticulo ?? "el documento"} quedó escrito. Revísalo antes de compartirlo.`);
          }
        }
      });
    }, 3000);
  }, [cs, leerCorrida, onGenerado, t, toast]);

  // Al abrir, ¿ya se estaba generando? (otra pestaña, o se recargó a mitad).
  useEffect(() => {
    void leerCorrida().then((c) => {
      setCorrida(c);
      if (c?.estado === "RUNNING") vigilar();
    });
    return () => {
      if (vigilando.current) clearInterval(vigilando.current);
      vigilando.current = null;
    };
  }, [leerCorrida, vigilar]);

  const generar = async () => {
    const r = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instrucciones: instrucciones.trim() || null }),
    }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { runId?: string; error?: string } | null;
    if (!r?.ok || !j?.runId) return toast.error(j?.error ?? "No se pudo empezar. Inténtalo de nuevo.");
    setCorrida({ id: j.runId, estado: "RUNNING", fase: "Empezando…", error: null });
    vigilar();
  };

  const idPorKey = useMemo(() => new Map(cs.sections.map((s) => [s.key, s.id])), [cs.sections]);
  const config = useMemo(() => adaptador?.config(cs.sections.map((s) => s.key)) ?? null, [adaptador, cs.sections]);
  const sections: LandingSectionData[] = useMemo(() => {
    if (!adaptador) return [];
    const built = adaptador.sections(cs.sections);
    return cs.sections.map((s, i) => ({
      key: s.key,
      data: built[i]?.data ?? null,
      titleOverride: s.titleOverride,
      eyebrowOverride: s.eyebrowOverride,
      hidden: s.hidden === true,
    }));
  }, [adaptador, cs.sections]);
  const ctx: LandingContext = useMemo(() => ({ clientName, ...(adaptador?.ctx?.(sections) ?? {}) }), [adaptador, clientName, sections]);
  const conDeLaIa = cs.sections.some((s) => s.blocks.some((b) => b.source === "AGENT"));
  const conAlgo = cs.sections.some((s) => s.key !== "cierre" && s.blocks.length > 0);
  const generando = corrida?.estado === "RUNNING";
  const portada = config?.sections[0]?.key;

  if (!adaptador || !config) {
    return <Alert variant="danger">Este documento es de un tipo que todavía no se puede abrir acá ({tipo}).</Alert>;
  }
  if (cs.loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="min-h-[120px] rounded-lg border border-line bg-surface p-5">
            <div className="skeleton-shimmer h-3 w-1/3 rounded" />
            <div className="skeleton-shimmer mt-3 h-2.5 w-4/5 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2 text-xs">
        {generando ? (
          <span className="flex-1 text-fg-secondary">{corrida?.fase ?? "Generando…"} Puedes seguir en otra parte de Nexus: te avisa al terminar.</span>
        ) : (
          <>
            <span className="text-fg-secondary">
              {conDeLaIa ? "Regenerar reescribe lo que escribió la IA (queda una foto de antes en las versiones)." : `La IA escribe ${t?.conArticulo ?? "el documento"} con el handoff, las reuniones y los demás documentos del proyecto.`}
            </span>
            <Input
              value={instrucciones}
              onChange={(e) => setInstrucciones(e.target.value)}
              maxLength={2000}
              placeholder="Qué quieres que tenga en cuenta (opcional)"
              aria-label="Instrucciones para esta generación"
              className="min-w-[220px] flex-1 text-xs"
            />
            <Button size="xs" variant={conDeLaIa ? "secondary" : "primary"} onClick={() => void generar()}>
              {conDeLaIa ? "Regenerar con IA" : "Generar con IA"}
            </Button>
          </>
        )}
      </div>
      {corrida?.estado === "ERROR" && corrida.error && <Alert variant="danger">{corrida.error}</Alert>}
      {cs.error && (
        <Alert variant="danger" onDismiss={() => cs.clearError()}>
          {cs.error}
        </Alert>
      )}
      {/* La exploración no tiene «Mejorar con IA»: sus marcas de «ya la pregunté» viven anidadas (lib/canvas/assist-de-documento.ts). */}
      {conAlgo && !generando && tipo !== "exploration" && (
        <DocumentAssist
          url={`/api/projects/${projectId}/canvas-assist`}
          extraBody={{ canvasId }}
          dialogTitle={`Mejorar «${t?.nombre ?? "el documento"}» con IA`}
          chips={["Hazlo más concreto", "Ordénalo por prioridad", "Sácale lo que no está respaldado"]}
          placeholder='Ej.: "agrega la sección de lo que debe entregar el cliente"'
          labelFor={(key) => cs.sections.find((s) => s.key === key)?.label ?? key}
          onApplySection={(key, data) => {
            const s = cs.sections.find((x) => x.key === key);
            if (!s) return;
            const card = s.blocks.find((b) => b.blockType === "CARD");
            return cs.upsertCardData(s.id, card?.id ?? null, data);
          }}
        />
      )}
      <div className={`stl ${adaptador.palette === "internal" ? "stl-internal" : ""} overflow-hidden rounded-xl border border-line`}>
        <LandingView
          key={nonce}
          config={config}
          ctx={ctx}
          sections={sections}
          mode="edit"
          palette={adaptador.palette}
          showBriefs={false}
          onSectionChange={(key, data) => {
            const s = cs.sections.find((x) => x.key === key);
            if (!s) return;
            const card = s.blocks.find((b) => b.blockType === "CARD");
            if (!card && s.blocks.length > 0) return; // markdown viejo: solo lectura
            void cs.upsertCardData(s.id, card?.id ?? null, data);
          }}
          onTitleChange={(key, title) => {
            const id = idPorKey.get(key);
            if (id) void cs.renameSection(id, title);
          }}
          onEyebrowChange={(key, eyebrow) => {
            const id = idPorKey.get(key);
            if (id) void cs.setEyebrow(id, eyebrow);
          }}
          onToggleHidden={(key, hidden) => {
            const id = idPorKey.get(key);
            if (id) void cs.setHidden(id, hidden);
          }}
          onReorder={(keys) => {
            const ids = [portada ? idPorKey.get(portada) : undefined, ...keys.map((k) => idPorKey.get(k))].filter((x): x is string => !!x);
            if (ids.length) cs.reorderSections(ids);
          }}
        />
      </div>
    </div>
  );
}
