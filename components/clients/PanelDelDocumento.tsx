"use client";

/**
 * PanelDelDocumento — la columna derecha de la ficha mientras se mira un DOCUMENTO del proyecto
 * (rediseño del 2026-10-04, sistema «Nexus · interfaz interna»). La pinta `ProjectCanvasPanel`
 * por portal; con el panel oculto no existe.
 *
 *  · «Qué sigue»: si el documento está vacío o quedó desactualizado, eso y el botón que lo
 *    resuelve; si está al día, el «Qué sigue» del proyecto (el mismo del Resumen).
 *  · «Este documento»: cuándo lo escribió la IA, quién lo lanzó, con cuántas reuniones, y
 *    cuántas versiones anteriores guarda.
 *  · «Secciones»: el índice, para saltar dentro de un documento largo. Lo que no está en
 *    pantalla (una sección oculta) no hace nada al tocarlo.
 */
import { useEffect, useState, type ReactNode } from "react";
import { QueSigue, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";

interface Corrida {
  createdAt: string;
  estado: string;
  lanzadaPor: string | null;
  sesionesFuente: number;
  vigente: boolean;
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export default function PanelDelDocumento({
  projectId,
  canvasId,
  etiqueta,
  grupoDelAgente,
  generada,
  desactualizada,
  motivoPrevio,
  accion,
  queSigueDelProyecto,
  queSigueOcupado,
  secciones: seccionesCrudas,
}: {
  projectId: string;
  canvasId: string;
  etiqueta: string;
  /** `Agent.agentGroup` que escribe este documento; null si no lo escribe un agente. */
  grupoDelAgente: string | null;
  generada: boolean;
  desactualizada: boolean;
  /** «Antes: Kickoff» en frase: lo que le falta para generarse bien (no bloquea). */
  motivoPrevio: string | null;
  /** El botón del agente (Generar / Regenerar) cuando el documento lo necesita. */
  accion: ReactNode | null;
  /** El «Qué sigue» del proyecto, para cuando el documento está al día. */
  queSigueDelProyecto: { texto: string; accion: ReactNode | null } | null;
  /** El alta o la propuesta ya ocupan el «Qué sigue» del panel. */
  queSigueOcupado: boolean;
  secciones: Array<{ key: string; label: string }>;
}) {
  /* Las entradas reservadas del Json (`__doc`, las «Instrucciones adicionales» del documento) no son
     secciones: no van al índice. */
  const secciones = seccionesCrudas.filter((s) => !s.key.startsWith("__"));
  const [corrida, setCorrida] = useState<Corrida | null | undefined>(undefined);
  const [versiones, setVersiones] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;
    if (grupoDelAgente) {
      fetch(`/api/projects/${projectId}/agent-runs?grupo=${encodeURIComponent(grupoDelAgente)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { runs?: Corrida[] } | null) => {
          if (!vivo) return;
          const runs = d?.runs ?? [];
          setCorrida(runs.find((r) => r.vigente) ?? runs.find((r) => r.estado === "DONE") ?? null);
        })
        .catch(() => vivo && setCorrida(null));
    }
    fetch(`/api/projects/${projectId}/versiones?canvasId=${encodeURIComponent(canvasId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { versiones?: unknown[] } | null) => {
        if (vivo && Array.isArray(d?.versiones)) setVersiones(d.versiones.length);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [projectId, canvasId, grupoDelAgente, generada]);

  const queSigue: { texto: string; accion: ReactNode | null } | null = !generada
    ? {
        texto: `«${etiqueta}» todavía no tiene contenido. ${motivoPrevio ?? "La IA lo escribe a partir del handoff y las reuniones del proyecto."}`,
        accion,
      }
    : desactualizada
      ? {
          texto: `«${etiqueta}» quedó desactualizado: el handoff cambió después de escribirlo. Regenéralo antes de mostrárselo al cliente.`,
          accion,
        }
      : queSigueDelProyecto;

  const irA = (key: string) => {
    const destino = document.querySelector(`[data-seccion="${CSS.escape(key)}"]`);
    destino?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      {!queSigueOcupado && queSigue && <QueSigue accion={queSigue.accion ?? undefined}>{queSigue.texto}</QueSigue>}

      <section className="flex flex-col gap-2.5">
        <span className={ROTULO_DEL_SISTEMA}>Este documento</span>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-xl border border-line bg-surface px-3 py-2.5 text-[13px]">
          <dt className="text-fg-muted">Estado</dt>
          <dd className={generada ? (desactualizada ? "text-warn-ink" : "text-fg") : "text-fg-muted"}>
            {generada ? (desactualizada ? "Desactualizado" : "Generado") : "Sin contenido"}
          </dd>
          {grupoDelAgente && corrida && (
            <>
              <dt className="text-fg-muted">Lo escribió</dt>
              <dd className="text-fg">
                la IA el {fecha(corrida.createdAt)}
                {corrida.lanzadaPor && <span className="text-fg-muted"> · lo pidió {corrida.lanzadaPor}</span>}
              </dd>
              {corrida.sesionesFuente > 0 && (
                <>
                  <dt className="text-fg-muted">Leyó</dt>
                  <dd className="text-fg">
                    {corrida.sesionesFuente} {corrida.sesionesFuente === 1 ? "reunión" : "reuniones"}
                  </dd>
                </>
              )}
            </>
          )}
          {grupoDelAgente && corrida === null && generada && (
            <>
              <dt className="text-fg-muted">Lo escribió</dt>
              <dd className="text-fg-muted">sin corrida registrada de la IA</dd>
            </>
          )}
          {versiones !== null && versiones > 0 && (
            <>
              <dt className="text-fg-muted">Versiones</dt>
              <dd className="text-fg">
                {versiones} {versiones === 1 ? "anterior guardada" : "anteriores guardadas"}
              </dd>
            </>
          )}
        </dl>
      </section>

      {generada && secciones.length > 1 && (
        <section className="flex flex-col gap-2.5">
          <span className={ROTULO_DEL_SISTEMA}>Secciones · {secciones.length}</span>
          <ol className="flex flex-col rounded-xl border border-line bg-surface py-1">
            {secciones.map((s, i) => (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => irA(s.key)}
                  className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-[13px] text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
                >
                  <span className="w-4 flex-shrink-0 text-right text-[11px] tabular-nums text-fg-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
