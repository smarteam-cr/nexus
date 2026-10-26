/**
 * lib/exploraciones/como-llego.test.ts — K2: cómo llegó el prospecto y la primera sesión que abre la puerta (2026-10-27).
 * K6 también: «Agregar algo que sabes» entra entero a la guía. Correr: `npx vitest run lib/exploraciones/como-llego.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import {
  abreLaPuerta,
  bloqueDeAbrirLaPuerta,
  llegadaPropuesta,
  PREGUNTAS_DE_ABRIR_LA_PUERTA,
  presentacionDeSmarteam,
  viaDeLaFuenteDeLead,
  type ContactoParaLaLlegada,
} from "./como-llego";
import { contenidoVacio, propuestaVacia, aplicarOperaciones, VALIDADOR_LIBRE, type EstadoDeExploracion, type Validez } from "./contenido";
import { leerContenido } from "./esquemas";
import { ESCALA_DE_PRUEBA, estadoDePrueba } from "./escala-de-prueba.test-helpers";
import { contextoDelPlan, planDeLaGuia } from "./plan-de-la-guia";
import { contextoDeLaGuia, pedidoDeLaGuia } from "./guia-pedido";
import { claveNuevaDeLoQueSabes, cuandoSeAgrego, LARGO_ENTERO, loQueSabesParaLaGuia } from "./lo-que-sabes";
import { rotuloDeLaNota } from "./notas-de-sesion";

const contacto = (nombre: string, rastro: Partial<ContactoParaLaLlegada["rastro"]> = {}, hizoElTest = false): ContactoParaLaLlegada => ({
  nombre,
  hizoElTest,
  rastro: { fuente: null, fuenteDetalle: null, ...rastro },
});

describe("K2 · «Cómo llegó» lo propone Nexus desde HubSpot", () => {
  it("la «fuente-de-lead» de Smarteam, en una vía", () => {
    expect(viaDeLaFuenteDeLead("Diagnóstico de rendimiento")).toBe("test");
    expect(viaDeLaFuenteDeLead("Diagnóstico Form")).toBe("test");
    expect(viaDeLaFuenteDeLead("Referidos")).toBe("referido");
    expect(viaDeLaFuenteDeLead("Prospección Linkedin")).toBe("frio");
    expect(viaDeLaFuenteDeLead("ABM")).toBe("frio");
    expect(viaDeLaFuenteDeLead("Google ADS")).toBe("web");
    expect(viaDeLaFuenteDeLead(null)).toBeNull();
    expect(viaDeLaFuenteDeLead("algo nuevo")).toBeNull();
  });

  it("el test manda; después la fuente del lead; después la web; «cargado a mano» propone en frío; sin nada, nada", () => {
    expect(llegadaPropuesta({ contactos: [contacto("Ana", { fuenteDeLead: "Referidos" })], conTest: true })?.via).toBe("test");
    expect(llegadaPropuesta({ contactos: [contacto("Ana", {}, true)], conTest: false })?.porque).toContain("Ana");
    expect(llegadaPropuesta({ contactos: [contacto("Ana", { fuente: "ORGANIC_SEARCH" }), contacto("Beto", { fuenteDeLead: "Referidos" })], conTest: false })?.via).toBe("referido");
    expect(llegadaPropuesta({ contactos: [contacto("Ana", { fuente: "PAID_SOCIAL" })], conTest: false })?.via).toBe("web");
    expect(llegadaPropuesta({ contactos: [contacto("Ana", { fuente: "OFFLINE" })], conTest: false })?.via).toBe("frio");
    expect(llegadaPropuesta({ contactos: [contacto("Ana")], conTest: false })).toBeNull();
  });

  it("«REFERRALS» (otro sitio que nos enlaza) nunca se propone como referido por una persona", () => {
    expect(llegadaPropuesta({ contactos: [contacto("Ana", { fuente: "REFERRALS" })], conTest: false })?.via).toBe("web");
  });

  it("se guarda confirmado, con quién lo refirió solo si es referido, y se lee de vuelta", () => {
    const validez: Validez = { dimensiones: new Set(), criterios: new Set(), areas: new Set(), ediciones: new Set(), perfilesHabituales: {}, escalaVersion: "1" };
    const estado: EstadoDeExploracion = { contenido: contenidoVacio(), propuesta: propuestaVacia(), areas: [], edicion: null, perfilCierre: null, perfilDespues: null, responsableEmail: null, archivada: false };
    const r = aplicarOperaciones(estado, [{ op: "comoLlego", valor: { via: "referido", referidoPor: "Marco (cliente de Cicadex)", en: "2026-10-27T15:00:00.000Z" } }], validez, VALIDADOR_LIBRE);
    expect(r.ok && leerContenido(r.estado.contenido).comoLlego).toEqual({ via: "referido", referidoPor: "Marco (cliente de Cicadex)", en: "2026-10-27T15:00:00.000Z" });
    // «referidoPor» con otra vía no se guarda.
    expect(leerContenido({ comoLlego: { via: "frio", referidoPor: "x", en: "2026-10-27T15:00:00.000Z" } }).comoLlego).toEqual({ via: "frio", en: "2026-10-27T15:00:00.000Z" });
    expect(leerContenido({ comoLlego: { via: "inventada", en: "2026-10-27T15:00:00.000Z" } }).comoLlego).toBeUndefined();
    const sinConfirmar = r.ok ? aplicarOperaciones(r.estado, [{ op: "comoLlego", valor: null }], validez, VALIDADOR_LIBRE) : r;
    expect(sinConfirmar.ok && sinConfirmar.estado.contenido.comoLlego).toBeUndefined();
  });
});

describe("K2 · la primera sesión en frío abre la puerta", () => {
  const enFrio = (extra: Partial<EstadoDeExploracion["contenido"]> = {}, lecturas: Record<string, unknown> = {}) =>
    estadoDePrueba({}, {
      contenido: { ...contenidoVacio(), comoLlego: { via: "frio", en: "2026-10-27T15:00:00.000Z" }, sesiones: [{ id: "s-1" }], ...extra },
      propuesta: { ...propuestaVacia(), lecturas: lecturas as never },
      areas: ["1"],
    });

  it("solo en frío o referido, sin nada leído, sin otra sesión hecha, y nunca en un proyecto", () => {
    expect(abreLaPuerta(enFrio(), "s-1")).toBe(true);
    expect(abreLaPuerta(enFrio({ comoLlego: { via: "test", en: "2026-10-27T15:00:00.000Z" } }), "s-1")).toBe(false);
    expect(abreLaPuerta(enFrio({}, { "meet:m1": { etiqueta: "x", resumen: "y" } }), "s-1")).toBe(false);
    expect(abreLaPuerta(enFrio({ sesiones: [{ id: "s-0", hecha: true }, { id: "s-1" }] }), "s-1")).toBe(false);
    expect(abreLaPuerta(enFrio(), "s-1", { marco: "cs" })).toBe(false);
    // Solo la PRIMERA de las que esperan: la sesión 2 con Marketing ya trae la guía de su equipo.
    const dos = enFrio({ sesiones: [{ id: "s-1", fecha: "2026-11-02" }, { id: "s-2", fecha: "2026-11-09", equipo: "marketing" }] });
    expect(abreLaPuerta(dos, "s-1")).toBe(true);
    expect(abreLaPuerta(dos, "s-2")).toBe(false);
    expect(abreLaPuerta(enFrio({ sesiones: [] }), null)).toBe(true);
    expect(abreLaPuerta(enFrio(), null)).toBe(false);
  });

  it("el plan no trae el diagnóstico: unas pocas preguntas abiertas, sin dimensiones, ni quién firma ni presupuesto", () => {
    const estado = enFrio();
    const ctx = contextoDelPlan({ estado, tests: [], escala: ESCALA_DE_PRUEBA, posiciones: {}, sesionId: "s-1" });
    expect(ctx.abrirLaPuerta).toBe(true);
    const plan = planDeLaGuia({ ...ctx, casillas: estado.contenido.casillas, escala: ESCALA_DE_PRUEBA, areas: estado.areas, posiciones: {}, aExplorar: {} });
    expect(plan.length).toBeLessThanOrEqual(PREGUNTAS_DE_ABRIR_LA_PUERTA);
    expect(plan.every((p) => p.tipo === "tarjeta")).toBe(true);
    expect(plan.map((p) => p.para)).not.toContain("presupuesto");
    expect(plan.map((p) => p.para)).not.toContain("autoridad");
  });

  it("el pedido al agente lleva el bloque de abrir la puerta y no explica la escala «desde cero»", () => {
    const estado = enFrio({ comoLlego: { via: "referido", referidoPor: "Andrea", en: "2026-10-27T15:00:00.000Z" } });
    const ctx = contextoDeLaGuia({ estado, escala: ESCALA_DE_PRUEBA, posiciones: {}, pendientes: [], empresa: "Acme", industria: null, hoy: "2026-10-27", agenda: [], conTest: false } as never);
    expect(ctx.abrirLaPuerta).toContain("referido por Andrea");
    expect(ctx.desdeCero).toBe(false);
    const texto = JSON.stringify(pedidoDeLaGuia(ctx).messages);
    expect(texto).toContain("LA PRIMERA SESIÓN ABRE LA PUERTA");
    expect(bloqueDeAbrirLaPuerta({ via: "frio", en: "x" })).toContain("en frío");
  });

  it("Smarteam se presenta con su position statement; sin él, con su propuesta de valor; sin las dos, nada inventado", () => {
    expect(presentacionDeSmarteam({ positionStatement: " PS ", propuestaDeValor: "PV" })).toEqual({ texto: "PS", de: "positionStatement" });
    expect(presentacionDeSmarteam({ positionStatement: null, propuestaDeValor: "PV" })).toEqual({ texto: "PV", de: "propuestaDeValor" });
    expect(presentacionDeSmarteam({ positionStatement: "", propuestaDeValor: null })).toEqual({ texto: null, de: null });
    expect(presentacionDeSmarteam(null).texto).toBeNull();
  });
});

describe("K6 · «Agregar algo que sabes» entra entero a la guía", () => {
  it("la clave guarda cuándo se agregó (y el día se lee bien, no en el año 4015)", () => {
    const t = Date.parse("2026-10-27T15:00:00Z");
    expect(cuandoSeAgrego(claveNuevaDeLoQueSabes(t))).toBe(t);
    expect(cuandoSeAgrego("sesion:s-1")).toBeNull();
  });

  it("una corta entra entera; una larga, hasta el tope y con el aviso; las vacías no", () => {
    const corta = claveNuevaDeLoQueSabes(Date.parse("2026-10-20T00:00:00Z"));
    const larga = claveNuevaDeLoQueSabes(Date.parse("2026-10-21T00:00:00Z"));
    const vacia = claveNuevaDeLoQueSabes(Date.parse("2026-10-22T00:00:00Z"));
    const lineas = loQueSabesParaLaGuia({ [corta]: "El ERP lo cambian en enero.", [larga]: "x".repeat(LARGO_ENTERO + 200), [vacia]: "  ", "sesion:s-1": "nota de sesión" });
    expect(lineas[0]).toBe("El ERP lo cambian en enero.");
    expect(lineas[1].length).toBeLessThan(LARGO_ENTERO + 80);
    expect(lineas[1]).toContain("sigue");
    expect(lineas).toHaveLength(2);
  });

  it("llega a la guía como lo que sabe el equipo, no como palabra del cliente, y como fuente lleva su rótulo", () => {
    const clave = claveNuevaDeLoQueSabes();
    const estado = estadoDePrueba({}, { contenido: { ...contenidoVacio(), notas: { [clave]: "Marco habló con el gerente: quieren arrancar en enero." } }, areas: ["1"] });
    const ctx = contextoDeLaGuia({ estado, escala: ESCALA_DE_PRUEBA, posiciones: {}, pendientes: [], empresa: "Acme", industria: null, hoy: "2026-10-27", agenda: [], conTest: false } as never);
    expect(ctx.loQueSabeElEquipo).toEqual(["Marco habló con el gerente: quieren arrancar en enero."]);
    const texto = JSON.stringify(pedidoDeLaGuia(ctx).messages);
    expect(texto).toContain("LO QUE SABE EL EQUIPO");
    expect(texto).toContain("quieren arrancar en enero");
    expect(rotuloDeLaNota(clave, [], () => null)).toMatch(/no lo dijo el cliente/);
  });
});
