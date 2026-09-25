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
import { handleDeTarea, handlesSinChoque, resolverHandle, LARGO_DEL_HANDLE } from "./handle-de-tarea";

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

describe("E3 P4 · con una propuesta abierta, cada identificador que se imprime resuelve a SU tarea", () => {
  /* Con una propuesta, el chat nombra también las tareas NUEVAS, por su clave (`t:` + un UUID). El final
     de un UUID es hexadecimal: con 250 claves, dos chocan en 5 caracteres ~3 % de las veces. Un handle
     impreso que `resolverHandle` rechaza por ambiguo es una tarea que el chat no puede nombrar nunca.
     La edición que pone en rojo estas guardas: volver a `handleDeTarea` (5 fijos) en `handlesSinChoque`. */
  const resuelveASuTarea = (handles: Map<string, string>, refs: string[]) =>
    refs.filter((ref) => {
      const r = resolverHandle(handles.get(ref) ?? "", refs);
      return !(r.tipo === "una" && r.id === ref);
    });

  it("sin choques, el identificador es el de siempre: los 5 del final", () => {
    const h = handlesSinChoque(HERMANAS);
    expect(HERMANAS.map((id) => h.get(id))).toEqual(HERMANAS.map(handleDeTarea));
  });

  it("⛔ dos claves nuevas que chocan en 5 (y en 6) se alargan SOLO ellas, hasta distinguirse", () => {
    const a = "t:1b9d6bcd-bbfd-4b2d-9b5d-ab8dfb3e7c1d";
    const b = "t:6ec0bd7f-11c0-43da-975e-2a8ad93e7c1d";
    const refs = [...HERMANAS, a, b];
    const h = handlesSinChoque(refs);
    expect(h.get(a)).toBe("b3e7c1d");
    expect(h.get(b)).toBe("93e7c1d");
    expect(h.get(HERMANAS[0]), "una que no choca quedó como hoy").toBe("ywlga");
    expect(resuelveASuTarea(h, refs), "un identificador impreso no resuelve a su tarea").toEqual([]);
  });

  it("una ref que es el FINAL de otra se nombra entera: gana el id exacto", () => {
    const refs = ["abcde", "xabcde"];
    const h = handlesSinChoque(refs);
    expect(h.get("abcde")).toBe("abcde");
    expect(h.get("xabcde")).toBe("xabcde");
    expect(resuelveASuTarea(h, refs)).toEqual([]);
  });

  it("el choque se mide sin mayúsculas, como compara `resolverHandle`", () => {
    const refs = ["aaaaaXYZWQ", "bbbbbxyzwq"];
    const h = handlesSinChoque(refs);
    expect(h.get(refs[0])!.length).toBeGreaterThan(LARGO_DEL_HANDLE);
    expect(resuelveASuTarea(h, refs)).toEqual([]);
  });

  it("⭐ 300 claves nuevas y 100 ids vivos: ninguno queda ambiguo", () => {
    // Un generador con semilla: la prueba es la misma en cada corrida.
    let semilla = 20260925;
    const hex = (n: number) =>
      Array.from({ length: n }, () => {
        semilla = (semilla * 1103515245 + 12345) % 2 ** 31;
        return ((semilla >>> 16) % 16).toString(16); // los bits altos: los bajos de un LCG repiten cada 16
      }).join("");
    const nuevas = Array.from({ length: 300 }, () => `t:${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`);
    const vivas = Array.from({ length: 100 }, (_, i) => `cmpc0jut2${String(i).padStart(3, "0")}xgij${hex(8)}`);
    const refs = [...nuevas, ...vivas];
    const h = handlesSinChoque(refs);
    expect(h.size).toBe(refs.length);
    expect(resuelveASuTarea(h, refs)).toEqual([]);
  });
});
