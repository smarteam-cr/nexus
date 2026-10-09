import { describe, expect, it } from "vitest";
import {
  barraDeEleccion,
  datosConOrigen,
  fechaDeReunion,
  estadoDeLaReunion,
  listaQueDeshace,
  estadoDeLectura,
  estadoDesdeInsignia,
  textoDeDeshacer,
  textoDeQuitar,
} from "./lista-de-reuniones";

describe("barraDeEleccion — la fila de arriba", () => {
  it("sin nada elegido invita a elegir todas", () => {
    expect(barraDeEleccion(0, 4)).toEqual({ rotulo: "Elegir todas", casilla: "vacia", etiqueta: "Elegir todas" });
  });
  it("con algunas, dice cuántas de cuántas y la casilla queda a medias", () => {
    expect(barraDeEleccion(2, 4)).toEqual({ rotulo: "Elegiste 2 de 4", casilla: "parcial", etiqueta: "Elegir todas" });
  });
  it("con todas, las nombra y tocar la casilla las suelta", () => {
    expect(barraDeEleccion(4, 4)).toEqual({ rotulo: "Elegiste las 4", casilla: "llena", etiqueta: "No elegir ninguna" });
    expect(barraDeEleccion(1, 1).rotulo).toBe("Elegiste la única");
  });
  it("una lista vacía nunca dice que eligió algo", () => {
    expect(barraDeEleccion(3, 0).casilla).toBe("vacia");
  });
});

describe("los textos que dependen de la cuenta", () => {
  it("quitar", () => {
    expect(textoDeQuitar(1)).toBe("Quitar la reunión");
    expect(textoDeQuitar(2)).toBe("Quitar las 2");
  });
  it("deshacer", () => {
    expect(textoDeDeshacer(1)).toBe("Quitaste 1 reunión.");
    expect(textoDeDeshacer(5)).toBe("Quitaste 5 reuniones.");
  });
});

describe("los estados como punto + texto", () => {
  it("lo que pide atención va en ámbar; una futura gana a la falta de transcripción", () => {
    expect(estadoDeLaReunion({ sinTranscripcion: true })).toEqual({ texto: "Sin transcripción", tono: "atencion" });
    expect(estadoDeLaReunion({ futura: true, sinTranscripcion: true })).toEqual({ texto: "Aún no ocurrió", tono: "atencion" });
    expect(estadoDeLaReunion({})).toBeNull();
  });
  it("la insignia del material: verde, ámbar o neutra, con el detalle para el title", () => {
    expect(estadoDesdeInsignia({ label: "Completa", tone: "green" })).toEqual({ texto: "Completa", tono: "bien" });
    expect(estadoDesdeInsignia({ label: "Recortada", tone: "amber", detalle: "la IA lee 3 200 de 7 100 caracteres" })).toEqual({
      texto: "Recortada",
      tono: "atencion",
      detalle: "la IA lee 3 200 de 7 100 caracteres",
    });
    expect(estadoDesdeInsignia({ label: "Sin datos", tone: "muted" })?.tono).toBe("neutro");
    expect(estadoDesdeInsignia(null)).toBeNull();
  });
  it("la lectura de la preventa: «Sin leer» con punto ámbar, «Leída» sin punto", () => {
    expect(estadoDeLectura(false)).toEqual({ texto: "Sin leer", tono: "atencion" });
    expect(estadoDeLectura(true)).toEqual({ texto: "Leída", tono: "sinPunto" });
  });
});

describe("la fecha de la línea de datos", () => {
  const AHORA = new Date("2026-10-09T18:00:00Z");
  it("en la hora de Costa Rica: las 11 de la noche del 8 son del 8, no del 9", () => {
    expect(fechaDeReunion("2026-10-09T05:00:00Z", AHORA)).toBe("8 oct");
  });
  it("de otro año, con el año; ilegible, vacía", () => {
    expect(fechaDeReunion("2025-03-10T18:00:00Z", AHORA)).toBe("10 mar 2025");
    expect(fechaDeReunion("no-es-fecha", AHORA)).toBe("");
  });
  it("con el origen adelante, donde el origen varía", () => {
    expect(datosConOrigen("HubSpot", "2026-09-28T18:00:00Z", AHORA)).toBe("HubSpot · 28 sept");
    expect(datosConOrigen("", "2026-09-28T18:00:00Z", AHORA)).toBe("28 sept");
  });
});

describe("listaQueDeshace — Ctrl+Z deshace lo último que hiciste", () => {
  const lista = (ultimaQuita: number, visible = true) => ({ ultimaQuita, visible });
  const nada = { ultimaDelGlobal: 0, elGlobalAtiende: true, enSuperficieConDeshacerPropio: false };
  it("con dos listas, la del paso más reciente", () => {
    expect(listaQueDeshace([lista(300), lista(200)], nada)).toBe(0);
    expect(listaQueDeshace([lista(100), lista(200)], nada)).toBe(1);
  });
  it("una lista oculta (el bloque plegado, otra pestaña) no cuenta", () => {
    expect(listaQueDeshace([lista(300, false), lista(200)], nada)).toBe(1);
    expect(listaQueDeshace([lista(300, false)], nada)).toBe(-1);
  });
  it("sin nada que deshacer, no la atiende ninguna (la tecla sigue al global)", () => {
    expect(listaQueDeshace([lista(0), lista(0)], nada)).toBe(-1);
    expect(listaQueDeshace([], { ...nada, ultimaDelGlobal: 500 })).toBe(-1);
  });
  it("si lo último fue otra cosa de la pantalla (el global), la tecla es del global", () => {
    expect(listaQueDeshace([lista(200)], { ...nada, ultimaDelGlobal: 250 })).toBe(-1);
    expect(listaQueDeshace([lista(300)], { ...nada, ultimaDelGlobal: 250 })).toBe(0);
  });
  it("con una casilla enfocada el global no atiende: la lista no le cede la tecla (se perdería)", () => {
    expect(listaQueDeshace([lista(200)], { ...nada, ultimaDelGlobal: 250, elGlobalAtiende: false })).toBe(0);
  });
  it("trabajando en el diagrama (deshacer propio), la tecla es del diagrama", () => {
    expect(listaQueDeshace([lista(300)], { ...nada, enSuperficieConDeshacerPropio: true })).toBe(-1);
  });
});
