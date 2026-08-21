/**
 * lib/asistente/desenlace.test.ts — EL DESENLACE NOMBRA, NO CUENTA.
 *
 * Correr: `npx vitest run lib/asistente/desenlace.test.ts --project unit`.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────────────────────
 * El desenlace decía «Se aplicaron 3 de 5 cambios: el resto se descartó». Ese número deja dos
 * agujeros, y el segundo cuesta plata:
 *
 * 1. La PERSONA vuelve al hilo días después y no sabe qué eran esos dos.
 * 2. El MODELO lee el hilo. Con un conteo sabe que faltan dos y no cuáles, así que al proponer de
 *    nuevo elige entre repetir algo ya aplicado —y `tarea.crear` DUPLICA— o repetir algo que la
 *    persona descartó a propósito.
 */
import { describe, it, expect } from "vitest";
import { notaDeDescarte, LINEAS_NOMBRADAS } from "./desenlace";

const LINEAS = [
  "«Sales Hub» pasa de 4 a 2 semanas",
  "Se agrega «Revisión conjunta» a «Cierre y entrega», semana 1",
  "«Setup» se mueve al lugar 2",
  "Se elimina la fase «Piloto» (no tiene tareas)",
  "Se agrega «Capacitación» a «Adopción», semana 3",
];

describe("la nota de descarte", () => {
  it("sin descartes no dice nada", () => {
    /* Un desenlace limpio no tiene que arrastrar una frase vacía. */
    expect(notaDeDescarte(LINEAS, [])).toBe("");
  });

  it("⭐ NOMBRA lo que quedó afuera, con su número de la cajita", () => {
    /* ⚠ El número es el que la persona ACABA de leer: es lo que le permite decir «volvé a poner
       la 4» en el turno siguiente. La edición que la pone en rojo: emitir el conteo en vez de las
       líneas, o numerar desde 0. */
    const nota = notaDeDescarte(LINEAS, [3]);
    expect(nota).toContain("Se elimina la fase «Piloto»");
    expect(nota, "el número no coincide con el de la lista numerada que se leyó").toContain("4.");
    expect(nota).toContain("1 cambio");
  });

  it("⚠ con muchas, nombra las primeras y resume el resto", () => {
    /* Nombrarlas todas convierte un aviso en un párrafo, y el `detalle` del endpoint tiene tope
       (`max(2000)`). Se nombran las primeras y se dice cuántas faltan — nunca se callan. */
    const nota = notaDeDescarte(LINEAS, [0, 1, 2, 3, 4]);
    expect(nota).toContain("5 cambios");
    expect(nota).toContain("y 2 más");
    expect(nota).toContain(LINEAS[0]);
    expect(nota, "nombró más de las que declara nombrar").not.toContain(LINEAS[LINEAS_NOMBRADAS]);
  });

  it("⛔ un índice fuera de rango se ignora, no rompe ni inventa", () => {
    /* El conjunto viene del estado de la pantalla; un acuerdo recargado puede traer otra lista.
       Inventar un renglón sería peor que omitirlo. */
    expect(notaDeDescarte(LINEAS, [99, -1])).toBe("");
    const nota = notaDeDescarte(LINEAS, [1, 99]);
    expect(nota).toContain("1 cambio");
    expect(nota).toContain(LINEAS[1]);
  });

  it("⚠ salen en el orden de la lista, no en el del clic", () => {
    /* Se leen contra la cajita, que está numerada de arriba abajo. */
    const nota = notaDeDescarte(LINEAS, [2, 0]);
    expect(nota.indexOf("1.")).toBeLessThan(nota.indexOf("3."));
  });

  it("⛔ y no repite si el mismo índice viene dos veces", () => {
    expect(notaDeDescarte(LINEAS, [1, 1])).toContain("1 cambio");
  });

  it("⚠ recorta las líneas larguísimas en vez de pasarse del tope del endpoint", () => {
    /* `detalle` está validado en `z.string().max(2000)`: una nota que se pasa hace que el
       desenlace se rechace entero y el hilo quede sin constancia de lo que se aplicó. */
    const larga = ["x".repeat(400), ...LINEAS];
    const nota = notaDeDescarte(larga, [0, 1, 2]);
    expect(nota.length).toBeLessThan(600);
    expect(nota).toContain("…");
  });
});
