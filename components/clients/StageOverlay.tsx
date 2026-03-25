"use client";

import { useRouter, useParams } from "next/navigation";

export default function StageOverlay({
  stepLabel,
  children,
}: {
  stepLabel: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const params = useParams();
  const clientId = params?.id as string;
  const projectId = params?.projectId as string;

  const handleClose = () => {
    router.push(`/clients/${clientId}/projects/${projectId}`);
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-white">
      {/* Header del overlay */}
      <div className="flex-shrink-0 flex items-center gap-3 px-5 py-3 border-b border-gray-200 bg-gray-50/80">
        <button
          onClick={handleClose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300 shadow-sm transition-colors text-xs font-medium"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Canvas
        </button>
        <span className="text-sm font-semibold text-gray-700">{stepLabel}</span>
      </div>

      {/* Contenido de la subetapa */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
