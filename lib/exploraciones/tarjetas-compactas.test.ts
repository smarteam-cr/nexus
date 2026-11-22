/**
 * lib/exploraciones/tarjetas-compactas.test.ts — el Resumen liviano (22 nov): la versión compacta de cada tarjeta nunca
 * inventa ni pierde una cifra, se muestra solo si es de las líneas de hoy, y las particularidades se ven las más nuevas
 * primero, con su fecha.
 */
import { describe, expect, it } from "vitest";
import {
  cifrasDe,
  compactarConUnReintento,
  cifrasQueNoCuadran,
  huellaDeLasLineas,
  leerRespuestaCompacta,
  lineasDe,
  loQueMuestraLaTarjeta,
  LINEAS_A_LA_VISTA,
  motivosParaDescartar,
  particularidadesRecientes,
  pideCompactar,
  tarjetasPorCompactar,
  tarjetasQueCambiaron,
} from "./tarjetas-compactas";
import { aplicarOperaciones, claveDeItemDeLista, cambioLoConfirmado, contenidoVacio, VALIDADOR_LIBRE, type EstadoDeExploracion, type Validez } from "./contenido";
import { leerContenido } from "./esquemas";
import { parseObject } from "@/lib/ai/section-schema";

/** Tres tarjetas armadas como las de una preventa real (Centauro, Camosa): repetidas, con la línea base suelta. */
const METAS_REALES = [
  "Ventas · Subir la tasa de cierre: de 18 % a 25 % para junio 2027",
  "Ventas · Tener visibilidad del pipeline por vendedor",
  "Ventas · Que cada vendedor vea su pipeline sin pedirlo a gerencia",
  "Servicio · Responder los tickets de WhatsApp en menos de 4 horas",
];
const RETOS_REALES = [
  "Hoy la conversión de lead a oportunidad es de 3 %",
  "Los leads de formulario y de WhatsApp no llegan al CRM",
  "Los leads de WhatsApp se pierden porque nadie los registra",
  "El equipo de 12 vendedores trabaja en Excel",
  "No hay presupuesto aprobado antes de enero 2027",
];

describe("cifrasDe: las cifras de un texto, sin separadores", () => {
  it("1.500, 1,500 y 1500 son la misma; los porcentajes y los años cuentan", () => {
    expect([...cifrasDe("US$ 1.500 y 1,500 y 1500")]).toEqual(["1500"]);
    expect([...cifrasDe("de 18 % a 25 % para junio 2027")].sort()).toEqual(["18", "2027", "25"]);
    expect([...cifrasDe("sin números, dos o tres")]).toEqual([]);
  });

  it("un punto final no pega la cifra con lo que sigue", () => {
    expect([...cifrasDe("Son 40. Después 12")].sort()).toEqual(["12", "40"]);
  });
});

describe("motivosParaDescartar: la compacta tiene que traer TODAS las cifras del original y ninguna más", () => {
  it("una buena compacta pasa: fusiona, subordina y conserva las cifras", () => {
    const compacta = [
      "Ventas: subir la tasa de cierre de 18 % a 25 % para junio 2027, con el pipeline de cada vendedor a la vista",
      "Servicio: tickets de WhatsApp respondidos en menos de 4 horas",
    ];
    expect(motivosParaDescartar(METAS_REALES, compacta)).toEqual([]);
  });

  it("si inventa una cifra, no sirve", () => {
    const m = motivosParaDescartar(RETOS_REALES, ["Conversión de lead a oportunidad: 3 %, la meta es 10 %", "Leads de formulario y WhatsApp fuera del CRM", "12 vendedores en Excel; sin presupuesto antes de enero 2027"]);
    expect(m.join(" ")).toContain("no están en el original: 10");
  });

  it("si pierde una cifra, no sirve", () => {
    const m = motivosParaDescartar(RETOS_REALES, ["Conversión de lead a oportunidad: 3 %", "Leads de formulario y WhatsApp fuera del CRM", "Vendedores en Excel; sin presupuesto antes de enero 2027"]);
    expect(m.join(" ")).toContain("perdió cifras del original: 12");
  });

  it("si es más larga que el original o tiene más líneas, no sirve", () => {
    expect(motivosParaDescartar(["Corto"], ["Corto", "Otra"]).join(" ")).toContain("más líneas");
    expect(motivosParaDescartar(["Corto"], ["Mucho más largo que el original"]).join(" ")).toContain("más larga");
    expect(motivosParaDescartar(["Algo"], ["  "])).toEqual(["vino vacía"]);
  });

  it("cifrasQueNoCuadran dice cuáles faltan y cuáles sobran", () => {
    expect(cifrasQueNoCuadran(["de 2 a 5"], ["de 2 a 6"])).toEqual({ inventadas: ["6"], perdidas: ["5"], invertidas: [] });
  });

  it("si da vuelta una meta («de 2 % a 5 %» → «de 5 % a 2 %»), no sirve", () => {
    const original = ["Subir la conversión de 2 % a 5 % para el cierre", "Sin presupuesto"];
    expect(motivosParaDescartar(original, ["Conversión de 5 % a 2 %; sin presupuesto"]).join(" ")).toContain("dio vuelta el orden");
    expect(motivosParaDescartar(original, ["Conversión de 2 % a 5 %; sin presupuesto"])).toEqual([]);
  });

  it("el orden solo se mira en un rango: «desde 1990 y 400,000» puede quedar «400,000 desde 1990» (Cemaco)", () => {
    const original = ["La base de email acumula registros desde 1990 y supera los 400,000 contactos sin depurar", "Otra"];
    expect(motivosParaDescartar(original, ["Base de email: 400,000 contactos desde 1990 sin depurar"])).toEqual([]);
  });

  it("un decimal no se confunde con un entero: 2,5 % no es 25 %", () => {
    expect(motivosParaDescartar(["Churn de 2,5 % mensual hoy", "Otra cosa más"], ["Churn de 25 % mensual"]).join(" ")).toMatch(/no están en el original: 25.*perdió cifras del original: 2\.5/);
    expect([...cifrasDe("2,5 y 2.5")]).toEqual(["2.5"]);
  });
});

describe("loQueMuestraLaTarjeta: la compacta solo si es de las líneas de hoy", () => {
  const lineas = RETOS_REALES;
  const compacta = { huella: huellaDeLasLineas(lineas), lineas: ["Una sola línea con 3, 12, 2027"], en: "2026-11-22T10:00:00Z" };

  it("con la huella de hoy, se ve la compacta entera", () => {
    expect(loQueMuestraLaTarjeta(lineas, compacta)).toEqual({ lineas: compacta.lineas, ocultas: 0, compacta: true });
  });

  it("si la casilla cambió, vuelve lo de siempre recortado (nunca vacío)", () => {
    const otras = [...lineas, "Un reto nuevo"];
    const m = loQueMuestraLaTarjeta(otras, compacta);
    expect(m.compacta).toBe(false);
    expect(m.lineas).toEqual(otras.slice(0, LINEAS_A_LA_VISTA));
    expect(m.ocultas).toBe(otras.length - LINEAS_A_LA_VISTA);
  });

  it("sin compacta guardada, lo de siempre recortado", () => {
    expect(loQueMuestraLaTarjeta(["a", "b"], undefined)).toEqual({ lineas: ["a", "b"], ocultas: 0, compacta: false });
  });
});

describe("tarjetasPorCompactar: qué se le pide al agente", () => {
  it("solo las que son largas y no tienen compacta de sus líneas de hoy", () => {
    const casillas = { retos: RETOS_REALES.map((texto) => ({ texto })), presupuesto: "US$ 10.000" };
    const { pedir, quitar } = tarjetasPorCompactar(casillas, {});
    expect(pedir.map((t) => t.clave)).toEqual(["retos"]);
    expect(quitar).toEqual([]);
    const yaEsta = { retos: { huella: pedir[0].huella, lineas: ["x 3 12 2027"], en: "" } };
    expect(tarjetasPorCompactar(casillas, yaEsta).pedir).toEqual([]);
  });

  it("una que quedó corta sale de lo guardado", () => {
    const { quitar } = tarjetasPorCompactar({ retos: [{ texto: "Uno solo" }] }, { retos: { huella: "x", lineas: ["y"], en: "" } });
    expect(quitar).toEqual(["retos"]);
  });

  it("pideCompactar: una o dos líneas cortas se ven tal cual", () => {
    expect(pideCompactar(["Uno", "Dos"])).toBe(false);
    expect(pideCompactar(["Uno", "Dos", "Tres"])).toBe(true);
    expect(pideCompactar(["x".repeat(300)])).toBe(true);
  });

  it("tarjetasQueCambiaron mira las líneas, no el orden de las claves del objeto", () => {
    expect(tarjetasQueCambiaron({ planes: ["a"] }, { planes: ["a"] })).toEqual([]);
    expect(tarjetasQueCambiaron({ planes: ["a"] }, { planes: ["a", "b"], contexto: "otra cosa" })).toEqual(["planes"]);
  });
});

describe("compactarConUnReintento: solo lo que pasa la comprobación se puede guardar", () => {
  const respuesta = (tarjetas: { clave: string; lineas: string[] }[]) => ({ content: [{ type: "text", text: JSON.stringify({ tarjetas }) }] });
  const original = { clave: "retos" as const, lineas: RETOS_REALES };
  const buena = ["Conversión de lead a oportunidad: 3 %", "Leads de formulario y WhatsApp fuera del CRM", "12 vendedores en Excel; sin presupuesto antes de enero 2027"];

  it("la que inventa una cifra dos veces no llega a `validas`", async () => {
    let llamadas = 0;
    const r = await compactarConUnReintento(
      "Empresa",
      [original],
      async () => {
        llamadas++;
        return respuesta([{ clave: "retos", lineas: [...buena.slice(0, 2), "99 vendedores en Excel; sin presupuesto antes de enero 2027 ni 12"] }]);
      },
      parseObject,
    );
    expect(llamadas).toBe(2);
    expect(r.validas.retos).toBeUndefined();
    expect(r.descartadas.retos?.join(" ")).toContain("99");
  });

  it("si al segundo intento pasa, se guarda la del segundo, y el segundo pedido lleva el motivo", async () => {
    const pedidos: string[] = [];
    const r = await compactarConUnReintento(
      "Empresa",
      [original],
      async (p) => {
        pedidos.push(p.messages[0].content);
        return respuesta([{ clave: "retos", lineas: pedidos.length === 1 ? ["Todo junto sin cifras"] : buena }]);
      },
      parseObject,
    );
    expect(r.validas.retos).toEqual(buena);
    expect(pedidos[1]).toContain("perdió cifras");
  });

  it("una tarjeta que no vino en la respuesta tampoco se guarda", async () => {
    const r = await compactarConUnReintento("Empresa", [original], async () => respuesta([]), parseObject);
    expect(r.validas).toEqual({});
    expect(r.descartadas.retos).toEqual(["no vino en la respuesta"]);
  });
});

describe("leerRespuestaCompacta: solo las claves pedidas", () => {
  it("ignora una tarjeta que no se pidió y limpia las viñetas", () => {
    const r = leerRespuestaCompacta({ tarjetas: [{ clave: "retos", lineas: ["- uno", "• dos", 3] }, { clave: "metas", lineas: ["no"] }] }, ["retos"]);
    expect(r).toEqual({ retos: ["uno", "dos"] });
  });
});

describe("lineasDe: lo mismo que mostraba la tarjeta", () => {
  it("las metas con sus cifras y el equipo adelante", () => {
    expect(lineasDe("metas", [{ que: "Cerrar más", actual: "18 %", objetivo: "25 %", para: "junio", equipo: "ventas" }])[0]).toMatch(/· Cerrar más: de 18 % a 25 % para junio$/);
  });
});

describe("las particularidades: las 5 más recientes, con su fecha", () => {
  const k = (t: string) => claveDeItemDeLista("particularidades", t);

  it("sin fechas, el orden de llegada al revés (la última entró al final)", () => {
    const lista = ["a", "b", "c", "d", "e", "f", "g"];
    expect(particularidadesRecientes(lista, undefined, k, 5).map((p) => p.texto)).toEqual(["g", "f", "e", "d", "c"]);
  });

  it("las fechadas van primero, de la más nueva a la más vieja", () => {
    const lista = ["vieja", "nueva", "media"];
    const fechas = { [k("nueva")]: "2026-11-23", [k("media")]: "2026-11-22" };
    expect(particularidadesRecientes(lista, fechas, k)).toEqual([
      { texto: "nueva", fecha: "2026-11-23" },
      { texto: "media", fecha: "2026-11-22" },
      { texto: "vieja", fecha: null },
    ]);
  });
});

describe("aplicarOperaciones: le pone el día a cada particularidad NUEVA", () => {
  const estado = (particularidades?: string[], fechas?: Record<string, string>): EstadoDeExploracion => ({
    contenido: { ...contenidoVacio(), casillas: particularidades ? { particularidades } : {}, ...(fechas ? { fechasDeLasParticularidades: fechas } : {}) },
    propuesta: { version: 1, items: [], leidas: { sesiones: [], hubspot: [], documentos: [] }, corridas: [], guia: null } as unknown as EstadoDeExploracion["propuesta"],
    areas: [],
    edicion: null,
    perfilCierre: null,
    perfilDespues: null,
    responsableEmail: null,
    archivada: false,
  });
  const validez = { dimensiones: new Set(), criterios: new Set(), areas: new Set(), ediciones: new Set(), escalaVersion: null } as unknown as Validez;
  const validador = VALIDADOR_LIBRE;
  const quien = { por: "x@smarteam.cr", en: "2026-11-22T18:00:00.000Z" };

  it("la que entra hoy queda con el día de hoy; las de antes siguen sin fecha", () => {
    const r = aplicarOperaciones(estado(["Vieja"]), [{ op: "casilla", clave: "particularidades", valor: ["Vieja", "Nueva"] }], validez, validador, quien);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.estado.contenido.fechasDeLasParticularidades).toEqual({ [claveDeItemDeLista("particularidades", "Nueva")]: "2026-11-22" });
  });

  it("el día es el de Costa Rica: a las 21:00 de Costa Rica en UTC ya es mañana", () => {
    const r = aplicarOperaciones(estado([]), [{ op: "casilla", clave: "particularidades", valor: ["De noche"] }], validez, validador, { por: null, en: "2026-11-23T03:00:00.000Z" });
    expect(r.ok && r.estado.contenido.fechasDeLasParticularidades).toEqual({ [claveDeItemDeLista("particularidades", "De noche")]: "2026-11-22" });
  });

  it("corregir el texto de una vieja la vuelve nueva: entra con el día de hoy (decidido así, se dice en DECISIONS)", () => {
    const r = aplicarOperaciones(estado(["Vieja"]), [{ op: "casilla", clave: "particularidades", valor: ["Vieja, corregida"] }], validez, validador, quien);
    expect(r.ok && r.estado.contenido.fechasDeLasParticularidades).toEqual({ [claveDeItemDeLista("particularidades", "Vieja, corregida")]: "2026-11-22" });
  });

  it("la que se quita olvida su fecha; un cambio sin particularidades no inventa fechas", () => {
    const k = claveDeItemDeLista("particularidades", "Nueva");
    const r = aplicarOperaciones(estado(["Vieja", "Nueva"], { [k]: "2026-11-20" }), [{ op: "casilla", clave: "particularidades", valor: ["Vieja"] }], validez, validador, quien);
    expect(r.ok && r.estado.contenido.fechasDeLasParticularidades).toBeUndefined();
    const otra = aplicarOperaciones(estado(["Vieja"]), [{ op: "casilla", clave: "planes", valor: ["Algo"] }], validez, validador, quien);
    expect(otra.ok && otra.estado.contenido.fechasDeLasParticularidades).toBeUndefined();
  });
});

describe("lo compacto no es algo confirmado", () => {
  it("no sube la versión y sobrevive a leer lo guardado", () => {
    const base = leerContenido({ casillas: { planes: ["a"] } });
    const con = { ...base, tarjetasCompactas: { planes: { huella: "abc", lineas: ["a"], en: "2026-11-22T00:00:00Z" } } };
    const e = (contenido: typeof base) => ({ contenido }) as unknown as EstadoDeExploracion;
    const vacio = { areas: [], edicion: null, perfilCierre: null, perfilDespues: null, responsableEmail: null, archivada: false };
    expect(cambioLoConfirmado({ ...e(base), ...vacio }, { ...e(con), ...vacio })).toBe(false);
    expect(leerContenido(con).tarjetasCompactas).toEqual(con.tarjetasCompactas);
    expect(leerContenido({ ...base, fechasDeLasParticularidades: { x: "2026-11-22", y: "ayer" } }).fechasDeLasParticularidades).toEqual({ x: "2026-11-22" });
  });
});
