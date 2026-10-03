/**
 * lib/handoff/propuesta-de-resultados.test.ts — la lista de resultados del cliente: lo que se le suma
 * en la ronda del 2026-10-02 (quién lo necesita, retos, confirmación del CSE, propuesta desde las
 * reuniones cuando el handoff no la escribió). Unida con la lista de lib/handoff/resultados-medibles.ts
 * por decisión de Elías («unir las dos»).
 *
 * Correr: `npx vitest run lib/handoff/propuesta-de-resultados.test.ts --project unit`.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { leerPropuestaDeResultados, pedidoDeResultados } from "./propuesta-de-resultados";
import {
  confirmarResultados,
  editarResultado,
  fusionarResultados,
  leerResultadosDelHandoff,
  resultadosParaPrompt,
  sinConfirmar,
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
const AHORA = new Date("2026-10-02T18:00:00.000Z");

describe("el CSE confirma", () => {
  it("⭐ sin confirmar, el resultado sale «por validar» aunque tenga línea base", () => {
    expect(sinConfirmar(r("R1", "Conocer la conversión", { lineaBase: "8%" }))).toBe(true);
    expect(resultadosParaPrompt([r("R1", "Conocer la conversión", { lineaBase: "8%" })])).toContain("sin confirmar por el CSE");
  });

  it("confirmar todos o los que nombra, con quién y cuándo; confirmar dos veces no cambia la fecha", () => {
    const lista = [r("R1", "A"), r("R2", "B")];
    const uno = confirmarResultados(lista, ["r2"], "cse@smarteamcr.com", AHORA);
    expect(uno.map((x) => !!x.confirmadoAt)).toEqual([false, true]);
    expect(uno[1].confirmadoPor).toBe("cse@smarteamcr.com");
    const otraVez = confirmarResultados(uno, null, "otro@smarteamcr.com", new Date("2026-10-05T00:00:00.000Z"));
    expect(otraVez[1].confirmadoAt).toBe(AHORA.toISOString());
    expect(otraVez[1].confirmadoPor).toBe("cse@smarteamcr.com");
    expect(otraVez[0].confirmadoPor).toBe("otro@smarteamcr.com");
  });

  it("⭐ releer el handoff conserva la confirmación SOLO si el resultado dice lo mismo", () => {
    /* La edición que lo pone en rojo: conservar `confirmadoAt` en cualquier coincidencia. El CSE
       confirmó una frase; si el handoff la cambió, lo confirmado ya no es lo que dice. */
    const previos = [
      r("R1", "Conocer la tasa de conversión de lead a matrícula", { confirmadoAt: AHORA.toISOString(), confirmadoPor: "cse@x" }),
      r("R2", "Bajar el tiempo de respuesta", { confirmadoAt: AHORA.toISOString() }),
    ];
    const lista = fusionarResultados(previos, [
      { resultado: "Conocer la tasa de conversión de lead a matrícula por proyecto", metrica: "", lineaBase: "", meta: "", plazo: "" },
      { resultado: "Bajar el tiempo de respuesta", metrica: "", lineaBase: "", meta: "", plazo: "" },
    ]);
    expect(lista.map((x) => `${x.id}:${x.confirmadoAt ? "sí" : "no"}`)).toEqual(["R1:no", "R2:sí"]);
  });
});

describe("quién lo necesita y lo que lo frena", () => {
  it("se guardan, se leen y lo vacío no se guarda", () => {
    const g = leerResultadosDelHandoff({
      version: 1,
      at: "",
      origen: "propuesta",
      resultados: [
        { id: "R1", resultado: "A", quienLoNecesita: "Ana Pérez, gerente comercial", retos: ["Leads en tres Excel", ""], confirmadoAt: "2026-10-02" },
        { id: "R2", resultado: "B", quienLoNecesita: "", retos: [] },
      ],
    });
    expect(g?.origen).toBe("propuesta");
    expect(g?.resultados[0]).toMatchObject({ quienLoNecesita: "Ana Pérez, gerente comercial", retos: ["Leads en tres Excel"], confirmadoAt: "2026-10-02" });
    expect("quienLoNecesita" in g!.resultados[1]).toBe(false);
    expect("retos" in g!.resultados[1]).toBe(false);
  });

  it("los retos se editan uno por línea; quién lo necesita, como texto", () => {
    const lista = editarResultado([r("R1", "A")], "R1", { retos: "Leads en tres Excel\n\n  Nadie mide la pauta ", quienLoNecesita: " Ana " }, null, AHORA);
    expect(lista?.[0]).toMatchObject({ retos: ["Leads en tres Excel", "Nadie mide la pauta"], quienLoNecesita: "Ana" });
  });

  it("lo que completó una persona manda también en quién lo necesita y los retos", () => {
    const previos = [r("R1", "A", { quienLoNecesita: "Ana", retos: ["el de ella"], editadoAt: AHORA.toISOString() })];
    const lista = fusionarResultados(previos, [{ resultado: "A", metrica: "", lineaBase: "", meta: "", plazo: "", quienLoNecesita: "Otro", retos: ["otro"] }]);
    expect(lista[0]).toMatchObject({ quienLoNecesita: "Ana", retos: ["el de ella"] });
  });

  it("el agente del diagnóstico los recibe", () => {
    const t = resultadosParaPrompt([r("R1", "A", { quienLoNecesita: "Ana, gerente", retos: ["x", "y"], confirmadoAt: AHORA.toISOString() })]);
    expect(t).toContain("lo necesita: Ana, gerente");
    expect(t).toContain("lo que lo frena: x; y");
    expect(t).not.toContain("sin confirmar");
  });
});

describe("la propuesta desde las reuniones (cuando el handoff no la escribió)", () => {
  it("le dice la modalidad: hitos con cierre o metas sostenidas", () => {
    const fuentes = [{ id: "S1", etiqueta: "Sesión", texto: "algo" }];
    const recurrente = pedidoDeResultados({ cliente: "C", proyecto: "P", recurrente: true, fuentes, equipoSmarteam: [] });
    const fin = pedidoDeResultados({ cliente: "C", proyecto: "P", recurrente: false, fuentes, equipoSmarteam: [] });
    expect(JSON.stringify(recurrente.messages)).toContain("RECURRENTE (metas sostenidas)");
    expect(JSON.stringify(fin.messages)).toContain("FIN DEFINIDO (hitos con cierre)");
  });

  it("no cita fuentes que no existen ni pone a alguien de Smarteam como quien lo necesita", () => {
    const respuesta = {
      content: [
        {
          type: "tool_use",
          id: "t",
          name: "proponer_resultados",
          input: {
            resultados: [
              { resultado: "x", quienLoNecesita: "Juan Carlos Armijos", retos: ["a"], fuentes: ["S1", "S9"] },
              { resultado: "  ", quienLoNecesita: "Ana", retos: [], fuentes: [] },
            ],
          },
        },
      ],
    } as unknown as Anthropic.Messages.Message;
    const propuestos = leerPropuestaDeResultados(respuesta, [{ id: "S1", etiqueta: "s", texto: "t" }], ["Juan Carlos Armijos"]);
    expect(propuestos).toHaveLength(1);
    expect(propuestos[0]).toMatchObject({ resultado: "x", fuentes: ["S1"], retos: ["a"] });
    expect("quienLoNecesita" in propuestos[0]).toBe(false);
  });
});

describe("las guardas del circuito", () => {
  const leer = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

  it("el handoff, el diagnóstico y la lista usan la MISMA puerta (leer o proponer)", () => {
    /* La edición que lo pone en rojo: volver a llamar solo a «leer la sección». En los handoffs viejos
       la sección está vacía y la lista quedaría vacía para siempre. */
    expect(leer("app/api/clients/[id]/analyze/route.ts")).toContain('leerOProponerResultados(bodyProjectId, { origen: "handoff" })');
    expect(leer("lib/canvas/diagnostico-generate.ts")).toContain('leerOProponerResultados(projectId, { origen: "diagnostico" })');
    expect(leer("app/api/projects/[projectId]/handoff-resultados/route.ts")).toContain("leerOProponerResultados(projectId,");
  });

  it("confirmar pide la celda del CSE, no la de editar el diagnóstico", () => {
    const src = leer("app/api/projects/[projectId]/handoff-resultados/route.ts");
    const i = src.indexOf("export async function PUT");
    const tramo = src.slice(i);
    expect(tramo.length, "la guarda no mira nada").toBeGreaterThan(300);
    expect(tramo).toContain('guardPermission("handoff", "confirmarResultados")');
    expect(tramo).toContain("confirmarResultados(actual.resultados");
  });

  it("el diagnóstico muestra «Por validar» lo que el CSE no confirmó", () => {
    expect(leer("components/landing/sections-diagnostico.tsx")).toContain("(!!r && !r.confirmadoAt)");
  });
});
