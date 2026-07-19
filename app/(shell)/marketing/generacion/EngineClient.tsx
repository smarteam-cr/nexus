"use client";

/**
 * Motor de Contenido (detalle): estado de la última corrida, stats de posts,
 * fuentes con error, historial completo. Tres niveles de CTA, siempre visibles
 * (sin banners condicionales que aparecen/desaparecen según el historial):
 *   1) "Generar ideas nuevas" (CHAIN) — primario. SIEMPRE genera (con lo nuevo
 *      + lo guardado). Es la misma corrida que dispara el cron los viernes.
 *   2) "Regenerar con lo guardado" (GENERATE) — sin re-scrapear; para cuando
 *      se editaron insumos (pilares/voz/personas) y se quiere una tanda nueva.
 *   3) "Solo actualizar fuentes" (INGEST) — sin generar; para revisar que una
 *      fuente nueva esté trayendo posts antes de gastar en generación.
 */
import Link from "next/link";
import { Badge, ListSkeleton } from "@/components/ui";
import { useMarketingEngine, RUN_KIND_LABEL } from "@/components/marketing/useMarketingEngine";

export default function EngineClient({ canEdit }: { canEdit: boolean }) {
  const { runs, stats, sources, loading, busy, runningPhase, startRun, lastRun } = useMarketingEngine();
  const canGenerate = (stats?.inWindow ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* CTAs */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="max-w-md">
            <p className="text-sm font-semibold text-fg">Correr el motor</p>
            <p className="mt-0.5 text-xs text-fg-muted">
              &quot;Generar ideas nuevas&quot; scrapea las fuentes y genera SIEMPRE — aunque
              esa semana no haya inspiración nueva, genera con lo guardado. Es la misma
              corrida que dispara el cron cada viernes a las 6:00 am.
            </p>
          </div>
          {canEdit ? (
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <button
                onClick={() => startRun("CHAIN")}
                disabled={busy}
                className="px-4 py-2 text-sm rounded-lg bg-brand text-white disabled:opacity-40 hover:opacity-90"
              >
                {busy ? (runningPhase ?? "En curso…") : "Generar ideas nuevas"}
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => startRun("GENERATE")}
                  disabled={busy || !canGenerate}
                  title={
                    canGenerate
                      ? "Genera sin re-scrapear, con los posts que ya están guardados"
                      : "Todavía no hay posts guardados"
                  }
                  className="text-xs text-brand hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                >
                  Regenerar con lo guardado
                </button>
                <span className="text-fg-muted">·</span>
                <button
                  onClick={() => startRun("INGEST")}
                  disabled={busy}
                  className="text-xs text-fg-muted hover:text-fg-secondary disabled:opacity-40"
                >
                  Solo actualizar fuentes
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-fg-muted">Tu rol puede ver el estado; correr el motor es del equipo de Marketing.</p>
          )}
        </div>

        {busy && runningPhase && (
          <p className="mt-3 text-xs text-brand animate-pulse">⏳ {runningPhase}</p>
        )}

        {!busy && lastRun?.status === "ERROR" && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
            <p className="text-xs text-red-400">Última corrida falló: {lastRun.error}</p>
          </div>
        )}
      </div>

      {/* Stats de inspiración */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-2xl font-semibold text-fg">{loading ? "…" : (stats?.inWindow ?? 0)}</p>
          <p className="text-xs text-fg-muted">posts en ventana (últimos 3 meses) — entran a la generación</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-2xl font-semibold text-fg">{loading ? "…" : (stats?.total ?? 0)}</p>
          <p className="text-xs text-fg-muted">posts guardados en total (los &gt;3 meses quedan archivados)</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-2xl font-semibold text-fg">
            {loading ? "…" : sources.filter((s) => s.active).length}
          </p>
          <p className="text-xs text-fg-muted">
            fuentes activas ·{" "}
            <Link href="/marketing/fuentes" className="text-brand hover:underline">
              administrar
            </Link>
          </p>
        </div>
      </div>

      {/* Fuentes con error */}
      {sources.some((s) => s.active && s.lastFetchError) && (
        <div className="rounded-2xl border border-red-500/20 bg-surface p-4">
          <p className="text-xs font-semibold text-fg mb-2">Fuentes con error en la última ingesta</p>
          <ul className="space-y-1">
            {sources
              .filter((s) => s.active && s.lastFetchError)
              .map((s) => (
                <li key={s.id} className="text-xs text-fg-secondary">
                  <span className="font-medium">{s.label}</span>:{" "}
                  <span className="text-red-400">{s.lastFetchError}</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Historial */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-sm font-semibold text-fg mb-3">Historial de corridas</p>
        {loading ? (
          // Skeleton estructural: la card del historial ya está montada; se
          // reservan filas de la altura real de una corrida para evitar saltos.
          <ListSkeleton rows={3} lines={1} />
        ) : runs.length === 0 ? (
          <p className="text-xs text-fg-muted">Todavía no hay corridas. Corré la primera con el botón de arriba.</p>
        ) : (
          <ul className="space-y-2">
            {runs.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 text-xs border-b border-line pb-2 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <span className="font-medium text-fg">{RUN_KIND_LABEL[r.kind]}</span>
                  <Badge size="xs" className="ml-2">
                    {r.trigger === "CRON" ? "Cron" : "Manual"}
                  </Badge>
                  <span className="ml-2 text-fg-muted">
                    {new Date(r.createdAt).toLocaleString("es-CR", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                  {r.status === "DONE" && (
                    <span className="ml-2 text-fg-secondary">
                      {[
                        r.newPostsCount != null ? `${r.newPostsCount} nuevos` : null,
                        r.contentIdeasCount != null ? `${r.contentIdeasCount} ideas` : null,
                        r.campaignIdeasCount != null ? `${r.campaignIdeasCount} campañas` : null,
                        r.pillarSuggestionsCount ? `${r.pillarSuggestionsCount} pilares sugeridos` : null,
                        r.sourcesErrorCount ? `${r.sourcesErrorCount} fuentes con error` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                  {r.status === "ERROR" && <span className="ml-2 text-red-400 truncate">{r.error}</span>}
                </div>
                <span
                  className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] ${
                    r.status === "DONE"
                      ? "bg-emerald-500/10 text-emerald-500"
                      : r.status === "ERROR"
                        ? "bg-red-500/10 text-red-400"
                        : "bg-amber-500/10 text-amber-500"
                  }`}
                >
                  {r.status === "DONE" ? "OK" : r.status === "ERROR" ? "Error" : "En curso"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-fg-muted">
        Las salidas viven en{" "}
        <Link href="/marketing/contenido" className="text-brand hover:underline">
          Contenido
        </Link>{" "}
        y{" "}
        <Link href="/marketing/ideas-de-campana" className="text-brand hover:underline">
          Ideas de campaña
        </Link>
        . Los insumos (ICP, personas, temas, fuentes, voz) se administran en el resto de las
        secciones.
      </p>
    </div>
  );
}
