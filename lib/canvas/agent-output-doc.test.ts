import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { geometriaDeBloque, documentoDeCorrida } from "./agent-output-doc";

/**
 * lib/canvas/agent-output-doc.test.ts
 *
 * Dos cosas distintas, y las dos silenciosas si se rompen:
 *  1. La GEOMETRÍA es compartida con el camino de escritura. Si cambia, todos los documentos
 *     nuevos se guardan con otro tamaño de bloque y nadie se entera hasta verlos raros.
 *  2. El DOCUMENTO de una corrida vieja es la única copia sobreviviente de lo que un agente
 *     escribió antes de que alguien regenerara. Si el parser la clasifica mal, el historial
 *     sale vacío justo cuando se lo necesita.
 */

const DEFS = [
  { key: "alcance_contratado", label: "¿Qué vendimos?" },
  { key: "riesgos_banderas", label: "Riesgos y banderas rojas" },
];

const salida = (secciones: unknown) => JSON.stringify({ sections: secciones });
const textoDe = (contenido: string) => ({ type: "text", content: contenido });

describe("geometriaDeBloque: la aritmética que comparten el guardado y el visor", () => {
  it("texto por default, en MAYÚSCULAS, con su ancho de catálogo", () => {
    expect(geometriaDeBloque({ content: "hola" })).toEqual({
      blockType: "TEXT",
      content: "hola",
      data: undefined,
      colSpan: 4,
      rowSpan: 1,
    });
  });

  it("una tabla crece con sus filas", () => {
    const g = geometriaDeBloque({ type: "table", data: { rows: [1, 2, 3, 4, 5, 6, 7] } });
    expect(g.blockType).toBe("TABLE");
    expect(g.rowSpan).toBe(3); // ceil((7+1)*35/125)
  });

  it("una tabla vacía nunca baja de 2 (si no, la cabecera no entra)", () => {
    expect(geometriaDeBloque({ type: "table", data: { rows: [] } }).rowSpan).toBe(2);
  });

  it("heading y metric ocupan una fila, pase lo que pase", () => {
    expect(geometriaDeBloque({ type: "heading", content: "x".repeat(5000) }).rowSpan).toBe(1);
    expect(geometriaDeBloque({ type: "metric", data: { value: 1 } }).rowSpan).toBe(1);
  });

  it("un texto largo crece cada 800 caracteres", () => {
    expect(geometriaDeBloque({ type: "text", content: "x".repeat(1700) }).rowSpan).toBe(3);
  });

  it("un diagrama tiene alto propio", () => {
    expect(geometriaDeBloque({ type: "flowchart", data: {} }).rowSpan).toBe(3);
  });

  it("⚠ el camino de ESCRITURA usa este helper — no una copia", () => {
    /* La edición que la pone en rojo: volver a inlinear el cálculo en la ruta. El historial
       seguiría verde mientras se pinta con una geometría distinta de la que se guardó. */
    const ruta = fs.readFileSync(
      path.join(process.cwd(), "app/api/clients/[id]/analyze/route.ts"),
      "utf8",
    );
    expect(ruta, "analyze dejó de usar la geometría compartida").toContain("geometriaDeBloque(block)");
    expect(ruta, "volvió el cálculo inline a la ruta").not.toContain("DEFAULT_COL_SPAN[bt]");
  });
});

describe("documentoDeCorrida: clasificar lo que quedó guardado", () => {
  it("sin output, vacío o «{}» (corrida en curso) → sin contenido", () => {
    for (const v of [null, undefined, "", "   ", "{}"]) {
      const d = documentoDeCorrida(v, DEFS);
      expect(d.estado).toBe("sin_contenido");
      expect(d.motivo).toBe("Esta corrida no guardó contenido.");
      expect(d.secciones).toEqual([]);
    }
  });

  it("JSON truncado o que no es un objeto → ilegible (no explota)", () => {
    for (const v of ['{"sections":[{"key":"a","blo', "5", "[]", "null"]) {
      expect(documentoDeCorrida(v, DEFS).estado).toBe("ilegible");
    }
  });

  it("una corrida que falló muestra su motivo humanizado", () => {
    const d = documentoDeCorrida('{"error":"Se quedó sin créditos."}', DEFS);
    expect(d.estado).toBe("error");
    expect(d.motivo).toContain("créditos");
  });

  it("secciones vacías o sin bloques → sin contenido, no un documento en blanco", () => {
    expect(documentoDeCorrida(salida([]), DEFS).estado).toBe("sin_contenido");
    expect(
      documentoDeCorrida(salida([{ key: "alcance_contratado", blocks: [] }]), DEFS).estado,
    ).toBe("sin_contenido");
  });

  it("⚠ el orden de salida es el del DOCUMENTO, no el de emisión del agente", () => {
    /* Es lo que hace comparable el histórico contra el documento actual, lado a lado. La
       edición que la pone en rojo: recorrer las secciones emitidas en vez de `defs`. */
    const d = documentoDeCorrida(
      salida([
        { key: "riesgos_banderas", blocks: [textoDe("R")] },
        { key: "alcance_contratado", blocks: [textoDe("A")] },
      ]),
      DEFS,
    );
    expect(d.secciones.map((s) => s.key)).toEqual(["alcance_contratado", "riesgos_banderas"]);
    expect(d.secciones[0].label).toBe("¿Qué vendimos?");
  });

  it("una clave DUPLICADA se resuelve como en el guardado: gana la última", () => {
    /* Al escribir, cada sección emitida hace deleteMany+createMany, así que la segunda pasada
       pisa a la primera. El historial tiene que mostrar lo que realmente quedó. */
    const d = documentoDeCorrida(
      salida([
        { key: "alcance_contratado", blocks: [textoDe("PRIMERA")] },
        { key: "alcance_contratado", blocks: [textoDe("SEGUNDA")] },
      ]),
      DEFS,
    );
    expect(d.secciones).toHaveLength(1);
    expect(d.secciones[0].blocks[0].content).toBe("SEGUNDA");
  });

  it("una clave DESCONOCIDA se muestra al final, rotulada (el guardado la tiraba)", () => {
    const d = documentoDeCorrida(
      salida([
        { key: "inventada_por_la_ia", blocks: [textoDe("X")] },
        { key: "alcance_contratado", blocks: [textoDe("A")] },
      ]),
      DEFS,
    );
    expect(d.secciones.map((s) => s.key)).toEqual(["alcance_contratado", "inventada_por_la_ia"]);
    expect(d.secciones[1].desconocida).toBe(true);
    expect(d.secciones[1].label).toBe("inventada_por_la_ia"); // sin rótulo, se muestra la clave
    expect(d.clavesDesconocidas).toEqual(["inventada_por_la_ia"]);
    expect(d.seccionesConContenido).toBe(1); // las desconocidas no cuentan como sección del doc
  });

  it("sin defs, todo es desconocido y nada se pierde", () => {
    const d = documentoDeCorrida(salida([{ key: "lo_que_sea", blocks: [textoDe("X")] }]), []);
    expect(d.estado).toBe("ok");
    expect(d.secciones).toHaveLength(1);
    expect(d.secciones[0].desconocida).toBe(true);
    expect(d.seccionesEsperadas).toBe(0);
  });

  it("los ids son sintéticos y deterministas (no chocan con los de la base)", () => {
    const d = documentoDeCorrida(
      salida([{ key: "alcance_contratado", blocks: [textoDe("A"), textoDe("B")] }]),
      DEFS,
      { idPrefijo: "run123" },
    );
    expect(d.secciones[0].blocks.map((b) => b.id)).toEqual([
      "run123:alcance_contratado:0",
      "run123:alcance_contratado:1",
    ]);
    expect(d.secciones[0].blocks.map((b) => b.order)).toEqual([0, 1]);
  });

  it("cuenta secciones y bloques para el resumen del diálogo", () => {
    const d = documentoDeCorrida(
      salida([
        { key: "alcance_contratado", blocks: [textoDe("A"), textoDe("B")] },
        { key: "riesgos_banderas", blocks: [textoDe("R")] },
      ]),
      DEFS,
    );
    expect(d.seccionesConContenido).toBe(2);
    expect(d.seccionesEsperadas).toBe(2);
    expect(d.bloques).toBe(3);
    expect(d.motivo).toBeNull();
  });

  it("basura adentro de blocks se descarta y el resto se pinta igual", () => {
    /* Un bloque que no es un objeto no tiene `type` ni `content` que interpretar: dejarlo pasar
       produciría un TEXT vacío fantasma. Se tira, y lo bueno sobrevive. */
    const d = documentoDeCorrida(
      JSON.stringify({ sections: [{ key: "alcance_contratado", blocks: [null, textoDe("A"), 5] }] }),
      DEFS,
    );
    expect(d.estado).toBe("ok");
    expect(d.secciones[0].blocks).toHaveLength(1);
    expect(d.secciones[0].blocks[0].content).toBe("A");
  });
});
