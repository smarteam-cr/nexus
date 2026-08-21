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
    expect(PANEL).toContain("<textarea");
  });

  it("⚠ pero va PLEGADA: es auditable, no protagonista", () => {
    /* Reportado el 2026-08-20: ocupaba media pantalla y tapaba la conversación. Se abre con
       «Ver instrucción». La edición que la pone en rojo: sacar el <details>. */
    expect(PANEL).toContain("<details");
    expect(PANEL).toContain("Ver instrucción");
  });
});

describe("un aplicar que falla NO se lee como uno que anduvo", () => {
  /* ⛔ EL BUG DE LA PRIMERA PRUEBA REAL. El panel se cerraba apenas `onAplicar` resolvía, sin
     mirar si había funcionado — y como el editor no lanza excepción (guarda su error en su
     propio estado), un rechazo se veía EXACTAMENTE igual que un éxito: el cajón se cerraba y el
     error aparecía suelto al pie del documento, sin contexto. */

  it("⛔ onAplicar tiene que poder decir que falló", () => {
    /* La edición que la pone en rojo: volver la firma a `Promise<void>`. */
    expect(PANEL).toContain("ResultadoDeAplicar");
    expect(
      /onAplicar\?:\s*\(instruccion: string\)\s*=>\s*Promise<void>/.test(PANEL),
      "onAplicar volvió a no devolver nada: el panel no puede distinguir éxito de fallo",
    ).toBe(false);
  });

  it("⛔ aplicar NUNCA cierra el panel", () => {
    /* ⚠ Esta guarda cambió de forma dos veces, y las dos por lo mismo: el cierre automático
       siempre estuvo mal, solo que al principio no se veía.

       Primero cerraba SIEMPRE, incluso cuando el aplicar había fallado — y como el editor no
       lanza excepción, un rechazo se veía igual que un éxito. Después cerraba solo si no había
       avisos. Ahora no cierra nunca (decisión de Elías, 2026-08-20): con las operaciones aplicar
       tarda ~1 ms, así que cerrar el cajón convierte un cambio instantáneo en «desapareció todo
       y no sé qué pasó». Y la conversación sigue: lo normal es encadenar dos o tres ajustes.

       La edición que la pone en rojo: volver a meter un `onClose()` en el camino de aplicar. */
    const i = PANEL.indexOf("await onAplicar(");
    expect(i, "se perdió el resultado de aplicar").toBeGreaterThan(-1);
    const bloque = PANEL.slice(i, PANEL.indexOf("} finally {", i));
    expect(bloque.indexOf("if (fallo)"), "dejó de mirar si falló").toBeGreaterThan(-1);
    expect(
      bloque.includes("onClose()"),
      "aplicar volvió a cerrar el panel: el desenlace queda escrito en el hilo, ahí mismo",
    ).toBe(false);
  });

  it("⚠ y el desenlace LLEVA los avisos, no un ✅ pelado", () => {
    /* «Se aplicó» sobre algo que no se aplicó es peor que un error: el CSE cierra el panel
       convencido y se entera días después. */
    expect(PANEL).toContain("anotarDesenlace(true, avisos");
  });

  it("⚠ y el desenlace queda ESCRITO en el hilo", () => {
    /* Sin eso, reabrir el panel muestra el mismo botón «Aplicar», indistinguible de «nunca se
       intentó». Y como el modelo lee el hilo, escribirlo le enseña que su instrucción no entró. */
    expect(PANEL).toContain("anotarDesenlace");
    expect(PANEL).toContain("idDelAcuerdoVivo");
  });
});

describe("mientras aplica, el DOCUMENTO se bloquea — no el cajón", () => {
  /* Pedido de Elías el 2026-08-20, junto con «que el chat no se cierre»: son las dos mitades de
     un mismo gesto. El cajón queda vivo para leer lo que pasó; el cronograma queda quieto para
     que nadie lo edite a mitad de una escritura. */

  const CANVAS = soloCodigo(
    fs.readFileSync(path.join(RAIZ, "components/canvas/CronogramaCanvas.tsx"), "utf8"),
  );

  it("⚠ el velo tapa el cronograma y se anuncia como ocupado", () => {
    /* La edición que la pone en rojo: borrar el bloque `{applying && (…)}` del canvas. Sin él
       aplicar es invisible: el cronograma sigue mostrando lo viejo, acepta clicks, y como con
       las operaciones tarda ~1 ms, el cambio aparece de golpe sin que nada lo haya anunciado. */
    const i = CANVAS.indexOf("{applying && (");
    expect(i, "se fue el velo de aplicar: el cronograma acepta clicks a mitad de la escritura").toBeGreaterThan(-1);
    const velo = CANVAS.slice(i, i + 1600);
    expect(velo, "la guarda dejó de mirar el velo").toContain("aria-busy");
    expect(velo).toContain("skeleton-shimmer");
  });

  it("⛔ y queda POR DEBAJO del cajón, o el chat se vuelve inusable justo cuando importa", () => {
    /* ESTA es la que protege lo invisible. Subir el z del velo no rompe nada que se vea en un
       test: simplemente tapa el panel durante el aplicar, que es EL momento en que el CSE quiere
       leer el desenlace y encadenar el ajuste siguiente.
       La edición que la pone en rojo: cambiar `z-30` por `z-50` en el velo. */
    const i = CANVAS.indexOf("{applying && (");
    const z = CANVAS.slice(i, i + 400).match(/\bz-(\d+)\b/);
    expect(z, "el velo perdió su z declarado").not.toBeNull();
    const zPanel = PANEL.match(/z-\[(\d+)\]/);
    expect(Number(z![1])).toBeLessThan(Number(zPanel![1]));
  });
});

describe("el texto del asistente se renderiza", () => {
  it("⛔ como Markdown, no como texto plano", () => {
    /* Reportado el 2026-08-20: se veía el `- **Sumar…**` crudo. La edición que la pone en rojo:
       volver a `whitespace-pre-wrap` para el turno del asistente. */
    expect(PANEL).toContain("ReactMarkdown");
    expect(PANEL).toContain("list-decimal");
  });
});

describe("un acuerdo de doce líneas se sigue pudiendo leer entero", () => {
  /* El vocabulario del cronograma pasó de 10 a 18 operaciones el 2026-08-21, y las de tarea se
     emiten ENUMERADAS —una por tarea— para que la cajita las nombre por título en vez de aprobar
     un criterio a ciegas. El efecto: un acuerdo normal pasó de 2 líneas a 12, en un cajón de
     400 px. Sin recorte, la lista empuja el botón «Aplicar» fuera de pantalla. */

  it("⚠ la lista tiene scroll propio cuando se hace larga", () => {
    /* La edición que la pone en rojo: sacar el `max-h` del <ol>. Nada falla, nada se ve raro en
       un acuerdo de dos líneas — y con doce el botón deja de estar donde la persona lo busca. */
    const i = PANEL.indexOf("acuerdo.lineas.map");
    expect(i, "se perdió el render de las líneas del acuerdo").toBeGreaterThan(-1);
    const bloque = PANEL.slice(Math.max(0, i - 900), i);
    expect(bloque, "la lista de operaciones perdió su recorte").toContain("max-h-");
    expect(bloque).toContain("overflow-y-auto");
  });

  it("⭐ y dice CUÁNTOS cambios son, arriba", () => {
    /* Es lo que la persona necesita ANTES de leer: doce o dos cambia si revisa uno por uno o si
       lee y aprieta. La edición que la pone en rojo: borrar el contador. */
    expect(PANEL).toContain("lineas.length} cambios");
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
