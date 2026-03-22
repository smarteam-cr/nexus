"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props {
  clientId: string;
  projectId: string;
}

const STAGES = [
  { num: 1, label: "Etapa 1: Diagnóstico" },
  { num: 2, label: "Etapa 2: MVP" },
  { num: 3, label: "Etapa 3: Adopción" },
];

export default function ProjectStageTabs({ clientId, projectId }: Props) {
  const pathname = usePathname();

  return (
    <div className="flex-shrink-0 border-b border-gray-800 px-4">
      <nav className="flex">
        {STAGES.map(({ num, label }) => {
          const isActive = pathname.includes(`/stage/${num}`);
          return (
            <Link
              key={num}
              href={`/clients/${clientId}/projects/${projectId}/stage/${num}`}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? "text-white border-brand"
                  : "text-gray-400 hover:text-white border-transparent hover:border-gray-600"
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full border flex items-center justify-center text-2xs font-semibold flex-shrink-0 ${
                  isActive
                    ? "bg-brand-soft border-brand/30 text-brand-dark"
                    : "border-gray-700 text-gray-600"
                }`}
              >
                {num}
              </span>
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
