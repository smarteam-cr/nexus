/**
 * La sexta vuelta de la preventa (2026-11-08, Elías con Centauro Solutions): en una sesión 3 nueva vio dos preguntas de
 * Nexus sin tarjetas, que eran de una sesión 3 anterior ya borrada, y no podía responderlas porque decía «Rehaciendo la
 * guía con tus respuestas…» sin haber respondido nada.
 *   · Las preguntas son de la sesión cuya guía las dejó, y solo se muestran ahí. Las de antes (sin sesión) no.
 *   · Toda pregunta trae respuestas probables (se piden 3); una sin ellas no se guarda ni se muestra.
 *   · Una sesión sin guía pregunta lo que dejó la lectura de la anterior, la misma llamada que sugiere su objetivo.
 *   · Mientras corre algo, el texto dice qué corre: «con tus respuestas» solo si lo lanzaron ellas.
 */
import fs from "node:fs";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { propuestaVacia } from "./contenido";
import { leerPropuesta } from "./esquemas";
import {
  conLoDeLaExploracion,
  leerPreguntasConOpciones,
  preguntasConOpciones,
  preguntasDeLaSesion,
  vieneDeLasRespuestas,
  type PreguntasParaLaGuia,
} from "./objetivo-y-hallazgos";
import { leerLosResumenes, pedidoDeLosResumenes } from "./agente-pedido";

const RAIZ = path.resolve(__dirname, "..", "..");
const EN = "2026-11-08T10:00:00.000Z";
const TRES = ["Sí, ya lo sabe", "No, espera una grupal", "Todavía no lo sé"];

describe("las preguntas de Nexus son de la sesión cuya guía las dejó", () => {
  const pedido = (cambios: Partial<PreguntasParaLaGuia> = {}): PreguntasParaLaGuia => ({
    preguntas: ["¿Laura sabe que la sesión es con ella?"],
    opciones: [TRES],
    sesionId: "s-nueva",
    en: EN,
    corridaId: "r1",
    ...cambios,
  });

  it("se muestran en su sesión, con sus tarjetas", () => {
    expect(preguntasDeLaSesion({ pedido: pedido(), sesionId: "s-nueva", conGuiaPropia: true })).toEqual([
      { pregunta: "¿Laura sabe que la sesión es con ella?", opciones: TRES },
    ]);
  });

  it("una sesión nueva no hereda las de otra (la sesión 3 borrada de Centauro)", () => {
    expect(preguntasDeLaSesion({ pedido: pedido({ sesionId: "s-borrada" }), sesionId: "s-nueva", conGuiaPropia: false })).toEqual([]);
  });

  it("las guardadas antes de esta vuelta (sin sesión o sin opciones) no se muestran, aunque se sigan leyendo", () => {
    const viejas = leerPropuesta({ preguntasParaLaGuia: { preguntas: ["¿Laura sabe que la sesión es con ella?", "¿Quién más asiste?"], en: EN, corridaId: "r0" } });
    expect(viejas.preguntasParaLaGuia?.preguntas).toHaveLength(2);
    expect(preguntasDeLaSesion({ pedido: viejas.preguntasParaLaGuia, sesionId: "s-nueva", conGuiaPropia: true })).toEqual([]);
    expect(preguntasDeLaSesion({ pedido: pedido({ opciones: undefined }), sesionId: "s-nueva", conGuiaPropia: true })).toEqual([]);
  });

  it("no se muestra una ya respondida, ni nada sin una sesión", () => {
    expect(preguntasDeLaSesion({ pedido: pedido(), sesionId: "s-nueva", conGuiaPropia: true, respondidas: [{ pregunta: " ¿laura sabe que la sesión es con ELLA? " }] })).toEqual([]);
    expect(preguntasDeLaSesion({ pedido: pedido(), sesionId: null, conGuiaPropia: true })).toEqual([]);
  });

  it("sin guía propia, pregunta lo que dejó la lectura de la sesión anterior; con guía propia, manda la guía", () => {
    const deLaLecturaAnterior = [{ pregunta: "¿Con quién es la siguiente sesión?", opciones: ["Con Laura sola", "Con el equipo de ventas", "Todavía no lo sé"] }];
    expect(preguntasDeLaSesion({ pedido: null, sesionId: "s-nueva", conGuiaPropia: false, deLaLecturaAnterior })).toEqual(deLaLecturaAnterior);
    expect(preguntasDeLaSesion({ pedido: null, sesionId: "s-nueva", conGuiaPropia: true, deLaLecturaAnterior })).toEqual([]);
    // Las de la guía de la sesión ganan a las de la lectura.
    expect(preguntasDeLaSesion({ pedido: pedido(), sesionId: "s-nueva", conGuiaPropia: false, deLaLecturaAnterior }).map((x) => x.pregunta)).toEqual([
      "¿Laura sabe que la sesión es con ella?",
    ]);
  });
});

describe("toda pregunta trae respuestas probables", () => {
  it("se juntan con su pregunta; una con menos de 2 se cae, y van hasta 3", () => {
    expect(preguntasConOpciones(["A?", "B?", "C?"], [["a1", "a2", "a3", "a4"], ["b1"], [" ", "c1", "c2"]])).toEqual([
      { pregunta: "A?", opciones: ["a1", "a2", "a3"] },
      { pregunta: "C?", opciones: ["c1", "c2"] },
    ]);
  });

  it("lo que deja la guía se guarda con su sesión, sin las que no traen tarjetas ni las respondidas mientras se armaba", () => {
    const o = { confirmado: null, en: EN, corridaId: "r1", sesionId: "s-nueva", respondidas: [{ pregunta: "¿Ya respondida?" }] };
    const r = conLoDeLaExploracion(
      propuestaVacia(),
      { hallazgos: [], ajuste: null, preguntas: ["¿Sin tarjetas?", "¿Ya respondida?", "¿Con tarjetas?"], opciones: [[], TRES, TRES] },
      o,
    );
    expect(r.preguntasParaLaGuia).toEqual({ preguntas: ["¿Con tarjetas?"], opciones: [TRES], sesionId: "s-nueva", en: EN, corridaId: "r1" });
    // Sin una sesión a la que pertenezcan, no se guardan.
    expect(conLoDeLaExploracion(propuestaVacia(), { hallazgos: [], ajuste: null, preguntas: ["¿Con tarjetas?"], opciones: [TRES] }, { ...o, sesionId: null }).preguntasParaLaGuia).toBeNull();
  });

  it("se leen de cualquier forma que devuelva la IA, sin repetidas", () => {
    expect(
      leerPreguntasConOpciones([
        { pregunta: "  ¿Quién decide?  ", opciones: ["Laura", "laura", "El gerente", 7] },
        { pregunta: "¿quién decide?", opciones: TRES },
        "¿Suelta?",
        null,
        { pregunta: "¿Sin opciones?" },
      ]),
    ).toEqual([{ pregunta: "¿Quién decide?", opciones: ["Laura", "El gerente"] }]);
    expect(leerPreguntasConOpciones(undefined)).toEqual([]);
  });
});

describe("la lectura de la sesión deja las preguntas para la siguiente (sin otra llamada a la IA)", () => {
  const reuniones = [{ fuente: "H1", etiqueta: "Reunión del 6 nov: Centauro Solutions" }];
  const fuentes = [{ id: "H1", etiqueta: reuniones[0].etiqueta, texto: "Laura contó que el CRM está desordenado." }];
  const ctx = { empresa: "Centauro Solutions", fuentes, reuniones };

  it("la misma llamada que sugiere el objetivo las pide, con sus 3 respuestas probables", () => {
    const t = JSON.stringify(pedidoDeLosResumenes(ctx).tools);
    expect(t).toContain("preguntasParaLaSiguiente");
    expect(t).toMatch(/SIEMPRE exactamente 3 respuestas probables/);
  });

  it("se leen con sus tarjetas; las que no traen respuestas se caen", () => {
    const r = {
      content: [
        {
          type: "tool_use",
          id: "tu",
          name: "resumir",
          input: {
            reuniones: [
              {
                fuente: "H1",
                resumen: "Laura contó que el CRM está desordenado.",
                preguntasParaLaSiguiente: [
                  { pregunta: "¿Con quién es la siguiente sesión?", opciones: ["Con Laura sola", "Con el equipo de ventas", "Todavía no lo sé"] },
                  { pregunta: "¿Sin tarjetas?", opciones: [] },
                ],
              },
            ],
          },
        },
      ],
    } as unknown as Anthropic.Messages.Message;
    expect(leerLosResumenes(r, ctx)[0].preguntasParaLaSiguiente).toEqual([
      { pregunta: "¿Con quién es la siguiente sesión?", opciones: ["Con Laura sola", "Con el equipo de ventas", "Todavía no lo sé"] },
    ]);
  });

  it("se guardan en la lectura, y una lista que no calza no se lleva la lectura entera", () => {
    const base = { etiqueta: "Reunión", resumen: "Resumen", cobertura: [], en: EN, corridaId: "r1" };
    const buena = leerPropuesta({ lecturas: { "meet:a": { ...base, preguntasParaLaSiguiente: [{ pregunta: "¿Quién va?", opciones: TRES }] } } });
    expect(buena.lecturas["meet:a"]?.preguntasParaLaSiguiente).toEqual([{ pregunta: "¿Quién va?", opciones: TRES }]);
    const mala = leerPropuesta({ lecturas: { "meet:a": { ...base, preguntasParaLaSiguiente: "no es una lista" } } });
    expect(mala.lecturas["meet:a"]?.resumen).toBe("Resumen");
    expect(mala.lecturas["meet:a"]?.preguntasParaLaSiguiente).toBeUndefined();
  });
});

describe("mientras corre algo, el texto dice lo que de verdad pasa", () => {
  it("la guía viene de las respuestas solo si arrancó poco después de la última", () => {
    const respuestas = [{ en: "2026-11-08T10:00:00.000Z" }, { en: "2026-11-08T12:00:00.000Z" }];
    expect(vieneDeLasRespuestas("2026-11-08T12:00:03.000Z", respuestas)).toBe(true);
    // La guía que se armó al aceptar el objetivo, sin respuestas recientes.
    expect(vieneDeLasRespuestas("2026-11-08T13:00:00.000Z", respuestas)).toBe(false);
    expect(vieneDeLasRespuestas("2026-11-08T13:00:00.000Z", [])).toBe(false);
    expect(vieneDeLasRespuestas(null, respuestas)).toBe(false);
  });

  it("las tarjetas no se apagan por una corrida, y el texto sale de lo que corre", () => {
    const fuente = fs.readFileSync(path.join(RAIZ, "components", "exploraciones", "AntesDeLaSesion.tsx"), "utf8");
    const preguntas = fuente.slice(fuente.indexOf("function PreguntasDeNexus("), fuente.indexOf("function SirveAlObjetivoDeLaExploracion("));
    expect(preguntas).toMatch(/const bloqueado = !puedeEditar \|\| guardando \|\| enviando;/);
    expect(preguntas).not.toMatch(/disabled=\{[^}]*corriendo/);
    expect(preguntas).toMatch(/vieneDeLasRespuestas\(/);
    expect(preguntas).toMatch(/QUE_HACE_NEXUS\[/);
    // «Rehaciendo la guía con tus respuestas…» aparece una sola vez, y solo cuando son las suyas.
    expect(preguntas.split("Rehaciendo la guía con tus respuestas…").length - 1).toBe(1);
    expect(preguntas).toMatch(/lasMias\s*\?\s*"Rehaciendo la guía con tus respuestas…"/);
  });

  it("«Para el demo»: la Preparación muestra las preguntas del demo con quién preguntó, y dice que no se responden en vivo", () => {
    const fuente = fs.readFileSync(path.join(RAIZ, "components", "exploraciones", "AntesDeLaSesion.tsx"), "utf8");
    const bloque = fuente.slice(fuente.indexOf("function ParaElDemo("), fuente.indexOf("// ── Lo que ya sabemos"));
    expect(bloque).toContain("Para el demo");
    expect(bloque).toMatch(/no se responde en vivo/);
    expect(bloque).toMatch(/lo preguntó \{p\.quien\}/);
    expect(fuente).toMatch(/\{esLaProxima && <ParaElDemo \/>\}/);
    // Llegan por donde llega lo demás que cuesta una consulta (al abrir y al recargar), sin IA.
    const pantalla = fs.readFileSync(path.join(RAIZ, "lib", "exploraciones", "pantalla.ts"), "utf8");
    expect(pantalla).toMatch(/preguntasDelDemoParaLaPreparacion\(fila\.client\.id\)/);
  });

  it("la pantalla toma las preguntas de la sesión, no las de toda la exploración", () => {
    const fuente = fs.readFileSync(path.join(RAIZ, "components", "exploraciones", "AntesDeLaSesion.tsx"), "utf8");
    expect(fuente.split("propuesta.preguntasParaLaGuia").length - 1).toBe(1);
    expect(fuente).toMatch(/pedido: exp\.estado\.propuesta\.preguntasParaLaGuia,/);
  });
});
