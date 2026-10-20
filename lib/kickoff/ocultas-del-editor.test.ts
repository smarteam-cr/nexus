/**
 * lib/kickoff/ocultas-del-editor.test.ts — una sección oculta en el kickoff sigue oculta aunque no se
 * haya subido al cliente (2026-10-20: Valentina ocultaba, no subía, y al día siguiente volvía a verse).
 *
 * Correr: `npx vitest run lib/kickoff/ocultas-del-editor.test.ts --project unit`.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CLAVE_OCULTAS_DEL_EDITOR,
  conOcultasDelBorrador,
  mismasOcultas,
  ocultasDelBorrador,
  ocultasEnElEditor,
} from "./ocultas-del-editor";
import { hiddenKeysFrom, parseSectionEntries } from "@/lib/business-cases/section-briefs";

const leer = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

// Las secciones del kickoff de Cayalá (Json `ProjectCanvas.sections`, resumido) con las otras dos
// entries reservadas que ya conviven ahí.
const SECCIONES = [
  { key: "bienvenida", label: "Bienvenida y contexto" },
  { key: "objetivos", label: "Objetivos del proyecto" },
  { key: "__doc", label: "__doc", brief: "no menciones Treble" },
  { key: "__cuestionarios", label: "__cuestionarios", descartadaAt: "2026-10-15T00:00:00.000Z" },
];

describe("el oculto vive en el canvas", () => {
  it("guardar el borrador agrega SOLO la entry `__ocultas` y lo demás queda igual", () => {
    const con = conOcultasDelBorrador(SECCIONES, ["cmv8997rp016o07qhlv9jmb31", "procesos"], "vsandoval@smarteamcr.com", "2026-10-20T20:00:00.000Z");
    expect(con.slice(0, SECCIONES.length)).toEqual(SECCIONES);
    expect(ocultasDelBorrador(con)?.sort()).toEqual(["cmv8997rp016o07qhlv9jmb31", "procesos"]);
  });

  it("al recargar, el editor arranca del borrador y no de lo publicado (el bug)", () => {
    const publicadas = ["cmv8997rp016o07qhlv9jmb31"];
    const canvas = conOcultasDelBorrador(SECCIONES, [...publicadas, "cmv8997rp016j07qhe4aytoci"], null, "2026-10-20T20:00:00.000Z");
    expect(ocultasEnElEditor(publicadas, ocultasDelBorrador(canvas)).sort()).toEqual(
      ["cmv8997rp016j07qhe4aytoci", "cmv8997rp016o07qhlv9jmb31"],
    );
    // Sin borrador, lo publicado.
    expect(ocultasEnElEditor(publicadas, ocultasDelBorrador(SECCIONES))).toEqual(publicadas);
  });

  it("«Subir» borra el borrador (null) y vuelve a coincidir con lo publicado", () => {
    const con = conOcultasDelBorrador(SECCIONES, ["procesos"], null, "x");
    const sin = conOcultasDelBorrador(con, null, null, "y");
    expect(sin).toEqual(SECCIONES);
    expect(ocultasDelBorrador(sin)).toBeNull();
  });

  it("la entry reservada no se lee como una sección oculta ni rompe el parseo de secciones", () => {
    const con = conOcultasDelBorrador(SECCIONES, ["procesos"], null, "x");
    expect(hiddenKeysFrom(con).size).toBe(0);
    expect(parseSectionEntries(con).find((e) => e.key === CLAVE_OCULTAS_DEL_EDITOR)?.label).toBe(CLAVE_OCULTAS_DEL_EDITOR);
  });

  it("comparar sets no mira el orden", () => {
    expect(mismasOcultas(["a", "b"], ["b", "a"])).toBe(true);
    expect(mismasOcultas(["a"], ["a", "b"])).toBe(false);
  });
});

describe("la cadena del editor guarda en cada clic y el cliente solo cambia al «Subir»", () => {
  it("el ojo del editor guarda el borrador al instante", () => {
    const src = leer("components/canvas/useKickoffData.ts");
    const i = src.indexOf("const toggleHidden");
    const tramo = src.slice(i, src.indexOf("const visibilityDirty", i));
    expect(tramo).toContain("JSON.stringify({ borrador })");
    expect(tramo).toContain("/kickoff-visibility");
  });

  it("al cargar, el editor parte de `ocultasEnElEditor(publicadas, borrador)`", () => {
    expect(leer("components/canvas/useKickoffData.ts")).toContain("ocultasEnElEditor(publicadas, borrador)");
  });

  it("la ruta: el borrador va al Json del canvas; lo publicado (lo que lee el cliente) solo con `hiddenKeys`", () => {
    const src = leer("app/api/projects/[projectId]/kickoff-visibility/route.ts");
    const i = src.indexOf('if ("borrador" in parsed.data)');
    const ramaBorrador = src.slice(i, src.indexOf("// «Subir»", i));
    expect(ramaBorrador).toContain("conOcultasDelBorrador(");
    expect(ramaBorrador, "guardar el borrador no puede tocar lo que ve el cliente").not.toContain("hiddenKickoffKeys:");
  });

  it("el PDF lee lo que el editor tiene oculto (borrador o publicado)", () => {
    expect(leer("lib/print/load-doc.ts")).toContain("ocultasEnElEditor(proyecto.hiddenKickoffKeys ?? [], ocultasDelBorrador(canvas?.sections))");
  });

  it("la vista del cliente sigue leyendo SOLO lo publicado", () => {
    const src = leer("lib/external/kickoff-view.ts");
    expect(src).toContain("new Set(proj?.hiddenKickoffKeys ?? [])");
    expect(src).not.toContain("ocultasDelBorrador");
  });
});
