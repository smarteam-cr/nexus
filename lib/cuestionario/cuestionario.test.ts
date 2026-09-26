import { describe, expect, it } from "vitest";
import { avanceDePestana, fundirGuardado, leerGuardado } from "./avance";
import { aplicarOperaciones, leerOperaciones, type EstadoDePestana } from "./operaciones";
import { IDS_DE_ETAPA, PREGUNTAS_DE_ETAPA, pestanasDePlantilla, pestanasParaTags } from "./plantilla";
import { leerPreguntas, leerRespuestas } from "./tipos";

const T0 = "2026-09-26T10:00:00.000Z";
const T1 = "2026-09-26T11:00:00.000Z";

function estado(tags: string[] = ["sales_hub"]): EstadoDePestana[] {
  return pestanasParaTags(tags).map((p) => ({ ...p, enviada: false, tieneRespuestas: false }));
}

let n = 0;
const azar = () => `t${++n}`;

describe("plantilla: las pestañas salen de los hubs del proyecto", () => {
  it("sin hubs, solo las generales (en el orden de la tabla)", () => {
    expect(pestanasParaTags([]).map((p) => p.key)).toEqual(["general", "objetivos", "datos"]);
  });

  it("Sales Hub suma Ventas y Proceso comercial; Service Hub, Servicio y Proceso de servicio", () => {
    expect(pestanasParaTags(["sales_hub", "service_hub", "marketing_hub"]).map((p) => p.key)).toEqual([
      "general",
      "objetivos",
      "marketing",
      "ventas",
      "proceso_comercial",
      "servicio",
      "proceso_servicio",
      "datos",
    ]);
  });

  it("los procesos son de tipo «etapas»", () => {
    const tipos = Object.fromEntries(pestanasDePlantilla().map((p) => [p.key, p.tipo]));
    expect(tipos.proceso_comercial).toBe("etapas");
    expect(tipos.proceso_servicio).toBe("etapas");
    expect(tipos.ventas).toBe("normal");
  });

  it("⛔ «Etapa N» son exactamente 7 preguntas fijas (las filas de la definición de procesos)", () => {
    expect(PREGUNTAS_DE_ETAPA).toHaveLength(7);
    expect(IDS_DE_ETAPA.size).toBe(7);
  });

  it("ningún id de pregunta se repite en toda la plantilla (una respuesta se guarda por id)", () => {
    const ids = [...pestanasDePlantilla().flatMap((p) => p.preguntas.map((q) => q.id)), ...IDS_DE_ETAPA];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("copia profunda: editar lo devuelto no toca la plantilla", () => {
    pestanasParaTags([])[0].preguntas[0].texto = "tocada";
    expect(pestanasParaTags([])[0].preguntas[0].texto).not.toBe("tocada");
  });
});

describe("operaciones: la única forma de cambiar la estructura", () => {
  it("agregar, editar, mover y quitar preguntas", () => {
    const r = aplicarOperaciones(
      estado(),
      [
        { op: "agregar_pregunta", pestana: "general", texto: "  ¿Usan   Slack? ", categoria: "Herramientas" },
        { op: "editar_pregunta", pestana: "general", pregunta: "gen-correo", texto: "¿Qué correo usan?", momento: "sesion" },
        { op: "mover_pregunta", pestana: "general", pregunta: "gen-equipos", direccion: "arriba" },
        { op: "quitar_pregunta", pestana: "general", pregunta: "gen-llamadas" },
      ],
      azar,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const g = r.pestanas.find((p) => p.key === "general")!;
    expect(g.preguntas[0].id).toBe("gen-equipos");
    expect(g.preguntas.at(-1)!.texto).toBe("¿Usan Slack?");
    expect(g.preguntas.find((q) => q.id === "gen-correo")).toMatchObject({ texto: "¿Qué correo usan?", momento: "sesion" });
    expect(g.preguntas.some((q) => q.id === "gen-llamadas")).toBe(false);
  });

  it("todas o ninguna: si una falla, el error dice cuál", () => {
    const r = aplicarOperaciones(estado(), [
      { op: "quitar_pregunta", pestana: "general", pregunta: "gen-correo" },
      { op: "quitar_pregunta", pestana: "general", pregunta: "no-existe" },
    ]);
    expect(r).toMatchObject({ ok: false, indice: 1 });
  });

  it("⛔ una pestaña ENVIADA no se toca", () => {
    const s = estado().map((p) => (p.key === "ventas" ? { ...p, enviada: true } : p));
    const r = aplicarOperaciones(s, [{ op: "agregar_pregunta", pestana: "ventas", texto: "¿Algo?" }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Reábrela");
  });

  it("⛔ una pestaña con respuestas no se quita (se perdería lo escrito)", () => {
    const s = estado().map((p) => (p.key === "ventas" ? { ...p, tieneRespuestas: true } : p));
    expect(aplicarOperaciones(s, [{ op: "quitar_pestana", pestana: "ventas" }]).ok).toBe(false);
    expect(aplicarOperaciones(estado(), [{ op: "quitar_pestana", pestana: "ventas" }]).ok).toBe(true);
  });

  it("⛔ no hay operación que alcance las 7 preguntas de etapa", () => {
    const r = aplicarOperaciones(estado(), [
      { op: "quitar_pregunta", pestana: "proceso_comercial", pregunta: "etapa-objetivo" },
    ]);
    expect(r.ok).toBe(false);
  });

  it("sumar una pestaña de la plantilla que el proyecto no tenía; no duplicarla", () => {
    const r = aplicarOperaciones(estado(), [{ op: "agregar_pestana", desdePlantilla: "marketing" }]);
    expect(r.ok && r.pestanas.some((p) => p.key === "marketing")).toBe(true);
    expect(aplicarOperaciones(estado(), [{ op: "agregar_pestana", desdePlantilla: "ventas" }]).ok).toBe(false);
  });

  it("pestaña nueva a mano, con etapas", () => {
    const r = aplicarOperaciones(estado(), [{ op: "agregar_pestana", titulo: "Postventa", tipo: "etapas" }], azar);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pestanas.at(-1)).toMatchObject({ titulo: "Postventa", tipo: "etapas", preguntas: [] });
  });

  it("leerOperaciones rechaza lo que no tiene forma de operación", () => {
    expect(leerOperaciones([{ op: "borrar_todo" }])).toBeNull();
    expect(leerOperaciones([])).toBeNull();
    expect(leerOperaciones([{ op: "quitar_pestana", pestana: "x" }])).toHaveLength(1);
  });

  it("un campo con tipo raro no revienta: se trata como vacío", () => {
    const r = aplicarOperaciones(estado(), [{ op: "agregar_pregunta", pestana: "general", texto: 42 as unknown as string }]);
    expect(r).toMatchObject({ ok: false });
  });
});

describe("avance", () => {
  it("cuenta las preguntas de la pestaña y 7 por cada etapa; «en sesión» cuenta como decidida", () => {
    const [p] = pestanasParaTags(["sales_hub"]).filter((x) => x.key === "proceso_comercial");
    const a = avanceDePestana({
      tipo: p.tipo,
      preguntas: p.preguntas,
      respuestas: {
        "pc-general": { valor: "Así", origen: "cliente", actualizadoAt: T0 },
        "pc-varios": { valor: "", origen: "cliente", enSesion: true, actualizadoAt: T0 },
      },
      etapas: [{ id: "e1", nombre: "Calificación", respuestas: { "etapa-objetivo": { valor: "x", origen: "cliente", actualizadoAt: T0 } } }],
    });
    expect(a).toEqual({ contestadas: 3, total: p.preguntas.length + 7, sinEtapas: false });
  });

  it("una pestaña de etapas sin etapas lo dice", () => {
    const [p] = pestanasParaTags(["sales_hub"]).filter((x) => x.key === "proceso_comercial");
    expect(avanceDePestana({ tipo: "etapas", preguntas: p.preguntas, respuestas: {}, etapas: [] }).sinEtapas).toBe(true);
  });
});

describe("fundir lo que manda el cliente con lo guardado", () => {
  const preguntas = leerPreguntas([
    { id: "a", texto: "A", categoria: "", momento: "previo" },
    { id: "b", texto: "B", categoria: "", momento: "previo" },
  ]);

  it("el origen lo decide el servidor: lo prellenado sin tocar sigue prellenado; lo cambiado es del cliente", () => {
    const previo = {
      tipo: "normal" as const,
      preguntas,
      respuestas: leerRespuestas({
        a: { valor: "12 usuarios", origen: "prellenado", actualizadoAt: T0 },
        b: { valor: "Gmail", origen: "prellenado", actualizadoAt: T0 },
      }),
      etapas: [],
    };
    const entrante = leerGuardado({
      respuestas: {
        a: { valor: "12 usuarios", origen: "cliente", confirmada: true, actualizadoAt: "1999-01-01" },
        b: { valor: "Outlook", origen: "prellenado", actualizadoAt: "1999-01-01" },
      },
      etapas: [],
    })!;
    const r = fundirGuardado(previo, entrante, T1);
    expect(r.respuestas.a).toMatchObject({ origen: "prellenado", confirmada: true, actualizadoAt: T1 });
    expect(r.respuestas.b).toMatchObject({ valor: "Outlook", origen: "cliente", actualizadoAt: T1 });
  });

  it("una respuesta sin cambios conserva su fecha; una vaciada se borra", () => {
    const previo = {
      tipo: "normal" as const,
      preguntas,
      respuestas: leerRespuestas({ a: { valor: "x", origen: "cliente", actualizadoAt: T0 }, b: { valor: "y", origen: "cliente", actualizadoAt: T0 } }),
      etapas: [],
    };
    const r = fundirGuardado(previo, leerGuardado({ respuestas: { a: { valor: "x" }, b: { valor: "  " } }, etapas: [] })!, T1);
    expect(r.respuestas.a.actualizadoAt).toBe(T0);
    expect(r.respuestas.b).toBeUndefined();
  });

  it("la respuesta de una pregunta que el CSE quitó se conserva (no la puede tocar el cliente)", () => {
    const previo = {
      tipo: "normal" as const,
      preguntas,
      respuestas: leerRespuestas({ vieja: { valor: "algo", origen: "cliente", actualizadoAt: T0 } }),
      etapas: [],
    };
    const r = fundirGuardado(previo, leerGuardado({ respuestas: { vieja: { valor: "pisada" } }, etapas: [] })!, T1);
    expect(r.respuestas.vieja.valor).toBe("algo");
  });

  it("las etapas son del cliente: se respeta su lista y solo entran las 7 preguntas fijas", () => {
    const previo = { tipo: "etapas" as const, preguntas, respuestas: {}, etapas: [] };
    const r = fundirGuardado(
      previo,
      leerGuardado({
        respuestas: {},
        etapas: [
          { id: "e2", nombre: "  Demo ", respuestas: { "etapa-objetivo": { valor: "Mostrar" }, inventada: { valor: "no" } } },
          { id: "e1", nombre: "Calificación", respuestas: {} },
        ],
      })!,
      T1,
    );
    expect(r.etapas.map((e) => e.id)).toEqual(["e2", "e1"]);
    expect(r.etapas[0].nombre).toBe("Demo");
    expect(Object.keys(r.etapas[0].respuestas)).toEqual(["etapa-objetivo"]);
  });
});
