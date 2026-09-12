import { describe, expect, it } from "vitest";
import { decidirAccion, type PaginaExistente } from "./accion";

const sembrada = (extra: Partial<PaginaExistente> = {}): PaginaExistente => ({
  version: 2,
  semillaVersion: 2,
  parentId: null,
  orden: 0,
  ...extra,
});

describe("decidirAccion", () => {
  it("una página que no existe se crea", () => {
    expect(decidirAccion(null, { parentId: null, orden: 0 }, false).accion).toBe("crear");
  });

  it("una página que nadie editó se actualiza, esté donde esté", () => {
    const d = decidirAccion(sembrada({ parentId: "otra" }), { parentId: null, orden: 3 }, false);
    expect(d).toEqual({ accion: "actualizar", editada: false });
  });

  it("⛔ una página editada que ya está en su lugar se saltea: su contenido es de quien la editó", () => {
    const d = decidirAccion(sembrada({ version: 12 }), { parentId: null, orden: 0 }, false);
    expect(d).toEqual({ accion: "saltar", editada: true });
  });

  it("una página editada en otro lugar se MUEVE, sin pisarla (el caso de la Guía de CSE)", () => {
    const d = decidirAccion(sembrada({ version: 12 }), { parentId: "customer-success", orden: 2 }, false);
    expect(d).toEqual({ accion: "mover", editada: true });
  });

  it("también se mueve si solo cambió el orden entre hermanas", () => {
    expect(decidirAccion(sembrada({ version: 5 }), { parentId: null, orden: 1 }, false).accion).toBe("mover");
  });

  it("⚠ en seco, con la madre por crear, no confunde «sin id todavía» con «está en la raíz»", () => {
    const d = decidirAccion(
      sembrada({ version: 12 }),
      { parentId: null, orden: 0, madrePendiente: true },
      false,
    );
    expect(d.accion).toBe("mover");
  });

  it("una página que creó una persona (sin semilla) cuenta como editada", () => {
    const d = decidirAccion(sembrada({ semillaVersion: null, version: 1 }), { parentId: null, orden: 0 }, false);
    expect(d).toEqual({ accion: "saltar", editada: true });
  });

  it("--forzar la actualiza igual y avisa que estaba editada (se guarda una versión antes)", () => {
    const d = decidirAccion(sembrada({ version: 12 }), { parentId: "x", orden: 0 }, true);
    expect(d).toEqual({ accion: "actualizar", editada: true });
  });
});
