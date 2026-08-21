/**
 * lib/timeline/handle-de-tarea.test.ts — EL CHAT NUNCA APUNTA A LA TAREA EQUIVOCADA.
 *
 * Correr: `npx vitest run lib/timeline/handle-de-tarea.test.ts --project unit`.
 *
 * ── LO QUE ESTOS TESTS PROTEGEN, Y NO ES TEÓRICO ─────────────────────────────────────────────
 * La primera versión de este módulo iba a tomar el PRINCIPIO del id. Medido contra las 1.317
 * tareas reales, eso daba **1.063 colisiones con 8 caracteres** — porque las tareas de un
 * cronograma nacen en el mismo `createMany` y comparten la marca de tiempo del cuid.
 *
 * Los ids de abajo son REALES (Wherex, tomados de producción): sirven de fixture justamente
 * porque son cuatro hermanas nacidas en la misma carga, o sea el peor caso.
 */
import { describe, it, expect } from "vitest";
import { handleDeTarea, resolverHandle, LARGO_DEL_HANDLE } from "./handle-de-tarea";

/** Cuatro tareas del mismo `createMany`: sus ids solo se distinguen cerca del final. */
const HERMANAS = [
  "cms6949c200qs06rwtewywlga",
  "cms6949pw00sj06rwrb4ttmef",
  "cms6949pw00sh06rw19je7u19",
  "cms6949pw00si06rw1bbqrex3",
];

describe("⛔ el handle sale del FINAL del id, que es lo aleatorio", () => {
  it("cuatro tareas de la misma carga tienen handles distintos", () => {
    /* La edición que lo pone en rojo: `id.slice(0, LARGO)` en vez de `id.slice(-LARGO)`.
       Con prefijos, estas cuatro devuelven "cms69" las cuatro y el chat mueve la que no era. */
    const handles = HERMANAS.map(handleDeTarea);
    expect(new Set(handles).size).toBe(4);
  });

  it("⚠ y el prefijo NO los distingue — la prueba de por qué esto no es paranoia", () => {
    /* Tres de las cuatro comparten los primeros 8 caracteres: nacieron en el mismo milisegundo.
       Sobre el corpus entero eso son 1.063 colisiones con 8 caracteres, contra 0 con 4 por el
       final. Si este assert empieza a dar 4, el fixture dejó de representar el caso real y hay
       que traer ids nuevos de producción antes de confiar en el resto del archivo. */
    const prefijos = new Set(HERMANAS.map((id) => id.slice(0, 8)));
    expect(prefijos.size, "el fixture dejó de representar tareas de una misma carga").toBeLessThan(
      HERMANAS.length,
    );
    expect(HERMANAS.filter((id) => id.startsWith("cms6949pw"))).toHaveLength(3);
  });

  it("el handle mide lo declarado", () => {
    expect(handleDeTarea(HERMANAS[0])).toHaveLength(LARGO_DEL_HANDLE);
    expect(handleDeTarea(HERMANAS[0])).toBe("ywlga");
  });

  it("un id más corto que el handle se devuelve entero, sin reventar", () => {
    expect(handleDeTarea("ab")).toBe("ab");
  });
});

describe("resolver: una, ninguna, o RECHAZO — nunca la primera que se parezca", () => {
  it("el handle encuentra su tarea", () => {
    expect(resolverHandle("ywlga", HERMANAS)).toEqual({ tipo: "una", id: HERMANAS[0] });
  });

  it("⚠ el id COMPLETO sigue funcionando: un acuerdo viejo tiene que poder aplicarse", () => {
    /* El handle es una comodidad de presupuesto, no un formato nuevo. Los acuerdos se persisten
       (`MensajeDeChat`) y el botón «Aplicar» sobrevive recargas y días. */
    expect(resolverHandle(HERMANAS[2], HERMANAS)).toEqual({ tipo: "una", id: HERMANAS[2] });
  });

  it("⛔ dos candidatas NO se desempatan: se rechaza con el conteo", () => {
    /* ESTA es la que importa. La probabilidad de choque es baja, no nula — y lo que decide si
       este módulo es seguro no es la probabilidad, es qué pasa cuando ocurre.
       La edición que lo pone en rojo: devolver `coinciden[0]` cuando hay más de una. */
    const chocan = ["aaaaaXXXXX", "bbbbbXXXXX"];
    expect(resolverHandle("XXXXX", chocan)).toEqual({ tipo: "ambigua", cuantas: 2 });
  });

  it("una tarea que ya no existe devuelve «ninguna», no una excepción", () => {
    expect(resolverHandle("zzzzz", HERMANAS)).toEqual({ tipo: "ninguna" });
    expect(resolverHandle("", HERMANAS)).toEqual({ tipo: "ninguna" });
    expect(resolverHandle("  ", HERMANAS)).toEqual({ tipo: "ninguna" });
  });

  it("no distingue mayúsculas: el modelo transcribe, y transcribir es donde se equivoca", () => {
    expect(resolverHandle("YWLGA", HERMANAS)).toEqual({ tipo: "una", id: HERMANAS[0] });
  });

  it("⛔ un handle que es prefijo de otro no arrastra al vecino", () => {
    /* Se compara por FINAL exacto, así que «lga» solo alcanza a quien termina en «lga». */
    const ids = ["xxxxxywlga", "xxxxxxxlga"];
    expect(resolverHandle("ywlga", ids)).toEqual({ tipo: "una", id: "xxxxxywlga" });
    expect(resolverHandle("lga", ids)).toEqual({ tipo: "ambigua", cuantas: 2 });
  });
});
