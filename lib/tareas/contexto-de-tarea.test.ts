import { describe, expect, it } from "vitest";
import { contextoDeLaReunion, contextoDeRespaldo, LARGO_DEL_CONTEXTO } from "./contexto-de-tarea";
import { voseoEnProsa } from "@/lib/ui/voseo-formas";

describe("el contexto de una tarea que sale de una reunión", () => {
  it("sin detalle ni párrafo, el respaldo de las notas no dice nada", () => {
    expect(contextoDeRespaldo({ titulo: "Enviar el banner" }, [])).toBeNull();
  });

  it("el último respaldo ubica la tarea: qué reunión y cuándo", () => {
    const c = contextoDeLaReunion({ reunion: "Sprint planning de marketing", fecha: "lun 13 oct" });
    expect(c).toContain("«Sprint planning de marketing»");
    expect(c).toContain("lun 13 oct");
    expect(c).toMatch(/^Quedó como próximo paso/);
  });

  it("dice si salió de la conversación y no de las notas", () => {
    expect(contextoDeLaReunion({ reunion: "Retro", fecha: "vie 17 oct", deLaConversacion: true })).toMatch(/^Se dijo en la conversación/);
  });

  it("es corto, en tuteo y aguanta una reunión sin título", () => {
    const c = contextoDeLaReunion({ reunion: "  ", fecha: "lun 13 oct" });
    expect(c).toContain("«una reunión»");
    expect(c.length).toBeLessThanOrEqual(LARGO_DEL_CONTEXTO);
    expect(voseoEnProsa(c)).toEqual([]);
  });
});
