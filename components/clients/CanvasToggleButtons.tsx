"use client";

import { useParams, usePathname, useRouter } from "next/navigation";

export default function CanvasToggleButtons() {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const clientId = params?.id as string | undefined;
  const projectId = params?.projectId as string | undefined;

  if (!projectId || !clientId) return null;

  // Si estamos en una subetapa (stage/), el botón navega al canvas
  const isInStage = /\/stage\//.test(pathname);

  if (!isInStage) return null; // Ya estamos en el canvas, no mostrar botón

  const handleClick = () => {
    router.push(`/clients/${clientId}/projects/${projectId}`);
  };

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-2xs font-medium border transition-colors flex-shrink-0 text-gray-500 hover:text-gray-300 border-gray-800 hover:border-gray-700 hover:bg-gray-800/50"
      title="Canvas de servicio"
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
      Canvas
    </button>
  );
}
