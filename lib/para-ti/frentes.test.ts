import { describe, expect, it } from "vitest";
import {
  CLAVES_DE_FRENTE,
  FRENTES,
  FRENTES_ACTIVOS,
  FRENTES_POR_DEFECTO,
  frente,
  frentesDe,
  puedeLlevar,
  vistaFinanzasDeFrentes,
} from "./frentes";

describe("frentesDe: lo que lleva cada persona", () => {
  it("sin elegir, salen del rol", () => {
    expect(frentesDe({ roleEnum: "CSE" })).toEqual([]);
    expect(frentesDe({ roleEnum: "CSL" })).toEqual(["LIDERAR_CS", "DOCUMENTACION"]);
    expect(frentesDe({ roleEnum: "VENTAS" })).toEqual(["VENTAS"]);
    expect(frentesDe({ roleEnum: "ADMIN" })).toEqual(["FINANZAS_REGISTRAR"]);
    expect(frentesDe({ roleEnum: "MARKETING" })).toEqual(["MARKETING"]);
    expect(frentesDe({ roleEnum: "DEV" })).toEqual([]);
  });

  it("un Super Admin sin elegir hereda lo que ya decía su vista de Finanzas", () => {
    expect(frentesDe({ roleEnum: "SUPER_ADMIN", vistaFinanzas: null })).toEqual(["FINANZAS_SUPERVISAR", "FEEDBACK"]);
    expect(frentesDe({ roleEnum: "SUPER_ADMIN", vistaFinanzas: "DIRECCION" })).toEqual(["DIRECCION", "FEEDBACK"]);
  });

  it("el responsable fijo de la Escala la lleva por defecto", () => {
    expect(frentesDe({ roleEnum: "SUPER_ADMIN", vistaFinanzas: "DIRECCION", esResponsableDeLaEscala: true })).toEqual([
      "DIRECCION",
      "ESCALA",
      "FEEDBACK",
    ]);
  });

  it("elegidos a mano mandan, aunque la lista esté vacía (vacía = solo lo mío)", () => {
    const editados = new Date("2026-10-04T12:00:00Z");
    expect(frentesDe({ roleEnum: "CSL", frentes: [], frentesEditadosAt: editados })).toEqual([]);
    expect(
      frentesDe({ roleEnum: "SUPER_ADMIN", frentes: ["ESCALA", "DIRECCION", "SISTEMA"], frentesEditadosAt: editados }),
    ).toEqual(["DIRECCION", "ESCALA", "SISTEMA"]);
  });

  it("una clave que ya no existe se ignora", () => {
    expect(frentesDe({ roleEnum: "CSE", frentes: ["NO_EXISTE", "VENTAS"], frentesEditadosAt: new Date() })).toEqual(["VENTAS"]);
  });

  it("todo rol del enum tiene su default declarado", () => {
    for (const rol of ["CSE", "VENTAS", "CSL", "MARKETING", "DEV", "ADMIN", "SUPER_ADMIN"]) {
      expect(FRENTES_POR_DEFECTO[rol], rol).toBeDefined();
    }
  });
});

describe("la vista de Finanzas se desprende de los frentes", () => {
  it("un Super Admin con «Finanzas: supervisar» ve el panel completo; sin él, los reportes", () => {
    expect(vistaFinanzasDeFrentes("SUPER_ADMIN", ["FINANZAS_SUPERVISAR", "DIRECCION"])).toBeNull();
    expect(vistaFinanzasDeFrentes("SUPER_ADMIN", ["DIRECCION", "ESCALA"])).toBe("DIRECCION");
    expect(vistaFinanzasDeFrentes("SUPER_ADMIN", [])).toBe("DIRECCION");
  });
  it("para el resto no cuenta", () => {
    expect(vistaFinanzasDeFrentes("ADMIN", ["FINANZAS_SUPERVISAR"])).toBeNull();
  });
});

describe("puedeLlevar: un frente no da acceso, pero se avisa si no va a poder abrir lo que le llegue", () => {
  const acceso = (role: string, sections: Record<string, Record<string, boolean>> = {}, escala = false) => ({
    role,
    email: null,
    permissions: { sections },
    esResponsableDeLaEscala: escala,
  });

  it("liderar Customer Success pide CSL o Super Admin", () => {
    expect(puedeLlevar(frente("LIDERAR_CS"), acceso("CSL"))).toBe(true);
    expect(puedeLlevar(frente("LIDERAR_CS"), acceso("SUPER_ADMIN"))).toBe(true);
    expect(puedeLlevar(frente("LIDERAR_CS"), acceso("CSE", { clientes: { viewAll: true } }))).toBe(false);
  });

  it("los frentes de permiso miran la celda efectiva", () => {
    expect(puedeLlevar(frente("FINANZAS_REGISTRAR"), acceso("ADMIN", { cobranza: { read: true } }))).toBe(true);
    expect(puedeLlevar(frente("FINANZAS_REGISTRAR"), acceso("CSE"))).toBe(false);
    expect(puedeLlevar(frente("VENTAS"), acceso("VENTAS", { ventas: { read: true } }))).toBe(true);
  });

  it("la Escala se decide en Feedback: pide Super Admin (desde el 2026-10-05)", () => {
    expect(puedeLlevar(frente("ESCALA"), acceso("SUPER_ADMIN"))).toBe(true);
    expect(puedeLlevar(frente("ESCALA"), acceso("CSL", {}, true))).toBe(false);
  });

  it("Dirección no pide nada", () => {
    expect(puedeLlevar(frente("DIRECCION"), acceso("CSE"))).toBe(true);
  });
});

describe("el catálogo", () => {
  it("una clave, un frente, y todos con nombre y qué llega", () => {
    expect(new Set(FRENTES.map((f) => f.clave)).size).toBe(FRENTES.length);
    expect(FRENTES.map((f) => f.clave)).toEqual([...CLAVES_DE_FRENTE]);
    for (const f of FRENTES) {
      expect(f.nombre.trim(), f.clave).not.toBe("");
      expect(f.queLlega.trim(), f.clave).not.toBe("");
      if (f.requisito.tipo !== "ninguno") expect(f.requisitoTexto.trim(), f.clave).not.toBe("");
    }
  });

  it("⭐ Feedback se encendió con el módulo (2026-10-04): solo lo lleva Super Admin", () => {
    const f = FRENTES_ACTIVOS.find((x) => x.clave === "FEEDBACK");
    expect(f?.requisito).toEqual({ tipo: "roles", roles: ["SUPER_ADMIN"] });
  });

  it("tuteo en los textos que ve el equipo", () => {
    const voseo = /\b(tenés|podés|querés|sabés|elegí|revisá|mirá|hacé|tocá)\b/i;
    for (const f of FRENTES) expect(`${f.queLlega} ${f.requisitoTexto}`, f.clave).not.toMatch(voseo);
  });
});
