/**
 * lib/cobranza/libro-alex-xlsx.ts
 *
 * El único paso impuro de la lectura del libro de Alex: del .xlsx a celdas con su color y su marca de
 * fusión. Lo que significa cada celda lo decide libro-alex-lectura.ts, que es puro y tiene sus pruebas.
 *
 * Por qué exceljs y no el CSV del importador: el libro guarda en el COLOR si una factura está vencida
 * o en gracia, trae varias secciones por pestaña y celdas fusionadas. Un CSV pierde las tres cosas.
 *
 * ⚠ Sin `server-only`: lo prueba libro-alex-lectura.test.ts armando un libro en memoria. No toca la
 * base ni la red; solo lee los bytes que le pasan.
 */
import ExcelJS from "exceljs";
import type { CeldaLibro, FilaCrudaLibro, HojaCruda } from "./libro-alex-lectura";

/** El libro usa 11 columnas; más allá solo hay formato arrastrado. */
const MAX_COLUMNAS = 20;

/** `ArrayBuffer` y no `Buffer`: es lo que exceljs declara que lee (y lo que da `File.arrayBuffer()`). */
export async function hojasDelXlsx(datos: ArrayBuffer): Promise<HojaCruda[]> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(datos);

  return libro.worksheets.map((hoja) => {
    const filas: FilaCrudaLibro[] = [];
    hoja.eachRow({ includeEmpty: false }, (renglon, numero) => {
      const celdas: CeldaLibro[] = [];
      const ancho = Math.min(renglon.cellCount, MAX_COLUMNAS);
      for (let i = 1; i <= ancho; i++) {
        const cell = renglon.getCell(i);
        const fill = cell.fill;
        const fillArgb =
          fill && fill.type === "pattern" && fill.pattern !== "none" && fill.fgColor?.argb ? fill.fgColor.argb : null;
        /* exceljs repite el valor de la celda maestra en las demás de la fusión: se marcan para que la
           misma deuda no entre dos veces. */
        const fusionada = cell.isMerged && cell.master.address !== cell.address;
        celdas.push(fusionada ? { valor: cell.value, fillArgb, fusionada: true } : { valor: cell.value, fillArgb });
      }
      filas.push({ fila: numero, celdas });
    });
    /* Las pestañas del libro traen espacios al final («Generalidades »). */
    return { nombre: hoja.name.trim(), filas };
  });
}
