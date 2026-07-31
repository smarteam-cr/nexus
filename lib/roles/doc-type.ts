/**
 * lib/roles/doc-type.ts — qué PLANTILLA le toca a cada tipo de documento de /roles.
 *
 * Server-safe a propósito: acá viven solo las *defs* (keys, labels, schemas), nunca la
 * `LandingConfig` con los componentes React. `lib/print/load-doc.ts` es `import "server-only"`
 * y consume estas funciones — si devolvieran la config, arrastrarían `sections-roles.tsx` a un
 * módulo de servidor. El par cliente vive en `components/landing/configs/doc-type.ts`
 * (ARCHITECTURE §1-WEB punto 2: las defs y el mapa de componentes van separados).
 *
 * Los dos mapas son `Record<RoleDocTypeValue, …>`: un tercer tipo de documento NO COMPILA
 * hasta declarar su plantilla acá.
 */
import type { BCSectionDef } from "@/components/landing/configs/business-case.defs";
import { ROLE_CONTENT_KEYS, ROLE_SECTION_DEFS } from "@/components/landing/configs/roles.defs";
import {
  PROPUESTA_CONTENT_KEYS,
  PROPUESTA_SECTION_DEFS,
} from "@/components/landing/configs/propuesta.defs";
import type { RoleDocTypeValue } from "./schema";

const CONTENT_KEYS: Record<RoleDocTypeValue, readonly string[]> = {
  PERFIL: ROLE_CONTENT_KEYS,
  PROPUESTA: PROPUESTA_CONTENT_KEYS,
};

const SECTION_DEFS: Record<RoleDocTypeValue, BCSectionDef[]> = {
  PERFIL: ROLE_SECTION_DEFS,
  PROPUESTA: PROPUESTA_SECTION_DEFS,
};

/** Las keys de `content` que ESE tipo de documento renderiza, en orden (sin el hero). */
export function contentKeysForDocType(docType: RoleDocTypeValue): readonly string[] {
  return CONTENT_KEYS[docType];
}

/** Las defs completas (hero incluido) de la plantilla de ESE tipo. */
export function sectionDefsForDocType(docType: RoleDocTypeValue): BCSectionDef[] {
  return SECTION_DEFS[docType];
}

/**
 * ¿Este documento se lee 20% más grande? La propuesta sí: la lee de corrido una persona que
 * no conoce el documento. Vive acá y no pegado al componente para que la vista interna, la
 * del compartido y la pública no puedan discrepar.
 */
export function escalaForDocType(docType: RoleDocTypeValue): string | undefined {
  return docType === "PROPUESTA" ? "stl-escala-120" : undefined;
}
