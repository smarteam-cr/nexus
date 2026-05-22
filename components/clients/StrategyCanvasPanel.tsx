"use client";

import { useParams } from "next/navigation";
import SectionBlockList from "@/components/canvas/SectionBlockList";

export default function StrategyCanvasPanel({
  projectId,
  canvasId,
}: {
  projectId: string;
  canvasId: string;
}) {
  const params = useParams();
  const clientId = (params?.id as string) ?? "";

  return (
    <div className="px-6 py-4 space-y-4">
      {/* Header con acción de export */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Canvas de Estrategia</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Vista estratégica del cliente — bloques editables por sección.
          </p>
        </div>
        {clientId && (
          <a
            href={`/print/canvas/${clientId}/${canvasId}?print=1&projectId=${projectId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800 hover:border-gray-700"
            title="Abre una vista imprimible para guardar como PDF"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Exportar PDF
          </a>
        )}
      </div>

      <SectionBlockList projectId={projectId} canvasId={canvasId} />
    </div>
  );
}
