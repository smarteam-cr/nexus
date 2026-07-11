"use client";

/**
 * components/cobranza/DigestPanel.tsx — tab "Corte semanal".
 *
 * El corte de cartera (diff-based): muestra el resumen del último
 * SnapshotCartera — Nuevas / Resueltas / persistentes, o "sin cambios" — y el
 * botón "Hacer el corte ahora" (POST /api/cobranza/digest). El corte automático
 * corre los lunes 7:00 CR vía scheduler; esto es el disparo manual.
 *
 * Las CUENTA_SIN_DATOS (backlog de configuración) se COLAPSAN a una línea
 * expandible en Nuevas y Resueltas: 30 "sin cuenta configurada" no son 30
 * novedades operativas. Los AlertaDraft del resumen ya traen `tipo`; si un
 * snapshot viejo no lo trajera, la alerta cae al listado normal (comportamiento
 * de siempre).
 */
import { useState } from "react";
import { EmptyState } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import type { SnapshotDTO } from "@/lib/cobranza";

interface ResumenAlerta {
  mensaje: string;
  urgencia: string;
  tipo?: string;
}

interface DigestView {
  capturedAt: string;
  triggeredBy: string | null;
  nuevas: ResumenAlerta[];
  resueltas: ResumenAlerta[];
  persistentes: number;
  sinCambios: boolean;
  totalAlertas: number | null;
  horizonteExtendido: number | null; // solo lo trae el POST
}

interface DigestResult {
  capturedAt: string;
  triggeredBy: string;
  diff: {
    nuevas: ResumenAlerta[];
    resueltas: ResumenAlerta[];
    persistentes: number;
    sinCambios: boolean;
  };
  totalAlertas: number;
  horizonteExtendido: number;
}

const URG_CHIP: Record<string, string> = {
  ALTA: "text-red-600 bg-red-500/10 border-red-500/30",
  MEDIA: "text-amber-600 bg-amber-500/10 border-amber-500/30",
  BAJA: "text-sky-600 bg-sky-500/10 border-sky-500/30",
};

/** Separa el backlog de configuración de lo operativo (sin `tipo` → operativa). */
function partirPorConfig(items: ResumenAlerta[]): {
  operativas: ResumenAlerta[];
  config: ResumenAlerta[];
} {
  const operativas: ResumenAlerta[] = [];
  const config: ResumenAlerta[] = [];
  for (const a of items) (a.tipo === "CUENTA_SIN_DATOS" ? config : operativas).push(a);
  return { operativas, config };
}

function toResumenAlertas(value: unknown): ResumenAlerta[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({
      mensaje: typeof x.mensaje === "string" ? x.mensaje : "",
      urgencia: typeof x.urgencia === "string" ? x.urgencia : "MEDIA",
      tipo: typeof x.tipo === "string" ? x.tipo : undefined,
    }))
    .filter((x) => x.mensaje);
}

/** Normaliza el snapshot persistido (resumen JSON) al view-model del panel. */
function fromSnapshot(snap: SnapshotDTO | null): DigestView | null {
  if (!snap) return null;
  const r = (snap.resumen ?? {}) as Record<string, unknown>;
  return {
    capturedAt: snap.capturedAt,
    triggeredBy: snap.triggeredBy,
    nuevas: toResumenAlertas(r.nuevas),
    resueltas: toResumenAlertas(r.resueltas),
    persistentes: typeof r.persistentes === "number" ? r.persistentes : 0,
    sinCambios: r.sinCambios === true,
    totalAlertas: typeof r.totalAlertas === "number" ? r.totalAlertas : null,
    horizonteExtendido: null,
  };
}

function fromResult(d: DigestResult): DigestView {
  return {
    capturedAt: d.capturedAt,
    triggeredBy: d.triggeredBy,
    nuevas: d.diff.nuevas,
    resueltas: d.diff.resueltas,
    persistentes: d.diff.persistentes,
    sinCambios: d.diff.sinCambios,
    totalAlertas: d.totalAlertas,
    horizonteExtendido: d.horizonteExtendido,
  };
}

export default function DigestPanel({
  initialSnapshot,
  onDigestDone,
}: {
  initialSnapshot: SnapshotDTO | null;
  /** El corte puede cambiar el set de alertas → el padre refresca el tab de Alertas. */
  onDigestDone?: () => void;
}) {
  const toast = useToast();
  const [view, setView] = useState<DigestView | null>(() => fromSnapshot(initialSnapshot));
  const [busy, setBusy] = useState(false);
  const [configAbierta, setConfigAbierta] = useState<Record<string, boolean>>({});

  async function correrCorte() {
    if (busy) return;
    setBusy(true);
    try {
      const d = await fetchJson<{ digest: DigestResult }>("/api/cobranza/digest", { method: "POST" });
      setView(fromResult(d.digest));
      toast.success(
        d.digest.diff.sinCambios
          ? "Corte completado: sin cambios desde el anterior."
          : `Corte completado: ${d.digest.diff.nuevas.length} nueva${d.digest.diff.nuevas.length !== 1 ? "s" : ""}, ${d.digest.diff.resueltas.length} resuelta${d.digest.diff.resueltas.length !== 1 ? "s" : ""}.`,
      );
      onDigestDone?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo correr el corte.");
    } finally {
      setBusy(false);
    }
  }

  const botonCorte = (
    <button
      type="button"
      onClick={correrCorte}
      disabled={busy}
      className="text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors disabled:opacity-50"
    >
      {busy ? "Haciendo el corte…" : "Hacer el corte ahora"}
    </button>
  );

  if (!view) {
    return (
      <div className="space-y-3">
        <EmptyState
          variant="dashed"
          title="Todavía no hay cortes"
          description="Hacé el primer corte para arrancar el registro semanal de cambios."
          action={botonCorte}
        />
        <p className="text-[11px] text-fg-muted text-center">El corte automático corre los lunes a las 7:00.</p>
      </div>
    );
  }

  /** Línea colapsable del backlog de configuración dentro de una sección. */
  const lineaConfig = (key: string, config: ResumenAlerta[]) => {
    if (config.length === 0) return null;
    const abierta = !!configAbierta[key];
    return (
      <li className="rounded-lg border border-line bg-surface-muted/50 px-3 py-2">
        <button
          type="button"
          onClick={() => setConfigAbierta((s) => ({ ...s, [key]: !abierta }))}
          className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg-secondary transition-colors"
        >
          <span className={`transition-transform ${abierta ? "rotate-90" : ""}`}>▸</span>
          {config.length} cuenta{config.length !== 1 ? "s" : ""} pendiente{config.length !== 1 ? "s" : ""} de
          configuración
        </button>
        {abierta && (
          <ul className="mt-2 space-y-1">
            {config.map((a, i) => (
              <li key={i} className="text-[11px] text-fg-muted pl-4">
                {a.mensaje}
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-fg">
            Último corte:{" "}
            {new Date(view.capturedAt).toLocaleString("es-CR", { dateStyle: "medium", timeStyle: "short" })}
          </p>
          <p className="text-xs text-fg-muted mt-0.5">
            {view.triggeredBy ? `Corrido por ${view.triggeredBy}` : "Corte automático"}
            {view.totalAlertas != null ? ` · ${view.totalAlertas} alerta${view.totalAlertas !== 1 ? "s" : ""} vigente${view.totalAlertas !== 1 ? "s" : ""}` : ""}
            {view.horizonteExtendido != null && view.horizonteExtendido > 0
              ? ` · horizonte extendido en ${view.horizonteExtendido} suscripción${view.horizonteExtendido !== 1 ? "es" : ""}`
              : ""}
          </p>
        </div>
        {botonCorte}
      </div>

      {view.sinCambios ? (
        <p className="text-sm text-emerald-600 bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3">
          Sin cambios desde el último corte ✓
        </p>
      ) : (
        <div className="space-y-4">
          {view.nuevas.length > 0 &&
            (() => {
              const { operativas, config } = partirPorConfig(view.nuevas);
              return (
                <section>
                  <h3 className="text-[11px] font-semibold text-fg-muted uppercase tracking-widest mb-2">
                    Nuevas ({view.nuevas.length})
                  </h3>
                  <ul className="space-y-1.5">
                    {operativas.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2">
                        <span
                          className={`mt-px text-[10px] font-medium px-1.5 py-0.5 rounded border flex-shrink-0 ${URG_CHIP[a.urgencia] ?? URG_CHIP.MEDIA}`}
                        >
                          {a.urgencia === "ALTA" ? "Alta" : a.urgencia === "BAJA" ? "Baja" : "Media"}
                        </span>
                        <span className="text-xs text-fg-secondary">{a.mensaje}</span>
                      </li>
                    ))}
                    {lineaConfig("nuevas", config)}
                  </ul>
                </section>
              );
            })()}

          {view.resueltas.length > 0 &&
            (() => {
              const { operativas, config } = partirPorConfig(view.resueltas);
              return (
                <section>
                  <h3 className="text-[11px] font-semibold text-fg-muted uppercase tracking-widest mb-2">
                    Resueltas ({view.resueltas.length})
                  </h3>
                  <ul className="space-y-1.5">
                    {operativas.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                        <span className="text-emerald-600 text-xs flex-shrink-0">✓</span>
                        <span className="text-xs text-fg-muted">{a.mensaje}</span>
                      </li>
                    ))}
                    {lineaConfig("resueltas", config)}
                  </ul>
                </section>
              );
            })()}

          <p className="text-xs text-fg-muted">
            {view.persistentes} alerta{view.persistentes !== 1 ? "s" : ""} persistente{view.persistentes !== 1 ? "s" : ""} desde el corte anterior.
          </p>
        </div>
      )}

      <p className="text-[11px] text-fg-muted">El corte automático corre los lunes a las 7:00.</p>
    </div>
  );
}
