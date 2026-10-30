/**
 * lib/planificacion/brief-xlsx.test.ts — la hoja se lee como se ve (2026-10-29): con un libro de verdad, escrito y vuelto a
 * leer con exceljs. La lectura de Drive se prueba aparte (brief-ruta.test.ts).
 */
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { pestanasDelXlsx, textoDeValor } from "./brief-xlsx";
import { TOPE_DE_FILAS, TOPE_DEL_BRIEF, briefDesdeLibro, pestanaDesdeCeldas } from "./brief-importado";

async function libro(armar: (l: ExcelJS.Workbook) => void): Promise<Buffer> {
  const l = new ExcelJS.Workbook();
  armar(l);
  return Buffer.from(await l.xlsx.writeBuffer());
}

describe("el valor de una celda", () => {
  it("una fecha sale en su día, sin correrse por la hora de Costa Rica", () => {
    expect(textoDeValor(new Date(Date.UTC(2026, 9, 28)))).toBe("28/10/2026");
    expect(textoDeValor(new Date(Date.UTC(2026, 9, 28, 14, 30)))).toBe("28/10/2026 14:30");
  });

  it("un porcentaje sale como se ve; un número, con coma y sin ruido", () => {
    expect(textoDeValor(0.5, "0%")).toBe("50 %");
    expect(textoDeValor(0.125, "0.00%")).toBe("12,5 %");
    expect(textoDeValor(0.1 + 0.2)).toBe("0,3");
    expect(textoDeValor(1200)).toBe("1200");
  });

  it("un teléfono o un identificador largo no se corrompe; un código conserva sus ceros; una hora es una hora", () => {
    expect(textoDeValor(710262195269)).toBe("710262195269");
    expect(textoDeValor(5068881234567)).toBe("5068881234567");
    expect(textoDeValor(12345, "00000000")).toBe("00012345");
    expect(textoDeValor(new Date(Date.UTC(1899, 11, 30, 10, 30)), "hh:mm")).toBe("10:30");
  });

  it("fórmulas, enlaces y texto con formato dicen lo que muestran; un error, nada", () => {
    expect(textoDeValor({ formula: "A1*2", result: 4 })).toBe("4");
    expect(textoDeValor({ text: "La guía", hyperlink: "https://x" })).toBe("La guía");
    expect(textoDeValor({ richText: [{ text: "Hola " }, { text: "equipo" }] })).toBe("Hola equipo");
    expect(textoDeValor({ error: "#REF!" })).toBe("");
    expect(textoDeValor(true)).toBe("Sí");
    expect(textoDeValor(null)).toBe("");
  });
});

describe("el libro", () => {
  it("lee las pestañas visibles; una combinada vale una vez y la fecha y el porcentaje se ven bien", async () => {
    const xlsx = await libro((l) => {
      const h = l.addWorksheet("Usuarios");
      h.mergeCells("A1:D1");
      h.getCell("A1").value = "TÍTULO";
      h.getCell("A2").value = new Date(Date.UTC(2026, 9, 28));
      h.getCell("B2").value = 0.5;
      h.getCell("B2").numFmt = "0%";
      l.addWorksheet("Oculta", { state: "hidden" }).getCell("A1").value = "secreto";
    });
    const pestanas = await pestanasDelXlsx(xlsx);
    expect(pestanas.map((p) => p.nombre)).toEqual(["Usuarios"]);
    expect(pestanas[0].celdas[0]).toEqual(["TÍTULO", "", "", ""]);
    expect(pestanas[0].celdas[1].slice(0, 2)).toEqual(["28/10/2026", "50 %"]);
  });

  it("con muchas filas vacías arriba o huecos en el medio no pierde nada en silencio", async () => {
    const xlsx = await libro((l) => {
      const h = l.addWorksheet("Larga");
      h.getCell("A8").value = "arriba";
      h.getCell("A400").value = "abajo";
    });
    const [p] = await pestanasDelXlsx(xlsx);
    expect(p.celdas).toHaveLength(400);
    // Pasa el tope de filas: tiene que decirlo.
    const guardada = pestanaDesdeCeldas(p.nombre, p.celdas)!;
    expect(guardada.filas[0][0]).toBe("arriba");
    expect(guardada.filas).toHaveLength(TOPE_DE_FILAS);
    expect(guardada.recortada).toBe(true);
  });

  it("lo guardado tiene tope total, y dice cuántas pestañas no entraron", () => {
    const fila = ["x".repeat(500)];
    const pestanas = Array.from({ length: 10 }, (_, i) => ({ nombre: `P${i}`, celdas: Array.from({ length: 300 }, () => fila) }));
    const b = briefDesdeLibro({ titulo: "G", url: "", pestanas }, { importadoEn: "", importadoPor: "x" });
    const total = b.pestanas.reduce((t, p) => t + p.filas.flat().join("").length, 0);
    expect(total).toBeLessThanOrEqual(TOPE_DEL_BRIEF);
    expect(b.pestanas[b.pestanas.length - 1].recortada).toBe(true);
    expect(b.pestanasSinTraer).toBeGreaterThan(0);
  });
});
