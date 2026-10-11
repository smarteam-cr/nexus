/**
 * lib/sessions/agregar-sesion.test.ts — EL CUERPO DE LAS PUERTAS DE UN PROYECTO.
 *
 * `leerCuerpoDeVinculos` lo leen las tres puertas (handoff, cronograma y documentos). Desde la etapa 7 suma
 * `desestimar`: «Descartar» una reunión que Nexus sugirió para un documento (`false`, sin candado), distinto de
 * la X sobre una elegida (`null`). Lo que no puede pasar: elegir y desestimar a la vez, o que un valor raro se
 * lea como `true`.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("./project-sources", () => ({ adoptarSesionSinDuenio: vi.fn(), belongsToClient: vi.fn() }));

import { leerCuerpoDeVinculos } from "./agregar-sesion";

describe("leerCuerpoDeVinculos", () => {
  it("una reunión o varias, sin repetir; sin desestimar es false", () => {
    expect(leerCuerpoDeVinculos({ sessionId: " s1 ", feeds: false })).toEqual({
      ok: true,
      ids: ["s1"],
      feeds: false,
      sugeridas: new Set(),
      desestimar: false,
    });
    const varias = leerCuerpoDeVinculos({ sessionIds: ["s1", "s2", "s1"], feeds: true });
    expect(varias.ok && varias.ids).toEqual(["s1", "s2"]);
    expect(varias.ok && varias.desestimar).toBe(false);
  });

  it("«Descartar» una sugerencia: desestimar con feeds false", () => {
    const r = leerCuerpoDeVinculos({ sessionIds: ["s1"], feeds: false, desestimar: true });
    expect(r.ok && r.desestimar).toBe(true);
    expect(r.ok && r.feeds).toBe(false);
  });

  it("⛔ no se puede elegir y desestimar a la vez, ni mandar un desestimar raro", () => {
    expect(leerCuerpoDeVinculos({ sessionId: "s1", feeds: true, desestimar: true }).ok).toBe(false);
    expect(leerCuerpoDeVinculos({ sessionId: "s1", feeds: false, desestimar: "si" }).ok).toBe(false);
    expect(leerCuerpoDeVinculos({ sessionId: "s1", feeds: false, desestimar: false }).ok).toBe(true);
  });

  it("`sugeridas` solo al devolver, y solo las del mismo pedido", () => {
    const r = leerCuerpoDeVinculos({ sessionIds: ["s1", "s2"], feeds: true, sugeridas: ["s2", "otra"] });
    expect(r.ok && [...r.sugeridas]).toEqual(["s2"]);
    const quitar = leerCuerpoDeVinculos({ sessionIds: ["s1"], feeds: false, sugeridas: ["s1"] });
    expect(quitar.ok && quitar.sugeridas.size).toBe(0);
  });

  it("sin feeds o sin reuniones, error", () => {
    expect(leerCuerpoDeVinculos({ sessionId: "s1" }).ok).toBe(false);
    expect(leerCuerpoDeVinculos({ sessionIds: [], feeds: true }).ok).toBe(false);
    expect(leerCuerpoDeVinculos(null).ok).toBe(false);
  });
});
