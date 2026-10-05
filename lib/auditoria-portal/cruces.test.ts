import { describe, expect, it } from "vitest";
import {
  automatizacionDelPipeline,
  avisosSinDestino,
  buclesPosibles,
  cadenasDeWorkflows,
  compararConLaPlanificacion,
  etapaQueAcumula,
  mapaDeEtapas,
  masEditados,
} from "./cruces";
import type { PersonaDelPortal, PipelineLeido, WorkflowLeido } from "./inventario";

/**
 * lib/auditoria-portal/cruces.test.ts — LO QUE NO SE VE MIRANDO UN WORKFLOW O UN PIPELINE SOLO.
 * Cada regla es un hecho que la pantalla y el análisis leen igual: si una cambia, cambian los dos.
 */

type Detalle = NonNullable<WorkflowLeido["detalle"]>;

function wf(id: string, d: Partial<Detalle> & { objeto?: WorkflowLeido["objeto"]; encendido?: boolean; versiones?: number }): WorkflowLeido {
  const { objeto = "contactos", encendido = true, versiones, ...detalle } = d;
  return {
    id,
    nombre: `Workflow ${id}`,
    objeto,
    encendido,
    creadoEn: null,
    cambiadoEn: null,
    versiones: versiones ?? null,
    detalle: {
      disparador: "criterios",
      acciones: 1,
      ramas: 0,
      queHace: [],
      escribe: [],
      cambiaEtapa: false,
      conCodigo: false,
      conWebhook: false,
      disparadoPor: { propiedades: [], etapas: [], formularios: 0, eventos: 0, listas: 0 },
      ...detalle,
    },
  };
}

const dispara = (propiedades: string[] = [], etapas: string[] = []) => ({ disparadoPor: { propiedades, etapas, formularios: 0, eventos: 0, listas: 0 } });

const pipeline = (etapas: Array<[string, string, number | null, boolean?]>, extra: Partial<PipelineLeido> = {}): PipelineLeido => ({
  objeto: "negocios",
  id: "p1",
  nombre: "Pipeline de ventas",
  etapas: etapas.map(([id, nombre, registros, cerrada]) => ({ id, nombre, probabilidad: null, cerrada: cerrada === true, registros })),
  registros: etapas.reduce((s, e) => s + (e[2] ?? 0), 0),
  ...extra,
});

describe("cadenasDeWorkflows", () => {
  it("uno escribe la propiedad que dispara a otro del mismo objeto", () => {
    const c = cadenasDeWorkflows([wf("a", { escribe: ["segmento"] }), wf("b", dispara(["segmento"]))]);
    expect(c).toEqual([{ desde: "a", hacia: "b", por: "segmento", tipo: "propiedad" }]);
  });

  it("entre objetos distintos no hay cadena por propiedad (el registro es otro)", () => {
    expect(cadenasDeWorkflows([wf("a", { escribe: ["segmento"], objeto: "negocios" }), wf("b", dispara(["segmento"]))])).toEqual([]);
  });

  it("la etapa del pipeline se cruza por su id, no por la propiedad (dealstage es la de todos)", () => {
    const pone = wf("a", { objeto: "negocios", escribe: ["dealstage"], poneEtapas: ["st-2"] });
    const otraEtapa = wf("b", { objeto: "negocios", ...dispara(["dealstage"], ["st-9"]) });
    const mismaEtapa = wf("c", { objeto: "negocios", ...dispara(["dealstage"], ["st-2"]) });
    expect(cadenasDeWorkflows([pone, otraEtapa, mismaEtapa])).toEqual([{ desde: "a", hacia: "c", por: "st-2", tipo: "etapa" }]);
  });

  it("un workflow apagado no dispara; la llamada directa se cuenta aunque el destino esté apagado", () => {
    const c = cadenasDeWorkflows([
      wf("a", { escribe: ["segmento"], encendido: false }),
      wf("b", dispara(["segmento"])),
      wf("c", { pasaA: ["d"] }),
      wf("d", { encendido: false }),
    ]);
    expect(c).toEqual([{ desde: "c", hacia: "d", por: "pasa", tipo: "pasa" }]);
  });

  it("un workflow sin detalle no aparece", () => {
    const sinDetalle: WorkflowLeido = { ...wf("b", dispara(["segmento"])), detalle: null };
    expect(cadenasDeWorkflows([wf("a", { escribe: ["segmento"] }), sinDetalle])).toEqual([]);
  });
});

describe("buclesPosibles", () => {
  it("se reinscribe y escribe lo que lo dispara", () => {
    const w = wf("a", { reinscribe: true, escribe: ["puntaje"], ...dispara(["puntaje"]) });
    expect(buclesPosibles([w])).toEqual([{ workflows: ["a"], por: "puntaje" }]);
  });

  it("sin reinscribir no es bucle consigo mismo", () => {
    expect(buclesPosibles([wf("a", { escribe: ["puntaje"], ...dispara(["puntaje"]) })])).toEqual([]);
  });

  it("dos que se disparan entre sí, una sola vez", () => {
    const a = wf("a", { escribe: ["x"], ...dispara(["y"]) });
    const b = wf("b", { escribe: ["y"], ...dispara(["x"]) });
    expect(buclesPosibles([a, b])).toEqual([{ workflows: ["a", "b"], por: "x" }]);
  });
});

describe("avisosSinDestino", () => {
  const personas: PersonaDelPortal[] = [
    { usuarioId: "u1", nombre: "Activa", dominio: "cliente.test", activo: true, superAdmin: false },
    { usuarioId: "u2", nombre: "Se fue", dominio: "cliente.test", activo: false, superAdmin: false },
  ];

  it("avisa o rota entre personas que ya no están (o que ni aparecen)", () => {
    const r = avisosSinDestino([wf("a", { avisaA: ["u1", "u2"] }), wf("b", { rotaEntre: ["u9"] }), wf("c", { avisaA: ["u2"], encendido: false })], personas);
    expect(r).toEqual([
      { workflowId: "a", tipo: "avisa", usuarios: [{ id: "u2", nombre: "Se fue" }] },
      { workflowId: "b", tipo: "rota", usuarios: [{ id: "u9", nombre: null }] },
    ]);
  });

  it("sin la lista de usuarios no se puede saber: null, no cero", () => {
    expect(avisosSinDestino([wf("a", { avisaA: ["u2"] })], null)).toBeNull();
  });
});

describe("masEditados", () => {
  it("de más a menos versiones; una sola versión no cuenta", () => {
    const r = masEditados([wf("a", { versiones: 3 }), wf("b", { versiones: 108 }), wf("c", { versiones: 1 })]);
    expect(r.map((w) => w.id)).toEqual(["b", "a"]);
  });
});

describe("pipelines", () => {
  const p = pipeline([
    ["st-1", "Nuevo", 10],
    ["st-2", "Pausados", 110],
    ["st-3", "Ganado", 50, true],
    ["st-4", "Vacía", 0],
  ]);

  it("la etapa abierta que acumula, sobre los abiertos (las cerradas no cuentan)", () => {
    expect(etapaQueAcumula(p)).toEqual({ nombre: "Pausados", registros: 110, deAbiertos: 120 });
    expect(etapaQueAcumula(pipeline([["a", "A", null]]))).toBeNull();
  });

  it("mapa de etapas: el id lleva a su pipeline y su nombre", () => {
    expect(mapaDeEtapas([p]).get("st-2")).toEqual({ pipelineId: "p1", pipeline: "Pipeline de ventas", objeto: "negocios", etapa: "Pausados" });
  });

  it("automatización por etapa: quién la pone y quién corre al entrar (solo encendidos)", () => {
    const r = automatizacionDelPipeline(p, [
      wf("pone", { objeto: "negocios", poneEtapas: ["st-3"] }),
      wf("entra", { objeto: "negocios", ...dispara(["dealstage"], ["st-2"]) }),
      wf("apagado", { objeto: "negocios", poneEtapas: ["st-2"], encendido: false }),
    ]);
    expect(r.find((x) => x.etapaId === "st-3")).toEqual({ etapaId: "st-3", alEntrar: [], laPonen: ["pone"] });
    expect(r.find((x) => x.etapaId === "st-2")).toEqual({ etapaId: "st-2", alEntrar: ["entra"], laPonen: [] });
  });
});

describe("compararConLaPlanificacion", () => {
  const leidos = [
    pipeline([["1", "Nuevo", 1], ["2", "Propuesta enviada", 1], ["3", "Pausados", 1], ["4", "Ganado", 1, true]], { id: "v", nombre: "Pipeline de ventas" }),
    pipeline([["5", "Abierto", 1]], { id: "s", nombre: "Soporte", objeto: "tickets" }),
  ];

  it("empareja por tipo y nombre; las etapas por nombre parecido", () => {
    const [c] = compararConLaPlanificacion([{ nombre: "Ventas", tipo: "ventas", etapas: ["Nuevo", "Propuesta", "Negociación", "Ganado"] }], leidos);
    expect(c).toEqual({
      planeado: "Ventas",
      tipo: "ventas",
      enPortal: { id: "v", nombre: "Pipeline de ventas" },
      coinciden: ["Nuevo", "Propuesta", "Ganado"],
      faltanEnElPortal: ["Negociación"],
      soloEnElPortal: ["Pausados"],
    });
  });

  it("si no hay un pipeline del mismo tipo, todas faltan", () => {
    const [c] = compararConLaPlanificacion([{ nombre: "Servicio", tipo: "servicio", etapas: ["Nuevo"] }], [leidos[0]!]);
    expect(c).toMatchObject({ enPortal: null, faltanEnElPortal: ["Nuevo"] });
  });

  it("un pipeline planeado sin etapas no se compara", () => {
    expect(compararConLaPlanificacion([{ nombre: "Leads", tipo: "leads", etapas: [] }], leidos)).toEqual([]);
  });
});
