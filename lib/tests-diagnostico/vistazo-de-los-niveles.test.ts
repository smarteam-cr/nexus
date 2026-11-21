/**
 * lib/tests-diagnostico/vistazo-de-los-niveles.test.ts — EL VISTAZO de cada nivel (21 nov): la tarjeta de cada nivel en la
 * escalera dice cómo se ve el área en ese nivel (`Area.panoramica`). Sale de UNA fuente (`nivelesConVistazo`) y se
 * completa en lo guardado antes (`completarVistazos`) sin pisar lo que ya trae ni mezclar áreas.
 */
import { describe, expect, it } from "vitest";
import type { Escala } from "@/lib/escala/documento/tipos";
import { completarVistazos, nivelesConVistazo } from "./resultado";

const escala = {
  niveles: [
    { letra: "D", codigo: 1, nombre: "Deficiente" },
    { letra: "I", codigo: 2, nombre: "Inicial" },
    { letra: "F", codigo: 3, nombre: "Funcional" },
  ],
  areas: [
    { id: "1", nombre: "Ventas", panoramica: { D: "  Ventas sin proceso.  ", F: "Ventas con proceso." } },
    { id: "2", nombre: "Marketing", panoramica: { D: "Marketing sin datos.", I: "Marketing con algo." } },
  ],
} as unknown as Escala;

describe("el vistazo de los niveles", () => {
  it("de la escala, el del área pedida; sin vistazo en un nivel, no lo inventa", () => {
    expect(nivelesConVistazo(escala, "1")).toEqual([
      { letra: "D", nombre: "Deficiente", vistazo: "Ventas sin proceso." },
      { letra: "I", nombre: "Inicial" },
      { letra: "F", nombre: "Funcional", vistazo: "Ventas con proceso." },
    ]);
    // Un área que no está: los niveles con su nombre y nada más.
    expect(nivelesConVistazo(escala, "9").every((n) => !("vistazo" in n))).toBe(true);
  });

  it("completa lo guardado sin vistazo, no pisa el que ya trae ni cambia los nombres", () => {
    const guardados = [
      { letra: "D" as const, nombre: "Deficiente", vistazo: "El de entonces." },
      { letra: "I" as const, nombre: "Inicial" },
      { letra: "F" as const, nombre: "Funcional (v8)" },
    ];
    expect(completarVistazos(guardados, nivelesConVistazo(escala, "1"))).toEqual([
      { letra: "D", nombre: "Deficiente", vistazo: "El de entonces." },
      { letra: "I", nombre: "Inicial" },
      { letra: "F", nombre: "Funcional (v8)", vistazo: "Ventas con proceso." },
    ]);
  });

  it("no trae el vistazo de otra área", () => {
    const deVentas = completarVistazos([{ letra: "I", nombre: "Inicial" }], nivelesConVistazo(escala, "1"));
    expect(deVentas[0].vistazo).toBeUndefined();
    expect(JSON.stringify(completarVistazos([{ letra: "D", nombre: "Deficiente" }], nivelesConVistazo(escala, "1")))).not.toContain("Marketing");
  });
});
