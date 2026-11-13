import { describe, expect, it } from "vitest";
import { claseDelTipo, clasificarCuenta, mapearCuentaOdoo, resumenDelCatalogo, type CuentaOdoo } from "./catalogo";

const cuenta = (codigo: string, tipo: string | null, extra: Partial<CuentaOdoo> = {}): CuentaOdoo => ({
  id: Number(codigo.slice(0, 6)) || 1,
  codigo,
  nombre: `Cuenta ${codigo}`,
  tipo,
  deprecada: false,
  conciliable: false,
  odooCompanyId: 1,
  ...extra,
});

describe("leer una cuenta de Odoo", () => {
  it("toma lo que trae y descarta la fila sin código", () => {
    expect(mapearCuentaOdoo({ id: 187, code: "110304", name: "Cuentas por Cobrar  Flywheel", account_type: "asset_current", deprecated: false, reconcile: true, company_id: [1, "CR"] })).toEqual({
      id: 187,
      codigo: "110304",
      nombre: "Cuentas por Cobrar Flywheel",
      tipo: "asset_current",
      deprecada: false,
      conciliable: true,
      odooCompanyId: 1,
    });
    expect(mapearCuentaOdoo({ id: 5, code: false })).toBeNull();
  });
});

describe("la clase sale del primer dígito del código (así se armó el catálogo nuevo)", () => {
  it("✓ las de seis dígitos que encajan no llevan aviso", () => {
    const c = clasificarCuenta(cuenta("110202", "asset_current"));
    expect(c.clase).toBe("ACTIVO");
    expect(c.claseSegun).toBe("codigo");
    expect(c.avisos).toEqual([]);
    expect(clasificarCuenta(cuenta("510101", "expense")).avisos).toEqual([]); // 5 = costo, Odoo lo tipa «gasto»
  });

  it("⚠ el código viejo (no de seis dígitos) se clasifica igual y avisa que falta fusionarla", () => {
    const c = clasificarCuenta(cuenta("61201019", "expense"));
    expect(c.clase).toBe("GASTO");
    expect(c.avisos).toEqual(["CODIGO_VIEJO"]);
  });

  it("⚠ medido: «410104 Comisiones Comerciales Dolares» es de tipo gasto con código de ingreso: manda el código", () => {
    const c = clasificarCuenta(cuenta("410104", "expense"));
    expect(c.clase).toBe("INGRESO");
    expect(c.avisos).toEqual(["CLASE_DISTINTA"]);
  });

  it("sin dígito que diga la clase, decide el tipo; sin ninguno de los dos, avisa", () => {
    expect(clasificarCuenta(cuenta("X-01", "liability_payable")).clase).toBe("PASIVO");
    const nada = clasificarCuenta(cuenta("900001", null));
    expect(nada.clase).toBeNull();
    expect(nada.avisos).toContain("SIN_CLASE");
  });

  it("los tipos de Odoo 17", () => {
    expect(claseDelTipo("asset_receivable")).toBe("ACTIVO");
    expect(claseDelTipo("liability_credit_card")).toBe("PASIVO");
    expect(claseDelTipo("equity_unaffected")).toBe("PATRIMONIO");
    expect(claseDelTipo("income_other")).toBe("INGRESO");
    expect(claseDelTipo("expense_direct_cost")).toBe("COSTO");
    expect(claseDelTipo("off_balance")).toBeNull();
  });
});

describe("el resumen del catálogo", () => {
  it("cuenta las vivas, las de código nuevo y las que tienen algo que revisar", () => {
    const r = resumenDelCatalogo(
      [cuenta("110101", "asset_cash"), cuenta("1103011", "asset_receivable"), cuenta("410104", "expense"), cuenta("650102", "expense", { deprecada: true })].map(clasificarCuenta),
    );
    expect(r.total).toBe(3);
    expect(r.conCodigoNuevo).toBe(2);
    expect(r.deprecadas).toBe(1);
    expect(r.conAviso.map((c) => c.codigo)).toEqual(["1103011", "410104"]);
    expect(r.porClase.find((p) => p.clase === "ACTIVO")?.n).toBe(2);
  });
});
