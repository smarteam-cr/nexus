/**
 * lib/sessions/post-process.test.ts — LA LECTURA DE SEGUIMIENTO DE UNA REUNIÓN, con la base y el modelo simulados
 * (memoria de la cuenta, etapa 2).
 *
 * Qué se congela (cada `it` nombra la edición que lo pone en rojo):
 *   1. la ruta por tipo de empresa: sin dueño o de un aliado, ni se llama al modelo; un prospecto no pide pedidos fuera
 *      de alcance ni pasa por el clasificador; un cliente sin proyecto tampoco los pide;
 *   2. la respuesta cortada se reintenta UNA vez con más tope; si vuelve a cortarse, error sin minuta;
 *   3. ⭐ una cita que no está en lo que se mandó descarta el compromiso o el pedido; lo demás va a propuestas de Tarea;
 *   4. ⭐ la minuta se escribe la ÚLTIMA (después de las propuestas y los pedidos): «tiene minuta» = terminó entera;
 *   5. la llamada queda atribuida a la reunión (`LlmCall.origen = "reunion:<id> › sessions/post-process"`);
 *   6. `soloLeer` no escribe nada;
 *   7. una reunión de puertas adentro no se lee (aunque su dueño sea un cliente);
 *   8. con `force`, una minuta revisada no se rehace;
 *   9. ⭐ cortada por el tope (`signal`) antes de escribir, no escribe nada.
 *
 * Correr: `npx vitest run lib/sessions/post-process.test.ts --project unit`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, crear, escribirSalidaDeSeguimiento, classifySessionToProjects, MIEMBROS, preventa, puertasAdentro, titulos } = vi.hoisted(() => ({
  db: {
    firefliesSession: { findUnique: vi.fn(), update: vi.fn() },
    client: { findUnique: vi.fn() },
    sessionMinute: { findUnique: vi.fn(), upsert: vi.fn() },
    agent: { findUnique: vi.fn() },
    agentRun: { create: vi.fn(), update: vi.fn() },
    project: { findUnique: vi.fn() },
    lecturaDeReunion: { findUnique: vi.fn() },
    pedidoFueraDeAlcance: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
  crear: vi.fn(),
  escribirSalidaDeSeguimiento: vi.fn(),
  classifySessionToProjects: vi.fn(),
  MIEMBROS: [
    { email: "marco@smarteamcr.com", nombre: "Marco Salas", area: "CSE", roleEnum: "CSE" },
    { email: "lidia@smarteamcr.com", nombre: "Lidia Flores", area: "Marketing", roleEnum: "MARKETING" },
  ],
  preventa: vi.fn(),
  puertasAdentro: vi.fn(async () => false),
  titulos: vi.fn(async () => ["Revisar los copies"]),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/anthropic", () => ({ anthropic: { messages: { create: crear } } }));
vi.mock("@/lib/sessions/project-sources", () => ({
  duenoDeLaSesion: (s: { resolvedClientId: string | null; manualClientId: string | null }) => s.resolvedClientId ?? s.manualClientId ?? null,
}));
vi.mock("@/lib/sessions/classify-session-project", () => ({ classifySessionToProjects, getPrimaryProjectIdForSession: vi.fn(async () => "p1") }));
vi.mock("@/lib/timeline/reanchor", () => ({ maybeReanchorToKickoff: vi.fn() }));
vi.mock("@/lib/canvas/load-canvas-context", () => ({ loadHandoffContext: vi.fn(async () => "Alcance contratado: Sales Hub. Fuera de alcance: integraciones.") }));
vi.mock("@/lib/canvas/presentacion-del-diagnostico-server", () => ({ diagnosticoSinPresentar: vi.fn(async () => false), proponerFechaDesdeReunion: vi.fn() }));
vi.mock("@/lib/lecturas/personas", () => ({
  cseDelProyecto: vi.fn(async () => "marco@smarteamcr.com"),
  cseDeLaCuenta: vi.fn(async () => null),
  responsableDeLaPreventaViva: preventa,
  negocioDeLaCuenta: vi.fn(async () => ({ vendedores: [], duenoDeLaEmpresa: null })),
}));
vi.mock("@/lib/tareas/lectura", () => ({ escribirSalidaDeSeguimiento, descartesDeLaCuenta: vi.fn(async () => ({ temas: [], empresa: null })) }));
vi.mock("@/lib/tareas/para-agentes", () => ({ titulosParaLaLectura: titulos }));
vi.mock("@/lib/sessions/reuniones-para-seguimiento", () => ({ esDePuertasAdentro: puertasAdentro }));
vi.mock("@/lib/tareas/servidor", () => ({ miembrosActivos: vi.fn(async () => MIEMBROS) }));

import { contextoDeIA, origenDeLaFila } from "@/lib/ai/contexto-de-corrida";
import { leerReunionDeSeguimiento } from "./post-process";

const TRANSCRIPT =
  "Ana Mora: Les mando la base de datos de clientes el miércoles sin falta.\n" +
  "Marco Salas: Perfecto, y yo armo el tablero de ventas para el viernes.\n" +
  "Ana Mora: Ah, y también queremos integrar DocuSign, que eso no estaba en lo que compramos.\n" +
  "Marco Salas: Lo cotizamos aparte entonces.";

function sesion(c: Record<string, unknown> = {}) {
  return { id: "s1", title: "Semanal Acme", date: new Date("2026-10-08T16:00:00Z"), participants: ["marco@smarteamcr.com", "ana@acme.com"], resolvedClientId: "c1", manualClientId: null, transcript: TRANSCRIPT, summary: { overview: "Se revisó el avance." }, ...c };
}

const COMPROMISOS = [
  { quien: "CLIENTE", responsable: "Ana", que: "Enviar la base de datos de clientes", tituloDeSeguimiento: "Recordarle a Ana que envíe la base de datos", fecha: "2026-10-14", tipo: "INSUMO", frenaElPlan: true, cita: "Les mando la base de datos de clientes el miércoles" },
  { quien: "SMARTEAM", responsable: "Marco", ownerEmail: "marco@smarteamcr.com", que: "Armar el tablero de ventas", fecha: "2026-10-09", tipo: "ACCION", frenaElPlan: false, cita: "yo armo el tablero de ventas para el viernes" },
  { quien: "CLIENTE", responsable: "Ana", que: "Mandar el logo", tipo: "INSUMO", frenaElPlan: false, cita: "les mando el logo en alta resolución" },
];
const PEDIDOS = [
  { huella: "integracion-docusign", pedido: "Integrar DocuSign", cita: "también queremos integrar DocuSign" },
  { huella: "app-movil", pedido: "Una app móvil", cita: "queremos una app para los vendedores" },
];

function respuesta(input: unknown, stop = "tool_use") {
  return { content: [{ type: "tool_use", id: "t1", name: "registrar_lectura", input }], stop_reason: stop, usage: { input_tokens: 1_000, output_tokens: 200 } };
}

const origenes: (string | null)[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  origenes.length = 0;
  db.firefliesSession.findUnique.mockResolvedValue(sesion());
  db.client.findUnique.mockResolvedValue({ id: "c1", name: "Acme", company: null, industry: null, kind: "CLIENTE" });
  db.sessionMinute.findUnique.mockResolvedValue(null);
  db.sessionMinute.upsert.mockResolvedValue({ id: "m1" });
  db.agent.findUnique.mockResolvedValue({ systemPrompt: "PROMPT DE LA BASE" });
  db.agentRun.create.mockResolvedValue({ id: "run1" });
  db.agentRun.update.mockResolvedValue({});
  db.project.findUnique.mockResolvedValue({ id: "p1", name: "Implementación", serviceType: "CS" });
  db.lecturaDeReunion.findUnique.mockResolvedValue({ id: "lec1", equipo: "cs" });
  db.pedidoFueraDeAlcance.findUnique.mockResolvedValue(null);
  classifySessionToProjects.mockResolvedValue({ status: "ok", primaryProjectId: "p1" });
  escribirSalidaDeSeguimiento.mockResolvedValue({ propuestas: 1, porAsignar: 0, yaEstaban: 0, sumadas: 0, omitidas: { lapida: 0 } });
  preventa.mockResolvedValue(undefined);
  puertasAdentro.mockResolvedValue(false);
  titulos.mockResolvedValue(["Revisar los copies"]);
  crear.mockImplementation(async () => {
    origenes.push(origenDeLaFila(contextoDeIA()));
    return respuesta({ minuta: { summary: "Se acordó la base y el tablero." }, compromisos: COMPROMISOS, fueraDeAlcance: PEDIDOS });
  });
});

describe("la ruta según la empresa", () => {
  it("sin dueño o de un aliado, ni se llama al modelo ni se crea la corrida", async () => {
    db.firefliesSession.findUnique.mockResolvedValueOnce(sesion({ resolvedClientId: null }));
    const sinDueno = await leerReunionDeSeguimiento("s1", { lecturaId: "lec1" });
    expect(sinDueno).toMatchObject({ status: "omitida", reason: "Sin dueño: la reunión no está atribuida a ningún cliente" });
    db.client.findUnique.mockResolvedValueOnce({ id: "a1", name: "4am", company: null, industry: null, kind: "ALIADO" });
    const aliado = await leerReunionDeSeguimiento("s1", { lecturaId: "lec1" });
    expect(aliado.status).toBe("omitida");
    expect(crear).not.toHaveBeenCalled();
    expect(db.agentRun.create).not.toHaveBeenCalled();
  });

  it("un prospecto: sin clasificador ni pedidos fuera de alcance (aunque el modelo los mande); lo del cliente va a la preventa", async () => {
    db.client.findUnique.mockResolvedValue({ id: "c1", name: "Acme", company: null, industry: null, kind: "PROSPECTO" });
    preventa.mockResolvedValue("lidia@smarteamcr.com");
    const r = await leerReunionDeSeguimiento("s1", { lecturaId: "lec1" });
    expect(r).toMatchObject({ status: "ok", ruta: "prospecto", pedidos: 0 });
    expect(classifySessionToProjects).not.toHaveBeenCalled();
    expect(db.pedidoFueraDeAlcance.create).not.toHaveBeenCalled();
    const pedido = crear.mock.calls[0][0] as { tools: { input_schema: { properties: object } }[]; system: string };
    expect(Object.keys(pedido.tools[0].input_schema.properties)).not.toContain("fueraDeAlcance");
    expect(pedido.system).toContain("no se piden pedidos fuera de alcance");
    const propuestas = escribirSalidaDeSeguimiento.mock.calls[0][2] as { responsableEmail: string | null; sugerido: { lado: string } }[];
    expect(propuestas.filter((p) => p.sugerido.lado === "cliente").map((p) => p.responsableEmail)).toEqual(["lidia@smarteamcr.com"]);
  });

  it("un cliente sin proyecto principal no pide pedidos fuera de alcance (no hay nada vendido contra qué comparar)", async () => {
    classifySessionToProjects.mockResolvedValue({ status: "ok", primaryProjectId: null });
    const r = await leerReunionDeSeguimiento("s1", { lecturaId: "lec1" });
    expect(r).toMatchObject({ status: "ok", pedidos: 0 });
    expect(db.pedidoFueraDeAlcance.create).not.toHaveBeenCalled();
  });

  it("sin transcripción, sin_texto; con minuta (y sin force), ya leída", async () => {
    db.firefliesSession.findUnique.mockResolvedValueOnce(sesion({ transcript: "hola" }));
    expect((await leerReunionDeSeguimiento("s1", { lecturaId: "lec1" })).status).toBe("sin_texto");
    db.sessionMinute.findUnique.mockResolvedValueOnce({ id: "m0", status: "DRAFT" });
    expect(await leerReunionDeSeguimiento("s1", { lecturaId: "lec1" })).toMatchObject({ status: "skipped", minuteId: "m0" });
    expect(crear).not.toHaveBeenCalled();
  });

  it("una reunión de puertas adentro no se lee aunque su dueño sea un cliente (lo dicho sin el cliente no se le atribuye)", async () => {
    puertasAdentro.mockResolvedValueOnce(true);
    const r = await leerReunionDeSeguimiento("s1", { lecturaId: "lec1" });
    expect(r.status).toBe("omitida");
    expect(r.reason).toContain("puertas adentro");
    expect(crear).not.toHaveBeenCalled();
    expect(db.agentRun.create).not.toHaveBeenCalled();
    expect(classifySessionToProjects).not.toHaveBeenCalled();
  });

  it("con force, una minuta revisada o editada no se rehace (es memoria y se corrige); una en borrador sí", async () => {
    db.sessionMinute.findUnique.mockResolvedValueOnce({ id: "m0", status: "REVIEWED" });
    expect(await leerReunionDeSeguimiento("s1", { lecturaId: "lec1", force: true })).toMatchObject({ status: "skipped", minuteId: "m0" });
    db.sessionMinute.findUnique.mockResolvedValueOnce({ id: "m0", status: "EDITED" });
    expect((await leerReunionDeSeguimiento("s1", { lecturaId: "lec1", force: true })).status).toBe("skipped");
    expect(crear).not.toHaveBeenCalled();
    db.sessionMinute.findUnique.mockResolvedValueOnce({ id: "m0", status: "DRAFT" });
    expect((await leerReunionDeSeguimiento("s1", { lecturaId: "lec1", force: true })).status).toBe("ok");
  });

  it("los títulos de «YA SON TAREAS» salen de la puerta de los agentes, con el cliente y la reunión", async () => {
    await leerReunionDeSeguimiento("s1", { lecturaId: "lec1" });
    expect(titulos).toHaveBeenCalledWith({ clientId: "c1", sessionId: "s1" });
    expect((crear.mock.calls[0][0] as { messages: { content: string }[] }).messages[0].content).toContain("- Revisar los copies");
  });

  it("sin la fila de la cola no escribe nada (la lectura se pide por lib/lecturas)", async () => {
    expect((await leerReunionDeSeguimiento("s1", {})).status).toBe("error");
    expect(crear).not.toHaveBeenCalled();
  });
});

describe("la llamada y la salida", () => {
  it("⭐ un solo intento, con el tope alto: una respuesta cortada no se paga dos veces (2026-10-18)", async () => {
    await leerReunionDeSeguimiento("s1", { lecturaId: "lec1" });
    expect(crear.mock.calls.map((c) => (c[0] as { max_tokens: number }).max_tokens)).toEqual([12_000]);
  });

  it("⭐ cortada: error, la corrida en ERROR y SIN minuta ni propuestas, y sin reintento", async () => {
    crear.mockResolvedValue(respuesta({}, "max_tokens"));
    const r = await leerReunionDeSeguimiento("s1", { lecturaId: "lec1" });
    expect(r.status).toBe("error");
    expect(r.reason).toContain("se cortó");
    expect(crear).toHaveBeenCalledTimes(1);
    expect(db.agentRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ERROR" }) }));
    expect(db.sessionMinute.upsert).not.toHaveBeenCalled();
    expect(escribirSalidaDeSeguimiento).not.toHaveBeenCalled();
  });

  it("⭐ la cita que no está descarta el compromiso y el pedido; lo demás va a propuestas y al pedido del proyecto", async () => {
    const r = await leerReunionDeSeguimiento("s1", { lecturaId: "lec1" });
    expect(r).toMatchObject({ status: "ok", ruta: "completa", descartadosPorCita: { compromisos: 1, pedidos: 1 }, pedidos: 1 });
    const propuestas = escribirSalidaDeSeguimiento.mock.calls[0][2] as { titulo: string; responsableEmail: string | null; projectId: string | null; sugerido: Record<string, unknown> }[];
    expect(propuestas.map((p) => p.titulo)).toEqual(["Recordarle a Ana que envíe la base de datos", "Armar el tablero de ventas"]);
    expect(propuestas.every((p) => p.projectId === "p1" && p.responsableEmail === "marco@smarteamcr.com")).toBe(true);
    expect(propuestas[0].sugerido.frenaElPlan).toBe(true);
    expect(db.pedidoFueraDeAlcance.create).toHaveBeenCalledTimes(1);
    expect(db.pedidoFueraDeAlcance.create.mock.calls[0][0]).toMatchObject({ data: { projectId: "p1", huella: "integracion-docusign", estado: "PEDIDO" } });
  });

  it("⭐ pocos y esenciales (2026-10-19): lo que la lectura marcó como menor no llega a Tareas; lo que frena el plan sí", async () => {
    crear.mockImplementationOnce(async () =>
      respuesta({
        minuta: { summary: "x" },
        compromisos: [
          { ...COMPROMISOS[0], esencial: false },
          { ...COMPROMISOS[1], esencial: false },
        ],
      }),
    );
    await leerReunionDeSeguimiento("s1", { lecturaId: "lec1" });
    const propuestas = escribirSalidaDeSeguimiento.mock.calls[0][2] as { titulo: string }[];
    expect(propuestas.map((p) => p.titulo)).toEqual(["Recordarle a Ana que envíe la base de datos"]);
  });

  it("⭐ la minuta se escribe la ÚLTIMA: después de las propuestas y de los pedidos", async () => {
    await leerReunionDeSeguimiento("s1", { lecturaId: "lec1" });
    const minuta = db.sessionMinute.upsert.mock.invocationCallOrder[0];
    expect(escribirSalidaDeSeguimiento.mock.invocationCallOrder[0]).toBeLessThan(minuta);
    expect(db.pedidoFueraDeAlcance.create.mock.invocationCallOrder[0]).toBeLessThan(minuta);
  });

  it("la llamada queda atribuida a la reunión, con el presupuesto de quien la pidió", async () => {
    await leerReunionDeSeguimiento("s1", { lecturaId: "lec1", pedidaPorEmail: "marco@smarteamcr.com" });
    expect(origenes).toEqual(["reunion:s1 › sessions/post-process"]);
    expect(db.agentRun.create.mock.calls[0][0]).toMatchObject({ data: { triggeredByEmail: "marco@smarteamcr.com", sourceSessionIds: ["s1"] } });
  });

  it("lo que sigue queda para después (no corre dentro de la lectura)", async () => {
    const r = await leerReunionDeSeguimiento("s1", { lecturaId: "lec1" });
    expect(typeof r.despues).toBe("function");
  });

  it("⭐ cortada por el tope mientras respondía el modelo: error y NADA escrito (ni propuestas, ni pedidos, ni minuta)", async () => {
    const corte = new AbortController();
    crear.mockImplementationOnce(async () => {
      corte.abort();
      return respuesta({ minuta: { summary: "x" }, compromisos: COMPROMISOS, fueraDeAlcance: PEDIDOS });
    });
    const r = await leerReunionDeSeguimiento("s1", { lecturaId: "lec1", signal: corte.signal });
    expect(r.status).toBe("error");
    expect(r.reason).toContain("se cortó antes de escribir");
    expect(escribirSalidaDeSeguimiento).not.toHaveBeenCalled();
    expect(db.pedidoFueraDeAlcance.create).not.toHaveBeenCalled();
    expect(db.sessionMinute.upsert).not.toHaveBeenCalled();
    expect(db.agentRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ERROR" }) }));
  });

  it("el corte llega a la llamada al modelo y al clasificador", async () => {
    const corte = new AbortController();
    await leerReunionDeSeguimiento("s1", { lecturaId: "lec1", signal: corte.signal });
    expect(crear.mock.calls[0][1]).toEqual({ signal: corte.signal });
    expect(classifySessionToProjects).toHaveBeenCalledWith("s1", "c1", { signal: corte.signal });
  });

  it("soloLeer no escribe nada: ni corrida, ni propuestas, ni pedidos, ni minuta, ni vínculos", async () => {
    const r = await leerReunionDeSeguimiento("s1", { soloLeer: true });
    expect(r.status).toBe("ok");
    expect(r.salida?.compromisos).toHaveLength(2);
    expect(db.agentRun.create).not.toHaveBeenCalled();
    expect(escribirSalidaDeSeguimiento).not.toHaveBeenCalled();
    expect(db.pedidoFueraDeAlcance.create).not.toHaveBeenCalled();
    expect(db.sessionMinute.upsert).not.toHaveBeenCalled();
    expect(classifySessionToProjects).not.toHaveBeenCalled();
  });
});
