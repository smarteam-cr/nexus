/**
 * lib/exploraciones/ajustes-de-la-guia.test.ts — lo que el vendedor decide sobre la guía de una sesión (validaciones 69,
 * 71 y 73) y lo que cubre la guía, con la preventa de Larce como caso.
 * Correr: `npx vitest run lib/exploraciones/ajustes-de-la-guia.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import { GUIA_VIEJA_DE_LARCE, LARCE_AL_ARMAR_LA_GUIA, POSICIONES_DE_LARCE, TESTS_DE_LARCE } from "./__fixtures__/preventa-larce";
import { ESCALA_DE_PRUEBA } from "./escala-de-prueba.test-helpers";
import { focoDeLaGuia, preguntasParaMostrar, type GuiaDeLaSesion, type PreguntaParaMostrar } from "./guia";
import { contextoDelPlan } from "./plan-de-la-guia";
import {
  aplicarAjustes,
  aplicarCambioDeLaGuia,
  claveDePregunta,
  hayAjustes,
  MAX_PREGUNTAS_PROPIAS,
  sinCitaAdelante,
  type AjustesDeLaGuia,
} from "./ajustes-de-la-guia";
import { queCubreLaGuia } from "./que-cubre-la-guia";

const SIN_PROCEDENCIAS = { abiertos: new Map<string, number>(), pasaron: new Map<string, number>() };

function preguntasDeLarce(guia: GuiaDeLaSesion | null = GUIA_VIEJA_DE_LARCE): PreguntaParaMostrar[] {
  const ctx = contextoDelPlan({ estado: LARCE_AL_ARMAR_LA_GUIA, tests: TESTS_DE_LARCE, escala: ESCALA_DE_PRUEBA, posiciones: POSICIONES_DE_LARCE, sesionId: null });
  const foco = focoDeLaGuia(LARCE_AL_ARMAR_LA_GUIA.contenido.casillas, ESCALA_DE_PRUEBA, ["1"], POSICIONES_DE_LARCE, {}, undefined, ctx);
  return preguntasParaMostrar(guia, foco.huecos, foco.enfoque, ESCALA_DE_PRUEBA, SIN_PROCEDENCIAS, undefined, { plan: foco.plan!, saber: ctx.saber });
}

const apuntaA = (para: string): PreguntaParaMostrar["apunta"] =>
  para.startsWith("1.") ? { tipo: "dimension", para } : ["metas", "presupuesto", "tiempos", "autoridad"].includes(para) ? { tipo: "tarjeta", para } : undefined;

function aplicar(a: AjustesDeLaGuia | undefined, ...cambios: Parameters<typeof aplicarCambioDeLaGuia>[1][]): AjustesDeLaGuia {
  let actual = a;
  for (const c of cambios) {
    const r = aplicarCambioDeLaGuia(actual, c);
    if (!r.ok) throw new Error(r.error);
    actual = r.ajustes;
  }
  return actual ?? {};
}

describe("sin la cita adelante (validación 69)", () => {
  it("saca la cita y su «En el diagnóstico dijeron…» de una pregunta guardada", () => {
    expect(sinCitaAdelante("En el diagnóstico dijeron: «Cuando un deal se enfría, nadie reacciona». ¿Cuánto les ha costado eso este año?")).toBe(
      "¿Cuánto les ha costado eso este año?",
    );
    expect(sinCitaAdelante("Dijiste que los deals que se enfrían mueren sin que nadie reaccione. ¿Cuántos se les fueron así este año?")).toBe(
      "¿Cuántos se les fueron así este año?",
    );
    expect(sinCitaAdelante("En la reunión dijeron: «Usamos Excel». ¿Cómo te gustaría que funcione?")).toBe("¿Cómo te gustaría que funcione?");
  });

  it("deja como está lo que no repite lo dicho", () => {
    expect(sinCitaAdelante("¿Cuántas horas a la semana se van en juntar los números?")).toBe("¿Cuántas horas a la semana se van en juntar los números?");
    expect(sinCitaAdelante("Si tuvieras una sola cosa resuelta, ¿cuál sería?")).toBe("Si tuvieras una sola cosa resuelta, ¿cuál sería?");
  });

  it("la guía vieja de Larce se muestra sin citas adelante", () => {
    for (const p of preguntasDeLarce()) expect(p.pregunta.startsWith("¿") || !p.pregunta.includes("«")).toBe(true);
  });
});

describe("los ajustes de la guía de una sesión", () => {
  const preguntas = preguntasDeLarce();
  const primera = preguntas[0];

  it("una pregunta cambiada reemplaza a la de la guía, con su marca, y se puede devolver", () => {
    const a = aplicar(undefined, { tipo: "cambiar", clave: claveDePregunta(primera), pregunta: "¿Cuántos negocios se les fueron este año?", origen: "asistente" });
    const vistas = aplicarAjustes(preguntas, a, apuntaA);
    expect(vistas[0]).toMatchObject({ para: primera.para, pregunta: "¿Cuántos negocios se les fueron este año?", marca: "asistente", cambiada: true });
    expect(vistas[0].repreguntas).toEqual(primera.repreguntas);
    const devuelta = aplicar(a, { tipo: "restaurar", clave: claveDePregunta(primera) });
    expect(hayAjustes(devuelta)).toBe(false);
    expect(aplicarAjustes(preguntas, devuelta, apuntaA)[0].pregunta).toBe(primera.pregunta);
  });

  it("cambiar solo las repreguntas conserva la pregunta", () => {
    const a = aplicar(undefined, { tipo: "cambiar", clave: claveDePregunta(primera), repreguntas: ["¿Y en plata?"], origen: "tuya" });
    expect(aplicarAjustes(preguntas, a, apuntaA)[0]).toMatchObject({ pregunta: primera.pregunta, repreguntas: ["¿Y en plata?"] });
  });

  it("una quitada no se ve; las propias van al final, marcadas «tuya» o «asistente», con su tema", () => {
    const a = aplicar(
      undefined,
      { tipo: "quitar", clave: claveDePregunta(primera) },
      { tipo: "agregar", pregunta: { id: "p1", pregunta: "¿Con qué presupuesto cuentan este año?", repreguntas: [], para: "presupuesto", origen: "tuya" } },
      { tipo: "agregar", pregunta: { id: "p2", pregunta: "¿Qué sistema usan para facturar?", repreguntas: [], origen: "asistente" } },
    );
    const vistas = aplicarAjustes(preguntas, a, apuntaA);
    expect(vistas.some((p) => claveDePregunta(p) === claveDePregunta(primera))).toBe(false);
    expect(vistas.slice(-2)).toMatchObject([
      { para: "propia:p1", tipo: "propia", marca: "tuya", apunta: { tipo: "tarjeta", para: "presupuesto" } },
      { para: "propia:p2", tipo: "propia", marca: "asistente" },
    ]);
    expect(vistas[vistas.length - 1].apunta).toBeUndefined();
  });

  it("sobreviven a otra guía: se aplican sobre las preguntas nuevas", () => {
    const a = aplicar(undefined, { tipo: "agregar", pregunta: { id: "p1", pregunta: "¿Cuál es su meta del año?", repreguntas: [], origen: "tuya" } });
    const conOtraGuia = aplicarAjustes(preguntasDeLarce(null), a, apuntaA);
    expect(conOtraGuia[conOtraGuia.length - 1].pregunta).toBe("¿Cuál es su meta del año?");
  });

  it("una propia se edita (y cambia de tema) y se quita", () => {
    const a = aplicar(
      undefined,
      { tipo: "agregar", pregunta: { id: "p1", pregunta: "¿Uno?", repreguntas: [], origen: "tuya" } },
      { tipo: "cambiar", clave: "propia:p1", pregunta: "¿Para cuándo lo necesitan?", para: "tiempos", origen: "tuya" },
    );
    expect(a.propias?.[0]).toMatchObject({ pregunta: "¿Para cuándo lo necesitan?", para: "tiempos" });
    expect(aplicar(a, { tipo: "quitar", clave: "propia:p1" }).propias).toBeUndefined();
  });

  it("los topes y lo que no existe", () => {
    let a: AjustesDeLaGuia = {};
    for (let i = 0; i < MAX_PREGUNTAS_PROPIAS; i++) a = aplicar(a, { tipo: "agregar", pregunta: { id: `p${i}`, pregunta: `¿${i}?`, repreguntas: [], origen: "tuya" } });
    expect(aplicarCambioDeLaGuia(a, { tipo: "agregar", pregunta: { id: "px", pregunta: "¿Otra?", repreguntas: [], origen: "tuya" } }).ok).toBe(false);
    expect(aplicarCambioDeLaGuia({}, { tipo: "quitar", clave: "propia:nada" }).ok).toBe(false);
    expect(aplicarCambioDeLaGuia({}, { tipo: "cambiar", clave: "metas:impacto", pregunta: "   ", origen: "tuya" }).ok).toBe(false);
    expect(aplicarCambioDeLaGuia({}, { tipo: "agregar", pregunta: { id: "p", pregunta: "  ", repreguntas: [], origen: "tuya" } }).ok).toBe(false);
  });
});

describe("lo que cubre la guía (validación 73)", () => {
  const puntos = [
    { id: "frena", corto: "Qué frena al equipo", titulo: "", cumplido: false },
    { id: "meta", corto: "Meta en cifras", titulo: "", cumplido: false },
    { id: "presupuesto", corto: "Presupuesto", titulo: "", cumplido: false },
    { id: "consecuencia", corto: "Qué pasa si no actúa", titulo: "", cumplido: false },
    { id: "tiempos", corto: "Para cuándo", titulo: "", cumplido: true },
  ];
  const cubre = (preguntas: PreguntaParaMostrar[]) =>
    queCubreLaGuia({ preguntas, puntos, escala: ESCALA_DE_PRUEBA, posiciones: POSICIONES_DE_LARCE, marco: "venta" });
  const estadoDe = (r: ReturnType<typeof cubre>, id: string) => r.puntos.find((p) => p.id === id)?.estado;

  it("con Larce: cubre qué frena (hay dimensiones) y qué pasa si no actúa (hay un dolor en impacto); lo listo es listo", () => {
    const r = cubre(preguntasDeLarce());
    expect(estadoDe(r, "frena")).toBe("cubre");
    expect(estadoDe(r, "consecuencia")).toBe("cubre");
    expect(estadoDe(r, "tiempos")).toBe("listo");
    expect(r.dimensiones[0]).toMatchObject({ id: "1.7" });
  });

  it("cambia al instante con los ajustes: una propia de presupuesto lo cubre, quitar la de la meta la deja de cubrir", () => {
    const preguntas = preguntasDeLarce();
    const meta = preguntas.find((p) => p.para === "metas");
    const a = aplicar(
      undefined,
      { tipo: "agregar", pregunta: { id: "p1", pregunta: "¿Con qué presupuesto cuentan?", repreguntas: [], para: "presupuesto", origen: "tuya" } },
      ...(meta ? [{ tipo: "quitar" as const, clave: claveDePregunta(meta) }] : []),
    );
    const r = cubre(aplicarAjustes(preguntas, a, apuntaA));
    expect(estadoDe(r, "presupuesto")).toBe("cubre");
    if (meta) expect(estadoDe(r, "meta")).toBe("falta");
  });

  it("en un proyecto, una tarjeta se cubre si la guía la pregunta", () => {
    const r = queCubreLaGuia({
      preguntas: [{ para: "retos", tipo: "tarjeta" }],
      puntos: [
        { id: "retos", corto: "Retos", titulo: "", cumplido: false },
        { id: "obstaculos", corto: "Obstáculos", titulo: "", cumplido: false },
      ],
      escala: ESCALA_DE_PRUEBA,
      posiciones: {},
      marco: "cs",
    });
    expect(r.puntos.map((p) => p.estado)).toEqual(["cubre", "falta"]);
    expect(r).toMatchObject({ faltan: 2, cubre: 1 });
  });
});

describe("los ajustes en lo guardado", () => {
  it("se leen con la sesión, y unos ajustes rotos no se llevan la sesión", async () => {
    const { leerContenido } = await import("./esquemas");
    const buenos = leerContenido({ sesiones: [{ id: "s-uno", objetivo: "Llegar a números", ajustesDeLaGuia: { quitadas: ["metas:impacto"] } }] });
    expect(buenos.sesiones[0]).toMatchObject({ id: "s-uno", ajustesDeLaGuia: { quitadas: ["metas:impacto"] } });
    const rotos = leerContenido({ sesiones: [{ id: "s-dos", objetivo: "Llegar a números", ajustesDeLaGuia: { propias: [{ id: "x", pregunta: "" }] } }] });
    expect(rotos.sesiones[0]).toMatchObject({ id: "s-dos", objetivo: "Llegar a números" });
    expect(rotos.sesiones[0].ajustesDeLaGuia).toBeUndefined();
  });

  it("la operación crea la sesión si la próxima todavía no lo es, y no guarda ajustes vacíos", async () => {
    const { aplicarOperaciones, VALIDADOR_LIBRE } = await import("./contenido");
    const { estadoDePrueba } = await import("./escala-de-prueba.test-helpers");
    const validez = { dimensiones: new Set<string>(), criterios: new Set<string>(), areas: new Set<string>(), ediciones: new Set<string>(), perfilesHabituales: {}, escalaVersion: "1" };
    const r = aplicarOperaciones(estadoDePrueba(), [{ op: "ajustarGuia", sesionId: "s-nueva", cambio: { tipo: "quitar", clave: "metas:impacto" } }], validez as never, VALIDADOR_LIBRE);
    expect(r.ok && r.estado.contenido.sesiones).toEqual([{ id: "s-nueva", ajustesDeLaGuia: { quitadas: ["metas:impacto"] } }]);
    if (!r.ok) return;
    const r2 = aplicarOperaciones(r.estado, [{ op: "ajustarGuia", sesionId: "s-nueva", cambio: { tipo: "restaurar", clave: "metas:impacto" } }], validez as never, VALIDADOR_LIBRE);
    expect(r2.ok && r2.estado.contenido.sesiones).toEqual([{ id: "s-nueva" }]);
  });
});
