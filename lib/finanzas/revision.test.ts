/**
 * lib/finanzas/revision.test.ts — la revisión de quien supervisa (rediseño de Finanzas, 2026-10-03, etapa «Revisión»).
 *
 * Correr: `npx vitest run lib/finanzas --project unit`.
 */
import { beforeEach, describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  avisosDeGasto,
  avisosDePago,
  borradoSinVer,
  diasEntre,
  enRevision,
  huellaDeBorrado,
  huellaDeGasto,
  huellaDePago,
  huellaEditadaPorOtro,
  leerBorrado,
  ordenDeRevision,
} from "./revision";
import { cargarRevision, marcarCorregido, revisar } from "./revision-server";
import { deleteGasto, updateGasto } from "@/lib/cobranza/mutations";

// Lo de servidor (revision-server.ts y los gastos de lib/cobranza/mutations.ts) se prueba con la base simulada.
const { db } = vi.hoisted(() => ({
  db: {
    teamMember: { findMany: vi.fn() },
    cobro: { findMany: vi.fn(), findUnique: vi.fn() },
    gastoPuntual: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    revisionRegistro: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    // Editar o borrar un gasto mira antes si su mes está cerrado (2026-10-05); acá ninguno lo está.
    cierreMes: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/para-ti/avisos-server", () => ({ avisar: vi.fn() }));
// mutations.ts importa los cargadores de Cobranza; acá no se usan.
vi.mock("@/lib/cobranza/queries", () => ({}));

const DINIA = "dinia@smarteamcr.com";
const ALEX = "alex@smarteamcr.com";
const ELIAS = "egonzalez@smarteamcr.com";
const EQUIPO = [
  { email: DINIA, name: "Dinia Fallas" },
  { email: ALEX, name: "Alex Arrieta" },
  { email: ELIAS, name: "Elías González" },
];

beforeEach(() => {
  for (const tabla of Object.values(db)) {
    if (typeof tabla === "function") tabla.mockReset();
    else for (const fn of Object.values(tabla)) fn.mockReset();
  }
  // Quienes registran: sin Super Admin (Dinia). Por email: cualquiera del equipo.
  db.teamMember.findMany.mockImplementation(async (args: { where: { roleEnum?: unknown } }) =>
    args.where.roleEnum ? EQUIPO.filter((m) => m.email === DINIA) : EQUIPO,
  );
  db.cobro.findMany.mockResolvedValue([]);
  db.gastoPuntual.findMany.mockResolvedValue([]);
  db.revisionRegistro.findMany.mockResolvedValue([]);
  db.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
  db.gastoPuntual.update.mockResolvedValue({ id: "g1" });
  db.gastoPuntual.delete.mockResolvedValue({ id: "g1" });
  db.revisionRegistro.update.mockResolvedValue({});
  db.cierreMes.findFirst.mockResolvedValue(null);
});

const pago = { estado: "COBRADO", monto: 2000, moneda: "USD", fechaCobro: "2026-09-29", referenciaExterna: "TRF-1", numeroFactura: "INV-12" };

describe("la huella de un pago", () => {
  it("cambia si cambia el monto, la fecha en que entró, la referencia o la factura", () => {
    const h = huellaDePago(pago);
    expect(huellaDePago({ ...pago, monto: 2000.5 })).not.toBe(h);
    expect(huellaDePago({ ...pago, fechaCobro: "2026-09-30" })).not.toBe(h);
    expect(huellaDePago({ ...pago, referenciaExterna: "TRF-2" })).not.toBe(h);
    expect(huellaDePago({ ...pago, numeroFactura: null })).not.toBe(h);
  });
  it("no cambia por espacios de más en la referencia", () => {
    expect(huellaDePago({ ...pago, referenciaExterna: " TRF-1 " })).toBe(huellaDePago(pago));
  });
  it("un pago y un gasto con los mismos números no comparten huella", () => {
    expect(huellaDePago(pago)).not.toBe(huellaDeGasto({ nombre: "x", monto: 2000, moneda: "USD", fecha: "2026-09-29" }));
  });
});

describe("enRevision", () => {
  const h = huellaDePago(pago);
  it("sin revisión, es nuevo", () => expect(enRevision(h, null)).toBe("NUEVO"));
  it("revisado y sin cambios, ya no aparece", () => expect(enRevision(h, { estado: "BIEN", huella: h })).toBeNull());
  it("revisado y con un número distinto, vuelve con el aviso", () =>
    expect(enRevision(huellaDePago({ ...pago, monto: 1 }), { estado: "BIEN", huella: h })).toBe("CAMBIO"));
  it("devuelto sigue devuelto aunque lo toquen, hasta que digan que lo corrigieron", () => {
    expect(enRevision(huellaDePago({ ...pago, monto: 1 }), { estado: "DEVUELTO", huella: h })).toBe("DEVUELTO");
    expect(enRevision(h, { estado: "CORREGIDO", huella: h })).toBe("CORREGIDO");
  });
});

describe("los avisos", () => {
  it("cuentan días de calendario", () => {
    expect(diasEntre("2026-07-03", "2026-09-30")).toBe(89);
    expect(diasEntre("2026-09-30T23:10:00.000Z", "2026-10-01")).toBe(1);
  });
  it("un pago registrado 89 días después de entrar lo dice (el de Seléctrica)", () => {
    expect(avisosDePago({ fechaCobro: "2026-07-03", fechaEmision: "2026-06-30", registradoEn: "2026-09-30" })).toEqual([
      "Se registró 89 días después de entrar",
    ]);
  });
  it("un pago al día y con factura no lleva aviso", () => {
    expect(avisosDePago({ fechaCobro: "2026-09-29", fechaEmision: "2026-09-01", registradoEn: "2026-09-30" })).toEqual([]);
  });
  it("una fecha de entrada posterior al registro, o un cobro sin factura, se señalan", () => {
    expect(avisosDePago({ fechaCobro: "2026-10-05", fechaEmision: null, registradoEn: "2026-10-01" })).toEqual([
      "Dice que entró el 5 oct, después de registrarlo",
      "Cobrado sin factura marcada",
    ]);
  });
  it("un gasto anotado tarde o a futuro se señala", () => {
    expect(avisosDeGasto({ fecha: "2026-08-01", registradoEn: "2026-10-01" })).toEqual(["Se anotó 61 días después del gasto"]);
    expect(avisosDeGasto({ fecha: "2026-10-20", registradoEn: "2026-10-03" })).toEqual(["Es una compra a futuro, del 20 oct"]);
    expect(avisosDeGasto({ fecha: "2026-10-02", registradoEn: "2026-10-03" })).toEqual([]);
  });
});

describe("el orden", () => {
  it("primero lo corregido y lo que cambió, después lo más reciente", () => {
    const filas = [
      { id: "a", estado: "NUEVO" as const, registradoEn: "2026-09-01" },
      { id: "b", estado: "NUEVO" as const, registradoEn: "2026-09-20" },
      { id: "c", estado: "CAMBIO" as const, registradoEn: "2026-08-01" },
      { id: "d", estado: "CORREGIDO" as const, registradoEn: "2026-08-15" },
    ];
    expect(ordenDeRevision(filas).map((f) => f.id)).toEqual(["d", "c", "b", "a"]);
  });
  it("lo borrado va primero de todo", () => {
    const filas = [
      { id: "a", estado: "CORREGIDO" as const, registradoEn: "2026-09-01" },
      { id: "b", estado: "BORRADO" as const, registradoEn: "2026-08-01" },
    ];
    expect(ordenDeRevision(filas).map((f) => f.id)).toEqual(["b", "a"]);
  });
});

// ── Decisiones de Elías del 2026-10-05 ──────────────────────────────────────────────────────────────────────────────

/** Un gasto de Dinia, como lo devuelve la base. */
const gastoDeDinia = {
  id: "g1",
  nombre: "Hosting",
  monto: 120,
  moneda: "USD",
  fecha: new Date("2026-09-15T00:00:00Z"),
  tags: [],
  registradoPor: DINIA,
  createdAt: new Date("2026-09-16T15:00:00Z"),
};
const huellaDeDinia = huellaDeGasto({ nombre: "Hosting", monto: 120, moneda: "USD", fecha: "2026-09-15" });
const actualizacionesDeRevision = () =>
  db.revisionRegistro.update.mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data);

describe("D4 · un gasto revisado que se borra le aparece a quien supervisa", () => {
  it("la foto del borrado se lee de vuelta, y una huella que no es de borrado no", () => {
    const foto = { nombre: "Hosting", monto: 120, moneda: "USD", fecha: "2026-09-15", registradoPor: DINIA, registradoEn: "2026-09-16", estadoAntes: "BIEN", comentarioAntes: null };
    expect(leerBorrado(huellaDeBorrado(foto))).toEqual(foto);
    expect(leerBorrado(huellaDeDinia)).toBeNull();
    expect(leerBorrado("BORRADO:{roto")).toBeNull();
  });

  it("está sin ver mientras se haya borrado después de la última revisión", () => {
    const huella = huellaDeBorrado({ nombre: "x", monto: 1, moneda: "USD", fecha: "2026-09-15", registradoPor: DINIA, registradoEn: "2026-09-16", estadoAntes: "BIEN", comentarioAntes: null });
    const revisado = new Date("2026-09-20T12:00:00Z");
    expect(borradoSinVer({ huella, revisadoEn: revisado, corregidoEn: new Date("2026-10-01T12:00:00Z") })).toBe(true);
    expect(borradoSinVer({ huella, revisadoEn: new Date("2026-10-02T12:00:00Z"), corregidoEn: new Date("2026-10-01T12:00:00Z") })).toBe(false);
    expect(borradoSinVer({ huella: huellaDeDinia, revisadoEn: revisado, corregidoEn: new Date("2026-10-01T12:00:00Z") })).toBe(false);
  });

  it("borrar un gasto ya revisado deja en su revisión qué era, el monto, quién lo borró y cuándo", async () => {
    db.gastoPuntual.findUnique.mockResolvedValue(gastoDeDinia);
    db.revisionRegistro.findUnique.mockResolvedValue({ estado: "BIEN", comentario: null, revisadoPor: ALEX });
    await deleteGasto("g1", ELIAS);
    expect(db.gastoPuntual.delete).toHaveBeenCalledTimes(1);
    const [data] = actualizacionesDeRevision();
    expect(data, "se borró sin dejar rastro en la revisión").toBeDefined();
    expect(leerBorrado(data!.huella as string)).toMatchObject({ nombre: "Hosting", monto: 120, moneda: "USD", fecha: "2026-09-15", registradoPor: DINIA });
    expect(data!.corregidoPor).toBe(ELIAS);
    expect(data!.corregidoEn).toBeInstanceOf(Date);
    expect(data!.revisadoEn, "lo borró otra persona: tiene que quedar sin ver").toBeUndefined();
  });

  it("si lo borra quien lo revisó, nace visto; uno sin revisar se borra como siempre", async () => {
    db.gastoPuntual.findUnique.mockResolvedValue(gastoDeDinia);
    db.revisionRegistro.findUnique.mockResolvedValue({ estado: "BIEN", comentario: null, revisadoPor: ALEX });
    await deleteGasto("g1", ALEX);
    const [data] = actualizacionesDeRevision();
    expect(data!.revisadoEn).toEqual(data!.corregidoEn);

    db.revisionRegistro.update.mockClear();
    db.revisionRegistro.findUnique.mockResolvedValue(null);
    await deleteGasto("g1", ELIAS);
    expect(db.revisionRegistro.update).not.toHaveBeenCalled();
  });

  it("la revisión lo muestra hasta que se da por visto", async () => {
    const huella = huellaDeBorrado({ nombre: "Hosting", monto: 120, moneda: "USD", fecha: "2026-09-15", registradoPor: DINIA, registradoEn: "2026-09-16", estadoAntes: "BIEN", comentarioAntes: null });
    const fila = { registroId: "g1", huella, revisadoEn: new Date("2026-09-20T12:00:00Z"), corregidoPor: ELIAS, corregidoEn: new Date("2026-10-01T18:00:00Z") };
    db.revisionRegistro.findMany.mockImplementation(async (args: { where: { huella?: unknown } }) => (args.where.huella ? [fila] : []));
    const r = await cargarRevision();
    expect(r.gastos).toHaveLength(1);
    expect(r.gastos[0]).toMatchObject({ id: "g1", estado: "BORRADO", titulo: "Hosting", monto: 120, moneda: "USD", fecha: "2026-09-15", registradoPor: "Dinia" });
    expect(r.gastos[0]!.borrado).toEqual({ por: "Elías", en: "2026-10-01" });

    const visto = { ...fila, revisadoEn: new Date("2026-10-02T12:00:00Z") };
    db.revisionRegistro.findMany.mockImplementation(async (args: { where: { huella?: unknown } }) => (args.where.huella ? [visto] : []));
    expect((await cargarRevision()).gastos).toHaveLength(0);
  });

  it("«Visto» firma la revisión sin tocar la foto; no se puede devolver", async () => {
    db.revisionRegistro.findMany.mockResolvedValue([{ registroId: "g1" }]);
    await revisar({ accion: "BIEN", items: [{ tipo: "GASTO", id: "g1" }] }, ALEX);
    expect(db.revisionRegistro.upsert).not.toHaveBeenCalled();
    const [data] = actualizacionesDeRevision();
    expect(Object.keys(data!).sort()).toEqual(["revisadoEn", "revisadoPor"]);
    expect(data!.revisadoPor).toBe(ALEX);
    await expect(
      revisar({ accion: "DEVOLVER", items: [{ tipo: "GASTO", id: "g1" }], comentario: "¿por qué?" }, ALEX),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("editar un gasto revisado de otra persona lo vuelve a la revisión y dice quién lo cambió", async () => {
    db.gastoPuntual.findUnique.mockResolvedValue({ registradoPor: DINIA, fecha: gastoDeDinia.fecha });
    db.revisionRegistro.findUnique.mockResolvedValue({ estado: "BIEN", huella: huellaDeDinia, revisadoPor: ALEX });
    await updateGasto("g1", { tags: ["oficina"] }, ELIAS);
    const [data] = actualizacionesDeRevision();
    expect(data, "lo editó otra persona y no volvió a la revisión").toBeDefined();
    expect(data!.huella).not.toBe(huellaDeDinia);
    expect(data!.corregidoPor).toBe(ELIAS);

    // La revisión lo trae como «cambió», con quién.
    db.gastoPuntual.findMany.mockResolvedValue([gastoDeDinia]);
    db.revisionRegistro.findMany.mockImplementation(async (args: { where: { huella?: unknown } }) =>
      args.where.huella
        ? []
        : [{ tipo: "GASTO", registroId: "g1", estado: "BIEN", huella: huellaEditadaPorOtro(huellaDeDinia), comentario: null, corregidoPor: ELIAS }],
    );
    const r = await cargarRevision();
    expect(r.gastos[0]).toMatchObject({ id: "g1", estado: "CAMBIO", cambiadoPor: "Elías" });
  });

  it("si lo edita quien lo anotó o quien lo revisó, no se fuerza nada (la huella ya dice si cambió)", async () => {
    db.gastoPuntual.findUnique.mockResolvedValue({ registradoPor: DINIA, fecha: gastoDeDinia.fecha });
    db.revisionRegistro.findUnique.mockResolvedValue({ estado: "BIEN", huella: huellaDeDinia, revisadoPor: ALEX });
    await updateGasto("g1", { tags: ["oficina"] }, DINIA);
    await updateGasto("g1", { tags: ["oficina"] }, ALEX);
    expect(db.revisionRegistro.update).not.toHaveBeenCalled();
  });
});

describe("D6 · «Ya lo corregí» lo marca quien lo registró o quien supervisa", () => {
  beforeEach(() => {
    db.revisionRegistro.findUnique.mockResolvedValue({ estado: "DEVUELTO" });
    db.gastoPuntual.findUnique.mockResolvedValue({ registradoPor: DINIA });
    db.cobro.findUnique.mockResolvedValue({ confirmadoPor: DINIA });
  });

  it("otra persona del equipo recibe 403, con un mensaje que dice de quién es", async () => {
    for (const tipo of ["GASTO", "PAGO"] as const) {
      await expect(marcarCorregido({ tipo, id: "x" }, { email: "otra@smarteamcr.com", supervisa: false })).rejects.toMatchObject({
        status: 403,
        message: expect.stringContaining("Dinia"),
      });
    }
    expect(db.revisionRegistro.update).not.toHaveBeenCalled();
  });

  it("quien lo registró sí (sin importar mayúsculas), y quien supervisa también", async () => {
    await marcarCorregido({ tipo: "GASTO", id: "x" }, { email: "Dinia@SmarteamCR.com", supervisa: false });
    await marcarCorregido({ tipo: "PAGO", id: "x" }, { email: ALEX, supervisa: true });
    expect(db.revisionRegistro.update).toHaveBeenCalledTimes(2);
  });

  it("la ruta decide «supervisa» con la condición de guardSupervisionFinanzas (isCostosRole sobre el rol del guard)", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "app/api/finanzas/revision/corregido/route.ts"), "utf8");
    expect(src).toContain("marcarCorregido(data, { email: guard.user.email, supervisa: isCostosRole(guard.role) })");
  });
});
