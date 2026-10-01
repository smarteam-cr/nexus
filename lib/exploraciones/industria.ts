/**
 * lib/exploraciones/industria.ts — qué edición de la escala sugerir para la industria de una empresa. PURO.
 *
 * La escala dice que cada unidad se mide con la edición de su industria, si existe, y con la escala
 * general si no; se decide al arrancar y se escribe. Acá solo se SUGIERE: el vendedor la confirma o
 * la cambia, porque la industria de HubSpot no siempre dice cómo vende la empresa (una empresa de
 * software para bancos vende software, no es un banco).
 *
 * La industria llega en tres formas que no coinciden entre sí: los códigos de HubSpot de antes
 * (`COMPUTER_SOFTWARE`), los de ahora (`COMPUTER_SOFTWARE_ENGINEERING`) y la etiqueta en español que
 * escribe el test («Banca»). Por eso se busca por palabras, no por código exacto. La clave de la
 * edición (`banca`…) es su identificador estable en la escala; si una escala no la trae, no se sugiere.
 */
import { normalizarTexto } from "./contenido";

/** Palabras (ya normalizadas) que apuntan a cada edición. */
const PISTAS: Record<string, readonly string[]> = {
  "ecommerce-retail": [
    "retail",
    "ecommerce",
    "e commerce",
    "comercio",
    "tienda",
    "supermarket",
    "supermercado",
    "apparel",
    "fashion",
    "moda",
    "consumer goods",
    "consumer electronics",
    "bienes de consumo",
    "cosmetic",
    "cosmetico",
    "luxury",
    "jewelry",
    "joyeria",
    "sporting goods",
  ],
  banca: [
    "banking",
    "bank",
    "banca",
    "banco",
    "financial services",
    "servicios financieros",
    "capital markets",
    "investment",
    "mortgage",
    "insurance",
    "seguros",
    "cooperativa",
    "credit union",
  ],
  educacion: [
    "education",
    "educacion",
    "e learning",
    "elearning",
    "higher education",
    "academia",
    "universidad",
    "colegio",
    "escuela",
  ],
  inmobiliaria: ["real estate", "inmobiliaria", "bienes raices"],
};

/**
 * La edición sugerida para una industria (código de HubSpot o texto), o null = la escala general.
 * Solo devuelve claves que estén en `disponibles` (las ediciones de la escala publicada).
 */
export function sugerirEdicion(industria: string | null | undefined, disponibles: readonly string[]): string | null {
  if (!industria) return null;
  const texto = ` ${normalizarTexto(industria.replace(/[_-]+/g, " "))} `;
  for (const [slug, pistas] of Object.entries(PISTAS)) {
    if (!disponibles.includes(slug)) continue;
    if (pistas.some((p) => texto.includes(` ${p}`))) return slug;
  }
  return null;
}

/** La industria de HubSpot, legible: `COMPUTER_SOFTWARE` → «Computer software». */
export function industriaLegible(industria: string | null | undefined): string | null {
  if (!industria) return null;
  if (!/^[A-Z0-9_]+$/.test(industria)) return industria;
  const t = industria.toLowerCase().replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}
