"use client";

import { useState, useMemo } from "react";
import type { ProspectGroup } from "./page";

interface SalesCard {
  title: string;
  content: string;
  canvasSection?: string;
}

interface SalesPendingItem {
  text: string;
  source?: string;
}

interface SalesResult {
  cards: SalesCard[];
  pendingItems: SalesPendingItem[];
}

type RepFilter = "all" | "M. Salas" | "A. Pinzón";

const REP_COLORS: Record<string, string> = {
  "M. Salas":  "bg-brand/15 text-brand border border-brand/30",
  "A. Pinzón": "bg-violet-500/15 text-violet-400 border border-violet-500/30",
};

const REP_FILTER_COLORS: Record<RepFilter, { active: string; inactive: string }> = {
  "all":       { active: "bg-gray-700 text-white border-gray-600", inactive: "bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-600" },
  "M. Salas":  { active: "bg-brand/20 text-brand border-brand/40", inactive: "bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-600" },
  "A. Pinzón": { active: "bg-violet-500/20 text-violet-400 border-violet-500/40", inactive: "bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-600" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Renderiza el contenido de una card: convierte "- " en bullet list
function CardContent({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="text-sm text-gray-300 space-y-1 leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith("- ") || line.startsWith("• ")) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-gray-500 flex-shrink-0 mt-0.5">·</span>
              <span>{line.slice(2)}</span>
            </div>
          );
        }
        if (!line.trim()) return <div key={i} className="h-1" />;
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}

export default function SalesClient({ prospects }: { prospects: ProspectGroup[] }) {
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, SalesResult>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [repFilter, setRepFilter] = useState<RepFilter>("all");

  // Filtrado client-side
  const filtered = useMemo(() => {
    let list = prospects;

    if (repFilter !== "all") {
      list = list.filter((p) => p.reps.includes(repFilter));
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.companyName.toLowerCase().includes(q) ||
          p.domain.toLowerCase().includes(q)
      );
    }

    return list;
  }, [prospects, search, repFilter]);

  async function handleAnalyze(prospect: ProspectGroup) {
    setAnalyzing(prospect.domain);
    setErrors((prev) => ({ ...prev, [prospect.domain]: "" }));
    try {
      // Solo enviar sessionIds que tengan transcript
      const analyzableIds = prospect.sessions
        .filter((s) => s.hasTranscript)
        .map((s) => s.id);

      const res = await fetch("/api/sales/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionIds: analyzableIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors((prev) => ({ ...prev, [prospect.domain]: data.error ?? "Error al analizar" }));
      } else {
        setResults((prev) => ({
          ...prev,
          [prospect.domain]: {
            cards: data.cards ?? [],
            pendingItems: data.pendingItems ?? [],
          },
        }));
      }
    } catch {
      setErrors((prev) => ({ ...prev, [prospect.domain]: "Error de conexión" }));
    } finally {
      setAnalyzing(null);
    }
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">Análisis de ventas</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Prospectos de M. Salas y A. Pinzón
          </p>
        </div>
        <span className="ml-auto text-xs font-medium text-gray-400 bg-gray-800 px-2.5 py-1 rounded-full border border-gray-700">
          {filtered.length} {filtered.length === 1 ? "prospecto" : "prospectos"}
          {filtered.length !== prospects.length && (
            <span className="text-gray-500"> de {prospects.length}</span>
          )}
        </span>
      </div>

      {/* Barra de búsqueda + filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Búsqueda */}
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar prospecto…"
            className="w-full pl-9 pr-4 py-2 text-sm bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-gray-500 transition-colors"
          />
        </div>

        {/* Filtro por vendedor */}
        <div className="flex items-center gap-1.5">
          {(["all", "M. Salas", "A. Pinzón"] as RepFilter[]).map((rep) => (
            <button
              key={rep}
              onClick={() => setRepFilter(rep)}
              className={`text-xs font-medium px-3 py-2 rounded-xl border transition-colors ${
                repFilter === rep
                  ? REP_FILTER_COLORS[rep].active
                  : REP_FILTER_COLORS[rep].inactive
              }`}
            >
              {rep === "all" ? "Todos" : rep}
            </button>
          ))}
        </div>
      </div>

      {/* Estado vacío global */}
      {prospects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gray-800 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-400">Sin sesiones de ventas</p>
          <p className="text-xs text-gray-600 mt-1">
            No se encontraron sesiones con participación de M. Salas o A. Pinzón
          </p>
        </div>
      )}

      {/* Estado vacío por filtro */}
      {prospects.length > 0 && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm font-medium text-gray-400">Sin resultados</p>
          <p className="text-xs text-gray-600 mt-1">
            Prueba con otro nombre o cambia el filtro de vendedor
          </p>
        </div>
      )}

      {/* Grid de prospectos */}
      <div className="space-y-6">
        {filtered.map((prospect) => {
          const isAnalyzing = analyzing === prospect.domain;
          const result = results[prospect.domain];
          const cards = result?.cards;
          const pendingItems = result?.pendingItems ?? [];
          const error = errors[prospect.domain];
          const canAnalyze = prospect.analyzableCount > 0;

          return (
            <div key={prospect.domain}>
              {/* Prospect card */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <div className="flex items-start justify-between gap-4">
                  {/* Info */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-bold text-white">{prospect.companyName}</h2>
                      <span className="text-xs text-gray-500">{prospect.domain}</span>
                    </div>

                    {/* Reps */}
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {prospect.reps.map((rep) => (
                        <span
                          key={rep}
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${REP_COLORS[rep] ?? "bg-gray-800 text-gray-400 border border-gray-700"}`}
                        >
                          {rep}
                        </span>
                      ))}
                      <span className="text-xs text-gray-500">
                        · {prospect.sessionCount} {prospect.sessionCount === 1 ? "sesión" : "sesiones"}
                        {prospect.analyzableCount < prospect.sessionCount && (
                          <span className="text-gray-600">
                            {" "}({prospect.analyzableCount} con transcript)
                          </span>
                        )}
                        · última: {formatDate(prospect.lastSessionDate)}
                      </span>
                    </div>

                    {/* Preview de sesiones */}
                    <div className="mt-3 space-y-1">
                      {prospect.sessions.slice(0, 3).map((s) => (
                        <div key={s.id} className="flex items-center gap-2">
                          <span className={`w-1 h-1 rounded-full flex-shrink-0 ${s.hasTranscript ? "bg-gray-500" : "bg-gray-700"}`} />
                          <span className={`text-xs truncate ${s.hasTranscript ? "text-gray-400" : "text-gray-600"}`}>
                            {s.title}
                          </span>
                          <span className="text-xs text-gray-600 flex-shrink-0">{formatDate(s.date)}</span>
                          {!s.hasTranscript && (
                            <span className="text-xs text-gray-700 flex-shrink-0">sin transcript</span>
                          )}
                        </div>
                      ))}
                      {prospect.sessions.length > 3 && (
                        <p className="text-xs text-gray-600 pl-3">
                          +{prospect.sessions.length - 3} más
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Botón analizar */}
                  <div className="flex-shrink-0 flex flex-col items-end gap-1">
                    <button
                      onClick={() => handleAnalyze(prospect)}
                      disabled={isAnalyzing || !!analyzing || !canAnalyze}
                      title={!canAnalyze ? "No hay transcripts disponibles para analizar" : undefined}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand hover:bg-brand/90 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isAnalyzing ? (
                        <>
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Analizando…
                        </>
                      ) : cards ? (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Reanalizar
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Analizar
                        </>
                      )}
                    </button>
                    {!canAnalyze && (
                      <span className="text-xs text-gray-600">Sin transcript</span>
                    )}
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <p className="mt-3 text-xs text-red-400 bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}
              </div>

              {/* Resultado: cards de análisis */}
              {cards && cards.length > 0 && (
                <div className="mt-3 columns-1 lg:columns-2 xl:columns-3 gap-3 space-y-3">
                  {cards.map((card, i) => (
                    <div
                      key={i}
                      className="bg-gray-900 border border-gray-800 rounded-2xl p-5 break-inside-avoid mb-3"
                    >
                      <h3 className="text-sm font-bold text-white mb-3">{card.title}</h3>
                      <CardContent content={card.content} />
                    </div>
                  ))}
                </div>
              )}

              {/* Resultado: pendientes / próximos pasos identificados */}
              {pendingItems.length > 0 && (
                <div className="mt-3 bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <h3 className="text-sm font-bold text-white">Próximas acciones identificadas</h3>
                    <span className="text-xs text-amber-400/70">({pendingItems.length})</span>
                  </div>
                  <ul className="space-y-1.5">
                    {pendingItems.map((it, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                        <span className="text-amber-400 flex-shrink-0 mt-0.5">→</span>
                        <div className="flex-1 min-w-0">
                          <span>{it.text}</span>
                          {it.source && (
                            <span className="ml-2 text-xs text-gray-500">· {it.source}</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
