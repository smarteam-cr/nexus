/**
 * lib/documents/extract-text.test.ts — un PDF con texto sale con su texto. Antes del 2026-11-17 la llamada
 * usaba la API v1 de pdf-parse (`default`), que la v2 instalada ya no tiene: tiraba TypeError, el catch
 * devolvía null y TODO PDF subido quedaba como «¿es un PDF escaneado?». Si pdf-parse vuelve a cambiar
 * su API, la primera prueba se pone en rojo.
 * Correr: `npx vitest run lib/documents/extract-text.test.ts --project unit`.
 */
import { describe, expect, it, vi } from "vitest";
import { extractText, MAX_EXTRACTED_CHARS, MAX_PDF_PAGES, MAX_PDF_PAGES_COMPLETO } from "./extract-text";

/** Un PDF mínimo y válido (Helvetica, una línea por página) armado a mano: sin binarios en el repo. */
function pdfDePrueba(paginas: string[]): Buffer {
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${paginas.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${paginas.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  paginas.forEach((texto, i) => {
    const contenido = `BT /F1 12 Tf 72 720 Td (${texto.replace(/[\\()]/g, (c) => "\\" + c)}) Tj ET`;
    objetos.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(contenido, "latin1")} >>\nstream\n${contenido}\nendstream`,
    );
  });
  let pdf = "%PDF-1.4\n";
  const posiciones = objetos.map((objeto, i) => {
    const posicion = Buffer.byteLength(pdf, "latin1");
    pdf += `${i + 1} 0 obj\n${objeto}\nendobj\n`;
    return posicion;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  pdf += posiciones.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

describe("extractText — PDF", () => {
  it("saca el texto de un PDF con texto, sin los separadores de página de pdf-parse", async () => {
    const texto = await extractText(pdfDePrueba(["Hola desde la primera pagina", "Y esta es la segunda"]), "application/pdf");
    expect(texto).toContain("Hola desde la primera pagina");
    expect(texto).toContain("Y esta es la segunda");
    expect(texto).not.toMatch(/-- \d+ of \d+ --/);
  });

  // Contrato, no detalle: hoy pdf.js copia el Buffer que recibe; si una versión dejara de hacerlo y se lo
  // quedara (o lo desconectara), quien llama guardaría un archivo vacío en storage.
  it("no le desconecta el buffer a quien llama (lo sigue usando para guardar el archivo)", async () => {
    const buffer = pdfDePrueba(["Un PDF que despues se sube a storage"]);
    const largo = buffer.length;
    await extractText(buffer, "application/pdf");
    expect(buffer.length).toBe(largo);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("respeta el tope de caracteres", async () => {
    const texto = await extractText(pdfDePrueba(["Una linea bastante larga de texto de prueba"]), "application/pdf", 12);
    expect(texto).toHaveLength(12);
  });

  it(`lee ${MAX_PDF_PAGES} páginas por defecto y hasta ${MAX_PDF_PAGES_COMPLETO} cuando quien llama pide más que el tope normal`, async () => {
    const pagina = (n: number) => `Pagina numero ${n} de la transcripcion`;
    const pdf = pdfDePrueba(Array.from({ length: MAX_PDF_PAGES_COMPLETO + 2 }, (_, i) => pagina(i + 1)));

    const normal = await extractText(pdf, "application/pdf");
    expect(normal).toContain(pagina(MAX_PDF_PAGES));
    expect(normal).not.toContain(pagina(MAX_PDF_PAGES + 1));

    // Más páginas, pero con techo: un PDF de miles de páginas congelaría el servidor (pdf.js corre en su hilo).
    const largo = await extractText(pdf, "application/pdf", MAX_EXTRACTED_CHARS * 10);
    expect(largo).toContain(pagina(MAX_PDF_PAGES + 1));
    expect(largo).toContain(pagina(MAX_PDF_PAGES_COMPLETO));
    expect(largo).not.toContain(pagina(MAX_PDF_PAGES_COMPLETO + 1));
  });

  it("un PDF sin texto (escaneado) o roto devuelve null, sin tirar, y el roto deja rastro en el log", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await extractText(pdfDePrueba([""]), "application/pdf")).toBeNull();
      expect(await extractText(Buffer.from("esto no es un pdf"), "application/pdf")).toBeNull();
      expect(aviso.mock.calls.some(([m]) => String(m).startsWith("[extractText] falló la extracción (application/pdf, 17 bytes)"))).toBe(true);
    } finally {
      aviso.mockRestore();
    }
  });
});
