/**
 * lib/asistente/panel.test.ts — EL CAJÓN CONVIVE CON EL DOCUMENTO, NO LO TAPA.
 *
 * Correr: `npx vitest run lib/asistente/panel.test.ts --project unit`.
 *
 * ── POR QUÉ ESTO ES UN TEST Y NO UNA CONVENCIÓN ──────────────────────────────────────────────
 * Los CUATRO paneles deslizantes del repo son modales: fondo oscuro, `aria-modal`, y candado
 * sobre `body.overflow`. Es el patrón de la casa, así que la próxima persona que toque este
 * archivo lo va a copiar sin pensarlo — y el resultado es que el CSE no puede mirar el cronograma
 * mientras habla de él. La conversación es SOBRE el documento: taparlo la vuelve inútil.
 *
 * Y no falla ruidoso. Un backdrop de más se ve prolijo; lo que se pierde es la razón de ser del
 * panel, y eso no lo reporta nadie: se reporta como «el chat no me sirve».
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "@/lib/ui/scan-source";
import { PIEZAS_CON_CHAT, tieneChat, puedeConversar } from "./piezas";

/**
 * ⚠ Se blanquean los COMENTARIOS antes de escanear, y hace falta de verdad: el docblock del
 * panel explica por qué NO es modal, y para explicarlo nombra `aria-modal` y el candado de
 * scroll. Sin esto la guarda se disparaba contra su propia justificación — mencionar no es usar.
 */
function soloCodigo(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "");
}

const PANEL = soloCodigo(
  fs.readFileSync(path.join(RAIZ, "components/asistente/ChatDelAsistente.tsx"), "utf8"),
);


describe("el panel del asistente NO es modal", () => {
  it("⛔ no le pone candado al scroll de la página", () => {
    /* La edición que la pone en rojo: copiar el `document.body.style.overflow = "hidden"` de
       TaskDetailDrawer. Con el candado puesto, el CSE no puede scrollear el cronograma del que
       está hablando — que es todo el punto del panel. */
    expect(
      /body\.style\.overflow/.test(PANEL),
      "el panel bloqueó el scroll del documento: la conversación es SOBRE el documento",
    ).toBe(false);
  });

  it("⛔ no pinta fondo oscuro sobre el documento", () => {
    /* Un `fixed inset-0 bg-black/30` es el gesto exacto de los otros cuatro. */
    expect(
      /inset-0[^"]*bg-black|bg-black[^"]*inset-0/.test(PANEL),
      "apareció un backdrop: el documento tiene que quedar visible y clickeable",
    ).toBe(false);
    expect(
      PANEL.includes("aria-modal"),
      "el panel se declaró modal: deja de convivir con el documento",
    ).toBe(false);
  });

  it("⚠ y va por portal a body, porque el rail del cliente es sticky", () => {
    /* Ya mordido antes: una capa flotante dentro de un contenedor `sticky` se recorta contra él.
       La edición que la pone en rojo: devolver el <aside> directo en vez de createPortal. */
    expect(PANEL).toContain("createPortal(");
    expect(PANEL).toContain("document.body");
  });

  it("y queda POR DEBAJO de los modales de verdad", () => {
    /* Los modales del repo viven en z-55/60. Si el cajón subiera, un ConfirmDialog quedaría
       tapado por un panel que no es modal — y el usuario no podría confirmar nada. */
    const z = PANEL.match(/z-\[(\d+)\]/);
    expect(z, "el panel perdió su z declarado").not.toBeNull();
    expect(Number(z![1])).toBeLessThan(55);
  });
});

describe("el asistente no escribe desde el panel", () => {
  it("⛔ el cajón no llama a ningún endpoint que persista el documento", () => {
    /* El único fetch de escritura permitido es al propio asistente. Aplicar lo acordado lo
       resuelve el CANVAS por `onAplicar`, que entra por el editor de siempre con su preview.
       La edición que la pone en rojo: un fetch a `/timeline` con method PUT desde acá. */
    const rutas = [...PANEL.matchAll(/fetch\(\s*`([^`]+)`/g)].map((m) => m[1]);
    expect(rutas.length, "el panel dejó de hacer fetch: ¿se movió la carga del hilo?").toBeGreaterThan(0);
    for (const r of rutas) {
      expect(
        r.includes("/asistente"),
        `el panel llama a "${r}", que no es el endpoint del asistente: aplicar es del editor`,
      ).toBe(true);
    }
  });

  it("la instrucción es EDITABLE antes de aplicar", () => {
    /* Ese es el «dar el ok»: un humano leyendo la instrucción exacta que se va a ejecutar, no un
       resumen de ella. La edición que la pone en rojo: pintarla como texto plano. */
    expect(PANEL).toContain("instruccionEditada");
    expect(PANEL).toContain("podés editarla");
  });
});

describe("las piezas con chat se DERIVAN de las que tienen editor", () => {
  it("⭐ el cronograma y todos los documentos del assist, sin lista paralela", () => {
    /* Si fuera una lista escrita a mano, divergiría el día que alguien sume un documento al
       assist: el chat quedaría ausente justo donde ya se puede usar, y nada avisaría. */
    const fuente = fs.readFileSync(path.join(RAIZ, "lib/asistente/piezas.ts"), "utf8");
    expect(fuente).toContain("Object.keys(DOC)");
    expect(PIEZAS_CON_CHAT).toContain("timeline");
    expect(PIEZAS_CON_CHAT).toContain("kickoff");
    expect(PIEZAS_CON_CHAT).toContain("delivery");
    /* Exploración NO: su merge shallow borra el trabajo curado del CSE, en silencio. */
    expect(PIEZAS_CON_CHAT).not.toContain("exploration");
  });

  it("⚠ sin contenido generado no hay chat", () => {
    /* Un asistente sobre un documento vacío no tiene qué modificar: la primera generación sigue
       siendo «Generar». Ofrecerlo antes sería prometer una conversación que no termina en nada. */
    expect(puedeConversar("timeline", false)).toBe(false);
    expect(puedeConversar("timeline", true)).toBe(true);
    expect(tieneChat("handoff")).toBe(false);
  });
});
