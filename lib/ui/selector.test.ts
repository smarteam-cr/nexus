/**
 * lib/ui/selector.test.ts — EL SELECT DE NEXUS: buscador, grupos, marcas, y que el nativo solo encoja.
 *
 * Correr: `npx vitest run lib/ui/selector.test.ts --project unit`.
 *
 * Pedido de Elías (2026-11-08): «un select sencillo con buscador», igual en todo Nexus. Nació porque «Agregar una
 * actividad de la biblioteca…» (Casos de uso de la preventa) era un `<select>` nativo de unas cuarenta opciones en
 * seis etapas: no se podía buscar y abría una lista del alto de la pantalla. La pieza es `Selector`
 * (components/ui), con el mismo panel que `CeldaSelect` (`PanelDeOpciones`).
 *
 * Tres partes:
 *   1. La lógica pura del panel (`lib/ui/opciones.ts`): qué se ve al buscar y en qué grupos.
 *   2. Una sola implementación: `Selector` y `CeldaSelect` usan el MISMO panel y la misma mecánica.
 *   3. Ratchet: los `<select>` nativos (y la primitiva `Select`, que es uno) solo pueden bajar. El mensaje dice qué
 *      número poner.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { agruparOpciones, filtrarOpciones, type OpcionDeLista } from "./opciones";
import { RAIZ, EXENTOS_STL, archivosUi } from "./scan-source";

const ACTIVIDADES: OpcionDeLista[] = [
  { value: "k", label: "Kickoff", grupo: "De todo el proyecto", marca: "ya está", deshabilitada: true },
  { value: "s", label: "Sesión de seguimiento", grupo: "De todo el proyecto" },
  { value: "m", label: "Mapear el proceso actual", grupo: "Diagnóstico", marca: "una vez más" },
  { value: "c", label: "Enviar un cuestionario", grupo: "Diagnóstico" },
  { value: "d", label: "Diseñar el proceso en HubSpot", grupo: "Planificación" },
];

describe("1 · qué muestra el panel", () => {
  it("sin búsqueda, todas, agrupadas en el orden en que aparece cada grupo", () => {
    const grupos = agruparOpciones(filtrarOpciones(ACTIVIDADES, "  "));
    expect(grupos.map((g) => g.grupo)).toEqual(["De todo el proyecto", "Diagnóstico", "Planificación"]);
    expect(grupos.flatMap((g) => g.opciones.map((o) => o.value))).toEqual(["k", "s", "m", "c", "d"]);
  });

  it("busca sin tildes, en el nombre, la segunda línea y el grupo", () => {
    expect(filtrarOpciones(ACTIVIDADES, "sesion").map((o) => o.value)).toEqual(["s"]);
    expect(filtrarOpciones(ACTIVIDADES, "DISENAR").map((o) => o.value)).toEqual(["d"]);
    expect(filtrarOpciones(ACTIVIDADES, "diagnostico").map((o) => o.value)).toEqual(["m", "c"]);
    expect(filtrarOpciones([{ value: "e", label: "Elías", hint: "elias@smarteam.cr" }], "smarteam")).toHaveLength(1);
    expect(filtrarOpciones(ACTIVIDADES, "facturación")).toEqual([]);
  });

  it("al buscar, un grupo sin coincidencias desaparece (no queda el título solo)", () => {
    const grupos = agruparOpciones(filtrarOpciones(ACTIVIDADES, "cuestionario"));
    expect(grupos.map((g) => g.grupo)).toEqual(["Diagnóstico"]);
  });

  it("las opciones sin grupo van primero y sin título", () => {
    const grupos = agruparOpciones([{ value: "a", label: "A", grupo: "G" }, { value: "b", label: "B" }]);
    expect(grupos.map((g) => g.grupo)).toEqual([null, "G"]);
  });

  it("un grupo que vuelve a aparecer más abajo se junta con el primero", () => {
    const grupos = agruparOpciones([
      { value: "a", label: "A", grupo: "G" },
      { value: "b", label: "B", grupo: "H" },
      { value: "c", label: "C", grupo: "G" },
    ]);
    expect(grupos.map((g) => [g.grupo, g.opciones.map((o) => o.value)])).toEqual([["G", ["a", "c"]], ["H", ["b"]]]);
  });
});

function soloCodigo(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}
const leer = (rel: string) => soloCodigo(fs.readFileSync(path.join(RAIZ, rel), "utf8"));

describe("2 · una sola implementación del select", () => {
  it.each(["components/ui/Selector.tsx", "components/ui/CeldaSelect.tsx"])("%s usa el panel y la mecánica compartidos", (f) => {
    const src = leer(f);
    expect(src, `${f} dejó de usar PanelDeOpciones: hay dos listas de opciones que van a divergir`).toContain("<PanelDeOpciones");
    expect(src, `${f} dejó de usar usePanelFlotante`).toContain("usePanelFlotante(");
    expect(src, `${f} volvió a filtrar por su cuenta`).not.toMatch(/coincideBusqueda|normalize\(/);
  });

  it("el panel enfoca el buscador al abrir y dice cuando no hay coincidencias", () => {
    const src = leer("components/ui/PanelDeOpciones.tsx");
    expect(src).toContain("inputRef.current?.focus()");
    expect(src).toContain("sinCoincidencias(");
    expect(src, "las opciones que no se eligen tienen que salir del recorrido con flechas").toContain("disabled={ocupado || o.deshabilitada}");
  });

  it("⛔ Enter en el buscador NO guarda la primera de la lista: solo con texto y una sola que se puede elegir", () => {
    /* Muchas celdas guardan al elegir (el CSE encargado va a HubSpot; la empresa de una reunión decide de quién es su
       texto). El buscador tiene el foco al abrir: un Enter de reflejo no puede elegir. La edición que la pone en rojo:
       volver a elegir la primera coincidencia con el buscador vacío o con varias en pie. */
    const src = leer("components/ui/PanelDeOpciones.tsx");
    const i = src.indexOf('if (e.key !== "Enter") return;');
    expect(i, "desapareció el manejo de Enter del buscador").toBeGreaterThan(-1);
    const bloque = src.slice(i, src.indexOf("}}", i));
    expect(bloque).toContain("if (!busqueda.trim() || ocupado) return;");
    expect(bloque).toContain("if (elegibles.length === 1) onElegir(elegibles[0]);");
    expect(bloque.match(/onElegir\(/g), "otra rama del Enter elige sin preguntar").toHaveLength(1);
  });

  it("los elegibles del Enter siguen el orden en que se ven, no el que llegó", () => {
    const src = leer("components/ui/PanelDeOpciones.tsx");
    expect(src).toContain("grupos.flatMap((g) => g.opciones).filter((o) => !o.deshabilitada)");
  });

  it("⚠ el panel mide el alto que QUIERE (contenedor que scrollea), para poder abrirse hacia arriba", () => {
    /* Con un contenedor flex recortado, `scrollHeight` daba el alto ya recortado y al pie de la pantalla la lista se
       abría aplastada hacia abajo (revisión del 2026-11-08). */
    const src = leer("components/ui/PanelDeOpciones.tsx");
    expect(src).toContain('"fixed overflow-y-auto');
    expect(src).not.toMatch(/fixed flex flex-col overflow-hidden/);
  });
});

/**
 * ── 3 · RATCHET DEL `<select>` NATIVO ────────────────────────────────────────────────────────────────────────────────
 * Cuántos `<select>` nativos y `<Select>` (la primitiva vieja, que pinta uno) quedan en app/ y components/. Solo puede
 * BAJAR: uno nuevo va con `<Selector>`. Si cambiaste uno por `<Selector>`, baja el número al que dice el mensaje.
 * Medido el 2026-11-08, al nacer `Selector`.
 */
const TOPE_DE_SELECTS_NATIVOS = 167;

describe("3 · el select nativo solo encoge", () => {
  it("no hay selects nativos nuevos (y si sacaste uno, baja el tope)", () => {
    const ofensores: string[] = [];
    for (const rel of archivosUi(EXENTOS_STL)) {
      if (!rel.endsWith(".tsx")) continue;
      const norm = rel.split(path.sep).join("/");
      if (norm === "components/ui/Input.tsx") continue; // la primitiva `Select` misma
      const n = (leer(rel).match(/<(?:select|Select)\b/g) ?? []).length;
      for (let i = 0; i < n; i++) ofensores.push(norm);
    }
    const total = ofensores.length;
    expect(
      total,
      `Hay ${total} selects nativos y el tope es ${TOPE_DE_SELECTS_NATIVOS}. Uno nuevo va con <Selector> ` +
        `(components/ui): buscador, grupos y marcas, igual en todo Nexus.`,
    ).toBeLessThanOrEqual(TOPE_DE_SELECTS_NATIVOS);
    expect(
      total,
      `Cambiaste selects nativos por <Selector>: baja TOPE_DE_SELECTS_NATIVOS a ${total} en lib/ui/selector.test.ts.`,
    ).toBe(TOPE_DE_SELECTS_NATIVOS);
  });
});
