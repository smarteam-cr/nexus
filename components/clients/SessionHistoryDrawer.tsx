"use client";

/**
 * components/clients/SessionHistoryDrawer.tsx
 *
 * Drawer lateral derecho con el historial cronológico de sesiones del proyecto.
 * Se abre desde el CTA "Ver historial de sesiones →" del MinuteDialog.
 *
 * Mismo patrón visual que ClientHeaderPopovers (drawer fixed right, w-[480px]).
 */
import Link from "next/link";

interface HistoryItem {
  sessionId: string;
  title: string;
  date: string;
  duration: number;
  participants: string[];
  detectedTopics: string[];
  isPrimary: boolean;
  source: string;
  confidence: number | null;
  hasTranscript: boolean;
  minuteStatus: "DRAFT" | "REVIEWED" | "EDITED" | null;
}

export default function SessionHistoryDrawer({
  clientId: _clientId,
  history,
  onClose,
}: {
  clientId: string;
  history: HistoryItem[];
  onClose: () => void;
}) {
  return (
    <>
      {/* Backdrop por encima del modal de la minuta */}
      <div
        className="fixed inset-0 z-[55] bg-black/30"
        onClick={onClose}
      />

      {/* Drawer derecho */}
      <div className="fixed right-0 top-0 h-full w-[480px] bg-gray-900 border-l border-gray-700/80 shadow-2xl z-[60] flex flex-col animate-in slide-in-from-right duration-200">
        <div className="flex-shrink-0 border-b border-gray-800 px-5 pt-4 pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Historial de sesiones</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {history.length} sesion{history.length === 1 ? "" : "es"} vinculadas al proyecto
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
            aria-label="Cerrar"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {history.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-700 bg-gray-900/50 p-8 text-center">
              <p className="text-sm text-gray-500">
                No hay sesiones asignadas a este proyecto todavía.
              </p>
            </div>
          ) : (
            history.map((h) => (
              <Link
                key={h.sessionId}
                href={`/sessions/${h.sessionId}`}
                className="block px-3 py-3 rounded-xl border border-gray-800 hover:bg-gray-900 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white truncate">{h.title}</p>
                      {h.isPrimary && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-brand/20 text-brand">
                          PRIMARIO
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500 flex-wrap">
                      <span>{new Date(h.date).toLocaleString("es-CR")}</span>
                      <span>•</span>
                      <span>{h.participants.length} participantes</span>
                      {h.detectedTopics.length > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-gray-400">
                            {h.detectedTopics.slice(0, 3).join(", ")}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {h.minuteStatus === "DRAFT" && (
                      <span className="text-[10px] text-amber-400">📝 Borrador</span>
                    )}
                    {(h.minuteStatus === "REVIEWED" || h.minuteStatus === "EDITED") && (
                      <span className="text-[10px] text-emerald-400">✓ Minuta</span>
                    )}
                    {!h.minuteStatus && h.hasTranscript && (
                      <span className="text-[10px] text-gray-500">Sin minuta</span>
                    )}
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </>
  );
}
