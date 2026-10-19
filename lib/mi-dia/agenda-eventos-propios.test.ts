/**
 * La cuenta de un evento propio de la agenda (2026-10-19). Elías: tocar «Preparar demo para Accesos Automáticos» en la
 * agenda de «Para ti» tiene que abrir el panel con lo de Accesos Automáticos; tocar «Tenis» o el almuerzo, solo el
 * título, la hora y tus notas. La regla: el nombre ENTERO de UNA empresa en el título (o, si el título no nombra
 * ninguna, en la descripción), con el match de títulos del cascade; con dos, ninguna (invariante 1).
 */
import { describe, expect, it } from "vitest";
import { cuentaDelEvento, empresasDelEventoPropio, eventosPropios } from "./agenda";
import { siguientePasoParaElPanel } from "./guia";
import { clientesNombradosEnteros, indiceDeClientes } from "@/lib/sessions/clientes-por-texto";

const INDICE = indiceDeClientes([
  { id: "aa", name: "Accesos Automáticos", company: null },
  { id: "honda", name: "Honda Costa Rica", company: null },
  { id: "clinica", name: "Clínica Médica Oceánica", company: null },
  { id: "servica", name: "Grupo Servica", company: null },
  { id: "inve", name: "Grupo Inve", company: null },
  { id: "cav", name: "Club de Amantes del Vino", company: null, siglas: ["CAV"] },
  { id: "plastimex", name: "Plastimex", company: null },
  { id: "cemaco-1", name: "CEMACO", company: null },
  { id: "cemaco-2", name: "Cemaco", company: null },
]);

const cuenta = (summary: string, description?: string) => cuentaDelEvento({ empresas: empresasDelEventoPropio({ summary, description }, INDICE) });

describe("la cuenta de un evento propio", () => {
  it("el nombre entero de una empresa en el título la decide", () => {
    expect(cuenta("Preparar demo para Accesos Automáticos")).toBe("aa");
    expect(cuenta("Demo: ACCESOS AUTOMATICOS.")).toBe("aa");
    expect(cuenta("Revisar propuesta de Plastimex")).toBe("plastimex");
  });

  it("un evento personal no es de nadie, aunque comparta una palabra con un cliente", () => {
    expect(cuenta("Tenis")).toBeNull();
    expect(cuenta("Almuerzo")).toBeNull();
    expect(cuenta("Cita Médica")).toBeNull();
    expect(cuenta("Sale Juan del colegio")).toBeNull();
  });

  it("medio nombre no alcanza: no se inventa la cuenta", () => {
    expect(cuenta("Preparar reunión Honda")).toBeNull();
    expect(cuenta("Preparar reunión Honda Costa Rica")).toBe("honda");
  });

  it("una palabra que comparten dos empresas no decide; la que las distingue, sí", () => {
    expect(cuenta("Grupo de estudio")).toBeNull();
    expect(cuenta("Preparar QBR Grupo Inve")).toBe("inve");
  });

  it("una sigla declarada cuenta como el nombre entero", () => {
    expect(cuenta("Reporte CAV")).toBe("cav");
  });

  it("dos empresas nombradas: ninguna (invariante 1)", () => {
    expect(empresasDelEventoPropio({ summary: "Comparar Plastimex y Accesos Automáticos" }, INDICE).sort()).toEqual(["aa", "plastimex"]);
    expect(cuenta("Comparar Plastimex y Accesos Automáticos")).toBeNull();
  });

  it("dos registros con el mismo nombre son la misma empresa: cuenta una vez", () => {
    expect(clientesNombradosEnteros("Preparar kickoff CEMACO", INDICE)).toEqual(["cemaco-1"]);
  });

  it("primero el título; si no nombra a nadie, la descripción", () => {
    expect(cuenta("Preparar demo", "Para la reunión con Accesos Automáticos del jueves")).toBe("aa");
    expect(cuenta("Revisar Plastimex", "Lo que pidió Accesos Automáticos")).toBe("plastimex");
    expect(cuenta("Bloque de trabajo", "")).toBeNull();
  });
});

describe("los eventos propios de la agenda llevan su cuenta", () => {
  const ev = (id: string, summary: string, extra: Record<string, unknown> = {}) => ({
    id,
    summary,
    start: { dateTime: "2026-10-22T15:00:00Z" },
    end: { dateTime: "2026-10-22T16:00:00Z" },
    eventType: "default",
    ...extra,
  });

  it("con el índice, cada uno con la empresa que nombra; el bloque de una tarea, sin empresa (abre la tarea)", () => {
    const propios = eventosPropios(
      [
        ev("demo", "Preparar demo para Accesos Automáticos"),
        ev("tenis", "Tenis"),
        ev("bloque", "T-12 · Accesos Automáticos", { extendedProperties: { private: { nexusTareaId: "t12" } } }),
      ],
      INDICE,
    );
    expect(propios.map((p) => [p.id, p.empresas])).toEqual([
      ["demo", ["aa"]],
      ["tenis", []],
      ["bloque", []],
    ]);
  });

  it("sin el índice, ninguno lleva empresa", () => {
    expect(eventosPropios([ev("demo", "Preparar demo para Accesos Automáticos")])[0].empresas).toEqual([]);
  });
});

describe("el siguiente paso del panel", () => {
  const pasos = [
    { equipo: "ventas", fecha: "2026-10-30", que: "Mandar la propuesta" },
    { equipo: "cs", fecha: "2026-10-24", que: "Agendar el kickoff" },
    { equipo: "ventas", fecha: "2026-10-23", que: "Confirmar el presupuesto" },
  ];

  it("el de tu equipo, el más próximo", () => {
    expect(siguientePasoParaElPanel(pasos, "ventas")?.que).toBe("Confirmar el presupuesto");
  });

  it("si tu equipo no tiene, el más próximo de cualquier equipo", () => {
    expect(siguientePasoParaElPanel(pasos, "dev")?.que).toBe("Confirmar el presupuesto");
    expect(siguientePasoParaElPanel(pasos, null)?.que).toBe("Confirmar el presupuesto");
  });

  it("sin pasos, nada", () => {
    expect(siguientePasoParaElPanel([], "cs")).toBeNull();
  });
});
