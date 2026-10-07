import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { etapaDeNexus, porQueEstaAca, queSigueDelProyecto, restoDeLosPendientes, type PiezaParaQueSigue } from "./que-sigue-del-proyecto";
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
  it("la etapa que sugiere una reunión va después de las reuniones sin revisar y antes del documento", () => {
    const conSugerencia = { ...base, etapa: etapa("x", "Diagnóstico"), etapaSugerida: { hasta: "Planificación" } };
    expect(queSigueDelProyecto({ ...conSugerencia, sesionesSinRevisar: 1 }).accion).toEqual({ tipo: "sesiones" });
    const q = queSigueDelProyecto(conSugerencia);
    expect(q.accion).toEqual({ tipo: "etapa" });
    expect(q.texto).toContain("ya pasó a Planificación");
    expect(q.texto).toContain("se escribe en HubSpot");
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

describe("⭐ «Pendientes recientes»: lo que no se muestra se cuenta bien", () => {
  it("los recientes que no entraron en los 5 no se cuentan como antiguos", () => {
    // 8 de las últimas 4 semanas (se ven 5) y 20 abiertos: faltan 3 recientes y 12 anteriores.
    expect(restoDeLosPendientes({ mostrados: 5, recientes: 8, abiertos: 20 })).toEqual({
      recientes: 3,
      antiguos: 12,
      texto: "y 15 más: 3 de las últimas 4 semanas y 12 más antiguos",
    });
  });
  it("solo antiguos, o solo recientes, se dice cada uno con su nombre", () => {
    expect(restoDeLosPendientes({ mostrados: 2, recientes: 2, abiertos: 3 }).texto).toBe("y 1 más antiguo");
    expect(restoDeLosPendientes({ mostrados: 5, recientes: 7, abiertos: 7 }).texto).toBe("y 2 más de las últimas 4 semanas");
    expect(restoDeLosPendientes({ mostrados: 3, recientes: 3, abiertos: 3 }).texto).toBeNull();
  });
  it("sin el número de recientes (respuesta vieja) no inventa de cuándo son", () => {
    expect(restoDeLosPendientes({ mostrados: 5, recientes: null, abiertos: 9 }).texto).toBe("y 4 más");
  });
  it("el panel usa esta cuenta y la ruta manda el número de recientes", () => {
    const raiz = process.cwd();
    const panel = fs.readFileSync(path.join(raiz, "components/clients/ProjectGPS.tsx"), "utf8");
    expect(panel).toContain("restoDeLosPendientes(");
    expect(panel, "volvió «abiertos − mostrados = más antiguos»").not.toMatch(/abiertosTotal\s*-\s*recientes\.length/);
    const ruta = fs.readFileSync(path.join(raiz, "app/api/projects/[projectId]/gps/route.ts"), "utf8");
    expect(ruta).toMatch(/pendientesRecientesTotal,/);
  });
});
