/**
 * lib/pieces/estado-de-cuestionarios.test.ts — la fila de los Cuestionarios en el riel (2026-10-11).
 *
 * Correr: `npx vitest run lib/pieces/estado-de-cuestionarios.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPieceRows } from "@/lib/flow/dropdown-rows";
import { vistaDeLaUrl } from "@/lib/flow/vista-de-la-url";
import {
  CLAVE_DESCARTE_CUESTIONARIOS,
  PIEZA_CUESTIONARIOS,
  conSugerenciaDescartada,
  estadoDeCuestionarios,
  sugerenciaDescartadaEn,
  type CuestionarioParaElRiel,
} from "./estado-de-cuestionarios";
import { pieceBySlug } from "./registry";
import { resolvePieceStates } from "./piece-state";

const borrador: CuestionarioParaElRiel = { publicadoAt: null, cerradoAt: null, pestanas: [{ enviadaAt: null }] };
const publicado: CuestionarioParaElRiel = { publicadoAt: "2026-10-10T12:00:00Z", cerradoAt: null, pestanas: [{ enviadaAt: null }, { enviadaAt: null }] };
const enviadoEntero: CuestionarioParaElRiel = {
  publicadoAt: "2026-10-10T12:00:00Z",
  cerradoAt: null,
  pestanas: [{ enviadaAt: "2026-10-11T12:00:00Z" }, { enviadaAt: "2026-10-11T13:00:00Z" }],
};
const enviadoAMedias: CuestionarioParaElRiel = { ...enviadoEntero, pestanas: [{ enviadaAt: "2026-10-11T12:00:00Z" }, { enviadaAt: null }] };
const cerrado: CuestionarioParaElRiel = { ...publicado, cerradoAt: "2026-10-11T15:00:00Z" };

describe("el estado de la fila: siempre escrito", () => {
  it("sin ninguno, o solo borradores: «sin enviar»", () => {
    expect(estadoDeCuestionarios([])).toMatchObject({ corto: "sin enviar", enviado: false, publicados: 0, total: 0 });
    const e = estadoDeCuestionarios([borrador, borrador]);
    expect(e).toMatchObject({ corto: "sin enviar", enviado: false, total: 2 });
    expect(e.largo).toContain("ninguno publicado");
  });
  it("publicados y nadie respondió: «enviado»", () => {
    expect(estadoDeCuestionarios([publicado, borrador])).toMatchObject({ corto: "enviado", enviado: true, publicados: 1 });
  });
  it("respondido = cerrado o con TODAS sus pestañas enviadas; M son los publicados", () => {
    expect(estadoDeCuestionarios([enviadoEntero, enviadoAMedias, borrador]).corto).toBe("respondido 1 de 2");
    expect(estadoDeCuestionarios([enviadoEntero, cerrado]).corto).toBe("respondido 2 de 2");
    // Uno sin pestañas no cuenta como respondido por estar vacío.
    expect(estadoDeCuestionarios([{ ...publicado, pestanas: [] }]).corto).toBe("enviado");
  });
});

describe("el «Ahora no» vive en el canvas del Kickoff, sin tocar lo demás", () => {
  const seccionesDelKickoff = [
    { key: "hero", label: "Portada" },
    { key: "__doc", label: "__doc", brief: "No menciones el módulo X" },
  ];

  it("se pone y se saca tocando SOLO su entry", () => {
    const con = conSugerenciaDescartada(seccionesDelKickoff, true, "cse@smarteamcr.com", "2026-10-11T12:00:00.000Z");
    expect(con).toHaveLength(3);
    expect(con.slice(0, 2)).toEqual(seccionesDelKickoff);
    expect(con[2]).toMatchObject({ key: CLAVE_DESCARTE_CUESTIONARIOS, descartadaPor: "cse@smarteamcr.com" });
    expect(sugerenciaDescartadaEn(con)).toBe(true);
    expect(estadoDeCuestionarios([], sugerenciaDescartadaEn(con)).sugerenciaDescartada).toBe(true);

    const sin = conSugerenciaDescartada(con, false, null, "2026-10-12T12:00:00.000Z");
    expect(sin).toEqual(seccionesDelKickoff);
    expect(sugerenciaDescartadaEn(sin)).toBe(false);
  });
  it("la clave es reservada: empieza con doble guion bajo, como `__doc`", () => {
    expect(CLAVE_DESCARTE_CUESTIONARIOS.startsWith("__")).toBe(true);
  });
  it("tolera basura", () => {
    expect(sugerenciaDescartadaEn(null)).toBe(false);
    expect(sugerenciaDescartadaEn([{ key: CLAVE_DESCARTE_CUESTIONARIOS }])).toBe(false);
    expect(conSugerenciaDescartada("x", true, null, "2026-10-11T12:00:00.000Z")).toHaveLength(1);
  });
});

describe("una pieza sin canvas", () => {
  it("el registro la declara así, entre el kickoff y la exploración", () => {
    const p = pieceBySlug(PIEZA_CUESTIONARIOS)!;
    expect(p.label).toBe("Cuestionarios");
    expect(p.hasCanvas).toBe(false);
    expect(p.agentGroup).toBeNull();
    expect(p.optional).toBe(true);
  });
  it("no se ofrece para encender ni apagar", () => {
    const slugs = resolvePieceStates({ tags: [], canvases: [] }).map((s) => s.slug);
    expect(slugs).not.toContain(PIEZA_CUESTIONARIOS);
  });
  it("el riel la lista solo con su estado; sin él (el widget) no aparece", () => {
    expect(buildPieceRows([]).map((r) => r.slug)).not.toContain(PIEZA_CUESTIONARIOS);
    const rows = buildPieceRows([], { sinCanvas: { [PIEZA_CUESTIONARIOS]: "vacia" } });
    const slugs = rows.map((r) => r.slug);
    expect(slugs.indexOf(PIEZA_CUESTIONARIOS)).toBe(slugs.indexOf("kickoff") + 1);
    expect(slugs.indexOf(PIEZA_CUESTIONARIOS)).toBe(slugs.indexOf("exploration") - 1);
    const fila = rows.find((r) => r.slug === PIEZA_CUESTIONARIOS)!;
    expect(fila).toMatchObject({ state: "vacia", canvasId: null, agent: null });
    expect(buildPieceRows([], { sinCanvas: { [PIEZA_CUESTIONARIOS]: "generada" } }).find((r) => r.slug === PIEZA_CUESTIONARIOS)?.state).toBe(
      "generada",
    );
  });
  it("la URL la abre por su slug, sin esperar a la lista de canvases", () => {
    expect(vistaDeLaUrl([], PIEZA_CUESTIONARIOS, false)).toEqual({ tipo: "pieza", slug: PIEZA_CUESTIONARIOS });
    expect(vistaDeLaUrl([], "kickoff", false)).toEqual({ tipo: "esperar" });
  });
});

describe("⛔ los cuestionarios ya no cuelgan de la Exploración", () => {
  /* La edición que la pone en rojo: volver a montar CuestionarioPanel dentro de la exploración, o sumar
     otra vez «Cuestionarios» a las filas de debajo de sus sesiones. «Informe anterior» sí se queda. */
  const leer = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
  it("la ficha la monta una vez, como su propia pieza", () => {
    const panel = leer("components/clients/ProjectCanvasPanel.tsx");
    expect((panel.match(/<CuestionarioPanel /g) ?? []).length).toBe(1);
    expect(panel).toContain('activeSlug === "questionnaires"');
  });
  it("la exploración del proyecto no la lista ni la monta", () => {
    expect(leer("components/exploraciones/ExploracionDelProyecto.tsx")).not.toContain("<CuestionarioPanel");
    const lienzo = leer("components/exploraciones/LienzoDeExploracion.tsx");
    expect(lienzo).not.toContain('clave: "cuestionarios"');
    expect(lienzo).toContain('clave: "informe"');
  });
});
