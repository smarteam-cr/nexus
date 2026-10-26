"use client";

/**
 * components/clients/DocumentoDeLaEmpresaWorkspace.tsx — el editor de un documento de la EMPRESA, sin proyecto (R3 etapas
 * 2 y 3, 2026-10-27): hoy, el diagnóstico de un prospecto.
 *
 * El mismo motor y el mismo adaptador que el diagnóstico de un proyecto (y que la vista de la empresa,
 * components/external/DocumentoDeLaEmpresaClientView.tsx): quien lo escribe ve lo que la empresa abre. Las rutas son las
 * de la empresa (`/api/clients/[id]/documentos/[canvasId]/…`), con su puerta. Se escribe a mano: sin «Generar» ni
 * «Mejorar con IA» (las dos leen el handoff y las reuniones de un proyecto). Arriba, la barra para compartir con la
 * empresa: el enlace, actualizar lo que ve y dejar de compartir.
 *
 * La barra es del equipo (UI interna: primitivas, tokens, tuteo); el documento es tema claro del motor.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import LandingView, { type LandingSectionData } from "@/components/landing/LandingView";
import type { LandingContext } from "@/components/landing/types";
import { useCanvasSections } from "@/components/canvas/useCanvasSections";
import { buildDiagnosticoConfig, buildDiagnosticoSections, ctxDelDiagnostico } from "@/components/canvas/diagnostico-landing-adapter";
import { Alert, Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";

interface Compartido {
  publicadoEn: string | null;
  enlace: string | null;
  cambiosSinPublicar: boolean;
}

export default function DocumentoDeLaEmpresaWorkspace({ clientId, canvasId, clientName }: { clientId: string; canvasId: string; clientName: string }) {
  const base = `/api/clients/${clientId}/documentos/${canvasId}`;
  const [cambio, setCambio] = useState(0);
  const cs = useCanvasSections(base, canvasId, () => setCambio((n) => n + 1), { poll: false });
  const [compartido, setCompartido] = useState<Compartido | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const toast = useToast();

  const leer = useCallback(async () => {
    const r = await fetch(`${base}/publicar`).catch(() => null);
    if (r?.ok) setCompartido((await r.json()) as Compartido);
  }, [base]);
  useEffect(() => {
    void leer();
  }, [leer, cambio]);

  const compartir = async (metodo: "POST" | "DELETE") => {
    setTrabajando(true);
    try {
      const r = await fetch(`${base}/publicar`, { method: metodo });
      const j = (await r.json().catch(() => null)) as (Compartido & { error?: string }) | null;
      if (!r.ok || !j) return toast.error(j?.error ?? "No se pudo. Vuelve a intentarlo.");
      setCompartido(j);
      toast.success(metodo === "DELETE" ? "Dejaste de compartirlo: el enlace ya no abre." : "Listo: la empresa ve esta versión.");
    } catch {
      toast.error("Error de conexión.");
    } finally {
      setTrabajando(false);
    }
  };

  const config = useMemo(() => buildDiagnosticoConfig(cs.sections.map((s) => s.key)), [cs.sections]);
  const sections: LandingSectionData[] = useMemo(() => {
    const built = buildDiagnosticoSections(cs.sections);
    return cs.sections.map((s, i) => ({
      key: s.key,
      data: built[i].data,
      titleOverride: s.titleOverride,
      eyebrowOverride: s.eyebrowOverride,
      hidden: s.hidden === true,
    }));
  }, [cs.sections]);
  const idByKey = useMemo(() => new Map(cs.sections.map((s) => [s.key, s.id])), [cs.sections]);
  const ctx: LandingContext = useMemo(() => ({ clientName, diagnostico: ctxDelDiagnostico(sections) }), [clientName, sections]);

  if (cs.loading) {
    return (
      <div className="mx-auto max-w-[960px] space-y-4 px-4 py-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="min-h-[120px] rounded-lg border border-line bg-surface p-5">
            <div className="skeleton-shimmer h-3 w-1/3 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="mx-auto flex w-full max-w-[960px] flex-wrap items-center gap-3 px-4 py-3 text-xs">
        {compartido?.enlace ? (
          <>
            <span className="text-fg-secondary">
              La empresa lo ve en su enlace
              {compartido.publicadoEn ? ` desde el ${new Date(compartido.publicadoEn).toLocaleDateString("es-CR", { day: "numeric", month: "long", timeZone: "America/Costa_Rica" })}` : ""}.
              {compartido.cambiosSinPublicar ? " Tiene cambios que todavía no ve." : ""}
            </span>
            <Button
              size="xs"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(compartido.enlace!).then(() => toast.success("Enlace copiado."));
              }}
            >
              Copiar el enlace
            </Button>
            {compartido.cambiosSinPublicar && (
              <Button size="xs" variant="primary" loading={trabajando} onClick={() => void compartir("POST")}>
                Actualizar lo que ve
              </Button>
            )}
            <Button size="xs" variant="ghost" disabled={trabajando} onClick={() => void compartir("DELETE")}>
              Dejar de compartir
            </Button>
          </>
        ) : (
          <>
            <span className="text-fg-secondary">Solo lo ve el equipo. Al compartirlo, la empresa lo abre con un enlace, sin contraseña.</span>
            <Button size="xs" variant="primary" loading={trabajando} onClick={() => void compartir("POST")}>
              Compartir con la empresa
            </Button>
          </>
        )}
      </div>
      {cs.error && (
        <div className="mx-auto w-full max-w-[960px] px-4">
          <Alert variant="danger" onDismiss={() => cs.clearError()}>
            {cs.error}
          </Alert>
        </div>
      )}
      <div className="stl stl-internal">
        <LandingView
          config={config}
          ctx={ctx}
          sections={sections}
          mode="edit"
          palette="internal"
          showBriefs={false}
          onSectionChange={(key, data) => {
            const s = cs.sections.find((x) => x.key === key);
            if (!s) return;
            const card = s.blocks.find((b) => b.blockType === "CARD");
            if (!card && s.blocks.length > 0) return; // markdown viejo: solo lectura
            void cs.upsertCardData(s.id, card?.id ?? null, data);
          }}
          onTitleChange={(key, title) => {
            const id = idByKey.get(key);
            if (id) void cs.renameSection(id, title);
          }}
          onEyebrowChange={(key, eyebrow) => {
            const id = idByKey.get(key);
            if (id) void cs.setEyebrow(id, eyebrow);
          }}
          onToggleHidden={(key, hidden) => {
            const id = idByKey.get(key);
            if (id) void cs.setHidden(id, hidden);
          }}
          onReorder={(keys) => {
            const heroId = idByKey.get("diagnostico");
            const ids = [heroId, ...keys.map((k) => idByKey.get(k))].filter((x): x is string => !!x);
            if (ids.length) cs.reorderSections(ids);
          }}
        />
      </div>
    </div>
  );
}
