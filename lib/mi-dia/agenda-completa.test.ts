/**
 * La agenda de «Para ti» es la de Google Calendar (2026-10-19). Elías comparó la semana de un vendedor en Google
 * Calendar con la de Nexus: faltaban los eventos sin otros invitados («Tenis», «Cita Médica», «Preparar demo…») y
 * Nexus sugería espacio libre encima; la sugerencia de una tarea de una hora ocupaba cuatro; y al entrar se abría sola
 * la reunión más cercana.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { asistenciaPropia, deTodoElDiaEn, eventosDeTodoElDia, eventosPropios, ocupadoDelCalendario, ocupaSuTiempo, agendaDelDia } from "./agenda";
import { almuerzoSupuesto, bloquesSugeridos, espaciosLibres, grillaDelDia, ocupadoDeLaAgenda, primerHuecoLaboral, type TareaParaUnHueco } from "./inicio";

const JUEVES = "2026-10-22";
/** Una hora de Costa Rica (UTC-6) del jueves 22, en UTC. */
const cr = (hhmm: string, dia = JUEVES) => new Date(`${dia}T${hhmm}:00-06:00`).toISOString();
const YO = "andres@smarteamcr.com";

type Ev = Parameters<typeof eventosPropios>[0][number];
const solo = (id: string, titulo: string, desde: string, hasta: string, extra: Partial<Ev> = {}): Ev => ({
  id,
  summary: titulo,
  start: { dateTime: cr(desde) },
  end: { dateTime: cr(hasta) },
  eventType: "default",
  ...extra,
});
const reunion = (id: string, titulo: string, desde: string, hasta: string, yo: Record<string, unknown> = { responseStatus: "accepted" }): Ev => ({
  ...solo(id, titulo, desde, hasta),
  attendees: [{ email: YO, self: true, ...yo }, { email: "luis@cliente.com" }],
  organizer: { email: YO },
});

// La semana del jueves 22, como la tenía el vendedor en Google Calendar (los títulos personales, cambiados).
const JUEVES_DEL_CALENDARIO: Ev[] = [
  { id: "casa", summary: "Home", start: { date: JUEVES }, end: { date: "2026-10-23" }, eventType: "workingLocation", transparency: "transparent" },
  { id: "aniv", summary: "Aniversario de la empresa", start: { date: JUEVES }, end: { date: "2026-10-23" }, transparency: "transparent" },
  solo("deporte", "Deporte", "06:00", "07:30"),
  reunion("casamax", "Casamax: Comenzando el camino", "08:30", "09:30"),
  reunion("monge", "Grupo Monge: Comenzando el camino", "11:00", "12:00"),
  solo("medico", "Cita médica", "13:00", "14:30"),
  reunion("rechazada", "Algo que rechazó", "15:00", "16:00", { responseStatus: "declined" }),
  reunion("smarketing", "SMARKETING", "16:00", "17:00"),
];

describe("qué es cada evento del calendario", () => {
  it("los eventos sin otros invitados se ven y ocupan; la ubicación de trabajo, lo de todo el día y lo rechazado no ocupan", () => {
    const propios = eventosPropios(JUEVES_DEL_CALENDARIO);
    expect(propios.map((p) => p.titulo)).toEqual(["Deporte", "Cita médica"]);
    expect(propios.every((p) => p.ocupa)).toBe(true);
    const ocupado = ocupadoDelCalendario(JUEVES_DEL_CALENDARIO).map((o) => o.id);
    expect(ocupado).toEqual(["deporte", "casamax", "monge", "medico", "smarketing"]);
    expect(ocupado).not.toContain("casa");
    expect(ocupado).not.toContain("aniv");
    expect(ocupado).not.toContain("rechazada");
  });

  it("lo de todo el día va aparte, sin la ubicación de trabajo", () => {
    const todo = eventosDeTodoElDia(JUEVES_DEL_CALENDARIO);
    expect(todo.map((t) => t.titulo)).toEqual(["Aniversario de la empresa"]);
    expect(deTodoElDiaEn(todo, JUEVES)).toHaveLength(1);
    expect(deTodoElDiaEn(todo, "2026-10-23")).toHaveLength(0);
  });

  it("«quizás» y opcional igual ocupan; «disponible» se ve pero no ocupa", () => {
    expect(asistenciaPropia(reunion("q", "Q", "09:00", "10:00", { responseStatus: "tentative" }))).toBe("quizas");
    expect(asistenciaPropia(reunion("o", "O", "09:00", "10:00", { responseStatus: "needsAction", optional: true }))).toBe("opcional");
    expect(ocupaSuTiempo(reunion("q", "Q", "09:00", "10:00", { responseStatus: "tentative" }))).toBe(true);
    const disponible = solo("libre", "Leer correos", "10:00", "11:00", { transparency: "transparent" });
    expect(ocupaSuTiempo(disponible)).toBe(false);
    expect(eventosPropios([disponible])[0]).toMatchObject({ ocupa: false });
    const [r] = agendaDelDia([reunion("q", "Q", "09:00", "10:00", { responseStatus: "tentative" })], { porCorreo: new Map(), porDominio: new Map(), internos: new Set(["smarteamcr.com"]) });
    expect(r).toMatchObject({ tenue: true, ocupa: true });
  });

  it("el bloque de una tarea de Nexus es un evento propio que lleva a la tarea", () => {
    const bloque = solo("t", "Tarea · Llamar a Ana", "09:00", "10:00", { extendedProperties: { private: { nexusTareaId: "tar-1" } } });
    expect(eventosPropios([bloque])[0]).toMatchObject({ tareaId: "tar-1", ocupa: true });
  });
});

describe("el espacio libre no pisa lo que ocupa el tiempo", () => {
  it("donde hay un evento sin invitados no hay espacio libre (el de 13:00 a 14:30 del jueves)", () => {
    const reuniones = agendaDelDia(JUEVES_DEL_CALENDARIO, { porCorreo: new Map(), porDominio: new Map(), internos: new Set(["smarteamcr.com"]) });
    const ocupado = ocupadoDeLaAgenda({ reuniones, propios: eventosPropios(JUEVES_DEL_CALENDARIO) });
    const libres = espaciosLibres(ocupado, [JUEVES], "2026-10-21", new Date(cr("09:00", "2026-10-21")));
    // 9:30–11:00 y 14:30–16:00. Ni 13:00–14:30 (la cita) ni el almuerzo (no lo marcó: 12:00–13:00).
    expect(libres).toEqual([
      { inicio: cr("09:30"), fin: cr("11:00") },
      { inicio: cr("14:30"), fin: cr("16:00") },
    ]);
  });

  it("solo con las reuniones (como antes), Nexus habría sugerido encima de la cita", () => {
    const reuniones = agendaDelDia(JUEVES_DEL_CALENDARIO, { porCorreo: new Map(), porDominio: new Map(), internos: new Set(["smarteamcr.com"]) });
    const libres = espaciosLibres(reuniones, [JUEVES], "2026-10-21", new Date(cr("09:00", "2026-10-21")));
    expect(libres.some((l) => l.inicio <= cr("13:00") && cr("14:00") <= l.fin)).toBe(true);
  });
});

describe("el almuerzo", () => {
  it("sin almuerzo marcado, Nexus no sugiere nada de 12:00 a 13:00", () => {
    expect(almuerzoSupuesto([], JUEVES)).toEqual({ desde: 12 * 60, hasta: 13 * 60 });
    const libres = espaciosLibres([], [JUEVES], "2026-10-21", new Date(cr("09:00", "2026-10-21")));
    expect(libres).toEqual([
      { inicio: cr("08:00"), fin: cr("12:00") },
      { inicio: cr("13:00"), fin: cr("17:00") },
    ]);
  });

  it("con el almuerzo marcado a otra hora, se respeta esa y 12:00 queda libre", () => {
    const ocupado = [{ id: "a", inicio: cr("13:00"), fin: cr("14:00"), titulo: "Almuerzo" }];
    expect(almuerzoSupuesto(ocupado, JUEVES)).toBeNull();
    const libres = espaciosLibres(ocupado, [JUEVES], "2026-10-21", new Date(cr("09:00", "2026-10-21")));
    expect(libres).toEqual([
      { inicio: cr("08:00"), fin: cr("13:00") },
      { inicio: cr("14:00"), fin: cr("17:00") },
    ]);
  });

  it("«Agendar» tampoco propone la hora del almuerzo", () => {
    const ahora = new Date(cr("11:30"));
    const h = primerHuecoLaboral([{ id: "x", inicio: cr("13:00"), fin: cr("17:00") }], ahora);
    expect(h.inicio).toBe(cr("08:00", "2026-10-23"));
  });
});

const tarea = (n: number, minutos: number | null, extra: Partial<TareaParaUnHueco> = {}): TareaParaUnHueco => ({
  id: `t${n}`,
  numero: n,
  titulo: `Tarea ${n}`,
  prioridad: "media",
  venceEl: null,
  semana: null,
  minutosEstimados: minutos,
  clientId: null,
  empresa: null,
  ...extra,
});

describe("los bloques que sugiere Nexus", () => {
  const ESPACIO = { inicio: cr("13:00"), fin: cr("17:00") };

  it("del tamaño de cada tarea, una detrás de otra, nunca el espacio entero", () => {
    const b = bloquesSugeridos([tarea(100, 60), tarea(101, 30)], [ESPACIO], "2026-10-22");
    expect(b.map((x) => [x.inicio, x.fin, x.avanzar?.tarea.numero])).toEqual([
      [cr("13:00"), cr("14:00"), 100],
      [cr("14:00"), cr("14:30"), 101],
    ]);
    expect(b.every((x) => x.espacio === b[0].espacio && x.espacio.fin === ESPACIO.fin)).toBe(true);
  });

  it("como mucho dos por espacio; una tarea se sugiere una sola vez", () => {
    const b = bloquesSugeridos([tarea(1, 60), tarea(2, 60), tarea(3, 60)], [ESPACIO, { inicio: cr("08:00", "2026-10-23"), fin: cr("10:00", "2026-10-23") }], "2026-10-22");
    expect(b.map((x) => x.avanzar?.tarea.numero)).toEqual([1, 2, 3]);
    expect(new Set(b.map((x) => x.avanzar?.tarea.id)).size).toBe(3);
  });

  it("sin estimar, una hora; lo que no cabe en lo que queda no entra", () => {
    const b = bloquesSugeridos([tarea(1, null), tarea(2, 180), tarea(3, 240)], [{ inicio: cr("13:00"), fin: cr("15:00") }], "2026-10-22");
    expect(b.map((x) => [x.avanzar?.tarea.numero, x.avanzar?.minutos])).toEqual([[1, 60]]);
  });

  it("sin ninguna tarea que quepa, la primera hora del espacio como «Espacio libre»", () => {
    const b = bloquesSugeridos([], [ESPACIO], "2026-10-22");
    expect(b).toEqual([{ inicio: cr("13:00"), fin: cr("14:00"), espacio: ESPACIO, avanzar: null }]);
  });
});

describe("varios eventos a la vez", () => {
  it("van lado a lado, como en Google Calendar, también uno opcional", () => {
    const g = grillaDelDia(
      [
        { id: "a", inicio: cr("15:00"), fin: cr("16:00") },
        { id: "b", inicio: cr("15:00"), fin: cr("15:15") },
        { id: "c", inicio: cr("16:00"), fin: cr("17:00") },
      ],
      JUEVES,
    );
    const de = (id: string) => g.eventos.find((e) => e.id === id)!;
    expect([de("a").columna, de("b").columna, de("a").columnas]).toEqual([0, 1, 2]);
    expect(de("c")).toMatchObject({ columna: 0, columnas: 1 });
  });
});

describe("al entrar no se abre nada solo", () => {
  it("el inicio arranca sin nada elegido y la página no le pasa una reunión para abrir", () => {
    const raiz = join(__dirname, "..", "..");
    const inicio = readFileSync(join(raiz, "components/para-ti/inicio/InicioDelDia.tsx"), "utf8");
    const pagina = readFileSync(join(raiz, "app/(shell)/para-ti/page.tsx"), "utf8");
    expect(inicio).toContain("useState<string | null>(null)");
    expect(inicio).not.toMatch(/abrirDeEntrada/);
    expect(pagina).not.toMatch(/abrirDeEntrada/);
  });
});
