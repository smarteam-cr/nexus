const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  BASE_IMPLEMENTATION: {
    label: "Implementación",
    color: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  USE_CASE: {
    label: "Caso de uso",
    color: "bg-teal-50 text-teal-700 border-teal-200",
  },
};

export default function ProjectTypeBadge({
  projectType,
  size = "sm",
}: {
  projectType?: string | null;
  size?: "sm" | "xs";
}) {
  if (!projectType) return null;

  const config = TYPE_CONFIG[projectType];
  if (!config) return null;

  const textSize = size === "xs" ? "text-[9px]" : "text-[11px]";
  const padding = size === "xs" ? "px-1.5 py-0" : "px-2 py-0.5";

  return (
    <span
      className={`inline-flex items-center ${padding} rounded-full ${textSize} font-semibold border ${config.color}`}
    >
      {config.label}
    </span>
  );
}
