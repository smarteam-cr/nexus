/**
 * lib/memoria/cargar.test.ts — el cargador: lo que el alcance no usa ni se pide a la base, las reuniones salen del
 * chokepoint y solo las que ya ocurrieron, y «Lo que la IA ya sabe» son conteos.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
  client: { findUnique: vi.fn() },
  project: { findUnique: vi.fn() },
  canvasBlock: { findMany: vi.fn(), count: vi.fn() },
  projectCanvas: { findFirst: vi.fn() },
  pedidoFueraDeAlcance: { findMany: vi.fn() },
  audit: { findMany: vi.fn() },
  firefliesSession: { findMany: vi.fn() },
  particularidad: { findMany: vi.fn() },
  hitoDeDocumento: { findFirst: vi.fn() },
  sessionMinute: { count: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/cache/session-categories", () => ({ getSessionCategories: vi.fn(async () => []) }));
vi.mock("@/lib/canvas/load-canvas-context", () => ({ ENTREGA_PREVIA_KEYS: ["resumen"], loadCanvasContext: vi.fn(async () => "") }));
const preventa = vi.hoisted(() => ({
  loAprendidoEnLaPreventa: vi.fn(async () => ({ fecha: "2026-08-01T00:00:00.000Z", archivada: false, texto: "PREVENTA-INTERNA" })),
  ultimaPreventa: vi.fn(async () => ({ fecha: "2026-08-01T00:00:00.000Z", archivada: true })),
}));
vi.mock("@/lib/exploraciones/para-la-memoria", () => preventa);
vi.mock("@/lib/handoff/duenio", () => ({ resolverDuenioDelHandoff: vi.fn(async (id: string) => ({ ownerProjectId: id, redirigido: false, hermano: null })) }));
vi.mock("@/lib/handoff/resultados", () => ({ resultadosDelProyecto: vi.fn(async () => null) }));
const tareas = vi.hoisted(() => ({ compromisosAbiertosParaAgentes: vi.fn(async () => [{ titulo: "Enviar la base", venceEl: null, estado: "pendiente", lado: "cliente" }]) }));
vi.mock("@/lib/tareas/para-agentes", () => tareas);
const fuentes = vi.hoisted(() => ({ getProjectMemberSessions: vi.fn() }));
vi.mock("@/lib/sessions/project-sources", () => fuentes);
const hechos = vi.hoisted(() => ({
  hechosParaLaMemoria: vi.fn(async (_clientId: string, projectId: string | null) => [
    { tipo: projectId ? "acuerdo" : "cuenta", tema: projectId ? "pipeline" : null, frase: projectId ? "HECHO-DEL-PROYECTO" : "HECHO-DE-LA-CUENTA", estado: "pendiente", reunion: { titulo: "Seguimiento", fecha: "2026-10-01" } },
  ]),
}));
vi.mock("@/lib/seguimiento/hechos-server", () => hechos);

import { loEsencialDeLaCuenta, memoriaDeLaCuenta, memoriaDelProyecto, queSabeLaIA } from "./cargar";

const AHORA = Date.now();
const sesion = (id: string, dias: number, participants = ["ana@cliente.com", "cse@smarteamcr.com"]) => ({
  id,
  title: `Reunión ${id}`,
  date: AHORA + dias * 86_400_000,
  participants,
});

beforeEach(() => {
  for (const modelo of Object.values(db)) for (const fn of Object.values(modelo)) (fn as ReturnType<typeof vi.fn>).mockReset();
  db.client.findUnique.mockResolvedValue({
    name: "FUNDAUNA",
    ficha: {
      valores: { aQueSeDedica: "Fundación", motivacionCompra: "MOTIVACION" },
      confirmadaAt: "2026-09-27T12:00:00.000Z",
      propuesta: { valores: { dolorPrincipal: "PROPUESTO" }, fuentesPorCampo: { dolorPrincipal: ["Sesión «A» del 1 oct 2026"] }, origenPorCampo: { dolorPrincipal: ["Preventa"] } },
    },
    projects: [{ id: "p1", name: "Service Hub", serviceType: null, status: "active", createdAt: new Date("2026-09-01"), hubspotDealId: "999" }],
  });
  db.canvasBlock.findMany.mockResolvedValue([]);
  db.projectCanvas.findFirst.mockResolvedValue(null);
  db.pedidoFueraDeAlcance.findMany.mockResolvedValue([{ pedido: "Un portal", estado: "CONFIRMADO", quienLoPidio: null, createdAt: new Date(), project: null }]);
  db.audit.findMany.mockResolvedValue([]);
  db.project.findUnique.mockResolvedValue({ name: "Service Hub", handoffGeneratedAt: new Date("2026-09-10T12:00:00.000Z") });
  db.particularidad.findMany.mockResolvedValue([]);
  db.firefliesSession.findMany.mockResolvedValue([]);
  db.canvasBlock.count.mockResolvedValue(3);
  db.hitoDeDocumento.findFirst.mockResolvedValue(null);
  db.sessionMinute.count.mockResolvedValue(2);
  fuentes.getProjectMemberSessions.mockResolvedValue({ sessions: [sesion("s1", -3), sesion("futura", 5), sesion("interna", -2, ["a@smarteamcr.com", "b@smarteamcr.com"])], dropped: [] });
  preventa.loAprendidoEnLaPreventa.mockClear();
  preventa.ultimaPreventa.mockClear();
  hechos.hechosParaLaMemoria.mockClear();
  tareas.compromisosAbiertosParaAgentes.mockClear();
});

describe("memoriaDeLaCuenta", () => {
  it("⛔ para el cliente no pide lo fuera de alcance, la preventa ni la auditoría", async () => {
    const m = await memoriaDeLaCuenta("c1", { lector: "kickoff" });
    expect(db.pedidoFueraDeAlcance.findMany).not.toHaveBeenCalled();
    expect(db.audit.findMany).not.toHaveBeenCalled();
    expect(preventa.loAprendidoEnLaPreventa).not.toHaveBeenCalled();
    expect(m.texto).toContain("Fundación");
    expect(m.texto).not.toContain("MOTIVACION");
    expect(m.texto).not.toContain("PROPUESTO");
    expect(m.texto).not.toContain("999");
  });

  it("interno: todo, con el id de trato", async () => {
    const m = await memoriaDeLaCuenta("c1", { lector: "implementation" });
    expect(m.texto).toContain("MOTIVACION");
    expect(m.texto).toContain("PROPUESTO");
    expect(m.texto).toContain("Un portal");
    expect(m.texto).toContain("PREVENTA-INTERNA");
    expect(m.texto).toContain("trato 999");
  });

  it("⛔ los hechos de las reuniones (etapa 6): solo el alcance interno los pide, por la puerta de los hechos", async () => {
    const cliente = await memoriaDeLaCuenta("c1", { lector: "kickoff" });
    expect(hechos.hechosParaLaMemoria).not.toHaveBeenCalled();
    expect(cliente.texto).not.toContain("HECHO-DE-LA-CUENTA");
    const interno = await memoriaDeLaCuenta("c1", { lector: "implementation" });
    expect(hechos.hechosParaLaMemoria).toHaveBeenCalledWith("c1", null);
    expect(interno.texto).toContain("HECHO-DE-LA-CUENTA (propuesto por la lectura de «Seguimiento» del 2026-10-01, sin revisar)");
  });

  it("la preventa no se lee a sí misma por la memoria, ni lee lo que ella propuso a la ficha", async () => {
    const m = await memoriaDeLaCuenta("c1", { lector: "preventa" });
    expect(preventa.loAprendidoEnLaPreventa).not.toHaveBeenCalled();
    expect(m.texto).not.toContain("PROPUESTO");
  });

  it("sin cliente, vacía; si una lectura falla, sale con lo demás", async () => {
    db.client.findUnique.mockResolvedValueOnce(null);
    expect(await memoriaDeLaCuenta("c1", { lector: "kickoff" })).toEqual({ texto: "", partes: [] });
    db.pedidoFueraDeAlcance.findMany.mockRejectedValueOnce(new Error("sin tabla"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const m = await memoriaDeLaCuenta("c1", { lector: "implementation" });
    expect(m.texto).toContain("Fundación");
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("memoriaDelProyecto", () => {
  it("las reuniones salen del chokepoint, solo las que ya ocurrieron; para el cliente, solo las de con el cliente", async () => {
    await memoriaDelProyecto("p1", { lector: "kickoff" });
    const ids = db.firefliesSession.findMany.mock.calls[0][0].where.id.in;
    expect(ids).toEqual(["s1"]);
    expect(tareas.compromisosAbiertosParaAgentes).not.toHaveBeenCalled();
    // El cliente solo ve lo visible y confirmado.
    expect(db.particularidad.findMany.mock.calls[0][0].where).toMatchObject({ visibleExternal: true, needsValidation: false });
  });

  it("interno: también las de puertas adentro, y los compromisos de Tareas por su puerta", async () => {
    db.firefliesSession.findMany.mockResolvedValue([
      { id: "s1", title: "Reunión s1", date: new Date(AHORA - 3 * 86_400_000), summary: { overview: "Se habló del pipeline." }, minute: null },
    ]);
    const m = await memoriaDelProyecto("p1", { lector: "avance", yaLeidas: [] });
    const ids = db.firefliesSession.findMany.mock.calls[0][0].where.id.in;
    expect(ids).toEqual(["interna", "s1"]);
    expect(tareas.compromisosAbiertosParaAgentes).toHaveBeenCalledWith("p1", 12);
    expect(m.texto).toContain("Se habló del pipeline.");
    expect(m.texto).toContain("Enviar la base (lo prometió el cliente · pendiente)");
  });

  it("⛔ una reunión que el CSE sacó con la X de un documento no vuelve a ESE documento por la memoria", async () => {
    /* La memoria tomaba todas las reuniones del proyecto: los acuerdos de una reunión sacada del kickoff volvían al
       kickoff (y al cuestionario que abre el cliente). La edición que la pone en rojo: leer la membresía sin mirar la
       columna del destino del lector. */
    fuentes.getProjectMemberSessions.mockResolvedValue({
      sessions: [
        { ...sesion("sacada", -4), kickoffOverride: false },
        { ...sesion("s1", -3), kickoffOverride: null },
        { ...sesion("agregada", -2), kickoffOverride: true },
      ],
      dropped: [],
    });
    await memoriaDelProyecto("p1", { lector: "kickoff" });
    expect(db.firefliesSession.findMany.mock.calls[0][0].where.id.in).toEqual(["agregada", "s1"]);
    // Otro lector (sin esa columna) sí la lee: la X es de cada documento.
    db.firefliesSession.findMany.mockClear();
    await memoriaDelProyecto("p1", { lector: "avance" });
    expect(db.firefliesSession.findMany.mock.calls[0][0].where.id.in).toContain("sacada");
  });

  it("para el cliente, también las minutas en borrador, marcadas (la IA como borrador, 2026-10-15)", async () => {
    const minuta = (revisada: boolean, texto: string) => ({ summary: null, decisions: [], agreements: [{ text: texto }], risks: [], status: revisada ? "REVIEWED" : "DRAFT" });
    fuentes.getProjectMemberSessions.mockResolvedValue({ sessions: [sesion("r1", -3), sesion("r2", -2)], dropped: [] });
    db.firefliesSession.findMany.mockResolvedValue([
      { id: "r1", title: "Revisada", date: new Date(AHORA - 3 * 86_400_000), summary: null, minute: minuta(true, "Enviar la base") },
      { id: "r2", title: "Sin revisar", date: new Date(AHORA - 2 * 86_400_000), summary: null, minute: minuta(false, "SECRETO-SIN-REVISAR") },
    ]);
    const m = await memoriaDelProyecto("p1", { lector: "kickoff" });
    expect(m.texto).toContain("Acuerdo: Enviar la base");
    expect(m.texto).toContain("Acuerdo: SECRETO-SIN-REVISAR");
    expect(m.texto).toContain("Sin revisar (minuta en borrador, sin revisar)");
    expect(m.texto).not.toMatch(/Revisada \(minuta en borrador/);
  });

  it("⛔ los hechos del proyecto: solo el alcance interno, con el cliente del proyecto", async () => {
    db.project.findUnique.mockResolvedValue({ name: "Service Hub", clientId: "c1" });
    const cliente = await memoriaDelProyecto("p1", { lector: "kickoff" });
    expect(hechos.hechosParaLaMemoria).not.toHaveBeenCalled();
    expect(cliente.texto).not.toContain("HECHO-DEL-PROYECTO");
    const interno = await memoriaDelProyecto("p1", { lector: "avance" });
    expect(hechos.hechosParaLaMemoria).toHaveBeenCalledWith("c1", "p1");
    expect(interno.texto).toContain("Acuerdo · Pipeline: HECHO-DEL-PROYECTO");
  });

  it("yaLeidas no se piden", async () => {
    await memoriaDelProyecto("p1", { lector: "avance", yaLeidas: ["s1"] });
    expect(db.firefliesSession.findMany.mock.calls[0][0].where.id.in).toEqual(["interna"]);
  });
});

describe("queSabeLaIA", () => {
  it("conteos de la ficha, el handoff y las reuniones con minuta (solo las ocurridas)", async () => {
    db.hitoDeDocumento.findFirst.mockResolvedValue({ tipo: "congelado", createdAt: new Date("2026-09-02T12:00:00.000Z"), motivo: "Al aplicar el cronograma que propone el handoff" });
    const r = await queSabeLaIA("c1", "p1");
    expect(r.ficha).toEqual({ confirmados: 2, propuestos: 1, propuestosPorOrigen: { Preventa: 1 } });
    expect(r.handoff).toEqual({ hay: true, generadoAt: "2026-09-10T12:00:00.000Z", congeladoAt: "2026-09-02T12:00:00.000Z", via: "cronograma" });
    expect(r.preventa).toEqual({ fecha: "2026-08-01T00:00:00.000Z", archivada: true });
    expect(r.reunionesConMinuta).toBe(2);
    expect(db.sessionMinute.count.mock.calls[0][0].where.sessionId.in).toEqual(["s1", "interna"]);
  });

  it("en la preventa (sin proyecto): solo la ficha", async () => {
    const r = await queSabeLaIA("c1", null);
    expect(r.handoff).toBeNull();
    expect(r.reunionesConMinuta).toBeNull();
    expect(r.preventa).toBeNull();
    expect(preventa.ultimaPreventa).not.toHaveBeenCalled();
  });
});

describe("loEsencialDeLaCuenta (el pase de cuenta)", () => {
  it("interno: los compromisos de los proyectos activos (por la puerta de Tareas) y lo fuera de alcance abierto", async () => {
    const s = await loEsencialDeLaCuenta("c1", { lector: "pase-de-cuenta" });
    expect(db.client.findUnique.mock.calls[0][0].select.projects.where).toMatchObject({ status: "active" });
    expect(tareas.compromisosAbiertosParaAgentes).toHaveBeenCalledWith("p1", 6);
    expect(s.map((x) => x.titulo)).toEqual(["Información del cliente (confirmada)", "Compromisos abiertos", "Pedidos fuera de alcance abiertos"]);
  });

  it("sin cliente, vacío", async () => {
    db.client.findUnique.mockResolvedValueOnce(null);
    expect(await loEsencialDeLaCuenta("c1", { lector: "pase-de-cuenta" })).toEqual([]);
  });
});
