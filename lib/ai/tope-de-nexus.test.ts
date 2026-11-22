import { describe, expect, it } from "vitest";
import { avisoDelTope, esDeNexusConversando, estadoDelTope, inicioDelMesCr, mensajeDelTope, TOPE_DE_NEXUS_USD_MES } from "./tope-de-nexus";

describe("el tope del mes de Nexus conversando (22 nov)", () => {
  it("es de US$ 100, avisa desde el 80 % y frena al llegar", () => {
    expect(TOPE_DE_NEXUS_USD_MES).toBe(100);
    expect(estadoDelTope(79.99).estado).toBe("bien");
    expect(estadoDelTope(80).estado).toBe("aviso");
    expect(estadoDelTope(99.5).estado).toBe("aviso");
    expect(estadoDelTope(100).estado).toBe("agotado");
  });

  it("lo que no se pudo leer no frena", () => {
    expect(estadoDelTope(null).estado).toBe("bien");
  });

  it("el aviso dice cuánto lleva, solo desde el 80 %, y el tope dice que lo guardado sigue", () => {
    expect(avisoDelTope(estadoDelTope(50))).toBeNull();
    expect(avisoDelTope(estadoDelTope(84.6))).toBe("Este mes Nexus lleva US$ 85 de los US$ 100 que tiene para conversar.");
    expect(mensajeDelTope(estadoDelTope(100))).toContain("Lo que ya guardaste sigue igual");
  });

  it("cuenta la conversación y el agente de impacto, nada más", () => {
    expect(esDeNexusConversando("chat:preventa")).toBe(true);
    expect(esDeNexusConversando("chat:preventa:respuesta")).toBe(true);
    expect(esDeNexusConversando("impacto:escala")).toBe(true);
    expect(esDeNexusConversando("tareas/chat")).toBe(false);
    expect(esDeNexusConversando("nexus-chat/documento")).toBe(false);
    expect(esDeNexusConversando(null)).toBe(false);
  });

  it("el mes empieza a medianoche de Costa Rica del día 1", () => {
    // 1 dic a las 05:59 UTC todavía es 30 nov en Costa Rica.
    expect(inicioDelMesCr(new Date("2026-12-01T05:59:00Z")).toISOString()).toBe("2026-11-01T06:00:00.000Z");
    expect(inicioDelMesCr(new Date("2026-12-01T06:00:00Z")).toISOString()).toBe("2026-12-01T06:00:00.000Z");
  });
});
