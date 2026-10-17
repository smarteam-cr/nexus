/**
 * lib/exploraciones/siguiente-paso-de-la-preventa.test.ts — agendar la próxima sesión o planificarla.
 * Correr: `npx vitest run lib/exploraciones/siguiente-paso-de-la-preventa.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import type { GuiaDeLaSesion } from "./guia";
import { enlaceParaAgendar, siguientePasoDeLaPreventa } from "./siguiente-paso-de-la-preventa";

const base = { agenda: [], guias: {}, hoy: "2026-10-17", empresa: "Acme" };
const guia = { en: "2026-10-16T00:00:00Z" } as unknown as GuiaDeLaSesion;

describe("el siguiente paso de la preventa", () => {
  it("sin próxima sesión, agendar, con el evento armado por enlace", () => {
    const p = siguientePasoDeLaPreventa({ ...base, sesiones: [{ id: "s-1", fecha: "2026-10-01" }], invitados: ["ana@acme.com", "no es correo"] });
    expect(p).toMatchObject({ tipo: "agendar", numero: 2, sesionId: null });
    if (p.tipo !== "agendar") throw new Error("debía ser agendar");
    const url = new URL(p.enlace);
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("text")).toBe("Acme · Sesión 2 de exploración");
    expect(url.searchParams.get("add")).toBe("ana@acme.com");
  });

  it("una sesión planeada sin fecha también se agenda", () => {
    expect(siguientePasoDeLaPreventa({ ...base, sesiones: [{ id: "s-1" }] })).toMatchObject({ tipo: "agendar", sesionId: "s-1", numero: 1 });
  });

  it("agendada sin guía ni objetivo: planificar", () => {
    const p = siguientePasoDeLaPreventa({ ...base, sesiones: [{ id: "s-2", fecha: "2026-10-20" }] });
    expect(p).toMatchObject({ tipo: "planificar", sesionId: "s-2", fecha: "2026-10-20", falta: ["guia", "objetivo"] });
  });

  it("con guía y objetivo, lista", () => {
    const p = siguientePasoDeLaPreventa({ ...base, sesiones: [{ id: "s-2", fecha: "2026-10-20", objetivo: "Saber qué frena" }], guias: { "s-2": guia } });
    expect(p.tipo).toBe("lista");
  });

  it("una reunión agendada solo en HubSpot se une a una sesión", () => {
    const p = siguientePasoDeLaPreventa({ ...base, sesiones: [], agenda: [{ titulo: "Demo", inicio: "2026-10-21T15:00:00Z" }] });
    expect(p).toMatchObject({ tipo: "planificar", falta: ["sesion"], sesionId: null });
  });

  it("el enlace no lleva invitados si no hay correos válidos", () => {
    expect(new URL(enlaceParaAgendar({ titulo: "x", detalle: "y", invitados: ["nada"] })).searchParams.has("add")).toBe(false);
  });
});
