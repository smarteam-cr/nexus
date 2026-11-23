/**
 * lib/sessions/lecturas-con-guarda.int.test.ts — LAS CUATRO LECTURAS DE REUNIONES QUE NO MIRABAN EL CLIENTE (2026-11-23,
 * docs/evaluacion-de-nexus-2026-11.md §3.1), contra una base REAL.
 *
 * Correr: `npx vitest run --project integration lib/sessions/lecturas-con-guarda.int.test.ts` (con `npm run db:local -- up`).
 *
 * El acceso corre de verdad (`requireAccessToClient` con sus filas: la asignación, el rol, la matriz por defecto); el
 * único doble es QUIÉN llama (la sesión de Supabase) y lo que saldría de la casa: Drive, y la llamada a Claude, que se
 * reemplaza por una que anota lo que habría recibido. Cada caso falla con el código de antes del arreglo:
 *   · «enrich» y «summarize» servían la reunión de cualquier cliente a quien tuviera sesión;
 *   · la propuesta comercial sumaba por dominio reuniones sin dueño, y los vínculos a mano a reuniones sin dueño;
 *   · el análisis de Ventas mandaba a Claude las reuniones sin empresa, junto con las de la empresa o solas.
 * Y dos que encontró la revisión: una agendada con Ventas llegaba a la generación de la propuesta, y «Volver a buscar en
 * Drive» llamaba a Claude sin decir a nombre de quién.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamMember, TeamRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

/* Quién llama. `null` = sin sesión. */
const sesion = vi.hoisted(() => ({ tm: null as null | { id: string; email: string; roleEnum: string } }));
vi.mock("@/lib/auth/supabase", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth/supabase")>();
  const usuario = () => {
    if (!sesion.tm) throw new real.UnauthorizedError();
    return { id: `user-${sesion.tm.id}`, email: sesion.tm.email, kind: "INTERNAL", teamMember: sesion.tm };
  };
  return {
    ...real,
    requireUser: async () => usuario(),
    requireInternalUser: async () => {
      const user = usuario();
      return { user, teamMember: user.teamMember, role: user.teamMember.roleEnum };
    },
  };
});

/* Lo que saldría de la casa. */
const afuera = vi.hoisted(() => ({
  drive: vi.fn(async () => false),
  resumen: vi.fn(),
  claude: vi.fn(),
}));
vi.mock("@/lib/google/meet-enrichment", () => ({ enrichSingleSession: afuera.drive }));
vi.mock("@/lib/ai/summarize-session", () => ({ summarizeTranscript: afuera.resumen }));
vi.mock("@/lib/anthropic", () => ({ anthropic: { messages: { create: afuera.claude } } }));

import { prisma } from "@/lib/db/prisma";
import { contextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { loadBcFeeding } from "@/lib/business-cases/feeding";
import { POST as enrich } from "@/app/api/sessions/[id]/enrich/route";
import { POST as summarize } from "@/app/api/sessions/[id]/summarize/route";
import { POST as analizarVentas } from "@/app/api/sales/analyze/route";
import { POST as atarAPropuesta } from "@/app/api/business-cases/[id]/sessions/route";

const AYER = new Date(Date.now() - 24 * 60 * 60 * 1000);
const MANANA = new Date(Date.now() + 24 * 60 * 60 * 1000);
const VENDEDORA = "vendedora@smarteamcr.com";
/** Un texto largo: la transcripción de una reunión de verdad pasa los pisos de «tiene texto». */
const texto = (marca: string) => `${marca} `.repeat(80);

let serie = 0;
async function persona(roleEnum: TeamRole, extra: Partial<Pick<TeamMember, "email" | "area">> = {}) {
  return prisma.teamMember.create({ data: { name: `Persona ${++serie}`, email: `p${serie}@smarteamcr.com`, roleEnum, ...extra } });
}
function entrar(tm: { id: string; email: string; roleEnum: string } | null) {
  sesion.tm = tm;
}
async function reunion(id: string, o: { dueno?: string | null; gente?: string[]; marca?: string; date?: Date } = {}) {
  return prisma.firefliesSession.create({
    data: {
      id,
      title: `Reunión ${id}`,
      date: o.date ?? AYER,
      participants: o.gente ?? ["cse@smarteamcr.com"],
      transcript: texto(o.marca ?? `TEXTO-${id}`),
      resolvedClientId: o.dueno ?? null,
    },
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (body?: unknown) =>
  new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

/** Dos empresas y una CSE que tiene acceso solo a la primera (por asignación: el acceso corre de verdad). */
async function dosEmpresas() {
  const a = await prisma.client.create({ data: { name: "Empresa A (test)", emailDomains: ["empresa-a.com"] } });
  const b = await prisma.client.create({ data: { name: "Empresa B (test)", emailDomains: ["empresa-b.com"] } });
  const cse = await persona("CSE");
  const admin = await persona("SUPER_ADMIN");
  await prisma.clientAssignment.create({ data: { clientId: a.id, teamMemberId: cse.id, kind: "GRANT", grantedById: admin.id } });
  return { a, b, cse };
}

beforeEach(() => {
  entrar(null);
  afuera.drive.mockClear();
  afuera.resumen.mockReset();
  afuera.claude.mockReset();
});

describe("⛔ «enrich» y «summarize»: solo quien puede abrir la reunión", () => {
  it("una reunión de un cliente que no ves: 404, y ni se busca en Drive ni va a Claude", async () => {
    const { b, cse } = await dosEmpresas();
    await reunion("de-b", { dueno: b.id });
    entrar(cse);

    const r1 = await enrich(post(), params("de-b"));
    expect(r1.status).toBe(404);
    expect(await r1.json(), "sin la transcripción en la respuesta").not.toHaveProperty("transcript");
    expect(afuera.drive).not.toHaveBeenCalled();

    const r2 = await summarize(post(), params("de-b"));
    expect(r2.status).toBe(404);
    expect(afuera.resumen).not.toHaveBeenCalled();
    expect((await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "de-b" } })).summary).toBeNull();
  });

  it("el 404 dice lo mismo que el de una reunión que no existe", async () => {
    const { b, cse } = await dosEmpresas();
    await reunion("de-b", { dueno: b.id });
    entrar(cse);
    const ajena = await (await enrich(post(), params("de-b"))).json();
    const noExiste = await (await enrich(post(), params("no-existe"))).json();
    expect(ajena).toEqual(noExiste);
  });

  it("con acceso: responde, y lo que llame a Claude se cobra a quien lo pidió y al cliente (no como lectura de la reunión)", async () => {
    const { a, cse } = await dosEmpresas();
    await reunion("de-a", { dueno: a.id });
    entrar(cse);

    let ctxDrive: ReturnType<typeof contextoDeIA>;
    afuera.drive.mockImplementationOnce(async () => {
      ctxDrive = contextoDeIA();
      return false;
    });
    const r1 = await enrich(post(), params("de-a"));
    expect(r1.status).toBe(200);
    expect((await r1.json()).transcript).toContain("TEXTO-de-a");
    expect(afuera.drive).toHaveBeenCalledWith("de-a");
    expect(ctxDrive!).toMatchObject({ origen: "sessions/enrich", clientId: a.id, triggeredByEmail: cse.email });

    let ctx: ReturnType<typeof contextoDeIA>;
    afuera.resumen.mockImplementation(async () => {
      ctx = contextoDeIA();
      return { overview: "Resumen", sections: [], keywords: [], action_items: [] };
    });
    const r2 = await summarize(post(), params("de-a"));
    expect(r2.status).toBe(200);
    expect(ctx!).toMatchObject({ origen: "sessions/summarize", clientId: a.id, triggeredByEmail: cse.email });
    expect(ctx!.reunionId, "un resumen a mano no cuenta como «reunión leída» en Gasto de la IA").toBeUndefined();
    expect((await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "de-a" } })).summary).toMatchObject({ overview: "Resumen" });
  });

  it("una reunión sin dueño la abre cualquier interno, como en /sessions; sin sesión, 401", async () => {
    const { cse } = await dosEmpresas();
    await reunion("sin-dueno");
    entrar(cse);
    expect((await enrich(post(), params("sin-dueno"))).status).toBe(200);
    entrar(null);
    expect((await enrich(post(), params("sin-dueno"))).status).toBe(401);
    expect((await summarize(post(), params("sin-dueno"))).status).toBe(401);
  });
});

describe("⛔ la propuesta comercial lee sus reuniones por el lugar único", () => {
  async function propuesta() {
    const { a, b } = await dosEmpresas();
    await persona("VENTAS", { email: VENDEDORA, area: "Ventas" });
    const bc = await prisma.businessCase.create({ data: { clientId: a.id, name: "Propuesta", slug: "propuesta-a", createdByEmail: VENDEDORA } });
    return { a, b, bc };
  }
  const ids = (r: Awaited<ReturnType<typeof loadBcFeeding>>) => ({
    incluidas: r!.included.map((s) => s.sessionId).sort(),
    candidatas: r!.candidates.map((s) => s.sessionId).sort(),
  });

  it("una reunión sin dueño con gente del dominio de la empresa no entra (antes entraba por dominio, preseleccionada)", async () => {
    const { a, bc } = await propuesta();
    await reunion("de-a", { dueno: a.id, gente: [VENDEDORA, "ana@empresa-a.com"] });
    await reunion("sin-dueno", { gente: [VENDEDORA, "beto@empresa-a.com"] });
    const r = ids(await loadBcFeeding(bc.id));
    expect(r.incluidas).toEqual(["de-a"]);
    expect(r.candidatas).not.toContain("sin-dueno");
  });

  it("un vínculo a mano a una reunión sin dueño, o de otra empresa, no entra", async () => {
    const { b, bc } = await propuesta();
    await reunion("sin-dueno");
    await reunion("de-b", { dueno: b.id });
    await prisma.businessCaseSession.createMany({
      data: [
        { businessCaseId: bc.id, sessionId: "sin-dueno", included: true },
        { businessCaseId: bc.id, sessionId: "de-b", included: true },
      ],
    });
    const r = await loadBcFeeding(bc.id);
    expect(r!.feedingIds).toEqual([]);
    expect(ids(r).candidatas).toEqual([]);
  });

  it("lo que sí es de la empresa sigue igual: con Ventas se preselecciona, sin Ventas es candidata, la agendada se ve", async () => {
    const { a, bc } = await propuesta();
    await reunion("con-ventas", { dueno: a.id, gente: [VENDEDORA, "ana@empresa-a.com"] });
    await reunion("sin-ventas", { dueno: a.id, gente: ["cse@smarteamcr.com", "ana@empresa-a.com"] });
    await reunion("agendada", { dueno: a.id, gente: ["cse@smarteamcr.com"], date: MANANA });
    const r = ids(await loadBcFeeding(bc.id));
    expect(r.incluidas).toEqual(["con-ventas"]);
    expect(r.candidatas).toEqual(["agendada", "sin-ventas"]);
  });

  it("una agendada con Ventas se ve incluida, pero su texto no va a la generación (puede ser un evento movido al futuro)", async () => {
    const { a, bc } = await propuesta();
    await reunion("ya-paso", { dueno: a.id, gente: [VENDEDORA, "ana@empresa-a.com"] });
    await reunion("movida-al-futuro", { dueno: a.id, gente: [VENDEDORA, "ana@empresa-a.com"], date: MANANA });
    const r = await loadBcFeeding(bc.id);
    expect(ids(r).incluidas).toEqual(["movida-al-futuro", "ya-paso"]);
    expect(r!.feedingIds).toEqual(["ya-paso"]);
  });

  it("⛔ no se puede atar a la propuesta una reunión sin dueño (sería un «Agregar» que no agrega)", async () => {
    const { a, bc } = await propuesta();
    await reunion("sin-dueno");
    await reunion("de-a", { dueno: a.id });
    entrar(await prisma.teamMember.findUniqueOrThrow({ where: { email: VENDEDORA } }));
    const r = await atarAPropuesta(post({ sessionId: "sin-dueno", included: true }) as never, params(bc.id));
    expect(r.status).toBe(403);
    expect((await r.json()).error).toContain("todavía no tiene empresa");
    expect(await prisma.businessCaseSession.count()).toBe(0);
    /* La de la empresa, sí; y sacar una sin dueño (included=false) se deja pasar. */
    expect((await atarAPropuesta(post({ sessionId: "de-a", included: true }) as never, params(bc.id))).status).toBe(200);
    expect((await atarAPropuesta(post({ sessionId: "sin-dueno", included: false }) as never, params(bc.id))).status).toBe(200);
  });
});

describe("⛔ el análisis de Ventas: un análisis, una empresa, y sin las reuniones sin empresa", () => {
  const RESPUESTA = { content: [{ type: "text", text: JSON.stringify({ cards: [{ title: "Estado actual", content: "x" }], pendingItems: [] }) }] };
  let prompt = "";
  beforeEach(() => {
    prompt = "";
    afuera.claude.mockImplementation(async (args: { messages: { content: string }[] }) => {
      prompt = args.messages.map((m) => m.content).join("\n");
      return RESPUESTA;
    });
  });
  async function vendedora() {
    const tm = await persona("VENTAS", { email: VENDEDORA, area: "Ventas" });
    entrar(tm);
    return tm;
  }

  it("al prompt van solo las de la empresa; las sin empresa no entran y se cuentan", async () => {
    const { a } = await dosEmpresas();
    await vendedora();
    await reunion("de-a", { dueno: a.id, marca: "TEXTO-EMPRESA" });
    await reunion("sin-dueno", { marca: "TEXTO-SIN-EMPRESA" });
    const r = await analizarVentas(post({ sessionIds: ["de-a", "sin-dueno"] }) as never, { params: Promise.resolve({}) } as never);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ analizadas: 1, afuera: 0, sinEmpresa: 1 });
    expect(prompt).toContain("TEXTO-EMPRESA");
    expect(prompt).not.toContain("TEXTO-SIN-EMPRESA");
  });

  it("un grupo de puras reuniones sin empresa: 409 con el motivo, y Claude no recibe nada", async () => {
    await dosEmpresas();
    await vendedora();
    await reunion("sin-1", { marca: "PROSPECTO-UNO" });
    await reunion("sin-2", { marca: "PROSPECTO-DOS" });
    const r = await analizarVentas(post({ sessionIds: ["sin-1", "sin-2"] }) as never, { params: Promise.resolve({}) } as never);
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ sinEmpresa: 2 });
    expect(afuera.claude).not.toHaveBeenCalled();
    expect(await prisma.agent.count(), "un pedido rechazado no re-siembra el prompt del agente").toBe(0);
  });

  it("lo de antes sigue: con dos empresas se analiza la que tiene más reuniones y la otra queda afuera", async () => {
    const { a, b } = await dosEmpresas();
    await vendedora();
    await reunion("a-1", { dueno: a.id, marca: "TEXTO-A-UNO" });
    await reunion("a-2", { dueno: a.id, marca: "TEXTO-A-DOS" });
    await reunion("b-1", { dueno: b.id, marca: "TEXTO-B" });
    const r = await analizarVentas(post({ sessionIds: ["a-1", "a-2", "b-1"] }) as never, { params: Promise.resolve({}) } as never);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ analizadas: 2, afuera: 1, sinEmpresa: 0 });
    expect(prompt).toContain("TEXTO-A-UNO");
    expect(prompt).not.toContain("TEXTO-B");
  });
});
