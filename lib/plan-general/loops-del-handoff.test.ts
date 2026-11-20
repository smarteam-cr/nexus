import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  bloqueDeLoopsParaElHandoff,
  bloquesDeLoopsQueSeGuardan,
  fasesDeLosLoops,
  leerLoopsDeLaTabla,
  loopsDeLaSalida,
  partirRotulo,
  tablaDeLoops,
  type LoopDeclarado,
} from "./loops-del-handoff";

const marketing: LoopDeclarado[] = [
  { numero: 2, nombre: "Campaign Activation", area: "Marketing", objetivo: "Activar campañas.", prioridad: "Media" },
  { numero: 3, nombre: "Marketing Optimization", area: "Marketing", objetivo: "Mejorar scoring.", prioridad: "Media" },
];

describe("partirRotulo", () => {
  it("separa el número del nombre", () => {
    expect(partirRotulo("02 · Campaign Activation")).toEqual({ numero: 2, nombre: "Campaign Activation" });
    expect(partirRotulo("1. Customer 360° & Connections")).toEqual({ numero: 1, nombre: "Customer 360° & Connections" });
    expect(partirRotulo("Sales Execution")).toEqual({ numero: null, nombre: "Sales Execution" });
  });
  it("un nombre que empieza con cifras no es un número de loop", () => {
    expect(partirRotulo("360 grados")).toEqual({ numero: null, nombre: "360 grados" });
  });
});

describe("la tabla de loops", () => {
  it("se escribe y se lee igual", () => {
    expect(leerLoopsDeLaTabla(tablaDeLoops(marketing))).toEqual(marketing);
  });
  it("ignora filas vacías y datos rotos", () => {
    expect(leerLoopsDeLaTabla({ rows: [["", "x"], "no", ["04 · Lead Management"]] })).toEqual([
      { numero: 4, nombre: "Lead Management", area: "", objetivo: "", prioridad: "" },
    ]);
    expect(leerLoopsDeLaTabla(null)).toEqual([]);
  });
});

describe("loopsDeLaSalida", () => {
  it("lee la tabla de la sección loops de la salida del agente", () => {
    const salida = {
      sections: [
        { key: "alcance_contratado", blocks: [{ type: "text", content: "x" }] },
        { key: "loops", blocks: [{ type: "table", data: tablaDeLoops(marketing) }] },
      ],
    };
    expect(loopsDeLaSalida(salida).map((l) => l.numero)).toEqual([2, 3]);
  });
  it("sin la sección o vacía, ninguno", () => {
    expect(loopsDeLaSalida({ sections: [{ key: "loops", blocks: [] }] })).toEqual([]);
    expect(loopsDeLaSalida({})).toEqual([]);
  });
});

describe("fasesDeLosLoops", () => {
  it("una fase por loop, en paralelo desde la semana 0, con la duración del ciclo", () => {
    const fases = fasesDeLosLoops(marketing, 12);
    expect(fases.map((f) => [f.name, f.loopNumero, f.startWeek, f.durationWeeks])).toEqual([
      ["Campaign Activation", 2, 0, 12],
      ["Marketing Optimization", 3, 0, 12],
    ]);
  });
  it("un loop sin número toma el siguiente libre", () => {
    const fases = fasesDeLosLoops([{ ...marketing[0], numero: 1 }, { ...marketing[1], numero: null }], 12);
    expect(fases.map((f) => f.loopNumero)).toEqual([1, 2]);
  });
});

describe("bloqueDeLoopsParaElHandoff", () => {
  it("pide la tabla y nombra los loops que la cuenta ya tiene", () => {
    const b = bloqueDeLoopsParaElHandoff([{ numero: 1, nombre: "Customer 360°", proyecto: "Integración" }]);
    expect(b).toContain('"loops"');
    expect(b).toContain("01 · Customer 360° (Integración)");
    expect(b).not.toContain("vos");
  });
});

describe("bloquesDeLoopsQueSeGuardan", () => {
  const tabla = { type: "table", data: tablaDeLoops(marketing) };
  const aviso = { type: "text", content: "⚠️ Por validar con cliente: ¿trabajan por loops?" };
  it("⛔ un proyecto que no trabaja por loops no guarda nada de la sección, aunque el modelo la llene", () => {
    expect(bloquesDeLoopsQueSeGuardan([tabla, aviso], false)).toEqual([]);
  });
  it("uno que sí guarda solo las tablas con algún loop", () => {
    expect(bloquesDeLoopsQueSeGuardan([tabla, aviso], true)).toEqual([tabla]);
    expect(bloquesDeLoopsQueSeGuardan([{ type: "table", data: { rows: [] } }], true)).toEqual([]);
  });
  it("⛔ la fila de ejemplo del prompt no es un loop", () => {
    expect(leerLoopsDeLaTabla({ rows: [["02 · Nombre del loop", "Marketing", "x", "Media"]] })).toEqual([]);
    expect(leerLoopsDeLaTabla({ rows: [["<número de dos cifras> · <nombre del loop>", "", "", ""]] })).toEqual([]);
  });
});

describe("fasesDeLosLoops con la cuenta", () => {
  it("un loop sin número no toma uno que ya usa otro proyecto de la cuenta", () => {
    const fases = fasesDeLosLoops([{ ...marketing[0], numero: null }], 12, [1, 2]);
    expect(fases[0].loopNumero).toBe(3);
  });
});

describe("un loop sin número conserva el suyo", () => {
  it("si este proyecto ya tiene un loop con ese nombre, toma su número y no uno libre", () => {
    const propios = new Map([["lead management & conversion", 4]]);
    const fases = fasesDeLosLoops(
      [
        { ...marketing[0], numero: null, nombre: "Nuevo frente" },
        { ...marketing[1], numero: null, nombre: "Lead Management & Conversion" },
      ],
      12,
      [1, 2, 3],
      propios,
    );
    expect(fases.map((f) => f.loopNumero)).toEqual([5, 4]);
  });
});

describe("⛔ las puertas de los loops en el handoff siguen en su lugar (escaneo de las rutas)", () => {
  /* Sin estas tres, el handoff de un proyecto común con una fila de relleno en la tabla de loops perdía sus fases y su
     Semana 0 (revisión del 19 nov). Las reglas puras están probadas arriba; esto vigila que las rutas las sigan usando. */
  const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  const analyze = leer("app/api/clients/[id]/analyze/route.ts");
  it("analyze guarda la sección solo si el proyecto trabaja por loops", () => {
    expect(analyze).toContain("bloquesDeLoopsQueSeGuardan(seccion.blocks ?? [], trabaja.si)");
  });
  it("analyze vuelve fases los loops solo si el proyecto trabaja por loops, y entonces sin Semana 0 ni acomodo", () => {
    expect(analyze).toContain("const loopsDeclarados = trabaja.si ? loopsDeLaCorrida : [];");
    expect(analyze).toMatch(/isHandoff && conSemanaCero && loopsDeclarados\.length === 0/);
    expect(analyze).toMatch(/loopsDeclarados\.length === 0 &&\s*debeAnteponerSemanaCero\(/);
  });
  it("aplicar la propuesta marca los loops del handoff", () => {
    expect(leer("app/api/projects/[projectId]/timeline/borrador/aplicar/route.ts")).toContain("await marcarLoopsDelHandoff(projectId);");
  });
});
