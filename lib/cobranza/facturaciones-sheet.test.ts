import { describe, it, expect } from "vitest";
import {
  colorDeCelda,
  columnasDeQuincena,
  fechaQuincena,
  parseNombreServicio,
  esFilaDeServicio,
  extraerServicio,
  huellaServicio,
  claveServicio,
  COLOR_PAGADO,
  COLOR_FACTURADO,
  type CeldaCruda,
  type HojaConfig,
} from "./facturaciones-sheet";

const CFG: HojaConfig = {
  hoja: "Implementaciones CR",
  tipoServicio: "IMPLEMENTACION",
  modalidad: "PROYECTO",
  tipoCuenta: "NACIONAL",
};

/**
 * Header real del documento: fechas con año basura (2022/2025) + columnas de IVA.
 * Febrero va como TEXTO "Febrero 30" porque el 30 de febrero no existe como fecha
 * — es exactamente por eso que el documento tiene ese encabezado roto.
 */
function header(): CeldaCruda[] {
  const c: CeldaCruda[] = [{ valor: "", fillArgb: null }];
  for (let m = 0; m < 12; m++) {
    c.push({ valor: new Date(Date.UTC(2025, m, 15)), fillArgb: null });
    c.push(m === 1 ? { valor: "Febrero 30", fillArgb: null } : { valor: new Date(Date.UTC(2022, m, 30)), fillArgb: null });
    c.push({ valor: "IVA", fillArgb: null });
  }
  c.push({ valor: "Notas al Contrato", fillArgb: null });
  return c;
}

function fila(nombre: string, puestos: Record<number, [number, string | null]>): CeldaCruda[] {
  const c: CeldaCruda[] = Array.from({ length: 38 }, () => ({ valor: null, fillArgb: null }));
  c[0] = { valor: nombre, fillArgb: null };
  for (const [col, [monto, argb]] of Object.entries(puestos)) {
    c[Number(col) - 1] = { valor: monto, fillArgb: argb };
  }
  return c;
}

describe("colorDeCelda", () => {
  it("mapea los tres colores del documento", () => {
    expect(colorDeCelda(COLOR_PAGADO)).toBe("PAGADO");
    expect(colorDeCelda(COLOR_FACTURADO)).toBe("FACTURADO");
    expect(colorDeCelda(null)).toBe("PENDIENTE");
  });

  it("trata el blanco explícito como sin color (no es un tercer estado)", () => {
    expect(colorDeCelda("FFFFFFFF")).toBe("PENDIENTE");
  });

  it("un color desconocido cae a PENDIENTE, nunca a cobrado", () => {
    expect(colorDeCelda("FF00FF00")).toBe("PENDIENTE");
  });
});

describe("columnasDeQuincena", () => {
  it("deriva 24 quincenas del header y descarta IVA/notas", () => {
    const cols = columnasDeQuincena(header());
    expect(cols).toHaveLength(24);
    expect(cols[0]).toEqual({ col: 2, mes0: 0, dia: 15 });
    expect(cols[1]).toEqual({ col: 3, mes0: 0, dia: 30 });
    expect(cols[23]).toEqual({ col: 36, mes0: 11, dia: 30 });
  });

  it("ignora el año basura del encabezado", () => {
    const cols = columnasDeQuincena(header());
    // El header trae 2025 y 2022 mezclados; solo importan mes y día.
    expect(new Set(cols.map((c) => c.mes0)).size).toBe(12);
  });

  it('acepta el encabezado roto "Febrero 30" como texto', () => {
    const h: CeldaCruda[] = [{ valor: "", fillArgb: null }, { valor: "Febrero 30", fillArgb: null }];
    expect(columnasDeQuincena(h)).toEqual([{ col: 2, mes0: 1, dia: 30 }]);
  });

  it("descarta fechas que no son quincena 15 ni 30", () => {
    const h: CeldaCruda[] = [{ valor: "", fillArgb: null }, { valor: new Date(Date.UTC(2025, 0, 7)), fillArgb: null }];
    expect(columnasDeQuincena(h)).toEqual([]);
  });
});

describe("fechaQuincena", () => {
  it("clampea el día 30 al largo del mes (Febrero 30 no existe)", () => {
    expect(fechaQuincena(2026, 1, 30).toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("respeta el día 15 y usa UTC", () => {
    expect(fechaQuincena(2026, 0, 15).toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });
});

describe("parseNombreServicio", () => {
  it('parte por " I " y se queda con el cliente a la izquierda', () => {
    expect(parseNombreServicio("Transportes Juanva I Marca")).toEqual({
      cliente: "Transportes Juanva",
      detalle: "Marca",
    });
  });

  it("trata el país igual que el servicio: el cliente siempre es la izquierda", () => {
    expect(parseNombreServicio("Visual Branding I El Salvador").cliente).toBe("Visual Branding");
    expect(parseNombreServicio("Alfa I Nicaragua").cliente).toBe("Alfa");
  });

  it("normaliza espacios dobles del documento", () => {
    expect(parseNombreServicio("AMC  I Hub & SAP")).toEqual({ cliente: "AMC", detalle: "Hub & SAP" });
  });

  it("quita el nombre de la hoja repetido al final del cliente", () => {
    expect(parseNombreServicio("Selectrica Continuidad Web", "Continuidad Web").cliente).toBe("Selectrica");
  });

  it("sin separador deja el nombre entero y detalle null", () => {
    expect(parseNombreServicio("Corrugando")).toEqual({ cliente: "Corrugando", detalle: null });
  });
});

describe("esFilaDeServicio", () => {
  it("descarta las filas de encabezado y totales del documento", () => {
    for (const n of ["Cobrar", "$", "Total", "IVA", " "]) {
      expect(esFilaDeServicio(n)).toBe(false);
    }
  });

  it("acepta un cliente real", () => {
    expect(esFilaDeServicio("Corrugando")).toBe(true);
  });
});

describe("extraerServicio", () => {
  const cols = columnasDeQuincena(header());

  it("extrae la fila real de Corrugando: 6 cobros pagados, orden cronológico", () => {
    const f = fila("Corrugando", {
      2: [2493, COLOR_PAGADO], // ene 15
      5: [2100, COLOR_PAGADO], // feb 15
      8: [2100, COLOR_PAGADO], // mar 15
      11: [2100, COLOR_PAGADO], // abr 15
      14: [2100, COLOR_PAGADO], // may 15
      17: [2100, COLOR_PAGADO], // jun 15
    });
    const s = extraerServicio({ fila: 3, celdas: f }, cols, CFG)!;
    expect(s.cobros).toHaveLength(6);
    expect(s.cobros.map((c) => c.orden)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(s.cobros[0].periodo).toBe("2026-01");
    expect(s.cobros[0].fecha.toISOString().slice(0, 10)).toBe("2026-01-15");
    expect(s.cobros.every((c) => c.estado === "COBRADO")).toBe(true);
    expect(s.montoTotal).toBe(12993);
    expect(s.montoUniforme).toBeNull(); // la primera cuota es distinta
    expect(s.diaAncla).toBe(15);
  });

  it("mapea los tres colores a sus estados", () => {
    const f = fila("CICADEX", {
      8: [1366.66, COLOR_PAGADO],
      11: [1366.66, COLOR_FACTURADO],
      14: [1366.66, null],
    });
    const s = extraerServicio({ fila: 9, celdas: f }, cols, CFG)!;
    expect(s.cobros.map((c) => c.estado)).toEqual(["COBRADO", "POR_COBRAR", "PROGRAMADO"]);
  });

  it("NO convierte las columnas de IVA en cobros (llegan como fórmula sobre otra celda)", () => {
    const f = fila("Acccsa", { 2: [712, COLOR_PAGADO] });
    f[3] = { valor: { formula: "B3*0.13", result: 92.56 }, fillArgb: null }; // columna 4 = IVA
    const s = extraerServicio({ fila: 4, celdas: f }, cols, CFG)!;
    expect(s.cobros).toHaveLength(1);
    expect(s.montoTotal).toBe(712);
  });

  it("SÍ toma las fórmulas de aritmética literal — son cobros reales del documento", () => {
    // Casos reales: Kaizen Kapital "=7167*3", Bluesat Welcome kit "=1500/6",
    // MSC Payroll "=8400/5". Descartarlas hacía desaparecer clientes enteros.
    const f = fila("Kaizen Kapital", {});
    f[1] = { valor: { formula: "7167*3", result: 21501 }, fillArgb: COLOR_FACTURADO };
    f[4] = { valor: { formula: "1500/6", result: 250 }, fillArgb: null };
    const s = extraerServicio({ fila: 3, celdas: f }, cols, CFG)!;
    expect(s.cobros.map((c) => c.monto)).toEqual([21501, 250]);
    expect(s.cobros[0].estado).toBe("POR_COBRAR");
  });

  it("descarta las fórmulas agregadas aunque la fila no se llame Total", () => {
    const f = fila("Sospechosa", {});
    f[1] = { valor: { formula: "SUM(B3:B8)", result: 26373 }, fillArgb: null };
    expect(extraerServicio({ fila: 11, celdas: f }, cols, CFG)).toBeNull();
  });

  it("detecta el monto uniforme de las recurrentes", () => {
    const f = fila("IIA", { 3: [60, COLOR_PAGADO], 6: [60, COLOR_PAGADO], 9: [60, null] });
    const s = extraerServicio({ fila: 5, celdas: f }, cols, CFG)!;
    expect(s.montoUniforme).toBe(60);
    expect(s.diaAncla).toBe(30);
  });

  it("devuelve null para una fila sin montos (cero fabricación)", () => {
    expect(extraerServicio({ fila: 9, celdas: fila("Vacío", {}) }, cols, CFG)).toBeNull();
  });

  it("devuelve null para las filas de totales aunque traigan montos", () => {
    expect(extraerServicio({ fila: 11, celdas: fila("$", { 2: [3205, null] }) }, cols, CFG)).toBeNull();
  });

  it("advierte cuando hay un pago posterior a una factura impaga (mora real)", () => {
    const f = fila("Amvac", { 14: [1848, COLOR_FACTURADO], 17: [1848, COLOR_PAGADO] });
    const s = extraerServicio({ fila: 8, celdas: f }, cols, CFG)!;
    expect(s.advertencias.join(" ")).toMatch(/pagado DESPUÉS/);
  });

  it("omite montos negativos con advertencia en vez de cargarlos", () => {
    const f = fila("Raro", { 2: [-100, null], 5: [200, null] });
    const s = extraerServicio({ fila: 12, celdas: f }, cols, CFG)!;
    expect(s.cobros).toHaveLength(1);
    expect(s.advertencias.join(" ")).toMatch(/negativo/);
  });
});

describe("identidad", () => {
  const cols = columnasDeQuincena(header());
  const mk = (hoja: string) =>
    extraerServicio(
      { fila: 3, celdas: fila("Honda Soporte I 6 Meses", { 14: [500, null], 17: [500, null] }) },
      cols,
      { ...CFG, hoja },
    )!;

  it("la huella detecta el mismo servicio duplicado en dos hojas (caso Honda)", () => {
    expect(huellaServicio(mk("Continuidad CRM"))).toBe(huellaServicio(mk("Soportes CR ")));
  });

  it("la clave sí distingue la hoja (identidad de la fila importada)", () => {
    expect(claveServicio(mk("Continuidad CRM"))).not.toBe(claveServicio(mk("Soportes CR ")));
  });
});
