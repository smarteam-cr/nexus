/**
 * lib/exploraciones/lo-que-ya-sabemos.test.ts — lo que el cliente ya respondió, con sus palabras (iniciativa A).
 * Correr: `npx vitest run lib/exploraciones/lo-que-ya-sabemos.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import { LARCE_AL_ARMAR_LA_GUIA, LARCE_HOY, POSICIONES_DE_LARCE, TESTS_DE_LARCE } from "./__fixtures__/preventa-larce";
import { ESCALA_DE_PRUEBA, estadoDePrueba } from "./escala-de-prueba.test-helpers";
import { limpiarCita, loQueYaSabemos, MAX_LINEAS_DE_LO_QUE_SABEMOS, origenDeLaFuente, saberParaElPedido } from "./lo-que-ya-sabemos";

const saberDe = (estado = LARCE_HOY, tests = TESTS_DE_LARCE) => loQueYaSabemos({ estado, tests, escala: ESCALA_DE_PRUEBA, posiciones: POSICIONES_DE_LARCE });

describe("lo que ya sabemos", () => {
  it("en Larce, de 3 a 5 líneas: primero lo que más duele, con las palabras del cliente y de dónde sale", () => {
    const { lineas } = saberDe();
    expect(lineas.length).toBeGreaterThanOrEqual(3);
    expect(lineas.length).toBeLessThanOrEqual(MAX_LINEAS_DE_LO_QUE_SABEMOS);
    // 1.7 es lo más bajo (Deficiente): va primero, con la nota del test (más fuerte que la frase del test).
    expect(lineas[0]).toMatchObject({ para: "1.7", origen: "nota" });
    expect(lineas[0].texto).toContain("el vendedor lo deja morir");
    expect(lineas[0].de).toContain("Nota del 14 oct");
    expect(lineas[0].de).toContain("Test de Ventas");
    // Lo que el vendedor confirmó como reto (la adopción desigual) va antes que el resto del mismo nivel.
    expect(lineas[1].para).toBe("1.2");
    // Los tiempos ya se saben: están en las líneas.
    expect(lineas.some((l) => l.para === "tiempos")).toBe(true);
  });

  it("una reunión gana a la nota y al test; la nota del test pierde su «Lo marcó así»", () => {
    const { porTema } = saberDe();
    expect(porTema.get("1.3")?.[0]).toMatchObject({ origen: "reunion", de: "Una reunión" });
    expect(porTema.get("1.5")?.map((d) => d.texto)).toContain("El cliente recibe mensajes y propuestas distintos según el vendedor; la calidad depende de cada uno.");
    expect(limpiarCita('Lo marcó así: "Atendemos leads por orden de llegada."')).toBe("Atendemos leads por orden de llegada.");
  });

  it("nunca lo interno: ni presupuesto, ni quién decide, ni objeciones, ni el contexto, ni las notas del vendedor", () => {
    const estado = {
      ...LARCE_HOY,
      contenido: {
        ...LARCE_HOY.contenido,
        casillas: {
          ...LARCE_HOY.contenido.casillas,
          presupuesto: "Unos 20 mil dólares",
          objeciones: [{ texto: "Está caro", clase: "precio" as const }],
        },
      },
    };
    const { porTema, lineas } = saberDe(estado);
    const temas = [...porTema.keys()];
    for (const interno of ["presupuesto", "autoridad", "objeciones", "contexto", "noExplorado"]) expect(temas).not.toContain(interno);
    const todo = [...porTema.values()].flat().map((d) => d.texto).join(" ");
    expect(todo).not.toContain("20 mil");
    expect(todo).not.toContain("Luis");
    expect(todo).not.toContain("conviene abrir");
    expect(lineas.every((l) => l.para !== "presupuesto")).toBe(true);
    expect(origenDeLaFuente("N0")).toBeNull();
  });

  it("lo descartado no cuenta", () => {
    const item = LARCE_HOY.propuesta.items.find((it) => it.destino.tipo === "nivel" && it.destino.dimensionId === "1.6")!;
    const estado = { ...LARCE_HOY, contenido: { ...LARCE_HOY.contenido, descartadas: [item.id] } };
    const textos = (saberDe(estado).porTema.get("1.6") ?? []).map((d) => d.texto);
    expect(textos).not.toContain("Atendemos leads por orden de llegada: no hay criterios para distinguir oportunidades.");
    // Lo que marcó en el test sigue: está en la columna del test, no en lo propuesto.
    expect(textos.some((t) => t.startsWith("Priorizamos por intuición"))).toBe(true);
  });

  it("sin nada del cliente, ninguna línea", () => {
    const vacio = loQueYaSabemos({ estado: estadoDePrueba(), tests: [], escala: ESCALA_DE_PRUEBA, posiciones: {} });
    expect(vacio.lineas).toEqual([]);
    expect(vacio.porTema.size).toBe(0);
  });

  it("al armar la guía de la sesión 2 todavía no se sabían los tiempos", () => {
    const { porTema } = saberDe(LARCE_AL_ARMAR_LA_GUIA);
    expect(porTema.has("tiempos")).toBe(false);
    expect(porTema.has("metas")).toBe(true);
  });

  it("para el pedido, cada tema con su fuente", () => {
    const lineas = saberParaElPedido(saberDe(), (p) => `Tema ${p}`);
    expect(lineas.some((l) => l.startsWith("1.7 («Tema 1.7»): «Cuando un deal se enfría"))).toBe(true);
    expect(lineas.length).toBeLessThanOrEqual(16);
  });
});
