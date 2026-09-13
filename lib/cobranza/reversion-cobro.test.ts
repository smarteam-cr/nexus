/**
 * lib/cobranza/reversion-cobro.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/reversion-cobro.test.ts --project unit`.
 *
 * Sacar un cobro de COBRADO: motivo obligatorio, bitácora que cita a quien lo había confirmado,
 * y la firma de un cargador (`import:…`) reemplazada por la de la persona que miró la factura.
 *
 * Los casos usan los tres cobros reales que Alex tiene que devolver a por cobrar (Global Supply
 * feb-2026, IIA y Seléctrica jun-2026), tal como están hoy en la base: confirmados y facturados
 * por `import:facturaciones-2026` con la fecha de la QUINCENA, no la de la factura.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decidirReversion,
  esFirmaDeImportacion,
  MOTIVO_REVERSION_MIN,
  saleDeCobrado,
  type CobroAntesDeRevertir,
  type FirmasDelCobro,
  type PedidoDeCambio,
} from "./reversion-cobro";
import { cobroPatchSchema, ESTADO_COBRO_LABEL } from "./schema";
import { cambiarEstadoCobroTx, CobranzaError } from "./mutations";

/* El chokepoint corre contra una base de mentira que se le pasa por argumento; esto solo evita
   que importar mutations.ts arme el pool real de Postgres. */
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

const ALEX = "aarrieta@smarteamcr.com";
const IMPORT = "import:facturaciones-2026";

/** Global Supply, cuota #2 de feb-2026, como está en producción el 2026-09-12. */
const GLOBAL_SUPPLY: CobroAntesDeRevertir = {
  estado: "COBRADO",
  confirmadoPor: IMPORT,
  confirmadoEnISO: "2026-02-15",
  fechaCobroISO: "2026-02-15",
  fechaEmisionISO: "2026-02-15",
  facturadoPor: IMPORT,
  referenciaExterna: null,
};

/** Un verde confirmado de verdad por una persona. */
const CONFIRMADO_A_MANO: CobroAntesDeRevertir = {
  estado: "COBRADO",
  confirmadoPor: "dmarin@smarteamcr.com",
  confirmadoEnISO: "2026-08-20",
  fechaCobroISO: "2026-08-19",
  fechaEmisionISO: "2026-08-01",
  facturadoPor: "dmarin@smarteamcr.com",
  referenciaExterna: "TRX-4471",
};

const MOTIVO = "El depósito nunca entró; el libro lo marcaba pagado";

/** Con las etiquetas de la pantalla, que son las que pasa el chokepoint. */
const decidir = (antes: CobroAntesDeRevertir, pedido: PedidoDeCambio, byEmail: string) =>
  decidirReversion(antes, pedido, byEmail, ESTADO_COBRO_LABEL);

/**
 * Los predicados de INV3 e INV5 (lib/invariantes/cobranza.ts), escritos sobre la fila que queda.
 * INV3: `{ estado: "COBRADO", confirmadoPor: null }` viola. INV5: `{ fechaEmision: { not: null },
 * facturadoPor: null }` viola.
 */
const violaINV3 = (f: FirmasDelCobro) => f.estado === "COBRADO" && f.confirmadoPor === null;
const violaINV5 = (f: FirmasDelCobro) => f.fechaEmisionISO !== null && f.facturadoPor === null;

describe("saleDeCobrado", () => {
  it("solo cuenta el paso de COBRADO a otro estado", () => {
    expect(saleDeCobrado("COBRADO", "POR_COBRAR")).toBe(true);
    expect(saleDeCobrado("COBRADO", "PROGRAMADO")).toBe(true);
    expect(saleDeCobrado("COBRADO", "COBRADO")).toBe(false);
    expect(saleDeCobrado("COBRADO", undefined)).toBe(false);
    expect(saleDeCobrado("POR_COBRAR", "PROGRAMADO")).toBe(false);
    expect(saleDeCobrado("POR_COBRAR", "COBRADO")).toBe(false);
  });

  it("reconoce la firma de un cargador y no la de una persona", () => {
    expect(esFirmaDeImportacion(IMPORT)).toBe(true);
    expect(esFirmaDeImportacion(ALEX)).toBe(false);
    expect(esFirmaDeImportacion(null)).toBe(false);
  });
});

describe("el motivo se exige solo al salir de COBRADO", () => {
  it("un cambio que no sale de COBRADO no pide nada", () => {
    const porCobrar = { ...GLOBAL_SUPPLY, estado: "POR_COBRAR", confirmadoPor: null, fechaCobroISO: null };
    expect(decidir(porCobrar, { estado: "PROGRAMADO" }, ALEX)).toEqual({ tipo: "no-aplica" });
    expect(decidir(GLOBAL_SUPPLY, { fechaEmisionISO: "2026-02-04" }, ALEX)).toEqual({ tipo: "no-aplica" });
  });

  it("da 400 sin motivo, con motivo en blanco y con uno demasiado corto", () => {
    for (const reversion of [undefined, { motivo: "" }, { motivo: "    " }, { motivo: "x".repeat(MOTIVO_REVERSION_MIN - 1) }]) {
      const d = decidir(GLOBAL_SUPPLY, { estado: "POR_COBRAR", reversion }, ALEX);
      expect(d.tipo).toBe("rechazo");
      if (d.tipo === "rechazo") expect(d.status).toBe(400);
    }
  });

  it("da 400 sin usuario con nombre", () => {
    const d = decidir(GLOBAL_SUPPLY, { estado: "POR_COBRAR", reversion: { motivo: MOTIVO } }, "");
    expect(d.tipo).toBe("rechazo");
  });

  it("⚠ rechaza un motivo que llega con un cambio que no sale de COBRADO: no quedaría escrito", () => {
    const d = decidir(GLOBAL_SUPPLY, { estado: "COBRADO", reversion: { motivo: MOTIVO } }, ALEX);
    expect(d.tipo).toBe("rechazo");
  });

  it("Por cobrar sin fecha de emisión da 400: el semáforo lo leería como «falta facturar»", () => {
    const sinFactura = { ...CONFIRMADO_A_MANO, fechaEmisionISO: null, facturadoPor: null };
    expect(decidir(sinFactura, { estado: "POR_COBRAR", reversion: { motivo: MOTIVO } }, ALEX).tipo).toBe("rechazo");
    expect(
      decidir(GLOBAL_SUPPLY, { estado: "POR_COBRAR", fechaEmisionISO: null, reversion: { motivo: MOTIVO } }, ALEX).tipo,
    ).toBe("rechazo");
    // A PROGRAMADO sí se puede ir sin factura.
    expect(decidir(sinFactura, { estado: "PROGRAMADO", reversion: { motivo: MOTIVO } }, ALEX).tipo).toBe("revertir");
  });
});

describe("la bitácora cita a quien lo había confirmado", () => {
  it("Global Supply: motivo, firma del import, fecha corregida, número y re-firma", () => {
    const d = decidir(
      GLOBAL_SUPPLY,
      {
        estado: "POR_COBRAR",
        fechaEmisionISO: "2026-02-04",
        reversion: { motivo: `  ${MOTIVO}  `, numeroFactura: " FAC/2026/0206 " },
      },
      ALEX,
    );
    expect(d.tipo).toBe("revertir");
    if (d.tipo !== "revertir") return;
    expect(d.bitacora).toContain(`${ALEX} sacó este cobro de Cobrado y lo pasó a Por cobrar.`);
    expect(d.bitacora).toContain(`Motivo: ${MOTIVO}`);
    expect(d.bitacora).toContain(`Lo había confirmado ${IMPORT} el 2026-02-15, con el pago fechado el 2026-02-15.`);
    expect(d.bitacora).toContain("Esa firma es de una importación, no de una persona");
    expect(d.bitacora).toContain("Fecha de emisión corregida: 2026-02-15 → 2026-02-04.");
    expect(d.bitacora).toContain("Factura: FAC/2026/0206.");
    expect(d.bitacora).toContain(`La marca de facturado pasa de «${IMPORT}» a ${ALEX}.`);
    expect(d.refirmarFacturado).toBe(true);
    expect(d.firmasDespues).toEqual({
      estado: "POR_COBRAR",
      confirmadoPor: null,
      fechaCobroISO: null,
      fechaEmisionISO: "2026-02-04",
      facturadoPor: ALEX,
    });
  });

  it("un verde de una persona: cita su referencia y NO le cambia la firma de facturado", () => {
    const d = decidir(CONFIRMADO_A_MANO, { estado: "POR_COBRAR", reversion: { motivo: MOTIVO } }, ALEX);
    expect(d.tipo).toBe("revertir");
    if (d.tipo !== "revertir") return;
    expect(d.bitacora).toContain(
      "Lo había confirmado dmarin@smarteamcr.com el 2026-08-20, con el pago fechado el 2026-08-19 y la referencia TRX-4471.",
    );
    expect(d.bitacora).not.toContain("importación");
    expect(d.bitacora).not.toContain("Fecha de emisión");
    expect(d.bitacora).not.toContain("Factura:");
    expect(d.refirmarFacturado).toBe(false);
    expect(d.firmasDespues.facturadoPor).toBe("dmarin@smarteamcr.com");
  });

  it("se re-firma aunque la fecha no cambie: la firma del import no queda viva", () => {
    const d = decidir(GLOBAL_SUPPLY, { estado: "POR_COBRAR", reversion: { motivo: MOTIVO } }, ALEX);
    expect(d.tipo === "revertir" && d.refirmarFacturado).toBe(true);
  });

  it("volver a PROGRAMADO quitando la factura limpia la marca y lo dice", () => {
    const d = decidir(
      GLOBAL_SUPPLY,
      { estado: "PROGRAMADO", fechaEmisionISO: null, reversion: { motivo: MOTIVO } },
      ALEX,
    );
    expect(d.tipo).toBe("revertir");
    if (d.tipo !== "revertir") return;
    expect(d.refirmarFacturado).toBe(false);
    expect(d.firmasDespues.facturadoPor).toBeNull();
    expect(d.bitacora).toContain("Se quitó la fecha de emisión (era 2026-02-15).");
    expect(d.bitacora).toContain(`Se quitó la marca de facturado de ${IMPORT}.`);
  });

  it("poner la fecha a un cobro que no la tenía lo firma quien revierte", () => {
    const sinFactura = { ...CONFIRMADO_A_MANO, fechaEmisionISO: null, facturadoPor: null };
    const d = decidir(
      sinFactura,
      { estado: "POR_COBRAR", fechaEmisionISO: "2026-06-10", reversion: { motivo: MOTIVO } },
      ALEX,
    );
    expect(d.tipo).toBe("revertir");
    if (d.tipo !== "revertir") return;
    expect(d.firmasDespues.facturadoPor).toBe(ALEX);
    expect(d.bitacora).toContain("Fecha de emisión de la factura: 2026-06-10.");
  });
});

/** Todos los verdes de los casos, contra todas las salidas posibles de COBRADO. */
const MATRIZ = [
  GLOBAL_SUPPLY,
  CONFIRMADO_A_MANO,
  { ...CONFIRMADO_A_MANO, fechaEmisionISO: null, facturadoPor: null },
].flatMap((a) =>
  [
    { estado: "POR_COBRAR", fechaEmisionISO: "2026-06-10" },
    { estado: "POR_COBRAR" },
    { estado: "PROGRAMADO" },
    { estado: "PROGRAMADO", fechaEmisionISO: null },
    { estado: "PROGRAMADO", fechaEmisionISO: "2026-06-17" },
    { estado: "SIN_DATO", fechaEmisionISO: null },
  ].map((p) => [a, p] as const),
);

describe("una reversión nunca deja INV3 ni INV5 en rojo", () => {
  it.each(MATRIZ)("%o → %o", (a, p) => {
    const d = decidir(a, { ...p, reversion: { motivo: MOTIVO } }, ALEX);
    if (d.tipo !== "revertir") return; // un rechazo no escribe nada
    expect(violaINV3(d.firmasDespues)).toBe(false);
    expect(violaINV5(d.firmasDespues)).toBe(false);
    expect(d.firmasDespues.confirmadoPor).toBeNull();
    expect(d.firmasDespues.fechaCobroISO).toBeNull();
  });
});

describe("el chokepoint escribe lo que la regla decide", () => {
  /**
   * `firmasDespues` es un MODELO de lo que escribe `cambiarEstadoCobroTx`, y los tests de arriba
   * prueban el modelo. Sin este bloque el chokepoint podía dejar de re-firmar `facturadoPor`, o de
   * limpiar `confirmadoPor` al revertir, con todo en verde: se probó a mano el 2026-09-12.
   */
  const dia = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00.000Z`) : null);
  const texto = (v: unknown) => (typeof v === "string" ? v : null);
  const isoDe = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : null);

  /** Una base de mentira con la fila del cobro, que anota qué se escribió. */
  function baseFalsa(antes: CobroAntesDeRevertir) {
    const fila: Record<string, unknown> = {
      id: "c1",
      cuentaId: "cuenta-1",
      estado: antes.estado,
      confirmadoPor: antes.confirmadoPor,
      confirmadoEn: dia(antes.confirmadoEnISO),
      fechaCobro: dia(antes.fechaCobroISO),
      fechaEmision: dia(antes.fechaEmisionISO),
      facturadoPor: antes.facturadoPor,
      referenciaExterna: antes.referenciaExterna,
      promesaPago: null,
    };
    const escrito = { cambio: null as Record<string, unknown> | null, bitacoras: [] as Record<string, unknown>[] };
    const db = {
      cobro: {
        findUnique: async () => fila,
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
    /** Cómo quedó la fila, leída con la forma de `firmasDespues`. */
    const firmasEscritas = (): FirmasDelCobro => {
      const f = { ...fila, ...(escrito.cambio ?? {}) };
      return {
        estado: texto(f.estado) ?? "",
        confirmadoPor: texto(f.confirmadoPor),
        fechaCobroISO: isoDe(f.fechaCobro),
        fechaEmisionISO: isoDe(f.fechaEmision),
        facturadoPor: texto(f.facturadoPor),
      };
    };
    return { db, escrito, firmasEscritas };
  }

  it.each(MATRIZ)("%o → %o", async (a, p) => {
    const d = decidir(a, { ...p, reversion: { motivo: MOTIVO } }, ALEX);
    const patch = cobroPatchSchema.parse({ estado: p.estado, fechaEmision: p.fechaEmisionISO, reversion: { motivo: MOTIVO } });
    const { db, escrito, firmasEscritas } = baseFalsa(a);

    if (d.tipo !== "revertir") {
      await expect(cambiarEstadoCobroTx(db as never, "c1", patch, ALEX)).rejects.toBeInstanceOf(CobranzaError);
      expect(escrito.cambio, "un rechazo no escribe nada").toBeNull();
      expect(escrito.bitacoras).toEqual([]);
      return;
    }
    await cambiarEstadoCobroTx(db as never, "c1", patch, ALEX);
    expect(firmasEscritas()).toEqual(d.firmasDespues);
    expect(escrito.bitacoras).toEqual([
      expect.objectContaining({ cobroId: "c1", cuentaId: "cuenta-1", contenido: d.bitacora, usuarioEmail: ALEX }),
    ]);
  });

  it("sin motivo da 400 y no toca la fila ni la bitácora", async () => {
    const { db, escrito } = baseFalsa(GLOBAL_SUPPLY);
    const patch = cobroPatchSchema.parse({ estado: "POR_COBRAR" });
    await expect(cambiarEstadoCobroTx(db as never, "c1", patch, ALEX)).rejects.toMatchObject({ status: 400 });
    expect(escrito.cambio).toBeNull();
    expect(escrito.bitacoras).toEqual([]);
  });
});

describe("la frontera HTTP", () => {
  it("el PATCH rechaza un motivo en blanco antes de llegar a la base (400)", () => {
    expect(cobroPatchSchema.safeParse({ estado: "POR_COBRAR", reversion: { motivo: "   " } }).success).toBe(false);
    expect(cobroPatchSchema.safeParse({ estado: "POR_COBRAR", reversion: {} }).success).toBe(false);
  });

  it("y deja pasar el pedido completo, con el motivo recortado", () => {
    const r = cobroPatchSchema.safeParse({
      estado: "POR_COBRAR",
      fechaEmision: "2026-06-17",
      reversion: { motivo: `  ${MOTIVO} `, numeroFactura: "FAC/2026/0302" },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.reversion?.motivo).toBe(MOTIVO);
  });
});

/** Quita bloques de comentario y líneas `//`: una guarda no puede cumplirse con su propia prosa. */
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const fuente = (...ruta: string[]) => sinComentarios(readFileSync(join(__dirname, "..", "..", ...ruta), "utf8"));

describe("el armado: la regla corre donde se escribe el estado", () => {
  it("⛔ el chokepoint decide la reversión antes de escribir, y escribe la bitácora con el mismo cliente", () => {
    const src = fuente("lib", "cobranza", "mutations.ts");
    const inicio = src.indexOf("export async function cambiarEstadoCobroTx(");
    const fin = src.indexOf("export async function cambiarEstadoCobro(");
    expect(inicio).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(inicio);
    const cuerpo = src.slice(inicio, fin);

    const decide = cuerpo.indexOf("decidirReversion(");
    const escribe = cuerpo.indexOf("db.cobro.update(");
    expect(decide, "el chokepoint dejó de usar decidirReversion").toBeGreaterThan(-1);
    expect(decide, "la reversión se decide DESPUÉS de escribir").toBeLessThan(escribe);
    expect(cuerpo).toMatch(/reversion\.tipo === "rechazo"\) throw new CobranzaError/);
    expect(cuerpo).toMatch(/reversion\.refirmarFacturado/);
    expect(cuerpo, "la bitácora tiene que ir por `db`, no por `prisma`").toMatch(
      /db\.bitacoraCobro\.create\(\{[\s\S]*?contenido: reversion\.bitacora/,
    );
  });

  it("⛔ la versión sin transacción abre una: cambio y bitácora quedan juntos o no queda nada", () => {
    const src = fuente("lib", "cobranza", "mutations.ts");
    const wrapper = src.slice(src.indexOf("export async function cambiarEstadoCobro("));
    expect(wrapper.slice(0, 400)).toMatch(/prisma\.\$transaction\(\(tx\) => cambiarEstadoCobroTx\(tx,/);
  });

  it("⛔ la regla no importa zod ni el schema: la usa un diálogo del navegador", () => {
    /* Un import de valor desde acá se lleva al bundle todo lo que este archivo importe. Con
       `./schema` adentro serían 266 KB de zod para pintar un formulario. */
    const src = fuente("lib", "cobranza", "reversion-cobro.ts");
    expect(src).toMatch(/export const MOTIVO_REVERSION_MIN/);
    expect(src).not.toMatch(/from\s+["'](zod|\.\/schema|@\/lib\/cobranza\/schema)["']/);
    expect(fuente("components", "cobranza", "RevertirCobroDialog.tsx")).not.toMatch(/@\/lib\/cobranza\/schema/);
  });

  it("el chokepoint pasa las etiquetas de la pantalla, no los nombres del enum", () => {
    expect(fuente("lib", "cobranza", "mutations.ts")).toMatch(/byEmail,\s*ESTADO_COBRO_LABEL,\s*\)/);
  });

  it("el cronograma no saca un cobro de COBRADO sin pasar por el diálogo", () => {
    const src = fuente("components", "cobranza", "CronogramaCobros.tsx");
    expect(src).toMatch(/else if \(c\.estado === "COBRADO"\) setRevertirCobro\(\{ cobro: c, estado \}\)/);
    expect(src).toMatch(/<RevertirCobroDialog/);
    expect(src).toMatch(/reversion: \{ motivo, numeroFactura \}/);
  });
});
