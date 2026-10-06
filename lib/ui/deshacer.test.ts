/**
 * lib/ui/deshacer.test.ts — EL DESHACER GLOBAL NO REVIERTE LO EQUIVOCADO.
 *
 * Correr: `npx vitest run --project unit lib/ui/deshacer.test.ts`.
 *
 * Nace con la auditoría del deshacer (2026-10-05). Cubre tres huecos:
 *   U1 · Ctrl+Z deshacía algo que NO estaba en pantalla (la pila global tomaba la última entrada de
 *        cualquier pantalla montada, aunque estuviera oculta).
 *   U2 · Un Ctrl+Z deshacía DOS cosas (el diagrama con su pila propia y el global), y el diagrama
 *        mataba el deshacer nativo de un campo editable de al lado.
 *   U7 · Lo aplicado por el chat eran N pasos sueltos, y el foco se quedaba en el campo del chat.
 *
 * Las reglas son funciones puras (lib/ui/deshacer.ts); el cableado se mira en el fuente.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  deshacerEnOrdenInverso,
  elDiagramaAtiende,
  elegirEntradaParaDeshacer,
  elGlobalAtiende,
  esCampoDeTexto,
  resolverAncla,
  seVeEnPantalla,
  sumarAlGrupo,
  superficieVisible,
  type TeclaPulsada,
} from "./deshacer";

const RAIZ = path.join(__dirname, "..", "..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
/** El código sin comentarios: un comentario que nombra la regla no la cumple. */
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

const tecla = (t: Partial<TeclaPulsada> = {}): TeclaPulsada => ({
  key: "z",
  ctrlKey: true,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
  ...t,
});

describe("U1 · Ctrl+Z solo deshace lo que se ve", () => {
  type E = { id: number; seVe: boolean };
  const visible = (e: E) => e.seVe;

  it("⛔ la última entrada es de una pantalla OCULTA: deshace la más reciente que se ve", () => {
    /* El caso real: el panel del proyecto sigue montado al pasar a «Info» de la cuenta. La edición
       que la pone en rojo: volver a `stack.pop()`, o recorrer la pila desde el principio. */
    const pila: E[] = [
      { id: 1, seVe: true },
      { id: 2, seVe: true },
      { id: 3, seVe: false },
    ];
    expect(elegirEntradaParaDeshacer(pila, visible)).toBe(1);
  });

  it("si no hay nada visible que deshacer, no elige nada", () => {
    expect(elegirEntradaParaDeshacer([{ id: 1, seVe: false }], visible)).toBe(-1);
    expect(elegirEntradaParaDeshacer([], visible)).toBe(-1);
  });

  it("con todo visible, es la de siempre: la última", () => {
    expect(elegirEntradaParaDeshacer([{ id: 1, seVe: true }, { id: 2, seVe: true }], visible)).toBe(1);
  });

  it("una pantalla sin ancla declarada se da por visible (compatibilidad); con ancla, manda el ancla", () => {
    const seVe = (el: { ok: boolean }) => el.ok;
    expect(superficieVisible([], seVe), "sin anclas: como antes").toBe(true);
    expect(superficieVisible([{ ok: false }], seVe)).toBe(false);
    expect(superficieVisible([{ ok: false }, { ok: true }], seVe), "dos montadas: alcanza una").toBe(true);
    expect(superficieVisible([null], seVe), "el ancla no resolvió (cargando, desmontada): no se ve").toBe(false);
  });

  it("el ancla se resuelve como elemento, ref o función", () => {
    const el = { tagName: "DIV" };
    expect(resolverAncla(el)).toBe(el);
    expect(resolverAncla({ current: el })).toBe(el);
    expect(resolverAncla(() => el)).toBe(el);
    expect(resolverAncla({ current: null })).toBeNull();
    expect(resolverAncla(undefined)).toBeNull();
  });

  it("se ve = conectado y pintado (un ancestro con `hidden` lo apaga)", () => {
    const base = { isConnected: true, getClientRects: () => ({ length: 1 }) };
    expect(seVeEnPantalla({ ...base, checkVisibility: () => true })).toBe(true);
    expect(seVeEnPantalla({ ...base, checkVisibility: () => false })).toBe(false);
    expect(seVeEnPantalla({ ...base, isConnected: false, checkVisibility: () => true })).toBe(false);
    expect(seVeEnPantalla({ isConnected: true, getClientRects: () => ({ length: 0 }) }), "sin checkVisibility").toBe(false);
  });

  it("el cableado: el atajo y el aviso eligen por visibilidad, y las pantallas declaran su ancla", () => {
    const prov = sinComentarios(leer("components/ui/UndoProvider.tsx"));
    expect(prov, "Ctrl+Z tiene que elegir con la regla pura").toContain(
      "elegirEntradaParaDeshacer(stackRef.current, entradaVisible)",
    );
    expect(prov, "volvió el pop ciego de la última entrada").not.toMatch(/stackRef\.current\.pop\(\)/);
    expect(prov, "la visibilidad se mide con el ancla").toContain("superficieVisible(");
    expect(prov, "el aviso deshace SU entrada").toContain("deshacerDelAviso(visible.id)");
    /* La API vieja sigue andando: el cronograma llama `useUndoScope(scope)` y no puede tocar esto. */
    expect(prov).toMatch(/export function useUndoScope\(scope: string, ancla\?: AnclaDeDeshacer\)/);
    expect(sinComentarios(leer("components/canvas/SectionBlockList.tsx"))).toContain(
      "useUndoScope(undoScope, containerRef)",
    );
    expect(sinComentarios(leer("components/canvas/CanvasLinearView.tsx"))).toContain("anclaDeDeshacer: raizRef");
    expect(sinComentarios(leer("components/canvas/useCanvasSections.ts"))).toContain(
      "registerScope(undoScope, tieneAncla ?",
    );
  });
});

describe("U2 · una tecla, un deshacer", () => {
  it("⛔ el global NO actúa si otro manejador ya atendió la tecla", () => {
    /* La edición que la pone en rojo: sacar `!e.defaultPrevented` de `elGlobalAtiende`. */
    expect(elGlobalAtiende(tecla({ defaultPrevented: true }), null)).toBe(false);
    expect(elGlobalAtiende(tecla(), null)).toBe(true);
    expect(elGlobalAtiende(tecla({ metaKey: true, ctrlKey: false }), null), "Cmd+Z").toBe(true);
  });

  it("el global no pisa el deshacer nativo del texto, ni atiende rehacer", () => {
    expect(elGlobalAtiende(tecla(), { tagName: "TEXTAREA" })).toBe(false);
    expect(elGlobalAtiende(tecla(), { tagName: "DIV", isContentEditable: true })).toBe(false);
    expect(elGlobalAtiende(tecla({ shiftKey: true, key: "Z" }), null)).toBe(false);
    expect(elGlobalAtiende(tecla({ key: "y" }), null)).toBe(false);
  });

  it("⛔ un contentEditable ES un campo de texto (el diagrama lo olvidaba)", () => {
    /* La edición que la pone en rojo: volver a mirar solo INPUT/TEXTAREA. */
    expect(esCampoDeTexto({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(esCampoDeTexto({ tagName: "input" })).toBe(true);
    expect(esCampoDeTexto({ tagName: "SELECT" })).toBe(true);
    expect(esCampoDeTexto({ tagName: "BUTTON" })).toBe(false);
    expect(esCampoDeTexto(null)).toBe(false);
  });

  it("el diagrama atiende solo si se ve, se está usando, tiene historial y nadie la atendió", () => {
    const ok = { yaAtendida: false, enCampoDeTexto: false, seVe: true, activo: true, hayHistorial: true };
    expect(elDiagramaAtiende(ok)).toBe(true);
    expect(elDiagramaAtiende({ ...ok, enCampoDeTexto: true })).toBe(false);
    expect(elDiagramaAtiende({ ...ok, yaAtendida: true })).toBe(false);
    expect(elDiagramaAtiende({ ...ok, seVe: false })).toBe(false);
    expect(elDiagramaAtiende({ ...ok, activo: false })).toBe(false);
    /* Sin historial NO cancela la tecla: si no, con el global respetando la cancelación, ninguna
       pantalla con un diagrama montado podría deshacer nada más. */
    expect(elDiagramaAtiende({ ...ok, hayHistorial: false })).toBe(false);
  });

  it("el cableado: el diagrama escucha en `document` y el global en `window` (el orden del burbujeo)", () => {
    const flujo = sinComentarios(leer("components/flowchart/FlowchartViewer.tsx"));
    const i = flujo.indexOf("elDiagramaAtiende({");
    expect(i, "el diagrama dejó de decidir con la regla pura").toBeGreaterThan(0);
    expect(flujo.slice(i, i + 600), "tiene que pasarle si ya la atendieron").toContain("yaAtendida: e.defaultPrevented");
    expect(flujo, "el diagrama tiene que escuchar ANTES que el global").toContain(
      'document.addEventListener("keydown", handler)',
    );
    expect(flujo, "el diagrama volvió a `window`: el global pasaría primero").not.toContain(
      'window.addEventListener("keydown", handler)',
    );
    expect(flujo, "el diagrama mira los campos de texto con la regla compartida").toContain("esCampoDeTexto(");
    const prov = sinComentarios(leer("components/ui/UndoProvider.tsx"));
    expect(prov).toContain("elGlobalAtiende(e, document.activeElement");
    expect(prov).toContain('window.addEventListener("keydown", onKey)');
  });
});

describe("U7 · lo aplicado por el chat es UN paso, y el foco sale del campo", () => {
  it("un grupo conserva la PRIMERA foto de cada campo (la de antes del acuerdo)", () => {
    const a = { scope: "s", coalesceKey: "s|t|1", n: 1 };
    const b = { scope: "s", coalesceKey: "s|t|1", n: 2 };
    const c = { scope: "s", n: 3 };
    const hijos = sumarAlGrupo(sumarAlGrupo(sumarAlGrupo([], a), b), c);
    expect(hijos.map((h) => h.n)).toEqual([1, 3]);
    expect(sumarAlGrupo([a], { ...b, scope: "otro" }).length, "otra pantalla no se junta").toBe(2);
  });

  it("⛔ se deshace de la última a la primera, sigue aunque una falle y dice si alguna falló", async () => {
    /* La edición que la pone en rojo: recorrer en el orden de registro. Deshacer «crear y llenar»
       al derecho borraría la sección antes de devolver su contenido. */
    const orden: number[] = [];
    const todas = await deshacerEnOrdenInverso([
      () => void orden.push(1),
      async () => {
        orden.push(2);
        return false;
      },
      () => {
        orden.push(3);
        throw new Error("x");
      },
    ]);
    expect(orden).toEqual([3, 2, 1]);
    expect(todas).toBe(false);
    expect(await deshacerEnOrdenInverso([() => undefined, async () => true])).toBe(true);
  });

  it("el cableado: el cajón de documentos agrupa lo aplicado y el chat suelta el foco al aplicar", () => {
    const doc = sinComentarios(leer("components/asistente/ChatDelDocumento.tsx"));
    expect(doc, "lo aplicado tiene que ir en UN paso").toMatch(
      /agruparDeshacer\(ROTULO_DE_LO_APLICADO, \(\) =>\s*aplicador\(operaciones\)/,
    );
    expect(doc).toContain('const ROTULO_DE_LO_APLICADO = "Aplicado"');
    const chat = sinComentarios(leer("components/asistente/ChatDelAsistente.tsx"));
    const exito = chat.indexOf("soltarElFocoDelCajon();");
    expect(exito, "al aplicar bien, el foco tiene que salir del cajón").toBeGreaterThan(0);
    const rama = chat.slice(chat.lastIndexOf("if (fallo)", exito), exito);
    expect(rama, "el foco se suelta en la rama del ÉXITO, no en la del fallo").toContain("} else {");
    expect(chat).toMatch(/cajonRef\.current\?\.contains\(enfocado\)\) enfocado\.blur\(\)/);
    const prov = sinComentarios(leer("components/ui/UndoProvider.tsx"));
    expect(prov, "el grupo se deshace con la regla pura").toContain("deshacerEnOrdenInverso(");
    expect(prov, "con un grupo abierto, lo registrado se suma al grupo").toContain(
      "grupo.hijos = sumarAlGrupo(grupo.hijos",
    );
  });
});
