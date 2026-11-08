/**
 * La guía en bloques (2026-11-07, Elías): los minutos repartidos en código según la duración, la guía corta y las tres
 * preguntas para profundizar de cada bloque (con sus topes), y las guías de antes, que se siguen viendo.
 */
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { MAX_LARGO_DE_LA_GUIA_DEL_BLOQUE, MAX_PROFUNDIZAR, paraProfundizar, preguntasQueNoCumplen, rangoDelBloque, repartirMinutos, type AgendaDeLaGuia } from "./agenda";
import { HERRAMIENTA_DE_LA_GUIA, herramientaDeLaAgenda, leerLaGuiaDelAgente, pedidoDeLaGuia, type ContextoDeLaGuia } from "./guia-pedido";
import { leerGuia } from "./esquemas";
import { APERTURA_DEL_RESULTADO } from "./resultado";

function ctx(cambios: Partial<ContextoDeLaGuia> = {}): ContextoDeLaGuia {
  return {
    empresa: "Grupo Prueba",
    industria: "Retail",
    edicion: "general",
    perfil: null,
    hoy: "2026-11-07",
    proxima: { numero: 2, titulo: null, fecha: null, sesionId: "s-a1" },
    conTest: false,
    desdeCero: false,
    nivelesDeLaEscala: [],
    paraConectar: null,
    hubspotActual: null,
    confirmado: [],
    huecos: [{ clave: "metas", etiqueta: "Metas", ayuda: "", base: "" }],
    enfoque: [],
    noExplorado: [],
    objecionesDichas: [],
    paraExplorar: [],
    ...cambios,
  };
}

const respuesta = (input: Record<string, unknown>): Anthropic.Messages.Message =>
  ({ content: [{ type: "tool_use", id: "t1", name: HERRAMIENTA_DE_LA_GUIA, input }] }) as unknown as Anthropic.Messages.Message;

/** Que los bloques sean seguidos desde 0, sin huecos ni solapes, y terminen justo en la duración. */
function seguidos(bloques: readonly { desde: number; hasta: number }[], duracion: number) {
  expect(bloques[0].desde).toBe(0);
  for (let k = 1; k < bloques.length; k++) expect(bloques[k].desde).toBe(bloques[k - 1].hasta);
  for (const b of bloques) expect(b.hasta).toBeGreaterThan(b.desde);
  expect(bloques[bloques.length - 1].hasta).toBe(duracion);
}

describe("los minutos se reparten según la duración de la sesión", () => {
  // La agenda pensada para 60 minutos: apertura 5, resultado 8, dos del cuerpo, el central de 17 y el cierre de 10.
  const de60 = [
    { desde: 0, hasta: 5 },
    { desde: 5, hasta: 13 },
    { desde: 13, hasta: 23 },
    { desde: 23, hasta: 40 },
    { desde: 40, hasta: 50 },
    { desde: 50, hasta: 60 },
  ];

  it.each([30, 45, 60, 90])("escala a %i minutos: seguidos, sin solapes y terminando en la duración", (duracion) => {
    const r = repartirMinutos(de60, duracion);
    seguidos(r, duracion);
    // La proporción se respeta: el central sigue siendo el más largo.
    const largos = r.map((b) => b.hasta - b.desde);
    expect(Math.max(...largos)).toBe(largos[3]);
  });

  it("a 60 minutos, una agenda ya bien sumada queda igual", () => {
    expect(repartirMinutos(de60, 60)).toEqual(de60);
  });

  it("a 90 minutos, cada bloque crece en la misma proporción", () => {
    expect(repartirMinutos(de60, 90).map((b) => b.hasta - b.desde)).toEqual([8, 12, 15, 25, 15, 15]);
  });

  it("no confía en que el modelo sume bien: huecos, solapes y un total distinto se corrigen", () => {
    const mal = [
      { desde: 0, hasta: 10 },
      { desde: 8, hasta: 30 },
      { desde: 40, hasta: 40 },
      { desde: 50, hasta: 75 },
    ];
    seguidos(repartirMinutos(mal, 45), 45);
  });

  it("ningún bloque queda con menos de 3 minutos si la sesión alcanza; con muy poca, al menos 1", () => {
    const desparejos = [{ desde: 0, hasta: 1 }, { desde: 1, hasta: 2 }, { desde: 2, hasta: 58 }, { desde: 58, hasta: 60 }];
    const r = repartirMinutos(desparejos, 30);
    seguidos(r, 30);
    for (const b of r) expect(b.hasta - b.desde).toBeGreaterThanOrEqual(3);
    const corta = repartirMinutos(de60, 10);
    seguidos(corta, 10);
    for (const b of corta) expect(b.hasta - b.desde).toBeGreaterThanOrEqual(1);
  });

  it("conserva todo lo demás del bloque y el rango se lee sin «min»", () => {
    const [b] = repartirMinutos([{ desde: 3, hasta: 9, titulo: "Cómo mide el rendimiento la empresa" }], 45);
    expect(b).toEqual({ desde: 0, hasta: 45, titulo: "Cómo mide el rendimiento la empresa" });
    expect(rangoDelBloque({ desde: 10, hasta: 25 })).toBe("10–25");
  });
});

describe("leer la guía en bloques que devuelve el agente", () => {
  const cuerpo = (titulo: string, desde: number, hasta: number, extra: Record<string, unknown> = {}) => ({
    titulo,
    desde,
    hasta,
    tipo: "cuerpo",
    abre: `¿Cómo se ve hoy ${titulo.toLowerCase()}?`,
    averiguar: [{ que: `${titulo}, en detalle`, preguntas: [`Cuéntame un caso reciente de ${titulo.toLowerCase()}`] }],
    ...extra,
  });
  const input = (duracionPensada = 60) => ({
    objetivo: "Entender cómo mide el rendimiento la gerencia.",
    claves: ["Sus retos"],
    bloques: [
      { titulo: "Para qué estamos aquí", desde: 0, hasta: 5, tipo: "apertura", abre: "Gracias por el tiempo; hoy queremos entender cómo miden el negocio.", averiguar: [], guia: "Saludo y contexto." },
      cuerpo("El resultado que buscan", 5, 13, { resultado: true, guia: "Aquí buscamos el resultado en sus palabras.", profundizar: ["¿Con qué número sabrías que lo lograron?"] }),
      cuerpo("Cómo mide el rendimiento la empresa", 13, 28, {
        guia: "Aquí exploramos su tablero gerencial, la frecuencia de revisión y qué tan confiables son los datos.",
        profundizar: [
          "¿Qué revisas primero cuando abres el reporte?",
          "¿Qué indicador te ha sorprendido en los últimos meses, y por qué?",
          "Cuéntame de la última vez que un número no cuadraba",
          "Una cuarta de más",
        ],
      }),
      cuerpo("Qué espera de cada área", 28, 45, { central: true, guia: "x".repeat(MAX_LARGO_DE_LA_GUIA_DEL_BLOQUE + 50), profundizar: "no es una lista" }),
      cuerpo("Dónde se traba la ejecución", 45, 52),
      { titulo: "Qué validamos con tus líderes", desde: 52, hasta: duracionPensada, tipo: "cierre", abre: "Entonces lo que buscan es…; ¿lo dije bien?", averiguar: [] },
    ],
  });

  it("guarda la guía corta y hasta tres preguntas para profundizar, partiendo las dobles y sin la que abre", () => {
    const a = leerLaGuiaDelAgente(respuesta(input()), ctx(), "r1")!.agenda!;
    const mide = a.bloques.find((b) => b.titulo === "Cómo mide el rendimiento la empresa")!;
    expect(mide.guia).toMatch(/^Aquí exploramos su tablero gerencial/);
    // La doble se parte en dos: quedan tres, la cuarta se cae.
    expect(mide.profundizar).toEqual(["¿Qué revisas primero cuando abres el reporte?", "¿Qué indicador te ha sorprendido en los últimos meses?", "¿Por qué?"]);
    expect(mide.profundizar).toHaveLength(MAX_PROFUNDIZAR);
    const central = a.bloques.find((b) => b.central)!;
    expect(central.titulo).toBe("Qué espera de cada área");
    expect(central.guia!.length).toBeLessThanOrEqual(MAX_LARGO_DE_LA_GUIA_DEL_BLOQUE);
    // «profundizar» que no es una lista no se guarda: la pantalla usa las de lo que hay que averiguar.
    expect(central.profundizar).toBeUndefined();
    expect(paraProfundizar(central)).toEqual(["Cuéntame un caso reciente de qué espera de cada área"]);
  });

  it("el bloque del resultado que marcó el agente conserva su guía y sus preguntas", () => {
    const a = leerLaGuiaDelAgente(respuesta(input()), ctx(), "r1")!.agenda!;
    const res = a.bloques.find((b) => b.resultado)!;
    expect(res.guia).toBe("Aquí buscamos el resultado en sus palabras.");
    expect(res.averiguar.map((c) => c.id)).toEqual(["av:res1", "av:res2", "av:res3", "av:res4", "av:res5", "av:res6"]);
  });

  it("los minutos salen de la duración de la sesión, aunque el agente sume mal", () => {
    for (const duracion of [30, 45, 90]) {
      const a = leerLaGuiaDelAgente(respuesta(input(75)), ctx({ duracion }), "r1")!.agenda!;
      seguidos(a.bloques, duracion);
    }
    // Sin duración, 60.
    seguidos(leerLaGuiaDelAgente(respuesta(input(75)), ctx(), "r1")!.agenda!.bloques, 60);
  });

  it("la guía guardada vuelve a leerse con los campos nuevos, y una pregunta cerrada para profundizar se detecta", () => {
    const g = leerLaGuiaDelAgente(respuesta(input()), ctx(), "r1")!;
    const leida = leerGuia(JSON.parse(JSON.stringify(g)))!;
    expect(leida.agenda!.bloques.find((b) => b.titulo === "Cómo mide el rendimiento la empresa")?.profundizar).toHaveLength(3);
    const agenda: AgendaDeLaGuia = {
      claves: ["x"],
      bloques: [{ desde: 0, hasta: 60, titulo: "x", tipo: "cuerpo", abre: "Cuéntame cómo", averiguar: [], profundizar: ["¿Tienen un tablero?"], guia: "Revisa [lo que dijo]" }],
    };
    expect(preguntasQueNoCumplen(agenda)).toEqual(["¿Tienen un tablero?", "Revisa [lo que dijo]"]);
  });

  it("el pedido pide la guía, las preguntas para profundizar y el título como lo que hay que averiguar", () => {
    const tool = herramientaDeLaAgenda(ctx());
    const bloque = (tool.input_schema.properties as Record<string, { items: { properties: Record<string, { description?: string }>; required: string[] } }>).bloques.items;
    expect(bloque.required).toEqual(expect.arrayContaining(["guia", "profundizar"]));
    expect(bloque.properties.titulo.description).toContain("LO QUE HAY QUE AVERIGUAR");
    const sistema = String(pedidoDeLaGuia(ctx()).system);
    expect(sistema).toContain("El título de cada bloque es LO QUE HAY QUE AVERIGUAR");
    // Las reglas de antes siguen ahí.
    expect(sistema).toContain("Una sola cosa por pregunta");
    expect(sistema).toContain("no se vuelve a preguntar");
  });
});

describe("una guía de antes (sin guía corta ni preguntas para profundizar) se sigue viendo", () => {
  const vieja = {
    desde: 13,
    hasta: 40,
    titulo: "El seguimiento",
    tipo: "cuerpo" as const,
    abre: "Cuéntame qué pasa con un interesado después del primer contacto",
    averiguar: [
      { id: "av:a", que: "Cómo se asigna", preguntas: ["Cuéntame cómo se decide a quién le toca", "¿Qué pasa si nadie lo toma?"] },
      { id: "av:b", que: "Cómo se le da seguimiento", preguntas: ["Cuéntame qué pasa con un interesado después del primer contacto"] },
      { id: "av:c", que: "Cuándo se enfría", preguntas: ["¿Qué pasa con los que no contestan?"] },
      { id: "av:d", que: "Cómo se convierte", preguntas: ["¿Cómo se ve un cierre típico?"] },
      { id: "av:e", que: "Lo que no compra", preguntas: ["¿Qué pasa con los que no compran?"] },
    ],
  };

  it("las preguntas para profundizar son la primera de cada cosa, sin la que abre y hasta tres", () => {
    expect(paraProfundizar(vieja)).toEqual(["Cuéntame cómo se decide a quién le toca", "¿Qué pasa con los que no contestan?", "¿Cómo se ve un cierre típico?"]);
  });

  it("el bloque del resultado de antes no repite su apertura", () => {
    const res = { abre: APERTURA_DEL_RESULTADO, averiguar: [{ id: "av:res1", que: "x", preguntas: [APERTURA_DEL_RESULTADO] }, { id: "av:res2", que: "y", preguntas: ["¿Con qué número sabrías que lo lograron?"] }] };
    expect(paraProfundizar(res)).toEqual(["¿Con qué número sabrías que lo lograron?"]);
  });

  it("se lee igual que antes: sin guía corta y sin preguntas para profundizar guardadas", () => {
    const g = leerLaGuiaDelAgente(
      respuesta({
        objetivo: "x",
        claves: ["x"],
        bloques: [
          { titulo: "Abrir", desde: 0, hasta: 5, tipo: "apertura", abre: "Hola", averiguar: [] },
          { ...vieja, averiguar: vieja.averiguar.map(({ que, preguntas }) => ({ que, preguntas })) },
          { titulo: "Cerrar", desde: 40, hasta: 60, tipo: "cierre", abre: "Gracias", averiguar: [] },
        ],
      }),
      ctx(),
      null,
    )!;
    const guardada = JSON.parse(JSON.stringify(g));
    for (const b of guardada.agenda.bloques) {
      delete b.guia;
      delete b.profundizar;
    }
    const leida = leerGuia(guardada)!;
    const b = leida.agenda!.bloques.find((x) => x.titulo === "El seguimiento")!;
    expect(b.guia).toBeUndefined();
    expect(paraProfundizar(b)).toHaveLength(3);
  });
});
