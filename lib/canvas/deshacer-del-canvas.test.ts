/**
 * lib/canvas/deshacer-del-canvas.test.ts — CADA GESTO DEL CANVAS TIENE SU PASO, Y UNO SOLO.
 *
 * Correr: `npx vitest run --project unit lib/canvas/deshacer-del-canvas.test.ts`.
 *
 * Nace con la auditoría del deshacer (2026-10-05). Las vistas son componentes con fetch y estado, así
 * que la guarda mira el FUENTE (sin comentarios: un comentario que nombra la regla no la cumple):
 *   U3 · el handoff lineal tenía DOS deshacer para borrar un bloque; usar los dos lo DUPLICABA.
 *   U5 · «Aceptar todos» de la grilla no registraba deshacer (y Ctrl+Z revertía lo anterior).
 *   U6 · ocultar/mostrar sección no tenía deshacer; crear sección tampoco; borrar es definitivo y el
 *        chat lo hacía sin confirmar.
 *   U8 · el título/subtítulo/guía registraban el paso ANTES de saber si se guardó.
 *   U9 · voseo en textos que ve el usuario.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { formasDeVoseo, textosDelFuente } from "@/lib/ui/voseo";

const RAIZ = path.join(__dirname, "..", "..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

const HOOK = "components/canvas/useCanvasSections.ts";
const GRILLA = "components/canvas/SectionBlockList.tsx";
const LINEAL = "components/canvas/CanvasLinearView.tsx";

/** El cuerpo de `const nombre = useCallback(` hasta el próximo `const … = useCallback(`. */
function verbo(src: string, nombre: string): string {
  const i = src.indexOf(`const ${nombre} = useCallback(`);
  expect(i, `no encontré el verbo ${nombre}`).toBeGreaterThan(-1);
  const j = src.indexOf(" = useCallback(", i + nombre.length + 20);
  return src.slice(i, j < 0 ? undefined : j);
}

describe("U3 · borrar un bloque del handoff tiene UN deshacer (el global)", () => {
  it("⛔ la vista lineal no tiene un aviso «Deshacer» propio ni recrea el bloque por su cuenta", () => {
    /* La edición que la pone en rojo: volver a montar el toast local con su `restoreBlock`. Con el
       global también registrando el borrado, usar los dos recreaba el bloque DOS veces. */
    const src = sinComentarios(leer(LINEAL));
    expect(src, "volvió el deshacer local del borrado").not.toContain("restoreBlock");
    expect(src, "volvió el estado del aviso local").not.toMatch(/setUndo\(/);
    expect(src, "volvió el botón «Deshacer» local").not.toMatch(/>\s*Deshacer\s*</);
    expect(src, "el borrado tiene que pasar por el verbo que registra el deshacer global").toContain(
      "await deleteBlock(sectionId, block.id)",
    );
  });
});

describe("U5 · «Aceptar todos» es UN paso que devuelve todos a pendiente", () => {
  it("⛔ la grilla registra el paso, solo con los que se aceptaron", () => {
    /* La edición que la pone en rojo: borrar el `pushUndo` de `acceptAllDrafts`. */
    const src = sinComentarios(leer(GRILLA));
    const i = src.indexOf("const acceptAllDrafts = async");
    expect(i).toBeGreaterThan(-1);
    const cuerpo = src.slice(i, src.indexOf("const draftCount", i));
    expect(cuerpo, "«Aceptar todos» no registra deshacer").toContain("pushUndo(");
    expect(cuerpo, "el paso tiene que volver a borrador").toContain('status: "DRAFT"');
    expect(cuerpo, "solo los que se aceptaron de verdad").toContain("drafts.filter((_, i) => resultados[i])");
  });

  it("y la vista lineal con una sola sección también es UN paso (no uno por bloque)", () => {
    const src = sinComentarios(leer(LINEAL));
    expect(src).toContain("hookAcceptAll(onlyKey ? sections.map((s) => s.id) : undefined)");
    expect(src, "volvió el aceptar bloque por bloque").not.toMatch(/map\(\(b\) => acceptBlock\(/);
    const hook = verbo(sinComentarios(leer(HOOK)), "acceptAll");
    expect(hook, "el hook registra solo los aceptados").toContain("drafts.filter((_, i) => resultados[i])");
  });
});

describe("U6 · ocultar, mostrar y crear sección tienen su paso; borrar se confirma", () => {
  it("⛔ ocultar/mostrar registra el paso que la devuelve como estaba", () => {
    /* La edición que la pone en rojo: sacar el `pushUndo` de `setHidden`. Ctrl+Z se saltaba el
       ocultar y revertía la acción ANTERIOR. */
    const cuerpo = verbo(sinComentarios(leer(HOOK)), "setHidden");
    expect(cuerpo, "ocultar/mostrar sin deshacer").toContain("pushUndo(");
    expect(cuerpo).toContain("setHiddenRef.current(sectionId, prev, true)");
  });

  it("crear una sección registra su paso, y deshacerlo pide confirmación (borrar es definitivo)", () => {
    const cuerpo = verbo(sinComentarios(leer(HOOK)), "addSection");
    expect(cuerpo).toContain("pushUndo(");
    const i = cuerpo.indexOf("removeSectionRef.current(creada.id)");
    expect(i, "el deshacer de crear es borrar la creada").toBeGreaterThan(0);
    expect(cuerpo.slice(0, i), "y antes pregunta").toContain("window.confirm(");
  });

  it("⛔ el chat confirma ANTES de borrar una sección, y si dicen que no, no escribe nada", () => {
    const src = sinComentarios(leer("components/asistente/ejecutar-operaciones.ts"));
    const confirma = src.indexOf("window.confirm(");
    const primeraEscritura = src.indexOf("await hook.addSection(");
    expect(confirma, "el chat borra secciones sin preguntar").toBeGreaterThan(0);
    expect(confirma, "la confirmación tiene que ir antes de la primera escritura").toBeLessThan(primeraEscritura);
    expect(src.slice(confirma, primeraEscritura)).toContain("escribio: false");
  });
});

describe("U8 · el paso se registra solo si el guardado salió bien", () => {
  it("⛔ título, subtítulo y guía: primero el PATCH, después (y solo si anduvo) el paso", () => {
    /* La edición que la pone en rojo: volver a registrar antes del `await patchSection`. */
    const src = sinComentarios(leer(HOOK));
    for (const nombre of ["renameSection", "setEyebrow", "setBrief", "setHidden"]) {
      const cuerpo = verbo(src, nombre);
      const guardado = cuerpo.indexOf("const ok = await patchSection(");
      const paso = cuerpo.indexOf("pushUndo(");
      expect(guardado, `${nombre}: no espera el guardado`).toBeGreaterThan(-1);
      expect(paso, `${nombre}: registra el paso antes de saber si se guardó`).toBeGreaterThan(guardado);
      expect(cuerpo.slice(guardado, paso), `${nombre}: el paso tiene que depender del ok`).toMatch(/if \(ok && /);
    }
  });

  it("la grilla tampoco registra un paso de algo que falló", () => {
    const src = sinComentarios(leer(GRILLA));
    expect(src.match(/if \(ok && snap\)/g)?.length, "editar y descartar: el paso depende del ok").toBe(2);
    expect(src, "aceptar: sin ok no hay paso").toContain("if (!ok) return;");
    expect(src, "mover/redimensionar: sin ok no hay paso").toContain("if (!res.ok) return;");
  });
});

describe("U9 · tuteo en los textos que ve el usuario", () => {
  const ARCHIVOS = [
    HOOK,
    GRILLA,
    LINEAL,
    "components/ui/UndoProvider.tsx",
    "components/asistente/ChatDelDocumento.tsx",
    "lib/ui/deshacer.ts",
    "lib/canvas/restaurar-bloque.ts",
    "app/api/projects/[projectId]/estado-hubspot/route.ts",
    "app/api/projects/[projectId]/canvas-sections/[sectionId]/blocks/route.ts",
    "app/api/business-cases/[id]/canvas-sections/[sectionId]/blocks/route.ts",
  ];

  it("⛔ ni una forma de voseo («Reintentá», «Terminá», «volvé», «cambiale»)", () => {
    const hallados: string[] = [];
    for (const rel of ARCHIVOS) {
      for (const { linea, texto } of textosDelFuente(leer(rel), rel)) {
        for (const w of formasDeVoseo(texto)) hallados.push(`${rel}:${linea} «${w}»`);
      }
    }
    expect(hallados, `Voseo. Pásalo a tuteo («Vuelve a intentarlo», «Revisa»):\n${hallados.join("\n")}`).toEqual([]);
  });
});
