/**
 * lib/landing/modulos-nativos.test.ts — los tres módulos que eran HTML a mano.
 *
 * Correr: `npx vitest run lib/landing/modulos-nativos.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import { coerceToSchema } from "@/lib/ai/section-schema";
import { CATALOGO_DE_CASOS } from "@/lib/casos-de-uso/catalogo";
import { CATALOGO_DE_SECCIONES, tipoCreable } from "./catalogo-de-secciones";
import {
  CASOS_POR_PROYECTO_SCHEMA,
  CASOS_POR_PROYECTO_TYPE,
  COMPARACION_LICENCIAS_SCHEMA,
  COMPARACION_LICENCIAS_TYPE,
  FASES_U_OPCIONES_SCHEMA,
  FASES_U_OPCIONES_TYPE,
  casoDesdeElCatalogo,
  columnasDeFases,
  esDestacada,
  grupoVisible,
  herramientasDe,
  indiceRecomendado,
  marcarRecomendado,
  modoDe,
  resumenDeCasos,
  rotuloDeOrden,
  valorDeLicencia,
  valoresDeFila,
} from "./modulos-nativos";

describe("los tres módulos se pueden crear", () => {
  it("están en el catálogo de secciones creables, con su renderer", () => {
    expect(tipoCreable("casos_por_proyecto")?.sectionType).toBe(CASOS_POR_PROYECTO_TYPE);
    expect(tipoCreable("licencias")?.sectionType).toBe(COMPARACION_LICENCIAS_TYPE);
    expect(tipoCreable("fases")?.sectionType).toBe(FASES_U_OPCIONES_TYPE);
  });

  it("⛔ ninguno pide precios: la plata vive en la Inversión", () => {
    for (const tipo of ["casos_por_proyecto", "licencias", "fases"]) {
      const t = CATALOGO_DE_SECCIONES.find((x) => x.tipo === tipo)!;
      expect(t.brief, `${tipo} tiene que prohibir montos en su guía`).toMatch(/Sin (precios|montos)/);
      const props = Object.keys((t.schema as { properties: Record<string, unknown> }).properties);
      expect(props.some((p) => /precio|monto|inversion/i.test(p)), `${tipo} declara un campo de plata`).toBe(false);
    }
  });

  it("⚠ lo anidado sobrevive a la coerción (grupos → casos, filas → valores, items → incluye)", () => {
    const casos = coerceToSchema(CASOS_POR_PROYECTO_SCHEMA, {
      grupos: [{ nombre: "Comercial", casos: [{ titulo: "Avisa al cliente", herramientas: "Sales Hub" }] }],
    }) as { grupos: { casos: { titulo: string; herramientas: string; detalle: string }[] }[] };
    expect(casos.grupos[0].casos[0].titulo).toBe("Avisa al cliente");
    expect(casos.grupos[0].casos[0].detalle).toBe("");

    const lic = coerceToSchema(COMPARACION_LICENCIAS_SCHEMA, {
      filas: [{ necesidad: "Cotizaciones", valores: ["no", "si"] }],
    }) as { filas: { valores: string[] }[] };
    expect(lic.filas[0].valores).toEqual(["no", "si"]);

    const fases = coerceToSchema(FASES_U_OPCIONES_SCHEMA, {
      items: [{ nombre: "Ordenar", incluye: ["Pipeline", "Propiedades"], destacada: true }],
    }) as { items: { incluye: string[]; destacada: string }[] };
    expect(fases.items[0].incluye).toEqual(["Pipeline", "Propiedades"]);
    // Un booleano no sobrevive: por eso «destacada» habla "si"/"".
    expect(fases.items[0].destacada).toBe("");
  });
});

describe("casos de uso por proyecto", () => {
  it("las herramientas salen del texto separado por comas, sin repetir y con tope", () => {
    expect(herramientasDe("Sales Hub, Data Hub; sales hub ,  , Softland")).toEqual(["Sales Hub", "Data Hub", "Softland"]);
    expect(herramientasDe("a,b,c,d,e,f,g,h")).toHaveLength(6);
    expect(herramientasDe(undefined)).toEqual([]);
  });

  it("el resumen cuenta grupos y casos", () => {
    expect(resumenDeCasos([{ nombre: "A", descripcion: "", casos: [{ titulo: "x", detalle: "", resultado: "", herramientas: "" }] }, { nombre: "B", descripcion: "", casos: [] }])).toEqual({ grupos: 2, casos: 1 });
    expect(resumenDeCasos(null)).toEqual({ grupos: 0, casos: 0 });
  });

  it("la pestaña abierta nunca queda fuera de rango", () => {
    expect(grupoVisible(3, 2)).toBe(2);
    expect(grupoVisible(3, 7)).toBe(0); // se borró la pestaña que estaba abierta
    expect(grupoVisible(0, 0)).toBe(-1);
  });

  it("⛔ un caso del catálogo NUNCA lleva su aviso interno ni los síntomas", () => {
    for (const c of CATALOGO_DE_CASOS) {
      const caso = casoDesdeElCatalogo(c);
      const todo = JSON.stringify(caso);
      if (c.aviso) expect(todo, `${c.id} copió su aviso interno`).not.toContain(c.aviso);
      for (const s of c.sintomas) expect(todo).not.toContain(s);
      expect(caso.titulo).toBe(c.titulo);
      expect(caso.resultado).toBe(c.promesa);
    }
  });
});

describe("comparación de licencias", () => {
  it("lee sí, no y parcial, y deja el resto como texto", () => {
    expect(valorDeLicencia("Sí")).toEqual({ tipo: "si" });
    expect(valorDeLicencia("✓")).toEqual({ tipo: "si" });
    expect(valorDeLicencia("no incluido")).toEqual({ tipo: "no" });
    expect(valorDeLicencia("—")).toEqual({ tipo: "no" });
    expect(valorDeLicencia("Parcial: solo plantillas")).toEqual({ tipo: "parcial", texto: "solo plantillas" });
    expect(valorDeLicencia("Hasta 5 usuarios")).toEqual({ tipo: "texto", texto: "Hasta 5 usuarios" });
    expect(valorDeLicencia("")).toEqual({ tipo: "vacio" });
  });

  it("⚠ la «x» no se interpreta: para unos es sí y para otros es no", () => {
    expect(valorDeLicencia("x")).toEqual({ tipo: "texto", texto: "x" });
  });

  it("un solo plan recomendado: el primero marcado", () => {
    const planes = [
      { nombre: "Starter", nota: "", recomendado: "" },
      { nombre: "Pro", nota: "", recomendado: "si" },
      { nombre: "Enterprise", nota: "", recomendado: "sí" },
    ];
    expect(indiceRecomendado(planes)).toBe(1);
    expect(marcarRecomendado(planes, 2).map((p) => p.recomendado)).toEqual(["", "", "si"]);
    expect(indiceRecomendado(marcarRecomendado(planes, -1))).toBe(-1);
  });

  it("los valores de una fila se normalizan al número de planes", () => {
    expect(valoresDeFila({ valores: ["si"] }, 3)).toEqual(["si", "", ""]);
    expect(valoresDeFila({ valores: ["si", "no", "si", "no"] }, 2)).toEqual(["si", "no"]);
    expect(valoresDeFila(null, 2)).toEqual(["", ""]);
  });
});

describe("fases u opciones", () => {
  it("el modo: solo «opciones» elige; lo demás es una ruta", () => {
    expect(modoDe("opciones")).toBe("opciones");
    expect(modoDe("Options")).toBe("opciones");
    expect(modoDe("fases")).toBe("fases");
    expect(modoDe("")).toBe("fases");
  });

  it("los rótulos: 01, 02 en una ruta; A, B en una elección", () => {
    expect(rotuloDeOrden("fases", 0)).toBe("01");
    expect(rotuloDeOrden("fases", 9)).toBe("10");
    expect(rotuloDeOrden("opciones", 0)).toBe("A");
    expect(rotuloDeOrden("opciones", 2)).toBe("C");
    expect(rotuloDeOrden("opciones", 30)).toBe("31");
  });

  it("las columnas no dejan una tarjeta sola en la segunda fila con dos o cuatro", () => {
    expect([1, 2, 3, 4, 5].map(columnasDeFases)).toEqual([1, 2, 3, 2, 3]);
  });

  it("destacada habla sí/no en texto", () => {
    expect(esDestacada({ destacada: "si" })).toBe(true);
    expect(esDestacada({ destacada: "" })).toBe(false);
    expect(esDestacada(null)).toBe(false);
  });
});
