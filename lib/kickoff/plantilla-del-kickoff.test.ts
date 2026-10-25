/**
 * lib/kickoff/plantilla-del-kickoff.test.ts — qué se oculta del kickoff al cambiar de plantilla (M1, 2026-10-25).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { conOcultasPorLaPlantilla, fueraDeLaPlantilla, ocultasPorLaPlantilla, ocultasSegunLaPlantilla } from "./plantilla-del-kickoff";
import { KICKOFF_SECCIONES_DEL_SERVICIO } from "@/lib/canvas/canvas-defs";
import { SECCIONES_SOLO_DEL_SERVICIO } from "@/components/landing/configs/kickoff.defs";

const s = (key: string, claveDelOjo = `id-${key}`) => ({ key, claveDelOjo });

describe("el kickoff de siempre → el del servicio (RC Inmobiliaria)", () => {
  it("lo de afuera con algo se oculta en el editor y queda anotado como de la plantilla", () => {
    const r = ocultasSegunLaPlantilla({
      ocultasDelEditor: [],
      porLaPlantillaAntes: [],
      fueraConAlgo: [s("hoy_vs_sistema"), s("alcance"), s("cronograma", "cronograma")],
      adentro: [s("bienvenida"), s("como_trabajamos")],
    });
    expect(r.ocultas).toEqual(["cronograma", "id-alcance", "id-hoy_vs_sistema"]);
    expect(r.porLaPlantilla).toEqual(r.ocultas);
  });

  it("lo que ocultó una persona queda como estaba y no pasa a ser de la plantilla", () => {
    const r = ocultasSegunLaPlantilla({ ocultasDelEditor: ["id-alcance"], porLaPlantillaAntes: [], fueraConAlgo: [s("alcance")], adentro: [] });
    expect(r.ocultas).toEqual(["id-alcance"]);
    expect(r.porLaPlantilla).toEqual([]);
  });
});

describe("de vuelta a la de siempre", () => {
  it("vuelve lo que ocultó la plantilla; lo que ocultó una persona, no", () => {
    const r = ocultasSegunLaPlantilla({
      ocultasDelEditor: ["id-alcance", "id-metricas_exito", "id-tu_rol"],
      porLaPlantillaAntes: ["id-alcance", "id-metricas_exito"],
      fueraConAlgo: [s("como_trabajamos")],
      adentro: [s("alcance"), s("metricas_exito"), s("tu_rol")],
    });
    expect(r.ocultas).toEqual(["id-como_trabajamos", "id-tu_rol"]);
    expect(r.porLaPlantilla).toEqual(["id-como_trabajamos"]);
  });
});

describe("la entry reservada", () => {
  it("se escribe, se lee y se saca vacía, sin tocar lo demás", () => {
    const antes = [{ key: "bienvenida", label: "x" }, { key: "__ocultas", label: "__ocultas", claves: ["a"] }];
    const con = conOcultasPorLaPlantilla(antes, ["b", "a", "b"]);
    expect(ocultasPorLaPlantilla(con)).toEqual(["a", "b"]);
    expect(con.slice(0, 2)).toEqual(antes);
    expect(conOcultasPorLaPlantilla(con, [])).toEqual(antes);
  });
});

describe("una sola lista de las secciones del servicio, y el runner por el ojo del kickoff", () => {
  it("el canvas y el template nombran las mismas cuatro", () => {
    expect([...SECCIONES_SOLO_DEL_SERVICIO].sort()).toEqual(KICKOFF_SECCIONES_DEL_SERVICIO.map((x) => x.key).sort());
  });
  it("el runner oculta con `__ocultas` (lo que lee el editor y sube al cliente), no con el `hidden` del Json", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "lib/canvas/kickoff-generate.ts"), "utf8");
    expect(src).toContain("ocultasSegunLaPlantilla(");
    expect(src).toContain("conOcultasDelBorrador(");
    expect(src).not.toContain("ajustarALaPlantilla(");
  });
});

describe("lo que se borra al cambiar de plantilla (es lo único que borra algo)", () => {
  const delCanon = new Set(["bienvenida", "alcance", "metricas_exito", "cronograma", "procesos", "como_trabajamos"]);
  const deLaPlantilla = new Set(["bienvenida", "como_trabajamos"]);
  const f = (key: string, bloques: number, ctx = false) => ({ id: `id-${key}`, key, bloques, ctx });

  it("solo las del canon, fuera de la plantilla y vacías; el cronograma y los procesos nunca; una creada por una persona nunca", () => {
    const r = fueraDeLaPlantilla(
      [f("bienvenida", 1), f("alcance", 1), f("metricas_exito", 0), f("cronograma", 0, true), f("procesos", 0, true), f("custom:tabla:1", 0), f("como_trabajamos", 0)],
      deLaPlantilla,
      delCanon,
    );
    expect(r.borrar.map((x) => x.key)).toEqual(["metricas_exito"]);
    expect(r.ocultar.map((x) => x.key)).toEqual(["alcance", "cronograma", "procesos"]);
  });
});

describe("lo que una persona volvió a mostrar no se vuelve a ocultar al regenerar", () => {
  it("la plantilla la había ocultado, Liliana la mostró con el ojo: regenerar la deja visible y deja de ser de la plantilla", () => {
    const r = ocultasSegunLaPlantilla({ ocultasDelEditor: [], porLaPlantillaAntes: ["id-alcance"], fueraConAlgo: [s("alcance")], adentro: [] });
    expect(r.ocultas).toEqual([]);
    expect(r.porLaPlantilla).toEqual([]);
  });
  it("si sigue oculta, sigue siendo de la plantilla (y vuelve al regresar a la de siempre)", () => {
    const r = ocultasSegunLaPlantilla({ ocultasDelEditor: ["id-alcance"], porLaPlantillaAntes: ["id-alcance"], fueraConAlgo: [s("alcance")], adentro: [] });
    expect(r.ocultas).toEqual(["id-alcance"]);
    expect(r.porLaPlantilla).toEqual(["id-alcance"]);
  });
});
