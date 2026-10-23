/**
 * lib/entregables/registro.test.ts — el registro de entregables, CONGELADO (espejo de lib/landing/registry.test.ts).
 *
 * Qué fija:
 *   · los entregables son EXACTAMENTE las piezas con `clase: "entregable"` del registro de piezas, en los dos sentidos
 *     (una pieza marcada entregable sin su entrada acá no se podría generar con plantilla; al revés, se ofrecería algo
 *     que no es un entregable);
 *   · cada plantilla tiene su template, y la de siempre es el template de siempre: generar con ella manda lo mismo;
 *   · el agente de cada entregable es el mismo que ya lo escribe (el de su «Mejorar con IA» y su artifact-gate);
 *   · el set de entregables y plantillas, en orden: cambiarlo es una decisión de producto.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PIECES, piezasDeLaClase, pieceBySlug } from "@/lib/pieces/registry";
import {
  CLAVE_DE_LA_PLANTILLA,
  ENTREGABLES,
  bloqueDeInstruccionesDelPedido,
  conPlantillaAnotada,
  entregableDe,
  entregablePorAgente,
  entradasSegunLaPlantilla,
  plantillaDe,
  seccionesDeLaPlantilla,
  SECCIONES_DEL_DIAGNOSTICO_ESENCIAL,
  plantillaDelDocumento,
} from "./registro";
import { TEMPLATE_DE_LA_PLANTILLA } from "./plantillas";
import { DOC } from "@/lib/canvas/assist-de-documento";
import { KICKOFF_TEMPLATE } from "@/components/landing/configs/kickoff.defs";
import { DIAGNOSTICO_ESENCIAL_TEMPLATE, DIAGNOSTICO_TEMPLATE } from "@/components/landing/configs/diagnostico.defs";
import { DIAGNOSTICO_CANVAS } from "@/lib/canvas/canvas-defs";
import { PLANIFICACION_TEMPLATE } from "@/components/landing/configs/planificacion.defs";
import { DESARROLLO_TEMPLATE } from "@/components/landing/configs/desarrollo.defs";
import { ENTREGA_TEMPLATE } from "@/components/landing/configs/entrega.defs";
import { parseSectionEntries } from "@/lib/business-cases/section-briefs";

describe("el registro de entregables", () => {
  it("son exactamente las piezas con clase «entregable» (decisión 11)", () => {
    expect(ENTREGABLES.map((e) => e.slug).sort()).toEqual(piezasDeLaClase("entregable").map((p) => p.slug).sort());
  });

  it("el set y las plantillas, congelados", () => {
    expect(ENTREGABLES.map((e) => [e.slug, e.plantillas.map((p) => p.id)])).toEqual([
      ["kickoff", ["kickoff"]],
      // 2026-10-23 (Elías): dos plantillas del diagnóstico, la completa (la de siempre) y la esencial.
      ["diagnosis", ["diagnostico-estrategico", "diagnostico-esencial"]],
      ["planning", ["planificacion"]],
      ["tech-requirements", ["integraciones"]],
      ["delivery", ["entrega"]],
    ]);
  });

  it("la de siempre del diagnóstico es «Diagnóstico completo» (id de antes); el documento se sigue llamando Diagnóstico", () => {
    expect(plantillaDe("diagnosis")?.id).toBe("diagnostico-estrategico");
    expect(plantillaDe("diagnosis")?.nombre).toBe("Diagnóstico completo");
    expect(plantillaDe("diagnosis")?.secciones).toBeUndefined();
    expect(pieceBySlug("diagnosis")?.label).toBe("Diagnóstico");
  });

  it("de la esencial a la completa: vuelve lo que ocultó la plantilla, no lo que ocultó una persona", () => {
    const completo = new Set(DIAGNOSTICO_CANVAS.sections.map((s) => s.key));
    const esencial = new Set<string>(SECCIONES_DEL_DIAGNOSTICO_ESENCIAL);
    const json = [
      { key: "fortalezas", label: "Fortalezas" }, // con texto, fuera de la esencial
      { key: "herramientas", label: "Herramientas", hidden: true }, // la ocultó una persona antes
      { key: "desafio", label: "Desafío principal" },
    ];
    // A la esencial: «fortalezas» se oculta CON la marca; «herramientas» ya estaba oculta y queda como estaba.
    const aEsencial = entradasSegunLaPlantilla(json, { deLaPlantilla: esencial, conTextoFuera: ["fortalezas", "herramientas"] });
    expect(aEsencial.cambio).toBe(true);
    expect(aEsencial.entradas.find((e) => e.key === "fortalezas")).toMatchObject({ hidden: true, ocultaPorLaPlantilla: true });
    expect(aEsencial.entradas.find((e) => e.key === "herramientas")?.ocultaPorLaPlantilla).toBeUndefined();
    // De vuelta a la completa: vuelve «fortalezas», «herramientas» sigue oculta.
    const aCompleto = entradasSegunLaPlantilla(aEsencial.entradas, { deLaPlantilla: completo, conTextoFuera: [] });
    expect(aCompleto.entradas.find((e) => e.key === "fortalezas")).toMatchObject({ hidden: false, ocultaPorLaPlantilla: false });
    expect(aCompleto.entradas.find((e) => e.key === "herramientas")?.hidden).toBe(true);
    // Sin nada que hacer, no cambia (el runner no escribe).
    expect(entradasSegunLaPlantilla(aCompleto.entradas, { deLaPlantilla: completo, conTextoFuera: [] }).cambio).toBe(false);
  });

  it("la esencial es la recomendada y tiene solo sus secciones, en el orden del canvas", () => {
    const esencial = plantillaDe("diagnosis", "diagnostico-esencial")!;
    expect(esencial.recomendada).toBe(true);
    expect(seccionesDeLaPlantilla(esencial, DIAGNOSTICO_CANVAS.sections).map((s) => s.key)).toEqual([
      "diagnostico", "objetivos", "problema", "desafio", "politica_rectora", "acciones", "cierre",
    ]);
    // Cada sección de la plantilla existe en el canvas: una key mal escrita desaparecería sin aviso.
    const canon = new Set(DIAGNOSTICO_CANVAS.sections.map((s) => s.key));
    expect(SECCIONES_DEL_DIAGNOSTICO_ESENCIAL.filter((k) => !canon.has(k))).toEqual([]);
    // Su template genera exactamente esas secciones (el agente no escribe las demás).
    expect(DIAGNOSTICO_ESENCIAL_TEMPLATE.sections.map((d) => d.key)).toEqual([...SECCIONES_DEL_DIAGNOSTICO_ESENCIAL]);
    // Sin `secciones`, la plantilla tiene el canvas entero.
    expect(seccionesDeLaPlantilla(plantillaDe("diagnosis")!, DIAGNOSTICO_CANVAS.sections)).toHaveLength(DIAGNOSTICO_CANVAS.sections.length);
    // Una sola recomendada por entregable.
    for (const e of ENTREGABLES) expect(e.plantillas.filter((p) => p.recomendada).length, e.slug).toBeLessThanOrEqual(1);
  });

  it("todo entregable lo ve el cliente y vive en un canvas de proyecto", () => {
    for (const e of ENTREGABLES) {
      const p = pieceBySlug(e.slug)!;
      expect(p.clientFacing, e.slug).toBe(true);
      expect(p.hasCanvas, e.slug).toBe(true);
      expect(p.scope, e.slug).toBe("project");
    }
  });

  it("toda pieza de proyecto tiene clase; la de un cliente o una propuesta, no", () => {
    for (const p of PIECES) {
      if (p.scope === "project") expect(p.clase, p.slug).not.toBeNull();
      else expect(p.clase, p.slug).toBeNull();
    }
  });

  it("el agente de cada entregable es el que ya lo escribe", () => {
    for (const e of ENTREGABLES) {
      expect(DOC[e.slug]?.agentId, e.slug).toBe(e.agentId);
      expect(entregablePorAgente(e.agentId)?.slug).toBe(e.slug);
    }
    expect(entregablePorAgente("agent-exploracion-canvas")).toBeNull();
    expect(entregableDe("timeline")).toBeNull();
  });

  it("cada plantilla tiene su template, y la de siempre es el template de siempre", () => {
    const ids = ENTREGABLES.flatMap((e) => e.plantillas.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length); // ids únicos entre todos los entregables
    expect(Object.keys(TEMPLATE_DE_LA_PLANTILLA).sort()).toEqual([...ids].sort());
    expect(TEMPLATE_DE_LA_PLANTILLA[plantillaDe("kickoff")!.id]).toBe(KICKOFF_TEMPLATE);
    expect(TEMPLATE_DE_LA_PLANTILLA[plantillaDe("diagnosis")!.id]).toBe(DIAGNOSTICO_TEMPLATE);
    expect(TEMPLATE_DE_LA_PLANTILLA[plantillaDe("planning")!.id]).toBe(PLANIFICACION_TEMPLATE);
    expect(TEMPLATE_DE_LA_PLANTILLA[plantillaDe("tech-requirements")!.id]).toBe(DESARROLLO_TEMPLATE);
    expect(TEMPLATE_DE_LA_PLANTILLA[plantillaDe("delivery")!.id]).toBe(ENTREGA_TEMPLATE);
  });

  it("una plantilla de otro entregable no se acepta: no cae a otra en silencio", () => {
    expect(plantillaDe("diagnosis", "kickoff")).toBeNull();
    expect(plantillaDe("diagnosis", "no-existe")).toBeNull();
    expect(plantillaDe("timeline")).toBeNull();
  });
});

describe("la plantilla guardada en el documento", () => {
  it("un documento de antes (sin la entry) se lee con la plantilla de siempre", () => {
    const r = plantillaDelDocumento("diagnosis", [{ key: "hero", label: "Portada" }]);
    expect(r).toMatchObject({ guardada: false, plantilla: { id: "diagnostico-estrategico" } });
  });

  it("anotar toca solo la entry reservada, y la entry no es una sección", () => {
    const antes = [
      { key: "hero", label: "Portada" },
      { key: "__doc", label: "__doc", brief: "sin jerga" },
      { key: CLAVE_DE_LA_PLANTILLA, label: CLAVE_DE_LA_PLANTILLA, plantilla: "vieja" },
    ];
    const despues = conPlantillaAnotada(antes, plantillaDe("diagnosis")!, "ana@smarteamcr.com", "2026-10-17T10:00:00.000Z");
    expect(despues.slice(0, 2)).toEqual(antes.slice(0, 2));
    expect(despues.filter((x) => x.key === CLAVE_DE_LA_PLANTILLA)).toHaveLength(1);
    expect(plantillaDelDocumento("diagnosis", despues)).toEqual({
      plantilla: plantillaDe("diagnosis"),
      guardada: true,
      at: "2026-10-17T10:00:00.000Z",
      por: "ana@smarteamcr.com",
    });
    // Empieza con doble guion bajo: el contrato de «no soy una sección» (PanelDelDocumento y /analyze la saltan).
    expect(parseSectionEntries(despues).some((x) => x.key === CLAVE_DE_LA_PLANTILLA && x.key.startsWith("__"))).toBe(true);
  });

  it("una plantilla guardada que ya no existe cae a la de siempre", () => {
    const r = plantillaDelDocumento("planning", [{ key: CLAVE_DE_LA_PLANTILLA, label: CLAVE_DE_LA_PLANTILLA, plantilla: "retirada" }]);
    expect(r).toMatchObject({ guardada: false, plantilla: { id: "planificacion" } });
  });
});

describe("las instrucciones del pedido", () => {
  it("sin instrucciones no suman nada: el mensaje del agente queda como antes", () => {
    expect(bloqueDeInstruccionesDelPedido(null)).toBe("");
    expect(bloqueDeInstruccionesDelPedido("   ")).toBe("");
  });

  it("con instrucciones van rotuladas y con tope", () => {
    const b = bloqueDeInstruccionesDelPedido("Enfócate en el pipeline de ventas");
    expect(b.startsWith("=== LO QUE PIDIÓ QUIEN GENERA ESTE DOCUMENTO")).toBe(true);
    expect(b).toContain("Enfócate en el pipeline de ventas");
    expect(b.endsWith("\n\n")).toBe(true);
    expect(bloqueDeInstruccionesDelPedido("x".repeat(5000)).length).toBeLessThan(2300);
  });
});

describe("⛔ una sola función genera los entregables", () => {
  const leer = (rel: string) => readFileSync(join(__dirname, "..", "..", rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("/analyze los genera con generarEntregable y ya no llama a sus runners por su cuenta", () => {
    const ruta = leer("app/api/clients/[id]/analyze/route.ts");
    expect(ruta).toContain("generarEntregable(");
    expect(ruta).toContain("entregablePorAgente(agent.id)");
    for (const r of ["runKickoffGeneration(", "runDiagnosticoGeneration(", "runPlanificacionGeneration(", "runEntregaGeneration("]) expect(ruta).not.toContain(r);
    // La única llamada directa que queda es el encadenado del handoff (el requerimiento técnico que dispara un tag).
    expect(ruta.match(/runDesarrolloGeneration\(/g)?.length ?? 0).toBe(1);
    // El kickoff ya no se arma en la ruta: su mensaje vive en su runner.
    expect(ruta).not.toContain("materialDelKickoff");
  });

  it("el chat lanza la MISMA generación, con la misma celda del artifact-gate y aparte (como el botón)", () => {
    const lanzar = leer("lib/entregables/lanzar-server.ts");
    expect(lanzar).toContain("generarEntregable(");
    expect(lanzar).toContain("resolveArtifactGate(");
    expect(lanzar).toContain("canCell(");
    expect(lanzar).toContain("conContextoDeIA(");
    expect(lanzar).toMatch(/status: "RUNNING"/);
    const op = leer("lib/operaciones/documentos-server.ts");
    expect(op).toContain('clase: "propone"');
    expect(op).toContain("lanzarEntregable(");
    expect(op).not.toContain("generarEntregable(");
  });
});
