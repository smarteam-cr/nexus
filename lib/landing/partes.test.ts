/**
 * lib/landing/partes.test.ts — las piezas de una sección (2026-10-23): el orden y lo quitado, y que el motor las use.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "@/lib/ui/scan-source";
import { isBlank, NO_CONTENIDO } from "@/lib/landing/is-blank";
import {
  CLAVE_DE_LAS_PARTES,
  conParteQuitada,
  leerPartes,
  ordenDeLasPartes,
  partesDe,
  reordenarVisibles,
} from "./partes";

const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");

describe("el orden de las piezas", () => {
  it("sin nada guardado, el de siempre", () => {
    expect(ordenDeLasPartes(["subhead", "intro", "cuerpo"], [])).toEqual(["subhead", "intro", "cuerpo"]);
  });

  it("lo guardado manda; lo que falta va detrás de su anterior de siempre; lo que ya no existe se va", () => {
    expect(ordenDeLasPartes(["subhead", "intro", "cuerpo"], ["cuerpo", "intro"])).toEqual(["subhead", "cuerpo", "intro"]);
    expect(ordenDeLasPartes(["intro", "cuerpo"], ["cuerpo", "viejo", "intro", "cuerpo"])).toEqual(["cuerpo", "intro"]);
  });

  it("arrastrar las visibles deja las ocultas pegadas detrás de la misma pieza que antes", () => {
    // El subtítulo está quitado: se mueve la intro debajo del cuerpo y el subtítulo sigue al principio.
    expect(reordenarVisibles(["subhead", "intro", "cuerpo"], ["cuerpo", "intro"])).toEqual(["subhead", "cuerpo", "intro"]);
    // La intro está quitada y va detrás del subtítulo.
    expect(reordenarVisibles(["subhead", "intro", "cuerpo"], ["cuerpo", "subhead"])).toEqual(["cuerpo", "subhead", "intro"]);
  });
});

describe("lo quitado", () => {
  it("se anota y se devuelve, sin repetirse", () => {
    const e = { orden: [], quitadas: [] };
    const q = conParteQuitada(conParteQuitada(e, "intro", true), "intro", true);
    expect(q.quitadas).toEqual(["intro"]);
    expect(conParteQuitada(q, "intro", false).quitadas).toEqual([]);
  });

  it("leer no confía en la forma (viene de la base y del chat)", () => {
    expect(leerPartes({ [CLAVE_DE_LAS_PARTES]: { orden: ["a", 3, null], quitadas: "x" } })).toEqual({ orden: ["a"], quitadas: [] });
    expect(leerPartes(null)).toEqual({ orden: [], quitadas: [] });
  });

  it("los `set` de forma limpia conservan las piezas", () => {
    const p = { orden: ["cuerpo", "intro"], quitadas: ["subhead"] };
    expect(partesDe({ intro: "x", [CLAVE_DE_LAS_PARTES]: p })).toEqual({ [CLAVE_DE_LAS_PARTES]: p });
    expect(partesDe({ intro: "x" })).toEqual({});
  });
});

describe("las piezas no son contenido", () => {
  it("una sección vacía con las piezas reordenadas sigue vacía (no se publica un hueco con título)", () => {
    expect(NO_CONTENIDO.has(CLAVE_DE_LAS_PARTES)).toBe(true);
    expect(isBlank({ intro: "", items: [], [CLAVE_DE_LAS_PARTES]: { orden: ["cuerpo"], quitadas: ["intro"] } })).toBe(true);
  });
});

describe("el motor las usa (si no, la X y la manija no existen en pantalla)", () => {
  it("la prosa arma subtítulo, intro y cuerpo como piezas, y escribe sobre la data cruda", () => {
    const src = leer("components/canvas/kickoff-sections/KickoffSections.tsx");
    const tramo = src.slice(src.indexOf("export const KickoffProseSection"), src.indexOf("// ── Hero (bienvenida)"));
    expect(tramo).toContain("<PartesDeLaSeccion");
    expect(tramo).toContain('id: "subhead"');
    expect(tramo).toContain('id: "intro"');
    expect(tramo).toContain('alQuitar: { intro: "" }');
    /* ⛔ Escribir `{ ...d, ...next }` (la normalizada) borraba `revisadaAt` y `__partes` al editar una frase. */
    expect(tramo).not.toContain("onChange?.({ ...d, ...next })");
  });

  it("las secciones con intro del diagnóstico, la ejecución y la planificación la llevan como pieza", () => {
    for (const archivo of [
      "components/landing/sections-diagnostico.tsx",
      "components/landing/sections-ejecucion.tsx",
      "components/landing/sections-planificacion.tsx",
    ]) {
      const src = leer(archivo);
      expect(src, archivo).toContain("<ConIntro");
      expect(src, archivo).not.toMatch(/function Intro\(/);
    }
  });

  it("⛔ la prosa de los demás documentos se ve igual que antes: solo el diagnóstico pega el subtítulo al título", () => {
    /* Revisión de la rama (2026-10-23): el ajuste de 14 px y el subtítulo sin margen alcanzaban al kickoff, al desarrollo y a
       la entrega, también en la vista del cliente y en el PDF. Las tarjetas (el diseño de siempre) conservan el contenedor
       de antes; las piezas sueltas son BLOQUE, para que los márgenes colapsen como cuando eran hermanos de la sección. */
    const css = leer("app/landing-engine.css");
    expect(css).toContain(".stl .stl-partes { display: block; }");
    expect(css).toContain(".stl .stl-partes-prosa { display: flex; flex-direction: column; gap: 16px; }");
    expect(css).toContain(".stl .stl-prosa-cuerpo { display: flex; flex-direction: column; gap: 16px; }");
    const ajustes = css.match(/\.stl-partes-prosa[^{]*\{[^}]*(gap: 14px|margin-top: 0)[^}]*\}/g) ?? [];
    expect(ajustes.length).toBeGreaterThan(0);
    for (const a of ajustes) expect(a, a).toContain(":not(.stl-partes-tarjetas)");
  });

  it("la planificación conserva las piezas al escribir su forma limpia", () => {
    const src = leer("components/landing/sections-planificacion.tsx");
    const limpias = src.match(/onChange\?\.\(\{ (?!\.\.\.data)[^}]*\}\)/g) ?? [];
    expect(limpias.filter((l) => !l.includes("partesDe(data)"))).toEqual([]);
  });
});
