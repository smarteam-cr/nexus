/**
 * lib/sessions/alimenta-sin-contenido.test.ts — UNA REUNIÓN VACÍA NO SE PINTA VERDE.
 *
 * ── LA FILA MÁS ENGAÑOSA DEL PANEL ───────────────────────────────────────────
 * En la columna de Google Meet del Contexto del proyecto, una sesión que ALIMENTA el handoff se
 * mostraba con la etiqueta «Incluida» en verde. Siempre. Aunque hubiera ocurrido y no hubiera
 * dejado **nada** — ni transcripción, ni resumen, ni minuta.
 *
 * O sea: el panel decía que el documento se está armando con N reuniones, y el agente recibía N
 * líneas que dicen «(sin transcript disponible)». Medido en agosto de 2026: el 52,7% de las
 * reuniones de los últimos 3 meses no dejó transcripción, así que esto no es un borde raro — es
 * la mitad de los casos.
 *
 * La lista de CANDIDATAS ya había dejado de cometer ese pecado (marca `sinContenido` desde la
 * tanda E). Las que ya alimentan se habían quedado afuera del chequeo.
 *
 * ── POR QUÉ UN ESCANEO ───────────────────────────────────────────────────────
 * Las dos mitades viven en código acoplado a base (el endpoint) y en JSX (la columna). El modo de
 * falla es de CABLEADO, no de cálculo: que el endpoint deje de mirar las que alimentan, o que la
 * fila vuelva a pintar verde sin preguntar. Ninguna de las dos rompe tsc ni ningún test de
 * comportamiento.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(__dirname, "..", "..");
const RUTA = "app/api/projects/[projectId]/session-candidates/route.ts";
const PANEL = "components/clients/SessionSelectionReview.tsx";
/**
 * ⚠ Normaliza CRLF→LF. Las dos PCs que comparten este repo hacen checkout con
 * finales de línea distintos, y las aserciones de abajo son literales de código
 * con `\n` adentro: sin esto, el escaneo sale ROJO en una de las dos máquinas y
 * VERDE en la otra sobre exactamente el mismo código. Un guard estructural tiene
 * que hablar del código, no de cómo lo escribió el checkout.
 */
const leer = (rel: string) =>
  fs.readFileSync(path.join(RAIZ, rel), "utf8").replace(/\r\n/g, "\n");

describe("⭐ el chequeo de contenido alcanza a las que YA alimentan", () => {
  it("las feeding entran al universo del chequeo, no solo las candidatas", () => {
    /* Si el universo vuelve a ser solo `clientSessions` + `internas`, `conContenido` no sabe nada
       de las que alimentan y todas quedan marcadas como vacías... o como llenas, según de qué
       lado caiga el default. Las dos respuestas son mentira. */
    const src = leer(RUTA);
    expect(src, "las que alimentan salieron del chequeo de contenido").toContain(
      "...feeding.map((f) => f.sessionId)",
    );
  });

  it("el marcado excluye las futuras", () => {
    /* A una reunión que todavía no ocurrió no le FALTA la transcripción. Contarla volvería el
       aviso ruido permanente en cualquier proyecto con agenda, y un aviso permanente se ignora. */
    const src = leer(RUTA);
    expect(src).toContain("!f.futura && !conContenido.has(f.sessionId)");
  });

  it("el id no se manda dos veces a la consulta", () => {
    // Una sesión puede estar en `feeding` y en el universo de candidatas a la vez.
    expect(leer(RUTA)).toContain("new Set(idsVisibles)");
  });
});

describe("⭐ la fila lo dice, y el aviso propone qué hacer", () => {
  it("una que alimenta sin contenido NO se pinta como «Incluida»", () => {
    /* La rama de `sinContenido` va ANTES del verde. Si alguien la saca, la fila vuelve a decir
       que todo está bien sobre un hueco. */
    const src = leer(PANEL);
    expect(src, "volvió el verde incondicional en las filas que alimentan").toContain(
      's.sinContenido\n                    ? { label: "Sin transcripción", tone: "amber" }',
    );
  });

  it("el aviso dice CUÁNTAS y adónde ir", () => {
    /* Un aviso que solo dice «falta material» no es accionable. El único gesto que existe hoy
       para taparlo es pegar las notas a mano, y esa columna está al lado. */
    const src = leer(PANEL);
    expect(src).toContain("const alimentanVacias = feeding.filter((s) => s.sinContenido).length");
    expect(src, "el aviso dejó de decir adónde ir").toContain("Fuentes manuales");
  });

  it("⚠ el contador se DERIVA de las filas, no viaja aparte", () => {
    /* Un número que llega del servidor separado de las filas que lo justifican se desincroniza
       el día que una de las dos cambie — y el panel diría «3 sin transcripción» mostrando cuatro,
       o ninguna. Se calcula donde se pinta. */
    expect(leer(RUTA), "volvió un contador suelto en la respuesta").not.toContain(
      "alimentanSinContenido",
    );
  });

  it("el aviso usa tokens del tema, no colores crudos", () => {
    // La pantalla tiene ratchet de grises; un ámbar a mano también rompe el modo claro.
    const src = leer(PANEL);
    expect(src).toContain("border-warn-line bg-warn-surface");
    expect(src).toContain("text-warn-ink");
  });
});
