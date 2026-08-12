/**
 * lib/landing/hubs-solucion.ts — la lógica PURA de la sección "Qué se implementa".
 *
 * La sección `solucion` de la propuesta de HubSpot pasó de cuatro campos de texto
 * (v1) a una columna por Hub vendido, explorable con píldoras. Esta lógica vive acá
 * y no adentro del componente por dos razones concretas:
 *
 * 1. El motor de landing renderiza el MISMO componente para lo ya publicado. El
 *    snapshot congela el `sectionType`, pero `configForSnapshot` resuelve primero por
 *    KEY contra la config VIVA (`const known = byKey.get(s.key); if (known) return known`)
 *    y `solucion` sigue viva → toda propuesta publicada estrena el componente nuevo.
 *    Por eso `esSolucionLegacy` no es una cortesía: es lo único que sostiene lo que ya
 *    está en la calle. Un predicado así merece test, y el project `unit` de vitest solo
 *    mira `lib/**` (mismo motivo que `is-blank.ts` y `hero-title.ts`).
 * 2. Los nombres de Hub llegan sucios. El agente puede escribir el slug, el rótulo o el
 *    nombre viejo del producto; los casos guardados traen `operations_hub` (10 filas) y
 *    `commerce_hub`. Todo eso se resuelve por `normalizeTag`, que es donde ya vive la
 *    doctrina de alias del catálogo — acá no se re-implementa el mapeo.
 */
import { HUBSPOT_HUB_SLUGS, labelForTag, normalizeTag, type HubspotHubSlug } from "@/lib/tags/catalog";
import type { HubColumna, HubsClienteData } from "@/components/landing/types";

/** Las 4 keys de la versión v1 de la sección. Se leen para decidir la rama legacy y
 *  NUNCA se escriben. Están acá y no sueltas en el componente porque
 *  `LEGACY_CARRY_EXCLUDE` (generate/route.ts) tiene que excluir exactamente estas. */
export const SOLUCION_LEGACY_KEYS = ["hubs", "integraciones", "casosDeUso", "usuarios"] as const;

/** El color de cada Hub, por nombre de variable CSS (declaradas en app/landing-engine.css).
 *  El valor vive en el CSS y no acá para que `lib/ui/landing-brand-contrast.test.ts`
 *  —que lee hex del archivo— pueda vigilar el contraste real contra el blanco. */
export const HUB_COLOR_VAR: Record<HubspotHubSlug, string> = {
  marketing_hub: "--hub-marketing",
  sales_hub: "--hub-sales",
  service_hub: "--hub-service",
  content_hub: "--hub-content",
  data_hub: "--hub-data",
  revenue_hub: "--hub-revenue",
};

/** Para una columna que NO es un Hub del catálogo (Breeze, un agente a la medida). */
export const HUB_NEUTRAL_VAR = "--hub-neutro";

function esHubDelCatalogo(slug: string | null): slug is HubspotHubSlug {
  return slug != null && (HUBSPOT_HUB_SLUGS as readonly string[]).includes(slug);
}

/** Color y rótulo de una columna. `label` es null cuando el hub no es del catálogo:
 *  ahí manda el título que escribió el agente, no un rótulo inventado. */
export function hubVisual(hub: string): { colorVar: string; label: string | null } {
  const slug = normalizeTag(hub ?? "");
  return esHubDelCatalogo(slug)
    ? { colorVar: HUB_COLOR_VAR[slug], label: labelForTag(slug) }
    : { colorVar: HUB_NEUTRAL_VAR, label: null };
}

/** Con qué identifica el CSE a una columna en `activos`. Va normalizada para que apagar
 *  un Hub siga apagado cuando el agente lo re-escriba con otro de sus nombres. */
export function columnaKey(c: HubColumna): string {
  const hub = (c.hub ?? "").trim();
  // Sin `hub` cae al título: una columna libre igual tiene que poder apagarse, y dos
  // columnas sin hub compartiendo la key "" se apagarían juntas.
  return normalizeTag(hub) ?? (hub || (c.titulo ?? "").trim());
}

/** Las columnas con forma válida. Descarta la basura sin reventar el render: el data
 *  viene de un Json que un agente escribió y que un humano después editó a mano. */
export function hubColumnas(data: HubsClienteData | undefined | null): HubColumna[] {
  const raw = data?.columnas;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is HubColumna => !!c && typeof c === "object" && !Array.isArray(c))
    .map((c) => ({
      hub: typeof c.hub === "string" ? c.hub : "",
      titulo: typeof c.titulo === "string" ? c.titulo : "",
      items: Array.isArray(c.items) ? c.items.filter((i) => !!i && typeof i === "object") : [],
    }));
}

/** true si hay que pintar la versión v1 (cuatro campos de texto). Solo cuando NO hay
 *  columnas Y sí hay texto viejo: sin las dos condiciones, una propuesta recién creada
 *  (vacía) caería en legacy y mostraría cuatro tarjetas vacías en vez de la sección. */
export function esSolucionLegacy(data: HubsClienteData | undefined | null): boolean {
  if (hubColumnas(data).length > 0) return false;
  const d = data as Record<string, unknown> | undefined | null;
  return SOLUCION_LEGACY_KEYS.some((k) => typeof d?.[k] === "string" && (d[k] as string).trim() !== "");
}

/** Las columnas que el CSE dejó encendidas. `activos` ausente = todas — es el estado con
 *  el que nace una generación, y ahí "no curado" significa "va todo lo que se vendió",
 *  no "no va nada". Un array vacío SÍ es una decisión: apagó todo. */
// Recibe las columnas YA saneadas en vez de volver a sanearlas: `hubColumnas` construye
// objetos nuevos, y dos llamadas devolverían columnas con la misma forma pero distinta
// identidad — con eso, un `columnas.indexOf(c)` en el componente daría -1 y escribir en
// una columna escribiría en la última. Filtrar el MISMO array lo vuelve imposible.
export function columnasActivas(columnas: HubColumna[], activos: unknown): HubColumna[] {
  if (!Array.isArray(activos)) return columnas;
  const on = new Set(activos.map((a) => (normalizeTag(String(a)) ?? String(a).trim())));
  return columnas.filter((c) => on.has(columnaKey(c)));
}

/** Los canales de una tarjeta, ya partidos y limpios. CSV porque `coerceToSchema` aplana
 *  toda hoja del schema a string: un `string[]` adentro de un ítem de array no sobrevive. */
export function parseCanales(canales: string | undefined | null): string[] {
  if (typeof canales !== "string") return [];
  return canales.split(",").map((s) => s.trim()).filter(Boolean);
}
