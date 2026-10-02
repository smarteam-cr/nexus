/**
 * lib/cobranza/mercury/diferencias.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/mercury --project unit`.
 *
 * «Lo que no cuadra» entre Nexus y Mercury, con los casos reales medidos el 2026-10-02: Visual Branding pagó US$1.760
 * por una factura de US$1.780 (la comisión del banco), Multiquímica tiene la INV-38 sin pagar en Mercury y cobrada en
 * Nexus, el Club de Amantes cubre dos cuotas con la INV-65, Metzger anotó «INVOICE NO.INV-48» y Teamnet tiene dos
 * clientes de Mercury. Y lo que pidió Elías: que lo marcado vuelva solo si cambia un número.
 */
import { describe, it, expect } from "vitest";
import type { DiferenciaOdoo, MarcaDeFila } from "../odoo/diferencias";
import {
  detectarDiferenciasMercury,
  entradasDeFacturas,
  medidoMercury,
  pagaLaFactura,
  type CobroParaCruzarMercury,
  type EstadoMercury,
  type FacturaMercuryParaCruzar,
} from "./diferencias";

const factura = (p: Partial<FacturaMercuryParaCruzar> & { id: string; numero: string }): FacturaMercuryParaCruzar => ({
  invoiceDate: "2026-08-01",
  dueDate: null,
  monto: 1000,
  moneda: "USD",
  estado: "Unpaid",
  mercuryCustomerId: "cli-a",
  clienteNombre: "Visual Branding S.A.",
  actualizadaEn: "2026-08-01",
  ...p,
});
const cobro = (p: Partial<CobroParaCruzarMercury> & { id: string }): CobroParaCruzarMercury => ({
  cuentaId: "cta-a",
  periodo: "2026-08",
  fechaProgramada: "2026-08-01",
  fechaEmision: "2026-08-01",
  monto: 1000,
  moneda: "USD",
  estado: "POR_COBRAR",
  numeroFactura: null,
  ...p,
});
const estado = (p: Partial<EstadoMercury> = {}): EstadoMercury => ({
  facturas: [],
  clientes: [{ mercuryCustomerId: "cli-a", nombre: "Visual Branding S.A.", cuentaId: "cta-a", ignorado: false }],
  cuentas: [{ id: "cta-a", nombre: "Visual Branding", via: "MERCURY" }],
  cobros: [],
  entradas: [],
  marcas: [],
  copiaAl: "2026-10-02",
  ...p,
});
const linea = (ls: readonly DiferenciaOdoo[], codigo: string) => ls.find((l) => l.codigo === codigo);
const codigos = (ls: readonly DiferenciaOdoo[]) => ls.filter((l) => l.items.length > 0).map((l) => l.codigo);

/** Las marcas que guardaría «Está bien así» sobre una fila: una por documento, con la huella de hoy. */
const marcasDe = (l: DiferenciaOdoo, i = 0): MarcaDeFila[] =>
  l.items[i]!.fila.documentos.map((d, k) => ({
    id: `m${k}`,
    linea: l.codigo,
    fila: l.items[i]!.fila.clave,
    documento: d.clave,
    huella: d.huella,
    motivo: "Revisado con Alex",
    marcadaPor: "elias@smarteamcr.com",
    marcadaEn: "2026-10-02T15:00:00.000Z",
  }));

describe("pagaLaFactura: la comisión del banco", () => {
  it("Visual Branding: US$1.760 paga una factura de US$1.780", () => {
    expect(pagaLaFactura(1760, 1780)).toBe(true);
  });
  it("nunca acepta más que la factura", () => {
    expect(pagaLaFactura(1781, 1780)).toBe(false);
  });
  it("hasta un 3 %, al menos US$20 y a lo sumo US$60", () => {
    expect(pagaLaFactura(480, 500)).toBe(true);
    expect(pagaLaFactura(479, 500)).toBe(false);
    expect(pagaLaFactura(4940, 5000)).toBe(true);
    expect(pagaLaFactura(4939, 5000)).toBe(false);
    expect(pagaLaFactura(1700, 1780)).toBe(false);
  });
});

describe("entradasDeFacturas", () => {
  it("ata cada factura pagada a una sola entrada, primero la de nombre parecido", () => {
    const fs = [factura({ id: "f1", numero: "INV-53", monto: 1780, estado: "Paid" })];
    const m = entradasDeFacturas(fs, [
      { id: "e-otro", monto: 1780, fecha: "2026-08-05", quien: "Otra Empresa" },
      { id: "e-vb", monto: 1760, fecha: "2026-08-10", quien: "1/VISUAL BRANDING SA" },
    ]);
    expect(m.get("f1")?.id).toBe("e-vb");
  });
  it("no ata una entrada de antes de la factura ni de mucho después", () => {
    const fs = [factura({ id: "f1", numero: "INV-1", estado: "Paid", invoiceDate: "2026-03-01" })];
    expect(entradasDeFacturas(fs, [{ id: "e", monto: 1000, fecha: "2026-02-20", quien: "Visual Branding" }]).size).toBe(0);
    expect(entradasDeFacturas(fs, [{ id: "e", monto: 1000, fecha: "2026-09-01", quien: "Visual Branding" }]).size).toBe(0);
  });
});

describe("detectarDiferenciasMercury", () => {
  it("cuando todo coincide no hay nada que resolver (Metzger anotó «INVOICE NO.INV-48»)", () => {
    const ls = detectarDiferenciasMercury(
      estado({
        facturas: [factura({ id: "f48", numero: "INV-48" })],
        cobros: [cobro({ id: "c1", numeroFactura: "INVOICE NO.INV-48" })],
      }),
    );
    expect(codigos(ls)).toEqual([]);
  });

  it("Visual Branding: pagada en Mercury y por cobrar en Nexus, con el día que entró la plata", () => {
    const ls = detectarDiferenciasMercury(
      estado({
        facturas: [factura({ id: "f53", numero: "INV-53", monto: 1780, estado: "Paid", actualizadaEn: "2026-08-11" })],
        cobros: [cobro({ id: "c53", monto: 1780, numeroFactura: "INV-53" })],
        entradas: [{ id: "e1", monto: 1760, fecha: "2026-08-10", quien: "1/VISUAL BRANDING SA" }],
      }),
    );
    const l = linea(ls, "MERCURY-PAGADA-SIN-COBRAR");
    expect(l?.donde).toBe("NEXUS");
    expect(l?.items[0]?.nota).toContain("Entró el 2026-08-10");
    expect(l?.items[0]?.nota).toContain("VISUAL BRANDING SA");
    /* La entrada ya explica una factura: no es «plata sin factura». */
    expect(linea(ls, "MERCURY-ENTRADA-SIN-FACTURA")).toBeUndefined();
  });

  it("Multiquímica INV-38: sin pagar en Mercury y cobrada en Nexus; se arregla en Mercury", () => {
    const ls = detectarDiferenciasMercury(
      estado({
        facturas: [factura({ id: "f38", numero: "INV-38", estado: "Unpaid" })],
        cobros: [cobro({ id: "c38", estado: "COBRADO", numeroFactura: "INV-38" })],
      }),
    );
    expect(codigos(ls)).toEqual(["MERCURY-COBRADO-SIN-PAGAR"]);
    expect(linea(ls, "MERCURY-COBRADO-SIN-PAGAR")?.donde).toBe("MERCURY");
  });

  it("Club de Amantes INV-65: una factura que cubre dos cuotas cuadra si la suma da", () => {
    const base = {
      facturas: [factura({ id: "f65", numero: "INV-65", monto: 2000 })],
    };
    const bien = detectarDiferenciasMercury(
      estado({ ...base, cobros: [cobro({ id: "c1", numeroFactura: "INV-65" }), cobro({ id: "c2", numeroFactura: "INV-65", periodo: "2026-09" })] }),
    );
    expect(codigos(bien)).toEqual([]);
    const mal = detectarDiferenciasMercury(
      estado({ ...base, cobros: [cobro({ id: "c1", numeroFactura: "INV-65" }), cobro({ id: "c2", monto: 900, numeroFactura: "INV-65" })] }),
    );
    expect(codigos(mal)).toEqual(["MERCURY-MONTO-DISTINTO"]);
    expect(linea(mal, "MERCURY-MONTO-DISTINTO")?.donde).toBe("PREGUNTANDO");
  });

  it("Teamnet: dos clientes de Mercury en la misma cuenta cuentan los dos", () => {
    const ls = detectarDiferenciasMercury(
      estado({
        clientes: [
          { mercuryCustomerId: "t1", nombre: "Teamnet S.A.", cuentaId: "cta-t", ignorado: false },
          { mercuryCustomerId: "t2", nombre: "Soluciones Analíticos y Servicios Team", cuentaId: "cta-t", ignorado: false },
        ],
        cuentas: [{ id: "cta-t", nombre: "Teamnet", via: "MERCURY" }],
        facturas: [
          factura({ id: "f1", numero: "INV-70", mercuryCustomerId: "t1", clienteNombre: "Teamnet S.A." }),
          factura({ id: "f2", numero: "INV-72", mercuryCustomerId: "t2", clienteNombre: "Soluciones Analíticos y Servicios Team" }),
        ],
        cobros: [cobro({ id: "c1", cuentaId: "cta-t", numeroFactura: "INV-70" }), cobro({ id: "c2", cuentaId: "cta-t", numeroFactura: "INV-72" })],
      }),
    );
    expect(codigos(ls)).toEqual([]);
  });

  it("facturas de un cliente sin cuenta: una fila por cliente, con el atajo a «Emparejar»; el «no es cliente» no aparece", () => {
    const ls = detectarDiferenciasMercury(
      estado({
        clientes: [
          { mercuryCustomerId: "x", nombre: "Nuevo SpA", cuentaId: null, ignorado: false },
          { mercuryCustomerId: "y", nombre: "Ajeno LLC", cuentaId: null, ignorado: true },
        ],
        cuentas: [],
        facturas: [
          factura({ id: "f1", numero: "INV-80", mercuryCustomerId: "x", clienteNombre: "Nuevo SpA" }),
          factura({ id: "f2", numero: "INV-81", mercuryCustomerId: "x", clienteNombre: "Nuevo SpA", estado: "Paid" }),
          factura({ id: "f3", numero: "INV-82", mercuryCustomerId: "y", clienteNombre: "Ajeno LLC" }),
        ],
      }),
    );
    const l = linea(ls, "MERCURY-SIN-CUENTA");
    expect(l?.severidad).toBe("ALTA");
    expect(l?.atajo?.tab).toBe("emparejar");
    expect(l?.items).toHaveLength(1);
    expect(l?.items[0]?.texto).toContain("INV-80, INV-81");
    expect(l?.montos).toEqual([{ moneda: "USD", monto: 1000 }]);
  });

  it("un cliente sin cuenta con todo pagado no es una fila: está en «Emparejar», y la línea lo dice", () => {
    const clientes = [
      { mercuryCustomerId: "x", nombre: "Nuevo SpA", cuentaId: null, ignorado: false },
      { mercuryCustomerId: "p", nombre: "Atom Chat INC", cuentaId: null, ignorado: false },
    ];
    const pagadas = [factura({ id: "f9", numero: "INV-11", mercuryCustomerId: "p", clienteNombre: "Atom Chat INC", estado: "Paid" })];
    expect(linea(detectarDiferenciasMercury(estado({ clientes, cuentas: [], facturas: pagadas })), "MERCURY-SIN-CUENTA")).toBeUndefined();
    const ls = detectarDiferenciasMercury(
      estado({ clientes, cuentas: [], facturas: [...pagadas, factura({ id: "f1", numero: "INV-80", mercuryCustomerId: "x", clienteNombre: "Nuevo SpA" })] }),
    );
    const l = linea(ls, "MERCURY-SIN-CUENTA");
    expect(l?.items).toHaveLength(1);
    expect(l?.detalle).toContain("1 cliente sin cuenta tiene todo pagado");
  });

  it("un número que Mercury no tiene, y uno que es de otra cuenta", () => {
    const ls = detectarDiferenciasMercury(
      estado({
        cuentas: [
          { id: "cta-a", nombre: "Visual Branding", via: "MERCURY" },
          { id: "cta-b", nombre: "Otra", via: "MERCURY" },
        ],
        facturas: [factura({ id: "f1", numero: "INV-53" })],
        cobros: [
          cobro({ id: "c1", numeroFactura: "INV-53" }),
          cobro({ id: "c2", cuentaId: "cta-b", numeroFactura: "INV-53" }),
          cobro({ id: "c3", numeroFactura: "INV-999" }),
        ],
      }),
    );
    expect(linea(ls, "MERCURY-NUMERO-INEXISTENTE")?.items.map((i) => i.fila.clave)).toEqual(["c:c3"]);
    expect(linea(ls, "MERCURY-NUMERO-DE-OTRA-CUENTA")?.items.map((i) => i.fila.clave)).toEqual(["c:c2"]);
  });

  it("anulada en Mercury con un cobro que la sigue nombrando", () => {
    const ls = detectarDiferenciasMercury(
      estado({ facturas: [factura({ id: "f1", numero: "INV-60", estado: "Cancelled" })], cobros: [cobro({ id: "c1", numeroFactura: "INV-60" })] }),
    );
    expect(codigos(ls)).toEqual(["MERCURY-ANULADA-CON-COBRO"]);
  });

  it("propone el número que le falta a un cobro facturado, y esa factura ya no es «sin cobro»", () => {
    const ls = detectarDiferenciasMercury(
      estado({
        facturas: [factura({ id: "f1", numero: "INV-55", invoiceDate: "2026-08-03" })],
        cobros: [cobro({ id: "c1", fechaEmision: "2026-08-01" })],
      }),
    );
    expect(codigos(ls)).toEqual(["MERCURY-FALTA-NUMERO"]);
    expect(linea(ls, "MERCURY-FALTA-NUMERO")?.items[0]?.nota).toContain("INV-55");
  });

  it("ACCCSA: propone la factura aunque el cobro diga US$712 y la factura US$712,50, y avisa la diferencia", () => {
    const ls = detectarDiferenciasMercury(
      estado({
        facturas: [factura({ id: "f1", numero: "INV-4-1", monto: 712.5, invoiceDate: "2026-01-02" })],
        cobros: [cobro({ id: "c1", monto: 712, fechaEmision: "2026-01-15", estado: "COBRADO" })],
      }),
    );
    const nota = linea(ls, "MERCURY-FALTA-NUMERO")?.items[0]?.nota ?? "";
    expect(nota).toContain("INV-4-1");
    expect(nota).toContain("corrígelo también");
    /* Más de US$1 de diferencia ya no es la misma factura. */
    const lejos = detectarDiferenciasMercury(
      estado({
        facturas: [factura({ id: "f1", numero: "INV-4-1", monto: 714, invoiceDate: "2026-01-02" })],
        cobros: [cobro({ id: "c1", monto: 712, fechaEmision: "2026-01-15", estado: "COBRADO" })],
      }),
    );
    expect(linea(lejos, "MERCURY-FALTA-NUMERO")).toBeUndefined();
  });

  it("historia: una factura pagada de antes del primer cobro de su cuenta no se acusa; una sin pagar, sí", () => {
    const ls = detectarDiferenciasMercury(
      estado({
        facturas: [
          factura({ id: "vieja", numero: "INV-3", invoiceDate: "2025-12-11", estado: "Paid", monto: 712.5 }),
          factura({ id: "debe", numero: "INV-2", invoiceDate: "2025-12-01", estado: "Unpaid", monto: 300 }),
        ],
        cobros: [cobro({ id: "c1", fechaProgramada: "2026-01-15", fechaEmision: null, estado: "PROGRAMADO", monto: 500 })],
      }),
    );
    const l = linea(ls, "MERCURY-FACTURA-SIN-COBRO");
    expect(l?.items.map((i) => i.fila.clave)).toEqual(["fm:debe"]);
    expect(l?.detalle).toContain("1 factura ya pagada");
  });

  it("número escrito «INVOICE-1» (Intercert) también se reconoce", () => {
    const ls = detectarDiferenciasMercury(
      estado({ facturas: [factura({ id: "f1", numero: "INVOICE-1" })], cobros: [cobro({ id: "c1", numeroFactura: "INVOICE-1" })] }),
    );
    expect(codigos(ls)).toEqual([]);
  });

  it("un cobro facturado sin factura en Mercury se acusa, pero no si se facturó hace menos de 3 días", () => {
    const ls = detectarDiferenciasMercury(
      estado({ cobros: [cobro({ id: "viejo", fechaEmision: "2026-09-01" }), cobro({ id: "nuevo", fechaEmision: "2026-10-01" })] }),
    );
    expect(linea(ls, "MERCURY-COBRO-SIN-FACTURA")?.items.map((i) => i.fila.clave)).toEqual(["c:viejo"]);
  });

  it("una factura de un cliente emparejado que ningún cobro tiene", () => {
    const ls = detectarDiferenciasMercury(estado({ facturas: [factura({ id: "f1", numero: "INV-90" })] }));
    expect(codigos(ls)).toEqual(["MERCURY-FACTURA-SIN-COBRO"]);
  });

  it("una cuenta que factura por Mercury sin su cliente de Mercury", () => {
    const ls = detectarDiferenciasMercury(
      estado({ clientes: [], cuentas: [{ id: "cta-s", nombre: "Sola", via: "MERCURY" }, { id: "cta-o", nombre: "Por Odoo", via: "ODOO" }] }),
    );
    expect(linea(ls, "MERCURY-CUENTA-SIN-CLIENTE")?.items.map((i) => i.texto)).toEqual(["Sola"]);
  });

  it("plata que entró y no paga ninguna factura, desde la primera factura de Mercury", () => {
    const ls = detectarDiferenciasMercury(
      estado({
        facturas: [factura({ id: "f1", numero: "INV-1", invoiceDate: "2026-03-01", estado: "Paid" })],
        cobros: [cobro({ id: "c1", numeroFactura: "INV-1", estado: "COBRADO" })],
        entradas: [
          { id: "antes", monto: 50, fecha: "2026-01-10", quien: "Alguien" },
          { id: "suelta", monto: 333, fecha: "2026-05-10", quien: "1/ALGUIEN LLC" },
        ],
      }),
    );
    const l = linea(ls, "MERCURY-ENTRADA-SIN-FACTURA");
    expect(l?.severidad).toBe("BAJA");
    expect(l?.items.map((i) => i.fila.clave)).toEqual(["mov:suelta"]);
    expect(l?.items[0]?.texto).toContain("ALGUIEN LLC");
  });

  it("las líneas con plata van primero: ALTA antes que MEDIA antes que BAJA", () => {
    const ls = detectarDiferenciasMercury(
      estado({
        facturas: [factura({ id: "f38", numero: "INV-38", invoiceDate: "2026-03-01" })],
        cobros: [cobro({ id: "c38", estado: "COBRADO", numeroFactura: "INV-38" })],
        clientes: [{ mercuryCustomerId: "cli-a", nombre: "Visual Branding S.A.", cuentaId: "cta-a", ignorado: false }],
        cuentas: [
          { id: "cta-a", nombre: "Visual Branding", via: "MERCURY" },
          { id: "cta-s", nombre: "Sola", via: "MERCURY" },
        ],
        entradas: [{ id: "e", monto: 10, fecha: "2026-05-01", quien: "X" }],
      }),
    );
    expect(ls.map((l) => l.severidad)).toEqual(["ALTA", "MEDIA", "BAJA"]);
  });
});

describe("«Está bien así»: sale de la lista y vuelve sola si cambia un número", () => {
  const conMulti = (monto: number, marcas: MarcaDeFila[] = []) =>
    estado({
      facturas: [factura({ id: "f38", numero: "INV-38", monto })],
      cobros: [cobro({ id: "c38", estado: "COBRADO", numeroFactura: "INV-38", monto: 1000 })],
      marcas,
    });

  it("marcada con los números de hoy, la fila pasa a «Marcadas» y la línea queda sin pendientes", () => {
    const antes = linea(detectarDiferenciasMercury(conMulti(1000)), "MERCURY-COBRADO-SIN-PAGAR")!;
    const despues = linea(detectarDiferenciasMercury(conMulti(1000, marcasDe(antes))), "MERCURY-COBRADO-SIN-PAGAR")!;
    expect(despues.items).toHaveLength(0);
    expect(despues.marcadas).toHaveLength(1);
    expect(despues.aceptada).toBe(true);
    expect(despues.montos).toEqual([]);
  });

  it("si Mercury cambia el monto de la factura, la fila vuelve y dice que volvió", () => {
    const antes = linea(detectarDiferenciasMercury(conMulti(1000)), "MERCURY-COBRADO-SIN-PAGAR")!;
    /* El monto de la factura cambió: ya no cuadra con su cobro, así que también aparece «otro monto». */
    const ls = detectarDiferenciasMercury(conMulti(1200, marcasDe(antes)));
    const volvio = linea(ls, "MERCURY-COBRADO-SIN-PAGAR")!;
    expect(volvio.items).toHaveLength(1);
    expect(volvio.marcadas).toHaveLength(0);
    expect(volvio.volvieron).toHaveLength(1);
  });

  it("la marca vale solo en su línea", () => {
    const ls0 = detectarDiferenciasMercury(
      estado({ facturas: [factura({ id: "f1", numero: "INV-90" })], clientes: [], cuentas: [] }),
    );
    const sinCuenta = linea(ls0, "MERCURY-SIN-CUENTA")!;
    const marcas = marcasDe(sinCuenta).map((m) => ({ ...m, linea: "MERCURY-OTRA" }));
    const ls = detectarDiferenciasMercury(estado({ facturas: [factura({ id: "f1", numero: "INV-90" })], clientes: [], cuentas: [], marcas }));
    expect(linea(ls, "MERCURY-SIN-CUENTA")?.items).toHaveLength(1);
  });
});

describe("medidoMercury", () => {
  it("cuenta facturas vivas, anuladas aparte, y las cuentas por Mercury sin cliente", () => {
    const m = medidoMercury(
      estado({
        cuentas: [
          { id: "cta-a", nombre: "Visual Branding", via: "MERCURY" },
          { id: "cta-s", nombre: "Sola", via: "MERCURY" },
          { id: "cta-o", nombre: "Por Odoo", via: "ODOO" },
        ],
        facturas: [factura({ id: "f1", numero: "INV-1" }), factura({ id: "f2", numero: "INV-2", estado: "Cancelled" })],
        cobros: [cobro({ id: "c1" }), cobro({ id: "c2", cuentaId: "cta-o" })],
      }),
    );
    expect(m).toEqual({ cobros: 1, facturas: 1, otrosDocumentos: 1, cuentasSinVinculo: 1, cuentasTotales: 2 });
  });
});
