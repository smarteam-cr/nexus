/**
 * Negocio, Embudo, la cifra de «Qué pasa si no actúa» y cuánto pierde el cliente (2026-11-20, pedido de Ventas a Elías).
 * Lo que sostiene: las dos tarjetas nuevas con sus cuatro estados y «completas con lo mínimo»; «Qué pasa» solo completa
 * con su cifra; la cuenta de la pérdida, a la vista y desde una meta del cliente; que la pérdida no llega a la propuesta;
 * y «Lo que falta saber» en «En vivo».
 */
import { describe, expect, it } from "vitest";
import { CASILLAS_DEL_RESUMEN, definicionDe, type Meta } from "./casillas";
import { MARCO_DE_VENTA } from "./marco";
import { aplicarOperaciones, contenidoVacio, fusionarPropuestas, idDelItem, propuestaVacia, type EstadoDeExploracion, type ItemPropuesto, type Validez } from "./contenido";
import { CifrasSchema, leerContenido, VALIDADOR_ESTRICTO } from "./esquemas";
import { estadoDeLaTarjeta } from "./estado-de-las-tarjetas";
import { listaParaProponer } from "./calidad";
import { calcularLaPerdida, formatearMonto, loQueFaltaParaLaCuenta, numeroDe, perdidaDeLaExploracion, porMesDe, tasaDe } from "./perdida";
import { bloqueParaLaPropuesta } from "./para-la-propuesta";
import { internoParaElCse } from "./para-el-handoff";
import { chequeoDelMapa } from "./mapa";
import { ESCALA_DE_PRUEBA } from "./escala-de-prueba.test-helpers";
import { idDeAveriguar, type AgendaDeLaGuia } from "./agenda";
import { cosasDeNexus, cuantasFaltan, ID_DE_LA_PERDIDA, loQueFaltaSaber } from "./lo-que-falta-saber";
import { faltaLaTarjeta, planDeLaGuia } from "./plan-de-la-guia";
import { esParaInterno } from "./correo-de-seguimiento";

const VALIDEZ: Validez = { dimensiones: new Set(["1.1"]), criterios: new Set(), areas: new Set(["1"]), ediciones: new Set(), escalaVersion: "8.8.0" };
const QUIEN = { por: "vendedor@smarteam.test", en: "2026-11-20T15:00:00.000Z" };

function estado(casillas: EstadoDeExploracion["contenido"]["casillas"] = {}, extra: Partial<EstadoDeExploracion["contenido"]> = {}): EstadoDeExploracion {
  return {
    contenido: { ...contenidoVacio(), casillas, ...extra },
    propuesta: propuestaVacia(),
    areas: ["1"],
    edicion: null,
    perfilCierre: "con equipo",
    perfilDespues: "continua",
    responsableEmail: null,
    archivada: false,
  };
}

const META_DE_CONVERSION: Meta = { que: "Subir la conversión de leads", actual: "4 %", objetivo: "7 %", para: "diciembre" };
const NEGOCIO = { ticket: "US$ 2.500 por venta", volumen: "US$ 120.000 al mes" };
const EMBUDO = { leads: "200 al mes", conversion: "4 %" };

describe("leer cifras de un texto", () => {
  it("números con miles, decimales y multiplicadores, como se dicen", () => {
    expect(numeroDe("US$ 2.500")).toBe(2500);
    expect(numeroDe("2,500 dólares")).toBe(2500);
    expect(numeroDe("1.500.000")).toBe(1_500_000);
    expect(numeroDe("4,5")).toBe(4.5);
    expect(numeroDe("120 mil al mes")).toBe(120_000);
    expect(numeroDe("1,5 millones")).toBe(1_500_000);
    expect(numeroDe("US$1.5M")).toBe(1_500_000);
    expect(numeroDe("45 minutos")).toBe(45);
    expect(numeroDe("no lo saben")).toBeNull();
  });
  it("tasas y períodos", () => {
    expect(tasaDe("8 %")).toBeCloseTo(0.08);
    expect(tasaDe("4 de cada 10")).toBeCloseTo(0.4);
    expect(tasaDe("200 al mes")).toBeNull();
    expect(porMesDe("1.200 al año")).toBeCloseTo(1 / 12);
    expect(porMesDe("50 a la semana")).toBeCloseTo(52 / 12);
    expect(porMesDe("200 al mes")).toBe(1);
    expect(porMesDe("200")).toBeNull();
  });
  it("un monto, redondeado y con su moneda", () => {
    expect(formatearMonto(15_000, "US$")).toBe("US$ 15.000");
    expect(formatearMonto(1_234_567, "₡")).toBe("₡ 1.230.000");
    expect(formatearMonto(950, null)).toBe("950");
  });
});

describe("las tarjetas Negocio y Embudo", () => {
  it("están en la arquitectura de la venta, después de las ocho, y son internas como el presupuesto", () => {
    expect(CASILLAS_DEL_RESUMEN.slice(-2)).toEqual(["negocio", "embudo"]);
    expect(MARCO_DE_VENTA.tarjetas).toContain("negocio");
    for (const k of ["negocio", "embudo"] as const) {
      const d = definicionDe(k);
      expect(d.alCliente).toBe(false);
      expect(d.alHandoff).toBe("interno");
      expect(d.explicacion && d.ejemplo && d.ayuda).toBeTruthy();
      expect(MARCO_DE_VENTA.preguntaDeBase[k]).toMatch(/\?$/);
      expect(MARCO_DE_VENTA.letras[k]).toBeTruthy();
    }
  });

  it("los cuatro estados: falta, sugerida, a medias con el motivo y completa con lo mínimo", () => {
    expect(estadoDeLaTarjeta("negocio", undefined, 0).estado).toBe("falta");
    expect(estadoDeLaTarjeta("negocio", undefined, 2).estado).toBe("sugerida");
    expect(estadoDeLaTarjeta("negocio", { pago: "70 % a crédito" }, 0)).toEqual({ estado: "aMedias", motivo: "faltan el ticket promedio y el volumen", nuevo: false });
    expect(estadoDeLaTarjeta("negocio", { ticket: "US$ 2.500" }, 0)).toMatchObject({ estado: "aMedias", motivo: "falta el volumen o la cantidad de ventas" });
    // Lo mínimo: dos de volumen, ticket y clientes. Lo demás (contado o crédito, cartera) suma pero no frena.
    expect(estadoDeLaTarjeta("negocio", NEGOCIO, 0).estado).toBe("completa");
    expect(estadoDeLaTarjeta("negocio", { volumen: "US$ 120.000 al mes", clientes: "48 ventas al mes" }, 0).estado).toBe("completa");
    expect(estadoDeLaTarjeta("negocio", NEGOCIO, 1)).toMatchObject({ estado: "completa", nuevo: true });

    expect(estadoDeLaTarjeta("embudo", { leads: "200 al mes" }, 0)).toMatchObject({ estado: "aMedias", motivo: "falta la tasa de conversión" });
    expect(estadoDeLaTarjeta("embudo", { ciclo: "45 días" }, 0)).toMatchObject({ estado: "aMedias", motivo: "faltan los leads y la tasa de conversión" });
    // Una tasa sin número no es tasa.
    expect(estadoDeLaTarjeta("embudo", { leads: "200 al mes", conversion: "baja" }, 0).estado).toBe("aMedias");
    expect(estadoDeLaTarjeta("embudo", EMBUDO, 0).estado).toBe("completa");
  });

  it("no van al correo de seguimiento (lo lee el cliente)", () => {
    expect(esParaInterno("negocio")).toBe(true);
    expect(esParaInterno("embudo")).toBe(true);
  });

  it("una propuesta nueva SUMA lo pendiente sin usar de la anterior: el ticket de la sesión 1 no se pierde", () => {
    const destino = { tipo: "casilla" as const, clave: "negocio" as const };
    const viejo = { id: idDelItem(destino, { ticket: "US$ 2.500" }), destino, valor: { ticket: "US$ 2.500" }, fuentes: [{ id: "S1", etiqueta: "Sesión 1" }], corridaId: "r1", en: "2026-11-19T00:00:00.000Z" };
    const nuevo = { id: idDelItem(destino, { volumen: "US$ 120.000 al mes" }), destino, valor: { volumen: "US$ 120.000 al mes" }, fuentes: [{ id: "S2", etiqueta: "Sesión 2" }], corridaId: "r2", en: "2026-11-20T00:00:00.000Z" };
    const e = estado();
    const p = fusionarPropuestas({ ...e, propuesta: { ...e.propuesta, items: [viejo] } }, [nuevo]);
    const deNegocio = p.items.filter((x) => x.destino.tipo === "casilla" && x.destino.clave === "negocio");
    expect(deNegocio).toHaveLength(1);
    expect(deNegocio[0].valor).toEqual({ ticket: "US$ 2.500", volumen: "US$ 120.000 al mes" });
    expect(deNegocio[0].fuentes.map((f) => f.id).sort()).toEqual(["S1", "S2"]);
  });

  it("la guía las pregunta mientras no tengan lo mínimo", () => {
    expect(faltaLaTarjeta("negocio", {})).toBe(true);
    expect(faltaLaTarjeta("negocio", { negocio: { ticket: "US$ 2.500" } })).toBe(true);
    expect(faltaLaTarjeta("negocio", { negocio: NEGOCIO })).toBe(false);
    expect(faltaLaTarjeta("embudo", { embudo: EMBUDO })).toBe(false);
  });

  it("se guardan un texto por campo; un campo que no existe o una tarjeta vacía no entran", () => {
    expect(CifrasSchema.safeParse({ ticket: "US$ 2.500" }).success).toBe(true);
    expect(CifrasSchema.safeParse({ inventado: "x" }).success).toBe(false);
    expect(CifrasSchema.safeParse({}).success).toBe(false);
    const leido = leerContenido({ casillas: { negocio: NEGOCIO, embudo: { inventado: "x" } } });
    expect(leido.casillas.negocio).toEqual(NEGOCIO);
    expect(leido.casillas.embudo).toBeUndefined();
  });

  it("usar lo que propuso el agente SUMA sus cifras: no borra las que trajo otra sesión", () => {
    const destino = { tipo: "casilla" as const, clave: "negocio" as const };
    const valor = { volumen: "US$ 120.000 al mes" };
    const it: ItemPropuesto = { id: idDelItem(destino, valor), destino, valor, fuentes: [{ id: "S1", etiqueta: "Reunión", cita: "vendemos unos 120 mil al mes" }], corridaId: "r1", en: "2026-11-20T00:00:00.000Z" };
    const e = estado({ negocio: { ticket: "US$ 2.500 por venta" } });
    const r = aplicarOperaciones({ ...e, propuesta: { ...e.propuesta, items: [it] } }, [{ op: "usar", itemId: it.id }], VALIDEZ, VALIDADOR_ESTRICTO, QUIEN);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.estado.contenido.casillas.negocio).toEqual({ ticket: "US$ 2.500 por venta", volumen: "US$ 120.000 al mes" });
  });
});

describe("«Qué pasa si no actúa», con su cifra", () => {
  it("sin cifra queda a medias con «falta la cifra»; con cifra, completa", () => {
    expect(estadoDeLaTarjeta("consecuencias", ["Pierden clientes porque nadie los sigue"], 0)).toEqual({ estado: "aMedias", motivo: "falta la cifra", nuevo: false });
    expect(estadoDeLaTarjeta("consecuencias", ["Pierden US$1.5M al mes en cuentas incobrables"], 0).estado).toBe("completa");
    expect(estadoDeLaTarjeta("consecuencias", ["Se les van unos 10 negocios al mes"], 0).estado).toBe("completa");
  });
  it("la pérdida validada con el cliente la completa; la calculada sin validar la sugiere", () => {
    expect(estadoDeLaTarjeta("consecuencias", undefined, 0, "validada").estado).toBe("completa");
    expect(estadoDeLaTarjeta("consecuencias", ["Pierden clientes"], 0, "validada").estado).toBe("completa");
    expect(estadoDeLaTarjeta("consecuencias", undefined, 0, "porValidar").estado).toBe("sugerida");
    expect(estadoDeLaTarjeta("consecuencias", ["Pierden clientes"], 0, "porValidar")).toMatchObject({ estado: "aMedias", nuevo: true });
  });
  it("«Lista para proponer» suma solo eso: la cifra de «Qué pasa»; Negocio y Embudo no son un punto", () => {
    const chequeo = chequeoDelMapa(ESCALA_DE_PRUEBA, ["1"], {});
    const punto = (e: EstadoDeExploracion) => listaParaProponer(e, chequeo, "2026-11-20").find((p) => p.id === "consecuencia")!;
    expect(punto(estado({ consecuencias: ["Pierden clientes"] })).cumplido).toBe(false);
    expect(punto(estado({ consecuencias: ["Pierden 10 negocios al mes"] })).cumplido).toBe(true);
    const calculo = calcularLaPerdida({ negocio: NEGOCIO, embudo: EMBUDO, metas: [META_DE_CONVERSION] })!;
    expect(punto(estado({}, { perdida: { ...calculo, validadaEn: QUIEN.en, por: QUIEN.por } })).cumplido).toBe(true);
    expect(listaParaProponer(estado(), chequeo).map((p) => p.id)).toEqual(["frena", "meta", "tiempos", "presupuesto", "autoridad", "consecuencia", "siguientePaso"]);
  });
});

describe("cuánto pierde, con la cuenta a la vista", () => {
  it("conversión: leads al mes × (meta − hoy) × ticket", () => {
    const c = calcularLaPerdida({ negocio: NEGOCIO, embudo: EMBUDO, metas: [META_DE_CONVERSION] });
    expect(c?.base).toBe("conversion");
    expect(c?.montoAlMes).toBeCloseTo(200 * 0.03 * 2500);
    expect(c?.cuenta).toBe("200 leads al mes × (7 % − 4 %) de conversión × US$ 2.500 de ticket = US$ 15.000 al mes");
    expect(c?.texto).toBe("Pierden ~US$ 15.000 al mes por no llegar a «Subir la conversión de leads»");
  });
  it("negocios: (meta − hoy) × ticket, y el período de la meta pasa a meses", () => {
    const c = calcularLaPerdida({ negocio: NEGOCIO, metas: [{ que: "Más cierres", actual: "120 ventas al año", objetivo: "180 ventas al año" }] });
    expect(c?.base).toBe("negocios");
    expect(c?.montoAlMes).toBeCloseTo((60 / 12) * 2500);
    expect(c?.cuenta).toBe("(15 − 10) negocios al mes × US$ 2.500 de ticket = US$ 12.500 al mes");
  });
  it("leads: (meta − hoy) × conversión × ticket", () => {
    const c = calcularLaPerdida({ negocio: NEGOCIO, embudo: EMBUDO, metas: [{ que: "Más leads del sitio", actual: "200 al mes", objetivo: "300 al mes" }] });
    expect(c?.base).toBe("leads");
    expect(c?.montoAlMes).toBeCloseTo(100 * 0.04 * 2500);
  });
  it("sin ticket, el volumen entre las ventas del mismo período, dicho en la cuenta", () => {
    const c = calcularLaPerdida({ negocio: { volumen: "US$ 120.000 al mes", clientes: "48 ventas al mes" }, embudo: EMBUDO, metas: [META_DE_CONVERSION] });
    expect(c?.montoAlMes).toBeCloseTo(200 * 0.03 * 2500);
    expect(c?.cuenta).toContain("(el volumen entre las ventas)");
  });
  it("lo que no es conversión, la plata sin moneda y la cifra con dos períodos no inventan una pérdida", () => {
    // Una meta en tasa que no habla de vender (retención, uso de HubSpot) no es de conversión.
    expect(calcularLaPerdida({ negocio: NEGOCIO, embudo: EMBUDO, metas: [{ que: "Subir la retención de clientes", actual: "60 %", objetivo: "80 %" }] })).toBeNull();
    expect(calcularLaPerdida({ negocio: NEGOCIO, embudo: EMBUDO, metas: [{ que: "Que el equipo use HubSpot", actual: "30 %", objetivo: "90 %" }] })).toBeNull();
    // «De 100 mil a 150 mil al mes» en ventas es plata, no 50.000 negocios más.
    expect(calcularLaPerdida({ negocio: NEGOCIO, metas: [{ que: "Subir las ventas", actual: "100 mil al mes", objetivo: "150 mil al mes" }] })).toBeNull();
    // El período es el de la primera cifra: 200 al mes, aunque después diga cuánto es al año.
    const c = calcularLaPerdida({ negocio: NEGOCIO, embudo: { leads: "200 al mes (unos 2.400 al año)", conversion: "4 %" }, metas: [META_DE_CONVERSION] });
    expect(c?.montoAlMes).toBeCloseTo(15_000);
  });

  it("la cuenta cuadra con lo que muestra: los valores redondeados son los que se multiplican", () => {
    const c = calcularLaPerdida({ negocio: NEGOCIO, metas: [{ que: "Más cierres", actual: "100 ventas al año", objetivo: "160 ventas al año" }] })!;
    // 160/12 = 13,3 y 100/12 = 8,3: (13,3 − 8,3) × 2.500 = 12.500.
    expect(c.cuenta).toBe("(13,3 − 8,3) negocios al mes × US$ 2.500 de ticket = US$ 12.500 al mes");
    expect(c.montoAlMes).toBeCloseTo(12_500);
  });

  it("con la pérdida validada, la guía no vuelve a preguntar «qué pasa si no actúa»", () => {
    const base = { saber: { porTema: new Map(), lineas: [] }, casillas: {}, escala: ESCALA_DE_PRUEBA, areas: [] as string[], posiciones: {}, aExplorar: {} };
    expect(planDeLaGuia(base).map((p) => p.para)).toContain("consecuencias");
    expect(planDeLaGuia({ ...base, perdidaValidada: true }).map((p) => p.para)).not.toContain("consecuencias");
  });

  it("sin una meta de cuánto a cuánto no supone ninguna mejora: no hay cuenta, y dice qué falta", () => {
    expect(calcularLaPerdida({ negocio: NEGOCIO, embudo: EMBUDO, metas: [] })).toBeNull();
    expect(calcularLaPerdida({ negocio: NEGOCIO, embudo: EMBUDO, metas: [{ que: "Crecer", objetivo: "mucho" }] })).toBeNull();
    // Una meta que baja (la pérdida de clientes del 30 % al 15 %) no es una brecha del embudo.
    expect(calcularLaPerdida({ negocio: NEGOCIO, embudo: EMBUDO, metas: [{ que: "Perder menos clientes", actual: "30 %", objetivo: "15 %" }] })).toBeNull();
    // Una meta en plata tampoco: es la meta, no lo que cuesta no llegar.
    expect(calcularLaPerdida({ negocio: NEGOCIO, embudo: EMBUDO, metas: [{ que: "Vender más", actual: "US$ 100 mil", objetivo: "US$ 150 mil" }] })).toBeNull();
    expect(loQueFaltaParaLaCuenta({ embudo: EMBUDO, metas: [META_DE_CONVERSION] })).toMatch(/^el ticket promedio/);
    expect(loQueFaltaParaLaCuenta({ negocio: NEGOCIO, embudo: EMBUDO })).toMatch(/^una meta de cuánto a cuánto/);
    expect(loQueFaltaParaLaCuenta({ negocio: NEGOCIO, metas: [META_DE_CONVERSION] })).toBe("cuántos leads les llegan");
  });
  it("la validada se guarda con quién y cuándo; con otras cifras la huella no calza y no se guarda", () => {
    const casillas = { negocio: NEGOCIO, embudo: EMBUDO, metas: [META_DE_CONVERSION] };
    const calculo = calcularLaPerdida(casillas)!;
    const ok = aplicarOperaciones(estado(casillas), [{ op: "perdida", huella: calculo.huella }], VALIDEZ, VALIDADOR_ESTRICTO, QUIEN);
    expect(ok.ok && ok.estado.contenido.perdida).toMatchObject({ montoAlMes: calculo.montoAlMes, cuenta: calculo.cuenta, validadaEn: QUIEN.en, por: QUIEN.por });
    const otra = aplicarOperaciones(estado({ ...casillas, embudo: { leads: "300 al mes", conversion: "4 %" } }), [{ op: "perdida", huella: calculo.huella }], VALIDEZ, VALIDADOR_ESTRICTO, QUIEN);
    expect(otra.ok).toBe(false);
    if (ok.ok) {
      // Se lee de vuelta y se quita.
      expect(leerContenido(JSON.parse(JSON.stringify(ok.estado.contenido))).perdida?.huella).toBe(calculo.huella);
      const sin = aplicarOperaciones(ok.estado, [{ op: "perdida", huella: null }], VALIDEZ, VALIDADOR_ESTRICTO, QUIEN);
      expect(sin.ok && sin.estado.contenido.perdida).toBeUndefined();
      // Con las cifras de entonces no hay nada nuevo que validar; con otras, la cuenta nueva aparece al lado.
      expect(perdidaDeLaExploracion(casillas, ok.estado.contenido.perdida).porValidar).toBeNull();
      expect(perdidaDeLaExploracion({ ...casillas, embudo: { leads: "300 al mes", conversion: "4 %" } }, ok.estado.contenido.perdida).porValidar?.montoAlMes).toBeCloseTo(22_500);
    }
  });

  it("⛔ nada de esto llega a la propuesta: ni Negocio, ni Embudo, ni la pérdida; el CSE sí la ve, rotulada interna", () => {
    const casillas = { negocio: { ticket: "TICKET_INTERNO 2.500" }, embudo: { leads: "LEADS_INTERNOS 200" }, metas: [META_DE_CONVERSION] };
    const calculo = calcularLaPerdida({ negocio: NEGOCIO, embudo: EMBUDO, metas: [META_DE_CONVERSION] })!;
    const e = estado(casillas, { perdida: { ...calculo, texto: "PERDIDA_INTERNA", cuenta: "CUENTA_INTERNA", validadaEn: QUIEN.en, por: QUIEN.por } });
    const b = bloqueParaLaPropuesta({ estado: e, escala: ESCALA_DE_PRUEBA, chequeo: chequeoDelMapa(ESCALA_DE_PRUEBA, ["1"], {}), conEscala: true });
    for (const interno of ["TICKET_INTERNO", "LEADS_INTERNOS", "PERDIDA_INTERNA", "CUENTA_INTERNA", "Negocio", "Embudo"]) expect(b).not.toContain(interno);
    const delCse = internoParaElCse(e, ESCALA_DE_PRUEBA);
    expect(delCse.map((x) => x.etiqueta)).toEqual(expect.arrayContaining(["Negocio", "Embudo", "Cuánto pierde, validado con el cliente"]));
    expect(delCse.find((x) => x.etiqueta === "Negocio")?.lineas).toEqual(["Ticket promedio: TICKET_INTERNO 2.500"]);
  });
});

describe("«Lo que falta saber» en «En vivo»", () => {
  const cosa = (que: string, para?: string) => ({ id: idDeAveriguar(que), que, preguntas: ["¿Cómo…?"], ...(para ? { para } : {}) });
  const AGENDA: AgendaDeLaGuia = {
    claves: ["El resultado"],
    bloques: [
      { desde: 0, hasta: 5, titulo: "Apertura", tipo: "apertura", abre: "Hola", averiguar: [] },
      { desde: 5, hasta: 25, titulo: "Cómo venden", tipo: "cuerpo", abre: "¿Cómo venden?", averiguar: [cosa("Cómo llega el interesado", "1.1"), cosa("Para cuándo lo necesitan", "tiempos")] },
      { desde: 25, hasta: 50, titulo: "El resultado que buscan", tipo: "cuerpo", abre: "¿Qué tendría que pasar?", averiguar: [cosa("Cómo se asigna", "1.1"), cosa("Quién lo pide")] },
      { desde: 50, hasta: 60, titulo: "Cierre", tipo: "cierre", abre: "Gracias", averiguar: [] },
    ],
  };

  it("agrupa por tema sin importar el bloque; sin tema, por el título del bloque; lo completo va al fondo", () => {
    const hecha = idDeAveriguar("Para cuándo lo necesitan");
    const temas = loQueFaltaSaber(AGENDA, [hecha]);
    expect(temas.map((t) => [t.clave, t.cosas.length, t.pendientes])).toEqual([
      ["1.1", 2, 2],
      ["bloque:El resultado que buscan", 1, 1],
      ["tiempos", 1, 0],
    ]);
    expect(cuantasFaltan(temas)).toBe(3);
  });

  it("Nexus suma lo que falta de Negocio y Embudo (si la agenda no lo pregunta) y la pérdida por validar", () => {
    const pregunta = (k: "negocio" | "embudo" | "consecuencias") => MARCO_DE_VENTA.preguntaDeBase[k];
    const sinNada = cosasDeNexus({ marco: "venta", casillas: {}, perdida: null, agenda: AGENDA, pregunta });
    expect(sinNada.map((c) => [c.para, c.que])).toEqual([
      ["negocio", "El ticket promedio y el volumen"],
      ["embudo", "Los leads y la tasa de conversión"],
    ]);
    const conCuenta = cosasDeNexus({ marco: "venta", casillas: { negocio: NEGOCIO, embudo: EMBUDO, metas: [META_DE_CONVERSION] }, perdida: null, agenda: AGENDA, pregunta });
    expect(conCuenta).toHaveLength(1);
    expect(conCuenta[0]).toMatchObject({ para: "consecuencias", que: "Validar con el cliente: pierden ~US$ 15.000 al mes", deNexus: "perdida" });
    expect(conCuenta[0].id.startsWith(ID_DE_LA_PERDIDA)).toBe(true);
    expect(conCuenta[0].id.length).toBeLessThanOrEqual(40);
    // En un proyecto (Customer Success), nada.
    expect(cosasDeNexus({ marco: "cs", casillas: {}, perdida: null, agenda: AGENDA, pregunta })).toEqual([]);
    // Si la agenda ya pregunta el negocio, no se repite.
    const conNegocio: AgendaDeLaGuia = { ...AGENDA, bloques: [...AGENDA.bloques, { desde: 0, hasta: 1, titulo: "Negocio", tipo: "cuerpo", abre: "¿?", averiguar: [cosa("Cuánto venden", "negocio")] }] };
    expect(cosasDeNexus({ marco: "venta", casillas: {}, perdida: null, agenda: conNegocio, pregunta }).map((c) => c.para)).toEqual(["embudo"]);
    // Y entran a la lista en su tema, con las mismas marcas.
    const temas = loQueFaltaSaber(AGENDA, [sinNada[0].id], sinNada);
    expect(temas.find((t) => t.clave === "negocio")?.pendientes).toBe(0);
    expect(temas.find((t) => t.clave === "embudo")?.pendientes).toBe(1);
  });
});
