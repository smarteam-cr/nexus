/**
 * lib/conector-claude/token-de-prueba.ts — la entrada del prototipo del conector (fase 0, docs/plan-conector-claude.md).
 *
 * En vez de la puerta OAuth (fase 1), un token fijo que vive en el entorno del servidor y que SOLO vale cuando la base es
 * la local (el mismo criterio que el fixture: `esBaseLocal`, scripts/lib/guard.ts) y fuera de un build de producción
 * (`NODE_ENV` = production, el del contenedor). Contra producción no abre nada, ni con el token bien puesto, ni si un
 * túnel hiciera que la base de producción se vea como localhost. Con él, el conector actúa como la persona de
 * `NEXUS_CONECTOR_PERSONA_DE_PRUEBA`.
 *
 * Puro: la prueba es ./token-de-prueba.test.ts.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { esBaseLocal } from "@/scripts/lib/guard";

/** Un token más corto no se acepta: es fácil de adivinar. */
export const LARGO_MINIMO_DEL_TOKEN = 32;

export interface EntornoDelToken {
  /** `NEXUS_CONECTOR_TOKEN_DE_PRUEBA`. */
  token?: string;
  /** `DATABASE_URL` del proceso: la base contra la que leería el conector. */
  databaseUrl?: string;
  /** `NODE_ENV` del proceso: en un build de producción el token no vale nunca. */
  nodeEnv?: string;
}

const huella = (s: string) => createHash("sha256").update(s, "utf8").digest();

/** ¿Este `Bearer` abre el conector? Solo con el token del entorno, largo, con la base local y fuera de producción. */
export function tokenDePruebaValido(bearer: string | undefined, entorno: EntornoDelToken): boolean {
  const esperado = entorno.token?.trim() ?? "";
  if (esperado.length < LARGO_MINIMO_DEL_TOKEN) return false;
  if (!esBaseLocal(entorno.databaseUrl)) return false;
  if (entorno.nodeEnv === "production") return false;
  if (!bearer) return false;
  // Se comparan las huellas: mismo largo siempre y sin cortar al primer carácter distinto.
  return timingSafeEqual(huella(bearer), huella(esperado));
}
