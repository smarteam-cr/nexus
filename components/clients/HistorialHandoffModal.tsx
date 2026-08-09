"use client";

/**
 * components/clients/HistorialHandoffModal.tsx — LAS CORRIDAS ANTERIORES, PARA LEER.
 *
 * ── QUÉ PROBLEMA RESUELVE ────────────────────────────────────────────────────
 * Regenerar un handoff BORRA los bloques de la corrida anterior. Lo que el agente había escrito
 * antes sobrevive solo dentro de `AgentRun.output`, y hasta ahora ninguna pantalla lo abría: la
 * versión previa del documento existía en la base y era inalcanzable.
 *
 * ── SOLO LECTURA (decisión de Elías, 2026-08-08) ─────────────────────────────
 * Se abre, se lee, se compara con el documento actual. Nada se restaura ni pisa nada. Por eso
 * el visor no recibe un solo callback de edición — y hay una guarda que lo hace cumplir, para
 * que "restaurar" no aparezca por goteo.
 *
 * ── POR QUÉ MAESTRO-DETALLE Y NO LISTA → DETALLE ─────────────────────────────
 * Comparar exige ver la lista MIENTRAS se lee. El rail queda fijo (`sticky`) y el documento
 * scrollea al lado; el body del Modal ya resuelve el scroll, así que no hay que tocarlo.
 * Las corridas ya vistas quedan cacheadas: ir y venir entre dos es instantáneo, que es el gesto
 * real de comparar.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { fetchJson } from "@/lib/api/fetch-json";
import DocumentoAgenteView from "@/components/canvas/DocumentoAgenteView";
import {
  ESTADO_HISTORIAL,
  duracionLegible,
  type ResumenDeCorrida,
} from "@/lib/agents/historial-corridas";
import type { DocumentoDeCorrida } from "@/lib/canvas/agent-output-doc";

interface ListaResp {
  runs: ResumenDeCorrida[];
  total: number;
  limite: number;
  runVigenteId: string | null;
}
interface DetalleResp extends ResumenDeCorrida {
  agentName: string | null;
  /** Las sesiones que la alimentaron, hidratadas. (`sesionesFuente` del resumen es su cantidad.) */
  sesiones: Array<{ id: string; title: string; date: string }>;
  documento: DocumentoDeCorrida;
}

/** Botón de reintento para los Alert (que reciben el CTA como nodo, no como objeto). */
function BotonReintentar({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs font-semibold text-fg-secondary hover:text-fg border border-line hover:border-fg-muted rounded-lg px-2.5 py-1 transition-colors"
    >
      Reintentar
    </button>
  );
}

function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleString("es-CR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistorialHandoffModal({
  projectId,
  grupo = "handoff",
  onClose,
}: {
  projectId: string;
  grupo?: string;
  onClose: () => void;
}) {
  const [lista, setLista] = useState<ListaResp | null>(null);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [detalles, setDetalles] = useState<Map<string, DetalleResp>>(new Map());
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null);
  // Una promesa en vuelo por corrida: evita el doble-fetch del click repetido.
  const enVuelo = useRef<Map<string, Promise<void>>>(new Map());

  const cargarLista = useCallback(async () => {
    setErrorLista(null);
    try {
      const data = await fetchJson<ListaResp>(
        `/api/projects/${projectId}/agent-runs?grupo=${encodeURIComponent(grupo)}`,
      );
      setLista(data);
      setSeleccion((prev) => prev ?? data.runs[0]?.id ?? null);
    } catch (e) {
      setErrorLista(e instanceof Error ? e.message : "No se pudo cargar el historial.");
    }
  }, [projectId, grupo]);

  useEffect(() => {
    void cargarLista();
  }, [cargarLista]);

  const cargarDetalle = useCallback(
    (runId: string) => {
      if (detalles.has(runId)) return;
      if (enVuelo.current.has(runId)) return;
      setCargandoDetalle(true);
      setErrorDetalle(null);
      const p = fetchJson<DetalleResp>(`/api/projects/${projectId}/agent-runs/${runId}`)
        .then((d) => {
          setDetalles((prev) => new Map(prev).set(runId, d));
        })
        .catch((e: unknown) => {
          setErrorDetalle(e instanceof Error ? e.message : "No se pudo abrir esta corrida.");
        })
        .finally(() => {
          enVuelo.current.delete(runId);
          setCargandoDetalle(false);
        });
      enVuelo.current.set(runId, p);
    },
    [projectId, detalles],
  );

  useEffect(() => {
    if (seleccion) cargarDetalle(seleccion);
  }, [seleccion, cargarDetalle]);

  const detalle = seleccion ? detalles.get(seleccion) : undefined;
  const resumen = lista?.runs.find((r) => r.id === seleccion);

  return (
    <Modal
      open
      onClose={onClose}
      size="xxl"
      title="Historial del handoff"
      description="Las corridas anteriores del agente, tal como quedaron guardadas. Solo lectura: nada de acá se restaura ni pisa el documento actual."
      footer={
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="text-xs font-medium text-fg-muted hover:text-fg border border-line hover:border-fg-muted rounded-lg px-3 py-1.5 transition-colors"
          >
            Cerrar
          </button>
        </div>
      }
    >
      <div className="flex gap-5">
        {/* ── El rail de corridas ── */}
        <div className="w-60 flex-shrink-0 sticky top-0 self-start space-y-1.5">
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">Corridas</p>
            {lista && lista.total === lista.limite && (
              <span className="text-[10px] text-fg-muted">{lista.limite} más recientes</span>
            )}
          </div>

          {!lista && !errorLista && <p className="text-xs text-fg-muted py-2">Buscando corridas…</p>}
          {errorLista && (
            <Alert variant="danger" action={<BotonReintentar onClick={() => void cargarLista()} />}>
              No se pudo cargar el historial.
            </Alert>
          )}
          {lista?.runs.length === 0 && (
            <p className="text-xs text-fg-muted py-2">Este handoff no tiene corridas registradas.</p>
          )}

          {lista?.runs.map((r) => {
            const meta = ESTADO_HISTORIAL[r.estado] ?? ESTADO_HISTORIAL.PENDING;
            return (
              <button
                key={r.id}
                onClick={() => setSeleccion(r.id)}
                className={cn(
                  "w-full text-left rounded-lg border px-2.5 py-2 transition-colors",
                  r.id === seleccion
                    ? "border-brand/50 bg-brand/10"
                    : "border-line hover:bg-surface-hover",
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className={cn("text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border", meta.cls)}>
                    {r.colgada ? "Se interrumpió" : meta.label}
                  </span>
                  {r.vigente && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-brand-light">
                      Versión actual
                    </span>
                  )}
                </div>
                <p className="text-xs text-fg mt-1 truncate">{fechaLarga(r.createdAt)}</p>
                <p className="text-[11px] text-fg-muted truncate">
                  {r.lanzadaPor ?? "El sistema"} ·{" "}
                  {r.sesionesFuente === 0
                    ? "sin sesiones"
                    : `${r.sesionesFuente} ${r.sesionesFuente === 1 ? "sesión" : "sesiones"}`}{" "}
                  · {duracionLegible(r.duracionMs)}
                </p>
              </button>
            );
          })}
        </div>

        {/* ── El documento de la corrida elegida ── */}
        <div className="flex-1 min-w-0">
          {!seleccion && !errorLista && <p className="text-xs text-fg-muted">Elegí una corrida.</p>}

          {seleccion && (
            <>
              <div className="flex flex-wrap items-baseline gap-2 mb-3">
                <h3 className="text-sm font-semibold text-fg">
                  Corrida del {resumen ? fechaLarga(resumen.createdAt) : "…"}
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-wider text-fg-muted border border-line rounded px-1.5 py-0.5">
                  Solo lectura
                </span>
                {detalle?.documento.estado === "ok" && (
                  <span className="ml-auto text-[11px] text-fg-muted">
                    {detalle.documento.seccionesConContenido} de{" "}
                    {detalle.documento.seccionesEsperadas} secciones con contenido
                  </span>
                )}
              </div>

              {errorDetalle && (
                <Alert
                  variant="danger"
                  action={
                    <BotonReintentar
                      onClick={() => {
                        setErrorDetalle(null);
                        cargarDetalle(seleccion);
                      }}
                    />
                  }
                >
                  No se pudo abrir esta corrida.
                </Alert>
              )}

              {!detalle && !errorDetalle && cargandoDetalle && (
                <div className="flex items-center gap-2 text-xs text-fg-muted py-6">
                  <Spinner size="sm" />
                  Abriendo la corrida…
                </div>
              )}

              {detalle && (
                <>
                  <DocumentoAgenteView documento={detalle.documento} />
                  <p className="text-[11px] text-fg-muted leading-relaxed border-t border-line pt-3 mt-5">
                    Este contenido es una foto de lo que devolvió el agente esa vez. El documento
                    vivo pudo haberse editado a mano desde entonces.
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
