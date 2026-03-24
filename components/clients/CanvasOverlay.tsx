"use client";

import { useParams } from "next/navigation";
import { useCanvasToggle } from "./CanvasToggleShell";
import ClientCanvasPanel from "./ClientCanvasPanel";
import ProjectCanvasPanel from "./ProjectCanvasPanel";

export default function CanvasOverlay({ clientId }: { clientId: string }) {
  const { active, toggle } = useCanvasToggle();
  const params = useParams();
  const projectId = params?.projectId as string | undefined;

  if (!active) return null;

  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-gray-50">
      {/* Botón cerrar */}
      <button
        onClick={() => toggle(active)}
        className="sticky top-4 ml-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300 shadow-sm transition-colors text-xs font-medium"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Volver
      </button>

      {active === "empresa" && <ClientCanvasPanel clientId={clientId} />}
      {active === "proyecto" && projectId && <ProjectCanvasPanel projectId={projectId} />}
    </div>
  );
}
