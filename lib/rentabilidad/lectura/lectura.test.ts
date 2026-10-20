import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { DatosDeRentabilidad } from "@/lib/rentabilidad/tipos";
import { detectarSenales, UMBRALES, type EntradaDeLasSenales } from "./senales";
import { armarMensaje, entradaDesdeLosDatos, leerPropuestas, MAX_TOKENS_DE_LA_LECTURA, PROMPT_DE_LA_LECTURA, type MesDelEquilibrio } from "./contexto";
import { estadoDeLaPropuesta, mesQueTocaLeer } from "./estado";

// ── Datos con MARCAS en todo lo que nunca puede llegar al prompt ─────────────
const MARCAS = ["NOMBRE_SECRETO", "secreto@smarteamcr.com", "CSE_SECRETO", "otro_secreto@smarteamcr.com", "987654", "PLANILLA_SECRETA"];

function datosConMarcas(): DatosDeRentabilidad {
  return {
    rango: { periodo: "trimestre", meses: ["2026-07", "2026-08", "2026-09"], etiqueta: "jul – sep 2026" },
    totales: { planilla: 987654, horasPagadas: 3000, horasConClientes: 1200, ingreso: 90_000, horasPorSesion: 1.5 },
    costoDeLaHora: { directo: 30, cargado: 75, ingresoPorHora: 75, parteAClientes: 0.4 },
    cuentas: [
      {
        clienteId: "c-baja",
        nombre: "Cuenta Floja",
        cse: "CSE_SECRETO",
        ingreso: 10_000,
        fuenteDelIngreso: "Cobranza",
        horas: { reuniones: 100, preparacion: 20, entrega: 40 },
        reuniones: 30,
        plan: null,
        costos: { persona: 9000, equipo: 9500 },
        porPersona: [{ email: "otro_secreto@smarteamcr.com", horas: 160 }],
      },
      {
        clienteId: "c-sin",
        nombre: "Cuenta Sin Cobro",
        cse: "CSE_SECRETO",
        ingreso: 0,
        fuenteDelIngreso: null,
        horas: { reuniones: 12, preparacion: 2, entrega: 0 },
        reuniones: 6,
        plan: null,
        porPersona: [{ email: "secreto@smarteamcr.com", horas: 14 }],
      },
      {
        clienteId: "c-sana",
        nombre: "Cuenta Sana",
        cse: null,
        ingreso: 80_000,
        fuenteDelIngreso: "Odoo",
        horas: { reuniones: 50, preparacion: 10, entrega: 40 },
        reuniones: 20,
        plan: null,
      },
    ],
    personas: { conCosto: 1, sinCosto: ["NOMBRE_SECRETO"], fuentes: { libro: 1, "libro-media": 0, "costo-recurrente": 0 } },
    costos: {
      personas: [
        { id: "p1", email: "secreto@smarteamcr.com", nombre: "NOMBRE_SECRETO", equipo: "Customer Success", planilla: 987654, horasPagadas: 500, costoHora: 41.23, horasConClientes: 300, fuente: "libro" },
      ],
      equipos: [{ equipo: "Customer Success", personas: 1, planilla: 987654, horasPagadas: 500, costoHora: 41.23, horasConClientes: 300, parteConClientes: 0.6 }],
    },
    horasPorOrigen: { calendario: 162, declaradas: 0, estimadas: 112 },
    avisos: ["PLANILLA_SECRETA no entra"],
    preparacionMin: 30,
    fuentes: [],
  };
}

const MESES_EQ: MesDelEquilibrio[] = [
  { periodo: "2026-07", ingresosTotales: 30_000, pendienteFacturar: 0, futuro: false, estado: "COMPLETO" },
  { periodo: "2026-08", ingresosTotales: 50_000, pendienteFacturar: 0, futuro: false, estado: "COMPLETO" },
  { periodo: "2026-09", ingresosTotales: 20_000, pendienteFacturar: 0, futuro: false, estado: "PARCIAL" },
  { periodo: "2026-11", ingresosTotales: 0, pendienteFacturar: 15_000, futuro: true, estado: "PARCIAL" },
];

describe("⛔ lo que nunca entra al prompt de la lectura", () => {
  it("ni nombres, ni correos, ni la planilla, ni el CSE, ni quién atendió cada cuenta", () => {
    const entrada = entradaDesdeLosDatos({ rentabilidad: datosConMarcas(), meses: MESES_EQ, piso: 40_000, meta: null });
    const senales = detectarSenales(entrada);
    const texto = `${PROMPT_DE_LA_LECTURA}\n${armarMensaje(entrada, senales)}\n${JSON.stringify(entrada)}`;
    for (const m of MARCAS) expect(texto, `«${m}» llegó al prompt`).not.toContain(m);
  });

  it("la puerta no lee los campos de personas (escaneo del código, sin comentarios)", () => {
    const fuente = fs
      .readFileSync(path.join(process.cwd(), "lib/rentabilidad/lectura/contexto.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    for (const prohibido of ["costos.personas", "porPersona", ".cse", "planilla", "personas.sinCosto", ".avisos"]) {
      expect(fuente, `contexto.ts nombra «${prohibido}»`).not.toContain(prohibido);
    }
  });

  it("el servidor solo le pasa al modelo lo que armó la puerta", () => {
    const fuente = fs.readFileSync(path.join(process.cwd(), "lib/rentabilidad/lectura/servidor.ts"), "utf8");
    expect(fuente).toMatch(/content: armarMensaje\(entrada, senales\)/);
    expect(fuente).toMatch(/system: PROMPT_DE_LA_LECTURA/);
  });
});

describe("detectarSenales: lo que no progresa", () => {
  const entrada = entradaDesdeLosDatos({ rentabilidad: datosConMarcas(), meses: MESES_EQ, piso: 40_000, meta: null });
  const senales = detectarSenales(entrada);

  it("solvencia: los meses cerrados y completos bajo el piso, y los que vienen sin llegar", () => {
    const s = senales.find((x) => x.tipo === "solvencia")!;
    expect(s.datos).toMatchObject({ mesesBajoElPiso: "2026-07", brecha: 10_000, mesesPorVenirBajo: "2026-11", brechaPorVenir: 25_000 });
    // septiembre está PARCIAL: no se juzga.
    expect(String(s.datos.mesesBajoElPiso)).not.toContain("2026-09");
  });

  it("margen de una cuenta: con cobros y margen cargado bajo el umbral", () => {
    const s = senales.filter((x) => x.tipo === "margen-cuenta");
    expect(s.map((x) => x.clienteId)).toEqual(["c-baja"]);
    // 160 h × 75 = 12.000 de costo cargado contra 10.000 cobrados.
    expect(s[0].datos).toMatchObject({ ingreso: 10_000, costo: 12_000, margen: -2000 });
    expect(UMBRALES.margenBajo).toBe(0.15);
  });

  it("horas sin facturar: una cuenta con 10 h o más y sin cobro", () => {
    expect(senales.filter((x) => x.tipo === "horas-sin-facturar").map((x) => x.clienteId)).toEqual(["c-sin"]);
  });

  it("la meta: solo si falta algo", () => {
    const base: EntradaDeLasSenales = { ...entrada, meta: { anio: 2027, monto: 2_300_000, falta: 1_000_000, recurrenciaMensual: 50_000, expansiones: 100_000, nuevos: 0 } };
    expect(detectarSenales(base).some((s) => s.tipo === "meta" && s.clave === "meta:2027:2026-09")).toBe(true);
    expect(detectarSenales({ ...base, meta: { ...base.meta!, falta: 0 } }).some((s) => s.tipo === "meta")).toBe(false);
  });

  it("sin piso, sin cuentas flojas y sin meta: ninguna señal (no se llama al modelo)", () => {
    expect(detectarSenales({ ...entrada, piso: null, cuentas: [], meta: null })).toEqual([]);
  });
});

describe("leerPropuestas: lo que devuelve el modelo, validado", () => {
  const entrada = entradaDesdeLosDatos({ rentabilidad: datosConMarcas(), meses: MESES_EQ, piso: 40_000, meta: null });
  const senales = detectarSenales(entrada);
  const buena = { clave: senales[0].clave, titulo: "Subir el piso facturado", queVe: "Julio no cubrió el piso.", propuesta: "Facturar lo pendiente.", inversionUsd: null, inversionNota: null };

  it("una por señal; lo que no calza (clave inventada, repetida o sin campos) se descarta", () => {
    const r = leerPropuestas({ propuestas: [buena, { ...buena }, { ...buena, clave: "inventada" }, { clave: senales[1].clave }] }, senales);
    expect(r.propuestas).toHaveLength(1);
    expect(r.propuestas[0].senal.clave).toBe(senales[0].clave);
    expect(r.descartadas).toBe(3);
  });

  it("una respuesta sin forma no rompe: cero propuestas", () => {
    expect(leerPropuestas(null, senales)).toEqual({ propuestas: [], descartadas: 0 });
  });
});

describe("el ciclo de una propuesta y cuándo lee el job", () => {
  const ahora = new Date("2026-10-18T15:00:00Z");
  it("pendiente, vencida a los 30 días, o lo decidido", () => {
    expect(estadoDeLaPropuesta({ estado: "pendiente", createdAt: "2026-10-10T00:00:00Z" }, ahora)).toBe("pendiente");
    expect(estadoDeLaPropuesta({ estado: "pendiente", createdAt: "2026-09-01T00:00:00Z" }, ahora)).toBe("vencido");
    expect(estadoDeLaPropuesta({ estado: "usado", createdAt: "2026-01-01T00:00:00Z" }, ahora)).toBe("usado");
  });
  it("el día 4 desde las 8:00 de Costa Rica lee el mes que cerró; antes, nada", () => {
    expect(mesQueTocaLeer(new Date("2026-10-04T13:59:00Z"))).toBeNull(); // 7:59 CR
    expect(mesQueTocaLeer(new Date("2026-10-04T14:00:00Z"))).toBe("2026-09");
    expect(mesQueTocaLeer(new Date("2026-10-03T20:00:00Z"))).toBeNull();
    expect(mesQueTocaLeer(new Date("2027-01-10T15:00:00Z"))).toBe("2026-12");
  });
});

describe("el tope de la respuesta alcanza para todas las señales", () => {
  it("una de solvencia, las cuentas de cada clase y la meta, con cada propuesta en el tope del esquema", () => {
    // Con 3000 la respuesta se cortaba y el job reintentaba cada hora (21 corridas el 2026-10-19).
    const maxSenales = 1 + 2 * UMBRALES.cuentasPorClase + 1;
    // Unos 4.100 caracteres por propuesta con los topes de zod (titulo, queVe, propuesta, inversionNota): ~1.300 tokens.
    expect(MAX_TOKENS_DE_LA_LECTURA).toBeGreaterThanOrEqual(maxSenales * 1300);
    // Sin streaming, el SDK exige streaming por encima de 21.333 (KNOWN-ERRORS / DECISIONS «FIX streaming»).
    expect(MAX_TOKENS_DE_LA_LECTURA).toBeLessThanOrEqual(21_333);
  });
});
