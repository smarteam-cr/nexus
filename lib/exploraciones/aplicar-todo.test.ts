/**
 * «Aplicar todo» de «Hablar con Nexus» en la preventa (21 nov): qué manda (lo que sigue propuesto y no está), cuántos
 * reemplazan algo (el aviso de antes) y cómo dice al final cuántos aplicó, cuántos ya estaban y cuántos no pudo. La regla
 * es la del «Aplicar» uno por uno (`comoSeVeElCambio` + `sumarACasilla`). Sin IA ni base.
 */
import { describe, expect, it } from "vitest";
import { aplicarOperaciones, contenidoVacio, propuestaVacia, type EstadoDeExploracion, type Validez } from "./contenido";
import { VALIDADOR_ESTRICTO } from "./esquemas";
import { aplicarTodo, avisoDeReemplazos, comoSeVeElCambio, esCasillaParaNexus, planDeAplicarTodo, resumenDeAplicarTodo } from "./nexus-en-la-preventa";
import type { CambioPropuesto } from "@/lib/chat-de-nexus/conversacion";

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
const cambio = (id: string, destino: string, valor: unknown): CambioPropuesto => ({ id, destino, valor, porque: "x", cita: "y" });

const CAMBIOS = [
  cambio("a", "planes", "Ordenar la cobranza"),
  cambio("b", "planes", "Cambiar el ERP"), // ya está
  cambio("c", "presupuesto", "Unos US$ 15.000"), // reemplaza el texto
  cambio("d", "negocio", { ticket: "US$ 3.000", cartera: "US$ 40.000" }), // pisa el ticket
  cambio("e", "negocio", { cartera: "US$ 40.000" }),
  cambio("f", "radiografia", {}), // no es de la preventa
];
const HOY = estado({ planes: ["Cambiar el ERP"], presupuesto: "No lo dijeron", negocio: { ticket: "US$ 2.000" } });

describe("qué manda «Aplicar todo»", () => {
  it("lo que sigue propuesto y no está; cuenta lo que ya está y los reemplazos", () => {
    const p = planDeAplicarTodo(HOY.contenido, CAMBIOS, {});
    expect(p.pendientes.map((c) => c.id)).toEqual(["a", "c", "d", "e"]);
    expect(p.yaEstan).toBe(1);
    expect(p.reemplazos).toBe(2);
  });

  it("no vuelve a mandar lo aplicado, lo descartado ni lo que se está aplicando", () => {
    const p = planDeAplicarTodo(HOY.contenido, CAMBIOS, { a: "aplicado", c: "descartado", d: "aplicando" });
    expect(p.pendientes.map((c) => c.id)).toEqual(["e"]);
    expect(p.reemplazos).toBe(0);
  });

  it("dos que tocan lo mismo no van juntos: el segundo queda para aplicarlo uno por uno", () => {
    const p = planDeAplicarTodo(
      estado().contenido,
      [cambio("t1", "presupuesto", "Unos US$ 15.000"), cambio("t2", "presupuesto", "Entre 10 y 20 mil"), cambio("n1", "negocio", { ticket: "US$ 3.000" }), cambio("n2", "negocio", { ticket: "US$ 4.000", cartera: "x" }), cambio("n3", "negocio", { cartera: "y" })],
      {},
    );
    expect(p.pendientes.map((c) => c.id)).toEqual(["t1", "n1", "n3"]);
    expect(p.aMano.map((c) => c.id)).toEqual(["t2", "n2"]);
  });

  it("la función que usa la pantalla: en fila, sobre lo último guardado, y sigue si uno falla", async () => {
    // El «cambiar» del lienzo, de mentira: la regla pura del servidor, y un 409 que no se puede reintentar en la cartera.
    let e = HOY;
    const estados: Record<string, string> = {};
    const repetidos = [...CAMBIOS, cambio("g", "planes", "Ordenar la cobranza "), cambio("h", "embudo", { leads: "200 al mes" })];
    const r = await aplicarTodo({
      cambios: repetidos,
      estados: {},
      contenidoDeAhora: () => e.contenido,
      aplicar: async (clave, valor) => {
        if (clave === "embudo") return { ok: false, motivo: "La preventa cambió mientras la editabas." };
        const x = aplicarOperaciones(e, [{ op: "sumarACasilla", clave, valor }], VALIDEZ, VALIDADOR_ESTRICTO, QUIEN);
        if (!x.ok) return { ok: false, motivo: x.error };
        e = x.estado;
        return { ok: true };
      },
      ponerEstado: (id, s) => {
        estados[id] = s;
      },
    });
    // «e» suma la misma cartera que «d» ya dejó, y «g» es «a» con un espacio: los dos quedan «Ya está», como «b».
    expect(r).toEqual({ aplicados: 3, yaEstaban: 3, fallidos: [{ donde: "Embudo", motivo: "La preventa cambió mientras la editabas." }], aMano: 0 });
    expect(estados).toEqual({ a: "aplicado", c: "aplicado", d: "aplicado", h: "propuesto" });
    expect(e.contenido.casillas.planes).toEqual(["Cambiar el ERP", "Ordenar la cobranza"]);
    expect(e.contenido.casillas.presupuesto).toBe("Unos US$ 15.000");
    expect(e.contenido.casillas.negocio).toEqual({ ticket: "US$ 3.000", cartera: "US$ 40.000" });
  });

  it("y lo aplicado sigue la misma regla que el «Aplicar» uno por uno", () => {
    for (const c of CAMBIOS.filter((x) => esCasillaParaNexus(x.destino))) {
      const se = comoSeVeElCambio(HOY.contenido, c.destino, c.valor);
      expect(planDeAplicarTodo(HOY.contenido, [c], {}).pendientes.length).toBe(se && !se.yaEsta ? 1 : 0);
    }
  });
});

describe("lo que dice", () => {
  it("avisa antes cuántos reemplazan, y nada si ninguno", () => {
    expect(avisoDeReemplazos(0)).toBeNull();
    expect(avisoDeReemplazos(1)).toContain("Uno de los cambios reemplaza");
    expect(avisoDeReemplazos(2)).toContain("2 de los cambios reemplazan");
  });
  it("al final: cuántos aplicó, cuántos ya estaban y cuántos no pudo", () => {
    expect(resumenDeAplicarTodo({ aplicados: 3, yaEstaban: 1, fallidos: [{ donde: "Negocio", motivo: "x" }], aMano: 0 })).toBe(
      "Se aplicaron 3 cambios, uno ya estaba en su tarjeta y uno no se pudo aplicar.",
    );
    expect(resumenDeAplicarTodo({ aplicados: 1, yaEstaban: 0, fallidos: [], aMano: 1 })).toBe("Se aplicó un cambio. Uno quedó para que lo apliques tú: cambia lo mismo que otro.");
    expect(resumenDeAplicarTodo({ aplicados: 0, yaEstaban: 2, fallidos: [], aMano: 0 })).toBe("No se aplicó ningún cambio y 2 ya estaban en sus tarjetas.");
  });
});
