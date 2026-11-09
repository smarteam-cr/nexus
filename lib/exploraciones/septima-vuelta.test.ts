/**
 * La séptima vuelta de la preventa (2026-11-08, Elías con Centauro Solutions):
 *   · «el objetivo sugerido realmente pueden ser tres objetivos sugeridos y que el vendedor pueda editar cada uno o poner
 *     uno personalizado, y que no aparezca la guía antes de eso, que la guía se arme luego de seleccionar eso».
 *     La lectura de la sesión anterior deja hasta tres objetivos con enfoques distintos (la misma llamada, sin otra IA); la
 *     Preparación los muestra como tarjetas, más «Escribe el tuyo»; elegir uno arma la guía, y sin objetivo no hay guía.
 *   · La guía, más fácil de leer: sin las casillas de «Lo que hay que averiguar» en la Preparación (siguen en «En vivo»),
 *     el texto un poco más grande y «Para profundizar» plegado.
 */
import fs from "node:fs";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { leerLosResumenes, pedidoDeLosResumenes } from "./agente-pedido";
import { loQueQuedaParaLaProxima, objetivosSugeridosDeLaSiguiente } from "./despues-de-la-sesion";
import { leerPropuesta } from "./esquemas";
import type { LecturaDeReunion } from "./contenido";
import { MAX_OBJETIVOS_SUGERIDOS, objetivosDistintos } from "./objetivo-y-hallazgos";

const RAIZ = path.resolve(__dirname, "..", "..");
const leer = (...partes: string[]) => fs.readFileSync(path.join(RAIZ, ...partes), "utf8").replace(/\r\n/g, "\n");
const EN = "2026-11-08T10:00:00.000Z";

const TRES = [
  "Poner en números cuántos cierres se pierden por el seguimiento que se cae",
  "Entender el proceso comercial de punta a punta, desde que llega el lead hasta el cierre",
  "Saber quién decide la inversión y para cuándo necesitan ver resultados",
];

describe("los objetivos sugeridos: hasta tres, distintos", () => {
  it("sin vacíos ni repetidos (sin mirar mayúsculas ni espacios), en su orden y con su tope", () => {
    expect(MAX_OBJETIVOS_SUGERIDOS).toBe(3);
    expect(objetivosDistintos(["  A  ", "a", null, undefined, "", "B", "C", "D"])).toEqual(["A", "B", "C"]);
    expect(objetivosDistintos([])).toEqual([]);
  });
});

describe("la lectura de la sesión anterior deja tres objetivos posibles (la misma llamada)", () => {
  const reuniones = [{ fuente: "H1", etiqueta: "Reunión del 6 nov: Centauro Solutions" }];
  const fuentes = [{ id: "H1", etiqueta: reuniones[0].etiqueta, texto: "Laura contó que el seguimiento se pierde." }];
  const ctx = { empresa: "Centauro Solutions", fuentes, reuniones };
  const respuesta = (entrada: Record<string, unknown>) =>
    ({ content: [{ type: "tool_use", id: "tu", name: "resumir", input: { reuniones: [{ fuente: "H1", resumen: "Hablaron del seguimiento.", ...entrada }] } }] }) as unknown as Anthropic.Messages.Message;

  it("los pide como lista, cada uno con un enfoque distinto, no tres redacciones de lo mismo", () => {
    const t = JSON.stringify(pedidoDeLosResumenes(ctx).tools);
    expect(t).toContain('"objetivosSiguientes"');
    expect(t).not.toContain('"objetivoSiguiente"');
    expect(t).toMatch(/3 objetivos POSIBLES/);
    expect(t).toMatch(/ENFOQUE DISTINTO/);
    expect(t).toMatch(/No tres redacciones de lo mismo/);
  });

  it("se leen los tres; el primero queda también como el objetivo de siempre (lo leen las pantallas de antes)", () => {
    const [r] = leerLosResumenes(respuesta({ objetivosSiguientes: [...TRES, "Un cuarto que sobra"] }), ctx);
    expect(r.objetivosSiguientes).toEqual(TRES);
    expect(r.objetivoSiguiente).toBe(TRES[0]);
  });

  it("los repetidos se caen; una respuesta con la forma de antes (uno solo) se lee como uno, sin lista", () => {
    const [repetidos] = leerLosResumenes(respuesta({ objetivosSiguientes: [TRES[0], TRES[0].toUpperCase(), 7, TRES[1]] }), ctx);
    expect(repetidos.objetivosSiguientes).toEqual([TRES[0], TRES[1]]);
    const [deAntes] = leerLosResumenes(respuesta({ objetivoSiguiente: TRES[2] }), ctx);
    expect(deAntes.objetivoSiguiente).toBe(TRES[2]);
    expect(deAntes.objetivosSiguientes).toBeUndefined();
  });

  it("se guardan en la lectura, y una lista que no calza no se lleva la lectura entera", () => {
    const base = { etiqueta: "Reunión", resumen: "Resumen", cobertura: [], en: EN, corridaId: "r1", objetivoSiguiente: TRES[0] };
    const buena = leerPropuesta({ lecturas: { "meet:a": { ...base, objetivosSiguientes: TRES } } });
    expect(buena.lecturas["meet:a"]?.objetivosSiguientes).toEqual(TRES);
    const mala = leerPropuesta({ lecturas: { "meet:a": { ...base, objetivosSiguientes: [...TRES, "cuarto"] } } });
    expect(mala.lecturas["meet:a"]?.resumen).toBe("Resumen");
    expect(mala.lecturas["meet:a"]?.objetivoSiguiente).toBe(TRES[0]);
    expect(mala.lecturas["meet:a"]?.objetivosSiguientes).toBeUndefined();
  });

  it("la lectura completa guarda los tres solo de la reunión más reciente", () => {
    expect(leer("lib", "exploraciones", "agente.ts")).toMatch(/esLaUltima && d\.objetivosSiguientes\?\.length \? \{ objetivosSiguientes: d\.objetivosSiguientes \}/);
  });
});

describe("los que ve la Preparación de la siguiente sesión, sin IA", () => {
  const lectura = (o: Partial<LecturaDeReunion> = {}): LecturaDeReunion => ({ etiqueta: "Reunión", resumen: "r", cobertura: [], en: EN, corridaId: "c1", ...o });
  const pendientes = loQueQuedaParaLaProxima({ sesion: null, lectura: lectura({ paraLaProxima: ["Cuántos se enfrían", "Quién aprueba"] }) });

  it("los tres de la lectura, si nadie desmarcó nada", () => {
    expect(objetivosSugeridosDeLaSiguiente({ pendientes, objetivoSiguiente: TRES[0], objetivosSiguientes: TRES })).toEqual(TRES);
  });

  it("una lectura de antes (uno solo) se muestra como una sola tarjeta", () => {
    expect(objetivosSugeridosDeLaSiguiente({ pendientes, objetivoSiguiente: TRES[1] })).toEqual([TRES[1]]);
  });

  it("si se desmarcó algo, uno solo armado con lo que sigue marcado y lo que falta saber", () => {
    const uno = pendientes.map((p, i) => (i === 1 ? { ...p, marcado: false } : p));
    expect(objetivosSugeridosDeLaSiguiente({ pendientes: uno, objetivosSiguientes: TRES, porAveriguar: ["Presupuesto"] })).toEqual([
      "Retomar «Cuántos se enfrían» y averiguar presupuesto.",
    ]);
    expect(objetivosSugeridosDeLaSiguiente({ pendientes: [] })).toEqual([]);
  });
});

describe("la Preparación: tres tarjetas, y la guía recién al elegir (guarda estructural)", () => {
  const fuente = leer("components", "exploraciones", "AntesDeLaSesion.tsx");
  const pantalla = fuente.slice(fuente.indexOf("export default function AntesDeLaSesion("));
  const tarjetas = fuente.slice(fuente.indexOf("function ObjetivosSugeridos("), fuente.indexOf("// ── Lo que traes de las sesiones anteriores"));

  it("las tarjetas: una por objetivo sugerido, cada una con Editar y Elegir, y una cuarta «Escribe el tuyo»", () => {
    expect(tarjetas).toMatch(/sugeridos\.map\(\(o, i\) =>/);
    expect(tarjetas).toContain("Escribe el tuyo");
    expect(tarjetas).toMatch(/onClick=\{\(\) => abrir\(i\)\}/);
    expect(tarjetas).toMatch(/onClick=\{\(\) => void elegir\(o\)\}/);
    expect(fuente).not.toContain("Descartar</BotonTexto>");
  });

  it("los sugeridos salen de la sesión anterior (hasta tres) y, sin ellos, del objetivo de una guía armada antes", () => {
    expect(pantalla).toMatch(/const sugeridos = objetivosDistintos\(\[\.\.\.deLaAnterior, guia\?\.objetivo\]\)/);
  });

  it("elegir guarda el objetivo y, en la próxima sesión, arma la guía en ese momento", () => {
    const elegir = pantalla.slice(pantalla.indexOf("const alElegir = async"), pantalla.indexOf("if (!esLaProxima && !guia)"));
    expect(elegir).toMatch(/if \(!ok \|\| !esLaProxima\) return;\n\s*\/\/[^\n]*\n\s*await alDia\(\);\n\s*await lanzar\("guia"\);/);
  });

  it("sin objetivo elegido no se ve ninguna guía, ni la de antes ni «Armar la guía»", () => {
    expect(pantalla).toMatch(/const actual = esLaProxima && \(guiaDeAntes \|\| !conObjetivo \|\| \(armadaSinObjetivo && armandoLaGuia\)\) \? null : guia;/);
    expect(pantalla).toMatch(/const anterior =\n\s*esLaProxima && conObjetivo \?/);
    expect(pantalla).toMatch(/\{esLaProxima && conObjetivo && <EstadoDeLaGuia pestana=\{pestana\} armandoAlElegir=\{eligiendo\} \/>\}/);
    // Lo que sí se ve antes de elegir: el objetivo de la exploración, las preguntas de Nexus y «Lo que ya sabemos».
    expect(pantalla).toMatch(/\{esLaProxima && <SirveAlObjetivoDeLaExploracion \/>\}/);
    expect(pantalla).toMatch(/\{esLaProxima && <LoQueYaSabemos pestana=\{pestana\} \/>\}/);
    expect(pantalla).not.toMatch(/esLaProxima && conObjetivo && paraLaGuia\.length/);
  });

  it("una guía que no guardó su objetivo (6 al 8 nov) cuenta como armada con el de la sesión: sin aviso", () => {
    expect(fuente).not.toContain("Esta guía se armó antes de elegir el objetivo");
    expect(fuente).not.toMatch(/else if \(!guia\.objetivoAceptado\)/);
  });

  it("mientras se arma la guía, «Armar la guía» no se muestra (tampoco mientras se guarda la tarjeta elegida)", () => {
    const estado = fuente.slice(fuente.indexOf("function EstadoDeLaGuia("), fuente.indexOf("/** Lo que hace Nexus mientras corre"));
    expect(estado).toMatch(/const armando = \(corriendo && corrida\?\.modo === "guia"\) \|\| lanzando \|\| armandoAlElegir;/);
    expect(estado).toMatch(/\{puedeEditar &&\n\s*!armando &&/);
    expect(pantalla).toMatch(/<EstadoDeLaGuia pestana=\{pestana\} armandoAlElegir=\{eligiendo\} \/>/);
  });

  it("«Después de la sesión» dice cuántos objetivos sugiere para la siguiente, no uno", () => {
    const despues = leer("components", "exploraciones", "DespuesDeLaSesion.tsx");
    expect(despues).toMatch(/objetivosSugeridosDeLaSiguiente\(\{/);
    expect(despues).toMatch(/objetivos para la sesión \$\{numeroSiguiente\}: elige uno en su Preparación\./);
    expect(despues).not.toContain("arranca con:");
  });
});

describe("la guía, más fácil de leer (guarda estructural)", () => {
  const agenda = leer("components", "exploraciones", "AgendaDeLaGuia.tsx");

  it("las casillas de lo que hay que averiguar y su conteo solo en «En vivo»", () => {
    expect(agenda).toMatch(/const conCasillas = momento === "durante";/);
    expect(agenda).toMatch(/\{conCasillas && b\.averiguar\.length > 0 && \(/);
    expect(agenda).toMatch(/conCasillas \? ` · \$\{sabidas\} de \$\{total\} averiguadas` : ""/);
  });

  it("«Para profundizar» se pliega: cerrado en la Preparación, abierto en «En vivo»", () => {
    expect(agenda).toMatch(/<details\s+open=\{momento === "durante"\}/);
    expect(agenda).toMatch(/<summary[^>]*>[\s\S]*?Para profundizar/);
  });

  it("la pregunta, la explicación y los títulos, más grandes que antes", () => {
    expect(agenda).toMatch(/<h4 className="text-base font-semibold/);
    expect(agenda).toMatch(/text-\[15\.5px\] italic/);
    expect(agenda).not.toMatch(/text-\[14px\] italic/);
  });
});
