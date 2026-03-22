"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props {
  clientId: string;
}

export default function StageTabs({ clientId }: Props) {
  const pathname = usePathname();
  const isStage1 = pathname.includes("/stage/1");
  const isStage2 = pathname.includes("/stage/2");

  return (
    <div className="flex-shrink-0 border-b border-gray-800 px-4">
      <nav className="flex">
        <StageTab
          href={`/clients/${clientId}/stage/1`}
          label="Etapa 1: Diagnóstico"
          stageNum={1}
          isActive={isStage1}
        />
        <StageTab
          href={`/clients/${clientId}/stage/2`}
          label="Etapa 2: Construir la base"
          stageNum={2}
          isActive={isStage2}
        />
      </nav>
    </div>
  );
}

function StageTab({
  href,
  label,
  stageNum,
  isActive,
}: {
  href: string;
  label: string;
  stageNum: number;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
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
        {stageNum}
      </span>
      {label}
    </Link>
  );
}
