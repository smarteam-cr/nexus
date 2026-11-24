/**
 * lib/kickoff/franjas.test.ts — una franja vacía no se arrastra y ninguna sesión muestra «—»
 * (reporte de Juan Carlos Armijos, 24 nov).
 */
import { describe, it, expect } from "vitest";
import { asignacionAlSoltar, franjaDeLaSesion, franjasLibres, tieneTexto, PISTA_DE_FRANJA } from "./franjas";

const horarios = {
  options: [
    { id: "f1", label: "Martes 11:00" },
    { id: "f2", label: "" },
    { id: "f3", label: "   " },
    { id: "f4", label: "Jueves 15:00" },
  ],
  sessions: [
    { id: "s1", label: "Service Hub", optionId: "f2" }, // lo de la captura: una franja vacía asignada
    { id: "s2", label: "Sales Hub", optionId: null },
    { id: "s3", label: "Marketing Hub", optionId: "f4" },
    { id: "s4", label: "CMS", optionId: "borrada" },
  ],
};

describe("una franja vacía no se arrastra", () => {
  it("soltar una franja vacía en una sesión no asigna nada", () => {
    expect(asignacionAlSoltar(horarios, "opt:f2", "sess:s2")).toBeNull();
    expect(asignacionAlSoltar(horarios, "opt:f3", "sess:s2")).toBeNull(); // solo espacios también es vacía
  });

  it("soltar una franja con texto sí asigna", () => {
    expect(asignacionAlSoltar(horarios, "opt:f1", "sess:s2")).toEqual({ sessionId: "s2", optionId: "f1" });
  });

  it("fuera de una sesión, o algo que no es una franja, no asigna", () => {
    expect(asignacionAlSoltar(horarios, "opt:f1", null)).toBeNull();
    expect(asignacionAlSoltar(horarios, "opt:f1", "opt:f4")).toBeNull();
    expect(asignacionAlSoltar(horarios, "sess:s1", "sess:s2")).toBeNull();
  });

  it("una franja o una sesión que ya no existen no asignan", () => {
    expect(asignacionAlSoltar(horarios, "opt:nada", "sess:s2")).toBeNull();
    expect(asignacionAlSoltar(horarios, "opt:f1", "sess:nada")).toBeNull();
  });
});

describe("ninguna sesión muestra «—»", () => {
  const cse = { paraElCliente: false };
  const cliente = { paraElCliente: true };

  it("el CSE ve una franja vacía ya asignada (datos de antes) como «sin texto», para soltarla", () => {
    expect(franjaDeLaSesion(horarios, horarios.sessions[0], cse)).toEqual({ tipo: "sin-texto" });
  });

  it("⛔ el cliente nunca recibe «sin texto»: para él esa sesión no tiene franja", () => {
    /* Si esto se invierte, el cliente ve en su enlace «Franja sin texto» con una × que le quita la
       franja a su sesión. */
    expect(franjaDeLaSesion(horarios, horarios.sessions[0], cliente)).toBeNull();
    for (const s of horarios.sessions) {
      expect(franjaDeLaSesion(horarios, s, cliente)?.tipo).not.toBe("sin-texto");
    }
  });

  it("una sesión con franja con texto la muestra, al CSE y al cliente", () => {
    const esperada = { tipo: "franja", franja: { id: "f4", label: "Jueves 15:00" } };
    expect(franjaDeLaSesion(horarios, horarios.sessions[2], cse)).toEqual(esperada);
    expect(franjaDeLaSesion(horarios, horarios.sessions[2], cliente)).toEqual(esperada);
  });

  it("sin franja, o con una franja borrada, no muestra nada", () => {
    expect(franjaDeLaSesion(horarios, horarios.sessions[1], cse)).toBeNull();
    expect(franjaDeLaSesion(horarios, horarios.sessions[3], cse)).toBeNull();
  });
});

describe("las franjas que se ofrecen", () => {
  it("el CSE ve las libres, también las vacías que todavía tiene que escribir", () => {
    expect(franjasLibres(horarios, { soloConTexto: false }).map((o) => o.id)).toEqual(["f1", "f3"]);
  });

  it("el cliente solo ve las libres con texto", () => {
    expect(franjasLibres(horarios, { soloConTexto: true }).map((o) => o.id)).toEqual(["f1"]);
  });
});

describe("el texto de ayuda", () => {
  it("es una instrucción, no un horario que se lea como valor", () => {
    expect(PISTA_DE_FRANJA).not.toMatch(/\d/);
    expect(tieneTexto(PISTA_DE_FRANJA)).toBe(true);
  });
});
