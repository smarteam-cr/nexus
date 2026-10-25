/**
 * lib/planificacion/plantilla-excel.ts — la plantilla de importación de un objeto, en Excel (2026-10-25).
 *
 * Por qué Excel y no CSV: un CSV separado por comas se abre en una sola columna en un Excel configurado para Costa Rica
 * (separa con punto y coma), y uno con punto y coma se rompe en el resto. Un .xlsx se abre bien en todos y HubSpot lo
 * importa tal cual. `exceljs` ya está en el proyecto (lo usa Cobranza) y se carga solo al hacer clic.
 *
 * Una hoja con los títulos en la primera fila, en negrita y fija al bajar, con el ancho de cada título.
 */
export async function plantillaExcel(columnas: readonly string[], hoja: string): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const libro = new ExcelJS.Workbook();
  const ws = libro.addWorksheet(hoja.slice(0, 31) || "Plantilla", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columnas.map((c) => ({ header: c, width: Math.min(Math.max(c.length + 4, 14), 40) }));
  ws.getRow(1).font = { bold: true };
  return (await libro.xlsx.writeBuffer()) as ArrayBuffer;
}
