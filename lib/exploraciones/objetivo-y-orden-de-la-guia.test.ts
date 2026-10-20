/**
 * lib/exploraciones/objetivo-y-orden-de-la-guia.test.ts — las tres mejoras de la guía de una sesión que pidió la revisión
 * de CEMACO con Liliana (2026-10-20), en el proyecto y en la preventa (el mismo lienzo):
 *   1. al guardar el objetivo, Nexus propone preguntas para ese objetivo (usar o descartar);
 *   2. al aplicar una lista del chat que toca la guía, la exploración abierta se vuelve a leer;
 *   3. las preguntas se arrastran y el orden elegido manda en todos lados.
 * Correr: `npx vitest run lib/exploraciones/objetivo-y-orden-de-la-guia.test.ts --project unit`.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GUIA_VIEJA_DE_LARCE, LARCE_AL_ARMAR_LA_GUIA, POSICIONES_DE_LARCE, TESTS_DE_LARCE } from "./__fixtures__/preventa-larce";
import { ESCALA_DE_PRUEBA } from "./escala-de-prueba.test-helpers";
import { focoDeLaGuia, ordenDeLaConversacion, preguntasParaMostrar, type GuiaDeLaSesion, type PreguntaParaMostrar } from "./guia";
import { contextoDelPlan } from "./plan-de-la-guia";
import {
  aplicarAjustes,
  aplicarCambioDeLaGuia,
  claveDePregunta,
  deshacerElBorrado,
  hayAjustes,
  MAX_PREGUNTAS_PROPIAS,
  MAX_SUGERIDAS_DEL_OBJETIVO,
  ordenAlSoltar,
  sugeridasVigentes,
  yaPropuestasParaElObjetivo,
  type AjustesDeLaGuia,
  type CambioDeLaGuia,
} from "./ajustes-de-la-guia";
import { CambioDeLaGuiaSchema, SesionPlaneadaSchema } from "./esquemas";
import { aplicarOperaciones, VALIDADOR_LIBRE } from "./contenido";
import {
  HERRAMIENTA_DE_PREGUNTAS_DEL_OBJETIVO,
  leerPreguntasDelObjetivo,
  leerUnaPregunta,
  HERRAMIENTA_DE_UNA_PREGUNTA,
  pedidoDePreguntasDelObjetivo,
  type EntradaDelObjetivo,
  type EntradaDeUnaPregunta,
} from "./guia-pregunta-pedido";
import { CUALQUIER_EXPLORACION, esParaEstaExploracion, exploracionesQueTocaLaLista } from "./aviso-de-la-guia";

const VALIDEZ = { dimensiones: new Set<string>(), criterios: new Set<string>(), areas: new Set<string>(), ediciones: new Set<string>(), perfilesHabituales: {}, escalaVersion: "1" };
const SIN_PROCEDENCIAS = { abiertos: new Map<string, number>(), pasaron: new Map<string, number>() };
const ctxDelPlan = contextoDelPlan({ estado: LARCE_AL_ARMAR_LA_GUIA, tests: TESTS_DE_LARCE, escala: ESCALA_DE_PRUEBA, posiciones: POSICIONES_DE_LARCE, sesionId: null });

function preguntasDeLarce(guia: GuiaDeLaSesion | null = GUIA_VIEJA_DE_LARCE): PreguntaParaMostrar[] {
  const foco = focoDeLaGuia(LARCE_AL_ARMAR_LA_GUIA.contenido.casillas, ESCALA_DE_PRUEBA, ["1"], POSICIONES_DE_LARCE, {}, undefined, ctxDelPlan);
  return preguntasParaMostrar(guia, foco.huecos, foco.enfoque, ESCALA_DE_PRUEBA, SIN_PROCEDENCIAS, undefined, { plan: foco.plan!, saber: ctxDelPlan.saber });
}

function aplicar(a: AjustesDeLaGuia | undefined, ...cambios: CambioDeLaGuia[]): AjustesDeLaGuia {
  let actual = a;
  for (const c of cambios) {
    const r = aplicarCambioDeLaGuia(actual, c);
    if (!r.ok) throw new Error(r.error);
    actual = r.ajustes;
  }
  return actual ?? {};
}

const claves = (ps: readonly PreguntaParaMostrar[]) => ps.map(claveDePregunta);
/** Lo que ve la persona en «En orden» (y lo que numera el chat): los ajustes aplicados y el orden de la conversación. */
const enOrden = (ps: readonly PreguntaParaMostrar[], a: AjustesDeLaGuia | undefined) => ordenDeLaConversacion(aplicarAjustes(ps, a));

// ── 3. El orden elegido ───────────────────────────────────────────────────────

describe("las preguntas se arrastran para cambiar el orden", () => {
  const preguntas = preguntasDeLarce();
  const natural = claves(enOrden(preguntas, undefined));

  it("hay con qué probar: la guía de Larce trae varias preguntas y el presupuesto al final", () => {
    expect(natural.length).toBeGreaterThanOrEqual(4);
    expect(natural.at(-1)).toMatch(/^presupuesto/);
  });

  it("soltar una pregunta en el lugar de otra corre las del medio, como dnd-kit", () => {
    expect(ordenAlSoltar(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
    expect(ordenAlSoltar(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
    expect(ordenAlSoltar(["a", "b"], "a", "a")).toBeNull();
    expect(ordenAlSoltar(["a", "b"], "a", null)).toBeNull();
    expect(ordenAlSoltar(["a", "b"], "x", "a")).toBeNull();
  });

  it("el orden elegido manda en «En orden» (y por eso en «En vivo» y en el chat), aunque el presupuesto vaya primero", () => {
    const elegido = [...natural].reverse();
    const a = aplicar(undefined, { tipo: "ordenar", claves: elegido });
    expect(a.orden).toEqual(elegido);
    expect(claves(enOrden(preguntas, a))).toEqual(elegido);
  });

  it("sobrevive a «Actualizar la guía»: vive en la sesión; lo nuevo va al final y lo que ya no está no estorba", () => {
    const elegido = [natural[2], natural[0], natural[1], ...natural.slice(3)];
    const a = aplicar(undefined, { tipo: "ordenar", claves: [...elegido, "1.9:impacto"] });
    // La guía nueva: sin la primera pregunta de antes y con una que no estaba (una propia sumada después, al final).
    const conPropia = aplicar(a, { tipo: "agregar", pregunta: { id: "pnueva1", pregunta: "¿Qué pidió Marco medir?", repreguntas: [], origen: "tuya" } });
    const nuevaGuia = preguntas.filter((p) => claveDePregunta(p) !== natural[0]);
    const vistas = claves(enOrden(nuevaGuia, conPropia));
    expect(vistas).toEqual([...elegido.filter((k) => k !== natural[0]), "propia:pnueva1"]);
  });

  it("«Volver al orden de la guía» lo deja como lo arma la guía", () => {
    const a = aplicar(undefined, { tipo: "ordenar", claves: [...natural].reverse() }, { tipo: "ordenar", claves: [] });
    expect(hayAjustes(a)).toBe(false);
    expect(claves(enOrden(preguntas, a))).toEqual(natural);
  });

  it("no guarda claves repetidas ni de más", () => {
    expect(aplicar(undefined, { tipo: "ordenar", claves: ["metas:impacto", "metas:impacto", " 1.7:impacto "] }).orden).toEqual(["metas:impacto", "1.7:impacto"]);
    const r = aplicarCambioDeLaGuia(undefined, { tipo: "ordenar", claves: Array.from({ length: 60 }, (_, i) => `k${i}`) });
    expect(r.ok).toBe(false);
  });

  it("guardar otra cosa de la sesión (el objetivo) no se lleva el orden: el esquema lo conoce", () => {
    const a = aplicar(undefined, { tipo: "ordenar", claves: [...natural].reverse() });
    const sesion = SesionPlaneadaSchema.parse({ id: "s-uno", objetivo: "Marketing", ajustesDeLaGuia: a });
    expect(sesion.ajustesDeLaGuia?.orden).toEqual([...natural].reverse());
    expect(CambioDeLaGuiaSchema.safeParse({ tipo: "ordenar", claves: natural }).success).toBe(true);
  });

  it("la operación de la pantalla lo aplica igual que el servidor y crea la sesión si no existía", () => {
    const r = aplicarOperaciones(LARCE_AL_ARMAR_LA_GUIA, [{ op: "ajustarGuia", sesionId: "s-nueva", cambio: { tipo: "ordenar", claves: [...natural].reverse() } }], VALIDEZ as never, VALIDADOR_LIBRE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.estado.contenido.sesiones.find((s) => s.id === "s-nueva")?.ajustesDeLaGuia?.orden).toEqual([...natural].reverse());
  });

  it("el agente que lee la reunión y el chat usan el orden de la conversación (guarda estructural)", () => {
    const agente = readFileSync(join(__dirname, "agente.ts"), "utf8");
    expect(agente).toMatch(/ordenDeLaConversacion\(\s*aplicarAjustes\(/);
    const chat = readFileSync(join(__dirname, "..", "operaciones", "guia-server.ts"), "utf8");
    expect(chat).toMatch(/ordenDeLaConversacion\(preguntasDeLaProxima\(base\)\.preguntas\)/);
    // Y la próxima sesión del servidor pasa por los ajustes de la sesión (de ahí sale `posicion`).
    const servidor = readFileSync(join(__dirname, "guia-ajustes-server.ts"), "utf8");
    expect(servidor).toMatch(/aplicarAjustes\(preguntas, sesion\?\.ajustesDeLaGuia/);
  });
});

// ── 1. Las preguntas para el objetivo ─────────────────────────────────────────

const OBJETIVO = "Entender el volumen de leads de marketing y la tasa de conversión que pidió Marco";
const SUGERIDAS = [
  { id: "pobj1", pregunta: "¿Cuántos leads les llegan al mes de marketing?", repreguntas: ["¿De qué canales?"] },
  { id: "pobj2", pregunta: "¿Qué parte de esos leads termina en una venta?", repreguntas: [], para: "metas" },
  { id: "pobj3", pregunta: "¿Quién decide cuándo un lead pasa a ventas?", repreguntas: [] },
];

describe("al guardar el objetivo, Nexus propone preguntas para ese objetivo", () => {
  it("las propuestas se ven solo para su objetivo", () => {
    const a = aplicar(undefined, { tipo: "sugerir", objetivo: OBJETIVO, preguntas: SUGERIDAS });
    expect(sugeridasVigentes(a, OBJETIVO).map((p) => p.id)).toEqual(["pobj1", "pobj2", "pobj3"]);
    // El mismo objetivo con otros espacios o mayúsculas es el mismo.
    expect(sugeridasVigentes(a, `  ${OBJETIVO.toUpperCase()} `)).toHaveLength(3);
    expect(sugeridasVigentes(a, "Otro objetivo")).toEqual([]);
    expect(sugeridasVigentes(a, null)).toEqual([]);
  });

  it("usada, entra a la guía como pregunta propia marcada «Por el objetivo», con su tema", () => {
    const a = aplicar(undefined, { tipo: "sugerir", objetivo: OBJETIVO, preguntas: SUGERIDAS }, { tipo: "usarSugerida", id: "pobj2" });
    expect(a.propias).toEqual([{ id: "pobj2", pregunta: SUGERIDAS[1].pregunta, repreguntas: [], para: "metas", origen: "objetivo" }]);
    expect(sugeridasVigentes(a, OBJETIVO).map((p) => p.id)).toEqual(["pobj1", "pobj3"]);
    const vista = aplicarAjustes([], a, (para) => (para === "metas" ? { tipo: "tarjeta", para } : undefined)).at(-1)!;
    expect(vista).toMatchObject({ para: "propia:pobj2", tipo: "propia", marca: "objetivo", apunta: { tipo: "tarjeta", para: "metas" } });
    // Borrarla y deshacer la devuelve igual.
    expect(deshacerElBorrado(vista)).toMatchObject({ tipo: "agregar", pregunta: { id: "pobj2", origen: "objetivo" } });
  });

  it("descartada, no vuelve para ese mismo objetivo; con otro objetivo se empieza de cero", () => {
    const a = aplicar(undefined, { tipo: "sugerir", objetivo: OBJETIVO, preguntas: SUGERIDAS }, { tipo: "descartarSugerida", id: "pobj1" });
    expect(a.sugeridas?.descartadas).toEqual([SUGERIDAS[0].pregunta]);
    expect(yaPropuestasParaElObjetivo(a, OBJETIVO)).toEqual([SUGERIDAS[0].pregunta, SUGERIDAS[1].pregunta, SUGERIDAS[2].pregunta]);
    // Pedirlas otra vez para el mismo objetivo: la descartada no entra aunque el agente la repita.
    const otraVez = aplicar(a, { tipo: "sugerir", objetivo: OBJETIVO, preguntas: [{ id: "pobj4", pregunta: "¿cuántos leads les llegan al mes de marketing?", repreguntas: [] }, { id: "pobj5", pregunta: "¿Cuánto tarda ventas en llamar a un lead?", repreguntas: [] }] });
    expect(sugeridasVigentes(otraVez, OBJETIVO).map((p) => p.id)).toEqual(["pobj5"]);
    expect(otraVez.sugeridas?.descartadas).toEqual([SUGERIDAS[0].pregunta]);
    // Otro objetivo: las descartadas de antes ya no cuentan.
    const otro = aplicar(otraVez, { tipo: "sugerir", objetivo: "Revisar el proceso de cobro", preguntas: [SUGERIDAS[0]] });
    expect(otro.sugeridas?.descartadas).toBeUndefined();
    expect(sugeridasVigentes(otro, "Revisar el proceso de cobro")).toHaveLength(1);
  });

  it("descartarlas todas se recuerda (la sesión guarda lo descartado aunque no quede nada esperando)", () => {
    const a = aplicar(
      undefined,
      { tipo: "sugerir", objetivo: OBJETIVO, preguntas: SUGERIDAS },
      { tipo: "descartarSugerida", id: "pobj1" },
      { tipo: "descartarSugerida", id: "pobj2" },
      { tipo: "descartarSugerida", id: "pobj3" },
    );
    expect(hayAjustes(a)).toBe(true);
    expect(sugeridasVigentes(a, OBJETIVO)).toEqual([]);
    expect(a.sugeridas?.descartadas).toHaveLength(3);
  });

  it("respeta el tope de preguntas sumadas y el de propuestas", () => {
    const llenas = aplicar(
      undefined,
      ...Array.from({ length: MAX_PREGUNTAS_PROPIAS }, (_, i): CambioDeLaGuia => ({ tipo: "agregar", pregunta: { id: `pya${i}`, pregunta: `¿Pregunta ${i}?`, repreguntas: [], origen: "tuya" } })),
      { tipo: "sugerir", objetivo: OBJETIVO, preguntas: SUGERIDAS },
    );
    const r = aplicarCambioDeLaGuia(llenas, { tipo: "usarSugerida", id: "pobj1" });
    expect(r.ok).toBe(false);
    const muchas = aplicar(undefined, { tipo: "sugerir", objetivo: OBJETIVO, preguntas: [...SUGERIDAS, { id: "pobj9", pregunta: "¿Una cuarta?", repreguntas: [] }] });
    expect(muchas.sugeridas?.preguntas).toHaveLength(MAX_SUGERIDAS_DEL_OBJETIVO);
    expect(aplicarCambioDeLaGuia(muchas, { tipo: "usarSugerida", id: "nada" }).ok).toBe(false);
  });

  it("el esquema guarda las propuestas y las operaciones nuevas", () => {
    const a = aplicar(undefined, { tipo: "sugerir", objetivo: OBJETIVO, preguntas: SUGERIDAS }, { tipo: "descartarSugerida", id: "pobj3" }, { tipo: "usarSugerida", id: "pobj1" });
    const sesion = SesionPlaneadaSchema.parse({ id: "s-uno", objetivo: OBJETIVO, ajustesDeLaGuia: a });
    expect(sesion.ajustesDeLaGuia).toEqual(a);
    for (const c of [{ tipo: "usarSugerida", id: "pobj1" }, { tipo: "descartarSugerida", id: "pobj1" }, { tipo: "sugerir", objetivo: OBJETIVO, preguntas: SUGERIDAS }]) {
      expect(CambioDeLaGuiaSchema.safeParse(c).success).toBe(true);
    }
    expect(CambioDeLaGuiaSchema.safeParse({ tipo: "usarSugerida", id: "no vale" }).success).toBe(false);
  });
});

function respuestaDelObjetivo(preguntas: unknown): Anthropic.Messages.Message {
  return {
    id: "m",
    type: "message",
    role: "assistant",
    model: "x",
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
    content: [{ type: "tool_use", id: "t", name: HERRAMIENTA_DE_PREGUNTAS_DEL_OBJETIVO, input: { preguntas } }],
  } as unknown as Anthropic.Messages.Message;
}

const ENTRADA_DEL_OBJETIVO: EntradaDelObjetivo = {
  ctx: {
    empresa: "Cemaco Internacional",
    industria: "Retail",
    marco: "cs",
    loQueYaSabemos: ["Seguimiento: «Cuando un deal se enfría, el vendedor lo deja morir» (Reunión del 14 oct)"],
    confirmado: [],
    paraConectar: null,
    instrucciones: "",
  },
  objetivo: OBJETIVO,
  temas: [
    { id: "metas", nombre: "Resultados en cifras" },
    { id: "1.7", nombre: "Seguimiento (Ventas)" },
  ],
  guia: ["¿Para cuándo necesitan tenerlo resuelto?"],
  yaPropuestas: ["¿Cuántos leads les llegan al mes?"],
};

describe("el pedido de las preguntas para el objetivo", () => {
  it("lleva el objetivo, los temas, la guía y lo ya propuesto; en un proyecto le habla al CSE", () => {
    const p = pedidoDePreguntasDelObjetivo(ENTRADA_DEL_OBJETIVO);
    const cuerpo = String((p.messages[0] as { content: string }).content);
    expect(cuerpo).toContain(OBJETIVO);
    expect(cuerpo).toContain("metas · Resultados en cifras");
    expect(cuerpo).toContain("¿Para cuándo necesitan tenerlo resuelto?");
    expect(cuerpo).toContain("YA PROPUESTAS PARA ESTE OBJETIVO");
    expect(String(p.system)).toContain("CSE");
    expect(String(p.system)).toMatch(/tuteo/i);
    expect(p.tool_choice).toEqual({ type: "tool", name: HERRAMIENTA_DE_PREGUNTAS_DEL_OBJETIVO });
    const venta = pedidoDePreguntasDelObjetivo({ ...ENTRADA_DEL_OBJETIVO, ctx: { ...ENTRADA_DEL_OBJETIVO.ctx, marco: "venta" } });
    expect(String(venta.system)).toContain("vendedor");
    expect(String(venta.system)).not.toContain("CSE");
  });

  it("revisa cada una con las reglas de «Regenerar»: tuteo, corta, sin la cita adelante, sin repetir", () => {
    const l = leerPreguntasDelObjetivo(
      respuestaDelObjetivo([
        { pregunta: "¿Cuántos leads les llegan al mes?", repreguntas: [], tema: "metas" }, // ya propuesta
        { pregunta: "¿Qué tasa de conversión querés llegar a tener?", repreguntas: [] }, // voseo
        { pregunta: `¿${"muy ".repeat(35)}larga?`, repreguntas: [] }, // larga
        { pregunta: "Dijiste que el vendedor deja morir los deals. ¿Qué parte de los leads llega a una venta?", repreguntas: ["¿Y el mes pasado?"], tema: "metas" },
        { pregunta: "¿Quién decide cuándo un lead pasa a ventas?", repreguntas: [], tema: "no-existe" },
        { pregunta: "¿Cuánto tarda ventas en llamar a un lead nuevo?", repreguntas: [] },
        { pregunta: "¿Una de más?", repreguntas: [] },
      ]),
      ENTRADA_DEL_OBJETIVO,
    );
    expect(l.preguntas).toEqual([
      { pregunta: "¿Qué parte de los leads llega a una venta?", repreguntas: ["¿Y el mes pasado?"], para: "metas" },
      { pregunta: "¿Quién decide cuándo un lead pasa a ventas?", repreguntas: [] },
      { pregunta: "¿Cuánto tarda ventas en llamar a un lead nuevo?", repreguntas: [] },
    ]);
    expect(l.fallas.map((f) => f.motivo)).toEqual(["igual", "voseo", "larga"]);
  });

  it("descarta la que vuelve a preguntar lo que el cliente ya dijo", () => {
    const l = leerPreguntasDelObjetivo(
      respuestaDelObjetivo([{ pregunta: "¿Qué pasa cuando un deal se queda quieto?", repreguntas: [], tema: "1.7" }]),
      { ...ENTRADA_DEL_OBJETIVO, ctx: { ...ENTRADA_DEL_OBJETIVO.ctx, marco: "venta" } },
      ctxDelPlan.saber,
    );
    expect(l.preguntas).toEqual([]);
    expect(l.fallas[0]?.motivo).toBe("repite");
  });

  it("«Regenerar» sigue leyendo igual con la revisión compartida", () => {
    const entrada: EntradaDeUnaPregunta = {
      ctx: ENTRADA_DEL_OBJETIVO.ctx,
      objetivo: { para: "metas", nombre: "Resultados en cifras", actual: "¿Qué resultado esperan?", repreguntas: [] },
      otras: [],
    };
    const r = (input: unknown) =>
      ({ content: [{ type: "tool_use", id: "t", name: HERRAMIENTA_DE_UNA_PREGUNTA, input }] }) as unknown as Anthropic.Messages.Message;
    expect(leerUnaPregunta(r({ pregunta: "¿Qué cifra tendrían que ver en seis meses?", repreguntas: ["¿Y hoy?"] }), entrada)).toEqual({
      ok: true,
      pregunta: "¿Qué cifra tendrían que ver en seis meses?",
      repreguntas: ["¿Y hoy?"],
    });
    expect(leerUnaPregunta(r({ pregunta: "¿Qué resultado esperan?", repreguntas: [] }), entrada)).toMatchObject({ ok: false, motivo: "igual" });
  });
});

describe("la pantalla pide las preguntas al guardar el objetivo, no con cada tecla (guarda estructural)", () => {
  const antes = readFileSync(join(__dirname, "..", "..", "components", "exploraciones", "AntesDeLaSesion.tsx"), "utf8");
  it("se piden en el guardado del objetivo, solo si cambió, y no al usar el que sugirió el agente", () => {
    expect(antes).toMatch(/if \(proponer && cambio && conPropuestas\) alCambiarElObjetivo\(\)/);
    expect(antes).toMatch(/guardar\(ofrecer, \{ proponer: false \}\)/);
    // El campo del objetivo no pide nada al escribir: solo guarda el texto en el estado.
    expect(antes).toMatch(/onChange=\{\(ev\) => setTexto\(ev\.target\.value\)\}/);
  });
});

// ── 2. El aviso al aplicar la lista del chat ──────────────────────────────────

describe("al aplicar una lista del chat que toca la guía, la exploración abierta se vuelve a leer", () => {
  const lista = [
    { nombre: "tarea.crear", entrada: { clientId: "c1", titulo: "Llamar" } },
    { nombre: "guia.pregunta.quitar", entrada: { clientId: "c1", exploracionId: "exp-cemaco", clave: "propia:p1" } },
    { nombre: "guia.pregunta.agregar", entrada: { clientId: "c1", exploracionId: "exp-otra", pregunta: "¿?" } },
  ];

  it("dice qué exploraciones cambió, sin las desmarcadas", () => {
    expect(exploracionesQueTocaLaLista(lista)).toEqual(["exp-cemaco", "exp-otra"]);
    expect(exploracionesQueTocaLaLista(lista, [2])).toEqual(["exp-cemaco"]);
    expect(exploracionesQueTocaLaLista(lista, [1, 2])).toBeNull();
    expect(exploracionesQueTocaLaLista([{ nombre: "tarea.crear", entrada: {} }])).toBeNull();
    expect(exploracionesQueTocaLaLista(undefined)).toBeNull();
    expect(exploracionesQueTocaLaLista([{ nombre: "guia.pregunta.cambiar", entrada: { clientId: "c1" } }])).toEqual([CUALQUIER_EXPLORACION]);
  });

  it("la exploración abierta se reconoce en el aviso", () => {
    expect(esParaEstaExploracion({ exploraciones: ["exp-cemaco"] }, "exp-cemaco")).toBe(true);
    expect(esParaEstaExploracion({ exploraciones: ["exp-otra"] }, "exp-cemaco")).toBe(false);
    expect(esParaEstaExploracion({ exploraciones: [CUALQUIER_EXPLORACION] }, "exp-cemaco")).toBe(true);
    expect(esParaEstaExploracion(null, "exp-cemaco")).toBe(false);
  });

  it("el cajón avisa al aplicar y el lienzo vuelve a leerse (guarda estructural)", () => {
    const chat = readFileSync(join(__dirname, "..", "..", "components", "nexus-chat", "ChatDeNexus.tsx"), "utf8");
    expect(chat).toMatch(/exploracionesQueTocaLaLista\(acuerdo\.operaciones, de\.desmarcadas\)/);
    expect(chat).toMatch(/avisarQueCambioLaGuia\(guias\)/);
    const lienzo = readFileSync(join(__dirname, "..", "..", "components", "exploraciones", "LienzoDeExploracion.tsx"), "utf8");
    expect(lienzo).toMatch(/addEventListener\(EVENTO_GUIA_CAMBIADA/);
    expect(lienzo).toMatch(/esParaEstaExploracion\(.*, expId\)\) void recargar\(\)/);
  });
});
