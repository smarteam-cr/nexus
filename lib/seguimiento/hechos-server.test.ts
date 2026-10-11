/**
 * lib/seguimiento/hechos-server.test.ts — la lectura de hechos de punta a punta, con la base y Claude falsos: la bandera
 * y el SQL frenan todo, lo que se escribe (los destinos con su estado inicial), lo que se aplica (la ficha, la queja, el
 * avance, la etapa) y lo que queda delegado; el reintento y el cambio de dueño.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  agentRun: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  client: { findUnique: vi.fn() },
  teamMember: { findMany: vi.fn() },
  hechoDeReunion: { findMany: vi.fn(), createMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  sessionMinute: { findUnique: vi.fn() },
  lecturaDeReunion: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
const claude = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/anthropic", () => ({ getAnthropic: () => ({ messages: { create: claude.create } }) }));
const sesiones = vi.hoisted(() => {
  const duenoDeLaReunion = vi.fn();
  return {
    duenoDeLaReunion,
    duenosDeLasReuniones: vi.fn(async (ids: string[]) => new Map(await Promise.all(ids.map(async (id) => [id, await duenoDeLaReunion(id)] as const)))),
  };
});
vi.mock("@/lib/sessions/reuniones-para-seguimiento", () => sesiones);
vi.mock("@/lib/sessions/project-sources", () => ({
  whereBelongsToClient: (id: string) => ({ OR: [{ resolvedClientId: id }] }),
  whereVinculadaAlProyecto: (id: string) => ({ projects: { some: { projectId: id, included: true } } }),
}));
const texto = vi.hoisted(() => ({ textoParaHechos: vi.fn() }));
vi.mock("./hechos/texto-de-la-reunion", () => texto);
vi.mock("@/lib/canvas/load-canvas-context", () => ({ loadHandoffContext: vi.fn(async () => "Se vendió Sales Hub.") }));
const personas = vi.hoisted(() => ({ responsableDeLaPreventaViva: vi.fn(async () => undefined) }));
vi.mock("@/lib/lecturas/personas", () => personas);
const destinos = vi.hoisted(() => ({
  proponerFichaDesdeHechos: vi.fn(async () => ({ status: "ok", cambiados: 1, campos: ["herramientasActuales"] })),
  levantarQuejaDeLaLectura: vi.fn(async () => ({ estado: "creada", alertaId: "alerta-1" })),
  regenerateTimelineProgress: vi.fn(async () => ({ status: "ok" })),
  proponerEtapaDesdeSesion: vi.fn(async () => ({ status: "sugerida", stageId: "etapa-2" })),
  retirarReunionDeLaAlerta: vi.fn(async () => true),
  retirarDeLaFichaLoDeLaReunion: vi.fn(async () => ["herramientasActuales"]),
  cerrarSugerenciaDeLaReunion: vi.fn(async () => true),
}));
vi.mock("@/lib/clients/ficha-propuesta", () => ({
  proponerFichaDesdeHechos: destinos.proponerFichaDesdeHechos,
  retirarDeLaFichaLoDeLaReunion: destinos.retirarDeLaFichaLoDeLaReunion,
}));
vi.mock("@/lib/cs/alertas-de-la-lectura-server", () => ({
  levantarQuejaDeLaLectura: destinos.levantarQuejaDeLaLectura,
  retirarReunionDeLaAlerta: destinos.retirarReunionDeLaAlerta,
}));
vi.mock("@/lib/timeline/regenerate-progress", () => ({ regenerateTimelineProgress: destinos.regenerateTimelineProgress }));
vi.mock("@/lib/projects/etapa-desde-reunion-server", () => ({
  proponerEtapaDesdeSesion: destinos.proponerEtapaDesdeSesion,
  cerrarSugerenciaDeLaReunion: destinos.cerrarSugerenciaDeLaReunion,
}));

import { armarTextoDeLaReunion } from "./hechos/texto";
import { HERRAMIENTA_DE_HECHOS, SIN_GRAVEDAD, SIN_TEMA } from "./hechos/pedido";
import { alCambiarDeDueno, estadoDeLasCorridas, leerHechosDeLaReunion, leidaSinLaTranscripcion, olvidarHechosMirado, reintentarHechos } from "./hechos-server";

const AHORA = new Date("2026-10-10T15:00:00Z");
const TRANSCRIPT = [
  "Mariana Pérez: Hoy seguimos todas las cotizaciones en una hoja de Excel compartida.",
  "Carlos Ruiz: Perfecto, lo tomamos en cuenta para el diseño.",
  "Mariana Pérez: La verdad es que nos están respondiendo muy tarde los correos.",
  "Mariana Pérez: Si no salimos en noviembre perdemos la temporada alta completa.",
  "Mariana Pérez: Ya terminamos de cargar toda la base de contactos en HubSpot.",
  "Mariana Pérez: Ayer presentaron el diagnóstico y nos pareció muy claro.",
  "Mariana Pérez: Estamos de acuerdo con usar un solo pipeline de ventas con cinco etapas.",
].join("\n");
const TEXTO = armarTextoDeLaReunion({ transcript: TRANSCRIPT, summary: null })!;

const item = (o: Record<string, string>) => ({ tema: SIN_TEMA, gravedad: SIN_GRAVEDAD, quien: "cliente", ambito: "cuenta", ...o });
const respuesta = (input: unknown, stop = "tool_use") => ({
  content: [{ type: "tool_use", id: "t", name: HERRAMIENTA_DE_HECHOS, input }],
  stop_reason: stop,
  usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0 },
});
const SALIDA = {
  hechos: [
    item({ tipo: "cuenta", frase: "El cliente sigue las cotizaciones en Excel", cita: "Hoy seguimos todas las cotizaciones en una hoja de Excel compartida" }),
    item({ tipo: "queja", frase: "El cliente dice que le responden tarde", cita: "nos están respondiendo muy tarde los correos", gravedad: "alta" }),
    item({ tipo: "riesgo", frase: "Si no salen en noviembre pierden la temporada", cita: "Si no salimos en noviembre perdemos la temporada alta completa", gravedad: "media" }),
    item({ tipo: "acuerdo", tema: "pipeline", ambito: "P1", frase: "Un solo pipeline de ventas con cinco etapas", cita: "usar un solo pipeline de ventas con cinco etapas" }),
  ],
  senal_cronograma: [{ ambito: "P1", frase: "Terminaron de cargar la base de contactos", cita: "Ya terminamos de cargar toda la base de contactos en HubSpot", quien: "cliente" }],
  senal_etapa: [{ ambito: "P1", frase: "Se presentó el diagnóstico", cita: "Ayer presentaron el diagnóstico y nos pareció muy claro", quien: "cliente" }],
};

beforeEach(() => {
  process.env.SEGUIMIENTO_HECHOS = "1";
  olvidarHechosMirado();
  for (const m of Object.values(db)) {
    if (typeof m === "function") (m as ReturnType<typeof vi.fn>).mockReset();
    else for (const fn of Object.values(m)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  for (const fn of Object.values(destinos)) (fn as ReturnType<typeof vi.fn>).mockClear();
  claude.create.mockReset();
  db.$queryRaw.mockResolvedValue([{ existe: true }]);
  db.agentRun.findMany.mockResolvedValue([]);
  db.agentRun.create.mockResolvedValue({ id: "run-1" });
  db.agentRun.update.mockResolvedValue({});
  db.client.findUnique.mockResolvedValue({ id: "c1", name: "Acme", industry: "Turismo", kind: "CLIENTE" });
  db.teamMember.findMany.mockResolvedValue([{ name: "Carlos Ruiz" }]);
  db.hechoDeReunion.findMany.mockResolvedValue([]);
  db.hechoDeReunion.createMany.mockResolvedValue({ count: 6 });
  db.hechoDeReunion.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => creadoConId(where.id));
  db.hechoDeReunion.updateMany.mockResolvedValue({ count: 1 });
  db.sessionMinute.findUnique.mockResolvedValue({ summary: "Se revisó el avance." });
  sesiones.duenoDeLaReunion.mockResolvedValue("c1");
  texto.textoParaHechos.mockResolvedValue({
    id: "s1",
    titulo: "Seguimiento",
    fecha: "2026-10-08",
    texto: TEXTO,
    puertasAdentro: false,
    proyectos: [{ id: "p1", nombre: "Sales Hub", isPrimary: true, confidence: null, alimentaElAvance: true }],
  });
  claude.create.mockResolvedValue(respuesta(SALIDA));
});

afterEach(() => {
  delete process.env.SEGUIMIENTO_HECHOS;
});

/** Lo que se escribió en createMany, por id. */
function creadoConId(id: string) {
  const fila = (db.hechoDeReunion.createMany.mock.calls[0]?.[0]?.data ?? []).find((d: { id: string }) => d.id === id);
  return fila ? { destinos: fila.destinos, estado: fila.estado, updatedAt: new Date(0) } : null;
}
const escritos = () => db.hechoDeReunion.createMany.mock.calls[0][0].data as Array<{ id: string; tipo: string; destinos: { clave: string; estado: string }[]; projectId: string | null; estado: string }>;

describe("la lectura de hechos", () => {
  it("⛔ con la bandera apagada no hace nada (ni mira la base)", async () => {
    delete process.env.SEGUIMIENTO_HECHOS;
    expect((await leerHechosDeLaReunion("s1")).estado).toBe("apagado");
    expect(db.$queryRaw).not.toHaveBeenCalled();
    expect(claude.create).not.toHaveBeenCalled();
  });

  it("⛔ sin la tabla (el SQL sin aplicar) no hace nada", async () => {
    db.$queryRaw.mockResolvedValue([{ existe: false }]);
    expect((await leerHechosDeLaReunion("s1")).estado).toBe("sin_sql");
    expect(claude.create).not.toHaveBeenCalled();
  });

  it("escribe los hechos con sus destinos y aplica cada uno con su ciclo", async () => {
    const r = await leerHechosDeLaReunion("s1", { lecturaId: "l1", ahora: AHORA });
    expect(r.estado).toBe("lista");
    expect(claude.create).toHaveBeenCalledTimes(1);
    const filas = escritos();
    expect(filas.map((f) => [f.tipo, f.destinos.map((d) => `${d.clave}:${d.estado}`)])).toEqual([
      ["cuenta", ["ficha:pendiente"]],
      ["queja", ["alerta.queja:pendiente"]],
      ["riesgo", ["vigia.riesgo:delegado"]],
      ["acuerdo", ["planning.pipelines:pendiente"]],
      ["senal_cronograma", ["cronograma.avance:pendiente"]],
      ["senal_etapa", ["etapa.encuesta:pendiente"]],
    ]);
    // La ficha, solo con el hecho de la cuenta (no relee la reunión).
    expect(destinos.proponerFichaDesdeHechos).toHaveBeenCalledWith(expect.objectContaining({ clientId: "c1", hechos: [expect.objectContaining({ tipo: "cuenta" })] }));
    // La queja del cliente, con su id.
    expect(destinos.levantarQuejaDeLaLectura).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "c1", agentRunId: "run-1", hecho: expect.objectContaining({ hechoId: filas[1].id, quien: "cliente", quienComprobado: true }) }),
    );
    // El avance, solo para el proyecto con la señal; la etapa, con el texto de la señal (sin releer la reunión).
    expect(destinos.regenerateTimelineProgress).toHaveBeenCalledWith("p1", expect.objectContaining({ asOfSessionId: "s1" }));
    const [, proyecto, , opciones] = destinos.proponerEtapaDesdeSesion.mock.calls[0] as unknown as [string, string, Date, { texto: string; citas: string[] }];
    expect(proyecto).toBe("p1");
    expect(opciones.texto).toContain("Ayer presentaron el diagnóstico y nos pareció muy claro");
    expect(opciones.texto).toContain("Se revisó el avance.");
    // La cita de la etapa se verifica solo contra las citas literales de las señales.
    expect(opciones.citas).toEqual(["Ayer presentaron el diagnóstico y nos pareció muy claro"]);
    // Lo aplicado quedó delegado: la ficha, la alerta, el avance y la etapa (4 escrituras).
    const delegaciones = db.hechoDeReunion.updateMany.mock.calls.map((c) => (c[0].data.destinos as { clave: string; estado: string }[]).map((d) => `${d.clave}:${d.estado}`).join());
    expect(delegaciones).toEqual(["ficha:delegado", "alerta.queja:delegado", "cronograma.avance:delegado", "etapa.encuesta:delegado"]);
    // La corrida queda lista.
    expect(db.agentRun.update).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: "run-1" }, data: expect.objectContaining({ status: "DONE" }) }));
  });

  it("⛔ si la reunión cambió de dueño mientras el modelo leía, no se escribe ni se aplica nada", async () => {
    sesiones.duenoDeLaReunion.mockResolvedValueOnce("c1").mockResolvedValue("c-otro");
    const r = await leerHechosDeLaReunion("s1", { ahora: AHORA });
    expect(r).toMatchObject({ estado: "omitida" });
    expect(db.hechoDeReunion.createMany).not.toHaveBeenCalled();
    expect(destinos.proponerFichaDesdeHechos).not.toHaveBeenCalled();
    expect(destinos.levantarQuejaDeLaLectura).not.toHaveBeenCalled();
    expect(db.agentRun.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "DONE" }) }));
  });

  it("un hecho repetido de uno ya delegado (la ficha) no se vuelve a mandar a la ficha", async () => {
    db.hechoDeReunion.findMany.mockImplementation(async ({ where }: { where: { huella?: { in: string[] } } }) =>
      (where.huella?.in ?? [])
        .filter((h) => h.startsWith("cuenta|"))
        .map((huella) => ({ id: "viejo", projectId: null, huella, estado: "pendiente", createdAt: new Date(+AHORA - 86_400_000), destinos: [{ clave: "ficha", estado: "delegado" }] })),
    );
    await leerHechosDeLaReunion("s1", { ahora: AHORA });
    const cuenta = escritos().find((f) => f.tipo === "cuenta")!;
    expect(cuenta.destinos).toEqual([]);
    expect(destinos.proponerFichaDesdeHechos).not.toHaveBeenCalled();
  });

  it("⛔ en un prospecto, si no se puede saber si la preventa está viva, los hechos no proponen a la ficha", async () => {
    db.client.findUnique.mockResolvedValue({ id: "c1", name: "Acme", industry: "Turismo", kind: "PROSPECTO" });
    personas.responsableDeLaPreventaViva.mockRejectedValueOnce(new Error("la base se cortó"));
    await leerHechosDeLaReunion("s1", { ahora: AHORA });
    expect(destinos.proponerFichaDesdeHechos).not.toHaveBeenCalled();
  });

  it("una queja con un hablante dudoso (un solo nombre que es de alguien del equipo) no levanta alerta: va al vigía", async () => {
    claude.create.mockResolvedValue(
      respuesta({ hechos: [item({ tipo: "queja", frase: "Se quejan de los correos", cita: "nos están respondiendo muy tarde los correos" })], senal_cronograma: [], senal_etapa: [] }),
    );
    texto.textoParaHechos.mockResolvedValue({
      id: "s1",
      titulo: "Seguimiento",
      fecha: "2026-10-08",
      texto: armarTextoDeLaReunion({ transcript: TRANSCRIPT.replaceAll("Mariana Pérez:", "Carlos:"), summary: null })!,
      puertasAdentro: false,
      proyectos: [],
    });
    await leerHechosDeLaReunion("s1", { ahora: AHORA });
    expect(escritos()[0].destinos).toEqual([expect.objectContaining({ clave: "vigia.queja", estado: "delegado" })]);
    expect(destinos.levantarQuejaDeLaLectura).not.toHaveBeenCalled();
  });

  it("una cita que no está en la reunión se descarta (no se escribe)", async () => {
    claude.create.mockResolvedValue(respuesta({ hechos: [item({ tipo: "cuenta", frase: "Usan Salesforce", cita: "nosotros usamos Salesforce desde hace años" })], senal_cronograma: [], senal_etapa: [] }));
    const r = await leerHechosDeLaReunion("s1", { ahora: AHORA });
    expect(r).toMatchObject({ estado: "lista", hechos: 0, descartados: 1 });
    expect(db.hechoDeReunion.createMany).not.toHaveBeenCalled();
    expect(destinos.proponerFichaDesdeHechos).not.toHaveBeenCalled();
  });

  it("⭐ leída solo con las notas y ahora con transcripción: se vuelve a leer, y lo vivo de las notas se desestima", async () => {
    db.agentRun.findMany.mockResolvedValue([{ id: "r0", status: "DONE", clientId: "c1", createdAt: AHORA, sourceSessionIds: ["s1"], output: JSON.stringify({ fuente: "notas" }) }]);
    const viejo = {
      id: "h-notas",
      sessionId: "s1",
      clientId: "c1",
      destinos: [{ clave: "planning.pipelines", estado: "pendiente" }],
      estado: "pendiente",
      decididoPorEmail: null,
      decididoAt: null,
      nota: null,
      updatedAt: new Date(0),
      fechaDeLaReunion: new Date("2026-10-08T12:00:00.000Z"),
      session: { title: "Seguimiento" },
    };
    db.hechoDeReunion.findMany.mockImplementation(async ({ where }: { where: { sessionId?: string } }) => (where.sessionId === "s1" ? [viejo] : []));
    const r = await leerHechosDeLaReunion("s1", { ahora: AHORA });
    expect(r.estado).toBe("lista");
    expect(claude.create).toHaveBeenCalledTimes(1);
    const desestimado = db.hechoDeReunion.updateMany.mock.calls.find((c) => c[0].where.id === "h-notas")![0];
    expect(desestimado.data).toMatchObject({ estado: "desestimado", nota: "Se volvió a leer con la transcripción" });
    expect(leidaSinLaTranscripcion([{ id: "x", status: "DONE", clientId: "c1", createdAt: AHORA, sourceSessionIds: [], output: JSON.stringify({ fuente: "transcripcion" }) }], "c1")).toBe(false);
    expect(leidaSinLaTranscripcion([{ id: "x", status: "DONE", clientId: "c1", createdAt: AHORA, sourceSessionIds: [], output: JSON.stringify({ sinTexto: true }) }], "c1")).toBe(true);
  });

  it("ya leída para este dueño, o leyéndose: no llama a Claude", async () => {
    db.agentRun.findMany.mockResolvedValue([{ id: "r0", status: "DONE", clientId: "c1", createdAt: AHORA, sourceSessionIds: ["s1"] }]);
    expect((await leerHechosDeLaReunion("s1", { ahora: AHORA })).estado).toBe("ya_leida");
    db.agentRun.findMany.mockResolvedValue([{ id: "r0", status: "RUNNING", clientId: "c1", createdAt: new Date(+AHORA - 60_000), sourceSessionIds: ["s1"] }]);
    expect((await leerHechosDeLaReunion("s1", { ahora: AHORA })).estado).toBe("ocupada");
    expect(claude.create).not.toHaveBeenCalled();
  });

  it("de un aliado o de puertas adentro: no llama a Claude y deja la corrida lista (el reintento no vuelve)", async () => {
    db.client.findUnique.mockResolvedValue({ id: "c1", name: "Aliado", industry: null, kind: "ALIADO" });
    expect((await leerHechosDeLaReunion("s1", { ahora: AHORA })).estado).toBe("omitida");
    expect(db.agentRun.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "DONE" }) }));
    expect(claude.create).not.toHaveBeenCalled();
  });

  it("⛔ una vez escritos los hechos, la corrida nunca queda en ERROR (el reintento los duplicaría)", async () => {
    destinos.proponerFichaDesdeHechos.mockRejectedValueOnce(new Error("Haiku caído"));
    db.agentRun.update.mockRejectedValueOnce(new Error("la base se cortó")).mockResolvedValue({});
    const r = await leerHechosDeLaReunion("s1", { ahora: AHORA });
    expect(r.estado).toBe("error");
    expect(db.hechoDeReunion.createMany).toHaveBeenCalledTimes(1);
    const ultima = db.agentRun.update.mock.calls.at(-1)![0];
    expect(ultima.data.status).toBe("DONE");
    expect(ultima.data.output).toContain("errorDespuesDeEscribir");
  });

  it("si Claude falla, la corrida queda en ERROR (el job la reintenta) y no se escribe nada", async () => {
    claude.create.mockRejectedValue(new Error("overloaded"));
    const r = await leerHechosDeLaReunion("s1", { ahora: AHORA });
    expect(r.estado).toBe("error");
    expect(db.agentRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ERROR" }) }));
    expect(db.hechoDeReunion.createMany).not.toHaveBeenCalled();
  });
});

describe("las corridas, el reintento y el cambio de dueño", () => {
  const corrida = (status: string, clientId: string, minutos = 1) => ({ id: `${status}-${clientId}-${minutos}`, status, clientId, createdAt: new Date(+AHORA - minutos * 60_000), sourceSessionIds: ["s1"] });

  it("estadoDeLasCorridas: por dueño; una RUNNING de más de 15 minutos cuenta como falla", () => {
    const e = estadoDeLasCorridas([corrida("ERROR", "c1"), corrida("RUNNING", "c1", 20), corrida("DONE", "c2")], "c1", AHORA);
    expect(e).toEqual({ leida: false, leyendo: false, fallas: 2 });
    expect(estadoDeLasCorridas([corrida("DONE", "c2")], "c2", AHORA).leida).toBe(true);
  });

  it("el reintento: una que falló para el dueño de hoy se vuelve a leer; con 3 fallas, no", async () => {
    db.agentRun.findMany.mockResolvedValueOnce([corrida("ERROR", "c1")]).mockResolvedValue([corrida("ERROR", "c1")]);
    db.lecturaDeReunion.findUnique.mockResolvedValue({ id: "l1", seguimientoEstado: "lista" });
    const r = await reintentarHechos(2, AHORA);
    expect(r.reintentadas).toEqual(["s1"]);
    expect(claude.create).toHaveBeenCalledTimes(1);

    claude.create.mockClear();
    db.agentRun.findMany.mockResolvedValue([corrida("ERROR", "c1", 1), corrida("ERROR", "c1", 2), corrida("ERROR", "c1", 3)]);
    expect((await reintentarHechos(2, AHORA)).reintentadas).toEqual([]);
    expect(claude.create).not.toHaveBeenCalled();
  });

  it("el reintento: una reunión que cambió de dueño (lista para el anterior) se vuelve a pedir en el nuevo", async () => {
    db.agentRun.findMany.mockResolvedValue([corrida("DONE", "c-viejo")]);
    db.lecturaDeReunion.findUnique.mockResolvedValue({ id: "l1", seguimientoEstado: "lista" });
    expect((await reintentarHechos(2, AHORA)).reintentadas).toEqual(["s1"]);
  });

  it("⛔ el reintento no corre con la bandera apagada", async () => {
    delete process.env.SEGUIMIENTO_HECHOS;
    db.agentRun.findMany.mockResolvedValue([corrida("ERROR", "c1")]);
    expect((await reintentarHechos(2, AHORA)).reintentadas).toEqual([]);
  });

  const fila = (id: string, clientId: string, destinosDelHecho: unknown[]) => ({
    id,
    sessionId: "s1",
    clientId,
    destinos: destinosDelHecho,
    estado: "pendiente",
    decididoPorEmail: null,
    decididoAt: null,
    nota: null,
    updatedAt: new Date(0),
    fechaDeLaReunion: new Date("2026-10-08T12:00:00.000Z"),
    session: { title: "Seguimiento" },
  });

  it("el cambio de dueño desestima los pendientes del dueño anterior, firmado por el sistema", async () => {
    db.hechoDeReunion.findMany.mockResolvedValue([fila("h1", "c-viejo", [{ clave: "ficha", estado: "pendiente" }]), fila("h2", "c-nuevo", [])]);
    expect(await alCambiarDeDueno([{ sessionId: "s1", duenoNuevo: "c-nuevo" }], AHORA)).toBe(1);
    const { where, data } = db.hechoDeReunion.updateMany.mock.calls[0][0];
    expect(where).toMatchObject({ id: "h1" });
    expect(data).toMatchObject({ estado: "desestimado", decididoPorEmail: "sistema", nota: "La reunión cambió de dueño" });
  });

  it("⭐ lo delegado en el cliente anterior se retira: la alerta se cierra, la ficha pierde lo de esa reunión, la etapa se borra", async () => {
    db.hechoDeReunion.findMany.mockResolvedValue([
      fila("h1", "c-viejo", [{ clave: "alerta.queja", estado: "delegado", ref: { tipo: "alerta", id: "alerta-1" } }]),
      fila("h2", "c-viejo", [{ clave: "ficha", estado: "delegado", ref: { tipo: "ficha", campos: ["herramientasActuales"] } }]),
      fila("h3", "c-viejo", [{ clave: "etapa.encuesta", estado: "delegado", ref: { tipo: "etapa", projectId: "p1", stageId: "etapa-2" } }]),
    ]);
    expect(await alCambiarDeDueno([{ sessionId: "s1", duenoNuevo: "c-nuevo" }], AHORA)).toBe(3);
    expect(destinos.retirarReunionDeLaAlerta).toHaveBeenCalledWith(expect.objectContaining({ alertaId: "alerta-1", sessionId: "s1", hechoId: "h1", nota: "La reunión cambió de dueño" }));
    expect(destinos.retirarDeLaFichaLoDeLaReunion).toHaveBeenCalledWith("c-viejo", { title: "Seguimiento", date: new Date("2026-10-08T12:00:00.000Z") });
    expect(destinos.cerrarSugerenciaDeLaReunion).toHaveBeenCalledWith("p1", "s1");
    for (const [{ data }] of db.hechoDeReunion.updateMany.mock.calls) expect(data).toMatchObject({ estado: "desestimado", decididoPorEmail: "sistema" });
  });

  it("⛔ lo que no se pudo retirar sigue delegado y el hecho sigue vivo (INV45 lo muestra)", async () => {
    destinos.retirarReunionDeLaAlerta.mockResolvedValueOnce(false);
    db.hechoDeReunion.findMany.mockResolvedValue([
      fila("h1", "c-viejo", [{ clave: "kickoff.alcance", estado: "pendiente" }, { clave: "alerta.queja", estado: "delegado", ref: { tipo: "alerta", id: "alerta-1" } }]),
    ]);
    expect(await alCambiarDeDueno([{ sessionId: "s1", duenoNuevo: "c-nuevo" }], AHORA)).toBe(1);
    const { data } = db.hechoDeReunion.updateMany.mock.calls[0][0];
    expect(data).toMatchObject({ estado: "pendiente", decididoPorEmail: null });
    expect((data.destinos as { estado: string }[]).map((d) => d.estado)).toEqual(["desestimado", "delegado"]);
  });
});
