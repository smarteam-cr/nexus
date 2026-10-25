import { describe, expect, it } from "vitest";
import { DE_QUIEN_ES, porQueFalta, type ReunionSinTranscripcion } from "./por-que-falta";

const INICIO = new Date("2026-10-10T15:00:00Z");
const HOY = new Date("2026-10-17T15:00:00Z");
const mas = (min: number) => new Date(INICIO.getTime() + min * 60_000);
const NUESTRO = "asalas@smarteamcr.com";
const CLIENTE = "gerente@cliente.com";

const r = (p: Partial<ReunionSinTranscripcion> = {}): ReunionSinTranscripcion => ({
  date: INICIO,
  duration: 60,
  enrichedAt: mas(90),
  enrichAttempts: 0,
  enrichError: null,
  googleDocId: null,
  organizerEmail: NUESTRO,
  participants: [NUESTRO, CLIENTE],
  tieneNotas: false,
  ...p,
});

describe("porQueFalta", () => {
  it("todavía no terminó", () => expect(porQueFalta(r(), mas(70))).toBe("todavia_no_termino"));
  it("no ocurrió (la API de Meet dice que nadie entró, U3): después de que terminó, y nunca antes", () => {
    expect(porQueFalta(r({ ocurrio: false }), HOY)).toBe("no_ocurrio");
    expect(porQueFalta(r({ ocurrio: false }), mas(70))).toBe("todavia_no_termino");
    expect(porQueFalta(r({ ocurrio: true }), HOY)).toBe("no_se_grabo");
    expect(DE_QUIEN_ES.no_ocurrio.dueno).toBe("nada");
  });
  it("cancelada en el calendario: gana sobre todo lo demás (probablemente no ocurrió)", () => {
    expect(porQueFalta(r({ canceladaEn: mas(-60) }), HOY)).toBe("cancelada");
    expect(porQueFalta(r({ canceladaEn: mas(-60), enrichedAt: null }), mas(70))).toBe("cancelada");
    expect(DE_QUIEN_ES.cancelada.dueno).toBe("nada");
  });
  it("nadie del equipo invitado", () => {
    expect(porQueFalta(r({ organizerEmail: CLIENTE, participants: [CLIENTE] }), HOY)).toBe("sin_nadie_del_equipo");
  });
  it("pendiente, esperando a Google o fallando: lo maneja Nexus solo", () => {
    expect(porQueFalta(r({ enrichedAt: null }), HOY)).toBe("pendiente_de_leer");
    expect(porQueFalta(r({ enrichedAt: null, enrichAttempts: 1, enrichError: JSON.stringify({ esperandoMaterial: true, at: HOY }) }), HOY)).toBe("esperando_a_google");
    expect(porQueFalta(r({ enrichedAt: null, enrichAttempts: 2, enrichError: JSON.stringify({ error: "Quota", status: 429 }) }), HOY)).toBe("fallo_de_lectura_reintentando");
  });
  it("sellada por tope con su error", () => {
    expect(porQueFalta(r({ enrichAttempts: 5, enrichError: JSON.stringify({ error: "The caller does not have permission", status: 403, selladoPorTope: true }) }), HOY)).toBe("fallo_de_lectura_sellada");
  });
  it("leída antes de que terminara (la pasada vieja, una hora después del inicio de una reunión de 90 minutos)", () => {
    expect(porQueFalta(r({ duration: 90, enrichedAt: mas(61) }), HOY)).toBe("leida_antes_de_terminar");
  });
  it("lo que es de Google Workspace", () => {
    expect(porQueFalta(r({ tieneNotas: true }), HOY)).toBe("solo_notas_sin_transcripcion");
    expect(porQueFalta(r({ googleDocId: "doc" }), HOY)).toBe("documento_vacio");
    expect(porQueFalta(r(), HOY)).toBe("no_se_grabo");
    expect(porQueFalta(r({ organizerEmail: CLIENTE }), HOY)).toBe("organizada_por_afuera");
  });
  it("cada motivo dice de quién es el arreglo, en tuteo y sin jerga", () => {
    for (const m of Object.values(DE_QUIEN_ES)) {
      expect(m.texto.length).toBeGreaterThan(10);
      expect(m.texto).not.toMatch(/\b(?:podés|tenés|fijate|enrichedAt|googleDocId)\b/);
    }
  });
});
