import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { syncGoogleMeetSessions } from "./meet-sync";

/**
 * lib/google/meet-sync.test.ts — la sync de Meet de punta a punta, con Google y la base de mentira.
 *
 * Incidente 2026-09-21 (821 % de CPU, producción sin atender): cada corrida hacía un UPDATE por
 * reunión Y por calendario donde aparecía (15.011 sobre 6.176 reuniones) y cada uno devolvía la fila
 * entera con transcripción. `meet-sync-cambios.test.ts` prueba la REGLA; esto prueba que la corrida
 * la aplique: una reunión una vez aunque venga en varios calendarios, ningún UPDATE si nada cambió,
 * nunca la fila entera de vuelta, una sola corrida a la vez, y que no se pierda ningún dato real
 * (el Doc de Gemini que llega tarde en una sola copia, la reunión movida, el asistente nuevo, la
 * reunión cancelada).
 */

type FilaFalsa = {
  id: string;
  title: string;
  date: Date;
  duration: number;
  participants: string[];
  googleEventId: string | null;
  googleDocId: string | null;
  organizerEmail: string | null;
  source: string;
  manualClientId: string | null;
  resolvedClientId: string | null;
};
type Escritura = { tipo: "update" | "upsert"; id: string; data: Record<string, unknown>; select: unknown };

const h = vi.hoisted(() => ({
  usuarios: [] as Array<{ email: string; name: string }>,
  /** Lo que devuelve el calendario de cada usuario. */
  calendarios: new Map<string, unknown[]>(),
  filas: [] as FilaFalsa[],
  selects: [] as Array<Record<string, boolean>>,
  leidas: [] as string[],
  escrituras: [] as Escritura[],
  listados: 0,
}));

vi.mock("googleapis", () => ({
  google: {
    calendar: ({ auth }: { auth: { email: string } }) => ({
      events: {
        list: async () => {
          await new Promise<void>((r) => setImmediate(r));
          return { data: { items: h.calendarios.get(auth.email) ?? [], nextPageToken: null } };
        },
      },
    }),
  },
}));

vi.mock("@/lib/google/auth", () => ({
  getImpersonatedAuth: (email: string) => ({ email }),
  listDomainUsers: async () => {
    h.listados++;
    await new Promise<void>((r) => setImmediate(r));
    return h.usuarios;
  },
}));

vi.mock("@/lib/sessions/resolve-client", () => ({
  buildCategorizeCtx: async () => ({}),
  resolveSessionClientId: () => "cli_acme",
}));

vi.mock("@/lib/db/prisma", () => {
  /** Todos los strings de un `where`: los ids y eventIds que se pidieron (sin atarse a su forma). */
  const buscados = (v: unknown, acc: Set<string>): Set<string> => {
    if (typeof v === "string") acc.add(v);
    else if (Array.isArray(v)) for (const x of v) buscados(x, acc);
    else if (v && typeof v === "object") for (const x of Object.values(v)) buscados(x, acc);
    return acc;
  };
  return {
    prisma: {
      firefliesSession: {
        findMany: async (args: { where: unknown; select: Record<string, boolean> }) => {
          h.selects.push(args.select);
          const pedidos = buscados(args.where, new Set<string>());
          const filas = h.filas.filter(
            (f) =>
              (f.source === "google_meet" || f.id.startsWith("gmeet_")) &&
              (pedidos.has(f.id) || (f.googleEventId !== null && pedidos.has(f.googleEventId))),
          );
          h.leidas.push(...filas.map((f) => f.id));
          return filas.map((f) => ({ ...f, participants: [...f.participants] }));
        },
        update: async (args: { where: { id: string }; data: Record<string, unknown>; select?: unknown }) => {
          h.escrituras.push({ tipo: "update", id: args.where.id, data: args.data, select: args.select });
          return { id: args.where.id };
        },
        upsert: async (args: { where: { id: string }; create: Record<string, unknown>; select?: unknown }) => {
          h.escrituras.push({ tipo: "upsert", id: args.where.id, data: args.create, select: args.select });
          return { id: args.where.id };
        },
      },
    },
  };
});

const DIA = 24 * 60 * 60 * 1000;
const HACE_3_DIAS = new Date(Date.now() - 3 * DIA);
const ANA = "ana@acme.com";
const LUIS = "luis@acme.com";
const ELI = "eli@smarteamcr.com";
const PAU = "pau@smarteamcr.com";
const MAR = "mar@smarteamcr.com";

/** Un evento de Meet tal como lo devuelve el calendario de un usuario. */
function item(
  eventId: string,
  o: { titulo?: string; inicio?: Date; minutos?: number; asistentes?: string[]; organizador?: string; doc?: string } = {},
) {
  const inicio = o.inicio ?? HACE_3_DIAS;
  return {
    id: eventId,
    summary: o.titulo ?? "Kickoff | ACME & Smarteam",
    start: { dateTime: inicio.toISOString() },
    end: { dateTime: new Date(inicio.getTime() + (o.minutos ?? 60) * 60_000).toISOString() },
    attendees: (o.asistentes ?? [ANA, ELI]).map((email) => ({ email })),
    organizer: { email: o.organizador ?? ELI },
    conferenceData: { conferenceSolution: { key: { type: "hangoutsMeet" } } },
    attachments: o.doc ? [{ fileId: o.doc, mimeType: "application/vnd.google-apps.document" }] : [],
  };
}

/** La fila que dejó la corrida anterior para `item(eventId)`. */
function fila(eventId: string, extra: Partial<FilaFalsa> = {}): FilaFalsa {
  return {
    id: `gmeet_${eventId}`,
    title: "Kickoff | ACME & Smarteam",
    date: HACE_3_DIAS,
    duration: 60,
    participants: [ANA, ELI],
    googleEventId: eventId,
    googleDocId: null,
    organizerEmail: ELI,
    source: "google_meet",
    manualClientId: null,
    resolvedClientId: "cli_acme",
    ...extra,
  };
}

/** Los calendarios de cada usuario interno. */
function calendarios(porUsuario: Record<string, unknown[]>) {
  h.usuarios = Object.keys(porUsuario).map((email) => ({ email, name: email }));
  h.calendarios = new Map(Object.entries(porUsuario));
}

const correr = () => syncGoogleMeetSessions({ daysBack: 30 });

const ENV_PREVIO = { admin: process.env.GOOGLE_ADMIN_EMAIL, key: process.env.GOOGLE_SERVICE_ACCOUNT_KEY };

beforeEach(() => {
  process.env.GOOGLE_ADMIN_EMAIL = "admin@smarteamcr.com";
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY = "{}";
  h.filas = [];
  h.selects = [];
  h.leidas = [];
  h.escrituras = [];
  h.listados = 0;
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  if (ENV_PREVIO.admin === undefined) delete process.env.GOOGLE_ADMIN_EMAIL;
  else process.env.GOOGLE_ADMIN_EMAIL = ENV_PREVIO.admin;
  if (ENV_PREVIO.key === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  else process.env.GOOGLE_SERVICE_ACCOUNT_KEY = ENV_PREVIO.key;
});

describe("una reunión UNA vez por corrida, y ningún UPDATE si nada cambió", () => {
  it("LA guarda: la misma reunión en 3 calendarios, igual a lo guardado → ninguna escritura", async () => {
    /* La edición que la pone en rojo: volver al UPDATE incondicional, o escribir una vez por
       calendario (lo que hacía el código del incidente: 15.011 UPDATE por corrida). */
    calendarios({ [ELI]: [item("ev1")], [PAU]: [item("ev1")], [MAR]: [item("ev1")] });
    h.filas = [fila("ev1")];
    const r = await correr();
    expect(h.escrituras).toEqual([]);
    expect(r).toMatchObject({ synced: 0, alreadyExisted: 1, actualizadas: 0, apariciones: 3 });
  });

  it("cada calendario ve asistentes distintos: si la UNIÓN es lo guardado, no se escribe", async () => {
    /* Invitados que no se ven entre sí: cada copia trae solo una parte. Antes la última copia pisaba
       a las demás y la lista cambiaba en cada corrida. */
    calendarios({ [ELI]: [item("ev1", { asistentes: [ANA, ELI] })], [PAU]: [item("ev1", { asistentes: [LUIS, ELI] })] });
    h.filas = [fila("ev1", { participants: [LUIS, ELI, ANA] })];
    await correr();
    expect(h.escrituras).toEqual([]);
  });

  it("una reunión nueva en 2 calendarios → UN solo upsert, con los asistentes de las dos copias", async () => {
    calendarios({ [ELI]: [item("ev9", { asistentes: [ANA, ELI] })], [PAU]: [item("ev9", { asistentes: [LUIS, PAU] })] });
    const r = await correr();
    expect(h.escrituras).toHaveLength(1);
    expect(h.escrituras[0]).toMatchObject({ tipo: "upsert", id: "gmeet_ev9", data: { googleEventId: "ev9", resolvedClientId: "cli_acme" } });
    expect(new Set(h.escrituras[0]?.data.participants as string[])).toEqual(new Set([ANA, ELI, LUIS, PAU]));
    expect(r).toMatchObject({ synced: 1, alreadyExisted: 0, apariciones: 2 });
  });
});

describe("⛔ no se pierde ningún dato real", () => {
  it("el Doc de Gemini que llega tarde en UNA sola copia se escribe, con el reinicio del enriquecimiento", async () => {
    /* La edición que la pone en rojo: que la copia sin Doc pise a la que lo trae (antes: el Doc se
       escribía y se borraba en la misma corrida, y se «descubría» de nuevo en la siguiente). */
    calendarios({ [ELI]: [item("ev1")], [PAU]: [item("ev1", { doc: "gemini1" })], [MAR]: [item("ev1")] });
    h.filas = [fila("ev1")];
    await correr();
    expect(h.escrituras).toEqual([
      {
        tipo: "update",
        id: "gmeet_ev1",
        data: { googleDocId: "gemini1", enrichedAt: null, enrichAttempts: 0, enrichError: null },
        select: { id: true },
      },
    ]);
  });

  it("si Google ya no trae el Doc, el guardado se queda (ninguna escritura)", async () => {
    calendarios({ [ELI]: [item("ev1")] });
    h.filas = [fila("ev1", { googleDocId: "gemini1" })];
    await correr();
    expect(h.escrituras).toEqual([]);
  });

  it("la reunión movida escribe fecha y duración, y nada más", async () => {
    const nueva = new Date(HACE_3_DIAS.getTime() + DIA);
    calendarios({ [ELI]: [item("ev1", { inicio: nueva, minutos: 90 })], [PAU]: [item("ev1", { inicio: nueva, minutos: 90 })] });
    h.filas = [fila("ev1")];
    await correr();
    expect(h.escrituras).toEqual([{ tipo: "update", id: "gmeet_ev1", data: { date: nueva, duration: 90 }, select: { id: true } }]);
  });

  it("un asistente nuevo escribe la lista completa", async () => {
    calendarios({ [ELI]: [item("ev1", { asistentes: [ANA, ELI, LUIS] })] });
    h.filas = [fila("ev1")];
    await correr();
    expect(h.escrituras).toHaveLength(1);
    expect(new Set(h.escrituras[0]?.data.participants as string[])).toEqual(new Set([ANA, ELI, LUIS]));
    expect(Object.keys(h.escrituras[0]?.data ?? {})).toEqual(["participants"]);
  });

  it("la reunión cancelada (Google ya no la trae) no se lee ni se toca: la fila queda como estaba", async () => {
    /* Igual que antes del 2026-09-21: la sync nunca borra. Lo nuevo es que ni la lee. */
    calendarios({ [ELI]: [item("ev1")] });
    h.filas = [fila("ev1"), fila("ev2", { title: "Demo cancelada" })];
    await correr();
    expect(h.escrituras).toEqual([]);
    expect(h.leidas).toEqual(["gmeet_ev1"]);
  });

  it("una fila previa al refactor (sin googleEventId) se encuentra y se sana, no se duplica", async () => {
    calendarios({ [ELI]: [item("ev1")] });
    h.filas = [fila("ev1", { googleEventId: null, source: "fireflies", manualClientId: "cli_manual" })];
    await correr();
    expect(h.escrituras).toEqual([
      { tipo: "update", id: "gmeet_ev1", data: { googleEventId: "ev1", source: "google_meet" }, select: { id: true } },
    ]);
  });
});

describe("memoria y concurrencia", () => {
  it("la lectura trae solo las columnas que deciden: ni transcripción ni resumen", async () => {
    calendarios({ [ELI]: [item("ev1")] });
    h.filas = [fila("ev1")];
    await correr();
    expect(h.selects.length).toBeGreaterThan(0);
    for (const select of h.selects) {
      expect(select).not.toHaveProperty("transcript");
      expect(select).not.toHaveProperty("summary");
    }
  });

  it("toda escritura pide `select: { id: true }` (sin él vuelve la fila entera)", async () => {
    calendarios({ [ELI]: [item("ev1", { titulo: "Otro título" }), item("ev2")] });
    h.filas = [fila("ev1")];
    await correr();
    expect(h.escrituras.map((e) => e.tipo).sort()).toEqual(["update", "upsert"]);
    for (const e of h.escrituras) expect(e.select, `${e.tipo} ${e.id}`).toEqual({ id: true });
  });

  it("dos pedidos a la vez → una sola corrida: el segundo recibe la que está en vuelo", async () => {
    /* La edición que la pone en rojo: sacar `corridaEnVuelo` (el botón «Sincronizar» arrancaba una
       segunda corrida en paralelo con el auto-sync). */
    calendarios({ [ELI]: [item("ev9")] });
    const [a, b] = await Promise.all([correr(), correr()]);
    expect(h.listados).toBe(1);
    expect(b).toBe(a);
    expect(h.escrituras).toHaveLength(1);
    // Terminada, la siguiente sí corre.
    await correr();
    expect(h.listados).toBe(2);
  });
});

describe("candado por fuente: el enriquecimiento tampoco pide la fila entera", () => {
  /** El código sin comentarios, para que un paréntesis en un comentario no rompa el conteo. */
  const fuente = (rel: string): string =>
    fs
      .readFileSync(path.join(process.cwd(), rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(/\r?\n/)
      .filter((l) => !l.trimStart().startsWith("//"))
      .join("\n");

  /** Los argumentos de cada llamada que empieza con `patron` (hasta su paréntesis de cierre). */
  function argumentos(src: string, patron: RegExp): string[] {
    const out: string[] = [];
    for (const m of src.matchAll(patron)) {
      const desde = (m.index ?? 0) + m[0].length;
      let i = desde;
      let prof = 1;
      while (i < src.length && prof > 0) {
        if (src[i] === "(") prof++;
        else if (src[i] === ")") prof--;
        i++;
      }
      out.push(src.slice(desde, i - 1));
    }
    return out;
  }

  it("cada firefliesSession.update/upsert de la sync y del enriquecimiento lleva `select: { id: true }`", () => {
    /* Sin `select`, Prisma devuelve la fila entera con transcripción y resumen por cada escritura:
       ~221 MB armados por corrida para tirarlos (incidente 2026-09-21). */
    for (const archivo of ["lib/google/meet-sync.ts", "lib/google/meet-enrichment.ts"]) {
      const llamadas = argumentos(fuente(archivo), /firefliesSession\.(?:update|upsert)\(/g);
      expect(llamadas.length, `${archivo}: la guarda no está mirando nada`).toBeGreaterThan(0);
      for (const args of llamadas) expect(args, `${archivo}: una escritura sin select`).toMatch(/select:\s*\{\s*id:\s*true\s*\}/);
    }
  });
});
