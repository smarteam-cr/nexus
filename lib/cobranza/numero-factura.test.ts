/**
 * lib/cobranza/numero-factura.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/numero-factura.test.ts --project unit`.
 *
 * La factura tiene número desde que nace (etapa 7): cómo se escribe el número, de qué plataforma
 * parece, qué exige cada cambio, y que el chokepoint escriba lo que la regla decide.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  avisoDePlataforma,
  decidirNumeroFactura,
  faltaNumeroDeFactura,
  mensajeNumeroEnOtraCuenta,
  MOTIVO_SIN_NUMERO_MIN,
  normalizarNumeroFactura,
  plataformaDelNumero,
  type NumeroAntes,
} from "./numero-factura";
import { cobroPatchSchema } from "./schema";
import { cambiarEstadoCobroTx, CobranzaError } from "./mutations";

/* El chokepoint corre contra una base de mentira; esto solo evita armar el pool real de Postgres. */
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

const ALEX = "aarrieta@smarteamcr.com";

/** Un cobro por cobrar, todavía sin factura. */
const SIN_FACTURA: NumeroAntes = {
  fechaEmisionISO: null,
  numeroFactura: null,
  numeroFacturaPor: null,
  sinNumeroFacturaMotivo: null,
};
/** Uno de los 144 facturados de antes de la etapa 7: con fecha y sin número. */
const FACTURADO_DE_ANTES: NumeroAntes = { ...SIN_FACTURA, fechaEmisionISO: "2026-06-17" };
/** Global Supply feb-2026 con su número puesto. */
const CON_NUMERO: NumeroAntes = {
  fechaEmisionISO: "2026-02-04",
  numeroFactura: "FAC/2026/0206",
  numeroFacturaPor: ALEX,
  sinNumeroFacturaMotivo: null,
};

describe("normalizarNumeroFactura", () => {
  it("quita los espacios alrededor de los separadores y pasa a mayúsculas", () => {
    expect(normalizarNumeroFactura("INV - 40")).toBe("INV-40");
    expect(normalizarNumeroFactura(" fac/2026/0206 ")).toBe("FAC/2026/0206");
    expect(normalizarNumeroFactura("fac / 2026 / 0206")).toBe("FAC/2026/0206");
    expect(normalizarNumeroFactura("Factura   123")).toBe("FACTURA 123");
  });

  it("vacío o solo espacios es null", () => {
    expect(normalizarNumeroFactura("")).toBeNull();
    expect(normalizarNumeroFactura("   ")).toBeNull();
    expect(normalizarNumeroFactura(null)).toBeNull();
    expect(normalizarNumeroFactura(undefined)).toBeNull();
  });
});

describe("plataformaDelNumero", () => {
  it("reconoce la forma de Odoo, la de Mercury, y ninguna para QuickBooks", () => {
    expect(plataformaDelNumero("FAC/2026/0206")).toBe("ODOO");
    expect(plataformaDelNumero("NC/2026/0001")).toBe("ODOO");
    expect(plataformaDelNumero(" fac/2026/0206")).toBe("ODOO");
    expect(plataformaDelNumero("INV-4-1")).toBe("MERCURY");
    expect(plataformaDelNumero("INV - 16")).toBe("MERCURY");
    expect(plataformaDelNumero("QBS-1")).toBeNull();
  });

  it("un número de transferencia no tiene forma de factura", () => {
    expect(plataformaDelNumero("666471587")).toBeNull();
    expect(plataformaDelNumero("9999/99999")).toBeNull();
    expect(plataformaDelNumero(null)).toBeNull();
  });

  it("avisa cuando el número no es de la plataforma de la cuenta, y calla cuando sí", () => {
    expect(avisoDePlataforma("FAC/2026/0206", "ODOO")).toBeNull();
    expect(avisoDePlataforma("INV-16", "MERCURY")).toBeNull();
    expect(avisoDePlataforma("INV-16", "ODOO")).toContain("forma de número de Mercury, y esta cuenta factura por Odoo");
    expect(avisoDePlataforma("FAC/2026/0206", "OTRA")).toContain("esta cuenta factura por QuickBooks");
    /* En Odoo una forma desconocida no se va a poder verificar nunca; en QuickBooks es lo normal. */
    expect(avisoDePlataforma("666471587", "ODOO")).toContain("no tiene la forma de un número de Odoo");
    expect(avisoDePlataforma("QBS-1", "OTRA")).toBeNull();
    expect(avisoDePlataforma("", "ODOO")).toBeNull();
  });
});

describe("marcar facturado exige el número o la marca", () => {
  it("sin número ni marca da 400", () => {
    const d = decidirNumeroFactura(SIN_FACTURA, { fechaEmisionISO: "2026-09-10" }, ALEX);
    expect(d).toMatchObject({ tipo: "rechazo", status: 400 });
    expect(decidirNumeroFactura(SIN_FACTURA, { fechaEmisionISO: "2026-09-10", numeroFactura: "  " }, ALEX).tipo).toBe(
      "rechazo",
    );
  });

  it("con el número lo guarda normalizado, firmado, y lo busca en otras cuentas", () => {
    const d = decidirNumeroFactura(SIN_FACTURA, { fechaEmisionISO: "2026-09-10", numeroFactura: " fac/2026/0343 " }, ALEX);
    expect(d).toMatchObject({
      tipo: "escribir",
      numeroFactura: "FAC/2026/0343",
      sinNumeroFacturaMotivo: null,
      firmar: true,
      numeroNuevo: "FAC/2026/0343",
    });
    if (d.tipo === "escribir") expect(d.bitacora).toBe(`${ALEX} anotó el número de factura FAC/2026/0343.`);
  });

  it("con «no tengo el número» y su motivo también pasa, sin número que buscar", () => {
    const d = decidirNumeroFactura(
      SIN_FACTURA,
      { fechaEmisionISO: "2026-09-10", sinNumeroFacturaMotivo: " QuickBooks no numera en el libro " },
      ALEX,
    );
    expect(d).toMatchObject({
      tipo: "escribir",
      numeroFactura: null,
      sinNumeroFacturaMotivo: "QuickBooks no numera en el libro",
      firmar: true,
      numeroNuevo: null,
    });
    if (d.tipo === "escribir") {
      expect(d.bitacora).toContain(`${ALEX} marcó la factura sin número.`);
      expect(d.bitacora).toContain("Motivo: QuickBooks no numera en el libro");
    }
  });

  it("un motivo demasiado corto, o número y marca juntos, dan 400", () => {
    const corto = "x".repeat(MOTIVO_SIN_NUMERO_MIN - 1);
    expect(decidirNumeroFactura(SIN_FACTURA, { fechaEmisionISO: "2026-09-10", sinNumeroFacturaMotivo: corto }, ALEX).tipo).toBe(
      "rechazo",
    );
    expect(
      decidirNumeroFactura(
        SIN_FACTURA,
        { fechaEmisionISO: "2026-09-10", numeroFactura: "FAC/2026/0343", sinNumeroFacturaMotivo: "no lo encuentro" },
        ALEX,
      ).tipo,
    ).toBe("rechazo");
  });

  it("sin usuario con nombre no se firma nada", () => {
    expect(decidirNumeroFactura(SIN_FACTURA, { fechaEmisionISO: "2026-09-10", numeroFactura: "FAC/2026/0343" }, "").tipo).toBe(
      "rechazo",
    );
  });
});

describe("lo que no exige nada", () => {
  it("cambiar una fecha ya puesta por otra no pide número: los facturados de antes siguen editables", () => {
    expect(decidirNumeroFactura(FACTURADO_DE_ANTES, { fechaEmisionISO: "2026-06-10" }, ALEX)).toEqual({ tipo: "sin-cambios" });
    expect(decidirNumeroFactura(CON_NUMERO, { fechaEmisionISO: "2026-02-05" }, ALEX)).toEqual({ tipo: "sin-cambios" });
  });

  it("un pedido que no nombra el número ni la marca no los toca", () => {
    expect(decidirNumeroFactura(CON_NUMERO, {}, ALEX)).toEqual({ tipo: "sin-cambios" });
    expect(decidirNumeroFactura(SIN_FACTURA, {}, ALEX)).toEqual({ tipo: "sin-cambios" });
  });

  it("volver a guardar el mismo número, escrito distinto, no es un cambio ni vuelve a preguntar", () => {
    expect(decidirNumeroFactura(CON_NUMERO, { numeroFactura: " fac / 2026 / 0206" }, ALEX)).toEqual({ tipo: "sin-cambios" });
  });
});

describe("agregar o corregir el número de una factura ya emitida", () => {
  it("un facturado de antes recibe su número", () => {
    const d = decidirNumeroFactura(FACTURADO_DE_ANTES, { numeroFactura: "FAC/2026/0302" }, ALEX);
    expect(d).toMatchObject({ tipo: "escribir", numeroFactura: "FAC/2026/0302", numeroNuevo: "FAC/2026/0302" });
  });

  it("corregir el número cita el anterior y a quien lo había puesto", () => {
    const d = decidirNumeroFactura(CON_NUMERO, { numeroFactura: "FAC/2026/0207" }, "dmarin@smarteamcr.com");
    expect(d.tipo).toBe("escribir");
    if (d.tipo === "escribir") {
      expect(d.bitacora).toBe(
        `dmarin@smarteamcr.com corrigió el número de factura: FAC/2026/0206 → FAC/2026/0207 (lo había puesto ${ALEX}).`,
      );
      expect(d.numeroNuevo).toBe("FAC/2026/0207");
    }
  });

  it("el número reemplaza la marca, y la marca reemplaza el número", () => {
    const conMarca = { ...FACTURADO_DE_ANTES, sinNumeroFacturaMotivo: "no está en el libro", numeroFacturaPor: ALEX };
    const a = decidirNumeroFactura(conMarca, { numeroFactura: "FAC/2026/0295" }, ALEX);
    expect(a).toMatchObject({ tipo: "escribir", numeroFactura: "FAC/2026/0295", sinNumeroFacturaMotivo: null });
    if (a.tipo === "escribir") expect(a.bitacora).toContain("Reemplaza la marca «no tengo el número» (no está en el libro).");

    const b = decidirNumeroFactura(CON_NUMERO, { sinNumeroFacturaMotivo: "era de otra sociedad" }, ALEX);
    expect(b).toMatchObject({ tipo: "escribir", numeroFactura: null, sinNumeroFacturaMotivo: "era de otra sociedad" });
    if (b.tipo === "escribir") expect(b.bitacora).toContain(`Se quitó el número FAC/2026/0206 (lo había puesto ${ALEX}).`);
  });

  it("⚠ quitarle el número a una factura sin decir por qué da 400: sería fabricar un facturado sin número", () => {
    expect(decidirNumeroFactura(CON_NUMERO, { numeroFactura: null }, ALEX).tipo).toBe("rechazo");
    const conMarca = { ...FACTURADO_DE_ANTES, sinNumeroFacturaMotivo: "no está en el libro", numeroFacturaPor: ALEX };
    expect(decidirNumeroFactura(conMarca, { sinNumeroFacturaMotivo: null }, ALEX).tipo).toBe("rechazo");
  });
});

describe("revertir la factura limpia el número", () => {
  it("limpia número y autoría, y deja el número viejo en la bitácora", () => {
    const d = decidirNumeroFactura(CON_NUMERO, { fechaEmisionISO: null }, ALEX);
    expect(d).toMatchObject({
      tipo: "escribir",
      numeroFactura: null,
      sinNumeroFacturaMotivo: null,
      firmar: false,
      numeroNuevo: null,
    });
    if (d.tipo === "escribir") {
      expect(d.bitacora).toBe(
        `Se quitó el número de factura FAC/2026/0206 (lo había puesto ${ALEX}): el cobro dejó de estar facturado.`,
      );
    }
  });

  it("también la marca, y un cobro sin número no deja nada que escribir", () => {
    const conMarca = { ...FACTURADO_DE_ANTES, sinNumeroFacturaMotivo: "no está en el libro", numeroFacturaPor: ALEX };
    const d = decidirNumeroFactura(conMarca, { fechaEmisionISO: null }, ALEX);
    expect(d).toMatchObject({ tipo: "escribir", sinNumeroFacturaMotivo: null, firmar: false });
    expect(decidirNumeroFactura(FACTURADO_DE_ANTES, { fechaEmisionISO: null }, ALEX)).toEqual({ tipo: "sin-cambios" });
  });

  it("un número para un cobro que queda sin factura da 400", () => {
    expect(decidirNumeroFactura(SIN_FACTURA, { numeroFactura: "FAC/2026/0343" }, ALEX).tipo).toBe("rechazo");
    expect(decidirNumeroFactura(CON_NUMERO, { fechaEmisionISO: null, numeroFactura: "FAC/2026/0343" }, ALEX).tipo).toBe(
      "rechazo",
    );
  });
});

describe("faltaNumeroDeFactura", () => {
  it("solo un facturado sin número ni motivo", () => {
    expect(faltaNumeroDeFactura({ fechaEmision: "2026-06-17", numeroFactura: null, sinNumeroFacturaMotivo: null })).toBe(true);
    expect(faltaNumeroDeFactura({ fechaEmision: "2026-06-17", numeroFactura: "FAC/2026/0302" })).toBe(false);
    expect(faltaNumeroDeFactura({ fechaEmision: "2026-06-17", sinNumeroFacturaMotivo: "QuickBooks" })).toBe(false);
    expect(faltaNumeroDeFactura({ fechaEmision: null })).toBe(false);
  });
});

describe("el chokepoint escribe lo que la regla decide", () => {
  /** Una base de mentira con un cobro y, si hace falta, otro cobro con el mismo número en otra cuenta. */
  function baseFalsa(fila: Record<string, unknown>, otraCuenta: string | null = null) {
    const escrito = {
      cambio: null as Record<string, unknown> | null,
      bitacoras: [] as Record<string, unknown>[],
      busquedas: [] as Record<string, unknown>[],
    };
    const db = {
      cobro: {
        findUnique: async () => fila,
        findFirst: async (args: Record<string, unknown>) => {
          escrito.busquedas.push(args);
          return otraCuenta ? { cuenta: { client: { name: otraCuenta } } } : null;
        },
        update: async ({ data }: { data: Record<string, unknown> }) => {
          escrito.cambio = data;
          return { ...fila, ...data };
        },
      },
      comisionVendedor: { count: async () => 0 },
      bitacoraCobro: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          escrito.bitacoras.push(data);
          return data;
        },
      },
      alertaCobro: { updateMany: async () => ({ count: 0 }) },
    };
    return { db, escrito };
  }

  const porCobrar = {
    id: "c1",
    cuentaId: "cuenta-1",
    estado: "POR_COBRAR",
    confirmadoPor: null,
    fechaCobro: null,
    fechaEmision: null,
    facturadoPor: null,
    referenciaExterna: null,
    numeroFactura: null,
    numeroFacturaPor: null,
    numeroFacturaEn: null,
    sinNumeroFacturaMotivo: null,
    promesaPago: null,
  };

  it("marcar facturado sin número da 400 y no escribe nada", async () => {
    const { db, escrito } = baseFalsa(porCobrar);
    const patch = cobroPatchSchema.parse({ fechaEmision: "2026-09-10" });
    await expect(cambiarEstadoCobroTx(db as never, "c1", patch, ALEX)).rejects.toMatchObject({ status: 400 });
    expect(escrito.cambio).toBeNull();
    expect(escrito.bitacoras).toEqual([]);
  });

  it("con el número: firma la factura y el número, y deja la bitácora", async () => {
    const { db, escrito } = baseFalsa(porCobrar);
    const patch = cobroPatchSchema.parse({ fechaEmision: "2026-09-10", numeroFactura: "fac/2026/0343" });
    await cambiarEstadoCobroTx(db as never, "c1", patch, ALEX);
    expect(escrito.cambio).toMatchObject({
      facturadoPor: ALEX,
      numeroFactura: "FAC/2026/0343",
      sinNumeroFacturaMotivo: null,
      numeroFacturaPor: ALEX,
    });
    expect(escrito.cambio?.numeroFacturaEn).toBeInstanceOf(Date);
    /* La búsqueda en otras cuentas es por el número NORMALIZADO y excluye la cuenta del cobro. */
    expect(escrito.busquedas).toEqual([
      expect.objectContaining({ where: { numeroFactura: "FAC/2026/0343", cuentaId: { not: "cuenta-1" } } }),
    ]);
    expect(escrito.bitacoras).toEqual([
      expect.objectContaining({ cobroId: "c1", contenido: `${ALEX} anotó el número de factura FAC/2026/0343.`, usuarioEmail: ALEX }),
    ]);
  });

  it("⛔ un número que ya está en otra cuenta da 409 y no escribe nada", async () => {
    const { db, escrito } = baseFalsa(porCobrar, "Publimark");
    const patch = cobroPatchSchema.parse({ fechaEmision: "2026-09-10", numeroFactura: "FAC/2026/0209" });
    const error = await cambiarEstadoCobroTx(db as never, "c1", patch, ALEX).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CobranzaError);
    expect(error).toMatchObject({ status: 409, message: mensajeNumeroEnOtraCuenta("FAC/2026/0209", "Publimark") });
    expect(escrito.cambio).toBeNull();
    expect(escrito.bitacoras).toEqual([]);
  });

  it("revertir la factura limpia número y autoría, y el número viejo queda en la bitácora", async () => {
    const facturado = {
      ...porCobrar,
      fechaEmision: new Date("2026-02-04T00:00:00.000Z"),
      facturadoPor: ALEX,
      numeroFactura: "FAC/2026/0206",
      numeroFacturaPor: ALEX,
      numeroFacturaEn: new Date("2026-09-12T15:00:00.000Z"),
    };
    const { db, escrito } = baseFalsa(facturado);
    await cambiarEstadoCobroTx(db as never, "c1", cobroPatchSchema.parse({ fechaEmision: null }), ALEX);
    expect(escrito.cambio).toMatchObject({
      fechaEmision: null,
      facturadoPor: null,
      numeroFactura: null,
      numeroFacturaPor: null,
      numeroFacturaEn: null,
      sinNumeroFacturaMotivo: null,
    });
    expect(escrito.busquedas, "sacar un número no pregunta nada").toEqual([]);
    expect(escrito.bitacoras.map((b) => b.contenido)).toEqual([
      `Se quitó el número de factura FAC/2026/0206 (lo había puesto ${ALEX}): el cobro dejó de estar facturado.`,
    ]);
  });

  it("⚠ cambiar solo la fecha de un facturado de antes no escribe número ni bitácora", async () => {
    const deAntes = { ...porCobrar, fechaEmision: new Date("2026-06-17T00:00:00.000Z"), facturadoPor: ALEX };
    const { db, escrito } = baseFalsa(deAntes);
    await cambiarEstadoCobroTx(db as never, "c1", cobroPatchSchema.parse({ fechaEmision: "2026-06-10" }), ALEX);
    expect(escrito.cambio).not.toHaveProperty("numeroFactura");
    expect(escrito.bitacoras).toEqual([]);
  });

  it("sacar de Cobrado con el número del diálogo lo guarda en la columna, no solo en el texto", async () => {
    const cobrado = {
      ...porCobrar,
      estado: "COBRADO",
      confirmadoPor: "import:facturaciones-2026",
      fechaCobro: new Date("2026-02-15T00:00:00.000Z"),
      fechaEmision: new Date("2026-02-15T00:00:00.000Z"),
      facturadoPor: "import:facturaciones-2026",
    };
    const { db, escrito } = baseFalsa(cobrado);
    const patch = cobroPatchSchema.parse({
      estado: "POR_COBRAR",
      fechaEmision: "2026-02-04",
      reversion: { motivo: "El depósito nunca entró", numeroFactura: "FAC/2026/0206" },
    });
    await cambiarEstadoCobroTx(db as never, "c1", patch, ALEX);
    expect(escrito.cambio).toMatchObject({ estado: "POR_COBRAR", numeroFactura: "FAC/2026/0206", numeroFacturaPor: ALEX });
    const textos = escrito.bitacoras.map((b) => String(b.contenido));
    expect(textos).toHaveLength(2);
    expect(textos[0]).toContain("sacó este cobro de Cobrado");
    expect(textos[1]).toBe(`${ALEX} anotó el número de factura FAC/2026/0206.`);
    expect(textos.join("\n").match(/FAC\/2026\/0206/g), "el número se anota una sola vez").toHaveLength(1);
  });

  it("dos números distintos en el mismo pedido dan 400", async () => {
    const { db, escrito } = baseFalsa({ ...porCobrar, estado: "COBRADO", confirmadoPor: ALEX, fechaEmision: new Date("2026-02-04T00:00:00.000Z"), facturadoPor: ALEX });
    const patch = cobroPatchSchema.parse({
      estado: "POR_COBRAR",
      numeroFactura: "FAC/2026/0207",
      reversion: { motivo: "El depósito nunca entró", numeroFactura: "FAC/2026/0206" },
    });
    await expect(cambiarEstadoCobroTx(db as never, "c1", patch, ALEX)).rejects.toMatchObject({ status: 400 });
    expect(escrito.cambio).toBeNull();
  });
});

/** Quita bloques de comentario y líneas `//`: una guarda no puede cumplirse con su propia prosa. */
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const fuente = (...ruta: string[]) => sinComentarios(readFileSync(join(__dirname, "..", "..", ...ruta), "utf8"));

describe("el armado", () => {
  it("⛔ el chokepoint decide el número y pregunta por otra cuenta ANTES de escribir", () => {
    const src = fuente("lib", "cobranza", "mutations.ts");
    const cuerpo = src.slice(
      src.indexOf("export async function cambiarEstadoCobroTx("),
      src.indexOf("export async function cambiarEstadoCobro("),
    );
    const decide = cuerpo.indexOf("decidirNumeroFactura(");
    const pregunta = cuerpo.indexOf("db.cobro.findFirst(");
    const escribe = cuerpo.indexOf("db.cobro.update(");
    expect(decide, "el chokepoint dejó de usar decidirNumeroFactura").toBeGreaterThan(-1);
    expect(pregunta).toBeGreaterThan(decide);
    expect(escribe).toBeGreaterThan(pregunta);
    expect(cuerpo).toMatch(/numero\.tipo === "rechazo"\) throw new CobranzaError/);
    expect(cuerpo, "la bitácora del número va por `db`").toMatch(/db\.bitacoraCobro\.create\(\{[\s\S]*?contenido: numero\.bitacora/);
  });

  it("⛔ la regla no importa zod ni el schema: la usan diálogos del navegador", () => {
    const src = fuente("lib", "cobranza", "numero-factura.ts");
    expect(src).not.toMatch(/from\s+["'](zod|\.\/schema|@\/lib\/cobranza\/schema)["']/);
    expect(src).not.toMatch(/new Date\(\s*\)|Date\.now\(/);
  });

  it("soltar una factura deja en la evidencia el número de la FACTURA, no la referencia del pago", () => {
    const src = fuente("lib", "cobranza", "mutations.ts");
    const liberar = src.slice(src.indexOf("export async function liberarYRegenerar("));
    expect(liberar).toMatch(/referenciaExterna: c\.numeroFactura,/);
    expect(liberar).toMatch(/numero: c\.numeroFactura,/);
    expect(liberar).not.toMatch(/c\.referenciaExterna/);
  });
});
