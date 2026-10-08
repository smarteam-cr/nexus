/**
 * lib/escala/datos/importar.test.ts — la escala como datos: ida y vuelta sin perder una letra.
 *
 * Lo que se prueba es la garantía de la migración: la 8.7.0 (y la que venga) pasa a datos y vuelve
 * a ser el mismo `.md`, byte por byte, y las pantallas leen exactamente la misma escala. Sin contar
 * criterios a mano: el archivo real se compara contra lo que el lector de siempre saca de él.
 */
import { describe, expect, it } from "vitest";
import { leerArchivoDeLaEscala } from "@/lib/escala/documento/archivos";
import { MINI_ESCALA_CON_EDICION } from "@/lib/escala/documento/mini-escala.fixture";
import { criteriosPropios, ETIQUETA_DE_CRITERIO, parsearEscala, todosLosCriterios } from "@/lib/escala/documento/parsear";
import { ErrorDeFormato } from "@/lib/escala/documento/tipos";
import { escalaDeLosDatos, generarMarkdown, versionDeLosDatos } from "./generar";
import { importarEscala, primeraDiferencia } from "./importar";
import { MINI_EN_UNA_FORMA } from "./mini.fixture";
import type { EscalaDatos } from "./tipos";

function criteriosDeLaMatriz(datos: EscalaDatos): string[] {
  return datos.partes.flatMap((p) =>
    p.tipo === "matriz" ? p.areas.flatMap((a) => a.capas.flatMap((c) => c.dimensiones.flatMap((d) => d.niveles.flatMap((n) => n.criterios.map((x) => x.id))))) : [],
  );
}

function errorDe(texto: string): ErrorDeFormato {
  try {
    importarEscala(texto);
  } catch (e) {
    if (e instanceof ErrorDeFormato) return e;
    throw e;
  }
  throw new Error("se esperaba un ErrorDeFormato y el texto se importó");
}

describe("la escala publicada, ida y vuelta", () => {
  const texto = leerArchivoDeLaEscala("escala");
  const normal = texto.replace(/\r\n?/g, "\n");
  const datos = importarEscala(texto);
  const escala = parsearEscala(texto);

  it("generar el .md desde los datos da el mismo texto, byte por byte", () => {
    expect(primeraDiferencia(normal, generarMarkdown(datos))).toBeNull();
  });

  it("las pantallas leen exactamente la misma escala", () => {
    expect(escalaDeLosDatos(datos)).toEqual(escala);
  });

  it("cada criterio de la matriz es un dato, no texto suelto", () => {
    expect(criteriosDeLaMatriz(datos)).toEqual(todosLosCriterios(escala).map((c) => c.id));
  });

  it("cada edición es un dato, con sus criterios propios", () => {
    const ediciones = datos.partes.flatMap((p) => (p.tipo === "ediciones" ? p.ediciones : []));
    expect(ediciones.map((e) => e.nombre)).toEqual(escala.ediciones.map((e) => e.nombre));
    const propios = ediciones.flatMap((e) =>
      e.areas.flatMap((a) => a.dimensiones.flatMap((d) => d.niveles.flatMap((n) => n.criterios.filter((c) => c.tipo === "propio").map((c) => c.id)))),
    );
    expect(propios.sort()).toEqual(criteriosPropios(escala).map((x) => x.criterio.id).sort());
  });

  it("en el texto suelto no quedan criterios ni dimensiones escondidos", () => {
    const sueltos = datos.partes
      .flatMap((p) => p.bloques)
      .flatMap((b) => (b.tipo === "lista" ? b.items.map((i) => `- ${i}`) : b.tipo === "titulo" ? [`${"#".repeat(b.nivel)} ${b.texto}`] : []))
      .filter((l) => ETIQUETA_DE_CRITERIO.test(l) || /^#{2,4} (Área \d+ —|Edición —|\d+\.\d+ )/.test(l));
    expect(sueltos).toEqual([]);
  });

  it("la versión sale del encabezado", () => {
    expect(versionDeLosDatos(datos)).toBe(escala.version);
  });

  it("con saltos de línea de Windows da los mismos datos", () => {
    expect(importarEscala(normal.replace(/\n/g, "\r\n"))).toEqual(datos);
  });
});

describe("la escala de juguete", () => {
  const datos = importarEscala(MINI_EN_UNA_FORMA);

  it("ida y vuelta da el mismo texto y la misma escala", () => {
    expect(generarMarkdown(datos)).toBe(MINI_EN_UNA_FORMA);
    expect(escalaDeLosDatos(datos)).toEqual(parsearEscala(MINI_EN_UNA_FORMA));
  });

  it("reconoce las partes: texto, matriz y ediciones", () => {
    expect(datos.partes.map((p) => p.tipo)).toEqual(["prosa", "prosa", "matriz", "prosa", "ediciones"]);
  });

  it("guarda cada criterio con sus marcas", () => {
    const matriz = datos.partes.find((p) => p.tipo === "matriz");
    if (matriz?.tipo !== "matriz") throw new Error("sin matriz");
    const [procesos] = matriz.areas[0].capas[0].dimensiones;
    expect(procesos.niveles.map((n) => n.letra)).toEqual(["D", "I", "F", "E", "O"]);
    expect(procesos.niveles[2]).toMatchObject({ frase: "Maquinaria base.", resultado: "Nada depende de una persona." });
    expect(procesos.niveles[2].criterios[1]).toEqual({
      id: "1.1.F2",
      texto: "La definición se aplica igual.",
      verificacion: "declarado",
      riesgo: false,
      habito: true,
      perfil: "venta con equipo",
      requiere: [],
    });
  });

  it("guarda la edición: lo que reescribe, lo propio y lo que no aplica", () => {
    const parte = datos.partes.find((p) => p.tipo === "ediciones");
    if (parte?.tipo !== "ediciones") throw new Error("sin ediciones");
    const [ed] = parte.ediciones;
    expect(ed).toMatchObject({ nombre: "Tiendas de juguete", clave: "tiendas", perfilHabitual: "transaccional · recompra." });
    expect(ed.palabras?.filas).toEqual([
      { general: "Negocio", edicion: "Pedido o carrito" },
      { general: "Hábito", edicion: "Rutina de la tienda" },
    ]);
    const [dim] = ed.areas[0].dimensiones;
    expect(ed.areas[0].panoramica).toEqual([{ letra: "F", texto: "La tienda vende sola." }]);
    expect(dim.niveles.map((n) => [n.letra, n.frase])).toEqual([
      ["D", null],
      ["F", "Ningún carrito se pierde en silencio."],
      ["E", null],
    ]);
    expect(dim.niveles[1].criterios.map((c) => `${c.tipo} ${c.id}`)).toEqual(["reescrito 1.2.F1", "propio 1.2.F101"]);
    expect(dim.noAplican).toEqual(["1.2.I1"]);
    expect(dim.seLeenIgual).toEqual(["1.2.F2", "1.2.E1", "1.2.E2", "1.2.O1"]);
  });
});

describe("lo que no se puede guardar como dato se rechaza, con su línea", () => {
  it("un párrafo partido en dos líneas", () => {
    const linea = MINI_ESCALA_CON_EDICION.split("\n").indexOf("En la venta transaccional el negocio es el pedido.") + 1;
    const e = errorDe(MINI_ESCALA_CON_EDICION);
    expect(e.linea).toBe(linea);
    expect(e.message).toContain("¿falta una línea en blanco?");
  });

  it("dos líneas en blanco seguidas (se perderían al generar)", () => {
    const texto = MINI_EN_UNA_FORMA.replace("Intro de la matriz.\n\n", "Intro de la matriz.\n\n\n");
    const e = errorDe(texto);
    expect(e.message).toContain("no se puede guardar como dato");
    // La línea que sobra: la segunda en blanco.
    expect(e.linea).toBe(texto.split("\n").indexOf("Intro de la matriz.") + 3);
  });

  it("un criterio con la etiqueta mal escrita", () => {
    expect(errorDe(MINI_EN_UNA_FORMA.replace("`[1.1.F1 · comprobable]`", "`[1.1.F1 comprobable]`")).message).toContain("etiqueta de este criterio");
  });

  it("una forma de verificación que no existe", () => {
    expect(errorDe(MINI_EN_UNA_FORMA.replace("`[1.1.F1 · comprobable]`", "`[1.1.F1 · comprobado]`")).message).toContain("no es una forma de verificación");
  });

  it("un nivel de la matriz sin su frase", () => {
    expect(errorDe(MINI_EN_UNA_FORMA.replace("**Inicial.** Algo de estructura.", "**Inicial.**")).message).toContain("no tiene su frase");
  });

  it("un documento sin encabezado", () => {
    expect(errorDe(MINI_EN_UNA_FORMA.replace(/^---\n[\s\S]*?\n---\n/, "")).linea).toBe(1);
  });

  it("criterios sueltos en dos listas del mismo nivel", () => {
    const texto = MINI_EN_UNA_FORMA.replace(
      "- Hay un pipeline configurado. `[1.1.F1 · comprobable]`\n",
      "- Hay un pipeline configurado. `[1.1.F1 · comprobable]`\n\n",
    );
    expect(errorDe(texto).message).toContain("van en una sola lista");
  });
});
