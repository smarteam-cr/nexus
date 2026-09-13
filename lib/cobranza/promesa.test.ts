/**
 * lib/cobranza/promesa.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/promesa.test.ts --project unit`.
 *
 * LA PROMESA ES MARCA, NO DESCUENTO — decisión 5 de Alex (dueño de cobranza), 2026-09-12: la
 * factura sigue vencida y queda marcada con la fecha prometida; la alerta no desaparece; si la
 * fecha pasa sin depósito, la alerta sube.
 *
 * ── LO QUE PASABA HASTA ESA FECHA ───────────────────────────────────────────────
 * 1. Una promesa vigente pintaba de azul la factura vencida. La cola, Reportes y el corte cuentan
 *    como vencido solo lo rojo, así que la plata salía del vencido; Proyección nunca miró la promesa
 *    y la seguía contando. Dos pantallas, dos vencidos: US$4.298 de diferencia (AMVAC y AMC).
 * 2. Registrar la promesa posponía las alertas del cobro hasta la fecha prometida: 18 de las 20
 *    alertas pospuestas tenían justo esa fecha.
 * 3. El diálogo decía «el semáforo no cambia» justo antes de cambiarlo.
 *
 * Los cobros de abajo son los de Nexus medidos en solo lectura el 2026-09-12 (monto, fechas de
 * emisión y de promesa, crédito de 15 días). AMVAC usa la fecha del libro de Alex (15-sep; Nexus
 * tiene 14-sep y Alex la confirma). Judesur todavía no está en Nexus: su fila es ilustrativa y
 * existe para que el caso en colones no quede sin probar.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  computeAlertSet,
  computeMetricasCartera,
  marcaPromesa,
  proyectarIngresos,
  semaforoCobro,
  type CarteraEngineInput,
  type CobroProyeccionInput,
} from "./engine";
import { clasificarCobro, resumenAntiguedad, type CobroClasificable } from "./antiguedad";

const HOY = "2026-09-12";

// ── La cartera con promesa, tal como estaba el 2026-09-12 ──────────────────────────

interface CobroDelDia {
  cuenta: string;
  id: string;
  estado: string;
  monto: number;
  moneda: "USD" | "CRC";
  programado: string;
  emitido: string | null;
  prometido: string | null;
}

const CARTERA: CobroDelDia[] = [
  // Vencidas por crédito con promesa VIGENTE: los US$4.298 que la promesa sacaba del vencido.
  { cuenta: "AMVAC", id: "amvac-ago", estado: "POR_COBRAR", monto: 1848, moneda: "USD", programado: "2026-08-15", emitido: "2026-08-15", prometido: "2026-09-15" },
  { cuenta: "AMC", id: "amc-ago", estado: "POR_COBRAR", monto: 2450, moneda: "USD", programado: "2026-08-30", emitido: "2026-08-19", prometido: "2026-09-19" },
  // Dentro del crédito (vence el 18-sep) con promesa vigente: ni vencida ni fuera de la marca.
  { cuenta: "Ecoquintas", id: "ecoquintas-jun", estado: "POR_COBRAR", monto: 1880, moneda: "USD", programado: "2026-06-30", emitido: "2026-09-03", prometido: "2026-09-30" },
  // Promesas INCUMPLIDAS.
  { cuenta: "ALMOTEC", id: "almotec-jun", estado: "PROGRAMADO", monto: 2300, moneda: "USD", programado: "2026-06-15", emitido: "2026-08-19", prometido: "2026-08-31" },
  { cuenta: "ALMOTEC", id: "almotec-jul", estado: "PROGRAMADO", monto: 2300, moneda: "USD", programado: "2026-07-15", emitido: "2026-08-19", prometido: "2026-08-31" },
  { cuenta: "ALMOTEC", id: "almotec-ago", estado: "PROGRAMADO", monto: 2300, moneda: "USD", programado: "2026-08-15", emitido: "2026-08-19", prometido: "2026-08-31" },
  { cuenta: "Construtecho", id: "construtecho-1", estado: "POR_COBRAR", monto: 4560, moneda: "USD", programado: "2026-03-15", emitido: "2026-03-15", prometido: "2026-08-20" },
  { cuenta: "Construtecho", id: "construtecho-2", estado: "POR_COBRAR", monto: 550, moneda: "USD", programado: "2026-03-15", emitido: "2026-03-15", prometido: "2026-08-20" },
  { cuenta: "Construtecho", id: "construtecho-3", estado: "POR_COBRAR", monto: 2280, moneda: "USD", programado: "2026-04-15", emitido: "2026-04-15", prometido: "2026-08-20" },
  { cuenta: "Construtecho", id: "construtecho-4", estado: "POR_COBRAR", monto: 550, moneda: "USD", programado: "2026-04-15", emitido: "2026-04-15", prometido: "2026-08-20" },
  { cuenta: "Iberorutas", id: "iberorutas-may", estado: "POR_COBRAR", monto: 3550, moneda: "USD", programado: "2026-05-15", emitido: "2026-05-15", prometido: "2026-08-31" },
  { cuenta: "Iberorutas", id: "iberorutas-jun", estado: "POR_COBRAR", monto: 3550, moneda: "USD", programado: "2026-06-15", emitido: "2026-06-15", prometido: "2026-08-31" },
  // Promesa sobre un cobro que nunca se facturó: no cuenta.
  { cuenta: "Real Shipping", id: "real-shipping-jul", estado: "PROGRAMADO", monto: 1000, moneda: "USD", programado: "2026-07-15", emitido: null, prometido: "2026-10-05" },
  // Ya cobrado con una promesa vieja: queda como traza, no marca nada.
  { cuenta: "Selvatura", id: "selvatura-feb", estado: "COBRADO", monto: 2000, moneda: "USD", programado: "2026-02-15", emitido: "2026-02-15", prometido: "2026-08-07" },
  // Un futuro sin promesa, para que la proyección tenga algo en sus quincenas.
  { cuenta: "AMVAC", id: "amvac-sep", estado: "PROGRAMADO", monto: 1848, moneda: "USD", programado: "2026-09-30", emitido: null, prometido: null },
  // Colones (ilustrativo: Judesur todavía no está cargado).
  { cuenta: "Judesur", id: "judesur-ago", estado: "POR_COBRAR", monto: 704563, moneda: "CRC", programado: "2026-08-14", emitido: "2026-08-14", prometido: "2026-09-26" },
];

const CREDITO = 15;

const clasificable = (c: CobroDelDia): CobroClasificable => ({
  estado: c.estado,
  fechaProgramada: c.programado,
  fechaEmision: c.emitido,
  promesaPago: c.prometido,
  monto: c.monto,
  moneda: c.moneda,
  creditoDias: CREDITO,
});

const paraProyeccion = (c: CobroDelDia): CobroProyeccionInput => ({
  cobroId: c.id,
  cuentaId: c.cuenta,
  clienteNombre: c.cuenta,
  estado: c.estado,
  fechaProgramadaISO: c.programado,
  monto: c.monto,
  moneda: c.moneda,
  fechaEmisionISO: c.emitido,
  creditoDias: CREDITO,
});

function cartera(cobros: CobroDelDia[]): CarteraEngineInput {
  const porCuenta = new Map<string, CobroDelDia[]>();
  for (const c of cobros) porCuenta.set(c.cuenta, [...(porCuenta.get(c.cuenta) ?? []), c]);
  return {
    cuentas: [...porCuenta.entries()].map(([nombre, lista]) => ({
      cuentaId: nombre,
      clienteNombre: nombre,
      excluidaOperacion: false,
      tieneCuenta: true,
      creditoDias: CREDITO,
      servicios: [],
      cobros: lista.map((c) => ({
        cobroId: c.id,
        servicioId: "s1",
        estado: c.estado,
        origen: "IMPORTACION",
        fechaProgramadaISO: c.programado,
        monto: c.monto,
        moneda: c.moneda,
        fechaCobroISO: c.estado === "COBRADO" ? "2026-09-01" : null,
        fechaEmisionISO: c.emitido,
        promesaPagoISO: c.prometido,
      })),
    })),
  };
}

const del = (id: string): CobroDelDia => {
  const c = CARTERA.find((x) => x.id === id);
  if (!c) throw new Error(`fixture sin el cobro ${id}`);
  return c;
};

const marcaDe = (c: CobroDelDia, hoy = HOY) =>
  marcaPromesa({ estado: c.estado, fechaEmisionISO: c.emitido, promesaPagoISO: c.prometido }, hoy);

// ── marcaPromesa ──────────────────────────────────────────────────────────────────

describe("marcaPromesa — una sola regla, con sus bordes", () => {
  const facturado = { estado: "POR_COBRAR", fechaEmisionISO: "2026-08-15" };

  it("sin promesa no hay marca", () => {
    expect(marcaPromesa({ ...facturado, promesaPagoISO: null }, HOY)).toBeNull();
    expect(marcaPromesa(facturado, HOY)).toBeNull();
  });

  it("el día prometido todavía es vigente; el siguiente, incumplida", () => {
    expect(marcaPromesa({ ...facturado, promesaPagoISO: "2026-09-12" }, HOY)).toBe("vigente");
    expect(marcaPromesa({ ...facturado, promesaPagoISO: "2026-09-13" }, HOY)).toBe("vigente");
    expect(marcaPromesa({ ...facturado, promesaPagoISO: "2026-09-11" }, HOY)).toBe("incumplida");
  });

  it("una fecha con hora se lee como su día (así llega de la base)", () => {
    expect(marcaPromesa({ ...facturado, promesaPagoISO: "2026-09-12T00:00:00.000Z" }, HOY)).toBe("vigente");
  });

  it("⛔ sin factura la promesa no cuenta, aunque la fecha haya pasado (Real Shipping)", () => {
    expect(marcaDe(del("real-shipping-jul"))).toBeNull();
    expect(marcaDe(del("real-shipping-jul"), "2026-10-20")).toBeNull();
  });

  it("un cobro que ya entró no marca nada, aunque la promesa vieja siga guardada (Selvatura)", () => {
    expect(marcaDe(del("selvatura-feb"))).toBeNull();
  });

  it("no mira el crédito: prometer antes del vencimiento y no pagar también es incumplir", () => {
    // IIA: facturada el 4-sep, el crédito corre hasta el 19-sep, prometió el 18-sep.
    const iia = { estado: "PROGRAMADO", fechaEmisionISO: "2026-09-04", promesaPagoISO: "2026-09-18" };
    expect(marcaPromesa(iia, "2026-09-19")).toBe("incumplida");
    expect(semaforoCobro({ ...iia, fechaProgramadaISO: "2026-08-30" }, "2026-09-19")).toBe("azul");
  });
});

// ── La promesa es marca, no descuento ──────────────────────────────────────────────

describe("la promesa es marca, no descuento (AMVAC, Ecoquintas y ALMOTEC)", () => {
  it("AMVAC: vencida con promesa vigente sigue en el vencido, con la marca al lado", () => {
    const amvac = del("amvac-ago");
    expect(marcaDe(amvac)).toBe("vigente");
    expect(clasificarCobro(clasificable(amvac), HOY)).toBe("d0_30");
    const r = resumenAntiguedad([clasificable(amvac)], HOY).USD;
    expect(r.totalVencido).toBe(1848);
    expect(r.vencidoConPromesa).toBe(1848);
    expect(r.nVencidoConPromesa).toBe(1);
  });

  it("Ecoquintas: dentro del crédito la promesa no la adelanta al vencido; el 20-sep entra aunque la promesa siga vigente", () => {
    const eco = del("ecoquintas-jun");
    expect(marcaDe(eco)).toBe("vigente");
    expect(resumenAntiguedad([clasificable(eco)], HOY).USD.totalVencido).toBe(0);
    expect(resumenAntiguedad([clasificable(eco)], HOY).USD.vencidoConPromesa).toBe(0);

    const el20 = resumenAntiguedad([clasificable(eco)], "2026-09-20").USD;
    expect(marcaDe(eco, "2026-09-20")).toBe("vigente");
    expect(el20.totalVencido).toBe(1880);
    expect(el20.vencidoConPromesa).toBe(1880);
  });

  it("ALMOTEC: la fecha pasó sin depósito → incumplida, y la plata sigue vencida", () => {
    const almotec = CARTERA.filter((c) => c.cuenta === "ALMOTEC");
    for (const c of almotec) expect(marcaDe(c)).toBe("incumplida");
    const r = resumenAntiguedad(almotec.map(clasificable), HOY).USD;
    expect(r.totalVencido).toBe(6900);
    expect(r.promesaIncumplida).toBe(6900);
    expect(r.nPromesaIncumplida).toBe(3);
    expect(r.vencidoConPromesa).toBe(0);
  });

  it("Construtecho, Iberorutas y ALMOTEC salen como incumplidas; el corte cuenta lo mismo que la pantalla", () => {
    const hoy = resumenAntiguedad(CARTERA.map(clasificable), HOY).USD;
    expect(hoy.nPromesaIncumplida).toBe(4 + 2 + 3);
    expect(hoy.promesaIncumplida).toBe(7940 + 7100 + 6900);
    expect(hoy.vencidoConPromesa).toBe(4298);
    expect(hoy.nVencidoConPromesa).toBe(2);

    const corte = computeMetricasCartera(cartera(CARTERA), {
      todayISO: HOY,
      desdeUltimoCorteISO: null,
      proximoCorteISO: "2026-09-15",
    }).moneda.USD;
    expect(corte.promesaIncumplida).toBe(hoy.promesaIncumplida);
    expect(corte.nPromesaIncumplida).toBe(hoy.nPromesaIncumplida);
    expect(corte.vencidoConPromesa).toBe(hoy.vencidoConPromesa);
    expect(corte.nVencidoConPromesa).toBe(hoy.nVencidoConPromesa);
  });

  it("las alertas: AMVAC vencida y en ALTA con la fecha; ALMOTEC incumplida; Ecoquintas en silencio", () => {
    const alertas = computeAlertSet(cartera(CARTERA), { todayISO: HOY });
    const deCobro = (id: string) => alertas.filter((a) => a.cobroId === id);

    expect(deCobro("amvac-ago")).toHaveLength(1);
    expect(deCobro("amvac-ago")[0]).toMatchObject({ tipo: "COBRO_VENCIDO", urgencia: "ALTA" });
    expect(deCobro("amvac-ago")[0].mensaje).toContain("prometió pagar el 2026-09-15");

    for (const id of ["almotec-jun", "almotec-jul", "almotec-ago"]) {
      expect(deCobro(id).map((a) => [a.tipo, a.urgencia])).toEqual([["PROMESA_INCUMPLIDA", "ALTA"]]);
    }
    expect(deCobro("ecoquintas-jun")).toEqual([]);
  });
});

// ── El mismo vencido en las tres pantallas ─────────────────────────────────────────

describe("el mismo vencido en la cola, el corte y la proyección", () => {
  /*
   * Hasta el 2026-09-12 no: la cola y Reportes (`resumenAntiguedad`) y el corte
   * (`computeMetricasCartera`) sacaban del vencido lo que tenía promesa, y la proyección
   * (`proyectarIngresos`) no. Sobre la cartera real eso eran US$27.272 contra US$22.974.
   */
  const resumen = resumenAntiguedad(CARTERA.map(clasificable), HOY);
  const corte = computeMetricasCartera(cartera(CARTERA), {
    todayISO: HOY,
    desdeUltimoCorteISO: null,
    proximoCorteISO: "2026-09-15",
  });
  const proyeccion = proyectarIngresos(CARTERA.map(paraProyeccion), { todayISO: HOY });

  for (const moneda of ["USD", "CRC"] as const) {
    it(`${moneda}: las tres dan el mismo total vencido`, () => {
      expect(resumen[moneda].totalVencido).toBe(corte.moneda[moneda].totalVencido);
      expect(proyeccion.vencidos.totales[moneda]).toBe(corte.moneda[moneda].totalVencido);
    });
  }

  it("y ese vencido incluye los US$4.298 con promesa vigente", () => {
    // AMVAC 1.848 + AMC 2.450 + ALMOTEC 6.900 + Construtecho 7.940 + Iberorutas 7.100.
    expect(corte.moneda.USD.totalVencido).toBe(26238);
    expect(corte.moneda.USD.vencidoConPromesa).toBe(4298);
    expect(corte.moneda.CRC.totalVencido).toBe(704563);
  });

  it("el corte nuevo se guarda con otra versión: Reportes no lo compara con los cortes viejos", () => {
    expect(corte.version).toBe(4);
  });
});

// ── Guardas de armado ──────────────────────────────────────────────────────────────

const RAIZ = join(__dirname, "..", "..");
/** Sin comentarios: una guarda que se cumple con el párrafo que explica por qué existe no guarda nada. */
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const leer = (rel: string) => sinComentarios(readFileSync(join(RAIZ, rel), "utf8"));

function fuentes(dir: string): string[] {
  const out: string[] = [];
  for (const nombre of readdirSync(join(RAIZ, dir))) {
    if (nombre === "node_modules" || nombre.startsWith(".")) continue;
    const rel = `${dir}/${nombre}`;
    if (statSync(join(RAIZ, rel)).isDirectory()) out.push(...fuentes(rel));
    else if (/\.tsx?$/.test(nombre) && !/\.test\.ts$/.test(nombre)) out.push(rel);
  }
  return out;
}

/** El nombre de la función declarada más cerca ANTES de `indice` (las de este módulo son de primer nivel). */
function funcionQueContiene(src: string, indice: number): string | null {
  let nombre: string | null = null;
  for (const m of src.matchAll(/function\s+(\w+)/g)) {
    if ((m.index ?? 0) > indice) break;
    nombre = m[1];
  }
  return nombre;
}

describe("registrar una promesa ya no esconde alertas", () => {
  it("⛔ el chokepoint del cobro no toca las alertas", () => {
    const src = leer("lib/cobranza/mutations.ts");
    const inicio = src.indexOf("export async function cambiarEstadoCobroTx(");
    const fin = src.indexOf("export async function cambiarEstadoCobro(");
    expect(inicio).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(inicio);
    const cuerpo = src.slice(inicio, fin);
    expect(cuerpo).not.toMatch(/alertaCobro/);
    expect(cuerpo).not.toMatch(/posponerHasta/);
  });

  it("⛔ `posponerHasta` solo lo escriben el «Posponer» manual (`patchAlerta`) y la alerta que sube de situación (`upsertAlertas`)", () => {
    /* Los únicos archivos que lo nombran: la mutación, la lectura del feed, el schema del PATCH y la
       pantalla que manda ese PATCH. Un archivo nuevo en esta lista es alguien que volvió a posponer
       alertas por su cuenta. */
    const nombran = [...fuentes("lib"), ...fuentes("app"), ...fuentes("components"), ...fuentes("scripts")]
      .filter((f) => /posponerHasta/.test(leer(f)))
      .sort();
    expect(nombran).toEqual([
      "components/cobranza/AlertasCobranza.tsx",
      "lib/cobranza/mutations.ts",
      "lib/cobranza/queries.ts",
      "lib/cobranza/schema.ts",
    ]);

    expect(leer("lib/cobranza/queries.ts")).not.toMatch(/\.alertaCobro\.(create|createMany|update|updateMany|upsert)\(/);

    const src = leer("lib/cobranza/mutations.ts");
    const dondeSeEscribe = new Set(
      [...src.matchAll(/posponerHasta/g)].map((m) => funcionQueContiene(src, m.index ?? 0)),
    );
    expect([...dondeSeEscribe].sort()).toEqual(["patchAlerta", "upsertAlertas"]);

    /* Y en `upsertAlertas` solo como anulación, y solo cuando la alerta sube de situación
       (`subeDeSituacion`, lib/cobranza/alertas-merge.ts). Una asignación con otro valor es alguien
       posponiendo solo. */
    const inicio = src.indexOf("export async function upsertAlertas(");
    const fin = src.indexOf("export async function patchAlerta(");
    expect(inicio).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(inicio);
    const upsert = src.slice(inicio, fin);
    expect([...upsert.matchAll(/posponerHasta:\s*([^,}\s]+)/g)].map((m) => m[1])).toEqual(["null"]);
    expect(upsert).toMatch(/decision\.reabrir\s*\?\s*\{[^}]*posponerHasta: null/);
  });
});

describe("los textos dicen lo que la promesa hace", () => {
  const PANTALLAS = fuentes("components/cobranza");

  it("⛔ ninguna pantalla de cobranza dice que la promesa calla alertas o no cambia nada", () => {
    for (const f of PANTALLAS) {
      const src = leer(f);
      expect(src, f).not.toMatch(/se callan/i);
      expect(src, f).not.toMatch(/el semáforo no cambia/i);
      expect(src, f).not.toMatch(/calla sus alertas|alertas están calladas/i);
    }
  });

  it("el diálogo avisa que la factura sigue vencida y que la alerta sube", () => {
    const dialogo = leer("components/cobranza/PromesaDialog.tsx");
    expect(dialogo).toMatch(/La factura sigue en el vencido/);
    expect(dialogo).toMatch(/sube a Promesa incumplida/);
  });
});
