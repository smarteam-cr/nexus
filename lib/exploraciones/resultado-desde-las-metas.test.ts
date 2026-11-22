/**
 * lib/exploraciones/resultado-desde-las-metas.test.ts — el resultado del negocio sugerido con las metas principales
 * (22 nov, noche): lee las 4 primeras en el orden de la persona, y lo escrito no inventa ni da vuelta cifras ni vosea.
 */
import { describe, expect, it } from "vitest";
import { leerElResultado, mensajeDelResultado, metasPrincipales } from "./resultado-desde-las-metas";

const METAS = [
  { que: "Subir la conversión del e-commerce", actual: "0,17 %", objetivo: "1 %", para: "2027" },
  { que: "Vender a los clientes de crédito y cobranza" },
  { que: "Personalizar los envíos" },
  { que: "Medir el retorno de cada canal" },
  { que: "Una quinta meta que el Resumen no muestra" },
];

describe("metasPrincipales: las 4 primeras, en su orden", () => {
  it("deja afuera la quinta y conserva las cifras de cada meta", () => {
    const m = metasPrincipales(METAS);
    expect(m).toHaveLength(4);
    expect(m[0]).toBe("Subir la conversión del e-commerce: de 0,17 % a 1 % para 2027");
    expect(mensajeDelResultado("Cemaco · Ecuador", m)).toContain("4. Medir el retorno de cada canal");
    expect(metasPrincipales(undefined)).toEqual([]);
  });
});

describe("leerElResultado: lo que se puede sugerir", () => {
  const metas = metasPrincipales(METAS);

  it("una frase con las cifras de las metas pasa", () => {
    expect(leerElResultado({ resultado: "Vender más en línea: conversión de 0,17 % a 1 % para 2027, aprovechando crédito y cobranza." }, metas)).toEqual({
      ok: true,
      texto: "Vender más en línea: conversión de 0,17 % a 1 % para 2027, aprovechando crédito y cobranza.",
    });
  });

  it("una cifra inventada, una dada vuelta, el voseo o nada: no se sugiere", () => {
    expect(leerElResultado({ resultado: "Duplicar las ventas a 2 millones en 2027" }, metas)).toMatchObject({ ok: false });
    expect(leerElResultado({ resultado: "Conversión de 1 % a 0,17 %" }, metas)).toMatchObject({ ok: false, motivo: "da vuelta una cifra de las metas" });
    expect(leerElResultado({ resultado: "Querés vender más en línea" }, metas)).toMatchObject({ ok: false, motivo: "está en voseo" });
    expect(leerElResultado({}, metas)).toMatchObject({ ok: false, motivo: "vino vacío" });
  });
});
