import { sanitizeTags, tagDef, labelForTag, SERVICE_TO_PRODUCT } from "@/lib/tags/catalog";

/**
 * components/ui/HubBadge.tsx — la insignia de PRODUCTO de un proyecto.
 *
 * ── QUÉ MUESTRA, Y QUÉ NO ────────────────────────────────────────────────────
 * Solo los tags del grupo `product` (los Hubs de HubSpot + Insider One). El resto de la
 * clasificación —alcance, tipo de implementación, modalidad— NO se pinta acá: esto vive en
 * listados densos donde la pregunta es "¿de qué producto es este proyecto?". La tira completa y
 * editable es `components/tags/TagsStrip.tsx`.
 *
 * ⚠ 2026-08-12: filtrar por grupo dejó de ser cosmético y pasó a ser NECESARIO. Antes el
 * componente pintaba lo que le llegara, y como `Project.tags` solo tenía productos y alcance el
 * ruido era tolerable; desde que el tipo de implementación es un tag más, sin este filtro el
 * listado de proyectos mostraría "Implementación" como si fuera un producto de HubSpot.
 *
 * ⚠ Y se indexa por SLUG, no por label. Recibe `Project.tags`, que guarda slugs — la tabla vieja
 * estaba keyeada por el label vigente, así que TODO badge caía al color gris por defecto salvo
 * cuando la fila tenía storage histórico con labels. Se veía "bien" sin fallar nada.
 */
const HUB_COLORS: Record<string, string> = {
  marketing_hub: "bg-orange-50 text-orange-700 border-orange-200",
  sales_hub: "bg-blue-50 text-blue-700 border-blue-200",
  service_hub: "bg-green-50 text-green-700 border-green-200",
  content_hub: "bg-purple-50 text-purple-700 border-purple-200", // ex "CMS Hub"
  data_hub: "bg-cyan-50 text-cyan-700 border-cyan-200", // ex "Operations Hub"
  revenue_hub: "bg-pink-50 text-pink-700 border-pink-200", // ex "Commerce Hub"
  insider_one: "bg-surface-hover text-fg-secondary border-line",
};

const DEFAULT_COLOR = "bg-surface-muted text-fg-muted border-line";

export default function HubBadge({
  tags,
  serviceType,
  size = "sm",
}: {
  tags?: string[];
  serviceType?: string | null;
  size?: "sm" | "xs";
}) {
  /* `sanitizeTags` normaliza labels históricos y renombres de HubSpot al slug vigente — es la
     misma puerta que usa el resto del sistema, así que el color no depende de CÓMO se guardó. */
  const productos = sanitizeTags(tags ?? []).filter((s) => tagDef(s)?.group === "product");
  const resolvedTags = productos.length
    ? productos
    : serviceType && SERVICE_TO_PRODUCT[serviceType]
      ? [SERVICE_TO_PRODUCT[serviceType]]
      : [];

  if (resolvedTags.length === 0) return null;

  const textSize = size === "xs" ? "text-[9px]" : "text-[11px]";
  const padding = size === "xs" ? "px-1.5 py-0" : "px-2 py-0.5";

  return (
    <>
      {resolvedTags.map((slug) => (
        <span
          key={slug}
          className={`inline-flex items-center ${padding} rounded-full ${textSize} font-semibold border ${HUB_COLORS[slug] ?? DEFAULT_COLOR}`}
        >
          {labelForTag(slug)}
        </span>
      ))}
    </>
  );
}
