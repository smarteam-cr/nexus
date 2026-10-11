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
  it("⭐ etapa 6: las novedades del documento de la etapa van después del desactualizado y antes del resumen", () => {
    const conNovedades = (stale: boolean): PiezaParaQueSigue[] => [{ slug: "diagnosis", etiqueta: "Diagnóstico", estado: "generada", stale, novedades: 3 }];
    // Desactualizado gana: primero hay que regenerarlo.
    expect(queSigueDelProyecto({ ...base, etapa: etapa("x", "Diagnóstico"), piezas: conNovedades(true) }).texto).toContain("quedó desactualizado");
    // Al día, con novedades: van antes que el resumen pendiente.
    const q = queSigueDelProyecto({ ...base, etapa: etapa("x", "Diagnóstico"), piezas: conNovedades(false), resumenPendiente: { motivo: null } });
    expect(q.accion).toEqual({ tipo: "novedades", slug: "diagnosis", etiqueta: "Diagnóstico", n: 3 });
    expect(q.texto).toBe("«Diagnóstico» tiene 3 novedades de reuniones recientes: revísalas antes de mostrar el documento.");
    // Sin novedades, el orden de siempre: el resumen.
    const sin: PiezaParaQueSigue[] = [{ slug: "diagnosis", etiqueta: "Diagnóstico", estado: "generada", stale: false, novedades: 0 }];
    expect(queSigueDelProyecto({ ...base, etapa: etapa("x", "Diagnóstico"), piezas: sin, resumenPendiente: { motivo: null } }).accion).toEqual({ tipo: "resumen" });
    // Las de otra pieza (no la de la etapa) no entran al «Qué sigue»: se ven en el riel.
    const otra: PiezaParaQueSigue[] = [...sin, { slug: "kickoff", etiqueta: "Kickoff", estado: "generada", stale: false, novedades: 2 }];
    expect(queSigueDelProyecto({ ...base, etapa: etapa("x", "Diagnóstico"), piezas: otra }).accion).toBeNull();
  });
  it("después, el resumen pendiente y la próxima reunión", () => {
    const sinPieza = { ...base, etapa: etapa("x", "Adopción") };
    expect(queSigueDelProyecto({ ...sinPieza, resumenPendiente: { motivo: "Hubo una reunión nueva." } }).accion).toEqual({ tipo: "resumen" });
    expect(queSigueDelProyecto({ ...sinPieza, proximaReunion: null }).accion).toEqual({ tipo: "agendar" });
  });
  describe("⭐ los cuestionarios (2026-10-11): recomendados, nunca bloquean", () => {
    const conCuestionarios: PiezaParaQueSigue[] = [
      ...piezas,
      { slug: "questionnaires", etiqueta: "Cuestionarios", estado: "vacia", stale: false },
    ];
    const accion = { tipo: "cuestionarios", slug: "questionnaires", etiqueta: "Cuestionarios" };
    const conDatos = { ...base, piezas: conCuestionarios, cuestionarios: { publicados: 0, descartada: false } };

    it("con el kickoff generado y ninguno publicado, los sugiere en el arranque y en la exploración", () => {
      const q = queSigueDelProyecto({ ...conDatos, etapa: etapa("x", "Handoff") });
      expect(q.accion).toEqual(accion);
      expect(q.texto).toContain("Manda los cuestionarios al cliente");
      expect(q.texto).toContain("no frena nada");
      // En la exploración van ANTES del documento de la etapa: se mandan después del kickoff.
      expect(queSigueDelProyecto({ ...conDatos, etapa: etapa("x", "Exploración") }).accion).toEqual(accion);
    });
    it("en las demás etapas (y sin etapa reconocida) no salen: un proyecto avanzado sigue con lo suyo", () => {
      expect(queSigueDelProyecto({ ...conDatos, etapa: etapa("x", "Diagnóstico") }).accion).toEqual({
        tipo: "pieza",
        slug: "diagnosis",
        etiqueta: "Diagnóstico",
      });
      const diagnosticoListo = conCuestionarios.map((p) => (p.slug === "diagnosis" ? { ...p, estado: "generada" as const } : p));
      expect(queSigueDelProyecto({ ...conDatos, piezas: diagnosticoListo, etapa: etapa("x", "Diagnóstico") }).accion).toBeNull();
      for (const e of [etapa("x", "Adopción"), etapa("x", "Implementación"), etapa("x", "Continuidad"), etapa("x", "Bloqueado"), null]) {
        expect(queSigueDelProyecto({ ...conDatos, etapa: e }).accion).toBeNull();
        expect(queSigueDelProyecto({ ...conDatos, etapa: e, resumenPendiente: { motivo: null } }).accion).toEqual({ tipo: "resumen" });
        expect(queSigueDelProyecto({ ...conDatos, etapa: e, proximaReunion: null }).accion).toEqual({ tipo: "agendar" });
      }
    });
    it("el kickoff desactualizado o con novedades gana, y mientras tanto no se sugieren (el prellenado lo lee)", () => {
      const kickoffViejo = conCuestionarios.map((p) => (p.slug === "kickoff" ? { ...p, stale: true } : p));
      const enHandoff = queSigueDelProyecto({ ...conDatos, piezas: kickoffViejo, etapa: etapa("x", "Handoff") });
      expect(enHandoff.texto).toContain("quedó desactualizado");
      expect(enHandoff.accion).toEqual({ tipo: "pieza", slug: "kickoff", etiqueta: "Kickoff" });
      const kickoffConNovedades = conCuestionarios.map((p) => (p.slug === "kickoff" ? { ...p, novedades: 2 } : p));
      expect(queSigueDelProyecto({ ...conDatos, piezas: kickoffConNovedades, etapa: etapa("x", "Handoff") }).accion).toEqual({
        tipo: "novedades",
        slug: "kickoff",
        etiqueta: "Kickoff",
        n: 2,
      });
      expect(queSigueDelProyecto({ ...conDatos, piezas: kickoffViejo, etapa: etapa("x", "Exploración") }).accion).not.toEqual(accion);
    });
    it("en la exploración, el documento ya escrito y desactualizado gana; sin escribir, van antes de generarlo", () => {
      const exploracionVieja = [...conCuestionarios, { slug: "exploration", etiqueta: "Exploración", estado: "generada" as const, stale: true }];
      expect(queSigueDelProyecto({ ...conDatos, piezas: exploracionVieja, etapa: etapa("x", "Exploración") }).texto).toContain("quedó desactualizado");
      const exploracionVacia = [...conCuestionarios, { slug: "exploration", etiqueta: "Exploración", estado: "vacia" as const, stale: false }];
      expect(queSigueDelProyecto({ ...conDatos, piezas: exploracionVacia, etapa: etapa("x", "Exploración") }).accion).toEqual(accion);
    });

    it("se van al publicar uno, con «Ahora no», sin kickoff o sin la pieza a la vista", () => {
      const e = etapa("x", "Handoff");
      expect(queSigueDelProyecto({ ...conDatos, etapa: e, cuestionarios: { publicados: 1, descartada: false } }).accion).not.toEqual(accion);
      expect(queSigueDelProyecto({ ...conDatos, etapa: e, cuestionarios: { publicados: 0, descartada: true } }).accion).not.toEqual(accion);
      expect(queSigueDelProyecto({ ...conDatos, etapa: e, cuestionarios: null }).accion).not.toEqual(accion);
      const sinKickoff = conCuestionarios.map((p) => (p.slug === "kickoff" ? { ...p, estado: "vacia" as const } : p));
      expect(queSigueDelProyecto({ ...conDatos, etapa: e, piezas: sinKickoff }).accion).not.toEqual(accion);
      expect(queSigueDelProyecto({ ...conDatos, etapa: e, piezas }).accion).not.toEqual(accion);
    });
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
  it("el panel usa esta cuenta y la consulta de Tareas manda el número de recientes", () => {
    /* Desde la etapa 2 de la memoria de la cuenta los pendientes son tareas: los manda /api/tareas/del-proyecto
       (`cargarTareasDelProyecto`), no el GPS. */
    const raiz = process.cwd();
    const panel = fs.readFileSync(path.join(raiz, "components/clients/ProjectGPS.tsx"), "utf8");
    expect(panel).toContain("restoDeLosPendientes(");
    expect(panel, "volvió «abiertos − mostrados = más antiguos»").not.toMatch(/abiertosTotal\s*-\s*recientes\.length/);
    expect(panel).toContain("/api/tareas/del-proyecto/");
    const consulta = fs.readFileSync(path.join(raiz, "lib/tareas/consultas.ts"), "utf8");
    expect(consulta).toMatch(/recientesTotal,/);
  });
});
