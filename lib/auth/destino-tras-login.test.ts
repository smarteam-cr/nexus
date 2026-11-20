/**
 * lib/auth/destino-tras-login.test.ts — volver tras el login solo a una ruta de Nexus (nunca a otro sitio).
 */
import { describe, expect, it } from "vitest";
import { destinoTrasLogin } from "./destino-tras-login";

describe("destinoTrasLogin", () => {
  it("acepta una ruta interna, como la de una partida de trivia", () => {
    expect(destinoTrasLogin("/trivia/play/K7M2QX")).toBe("/trivia/play/K7M2QX");
    expect(destinoTrasLogin("/clients/abc123")).toBe("/clients/abc123");
  });

  it("descarta lo que llevaría a otro sitio", () => {
    for (const malo of [
      "//evil.com",
      "/\\evil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "/%2F%2Fevil.com",
      "evil.com",
      "/ruta con espacios",
      "/trivia?x=//evil.com",
      "/x/../auth/signout",
      "/trivia/./../api/trivia",
      "/..",
    ]) {
      expect(destinoTrasLogin(malo), malo).toBeNull();
    }
  });

  it("descarta la raíz, el login y la API", () => {
    expect(destinoTrasLogin("/")).toBeNull();
    expect(destinoTrasLogin("/auth/google")).toBeNull();
    expect(destinoTrasLogin("/api/trivia/play/K7M2QX")).toBeNull();
  });

  it("descarta lo vacío y lo demasiado largo", () => {
    expect(destinoTrasLogin(undefined)).toBeNull();
    expect(destinoTrasLogin(null)).toBeNull();
    expect(destinoTrasLogin("")).toBeNull();
    expect(destinoTrasLogin(`/${"a".repeat(400)}`)).toBeNull();
  });
});
