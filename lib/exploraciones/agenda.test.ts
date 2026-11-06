import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { alternarAveriguada, avanceDeLaAgenda, conHueco, partirPreguntaDoble, estaAveriguada, idDeAveriguar, preguntaCerrada, preguntaDoble, preguntasQueNoCumplen, type AgendaDeLaGuia } from "./agenda";
import { HERRAMIENTA_DE_LA_GUIA, leerLaGuiaDelAgente, pedidoDeLaGuia, voseoEnLaGuia, type ContextoDeLaGuia } from "./guia-pedido";
import { leerGuia, VALIDADOR_ESTRICTO } from "./esquemas";
import { aplicarOperaciones, contenidoVacio, propuestaVacia } from "./contenido";
import { borradorDeLoQueSabemos, faltaParaLaGuia, porAveriguar, tarjetasParaLaGuia, textoDeConQuien } from "./contexto-de-la-exploracion";
import { CLAVE_DEL_RESULTADO, conBloqueDelResultado, faltaElResultadoEnVivo, resultadoConfirmado } from "./resultado";
import { coberturaDeLaEscala, dondeQuedo, HERRAMIENTA_DE_LO_QUE_DEJO, leerLoQueDejo, retomarParaLaGuia } from "./despues-de-la-sesion";

function ctx(cambios: Partial<ContextoDeLaGuia> = {}): ContextoDeLaGuia {
  return {
    empresa: "Grupo Prueba",
    industria: "Retail",
    edicion: "general",
    perfil: null,
    hoy: "2026-11-06",
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

/** Lo que devolvería el agente, como bloque de la herramienta. */
function respuesta(input: Record<string, unknown>): Anthropic.Messages.Message {
  return { content: [{ type: "tool_use", id: "t1", name: HERRAMIENTA_DE_LA_GUIA, input }] } as unknown as Anthropic.Messages.Message;
}

const BLOQUE = (titulo: string, desde: number, hasta: number, extra: Record<string, unknown> = {}) => ({ titulo, desde, hasta, tipo: "cuerpo", abre: `Cuéntame de ${titulo}`, averiguar: [], ...extra });

describe("la agenda: preguntas abiertas y de una sola cosa (punto 11)", () => {
  it("marca las que se responden con sí, no o un número", () => {
    expect(preguntaCerrada("¿Tienen reglas para asignar los interesados?")).toBe(true);
    expect(preguntaCerrada("¿Cuántos vendedores tienen?")).toBe(true);
    expect(preguntaCerrada("Cuéntame cómo se decide hoy a qué vendedor le toca cada interesado")).toBe(false);
    expect(preguntaCerrada("¿Cómo deciden cuántos interesados le tocan a cada uno?")).toBe(false);
    expect(preguntaCerrada("¿Puedes contarme un caso reciente en que pasó eso?")).toBe(false);
    expect(preguntaCerrada("¿Están mirando otras alternativas además de esta conversación?")).toBe(true);
  });

  it("marca las que preguntan dos cosas", () => {
    expect(preguntaDoble("¿Cómo llegan? ¿Y quién los atiende?")).toBe(true);
    expect(preguntaDoble("¿Cómo llegan los interesados?")).toBe(false);
    // Las que encontró la validación con IA real (2026-11-06).
    expect(preguntaDoble("¿De dónde vienen los clientes que cierran, y cuántos llegan por semana?")).toBe(true);
    expect(preguntaDoble("¿Qué le pides al área comercial hoy, y cómo sabes si te lo está cumpliendo?")).toBe(true);
    expect(preguntaDoble("¿Cómo deciden a quién le toca cada interesado y en qué orden?")).toBe(false);
  });

  it("la doble que quedó se parte en dos preguntas de una sola cosa", () => {
    expect(partirPreguntaDoble("¿Qué números revisas para saber cómo va el negocio, y cuáles te gustaría ver y hoy no puedes?")).toEqual([
      "¿Qué números revisas para saber cómo va el negocio?",
      "¿Cuáles te gustaría ver y hoy no puedes?",
    ]);
    expect(partirPreguntaDoble("¿Cuánto tardó ese caso en cerrarse? ¿Qué fue lo que más lo demoró?")).toEqual(["¿Cuánto tardó ese caso en cerrarse?", "¿Qué fue lo que más lo demoró?"]);
    expect(partirPreguntaDoble("Cuéntame cómo llega un interesado")).toEqual(["Cuéntame cómo llega un interesado"]);
  });

  it("un texto con un espacio por completar no se puede decir tal cual", () => {
    expect(conHueco("Déjame resumir lo que escuché: [retos con las palabras del cliente]. ¿Lo entendí bien?")).toBe(true);
    expect(conHueco("Resume con sus palabras los dos o tres retos que salieron.")).toBe(false);
  });
});

describe("las marcas de lo averiguado (punto 8)", () => {
  const nueva = { id: idDeAveriguar("Cómo se asignan los interesados"), para: "1.2" };
  const sabida = { id: idDeAveriguar("Qué venden"), sabido: "el traspaso" };

  it("la huella no cambia con mayúsculas ni espacios", () => {
    expect(idDeAveriguar("Cómo se asignan  los interesados ")).toBe(nueva.id);
  });

  it("marcar una nueva deja también su tema como preguntado; lo que ya se sabía nace marcado y se puede desmarcar", () => {
    const h = alternarAveriguada(nueva, []);
    expect(estaAveriguada(nueva, h)).toBe(true);
    expect(h).toContain("1.2");
    expect(estaAveriguada(sabida, [])).toBe(true);
    const sin = alternarAveriguada(sabida, []);
    expect(estaAveriguada(sabida, sin)).toBe(false);
    expect(estaAveriguada(sabida, alternarAveriguada(sabida, sin))).toBe(true);
  });
});

describe("leer la agenda que devuelve el agente", () => {
  const input = {
    objetivo: "Entender cómo llegan y se atienden los interesados.",
    claves: ["Sus retos", "Cómo los mide hoy", "A dónde quiere llegar", "Quién decide", "De más"],
    bloques: [
      { titulo: "Abrir", desde: 0, hasta: 5, tipo: "cuerpo", abre: "Hola, gracias por el tiempo.", averiguar: [] },
      BLOQUE("Cómo llegan", 5, 15, {
        averiguar: [
          { que: "Cómo llega el interesado", preguntas: ["Cuéntame por dónde llega un interesado nuevo"], para: "metas" },
          { que: "Cómo se asignan", preguntas: ["Cuéntame cómo se decide a quién le toca"], para: "no-existe" },
          { que: "Cómo llega el interesado", preguntas: ["repetida"] },
        ],
      }),
      BLOQUE("El seguimiento", 15, 40, { central: true, impacto: "Cuántos se enfrían por mes y cuánto vale cada uno." }),
      BLOQUE("Lo que no compran", 40, 50, { central: true }),
      { titulo: "Cerrar", desde: 50, hasta: 60, tipo: "cuerpo", abre: "Entonces lo que más les pesa es…; ¿lo entendí bien?", averiguar: [] },
    ],
  };

  it("la apertura y el cierre son el primero y el último, hay un solo central y lo repetido o ajeno se cae", () => {
    const g = leerLaGuiaDelAgente(respuesta(input), ctx(), "r1", new Date("2026-11-06T12:00:00Z"));
    const a = g!.agenda!;
    // Sin bloque del resultado, el código lo suma después de la apertura (2026-11-06, segunda tanda).
    expect(a.bloques.map((b) => b.tipo)).toEqual(["apertura", "cuerpo", "cuerpo", "cuerpo", "cuerpo", "cierre"]);
    expect(a.bloques[1]).toMatchObject({ titulo: "El resultado que buscan", resultado: true, desde: 5, hasta: 13 });
    expect(a.bloques.filter((b) => b.central).map((b) => b.titulo)).toEqual(["El seguimiento"]);
    expect(a.claves).toHaveLength(4);
    expect(a.claves[0]).toMatch(/^El resultado que buscan/);
    expect(a.bloques[2].averiguar.map((c) => c.que)).toEqual(["Cómo llega el interesado", "Cómo se asignan"]);
    expect(a.bloques[2].averiguar[1].para).toBeUndefined();
    // La sesión dura lo mismo: el central cedió los minutos.
    expect(a.bloques[a.bloques.length - 1].hasta).toBe(60);
    // Las preguntas de antes salen de la agenda, para lo que todavía las lee.
    expect(g!.preguntas.map((p) => p.para)).toEqual(["metas"]);
    expect(g!.cierre).toContain("lo entendí bien");
  });

  it("la guía guardada se vuelve a leer igual, y una de antes (sin agenda) también", () => {
    const g = leerLaGuiaDelAgente(respuesta(input), ctx(), "r1")!;
    const guardada = JSON.parse(JSON.stringify(g));
    expect(leerGuia(guardada)?.agenda?.bloques).toHaveLength(6);
    const { agenda: _a, ...deAntes } = guardada;
    void _a;
    expect(leerGuia(deAntes)?.agenda).toBeUndefined();
    expect(leerGuia(deAntes)?.preguntas).toHaveLength(1);
  });

  it("el voseo y las preguntas cerradas de la agenda se detectan para pedirla otra vez", () => {
    const agenda: AgendaDeLaGuia = {
      claves: ["x"],
      bloques: [
        { desde: 0, hasta: 5, titulo: "Abrir", tipo: "apertura", abre: "Hola", averiguar: [] },
        { desde: 5, hasta: 55, titulo: "Cuerpo", tipo: "cuerpo", abre: "¿Tienen un CRM?", averiguar: [{ id: "av:1", que: "x", preguntas: ["Contame cómo lo hacés"] }] },
        { desde: 55, hasta: 60, titulo: "Cerrar", tipo: "cierre", abre: "Gracias", averiguar: [] },
      ],
    };
    expect(preguntasQueNoCumplen(agenda)).toEqual(["¿Tienen un CRM?"]);
    const g = leerLaGuiaDelAgente(respuesta({ objetivo: "x", claves: ["x"], bloques: agenda.bloques }), ctx(), null)!;
    expect(voseoEnLaGuia(g).length).toBeGreaterThan(0);
    expect(avanceDeLaAgenda(agenda, ["av:1"])).toEqual({ sabidas: 1, total: 1 });
  });
});

describe("el pedido de la agenda", () => {
  it("lleva el contexto que dio la persona, la duración y, en preventa, los clientes de referencia", () => {
    const p = pedidoDeLaGuia(
      ctx({
        duracion: 45,
        contextoDeLaExploracion: { objetivo: "Ver si les sirve ordenar el seguimiento", sabemos: "Llegaron por un referido" },
        contextoDeLaSesion: { conQuien: "Ana Pérez, gerente general", espera: "Quieren ver un demo y precios", objetivo: null },
        referencias: ["Retail: Tienda Ejemplo"],
      }),
    );
    const cuerpo = String(p.messages[0].content);
    expect(cuerpo).toContain("Ver si les sirve ordenar el seguimiento");
    expect(cuerpo).toContain("Ana Pérez, gerente general");
    expect(cuerpo).toContain("Duración: 45 minutos.");
    expect(cuerpo).toContain("Retail: Tienda Ejemplo");
    expect(String(p.system)).toContain("fraseDeDemo");
  });

  it("en un proyecto no lleva clientes de referencia ni la frase del demo", () => {
    const p = pedidoDeLaGuia(ctx({ marco: "cs" }));
    expect(String(p.messages[0].content)).not.toContain("CLIENTES DE REFERENCIA");
    expect(JSON.stringify(p.tools)).not.toContain("fraseDeDemo");
  });
});

describe("el contexto antes de armar la guía (puntos 1 a 5)", () => {
  const cx = { objetivo: "Ver si ordenar el seguimiento les cambia los números", por: "ana@smarteam.co", en: "2026-11-06T12:00:00.000Z" };

  it("sin el objetivo de la exploración, con quién es y el objetivo de la sesión, no hay guía", () => {
    expect(faltaParaLaGuia(undefined, null)).toEqual(["el objetivo de la exploración", "con quién es la sesión", "el objetivo de la sesión"]);
    expect(faltaParaLaGuia(cx, { conQuien: [{ nombre: "  " }], objetivo: "x" })).toEqual(["con quién es la sesión"]);
    expect(faltaParaLaGuia(cx, { conQuien: [{ nombre: "Ana Pérez" }], objetivo: "Entender cómo decide" })).toEqual([]);
  });

  it("con quién se lee con su puesto y su área", () => {
    expect(textoDeConQuien([{ nombre: "Ana Pérez", puesto: "gerente general", area: "Dirección" }, { nombre: "Luis" }])).toBe("Ana Pérez (gerente general, Dirección), Luis");
    expect(textoDeConQuien([])).toBeNull();
  });

  it("el borrador de lo que ya sabemos dice de dónde sale cada parte y respeta el tope", () => {
    const b = borradorDeLoQueSabemos([
      { de: "Cómo llegó", texto: "Referido." },
      { de: "Las notas de HubSpot", texto: "x".repeat(500) },
    ], 300);
    expect(b.startsWith("Cómo llegó:\nReferido.")).toBe(true);
    expect(b.length).toBeLessThanOrEqual(300);
    expect(b.endsWith("…")).toBe(true);
  });

  it("confirmar el contexto guarda quién y cuándo; vacío no se confirma", () => {
    const base = { contenido: contenidoVacio(), propuesta: propuestaVacia(), areas: [], edicion: null, perfilCierre: null, perfilDespues: null, responsableEmail: null, archivada: false };
    const v = { dimensiones: new Set<string>(), criterios: new Set<string>(), areas: new Set<string>(), ediciones: new Set<string>(), perfilesHabituales: {}, escalaVersion: "1" };
    const quien = { por: "ana@smarteam.co", en: "2026-11-06T12:00:00.000Z" };
    const r = aplicarOperaciones(base, [{ op: "contexto", valor: { objetivo: " Ver si les sirve ", sabemos: "" } }], v, VALIDADOR_ESTRICTO, quien);
    expect(r.ok && r.estado.contenido.contexto).toEqual({ objetivo: "Ver si les sirve", por: "ana@smarteam.co", en: "2026-11-06T12:00:00.000Z" });
    expect(aplicarOperaciones(base, [{ op: "contexto", valor: { objetivo: "  " } }], v, VALIDADOR_ESTRICTO, quien).ok).toBe(false);
  });
});

describe("después de la sesión y dónde quedó (puntos 14 a 16)", () => {
  const sesiones = [
    { id: "s-a1", titulo: "Con Dirección", desafio: { texto: "El seguimiento depende de cada vendedor", falta: ["cuántos se enfrían"] }, retomar: [{ tema: "Cómo miden servicio", donde: "con la jefa de servicio" }] },
    { id: "s-a2" },
  ];

  it("lo que dejaron las sesiones anteriores llega a la guía de la siguiente, y no lo de la misma ni las de después", () => {
    const r = retomarParaLaGuia(sesiones, "s-a2").retomar ?? [];
    expect(r[0]).toContain("El seguimiento depende de cada vendedor");
    expect(r[1]).toContain("Retomar «Cómo miden servicio» — con la jefa de servicio");
    expect(retomarParaLaGuia(sesiones, "s-a1")).toEqual({});
  });

  it("un área sin evidencia queda pendiente; la hipótesis no cuenta", () => {
    const areas = [
      { id: "1", nombre: "Ventas", dimensiones: [{ id: "1.1" }, { id: "1.2" }, { id: "1.3", aplica: false }] },
      { id: "2", nombre: "Marketing", dimensiones: [{ id: "2.1" }] },
      { id: "3", nombre: "Servicio", dimensiones: [{ id: "3.1" }] },
    ];
    const c = coberturaDeLaEscala(areas, ["1", "2"], { "1.1": { clase: "evidencia" }, "2.1": { clase: "hipotesis" } });
    expect(c.map((a) => [a.nombre, a.estado, a.conEvidencia, a.total])).toEqual([
      ["Ventas", "a medias", 1, 2],
      ["Marketing", "pendiente", 0, 1],
    ]);
  });

  it("dónde quedó: la última sesión que pasó, lo averiguado de sus agendas y lo que hay que retomar", () => {
    const agenda: AgendaDeLaGuia = { claves: ["x"], bloques: [{ desde: 0, hasta: 60, titulo: "x", tipo: "cuerpo", abre: "x", averiguar: [{ id: "av:1", que: "a", preguntas: ["p"] }, { id: "av:2", que: "b", preguntas: ["p"], sabido: "el traspaso" }] }] };
    const d = dondeQuedo(
      [
        { numero: 1, hecha: true, sesion: { ...sesiones[0], hechas: [] }, fecha: "2026-11-02" },
        { numero: 2, hecha: false, sesion: sesiones[1], fecha: null },
      ],
      { "s-a1": { agenda } },
    );
    expect(d.ultima).toMatchObject({ numero: 1, titulo: "Con Dirección", fecha: "2026-11-02" });
    expect(d.averiguado).toEqual({ sabidas: 1, total: 2 });
    expect(d.retomar).toHaveLength(1);
  });

  it("lo que propone Nexus se lee con sus topes y queda marcado como propuesto", () => {
    const r = leerLoQueDejo({
      content: [{ type: "tool_use", id: "t", name: HERRAMIENTA_DE_LO_QUE_DEJO, input: { desafio: "Nadie ve los interesados que se enfrían", falta: ["a", "b", "c", "d", "e"], retomar: Array.from({ length: 7 }, (_, i) => ({ tema: `t${i}`, donde: "con Ventas" })) } }],
    } as unknown as Anthropic.Messages.Message);
    expect(r?.desafio).toMatchObject({ texto: "Nadie ve los interesados que se enfrían", propuesto: true });
    expect(r?.desafio.falta).toHaveLength(4);
    expect(r?.retomar).toHaveLength(5);
  });

  it("la guía de la siguiente sesión recibe lo que hay que retomar", () => {
    expect(String(pedidoDeLaGuia(ctx({ retomar: ["Retomar «x» — con Ana"] })).messages[0].content)).toContain("LO QUE QUEDÓ POR RETOMAR");
  });
});

describe("el resultado como eje (segunda tanda, 2026-11-06)", () => {
  const agenda = (bloques: AgendaDeLaGuia["bloques"]): AgendaDeLaGuia => ({ claves: ["Sus retos"], bloques });
  const abrir = { desde: 0, hasta: 5, titulo: "Abrir", tipo: "apertura" as const, abre: "Hola", averiguar: [] };
  const cerrar = { desde: 50, hasta: 60, titulo: "Cerrar", tipo: "cierre" as const, abre: "Gracias", averiguar: [] };

  it("el bloque que marca el agente lleva las seis cosas fijas, con sus preguntas por posición", () => {
    const marcado = { desde: 5, hasta: 15, titulo: "Lo que quieren lograr", tipo: "cuerpo" as const, abre: "¿Qué tendría que pasar?", averiguar: [{ id: "av:x", que: "otra cosa", preguntas: ["Cuéntame qué quieren lograr este año"] }] };
    const a = conBloqueDelResultado(agenda([abrir, marcado, cerrar]), 1);
    expect(a.bloques[1].resultado).toBe(true);
    expect(a.bloques[1].averiguar.map((c) => c.id)).toEqual(["av:res1", "av:res2", "av:res3", "av:res4", "av:res5", "av:res6"]);
    expect(a.bloques[1].averiguar[0].preguntas).toEqual(["Cuéntame qué quieren lograr este año"]);
    expect(a.claves[0]).toBe(CLAVE_DEL_RESULTADO);
  });

  it("en vivo avisa pasada la mitad si el resultado sigue sin marcar, y no antes ni con él marcado", () => {
    const a = conBloqueDelResultado(agenda([abrir, { desde: 5, hasta: 50, titulo: "Cuerpo", tipo: "cuerpo", abre: "x", averiguar: [] }, cerrar]), null);
    const inicio = Date.parse("2026-11-06T10:00:00Z");
    const a35 = inicio + 35 * 60_000;
    expect(faltaElResultadoEnVivo({ agenda: a, hechas: [], inicio, ahora: a35, minutos: 60 })).toBe(true);
    expect(faltaElResultadoEnVivo({ agenda: a, hechas: [], inicio, ahora: inicio + 20 * 60_000, minutos: 60 })).toBe(false);
    expect(faltaElResultadoEnVivo({ agenda: a, hechas: ["av:res1"], inicio, ahora: a35, minutos: 60 })).toBe(false);
    // Una guía de la primera tanda, sin bloque del resultado: no avisa.
    expect(faltaElResultadoEnVivo({ agenda: agenda([abrir, cerrar]), hechas: [], inicio, ahora: a35, minutos: 60 })).toBe(false);
  });

  it("en preventa no hay propuesta sin una meta confirmada", () => {
    expect(resultadoConfirmado({ metas: [] })).toBe(false);
    expect(resultadoConfirmado({})).toBe(false);
    expect(resultadoConfirmado({ metas: [{ objetivo: "Pasar de 4 a 7 cierres de cada 10" }] })).toBe(true);
  });

  it("si la reunión no dejó claro el resultado, el desafío queda sin confirmar y la siguiente guía arranca por ahí", () => {
    const r = leerLoQueDejo({
      content: [{ type: "tool_use", id: "t", name: HERRAMIENTA_DE_LO_QUE_DEJO, input: { desafio: "x", resultadoClaro: false, falta: [], retomar: [] } }],
    } as unknown as Anthropic.Messages.Message);
    expect(r?.desafio.sinConfirmar).toBe(true);
    const lineas = retomarParaLaGuia([{ id: "s-a1", desafio: r!.desafio }, { id: "s-a2" }], "s-a2").retomar ?? [];
    expect(lineas.some((l) => l.includes("SIN CONFIRMAR"))).toBe(true);
  });

  it("las tarjetas de lo que ya sabemos: lo vacío queda por averiguar y entra al pedido", () => {
    const t = { retos: { texto: "Todo en Excel", fuente: "El traspaso" }, plazos: { texto: "  ", fuente: "x" } };
    expect(porAveriguar(t)).toEqual(["resultado", "plazos", "presupuesto", "decide", "siNada"]);
    const p = tarjetasParaLaGuia(t);
    expect(p.sabido).toEqual(["Retos: Todo en Excel (fuente: El traspaso)"]);
    const cuerpo = String(pedidoDeLaGuia(ctx({ contextoDeLaExploracion: { objetivo: "x", sabemos: null, tarjetas: p } })).messages[0].content);
    expect(cuerpo).toContain("POR AVERIGUAR");
    expect(cuerpo).toContain("Resultado que buscan");
  });
});
