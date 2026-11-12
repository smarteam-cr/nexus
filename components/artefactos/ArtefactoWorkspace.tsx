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
import { Alert, Button, ConfirmDialog } from "@/components/ui";
import VeloDeGeneracion from "@/components/canvas/VeloDeGeneracion";
import { useToast } from "@/components/ui/Toast";
import { adaptadorDelTipo } from "./adaptadores";
import AgregarSeccion from "@/components/canvas/AgregarSeccion";
import { tipoDeArtefacto } from "@/lib/artefactos/tipos";

/** La píldora del chrome del motor: el mismo look que «Ocultar» (components/business-cases/SectionTools.tsx). */
const PILDORA_DE_BORRAR = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 9px",
  borderRadius: 999,
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  color: "#b91c1c",
} as const;

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
  conContenido,
  onGenerado,
}: {
  projectId: string;
  canvasId: string;
  tipo: string;
  clientName: string;
  /** ¿Tiene algo escrito de verdad? (el criterio del riel: la semilla no cuenta). Regenerar eso se confirma. */
  conContenido: boolean;
  /** Terminó una corrida: el panel vuelve a leer el listado (el punto del riel pasa a verde). */
  onGenerado?: () => void;
}) {
  const [nonce, setNonce] = useState(0);
  const cs = useCanvasSections(`/api/projects/${projectId}`, canvasId, undefined, { poll: false });
  const t = tipoDeArtefacto(tipo);
  const adaptador = adaptadorDelTipo(tipo);
  const toast = useToast();
  const [corrida, setCorrida] = useState<Corrida | null>(null);
  const [porBorrar, setPorBorrar] = useState<{ id: string; nombre: string } | null>(null);
  const base = `/api/projects/${projectId}/artefactos/${canvasId}/generar`;
  const vigilando = useRef<ReturnType<typeof setInterval> | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [marca, setMarca] = useState<Partial<LandingContext> | null>(null);
  const [resultados, setResultados] = useState<NonNullable<LandingContext["diagnostico"]>["resultados"]>(undefined);

  // El nombre y el logo del cliente: los mismos que abre el enlace (quien escribe ve lo que se comparte).
  useEffect(() => {
    void fetch(`/api/projects/${projectId}/client-logo`)
      .then(
        (r) =>
          (r.ok ? r.json() : null) as Promise<{
            clientName?: string;
            logoUrl?: string | null;
            logoDarkUrl?: string | null;
            logoScale?: number | null;
            smarteamLogoUrl?: string | null;
            brandLogos?: Record<string, string>;
          } | null>,
      )
      .then((j) => {
        if (!j) return;
        setMarca({
          clientName: j.clientName ?? clientName,
          clientLogoUrl: j.logoUrl ?? null,
          clientLogoDarkUrl: j.logoDarkUrl ?? null,
          clientLogoScale: j.logoScale ?? null,
          smarteamLogoUrl: j.smarteamLogoUrl ?? null,
          brandLogos: j.brandLogos ?? {},
        });
      })
      .catch(() => {});
    // La línea base y la meta de los objetivos, las mismas del enlace.
    if (tipo !== "diagnosis") return;
    void fetch(`/api/projects/${projectId}/handoff-resultados`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { resultados?: NonNullable<LandingContext["diagnostico"]>["resultados"] } | null) => setResultados(j?.resultados))
      .catch(() => {});
  }, [projectId, clientName, tipo]);

  /* Lo que hay que hacer al terminar una corrida, en un ref: `cs` es un objeto nuevo en cada render, y con él en las
     dependencias el efecto de abajo corría en cada render, pedía sin parar y borraba el intervalo antes de ver el fin. */
  const alTerminar = useRef<() => void>(() => {});
  useEffect(() => {
    alTerminar.current = () => {
      void cs.refetch();
      setNonce((n) => n + 1);
      onGenerado?.();
      toast.success(`Listo: ${t?.conArticulo ?? "el documento"} quedó escrito. Revísalo antes de compartirlo.`);
    };
  });

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
          if (c.estado === "DONE") alTerminar.current();
        }
      });
    }, 3000);
  }, [leerCorrida]);

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
      body: JSON.stringify({}),
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
  const ctx: LandingContext = useMemo(() => {
    const delTipo = adaptador?.ctx?.(sections) ?? {};
    return {
      clientName,
      ...(marca ?? {}),
      ...delTipo,
      ...(resultados && delTipo.diagnostico ? { diagnostico: { ...delTipo.diagnostico, resultados } } : {}),
      // El editor de una copia es del equipo: ve lo que el cliente no (el detalle técnico de las automatizaciones).
      planificacion: { ...delTipo.planificacion, delEquipo: true },
    };
  }, [adaptador, clientName, marca, resultados, sections]);
  const conDeLaIa = cs.sections.some((s) => s.blocks.some((b) => b.source === "AGENT"));
  const conAlgo = cs.sections.some((s) => s.key !== "cierre" && s.blocks.length > 0);
  const generando = corrida?.estado === "RUNNING";
  const portada = config?.sections[0]?.key;
  const estructurales: readonly string[] = t?.estructurales ?? [];

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
    <div className="relative space-y-3">
      {generando && (
        <VeloDeGeneracion
          rotulo={`Escribiendo ${t?.conArticulo ?? "el documento"}`}
          detalle={`${corrida?.fase && corrida.fase !== "Empezando…" ? `${corrida.fase} ` : ""}Puedes seguir en otra parte de Nexus: te avisa al terminar.`}
        />
      )}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2 text-xs">
        <span className="min-w-0 flex-1 text-fg-secondary">
          {conDeLaIa
            ? "Regenerar reescribe las secciones que escribe la IA, también lo que corregiste a mano. Queda una foto de antes en las versiones."
            : `La IA escribe ${t?.conArticulo ?? "el documento"} con lo vendido, las reuniones del proyecto (o solo las que elijas en «Contexto adicional») y los demás documentos.`}
        </span>
        <Button size="xs" variant={conDeLaIa ? "secondary" : "primary"} disabled={generando} onClick={() => (conContenido || conDeLaIa ? setConfirmando(true) : void generar())}>
          {conDeLaIa ? "Regenerar con IA" : "Generar con IA"}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmando}
        title="¿Regenerar este documento?"
        description="La IA reescribe sus secciones, también lo que corregiste a mano. Lo de antes queda en las versiones, de donde puedes traerlo."
        confirmLabel="Regenerar"
        onCancel={() => setConfirmando(false)}
        onConfirm={() => {
          setConfirmando(false);
          void generar();
        }}
      />
      {corrida?.estado === "ERROR" && corrida.error && <Alert variant="danger">{corrida.error}</Alert>}
      {cs.error && (
        <Alert variant="danger" onDismiss={() => cs.clearError()}>
          {cs.error}
        </Alert>
      )}
      <ConfirmDialog
        open={!!porBorrar}
        title={`¿Borrar «${porBorrar?.nombre}»?`}
        description="Se va de este documento con todo lo que tenga escrito, regenerar no la devuelve y no se puede deshacer. Para esconderla del cliente sin perderla, usa «Ocultar»."
        confirmLabel="Borrar"
        onCancel={() => setPorBorrar(null)}
        onConfirm={() => {
          if (porBorrar) void cs.removeSection(porBorrar.id);
          setPorBorrar(null);
        }}
      />
      {conAlgo && !generando && (
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
      <div inert={generando} className={`stl ${adaptador.palette === "internal" ? "stl-internal" : ""} overflow-hidden rounded-xl border border-line`}>
        <LandingView
          key={nonce}
          config={config}
          ctx={ctx}
          sections={sections}
          mode="edit"
          palette={adaptador.palette}
          showBriefs={false}
          // Borrar, en toda sección menos la portada y el cierre (Elías, 30 oct). Ocultar y mover los pinta el motor.
          renderOverlay={(key) => {
            const s = cs.sections.find((x) => x.key === key);
            if (!s || estructurales.includes(key)) return null;
            return (
              <button type="button" style={PILDORA_DE_BORRAR} onClick={() => setPorBorrar({ id: s.id, nombre: s.titleOverride?.trim() || s.label })} title="Borrar esta sección" aria-label="Borrar esta sección">
                ✕ Borrar
              </button>
            );
          }}
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
          onDuplicate={(key) => {
            const id = idPorKey.get(key);
            if (id) void cs.duplicateSection(id);
          }}
        />
      </div>
      {/* «+ Agregar sección» (2026-11-12): las del catálogo de su tipo (la IA las escribe al generar) o una propia. */}
      {!generando && (
        <AgregarSeccion
          projectId={projectId}
          canvasId={canvasId}
          cuantasSecciones={cs.sections.length}
          seMuestra={(k) => adaptador.config([k]).sections.some((d) => d.key === k)}
          onAgregarDelCatalogo={(k) => cs.addCatalogSection(k)}
          onAgregarPropia={(nombre, tipo) => cs.addSection(nombre, tipo)}
        />
      )}
    </div>
  );
}
