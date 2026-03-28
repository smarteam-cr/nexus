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

  const handleClose = () => {
    router.push(`/clients/${clientId}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop oscuro */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal centrado */}
      <div className="relative w-[90vw] h-[85vh] max-w-[1200px] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-gray-50/80">
          <span className="text-sm font-semibold text-gray-700">{stepLabel}</span>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Cerrar"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
