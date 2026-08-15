/**
 * lib/ui/cronograma-cliente.test.ts — cómo se le muestra el cronograma AL CLIENTE.
 *
 * `components/canvas/TimelineSection.tsx` es la única superficie del cronograma que sale de
 * Nexus: la ve el cliente por su enlace (`components/external/TimelineLanding.tsx`), viaja
 * dentro del kickoff publicado y se imprime en el PDF. Sus reglas de presentación no son
 * gusto: son lo que el cliente entiende o no entiende de su propio proyecto.
 *
 * Las dos que fija este archivo salieron de mirar el documento real (Elías, 2026-08-14).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(__dirname, "..", "..");
const src = fs.readFileSync(
  path.join(RAIZ, "components", "canvas", "TimelineSection.tsx"),
  "utf8",
);

/** El nombre de la fase: el `<span>` que renderiza `{p.name}`. */
const lineaDelNombre = src.split("\n").find((l) => l.includes("{p.name}")) ?? "";

describe("el nombre de la fase no se recorta", () => {
  it("existe la línea que lo pinta", () => {
    expect(lineaDelNombre, "¿se movió el render de `p.name`?").not.toBe("");
  });

  it("⚠ nada de `nowrap` + ellipsis: si no entra a lo ancho, entra a lo alto", () => {
    /* Era `whiteSpace: nowrap` + `textOverflow: ellipsis`, y en pantallas más angostas que la
       de quien lo diseñó el cliente leía «Audit…» y «Sem…» — que no dicen NADA sobre qué se
       hizo esa semana. Y el modo de falla es cruel: quien lo escribió lo ve bien, así que el
       reporte llega de rebote («alguien me lo pasó y se veía cortado»).

       Recortar por píxeles obliga a adivinar el ancho de la pantalla ajena. Envolver funciona
       en todas, y en un documento que se comparte eso no es un detalle. */
    expect(lineaDelNombre).not.toContain("nowrap");
    expect(lineaDelNombre).not.toContain("textOverflow");
    expect(lineaDelNombre, "sin `overflowWrap` un nombre largo desborda la columna").toContain(
      "overflowWrap",
    );
  });
});

describe("el estado es un círculo a la izquierda, no una etiqueta «hecho»", () => {
  it("⚠ no volvió el chip de estado", () => {
    /* En un cronograma donde casi todo está hecho, repetir «HECHO» en cada renglón obliga a
       leer hasta el final de cada línea para saber si falta algo. Un círculo en columna fija
       se escanea de un vistazo: lo pendiente salta porque es lo único gris.
       ⚠ Si esto se pone rojo, mirá también el Gantt interno: la gracia es que se vean IGUAL. */
    expect(src, "volvió una tabla de chips de estado").not.toMatch(/STATUS_META_LIGHT/);
    expect(src).toContain("EstadoCirculo");
  });

  it("distingue hecha / en curso / aparcada / pendiente", () => {
    // Binario perdía «en curso»: una tarea atrasada que YA se está trabajando se veía igual
    // que una que nadie tocó. Es el mismo criterio del círculo del Gantt interno.
    for (const estado of ["DONE", "IN_PROGRESS", "SUSPENDED", "PENDING"]) {
      expect(src, `el estado ${estado} no está contemplado`).toContain(estado);
    }
  });

  it("«atrasada» sigue siendo su propio chip, fuera del círculo", () => {
    /* Es ORTOGONAL al estado: una tarea en curso puede estar atrasada. Meterla dentro del
       círculo obligaría a elegir cuál de las dos cosas mostrar, y se perdería una. */
    expect(src).toContain("OVERDUE_META_LIGHT");
  });

  it("el círculo tiene texto para lectores de pantalla", () => {
    // El SVG es `aria-hidden`; si nadie dice «Hecha», el estado desaparece para quien no ve.
    expect(src).toContain("ESTADO_TEXTO");
    expect(src).toContain("SR_ONLY");
  });
});
