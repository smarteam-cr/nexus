/**
 * lib/asistente/alcance.test.ts — LA LÍNEA DE ALCANCE DEL CHIP (E4 P1).
 *
 * Correr: `npx vitest run lib/asistente/alcance.test.ts --project unit`.
 *
 * La línea que se antepone al mensaje del CSE es lo que hace que el chip sobreviva al turno siguiente
 * (el hilo se re-manda entero). E4 P1 suma la de una FASE («IA» del Gantt). Lo que se cuida:
 *   · la línea de fase dice qué fase y su id, y que es una pista, no un límite;
 *   · la línea de SECCIÓN no cambia ni un byte: los hilos viejos se siguen limpiando al pintar;
 *   · `mensajeSinAlcance` saca las dos marcas y deja intacto un texto sin marca.
 * Cada `it` nombra la edición que lo pone en rojo.
 */
import { describe, expect, it } from "vitest";
import { lineaDeAlcance, MARCA_DE_ALCANCE, MARCA_DE_FASE, MARCAS_DE_ALCANCE, mensajeSinAlcance } from "./alcance";

describe("⭐ la línea de una fase", () => {
  it("empieza con [SOBRE LA FASE «X» [id]], dice «no un límite» y cierra con una línea en blanco", () => {
    /* La edición que la pone en rojo: nombrar la fase sin su id (el modelo no sabría qué `phaseId` usar)
       o no cerrar el bloque (se pintaría crudo arriba del mensaje). */
    const l = lineaDeAlcance({ key: "fase:cm123abc", label: "Integraciones", tipo: "fase" });
    expect(l.startsWith("[SOBRE LA FASE «Integraciones» [cm123abc]]\n")).toBe(true);
    expect(l).toContain("no un límite");
    expect(l.endsWith("\n\n")).toBe(true);
    expect(l.indexOf("\n\n"), "el bloque se cierra antes de tiempo").toBe(l.length - 2);
    // Una fase nueva de la propuesta viaja con su clave `n:`.
    expect(lineaDeAlcance({ key: "fase:n:piloto", label: "Piloto", tipo: "fase" })).toContain("«Piloto» [n:piloto]]");
  });
});

describe("⛔ la línea de una SECCIÓN no cambia (golden)", () => {
  it("byte a byte la de antes, con y sin cita", () => {
    /* Los hilos viejos llevan esta línea guardada: si cambia, `mensajeSinAlcance` deja de limpiarla y el
       marcador se pinta crudo. La edición que la pone en rojo: tocar el texto de la línea de sección. */
    expect(lineaDeAlcance({ key: "objetivos", label: "Objetivos del proyecto" })).toBe(
      "[SOBRE LA SECCIÓN «Objetivos del proyecto» (objetivos)]\n" +
        "Es de dónde vino el pedido, no un límite: si lo que sigue habla de otra sección, atiéndelo igual.\n\n",
    );
    expect(lineaDeAlcance({ key: "objetivos", label: "Objetivos", cita: "  Migrar desde Excel " })).toBe(
      "[SOBRE LA SECCIÓN «Objetivos» (objetivos)]\n" +
        "Señaló el punto que dice: «Migrar desde Excel». Úsalo como `cita` para identificarlo.\n" +
        "Es de dónde vino el pedido, no un límite: si lo que sigue habla de otra sección, atiéndelo igual.\n\n",
    );
    expect(lineaDeAlcance(null)).toBe("");
    expect(MARCA_DE_ALCANCE).toBe("[SOBRE LA SECCIÓN");
    expect([...MARCAS_DE_ALCANCE]).toEqual([MARCA_DE_ALCANCE, MARCA_DE_FASE]);
  });
});

describe("`mensajeSinAlcance`: lo que la persona escribió, sin la línea", () => {
  it("quita la de sección y la de fase; un texto sin marca queda intacto", () => {
    /* La edición que la pone en rojo: cortar solo con la marca de sección (la línea de fase se pintaría
       arriba de cada mensaje de la persona). */
    const pedido = "cambia la nota a algo más corto";
    expect(mensajeSinAlcance(`${lineaDeAlcance({ key: "fase:f2", label: "Sales Hub", tipo: "fase" })}${pedido}`)).toBe(pedido);
    expect(mensajeSinAlcance(`${lineaDeAlcance({ key: "objetivos", label: "Objetivos" })}${pedido}`)).toBe(pedido);
    expect(mensajeSinAlcance(pedido)).toBe(pedido);
    const conParrafos = "Primero esto.\n\nY después esto.";
    expect(mensajeSinAlcance(conParrafos), "cortó un mensaje sin marca").toBe(conParrafos);
  });
});
