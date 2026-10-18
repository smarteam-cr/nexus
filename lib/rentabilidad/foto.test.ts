/**
 * lib/rentabilidad/foto.test.ts — LA FOTO DEL MARGEN DE CADA MES (E6, 2026-10-17).
 *
 * La foto no recalcula: guarda lo que el cálculo en vivo dijo del mes, redondeado. Un período es la suma de sus meses. El
 * job toma la foto del mes que cerró desde el día 3 a las 7:00 CR. Y nadie más que foto-server.ts escribe las tablas.
 *
 * Correr: `npx vitest run lib/rentabilidad/foto.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  armarFoto,
  datosDesdeLaFoto,
  esMesCerrado,
  juntarMeses,
  mesQueTocaFotografiar,
  mesesCerradosDelAnio,
  resumenDelOrigen,
} from "./foto";
import { costoDeLaHora, filaDeMargen, rangoDelMes, rangoDelPeriodo, tablaDeMargen, type CuentaParaMargen } from "./margen";
import type { DatosDeRentabilidad, OrigenDelMes } from "./tipos";

/** El instante UTC de una hora de Costa Rica (UTC−6). */
const cr = (fecha: string, hora: number) => new Date(Date.parse(`${fecha}T00:00:00Z`) + (hora + 6) * 3_600_000);

function cuenta(id: string, x: Partial<CuentaParaMargen> = {}): CuentaParaMargen {
  return {
    clienteId: id,
    nombre: `Cuenta ${id}`,
    cse: "Ana",
    ingreso: 1000,
    fuenteDelIngreso: "Cobranza",
    horas: { reuniones: 4, preparacion: 1, entrega: 5, declarada: 2 },
    reuniones: 3,
    plan: { sesiones: 2, horasTareas: 4 },
    costos: { persona: 210.123, equipo: 230.456 },
    factor: 1.4,
    porPersona: [{ email: "ana@x.com", horas: 10 }],
    ...x,
  };
}

function mes(m: string, x: Partial<DatosDeRentabilidad> = {}): DatosDeRentabilidad {
  const totales = { planilla: 5000.555, horasPagadas: 320, horasConClientes: 100, ingreso: 3000, horasPorSesion: 5 / 3 };
  return {
    rango: { periodo: "mes", meses: [m], etiqueta: m },
    totales,
    costoDeLaHora: costoDeLaHora(totales),
    cuentas: [cuenta("a"), cuenta("b", { ingreso: 2000, costos: { persona: 400, equipo: 380 }, porPersona: [{ email: "beto@x.com", horas: 10 }] })],
    personas: { conCosto: 2, sinCosto: ["Carla"], fuentes: { libro: 2, "libro-media": 0, "costo-recurrente": 0 } },
    costos: {
      personas: [
        { id: "p1", email: "ana@x.com", nombre: "Ana", equipo: "Customer Success", planilla: 2500, horasPagadas: 160, costoHora: 2500 / 160, horasConClientes: 10, fuente: "libro" },
        { id: "p2", email: "beto@x.com", nombre: "Beto", equipo: "Customer Success", planilla: 2500.555, horasPagadas: 160, costoHora: 2500.555 / 160, horasConClientes: 10, fuente: "libro" },
      ],
      equipos: [{ equipo: "Customer Success", personas: 2, planilla: 5000.555, horasPagadas: 320, costoHora: 5000.555 / 320, horasConClientes: 20, parteConClientes: 20 / 320 }],
    },
    horasPorOrigen: { calendario: 8, declaradas: 4, estimadas: 8 },
    avisos: ["Sin tipo de cambio para algo."],
    preparacionMin: 20,
    fuentes: [{ mes: m, supuestos: { id: "cfg1", guardadaEn: "2026-09-01T00:00:00.000Z", guardadaPor: "csl@x.com" }, tasa: { crcPorUsd: 505.5, fuente: "BCCR" } }],
    ...x,
  };
}

describe("armarFoto: guarda lo que dijo el cálculo, redondeado", () => {
  it("los márgenes salen de filaDeMargen con cada modo, a centavos", () => {
    const d = mes("2026-08");
    const f = armarFoto("2026-08", d);
    const a = f.cuentas.find((c) => c.clientId === "a")!;
    const tarifa = d.costoDeLaHora.cargado!;
    const persona = filaDeMargen(d.cuentas[0], tarifa, d.totales.horasPorSesion, "persona");
    const cargado = filaDeMargen(d.cuentas[0], tarifa, d.totales.horasPorSesion, "cargado");
    expect(a.costoPersona).toBe(210.12);
    expect(a.costoEquipo).toBe(230.46);
    expect(a.margenPersona).toBe(Math.round(persona.margen * 100) / 100);
    expect(a.costoCargado).toBe(Math.round(cargado.costo * 100) / 100);
    expect(a.margenCargado).toBe(Math.round(cargado.margen * 100) / 100);
  });

  it("las horas por origen: calendario = reuniones, respondido = lo declarado, estimado = el resto", () => {
    const a = armarFoto("2026-08", mes("2026-08")).cuentas.find((c) => c.clientId === "a")!;
    expect([a.horasCalendario, a.horasRespondidas, a.horasEstimadas]).toEqual([4, 2, 4]);
  });

  it("dice de dónde salió: la versión de los supuestos y el tipo de cambio del mes", () => {
    const f = armarFoto("2026-08", mes("2026-08"));
    expect(f.mes.supuestos.id).toBe("cfg1");
    expect(f.mes.tasa).toEqual({ crcPorUsd: 505.5, fuente: "BCCR" });
    expect(f.mes.planilla).toBe(5000.56);
  });

  it("armar dos veces el mismo mes da lo mismo (escribirlo dos veces deja las mismas filas)", () => {
    expect(armarFoto("2026-08", mes("2026-08"))).toEqual(armarFoto("2026-08", mes("2026-08")));
  });

  it("no arma la foto de un mes con el cálculo de otro rango", () => {
    expect(() => armarFoto("2026-08", mes("2026-09"))).toThrow(/se arma con el cálculo de ese mes/);
    expect(() => armarFoto("2026-08", { ...mes("2026-08"), rango: { periodo: "trimestre", meses: ["2026-07", "2026-08"], etiqueta: "x" } })).toThrow();
  });
});

describe("datosDesdeLaFoto: lo guardado se lee como el cálculo en vivo", () => {
  it("la tabla de margen sale igual (a centavos) desde la foto", () => {
    const d = mes("2026-08");
    const f = armarFoto("2026-08", d);
    const leido = datosDesdeLaFoto(rangoDelMes("2026-08"), f.mes, f.cuentas);
    for (const modo of ["persona", "equipo", "cargado"] as const) {
      const vivo = tablaDeMargen(d.cuentas, d.costoDeLaHora.cargado ?? 0, d.totales.horasPorSesion, modo).conIngreso;
      const foto = tablaDeMargen(leido.cuentas, leido.costoDeLaHora.cargado ?? 0, leido.totales.horasPorSesion, modo).conIngreso;
      expect(foto.map((x) => x.clienteId)).toEqual(vivo.map((x) => x.clienteId));
      foto.forEach((x, i) => expect(x.margen).toBeCloseTo(vivo[i].margen, 1));
    }
  });

  it("una cuenta sin plan vuelve sin plan", () => {
    const d = mes("2026-08", { cuentas: [cuenta("a", { plan: null })] });
    const f = armarFoto("2026-08", d);
    expect(datosDesdeLaFoto(rangoDelMes("2026-08"), f.mes, f.cuentas).cuentas[0].plan).toBeNull();
  });
});

describe("juntarMeses: un período es la suma de sus meses", () => {
  const rango = rangoDelPeriodo("trimestre", cr("2026-10-17", 10));
  const origenes: OrigenDelMes[] = rango.meses.map((m, i) => ({
    mes: m,
    etiqueta: rangoDelMes(m).etiqueta,
    origen: i === 2 ? "vivo" : "foto",
    tomadaAt: i === 2 ? null : "2026-10-03T13:00:00.000Z",
    tomadaPor: i === 2 ? null : "sistema",
    motivo: null,
  }));
  const tres = rango.meses.map((m) => mes(m));
  const junto = juntarMeses(rango, tres, origenes);

  it("suma lo cobrado, las horas y la planilla; el cargado es la planilla ÷ las horas con clientes", () => {
    expect(junto.totales.ingreso).toBe(9000);
    expect(junto.totales.horasConClientes).toBe(300);
    expect(junto.costoDeLaHora.cargado).toBeCloseTo((5000.555 * 3) / 300, 6);
    const a = junto.cuentas.find((c) => c.clienteId === "a")!;
    expect(a.ingreso).toBe(3000);
    // v2 (2026-10-18): las horas fuera de Meet y las tareas internas viajan en cero cuando los meses no las tienen.
    expect(a.horas).toEqual({ reuniones: 12, preparacion: 3, entrega: 15, declarada: 6, reunionesSinMeet: 0, tareas: 0, tareasAgenda: 0 });
    expect(a.costos?.persona).toBeCloseTo(630.369, 6);
    expect(a.plan).toEqual({ sesiones: 6, horasTareas: 12 });
    expect(a.porPersona).toEqual([{ email: "ana@x.com", horas: 30 }]);
  });

  it("las horas por sesión se recalculan con las horas y las reuniones de las cuentas", () => {
    // Cada cuenta: (4 reuniones + 1 preparación) h en 3 reuniones, por 3 meses y 2 cuentas.
    expect(junto.totales.horasPorSesion).toBeCloseTo(5 / 3, 6);
  });

  it("el costo de la hora de cada persona sale de su planilla y sus horas pagadas de los tres meses", () => {
    const ana = junto.costos.personas.find((p) => p.id === "p1")!;
    expect(ana.planilla).toBe(7500);
    expect(ana.horasPagadas).toBe(480);
    expect(ana.costoHora).toBeCloseTo(7500 / 480, 6);
    expect(junto.costos.equipos[0].personas).toBe(2);
    expect(junto.personas.conCosto).toBe(2);
  });

  it("quien tuvo planilla en algún mes no queda «sin planilla»", () => {
    const conAna = juntarMeses(rango, [mes(rango.meses[0], { personas: { conCosto: 1, sinCosto: ["Ana", "Carla"], fuentes: { libro: 1, "libro-media": 0, "costo-recurrente": 0 } } }), mes(rango.meses[1])]);
    expect(conAna.personas.sinCosto).toEqual(["Carla"]);
  });

  it("cada aviso dice de qué mes es, y los meses dicen de dónde salen", () => {
    expect(junto.avisos[0]).toMatch(/^jul 2026: /);
    expect(junto.origenDeLosMeses).toEqual(origenes);
    expect(junto.fuentes.map((f) => f.mes)).toEqual(rango.meses);
  });

  it("un mes solo, junto, es el mismo mes", () => {
    const uno = juntarMeses(rangoDelMes("2026-08"), [mes("2026-08")]);
    const d = mes("2026-08");
    expect(uno.totales.ingreso).toBe(d.totales.ingreso);
    expect(uno.cuentas.map((c) => c.costos)).toEqual(d.cuentas.map((c) => c.costos));
    expect(uno.avisos).toEqual(d.avisos);
  });
});

describe("cuándo se toma la foto", () => {
  it("desde el día 3 a las 7:00 CR, del mes que cerró", () => {
    expect(mesQueTocaFotografiar(cr("2026-10-02", 23))).toBeNull();
    expect(mesQueTocaFotografiar(cr("2026-10-03", 6))).toBeNull();
    expect(mesQueTocaFotografiar(cr("2026-10-03", 7))).toBe("2026-09");
    expect(mesQueTocaFotografiar(cr("2026-10-31", 22))).toBe("2026-09");
    expect(mesQueTocaFotografiar(cr("2027-01-05", 8))).toBe("2026-12");
  });

  it("solo un mes cerrado tiene foto", () => {
    const hoy = cr("2026-10-17", 10);
    expect(esMesCerrado("2026-09", hoy)).toBe(true);
    expect(esMesCerrado("2026-10", hoy)).toBe(false);
    expect(esMesCerrado("2026-13", hoy)).toBe(false);
    // El 1 de octubre a las 3:00 de la tarde en UTC todavía es 1 de octubre en Costa Rica; el 1 a las 2:00 UTC es 30 de septiembre.
    expect(esMesCerrado("2026-09", new Date("2026-10-01T02:00:00Z"))).toBe(false);
  });

  it("los meses del año que ya cerraron (en enero, ninguno)", () => {
    expect(mesesCerradosDelAnio(cr("2026-10-17", 10))).toHaveLength(9);
    expect(mesesCerradosDelAnio(cr("2027-01-10", 10))).toEqual([]);
  });

  it("la línea de la cabecera dice si los meses salen de su foto o en vivo", () => {
    const o = (origen: "foto" | "vivo"): OrigenDelMes => ({ mes: "2026-08", etiqueta: "ago 2026", origen, tomadaAt: null, tomadaPor: null, motivo: null });
    expect(resumenDelOrigen([o("foto"), o("foto")])).toBe("Todos los meses desde su foto");
    expect(resumenDelOrigen([o("vivo")])).toBe("En vivo: el mes no tiene foto");
    expect(resumenDelOrigen([o("foto"), o("vivo"), o("vivo")])).toBe("1 de 3 meses desde su foto; el resto, en vivo");
  });
});

describe("⛔ un solo escritor", () => {
  const RAIZ = process.cwd();
  const ESCRITOR = "lib/rentabilidad/foto-server.ts";
  const archivos = (dir: string): string[] =>
    readdirSync(join(RAIZ, dir)).flatMap((n) => {
      const p = join(RAIZ, dir, n);
      if (statSync(p).isDirectory()) return n === "node_modules" ? [] : archivos(relative(RAIZ, p));
      return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [relative(RAIZ, p).replace(/\\/g, "/")] : [];
    });

  it(`solo ${ESCRITOR} escribe FotoMargenMes y FotoMargenCuenta`, () => {
    const escribe = /fotoMargen(Mes|Cuenta)\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/;
    const otros = ["lib", "app", "scripts", "components"].flatMap(archivos).filter((f) => f !== ESCRITOR && escribe.test(readFileSync(join(RAIZ, f), "utf8")));
    expect(otros).toEqual([]);
    expect(escribe.test(readFileSync(join(RAIZ, ESCRITOR), "utf8"))).toBe(true);
  });

  it("la ruta que toma la foto es solo de dirección: guardCostosAccess primero", () => {
    const src = readFileSync(join(RAIZ, "app/api/cobranza/costos/foto-del-margen/route.ts"), "utf8");
    const cuerpo = src.slice(src.indexOf("export async function POST"));
    expect(cuerpo.search(/guardCostosAccess\(\)/)).toBeGreaterThan(-1);
    expect(cuerpo.search(/guardCostosAccess\(\)/)).toBeLessThan(cuerpo.search(/tomarFotoDelMes\(/));
  });
});
