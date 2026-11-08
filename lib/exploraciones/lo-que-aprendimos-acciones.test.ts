/**
 * ⛔ Las acciones de «Lo que aprendimos» siguen a mano (revisión del 2026-11-08, al compactar la pieza en una línea por
 * sugerencia y «Ya usaste» en una frase). Si alguien quita «Usar», «Descartar» o «Revertir», o deja de mostrar lo que
 * «Usar» pisa antes de apretar, esta prueba se pone roja: la pieza se vería igual de limpia y no serviría para decidir.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "..", "..");
const leer = (...p: string[]) => fs.readFileSync(path.join(RAIZ, ...p), "utf8").replace(/\r\n/g, "\n");
const propuestas = leer("components", "exploraciones", "Propuestas.tsx");
const despues = leer("components", "exploraciones", "DespuesDeLaSesion.tsx");

/** El cuerpo de una función de nivel superior: desde su firma hasta el `}` de la columna 0. */
function cuerpo(fuente: string, firma: string): string {
  const inicio = fuente.indexOf(firma);
  expect(inicio, `no está ${firma}`).toBeGreaterThan(-1);
  const fin = fuente.indexOf("\n}\n", inicio);
  return fuente.slice(inicio, fin < 0 ? undefined : fin);
}

describe("⛔ «Lo que aprendimos» conserva sus acciones", () => {
  it("la pieza muestra cada sugerencia con la fila compacta y lo usado con su resumen", () => {
    const pieza = cuerpo(despues, "function LoQueAprendimos(");
    expect(pieza).toMatch(/<FilaCompacta key=\{it\.id\} item=\{it\}/);
    expect(pieza).toMatch(/<UsadasHoy filtro=\{deEsta\} sinPendientes=\{!items\.length\} grupo=\{grupo\} \/>/);
    expect(pieza, "«Usar todas» desapareció de la pieza").toMatch(/void usar\(items, \{ lugar: "sesion" \}\)/);
  });

  it("cada fila compacta tiene «Descartar» y «Usar», y nada las esconde detrás de abrir la fila", () => {
    const fila = cuerpo(propuestas, "export function FilaCompacta(");
    expect(fila, "«Descartar» desapareció de la fila").toMatch(/cambiar\(\[\{ op: "descartar", itemIds: \[item\.id\] \}\]\)[\s\S]*?Descartar/);
    expect(fila, "«Usar» desapareció de la fila").toMatch(/<BotonUsar [^>]*onClick=\{\(\) => void usar\(\[item\]\)\}/);
    const detalle = fila.slice(fila.indexOf("{abierta && ("));
    expect(detalle, "las acciones quedaron dentro de lo que se abre al tocar la fila").not.toMatch(/<BotonUsar|op: "descartar"/);
  });

  it("lo que «Usar» pisa se ve antes de apretar: el ⚠ en la fila y el aviso en el título del botón", () => {
    const fila = cuerpo(propuestas, "export function FilaCompacta(");
    const detalle = fila.indexOf("{abierta && (");
    const aviso = fila.indexOf("(q.pisa || q.aviso) && (");
    expect(aviso, "la fila dejó de marcar lo que «Usar» pisa").toBeGreaterThan(-1);
    expect(aviso, "el ⚠ quedó dentro de lo que se abre al tocar la fila").toBeLessThan(detalle);
    expect(fila).toMatch(/<BotonUsar [^>]*title=\{tituloDeUsar\(q\)\}/);
  });

  it("lo usado conserva «Revertir» en la lista que abre «Ver cuáles»", () => {
    const resumen = cuerpo(propuestas, "function ResumenDeLoUsado(");
    expect(resumen).toMatch(/Ver cuáles/);
    expect(resumen, "«Revertir» desapareció de la lista de lo usado").toMatch(/<RevertirUso u=\{u\} \/>/);
    const revertir = cuerpo(propuestas, "function RevertirUso(");
    expect(revertir).toMatch(/void deshacer\(\[u\.id\]\)[\s\S]*?Revertir/);
    expect(revertir, "ya no dice por qué no se puede revertir").toMatch(/Cambió después/);
  });
});
