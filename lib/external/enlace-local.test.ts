import { describe, expect, it } from "vitest";
import { enlaceEnEsteNavegador } from "./enlace-local";

describe("el enlace del cliente, en la dirección que se está mirando", () => {
  it("en local, del 3004 del .env al 3005 del navegador", () => {
    expect(enlaceEnEsteNavegador("http://localhost:3004/external/plan/abc", "http://localhost:3005")).toBe("http://localhost:3005/external/plan/abc");
  });
  it("⛔ en producción no cambia nada, ni con un navegador local mirando un enlace público", () => {
    expect(enlaceEnEsteNavegador("https://nexus.smarteamcr.com/external/verify/x", "https://nexus.smarteamcr.com")).toBe("https://nexus.smarteamcr.com/external/verify/x");
    expect(enlaceEnEsteNavegador("https://nexus.smarteamcr.com/external/verify/x", "http://localhost:3005")).toBe("https://nexus.smarteamcr.com/external/verify/x");
    expect(enlaceEnEsteNavegador("http://localhost:3004/external/verify/x", "https://nexus.smarteamcr.com")).toBe("http://localhost:3004/external/verify/x");
    expect(enlaceEnEsteNavegador("http://localhost:3004/x", null)).toBe("http://localhost:3004/x");
  });
});
