const HUB_COLORS: Record<string, string> = {
  "Marketing Hub": "bg-orange-50 text-orange-700 border-orange-200",
  "Sales Hub":     "bg-blue-50 text-blue-700 border-blue-200",
  "Service Hub":   "bg-green-50 text-green-700 border-green-200",
  "CMS Hub":       "bg-purple-50 text-purple-700 border-purple-200",
  "Operations Hub":"bg-surface-hover text-fg-secondary border-line",
  "Commerce Hub":  "bg-pink-50 text-pink-700 border-pink-200",
};

const DEFAULT_COLOR = "bg-surface-muted text-fg-muted border-line";

// Map serviceType to Hub name for inference
const SERVICE_TO_HUB: Record<string, string> = {
  loop_marketing: "Marketing Hub",
  loop_sales: "Sales Hub",
  loop_service: "Service Hub",
};

/**
 * Reusable Hub badge component.
 * Can receive explicit tags or infer from serviceType.
 */
export default function HubBadge({
  tags,
  serviceType,
  size = "sm",
}: {
  tags?: string[];
  serviceType?: string | null;
  size?: "sm" | "xs";
}) {
  // Use explicit tags if available, otherwise infer from serviceType
  const resolvedTags = tags?.length
    ? tags
    : serviceType && SERVICE_TO_HUB[serviceType]
      ? [SERVICE_TO_HUB[serviceType]]
      : [];

  if (resolvedTags.length === 0) return null;

  const textSize = size === "xs" ? "text-[9px]" : "text-[11px]";
  const padding = size === "xs" ? "px-1.5 py-0" : "px-2 py-0.5";

  return (
    <>
      {resolvedTags.map((tag) => (
        <span
          key={tag}
          className={`inline-flex items-center ${padding} rounded-full ${textSize} font-semibold border ${HUB_COLORS[tag] ?? DEFAULT_COLOR}`}
        >
          {tag}
        </span>
      ))}
    </>
  );
}
