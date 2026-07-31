/**
 * components/landing/configs/doc-type.ts — la mitad CLIENTE del helper por tipo de documento
 * de /roles: qué `LandingConfig` (defs + mapa sectionType → Component) le toca a cada tipo.
 *
 * Vive separado de `lib/roles/doc-type.ts` (que devuelve solo las defs, server-safe) porque
 * este módulo arrastra los renderers React y `lib/print/load-doc.ts` es `import "server-only"`
 * — ARCHITECTURE §1-WEB punto 2. Mismo motivo por el que cada plantilla ya tiene su par
 * `*.defs.ts` / `*.ts`.
 */
import type { LandingConfig } from "../types";
import type { RoleDocTypeValue } from "@/lib/roles/schema";
import { landingConfigForRoles } from "./roles";
import { landingConfigForPropuesta } from "./propuesta";

/** `Record` a propósito: un tercer tipo de documento no compila hasta declarar su config. */
const CONFIGS: Record<RoleDocTypeValue, () => LandingConfig> = {
  PERFIL: landingConfigForRoles,
  PROPUESTA: landingConfigForPropuesta,
};

export function landingConfigForDocType(docType: RoleDocTypeValue): LandingConfig {
  return CONFIGS[docType]();
}
