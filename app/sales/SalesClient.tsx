"use client";

import { useState } from "react";
import type { ProspectGroup } from "./page";

interface SalesCard {
  title: string;
  content: string;
  canvasSection?: string;
}

const REP_COLORS: Record<string, string> = {
  "M. Salas":  "bg-brand/15 text-brand border border-brand/30",
  "A. Pinzón": "bg-violet-500/15 text-violet-400 border border-violet-500/30",
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
  const [results, setResults] = useState<Record<string, SalesCard[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleAnalyze(prospect: ProspectGroup) {
    setAnalyzing(prospect.domain);
    setErrors((prev) => ({ ...prev, [prospect.domain]: "" }));
    try {
      const res = await fetch("/api/sales/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionIds: prospect.sessions.map((s) => s.id) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors((prev) => ({ ...prev, [prospect.domain]: data.error ?? "Error al analizar" }));
      } else {
        setResults((prev) => ({ ...prev, [prospect.domain]: data.cards }));
      }
    } catch {
      setErrors((prev) => ({ ...prev, [prospect.domain]: "Error de conexión" }));
    } finally {
      setAnalyzing(null);
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Análisis de ventas</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Prospectos de M. Salas y A. Pinzón
          </p>
        </div>
        {prospects.length > 0 && (
          <span className="ml-auto text-xs font-medium text-gray-400 bg-gray-800 px-2.5 py-1 rounded-full border border-gray-700">
            {prospects.length} {prospects.length === 1 ? "prospecto" : "prospectos"}
          </span>
        )}
      </div>

      {/* Estado vacío */}
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

      {/* Grid de prospectos */}
      <div className="space-y-6">
        {prospects.map((prospect) => {
          const isAnalyzing = analyzing === prospect.domain;
          const cards = results[prospect.domain];
          const error = errors[prospect.domain];

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
                        · última: {formatDate(prospect.lastSessionDate)}
                      </span>
                    </div>

                    {/* Preview de sesiones */}
                    <div className="mt-3 space-y-1">
                      {prospect.sessions.slice(0, 3).map((s) => (
                        <div key={s.id} className="flex items-center gap-2">
                          <span className="w-1 h-1 rounded-full bg-gray-600 flex-shrink-0" />
                          <span className="text-xs text-gray-400 truncate">{s.title}</span>
                          <span className="text-xs text-gray-600 flex-shrink-0">{formatDate(s.date)}</span>
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
                  <button
                    onClick={() => handleAnalyze(prospect)}
                    disabled={isAnalyzing || !!analyzing}
                    className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-brand hover:bg-brand/90 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
