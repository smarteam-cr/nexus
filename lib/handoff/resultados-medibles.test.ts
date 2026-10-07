import { describe, expect, it } from "vitest";
import {
  editarResultado,
  fusionarResultados,
  leerRespuestaDeResultados,
  leerResultadosDelHandoff,
  porValidar,
  resultadosParaLaFicha,
  resultadosParaPrompt,
  sinDato,
  type ResultadoMedible,
} from "./resultados-medibles";

const r = (id: string, resultado: string, extra: Partial<ResultadoMedible> = {}): ResultadoMedible => ({
  id,
  resultado,
  metrica: "",
  lineaBase: "",
  meta: "",
  plazo: "",
  ...extra,
});
const leido = (resultado: string, extra: Partial<Omit<ResultadoMedible, "id">> = {}) => ({
  resultado,
  metrica: "",
  lineaBase: "",
  meta: "",
  plazo: "",
  ...extra,
});

describe("resultados medibles del handoff: se capturan una sola vez", () => {
  it("sin línea base, el objetivo queda «Por validar»", () => {
    expect(porValidar({ lineaBase: "" })).toBe(true);
    expect(porValidar({ lineaBase: "⚠️ Por validar" })).toBe(true);
    expect(porValidar({ lineaBase: "por definir" })).toBe(true);
    expect(porValidar({ lineaBase: "12% de conversión (sep. 2026)" })).toBe(false);
    expect(sinDato("—")).toBe(true);
  });

  it("los primeros que se leen toman R1, R2…", () => {
    const lista = fusionarResultados([], [leido("Conocer la conversión"), leido("Bajar el tiempo de respuesta")]);
    expect(lista.map((x) => x.id)).toEqual(["R1", "R2"]);
  });

  it("releer el handoff conserva el R de lo que sigue estando (los objetivos lo citan)", () => {
    const previos = [r("R1", "Conocer la conversión"), r("R2", "Bajar el tiempo de respuesta")];
    const lista = fusionarResultados(previos, [leido("Bajar el tiempo de respuesta"), leido("Conocer la conversión"), leido("Medir la pauta")]);
    expect(lista.map((x) => `${x.id} ${x.resultado}`)).toEqual([
      "R2 Bajar el tiempo de respuesta",
      "R1 Conocer la conversión",
      "R3 Medir la pauta",
    ]);
  });

  it("el mismo resultado redactado casi igual conserva su R; uno distinto en el mismo lugar, no", () => {
    const previos = [r("R1", "Conocer la tasa de conversión de lead a matrícula", { lineaBase: "8%", editadoAt: "2026-10-02T10:00:00.000Z" })];
    const parecido = fusionarResultados(previos, [leido("Conocer la tasa de conversión de lead a matrícula por proyecto")]);
    expect(parecido[0]).toMatchObject({ id: "R1", lineaBase: "8%" });
    const distinto = fusionarResultados([r("R1", "Conocer la conversión")], [leido("Bajar el tiempo de respuesta de la mesa de ayuda")]);
    expect(distinto.map((x) => x.id)).toEqual(["R2"]);
  });

  it("lo que completó una persona manda sobre lo que trae el handoff", () => {
    const previos = [r("R1", "Conocer la conversión", { lineaBase: "8%", meta: "15%", editadoAt: "2026-10-02T10:00:00.000Z" })];
    const lista = fusionarResultados(previos, [leido("Conocer la conversión", { lineaBase: "", meta: "20%", plazo: "diciembre" })]);
    expect(lista[0]).toMatchObject({ id: "R1", lineaBase: "8%", meta: "15%", plazo: "diciembre", editadoAt: "2026-10-02T10:00:00.000Z" });
  });

  it("lo editado a mano que el handoff ya no trae se conserva; lo que nadie tocó, se va", () => {
    const previos = [
      r("R1", "Conocer la conversión", { lineaBase: "8%", editadoAt: "2026-10-02T10:00:00.000Z" }),
      r("R2", "Algo que se cayó del handoff"),
    ];
    const lista = fusionarResultados(previos, [leido("Medir la pauta")]);
    expect(lista.map((x) => x.id).sort()).toEqual(["R1", "R3"]);
  });

  it("editar marca quién y cuándo, y solo toca línea base, meta y plazo", () => {
    const ahora = new Date("2026-10-02T15:00:00.000Z");
    const lista = editarResultado([r("R1", "Conocer la conversión")], "r1", { lineaBase: " 8% ", resultado: "otro" } as never, "cse@smarteamcr.com", ahora);
    expect(lista?.[0]).toMatchObject({ resultado: "Conocer la conversión", lineaBase: "8%", editadoPor: "cse@smarteamcr.com", editadoAt: ahora.toISOString() });
    expect(editarResultado([], "R9", { meta: "x" }, null, ahora)).toBeNull();
  });

  it("lee lo guardado con tolerancia: descarta ids raros y repetidos", () => {
    const g = leerResultadosDelHandoff({
      version: 1,
      at: "2026-10-02",
      origen: "handoff",
      resultados: [{ id: "r1", resultado: "A" }, { id: "R1", resultado: "B" }, { id: "X", resultado: "C" }, { id: "R2", resultado: "" }],
    });
    expect(g?.resultados.map((x) => x.id)).toEqual(["R1"]);
    expect(leerResultadosDelHandoff(null)).toBeNull();
  });

  it("la respuesta del modelo se valida: lo que no es lista o no trae resultado, se descarta", () => {
    expect(leerRespuestaDeResultados("no es json")).toBeNull();
    expect(leerRespuestaDeResultados('{"otra": 1}')).toBeNull();
    expect(
      leerRespuestaDeResultados('{"resultados":[{"resultado":"Conocer la conversión","metrica":"tasa","lineaBase":"","meta":"","plazo":""},{"resultado":""}]}'),
    ).toEqual([{ resultado: "Conocer la conversión", metrica: "tasa", lineaBase: "", meta: "", plazo: "" }]);
  });

  it("para el agente, lo que falta dice «por validar» (nunca se inventa)", () => {
    const t = resultadosParaPrompt([r("R1", "Conocer la conversión", { metrica: "tasa por proyecto", meta: "15%" })]);
    expect(t).toContain("R1 · Conocer la conversión");
    expect(t).toContain("línea base: por validar");
    expect(t).toContain("meta: 15%");
  });
});

describe("los resultados confirmados son el campo «Resultados que persigue» de Información del cliente", () => {
  it("solo entra lo confirmado, una viñeta por resultado, sin «por validar»", () => {
    const texto = resultadosParaLaFicha([
      {
        proyecto: "CRM",
        resultados: [
          r("R1", "Vista 360 del cliente", { metrica: "uso semanal", meta: "80 %", plazo: "6 semanas", confirmadoAt: "2026-10-05" }),
          r("R2", "Segmentos confiables"),
        ],
      },
    ]);
    expect(texto).toBe("- **R1** · Vista 360 del cliente — se mide con: uso semanal — meta: 80 % — plazo: 6 semanas");
  });

  it("con varios proyectos, cada uno con su nombre; sin nada confirmado, vacío", () => {
    const ok = { confirmadoAt: "x" };
    expect(
      resultadosParaLaFicha([
        { proyecto: "CRM", resultados: [r("R1", "Uno", ok)] },
        { proyecto: "Sitio web", resultados: [r("R1", "Dos", ok)] },
      ]),
    ).toBe("**CRM**\n- **R1** · Uno\n\n**Sitio web**\n- **R1** · Dos");
    expect(resultadosParaLaFicha([{ proyecto: "CRM", resultados: [r("R1", "Uno")] }])).toBe("");
  });
});
