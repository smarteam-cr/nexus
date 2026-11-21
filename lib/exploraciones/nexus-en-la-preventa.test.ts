/**
 * «Hablar con Nexus» en la preventa (21 nov): adónde puede ir lo que se cuenta (las tarjetas de la arquitectura de la
 * venta, con Negocio y Embudo), cómo se aplica («Aplicar» = `sumarACasilla`, la regla del «Usar»), cómo se lee en el
 * panel, y que la nota deje hechos como una reunión, con la preventa de destino. Sin IA ni base.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aplicarOperaciones, contenidoVacio, propuestaVacia, type EstadoDeExploracion, type Validez } from "./contenido";
import { VALIDADOR_ESTRICTO } from "./esquemas";
import { CASILLAS_PARA_NEXUS, comoSeVeElCambio, destinosDeLaPreventa, lineasDelValor } from "./nexus-en-la-preventa";
import { sePuedeReintentar } from "./reintento";
import { leerElTurno } from "@/lib/chat-de-nexus/conversacion";
import { destinosDeUnaNota, hechosVerificadosDeUnaNota } from "@/lib/seguimiento/hechos/de-una-nota";

const VALIDEZ: Validez = { dimensiones: new Set(["1.1"]), criterios: new Set(), areas: new Set(["1"]), ediciones: new Set(), escalaVersion: "9.3.0" };
const QUIEN = { por: "liz@smarteamcr.com", en: "2026-11-21T15:00:00.000Z" };
const estado = (casillas: EstadoDeExploracion["contenido"]["casillas"] = {}): EstadoDeExploracion => ({
  contenido: { ...contenidoVacio(), casillas },
  propuesta: propuestaVacia(),
  areas: ["1"],
  edicion: null,
  perfilCierre: "con equipo",
  perfilDespues: "continua",
  responsableEmail: null,
  archivada: false,
});
const aplicar = (e: EstadoDeExploracion, clave: Parameters<typeof lineasDelValor>[0], valor: unknown) =>
  aplicarOperaciones(e, [{ op: "sumarACasilla", clave, valor }], VALIDEZ, VALIDADOR_ESTRICTO, QUIEN);

describe("adónde puede ir", () => {
  it("las tarjetas del Resumen con Negocio y Embudo, y las de las reuniones", () => {
    expect(CASILLAS_PARA_NEXUS).toEqual(expect.arrayContaining(["metas", "retos", "autoridad", "negocio", "embudo", "objeciones", "particularidades"]));
    const d = destinosDeLaPreventa(estado({ negocio: { ticket: "US$ 2.500" } }).contenido);
    const negocio = d.find((x) => x.clave === "negocio")!;
    expect(negocio).toMatchObject({ rotulo: "Negocio", suma: true, hoy: ["Ticket promedio: US$ 2.500"] });
    expect(negocio.forma).toContain('"cartera"');
    expect(d.find((x) => x.clave === "presupuesto")!.suma).toBe(false);
  });
});

describe("«Aplicar» es la regla del «Usar»", () => {
  it("unas cifras suman sus campos sin borrar los que había", () => {
    const r = aplicar(estado({ negocio: { ticket: "US$ 2.500" } }), "negocio", { cartera: "US$ 40.000 al mes vencidos" });
    if (!r.ok) throw new Error(r.error);
    expect(r.estado.contenido.casillas.negocio).toEqual({ ticket: "US$ 2.500", cartera: "US$ 40.000 al mes vencidos" });
  });
  it("una lista suma un ítem y no lo repite", () => {
    const a = aplicar(estado({ planes: ["Cambiar el ERP"] }), "planes", "Ordenar la cobranza");
    if (!a.ok) throw new Error(a.error);
    expect(a.estado.contenido.casillas.planes).toEqual(["Cambiar el ERP", "Ordenar la cobranza"]);
    const b = aplicar(a.estado, "planes", "Ordenar la cobranza");
    if (!b.ok) throw new Error(b.error);
    expect(b.estado.contenido.casillas.planes).toHaveLength(2);
  });
  it("un texto se reemplaza; un valor con otra forma no entra", () => {
    const a = aplicar(estado({ presupuesto: "No lo dijeron" }), "presupuesto", "Unos US$ 15.000 para este año");
    if (!a.ok) throw new Error(a.error);
    expect(a.estado.contenido.casillas.presupuesto).toBe("Unos US$ 15.000 para este año");
    expect(aplicar(estado(), "autoridad", { nombre: "Ana", rol: "jefa" }).ok).toBe(false);
  });
});

describe("cómo se ve en el panel", () => {
  it("adónde va, lo que reemplaza y lo que queda", () => {
    const c = estado({ presupuesto: "No lo dijeron", planes: ["Cambiar el ERP"] }).contenido;
    expect(comoSeVeElCambio(c, "presupuesto", "Unos US$ 15.000")).toEqual({ donde: expect.any(String), reemplaza: ["No lo dijeron"], queda: ["Unos US$ 15.000"], suma: false, yaEsta: false });
    expect(comoSeVeElCambio(c, "autoridad", { nombre: "Ana Mora", cargo: "Gerente", rol: "firma" })!.queda).toEqual(["Ana Mora (Gerente) · Aprueba"]);
    expect(comoSeVeElCambio(c, "radiografia", {})).toBeNull();
    // Lo que ya está no se ofrece aplicar.
    expect(comoSeVeElCambio(c, "planes", "Cambiar el ERP")!.yaEsta).toBe(true);
    expect(comoSeVeElCambio(c, "presupuesto", "No lo dijeron")!.yaEsta).toBe(true);
  });

  it("en Negocio y Embudo, la cifra que se pisa se muestra; la que se suma, no", () => {
    const c = estado({ negocio: { ticket: "US$ 2.000", volumen: "US$ 50.000 al mes" } }).contenido;
    const se = comoSeVeElCambio(c, "negocio", { ticket: "US$ 3.000", cartera: "US$ 40.000 vencidos" })!;
    expect(se.reemplaza).toEqual(["Ticket promedio: US$ 2.000"]);
    expect(se.yaEsta).toBe(false);
    expect(comoSeVeElCambio(c, "negocio", { ticket: "US$ 2.000" })!.yaEsta).toBe(true);
  });

  it("con otra persona cambiando la tarjeta, «Aplicar» solo se reintenta si no pisa lo suyo", () => {
    const antes = estado({ negocio: { ticket: "US$ 2.000" }, planes: ["Cambiar el ERP"], presupuesto: "No lo dijeron" });
    const corrigioElTicket = estado({ negocio: { ticket: "US$ 5.000" }, planes: ["Cambiar el ERP", "Otro"], presupuesto: "Unos 10 mil" });
    expect(sePuedeReintentar([{ op: "sumarACasilla", clave: "negocio", valor: { ticket: "US$ 3.000" } }], antes, corrigioElTicket)).toBe(false);
    expect(sePuedeReintentar([{ op: "sumarACasilla", clave: "negocio", valor: { cartera: "US$ 40.000" } }], antes, corrigioElTicket)).toBe(true);
    expect(sePuedeReintentar([{ op: "sumarACasilla", clave: "planes", valor: "Ordenar la cobranza" }], antes, corrigioElTicket)).toBe(true);
    expect(sePuedeReintentar([{ op: "sumarACasilla", clave: "presupuesto", valor: "Unos 15 mil" }], antes, corrigioElTicket)).toBe(false);
  });
  it("del modelo a la tarjeta, con el validador de siempre", () => {
    const r = leerElTurno(
      { content: [{ type: "text", text: JSON.stringify({ tipo: "listo", cambios: [{ destino: "embudo", valor: { leads: "200 al mes", ciclo: 45 }, porque: "x", cita: "nos llegan 200 leads al mes" }, { destino: "embudo", valor: { leads: "200 al mes" }, porque: "Sus leads.", cita: "nos llegan 200 leads al mes" }] }), citations: null }] },
      {
        destinos: new Set(CASILLAS_PARA_NEXUS),
        valorValido: (d, v) => VALIDADOR_ESTRICTO.valorDelDestino({ tipo: "casilla", clave: d as (typeof CASILLAS_PARA_NEXUS)[number] }, v),
        loQueDijo: ["Nos llegan 200 leads al mes por la web"],
        puedePreguntar: true,
      },
    );
    if (r.tipo !== "listo") throw new Error("esperaba listo");
    expect(r.cambios.map((c) => c.valor)).toEqual([{ leads: "200 al mes" }]);
    expect(r.descartados).toBe(1);
  });
});

describe("la nota deja hechos como una reunión", () => {
  const NOTA = "El gerente nos confirmó que pierden unos 40 mil dólares al mes en cartera vencida.\nQuieren cambiar el ERP en enero.";
  it("se verifican contra la nota, con las reglas de una reunión, y los dijo el equipo", () => {
    const s = hechosVerificadosDeUnaNota(
      NOTA,
      [
        { tipo: "cuenta", frase: "La empresa pierde plata por la cartera vencida", cita: "pierden unos 40 mil dólares al mes en cartera vencida" },
        { tipo: "resultado", frase: "Quieren un ERP nuevo", cita: "quieren comprar Salesforce el otro año" },
        { tipo: "proceso_hoy", frase: "Vos cobrás a mano", cita: "quieren cambiar el ERP en enero" },
        { tipo: "cuenta", frase: "corto", cita: "en enero" },
      ],
      [],
    );
    expect(s.hechos).toHaveLength(1);
    expect(s.hechos[0]).toMatchObject({ tipo: "cuenta", quien: "smarteam", fuenteDeLaCita: "texto", projectId: null });
    expect(s.descartados.map((d) => d.motivo).sort()).toEqual(["cita_corta", "cita_no_aparece", "voseo"]);
  });
  it("su destino es la preventa donde se contó, delegado en ella", () => {
    expect(destinosDeUnaNota("exp-1")).toEqual([{ clave: "preventa", estado: "delegado", ref: { tipo: "preventa", exploracionIds: ["exp-1"] } }]);
  });
  it("los escribe el escritor de siempre, con su preventa y quién lo dijo", () => {
    const s = readFileSync("lib/seguimiento/hechos-server.ts", "utf8");
    expect(s).toMatch(/export async function escribirHechosDeUnaNota/);
    expect(s).toMatch(/dichoPorEmail: o\.dichoPorEmail/);
    expect(s).toMatch(/quien: "smarteam"/);
  });
});

describe("el chat no lee reuniones por su cuenta", () => {
  it("el servidor de la preventa no nombra FirefliesSession ni SessionProject (invariante 1)", () => {
    for (const f of ["lib/exploraciones/nexus-en-la-preventa-server.ts", "lib/chat-de-nexus/conversacion-server.ts"]) {
      const s = readFileSync(f, "utf8");
      expect(s).not.toMatch(/fireflies[sS]ession|sessionProject/);
    }
  });
});
