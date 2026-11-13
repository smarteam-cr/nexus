/**
 * Las fuentes de Cobranza en «Para ti» (2026-11-13): a quién le llega cada cosa. La base y las cargas van simuladas.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Alcance } from "./alcance-server";

const base = vi.hoisted(() => ({
  ventas: [] as unknown[],
  tabla: [] as unknown[],
  vencidas: [] as unknown[],
  contratos: [] as unknown[],
  cuentas: [] as unknown[],
  conteos: { ventas: 0, proyectos: 0, confirma: 0 },
  cargas: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    ventaGanada: { count: async () => base.conteos.ventas },
    cobroDelProyecto: { count: async ({ where }: { where: Record<string, unknown> }) => ("cobraEmail" in where ? base.conteos.proyectos : base.conteos.confirma) },
  },
}));
vi.mock("@/lib/cobranza/seguimiento-server", () => ({
  cargarVentasSinCobro: async () => {
    base.cargas++;
    return base.ventas;
  },
  cargarTablaDeProduccion: async () => base.tabla,
  primerasCuotasVencidas: async () => base.vencidas,
  cargarContratos: async () => base.contratos,
}));
vi.mock("@/lib/mi-dia/lecturas-server", () => ({ cuentasDelPedido: async () => base.cuentas }));

const { COBRANZA_A_TU_CARGO, COBRANZA_CONTRATOS, COBRANZA_PRIMERA_CUOTA, COBRANZA_PRODUCCION } = await import("./fuentes/cobranza");

const ctx = { ahora: new Date("2026-11-13T15:00:00Z"), hoyISO: "2026-11-13" };
const alcance = (email: string, p: Partial<Alcance> = {}): Alcance =>
  ({ email, nombre: email, rol: "ADMIN", teamMemberId: "tm", frentes: [], permisos: { sections: { cobranza: { read: true } } }, proyectos: [], ...p }) as unknown as Alcance;
const proyecto = (id: string, clientId: string, encargado = true) => ({ id, name: id, clientId, empresa: clientId, altaEstado: null, multiproyecto: false, encargado });

beforeEach(() => {
  Object.assign(base, { ventas: [], tabla: [], vencidas: [], contratos: [], cuentas: [], conteos: { ventas: 0, proyectos: 0, confirma: 0 }, cargas: 0 });
});

describe("negocios ganados sin cobro (punto 11)", () => {
  const v = (id: string, responsable: string) => ({ id, nombre: `Venta ${id}`, clienteNombre: `Cliente ${id}`, responsable });

  it("⭐ a María José, por defecto, una línea con sus ventas", async () => {
    base.ventas = [v("a", "mzamora@smarteamcr.com"), v("b", "mzamora@smarteamcr.com"), v("c", "otra@smarteamcr.com")];
    const [p] = await COBRANZA_A_TU_CARGO.medir(alcance("mzamora@smarteamcr.com"), ctx);
    expect(p.titulo).toBe("Carga el cobro de 2 negocios ganados");
    expect(p.href).toBe("/cobranza?ver=seguimiento");
    expect(p.cantidad).toBe(2);
  });

  it("a quien no tiene nada asignado no se le carga nada (una consulta barata)", async () => {
    base.ventas = [v("a", "mzamora@smarteamcr.com")];
    expect(await COBRANZA_A_TU_CARGO.medir(alcance("otra@smarteamcr.com"), ctx)).toEqual([]);
    expect(base.cargas).toBe(0);
  });

  it("solo quien ve Cobranza", () => {
    expect(COBRANZA_A_TU_CARGO.aplica!(alcance("x@y.com", { permisos: { sections: {} } } as never))).toBe(false);
  });
});

describe("el paso a producción (punto 15)", () => {
  const fila = (id: string, confirma: string, clave: string) => ({ id, nombre: id, clienteNombre: `Cliente ${id}`, clientId: `c-${id}`, confirma, cobra: "mzamora@smarteamcr.com", situacion: { clave } });

  it("⭐ a Alejandro Salas, una línea por desarrollo terminado sin confirmar", async () => {
    base.tabla = [fila("noelito", "asalas@smarteamcr.com", "falta-confirmar"), fila("otro", "asalas@smarteamcr.com", "en-desarrollo")];
    const xs = await COBRANZA_PRODUCCION.medir(alcance("asalas@smarteamcr.com", { rol: "DEV" }), ctx);
    expect(xs.map((x) => x.clave)).toEqual(["cobranza-produccion:noelito"]);
    expect(xs[0].href).toBe("/cobranza/production");
    expect(xs[0].detalle).toMatch(/Stripe/);
  });

  it("a otra persona de Desarrollo sin proyectos asignados, nada", async () => {
    base.tabla = [fila("noelito", "asalas@smarteamcr.com", "falta-confirmar")];
    expect(await COBRANZA_PRODUCCION.medir(alcance("bsalas@smarteamcr.com", { rol: "DEV" }), ctx)).toEqual([]);
  });
});

describe("la regla de los 15 días (punto 13)", () => {
  it("⭐ a quien lleva el proyecto del servicio, o a quien lleva la cuenta si el servicio no tiene proyecto", async () => {
    base.vencidas = [
      { clientId: "c1", clienteNombre: "Cúprica", servicioId: "s1", servicio: "Sales Hub", projectId: "p1", dias: 3 },
      { clientId: "c1", clienteNombre: "Cúprica", servicioId: "s2", servicio: "Soporte", projectId: "p-otro", dias: 9 },
      { clientId: "c2", clienteNombre: "Construtecho", servicioId: "s3", servicio: "Guatemala", projectId: null, dias: 228 },
      { clientId: "c3", clienteNombre: "Ajena", servicioId: "s4", servicio: "X", projectId: null, dias: 20 },
    ];
    const a = alcance("cse@smarteamcr.com", { rol: "CSE", proyectos: [proyecto("p1", "c1"), proyecto("p2", "c2")] } as never);
    const xs = await COBRANZA_PRIMERA_CUOTA.medir(a, ctx);
    expect(xs.map((x) => x.clave)).toEqual(["cobranza-primera-cuota:s1", "cobranza-primera-cuota:s3"]);
    expect(xs[0].titulo).toBe("Cúprica: la primera cuota de «Sales Hub» lleva 3 días vencida");
    expect(xs[0].href).toBe("/clients/c1?tab=p1");
    expect(xs[1].detalle).toMatch(/pausar/);
    for (const x of xs) expect(`${x.titulo} ${x.detalle}`).not.toMatch(/\$|₡/);
  });

  it("solo a quien es encargado de algo", () => {
    expect(COBRANZA_PRIMERA_CUOTA.aplica!(alcance("x@y.com", { proyectos: [proyecto("p", "c", false)] } as never))).toBe(false);
  });
});

describe("los contratos recurrentes (punto 16)", () => {
  it("avisa el fin y la cuenta con contrato que no avanza (más de 21 días sin contacto)", async () => {
    base.contratos = [
      { servicioId: "k1", clientId: "c1", clienteNombre: "Wherex", servicio: "Soporte", aviso: { clave: "por-vencer", fin: "2026-12-01", dias: 18, renovacion: "manual" } },
      { servicioId: "k2", clientId: "c2", clienteNombre: "Fomento", servicio: "Web", aviso: null },
    ];
    base.cuentas = [
      { clientId: "c1", nombre: "wherex.com", ultimoContacto: "2026-11-10T12:00:00Z" },
      { clientId: "c2", nombre: "fomento.cr", ultimoContacto: "2026-10-01T12:00:00Z" },
    ];
    const a = alcance("cse@smarteamcr.com", { rol: "CSE", proyectos: [proyecto("p1", "c1"), proyecto("p2", "c2")] } as never);
    const xs = await COBRANZA_CONTRATOS.medir(a, ctx);
    expect(xs.map((x) => x.clave)).toEqual(["cobranza-contratos:fin:k1", "cobranza-contratos:sin-avance:c2"]);
    expect(xs[0].titulo).toBe("Wherex: el contrato de «Soporte» vence en 18 días");
    expect(xs[0].cuando).toBe("semana");
    expect(xs[1].titulo).toBe("Fomento paga un contrato recurrente y no avanza");
    expect(xs[1].detalle).toMatch(/43 días/);
  });
});
