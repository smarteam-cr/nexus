/**
 * lib/conector-claude/token-de-prueba.test.ts — el token de la fase 0 solo abre con la base local.
 */
import { describe, expect, it } from "vitest";
import { LARGO_MINIMO_DEL_TOKEN, tokenDePruebaValido } from "./token-de-prueba";

const TOKEN = "t".repeat(LARGO_MINIMO_DEL_TOKEN);
const LOCAL = "postgresql://postgres:postgres@localhost:5433/nexus_local";
const PROD = "postgresql://postgres.abc:x@aws-0-us-east-1.pooler.supabase.com:6543/postgres";

describe("el token de prueba del conector", () => {
  it("abre con el token exacto y la base local", () => {
    expect(tokenDePruebaValido(TOKEN, { token: TOKEN, databaseUrl: LOCAL })).toBe(true);
    expect(tokenDePruebaValido(TOKEN, { token: TOKEN, databaseUrl: "postgresql://u:p@127.0.0.1:5433/nexus_local" })).toBe(true);
  });

  it("⛔ no abre contra producción, aunque el token esté bien", () => {
    expect(tokenDePruebaValido(TOKEN, { token: TOKEN, databaseUrl: PROD })).toBe(false);
    expect(tokenDePruebaValido(TOKEN, { token: TOKEN, databaseUrl: undefined })).toBe(false);
  });

  it("⛔ no abre en un build de producción, aunque la base se vea local (un túnel)", () => {
    expect(tokenDePruebaValido(TOKEN, { token: TOKEN, databaseUrl: LOCAL, nodeEnv: "production" })).toBe(false);
    expect(tokenDePruebaValido(TOKEN, { token: TOKEN, databaseUrl: LOCAL, nodeEnv: "development" })).toBe(true);
  });

  it("⛔ no abre con otro token, sin token, ni con el del entorno vacío o corto", () => {
    expect(tokenDePruebaValido(`${TOKEN}x`, { token: TOKEN, databaseUrl: LOCAL })).toBe(false);
    expect(tokenDePruebaValido(undefined, { token: TOKEN, databaseUrl: LOCAL })).toBe(false);
    expect(tokenDePruebaValido("", { token: "", databaseUrl: LOCAL })).toBe(false);
    expect(tokenDePruebaValido(undefined, { token: undefined, databaseUrl: LOCAL })).toBe(false);
    const corto = "c".repeat(LARGO_MINIMO_DEL_TOKEN - 1);
    expect(tokenDePruebaValido(corto, { token: corto, databaseUrl: LOCAL })).toBe(false);
  });
});
