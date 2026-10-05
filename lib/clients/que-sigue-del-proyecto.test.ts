import { describe, expect, it } from "vitest";
import { etapaDeNexus, porQueEstaAca, queSigueDelProyecto, type PiezaParaQueSigue } from "./que-sigue-del-proyecto";
import type { EtapaParaLaUI } from "@/lib/lifecycle/etapa-ui";

const etapa = (id: string, label: string, razones: string[] = []): EtapaParaLaUI => ({
  id,
  label,
  posicion: { index: 3, total: 9 },
  linea: [],
  tituloDeLaLinea: "Etapas",
  curada: false,
  curadaPorque: null,
  razones,
});

const piezas: PiezaParaQueSigue[] = [
  { slug: "kickoff", etiqueta: "Kickoff", estado: "generada", stale: false },
  { slug: "diagnosis", etiqueta: "Diagnóstico", estado: "vacia", stale: false },
];

const base = { piezas, sesionesSinRevisar: 0, resumenPendiente: null, proximaReunion: "2026-10-08T16:00:00Z" };

describe("la etapa de Nexus de lo que muestra la ficha", () => {
  it("del pipeline de HubSpot, por el nombre (con o sin tildes)", () => {
    expect(etapaDeNexus(etapa("1410223917", "Diagnóstico"))).toBe("DIAGNOSTICO");
    expect(etapaDeNexus(etapa("1225193551", "Handoff"))).toBe("HAND_OFF");
    expect(etapaDeNexus(etapa("x", "Configuracion tecnica"))).toBe("CONFIGURACION_TECNICA");
  });
  it("del ciclo de 8 etapas, directa; y nada para lo que no reconoce", () => {
    expect(etapaDeNexus(etapa("PLANIFICACION", "Planificación"))).toBe("PLANIFICACION");
    expect(etapaDeNexus(etapa("1225193545", "Bloqueado"))).toBeNull();
    expect(etapaDeNexus(null)).toBeNull();
  });
});

describe("por qué está acá", () => {
  it("las razones del ciclo, con su marca", () => {
    expect(porQueEstaAca(etapa("DIAGNOSTICO", "Diagnóstico", ["Entendimiento cerrado (18 sep)", "Pendiente: presentar el diagnóstico."]))).toEqual([
      { hecho: true, texto: "Entendimiento cerrado (18 sep)" },
      { hecho: false, texto: "Falta presentar el diagnóstico." },
    ]);
  });
  it("sin razones (la etapa la manda HubSpot), el paso de salida de la etapa", () => {
    const [l] = porQueEstaAca(etapa("1410223917", "Diagnóstico"));
    expect(l.hecho).toBe(false);
    expect(l.texto).toMatch(/^Para pasar a Planificación falta presentar y compartir el diagnóstico/);
  });
  it("una etapa sin paso de salida no inventa nada", () => {
    expect(porQueEstaAca(etapa("1225193545", "Bloqueado"))).toEqual([]);
  });
});

describe("qué sigue", () => {
  it("las reuniones sin revisar van primero", () => {
    expect(queSigueDelProyecto({ ...base, etapa: etapa("x", "Diagnóstico"), sesionesSinRevisar: 2 }).accion).toEqual({ tipo: "sesiones" });
  });
  it("después, el documento de la etapa si falta", () => {
    const q = queSigueDelProyecto({ ...base, etapa: etapa("x", "Diagnóstico") });
    expect(q.accion).toEqual({ tipo: "pieza", slug: "diagnosis", etiqueta: "Diagnóstico" });
    expect(q.texto).toContain("genera «Diagnóstico»");
  });
  it("o si quedó desactualizado", () => {
    const q = queSigueDelProyecto({
      ...base,
      etapa: etapa("x", "Diagnóstico"),
      piezas: [{ slug: "diagnosis", etiqueta: "Diagnóstico", estado: "generada", stale: true }],
    });
    expect(q.texto).toContain("quedó desactualizado");
  });
  it("después, el resumen pendiente y la próxima reunión", () => {
    const sinPieza = { ...base, etapa: etapa("x", "Adopción") };
    expect(queSigueDelProyecto({ ...sinPieza, resumenPendiente: { motivo: "Hubo una reunión nueva." } }).accion).toEqual({ tipo: "resumen" });
    expect(queSigueDelProyecto({ ...sinPieza, proximaReunion: null }).accion).toEqual({ tipo: "agendar" });
  });
  it("sin nada pendiente, dice que está al día y no ofrece acción", () => {
    expect(queSigueDelProyecto({ ...base, etapa: etapa("x", "Adopción") })).toEqual({
      texto: "El proyecto está al día: no hay nada esperando tu decisión.",
      accion: null,
    });
  });
});
