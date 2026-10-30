/**
 * lib/planificacion/brief-xlsx.ts — las pestañas de un .xlsx como las ve quien abre la hoja (2026-10-29).
 *
 * `cell.text` de exceljs no sirve para esto: una fecha sale en inglés y un día antes (la imprime en la hora local del
 * servidor), un 50 % sale «0.5», y un título combinado se repite en cada columna que ocupa, gastando el tope. Se lee el
 * valor y el formato. Sin red ni base: recibe el archivo, así se prueba con un libro de verdad.
 */
export interface PestanaCruda {
  nombre: string;
  celdas: string[][];
}

const dos = (n: number) => String(n).padStart(2, "0");

/** Un número sin el ruido del punto flotante (0.1 * 3), con coma decimal. Un entero no se toca: puede ser un teléfono. */
function numero(n: number): string {
  return (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(6)))).replace(".", ",");
}

/** El texto de un valor de exceljs con su formato. Puro. */
export function textoDeValor(v: unknown, formato?: string): string {
  if (v == null) return "";
  if (v instanceof Date) {
    // Una celda de solo hora (un horario de atención) llega como fecha de 1899.
    if (v.getUTCFullYear() < 1901) return `${dos(v.getUTCHours())}:${dos(v.getUTCMinutes())}`;
    // exceljs guarda el día de la hoja en UTC: leerlo en hora local lo corre un día en Costa Rica.
    const fecha = `${dos(v.getUTCDate())}/${dos(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`;
    return v.getUTCHours() || v.getUTCMinutes() ? `${fecha} ${dos(v.getUTCHours())}:${dos(v.getUTCMinutes())}` : fecha;
  }
  if (typeof v === "number") {
    if (formato?.includes("%")) return `${numero(v * 100)} %`;
    // Un código con formato de ceros (00012345) conserva sus ceros.
    if (formato && /^0+$/.test(formato)) return numero(v).padStart(formato.length, "0");
    return numero(v);
  }
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as { richText?: Array<{ text?: unknown }>; text?: unknown; result?: unknown; formula?: unknown; error?: unknown };
    if (Array.isArray(o.richText)) return o.richText.map((t) => (typeof t?.text === "string" ? t.text : "")).join("");
    if (o.text !== undefined) return textoDeValor(o.text, formato);
    if (o.error !== undefined) return "";
    if ("result" in o || "formula" in o) return textoDeValor(o.result, formato);
  }
  return "";
}

/** Las pestañas visibles del libro: cada fila en su lugar (las vacías también, las recorta `pestanaDesdeCeldas`). */
export async function pestanasDelXlsx(xlsx: Buffer | ArrayBuffer): Promise<PestanaCruda[]> {
  const ExcelJS = (await import("exceljs")).default;
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(xlsx as unknown as ArrayBuffer);
  return libro.worksheets
    .filter((h) => h.state !== "hidden" && h.state !== "veryHidden")
    .map((hoja) => {
      const porFila = new Map<number, string[]>();
      let ultima = 0;
      hoja.eachRow({ includeEmpty: false }, (renglon, n) => {
        const fila: string[] = [];
        renglon.eachCell({ includeEmpty: true }, (celda, c) => {
          // Una celda combinada vale una vez: la de arriba a la izquierda.
          const repetida = celda.isMerged && celda.master.address !== celda.address;
          fila[c - 1] = repetida ? "" : textoDeValor(celda.value, celda.numFmt);
        });
        porFila.set(n, Array.from(fila, (x) => x ?? ""));
        ultima = n;
      });
      return { nombre: hoja.name, celdas: Array.from({ length: ultima }, (_, i) => porFila.get(i + 1) ?? []) };
    });
}
