/**
 * lib/clients/datos-de-la-empresa.test.ts — quién manda en cada dato de la empresa, fila por fila del catálogo, y cómo se
 * leen los valores. La regla: DECISIONS › «Los datos de la empresa» (punto 4).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CATALOGO_DE_DATOS,
  CLAVES_DE_DATO,
  EDICIONES_DE_LA_ESCALA,
  INDUSTRIAS_DE_SMARTEAM,
  columnasDelDato,
  datoDeLaEmpresa,
  dominioDelSitio,
  edicionDeLaIndustria,
  leerValor,
  plegarDatosDeLaEmpresa,
  quienManda,
  SELECT_DE_LOS_DATOS,
  textoDelContador,
  valorParaMostrar,
  type DatoDeLaEmpresa,
  type FuenteDeDato,
  type ValorDeDato,
} from "./datos-de-la-empresa";

/** Dos valores distintos y válidos para el dato, para armar «hay uno y llega otro». */
function dosValores(d: DatoDeLaEmpresa): [ValorDeDato, ValorDeDato] {
  if (d.tipo === "opcion") return [d.opciones![0].valor, d.opciones![1].valor];
  if (d.tipo === "texto") return ["uno", "otro"];
  const base = Math.max(d.min ?? 0, 1);
  return [base, base + 1];
}

const decide = (d: DatoDeLaEmpresa, actual: { valor: ValorDeDato | null; fuente: FuenteDeDato | null }, valor: ValorDeDato | null, fuente: FuenteDeDato, puedeDecidir = true) =>
  quienManda({ dato: d, actual, propuesta: { valor, fuente }, puedeDecidir }).accion;

describe("el catálogo", () => {
  it("tiene un dato por clave, sin repetidos, y cada opción es única", () => {
    expect(CATALOGO_DE_DATOS.map((d) => d.clave)).toEqual([...CLAVES_DE_DATO]);
    for (const d of CATALOGO_DE_DATOS) {
      if (d.tipo === "opcion") {
        expect(d.opciones!.length, d.clave).toBeGreaterThanOrEqual(2);
        expect(new Set(d.opciones!.map((o) => o.valor)).size, d.clave).toBe(d.opciones!.length);
      }
    }
  });

  it("cada dato tiene su columna, su fuente y su fecha en el esquema de Client y en el SQL", () => {
    const raiz = resolve(__dirname, "../..");
    const esquema = readFileSync(resolve(raiz, "prisma/schema.prisma"), "utf8");
    const client = esquema.slice(esquema.indexOf("model Client {"), esquema.indexOf("\n}", esquema.indexOf("model Client {")));
    const sql = readFileSync(resolve(raiz, "scripts/sql/2026-10-25-datos-de-la-empresa.sql"), "utf8");
    for (const d of CATALOGO_DE_DATOS) {
      const c = columnasDelDato(d.clave);
      for (const col of [c.valor, c.fuente, c.at]) expect(client, `${col} en Client`).toMatch(new RegExp(`\\n\\s+${col}\\s`));
      if (d.clave !== "tamUsd" && d.clave !== "industry") expect(sql, `${c.valor} en el SQL`).toContain(`"${c.valor}"`);
      expect(sql, `${c.fuente} en el SQL`).toContain(`"${c.fuente}"`);
      expect(sql, `${c.at} en el SQL`).toContain(`"${c.at}"`);
    }
  });

  it("las 17 industrias de Smarteam apuntan a una edición que existe o a la general", () => {
    expect(INDUSTRIAS_DE_SMARTEAM).toHaveLength(17);
    const ediciones = new Set(EDICIONES_DE_LA_ESCALA.map((e) => e.valor));
    for (const i of INDUSTRIAS_DE_SMARTEAM) if (i.edicion) expect(ediciones.has(i.edicion), i.valor).toBe(true);
    expect(edicionDeLaIndustria("Turismo")).toBe("turismo");
    expect(edicionDeLaIndustria("Software")).toBeNull();
    expect(edicionDeLaIndustria("no existe")).toBeNull();
  });

  it("el TAM conserva el techo de 100 millones y el null distinto de 0", () => {
    const tam = datoDeLaEmpresa("tamUsd");
    expect(leerValor(tam, 100_000_001).ok).toBe(false);
    expect(leerValor(tam, 0)).toEqual({ ok: true, valor: 0 });
    expect(leerValor(tam, null)).toEqual({ ok: true, valor: null });
  });

  it("el TAM no se escribe en ninguna propiedad que vea el cliente: va a tam__potencial", () => {
    expect(datoDeLaEmpresa("tamUsd").hubspot?.propiedad).toBe("tam__potencial");
  });
});

describe.each(CATALOGO_DE_DATOS.map((d) => [d.clave, d] as const))("quién manda en «%s»", (_clave, d) => {
  const [a, b] = dosValores(d);
  const vacio = { valor: null, fuente: null };

  it("un valor igual al que está no hace nada", () => {
    expect(decide(d, { valor: a, fuente: "hubspot" }, a, "investigacion")).toBe("nada");
  });

  it("una persona que decide lo aplica; una que no, lo propone", () => {
    expect(decide(d, { valor: a, fuente: "nexus" }, b, "persona", true)).toBe("aplicar");
    expect(decide(d, { valor: a, fuente: "nexus" }, b, "persona", false)).toBe("proponer");
  });

  it("lo que una persona corrigió no lo pisa nadie más: lo proponen", () => {
    for (const f of ["hubspot", "investigacion", "reunion", "nexus", "preventa", "test"] as const) {
      expect(decide(d, { valor: a, fuente: "persona" }, b, f), f).toBe("proponer");
    }
  });

  it("vaciarlo a propósito también es una decisión: lo vacío por una persona no se vuelve a llenar solo", () => {
    for (const f of ["hubspot", "investigacion", "nexus", "preventa"] as const) {
      expect(decide(d, { valor: null, fuente: "persona" }, a, f), f).toBe("proponer");
    }
  });

  it("un valor vacío solo lo pone una persona (o Nexus en lo que calcula): HubSpot o la IA vacíos no borran", () => {
    for (const f of ["hubspot", "investigacion"] as const) expect(decide(d, { valor: a, fuente: "hubspot" }, null, f), f).toBe("nada");
    expect(decide(d, { valor: a, fuente: "nexus" }, null, "nexus")).toBe(d.manda === "nexus" ? "aplicar" : "nada");
    expect(decide(d, { valor: a, fuente: "persona" }, null, "nexus")).toBe(d.manda === "nexus" ? "proponer" : "nada");
    expect(decide(d, { valor: a, fuente: "hubspot" }, null, "persona", true)).toBe("aplicar");
  });

  if (d.manda === "persona") {
    it("lo decide una persona: la IA siempre propone, aunque esté vacío", () => {
      for (const f of ["investigacion", "reunion", "nexus"] as const) {
        expect(decide(d, vacio, a, f), f).toBe("proponer");
        expect(decide(d, { valor: a, fuente: f }, b, f), f).toBe("proponer");
      }
    });
    it("HubSpot, la preventa o el test llenan lo vacío; si hay otro valor, proponen", () => {
      for (const f of ["hubspot", "preventa", "test"] as const) {
        expect(decide(d, vacio, a, f), f).toBe("aplicar");
        expect(decide(d, { valor: a, fuente: "investigacion" }, b, f), f).toBe("proponer");
      }
      expect(decide(d, { valor: a, fuente: "hubspot" }, b, "hubspot")).toBe("aplicar");
    });
  }

  if (d.manda === "hubspot") {
    it("manda HubSpot: lo de HubSpot se aplica; lo demás solo llena lo vacío", () => {
      expect(decide(d, { valor: a, fuente: "investigacion" }, b, "hubspot")).toBe("aplicar");
      for (const f of ["investigacion", "reunion", "preventa", "test"] as const) {
        expect(decide(d, vacio, a, f), f).toBe("aplicar");
        expect(decide(d, { valor: a, fuente: "hubspot" }, b, f), f).toBe("proponer");
      }
    });
  }

  if (d.manda === "nexus") {
    it("lo calcula Nexus: Nexus lo aplica; la IA propone; una persona de afuera llena lo vacío", () => {
      expect(decide(d, vacio, a, "nexus")).toBe("aplicar");
      expect(decide(d, { valor: a, fuente: "nexus" }, b, "nexus")).toBe("aplicar");
      expect(decide(d, vacio, a, "investigacion")).toBe("proponer");
      expect(decide(d, vacio, a, "hubspot")).toBe("aplicar");
      expect(decide(d, { valor: a, fuente: "nexus" }, b, "hubspot")).toBe("proponer");
    });
    it("lo que puso otra persona (la preventa, HubSpot, el test) Nexus no lo pisa al recalcular: lo propone", () => {
      for (const f of ["hubspot", "preventa", "test"] as const) {
        expect(decide(d, { valor: a, fuente: f }, b, "nexus"), f).toBe("proponer");
        expect(decide(d, { valor: a, fuente: f }, null, "nexus"), f).toBe("proponer");
      }
      expect(decide(d, { valor: a, fuente: "nexus" }, null, "nexus")).toBe("aplicar");
    });
  }
});

describe("leerValor", () => {
  it("una opción se acepta por su valor o por su etiqueta, sin tildes ni mayúsculas", () => {
    const d = datoDeLaEmpresa("perfilCierre");
    expect(leerValor(d, "transaccional")).toEqual({ ok: true, valor: "transaccional" });
    expect(leerValor(d, "MIXTA")).toEqual({ ok: true, valor: "mixta" });
    expect(leerValor(datoDeLaEmpresa("perfilDespues"), "unica")).toEqual({ ok: true, valor: "única" });
    expect(leerValor(datoDeLaEmpresa("industriaSmarteam"), "Tecnología")).toEqual({ ok: true, valor: "Tecnologia" });
    expect(leerValor(d, "otra cosa").ok).toBe(false);
  });

  it("los números: enteros, sin separadores, dentro de sus límites", () => {
    const e = datoDeLaEmpresa("empleados");
    expect(leerValor(e, "1250")).toEqual({ ok: true, valor: 1250 });
    expect(leerValor(e, " 1 250 ")).toEqual({ ok: true, valor: 1250 });
    expect(leerValor(e, 12.5).ok).toBe(false);
    expect(leerValor(e, 0).ok).toBe(false);
    expect(leerValor(e, "muchos").ok).toBe(false);
    expect(leerValor(datoDeLaEmpresa("facturacionAnualUsd"), 1234.567)).toEqual({ ok: true, valor: 1234.57 });
  });

  it("un monto con puntos o comas de miles no se adivina: se pide de nuevo (50.000 no es 50)", () => {
    const tam = datoDeLaEmpresa("tamUsd");
    for (const t of ["50.000", "1.500.000", "1,500", "1500000,50"]) {
      const r = leerValor(tam, t);
      expect(r.ok, t).toBe(false);
      if (!r.ok) expect(r.error, t).toMatch(/sin puntos ni comas/);
    }
    expect(leerValor(tam, "1234.5")).toEqual({ ok: true, valor: 1234.5 });
    expect(leerValor(datoDeLaEmpresa("empleados"), "12.5").ok).toBe(false);
    expect(leerValor(datoDeLaEmpresa("facturacionAnualUsd"), 999_999_999_999).ok).toBe(true);
    expect(leerValor(datoDeLaEmpresa("facturacionAnualUsd"), 1_000_000_000_000).ok).toBe(false);
  });

  it("la edición de la escala acepta una edición nueva del documento si tiene forma de clave", () => {
    const ed = datoDeLaEmpresa("edicionEscala");
    expect(leerValor(ed, "banca")).toEqual({ ok: true, valor: "banca" });
    expect(leerValor(ed, "salud-y-farma")).toEqual({ ok: true, valor: "salud-y-farma" });
    expect(leerValor(ed, "Salud y farma").ok).toBe(false);
  });

  it("el vacío es «sin dato»", () => {
    expect(leerValor(datoDeLaEmpresa("pais"), "  ")).toEqual({ ok: true, valor: null });
  });

  it("el sitio queda como dominio", () => {
    expect(leerValor(datoDeLaEmpresa("sitioWeb"), "https://www.Empresa.com/nosotros")).toEqual({ ok: true, valor: "empresa.com" });
    expect(dominioDelSitio("empresa.co.cr")).toBe("empresa.co.cr");
  });
});

describe("lo que se muestra", () => {
  it("la etiqueta de la opción y los números con separadores", () => {
    expect(valorParaMostrar(datoDeLaEmpresa("aQuienVende"), "ambos")).toBe("A empresas y a personas");
    expect(valorParaMostrar(datoDeLaEmpresa("empleados"), null)).toBeNull();
  });

  it("el contador cuenta datos", () => {
    expect(textoDelContador(0)).toBeNull();
    expect(textoDelContador(1)).toBe("1 dato por revisar");
    expect(textoDelContador(3)).toBe("3 datos por revisar");
  });
});

describe("plegarDatosDeLaEmpresa (fusionar dos fichas)", () => {
  it("toma de la absorbida lo que la que sigue no tiene, con su fuente y su fecha; lo demás no se toca", () => {
    const at = new Date("2026-10-14T10:00:00Z");
    const sigue = { empleados: 240, empleadosFuente: "hubspot", trafico: null };
    const absorbida = { empleados: 310, empleadosFuente: "persona", trafico: "50k_200k", traficoFuente: "persona", traficoAt: at };
    expect(plegarDatosDeLaEmpresa(sigue, absorbida)).toEqual({ trafico: "50k_200k", traficoFuente: "persona", traficoAt: at });
  });

  it("el TAM viaja con su cálculo", () => {
    const calculo = { version: "v1" };
    expect(plegarDatosDeLaEmpresa({ tamUsd: null }, { tamUsd: 40000, tamFuente: "nexus", tamAt: null, tamCalculo: calculo })).toMatchObject({ tamUsd: 40000, tamCalculo: calculo });
  });

  it("el select pide valor, fuente y fecha de cada dato", () => {
    expect(Object.keys(SELECT_DE_LOS_DATOS)).toHaveLength(CATALOGO_DE_DATOS.length * 3 + 1);
    expect(SELECT_DE_LOS_DATOS).toMatchObject({ tamUsd: true, tamFuente: true, tamAt: true });
  });
});

describe("quién decide los datos (Elías, 2026-10-24)", () => {
  it("la celda clientes.decidirDatos la traen CSE, CSL, Ventas y los super admin; nadie más por defecto", async () => {
    const { DEFAULT_MATRIX, computeEffective } = await import("@/lib/auth/permissions/defaults");
    const conLaCelda = (Object.keys(DEFAULT_MATRIX) as (keyof typeof DEFAULT_MATRIX)[]).filter((r) => DEFAULT_MATRIX[r].sections.clientes.decidirDatos);
    expect(conLaCelda.sort()).toEqual(["CSE", "CSL", "SUPER_ADMIN", "VENTAS"]);
    expect(computeEffective("SUPER_ADMIN", null, null).sections.clientes.decidirDatos).toBe(true);
  });
});
