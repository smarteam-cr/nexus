/**
 * lib/feedback/encuestas.test.ts — una pregunta mandada a varias personas se lee como una sola (2026-10-06).
 */
import { describe, expect, it } from "vitest";
import { agruparPedidos, metaDeLaPregunta, queSigueDeEncuestas, respuestasSinRevisar, textoDeEspera } from "./encuestas";
import type { PedidoVisible, PersonaParaPreguntar } from "./queries";

const HOY = new Date("2026-10-07T15:00:00");

let n = 0;
function pedido(p: Partial<PedidoVisible> & { nombre?: string }): PedidoVisible {
  n++;
  const nombre = p.nombre ?? `Persona ${n}`;
  return {
    id: `p${n}`,
    para: { email: `${nombre.toLowerCase().replace(/ /g, ".")}@smarteamcr.com`, nombre, rol: "CSE", iniciales: nombre.slice(0, 2).toUpperCase() },
    pantalla: "Ventas › Preventa",
    ruta: "/sales/exploraciones",
    pregunta: "¿Qué te falta en la ficha de una empresa?",
    estado: "abierto",
    hasta: "2026-10-14T12:00:00.000Z",
    vistoVeces: 0,
    respondidoAt: null,
    descartadoAt: null,
    creado: "2026-10-06T16:00:00.000Z",
    creadoPor: "elias@smarteamcr.com",
    respuesta: null,
    ...p,
  };
}

const equipo = (callados: number): PersonaParaPreguntar[] =>
  Array.from({ length: 3 }, (_, i) => ({
    email: `p${i}@smarteamcr.com`,
    nombre: `Persona ${i}`,
    rol: "CSE",
    iniciales: "PE",
    ultimo: null,
    callado: i < callados,
  }));

describe("agruparPedidos", () => {
  it("los pedidos del mismo envío son una pregunta, aunque se hayan creado con milisegundos de diferencia", () => {
    const { abiertas, cerradas } = agruparPedidos(
      [
        pedido({ nombre: "Sofía Brenes", creado: "2026-10-06T16:00:00.010Z" }),
        pedido({ nombre: "Jorge Quesada", creado: "2026-10-06T16:00:00.000Z" }),
        pedido({ nombre: "Andrés Pinzón", pregunta: "Otra pregunta" }),
      ],
      HOY,
    );
    expect(abiertas).toHaveLength(2);
    expect(cerradas).toHaveLength(0);
    const g = abiertas.find((x) => x.pregunta.startsWith("¿Qué"))!;
    expect(g.personas.map((p) => p.primerNombre)).toEqual(["Jorge", "Sofía"]);
    expect(g.enviada).toBe("2026-10-06T16:00:00.000Z");
  });

  it("la misma pregunta con otro plazo u otra pantalla es otro envío", () => {
    const { abiertas } = agruparPedidos([pedido({}), pedido({ hasta: "2026-10-20T12:00:00.000Z" }), pedido({ ruta: "/clients" })], HOY);
    expect(abiertas).toHaveLength(3);
  });

  it("sigue abierta mientras a alguien le aparece; contesto primero, después quien espera", () => {
    const { abiertas } = agruparPedidos(
      [
        pedido({ nombre: "Ana", estado: "respondido", respondidoAt: "2026-10-07T10:00:00.000Z", respuesta: { id: "r1", numero: 134, cuerpo: "Saber qué le vendimos", estado: "sin_revisar" } }),
        pedido({ nombre: "Beto", vistoVeces: 2 }),
        pedido({ nombre: "Caro", estado: "descartado", descartadoAt: "2026-10-07T11:00:00.000Z" }),
      ],
      HOY,
    );
    const g = abiertas[0];
    expect(g.abierta).toBe(true);
    expect(g.contestaron).toBe(1);
    expect(g.faltan).toBe(1);
    expect(g.personas.map((p) => p.estado)).toEqual(["contesto", "espera", "ahora_no"]);
    expect(g.respuestas).toEqual([
      { reporteId: "r1", numero: 134, cuerpo: "Saber qué le vendimos", enTema: false, nombre: "Ana", iniciales: "AN", fecha: "2026-10-07T10:00:00.000Z" },
    ]);
  });

  it("con el plazo vencido ya no le aparece a nadie: la pregunta se cierra y cierra el día del plazo", () => {
    const { abiertas, cerradas } = agruparPedidos(
      [
        pedido({ nombre: "Ana", hasta: "2026-10-04T12:00:00.000Z", estado: "respondido", respondidoAt: "2026-10-02T10:00:00.000Z" }),
        pedido({ nombre: "Beto", hasta: "2026-10-04T12:00:00.000Z" }),
      ],
      HOY,
    );
    expect(abiertas).toHaveLength(0);
    expect(cerradas[0].personas.map((p) => p.estado)).toEqual(["contesto", "vencio"]);
    expect(cerradas[0].cerro).toBe("2026-10-04T12:00:00.000Z");
  });

  it("el día del plazo todavía le aparece", () => {
    const { abiertas } = agruparPedidos([pedido({ hasta: "2026-10-07T12:00:00.000Z" })], HOY);
    expect(abiertas).toHaveLength(1);
  });

  it("si todos contestaron, cerró con la última respuesta", () => {
    const { cerradas } = agruparPedidos(
      [
        pedido({ estado: "respondido", respondidoAt: "2026-10-02T10:00:00.000Z" }),
        pedido({ estado: "descartado", descartadoAt: "2026-10-03T10:00:00.000Z" }),
      ],
      HOY,
    );
    expect(cerradas[0].cerro).toBe("2026-10-03T10:00:00.000Z");
  });

  it("una respuesta que ya se llevó a la hoja de ruta se abre en su tema", () => {
    const { cerradas } = agruparPedidos([pedido({ estado: "respondido", respondidoAt: "2026-10-02T10:00:00.000Z", respuesta: { id: "r", numero: 1, cuerpo: "x", estado: "en_hoja" } })], HOY);
    expect(cerradas[0].respuestas[0].enTema).toBe(true);
  });
});

describe("lo que se dice de cada pregunta", () => {
  it("nadie la vio todavía", () => {
    const { abiertas } = agruparPedidos([pedido({}), pedido({})], HOY);
    expect(textoDeEspera(abiertas[0])).toBe("Nadie la vio todavía: les aparece cuando entren a «Ventas › Preventa»");
    expect(metaDeLaPregunta(abiertas[0])).toMatch(/^En «Ventas › Preventa» · enviada el \d+ oct · hasta el \d+ oct$/);
  });

  it("a una sola persona", () => {
    const { abiertas } = agruparPedidos([pedido({ nombre: "Jorge Quesada" })], HOY);
    expect(textoDeEspera(abiertas[0])).toBe("Jorge todavía no la vio: le aparece cuando entre a «Ventas › Preventa»");
  });

  it("a quién se espera y cuántas veces la vio", () => {
    const { abiertas } = agruparPedidos(
      [
        pedido({ nombre: "Sofía Brenes", estado: "respondido", respondidoAt: "2026-10-07T10:00:00.000Z" }),
        pedido({ nombre: "Jorge Quesada", vistoVeces: 2 }),
        pedido({ nombre: "Andrés Pinzón" }),
        pedido({ nombre: "Lidia Flores", estado: "descartado" }),
      ],
      HOY,
    );
    expect(textoDeEspera(abiertas[0])).toBe("Esperando a Andrés (todavía no la vio) y Jorge (la vio 2 veces) · Lidia dijo «Ahora no»");
  });

  it("cerrada: quién no contestó y por qué", () => {
    const { cerradas } = agruparPedidos(
      [
        pedido({ nombre: "Natalia Vega", hasta: "2026-10-04T12:00:00.000Z", estado: "respondido", respondidoAt: "2026-10-02T10:00:00.000Z" }),
        pedido({ nombre: "Lidia Flores", hasta: "2026-10-04T12:00:00.000Z", estado: "descartado" }),
        pedido({ nombre: "Beto Ruiz", hasta: "2026-10-04T12:00:00.000Z" }),
      ],
      HOY,
    );
    expect(textoDeEspera(cerradas[0])).toBe("Lidia dijo «Ahora no» · Beto no contestó a tiempo");
    expect(metaDeLaPregunta(cerradas[0])).toMatch(/· cerró el \d+ oct$/);
  });

  it("si contestaron todos, se dice; si era una sola persona, no hace falta", () => {
    const todos = agruparPedidos([pedido({ estado: "respondido" }), pedido({ estado: "respondido" })], HOY).cerradas[0];
    const una = agruparPedidos([pedido({ estado: "respondido" })], HOY).cerradas[0];
    expect(textoDeEspera(todos)).toBe("Contestaron todos");
    expect(textoDeEspera(una)).toBe("");
  });
});

describe("queSigueDeEncuestas", () => {
  it("lo primero: las respuestas que esperan una decisión en la Bandeja", () => {
    const ps = [pedido({ estado: "respondido", respuesta: { id: "r", numero: 1, cuerpo: "x", estado: "sin_revisar" } }), pedido({ vistoVeces: 3 })];
    const r = queSigueDeEncuestas(agruparPedidos(ps, HOY), equipo(1), respuestasSinRevisar(ps));
    expect(r).toEqual({ texto: "1 respuesta espera tu decisión en la Bandeja.", aLaBandeja: true });
  });

  it("sin preguntas todavía: empezar por quien no reporta", () => {
    expect(queSigueDeEncuestas({ abiertas: [], cerradas: [] }, equipo(2), 0).texto).toBe(
      "Todavía no le preguntaste nada a nadie. Empieza por alguien que no reporta hace un mes.",
    );
  });

  it("quien la vio varias veces y no contestó", () => {
    const ps = [pedido({ nombre: "Jorge Quesada", vistoVeces: 2 }), pedido({ nombre: "Ana", vistoVeces: 1 })];
    expect(queSigueDeEncuestas(agruparPedidos(ps, HOY), equipo(0), 0).texto).toBe(
      "Jorge vio 2 veces la pregunta de «Ventas › Preventa» y no contestó. Si es urgente, pregúntale en persona.",
    );
  });

  it("esperando: nada que hacer", () => {
    expect(queSigueDeEncuestas(agruparPedidos([pedido({}), pedido({})], HOY), equipo(0), 0).texto).toBe(
      "2 personas todavía no contestan: les aparece al entrar a la pantalla que elegiste. Nada que hacer por ahora.",
    );
  });

  it("todo contestado: quien no reporta", () => {
    const g = agruparPedidos([pedido({ estado: "respondido", respuesta: { id: "r", numero: 1, cuerpo: "x", estado: "respondido" } })], HOY);
    expect(queSigueDeEncuestas(g, equipo(1), 0).texto).toBe("Una persona no reporta hace 30 días: pregúntale algo concreto a una.");
    expect(queSigueDeEncuestas(g, equipo(0), 0).texto).toBe("Nadie te debe una respuesta.");
  });
});
