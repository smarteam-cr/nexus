/**
 * lib/marketing/inspiration/index.ts — punto de acceso al proveedor.
 * Cambiar de proveedor (Apify → otro) = nueva implementación + tocar SOLO acá.
 */
import type { InspirationProvider } from "./provider";
import { apifyProvider } from "./apify";

export { InspirationProviderError } from "./provider";
export type { InspirationProvider, RawInspirationPost } from "./provider";

export function getInspirationProvider(): InspirationProvider {
  return apifyProvider;
}
