"use client";

import { useParams } from "next/navigation";
import { useCanvasToggle } from "./CanvasToggleShell";

export default function CanvasToggleButtons() {
  const { active, toggle } = useCanvasToggle();
  const params = useParams();
  const projectId = params?.projectId as string | undefined;

  return (
    <>
      <button
        onClick={() => toggle("empresa")}
        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-2xs font-medium border transition-colors flex-shrink-0 ${
          active === "empresa"
            ? "text-white bg-gray-800 border-gray-700"
            : "text-gray-500 hover:text-gray-300 border-gray-800 hover:border-gray-700 hover:bg-gray-800/50"
        }`}
        title="Canvas de empresa"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
        Empresa
      </button>
      {projectId && (
        <button
          onClick={() => toggle("proyecto")}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-2xs font-medium border transition-colors flex-shrink-0 ${
            active === "proyecto"
              ? "text-white bg-gray-800 border-gray-700"
              : "text-gray-500 hover:text-gray-300 border-gray-800 hover:border-gray-700 hover:bg-gray-800/50"
          }`}
          title="Canvas de proyecto"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Proyecto
        </button>
      )}
    </>
  );
}
