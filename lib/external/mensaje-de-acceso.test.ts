import { describe, expect, it } from "vitest";
import { linkDeLaParte, mensajeParaElCliente } from "./mensaje-de-acceso";

const urlBase = "https://nexus.smarteamcr.com/external/verify/abc";

describe("el mensaje para el cliente con su acceso", () => {
  it("lleva el link y lo publicado, y nunca la contraseña", () => {
    const m = mensajeParaElCliente({ proyecto: "CRM", urlBase, publicadas: new Set(["kickoff", "cronograma", "diagnostico"]) })!;
    expect(m).toContain(`«CRM»:\n${urlBase}\n`);
    expect(m).toContain("Ya puedes ver: Kickoff, Cronograma y Diagnóstico.");
    expect(m).toContain("te la mando por otro medio");
  });

  it("sin el kickoff publicado, el link lleva a la primera parte que sí lo está", () => {
    const m = mensajeParaElCliente({ proyecto: "CRM", urlBase, publicadas: new Set(["entrega"]) })!;
    expect(m).toContain(`${urlBase}?next=entrega`);
  });

  it("el requerimiento técnico no se nombra; sin nada publicado para el cliente no hay mensaje", () => {
    expect(mensajeParaElCliente({ proyecto: "CRM", urlBase, publicadas: new Set(["desarrollo"]) })).toBeNull();
    expect(mensajeParaElCliente({ proyecto: "CRM", urlBase, publicadas: new Set() })).toBeNull();
    expect(mensajeParaElCliente({ proyecto: "CRM", urlBase, publicadas: new Set(["desarrollo", "kickoff"]) })).not.toContain("Requerimiento");
  });

  it("el link de cada parte usa su `?next=` (el kickoff, el de siempre)", () => {
    expect(linkDeLaParte(urlBase, "kickoff")).toBe(urlBase);
    expect(linkDeLaParte(urlBase, "cronograma")).toBe(`${urlBase}?next=cronograma`);
  });
});
