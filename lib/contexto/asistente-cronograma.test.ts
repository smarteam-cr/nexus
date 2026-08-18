/**
 * lib/contexto/asistente-cronograma.test.ts
 *
 * Correr: `npx vitest run lib/contexto/asistente-cronograma.test.ts --project unit`.
 *
 * ── LA GUARDA QUE JUSTIFICA EL TRAMO ─────────────────────────────────────────
 * Darle contexto de negocio al modificador es lo que lo vuelve útil — y lo que lo vuelve
 * peligroso. Antes solo veía el cronograma, así que no TENÍA de dónde sacar una frase interna;
 * ahora tiene el handoff, el requerimiento técnico y la operativa de HubSpot enfrente, y el
 * texto que escribe (títulos de tarea, nombres de fase, notas) se publica en el enlace del
 * cliente y se imprime en el PDF.
 *
 * Por eso el centinela: un dato que SOLO existe en el material interno, y que no puede
 * aparecer en la salida.
 *
 * ⚠ ESTE ARCHIVO NO LLAMA A CLAUDE. Prueba lo que se puede probar sin modelo: que la regla de
 * frontera viaja SIEMPRE con el contexto, que las fuentes internas están rotuladas como tales,
 * y que el cronograma es la ÚNICA fuente que el modelo puede copiar. Que el modelo obedezca la
 * regla es lo que se verifica a mano en la prueba clickeada — y el break honesto de esa
 * verificación es sacar `REGLA_DE_FRONTERA_DEL_ASSIST` del prompt y confirmar que el centinela
 * SÍ aparece. Si aparece igual con y sin la regla, la regla no está ganada.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  fuentesDelAssist,
  REGLA_DE_FRONTERA_DEL_ASSIST,
  SIN_HANDOFF_CONFIRMADO_ASSIST,
  type CrudasDelAssist,
} from "./asistente-cronograma";
import { renderFuentes, PIEZAS_CON_CONTEXTO_NOMBRADO } from "./tipos";

/** Lo que solo puede venir del material interno. Si sale en el Gantt, la frontera se rompió. */
const CENTINELA = "MARGEN-INTERNO-No-Publicar-7731";

const CRUDAS: CrudasDelAssist = {
  cronogramaCtx: '{"phases":[{"id":"f1","name":"Setup","tasks":[{"id":"t1","status":"DONE"}]}]}',
  handoffCtx: `Se vendió Sales Hub Pro. ${CENTINELA}. Contacto: María Pérez.`,
  desarrolloCtx: "Objeto Pedido ↔ HubSpot Deal, llave: numero_pedido.",
  operativaCtx: "- Estado: Retrasado\n- Prioridad: Alta",
};

describe("fuentesDelAssist", () => {
  it("son cuatro, en orden, y cada una lleva su procedencia ADENTRO del texto", () => {
    const f = fuentesDelAssist(CRUDAS);
    expect(f.map((x) => x.key)).toEqual([
      "cronograma-vivo",
      "handoff-curado",
      "requerimiento-tecnico",
      "operativa-hubspot",
    ]);
    // La procedencia no puede depender de que el call site la agregue: viaja en el texto.
    for (const fuente of f) {
      if (fuente.texto) expect(fuente.texto.startsWith("===")).toBe(true);
    }
  });

  it("el cronograma llega CON el estado de cada tarea — es lo que lo separa del creador", () => {
    const texto = fuentesDelAssist(CRUDAS)[0].texto;
    expect(texto).toContain("estado de cada tarea");
    expect(texto).toContain('"status":"DONE"');
  });

  it("las fuentes que no aportan salen vacías, no como bloques huecos", () => {
    const f = fuentesDelAssist({ ...CRUDAS, desarrolloCtx: "", operativaCtx: "" });
    expect(f.find((x) => x.key === "requerimiento-tecnico")!.texto).toBe("");
    expect(f.find((x) => x.key === "operativa-hubspot")!.texto).toBe("");
    // `renderFuentes` las saltea: el prompt no gana líneas en blanco.
    expect(renderFuentes(f)).not.toContain("REQUERIMIENTO TÉCNICO");
  });

  it("sin handoff confirmado lo DICE, en vez de mandar un bloque vacío", () => {
    const f = fuentesDelAssist({ ...CRUDAS, handoffCtx: "" });
    expect(f.find((x) => x.key === "handoff-curado")!.texto).toContain(SIN_HANDOFF_CONFIRMADO_ASSIST);
  });
});

describe("la frontera entre lo interno y lo que lee el cliente", () => {
  it("la regla nombra las tres cosas que no pueden cruzar", () => {
    // No es cosmético: si la regla se afloja a «sé cuidadoso», deja de restringir nada.
    expect(REGLA_DE_FRONTERA_DEL_ASSIST).toContain("NUNCA los copies");
    expect(REGLA_DE_FRONTERA_DEL_ASSIST).toMatch(/nombres de personas/i);
    expect(REGLA_DE_FRONTERA_DEL_ASSIST).toMatch(/montos|comerciales/i);
    expect(REGLA_DE_FRONTERA_DEL_ASSIST).toMatch(/frases textuales/i);
  });

  it("el centinela vive en el contexto — o sea que la salida PUEDE contaminarse", () => {
    /* La premisa de la guarda. Si el centinela no llegara al prompt, el test de más abajo
       pasaría por vacío y no probaría nada. */
    expect(renderFuentes(fuentesDelAssist(CRUDAS))).toContain(CENTINELA);
  });

  it("⛔ LA RUTA MANDA LA REGLA JUNTO CON EL CONTEXTO, SIEMPRE", () => {
    /* El modo de falla que esto caza: alguien suma el contexto y se olvida la regla, o la
       saca «porque hace ruido en el prompt». El material interno sigue enfrente del modelo y
       nada le dice que no lo copie — y el resultado se publica al cliente. No falla en ningún
       test de comportamiento, porque el JSON sigue siendo válido. */
    const ruta = readFileSync(
      join(__dirname, "..", "..", "app/api/projects/[projectId]/timeline/assist/route.ts"),
      "utf8",
    );
    const contexto = ruta.indexOf("cargarContextoDelAssist(");
    const regla = ruta.indexOf("REGLA_DE_FRONTERA_DEL_ASSIST", contexto);
    expect(contexto, "la ruta dejó de cargar el contexto nombrado").toBeGreaterThan(-1);
    expect(
      regla,
      "La ruta carga el contexto de negocio y NO manda la regla de frontera. El modelo tiene el " +
        "handoff enfrente y nada que le diga que no lo copie al texto que ve el cliente.",
    ).toBeGreaterThan(-1);

    // Y va DENTRO del userMessage, no suelta en el archivo.
    const userMessage = ruta.slice(ruta.indexOf("const userMessage ="), ruta.indexOf("const run = await"));
    expect(
      userMessage.includes("REGLA_DE_FRONTERA_DEL_ASSIST"),
      "la regla existe en el archivo pero no está interpolada en el mensaje que se manda",
    ).toBe(true);
  });

  it("el modificador entró al trinquete del contexto nombrado", () => {
    expect(PIEZAS_CON_CONTEXTO_NOMBRADO).toContain("assist");
  });

  it("la ruta no vuelve a armar fuentes a mano — el contexto tiene un solo dueño", () => {
    const ruta = readFileSync(
      join(__dirname, "..", "..", "app/api/projects/[projectId]/timeline/assist/route.ts"),
      "utf8",
    );
    /* El contexto se compone en lib/contexto y se rinde con `renderFuentes`. Un bloque
       `=== ALGO ===` escrito a mano en la ruta es una fuente que no está bajo el trinquete: no
       se puede auditar, no se puede loguear y nadie sabe que existe.
       ⚠ `=== INSTRUCCIÓN DEL CONSULTOR ===` y `=== ALCANCE ===` NO son fuentes: son el pedido
       del humano y el recorte de la corrida. Por eso están exentos por nombre. */
    const EXENTOS = ["=== INSTRUCCIÓN DEL CONSULTOR ===", "=== ALCANCE ==="];
    const bloques = [...ruta.matchAll(/=== [^\n=]+ ===/g)].map((m) => m[0]);
    const aMano = bloques.filter((b) => !EXENTOS.includes(b));
    expect(
      aMano,
      `Bloques de contexto escritos a mano en la ruta del modificador:\n` +
        aMano.map((b) => `  · ${b}`).join("\n") +
        `\n\nVan en lib/contexto/asistente-cronograma.ts, como fuente con key y procedencia.`,
    ).toEqual([]);
  });
});
