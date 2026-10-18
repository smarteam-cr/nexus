/**
 * La fase 2 de docs/nexus-sistema-de-trabajo-plan.md (2026-10-17) en «Para ti»: los huecos de hoy con qué avanzar, el
 * resolvedor único de evento → cuenta, «Agendar» con hora y lo que deja «Ya lo guardé».
 */
import { describe, expect, it } from "vitest";
import { conQueAvanzar, huecosLibres, instante, ordenarParaAvanzar, type TareaParaUnHueco } from "./inicio";
import { cuentaDelEvento, ocupadoDelCalendario } from "./agenda";
import { pendienteDeCuentaSinAccion, type EstadoDeServicio } from "./servicio";
import { dejaReunionPlaneada, detalleDelBorrador, reunionPlaneadaDelBorrador, type BorradorDeEvento } from "./agenda-borrador";

const DIA = "2026-10-16";
const a = (h: number, m = 0) => instante(DIA, h * 60 + m);

const tarea = (o: Partial<TareaParaUnHueco> = {}): TareaParaUnHueco => ({
  id: "t1",
  numero: 1,
  titulo: "Armar el reporte",
  prioridad: "media",
  venceEl: null,
  semana: "2026-10-12",
  minutosEstimados: null,
  clientId: null,
  empresa: null,
  ...o,
});

describe("los huecos libres de hoy", () => {
  it("todos los de una hora o más, en horario laboral, desde ahora", () => {
    const ev = [
      { id: "1", inicio: a(9), fin: a(10) },
      { id: "2", inicio: a(10, 30), fin: a(13) },
      { id: "3", inicio: a(14), fin: a(15, 30) },
    ];
    expect(huecosLibres(ev, DIA, new Date(a(7)))).toEqual([
      { inicio: a(8), fin: a(9) },
      { inicio: a(13), fin: a(14) },
      { inicio: a(15, 30), fin: a(17) },
    ]);
    // El hueco de 8 a 9 no llega a una hora desde las 8:10 (al cuarto siguiente, 8:15).
    expect(huecosLibres(ev, DIA, new Date(a(8, 10)))[0]).toEqual({ inicio: a(13), fin: a(14) });
    expect(huecosLibres(ev, "2026-10-17", new Date(a(7)))).toEqual([]);
  });
});

describe("con qué avanzar en un hueco", () => {
  it("lo vencido primero, después lo que vence hoy, la prioridad y lo más viejo", () => {
    const orden = ordenarParaAvanzar(
      [
        tarea({ id: "baja", numero: 1, prioridad: "baja" }),
        tarea({ id: "alta", numero: 2, prioridad: "alta" }),
        tarea({ id: "hoy", numero: 3, venceEl: DIA }),
        tarea({ id: "vencida", numero: 4, venceEl: "2026-10-10" }),
      ],
      DIA,
    );
    expect(orden.map((t) => t.id)).toEqual(["vencida", "hoy", "alta", "baja"]);
  });

  it("a cada hueco la más importante que cabe, sin repetir", () => {
    const huecos = [
      { inicio: a(13), fin: a(14) },
      { inicio: a(15), fin: a(17) },
    ];
    const r = conQueAvanzar([tarea({ id: "larga", numero: 1, prioridad: "alta", minutosEstimados: 90 }), tarea({ id: "corta", numero: 2, minutosEstimados: 30 })], huecos, DIA);
    // La larga no cabe en la hora de las 13:00: ahí va la corta; la larga, a la tarde.
    expect(r.get(a(13))).toMatchObject({ tarea: { id: "corta" }, minutos: 30 });
    expect(r.get(a(15))).toMatchObject({ tarea: { id: "larga" }, minutos: 90, porque: "es de prioridad alta" });
  });

  it("sin estimar cabe y se propone una hora; sin tareas, nada", () => {
    expect(conQueAvanzar([tarea()], [{ inicio: a(15), fin: a(17) }], DIA).get(a(15))).toMatchObject({ minutos: 60, porque: "es de tu semana" });
    expect(conQueAvanzar([], [{ inicio: a(15), fin: a(17) }], DIA).size).toBe(0);
  });
});

describe("el resolvedor único de evento → cuenta", () => {
  it("cuenta solo si es de UNA empresa", () => {
    expect(cuentaDelEvento({ empresas: ["c1"] })).toBe("c1");
    expect(cuentaDelEvento({ empresas: ["c1", "c2"] })).toBeNull();
    expect(cuentaDelEvento({ empresas: [] })).toBeNull();
  });

  it("lo ocupado es todo evento con hora, no cancelado ni rechazado", () => {
    const ocupado = ocupadoDelCalendario([
      { id: "1", start: { dateTime: "2026-10-16T15:00:00Z" }, end: { dateTime: "2026-10-16T16:00:00Z" } },
      { id: "2", status: "cancelled", start: { dateTime: "2026-10-16T17:00:00Z" } },
      { id: "3", start: { date: "2026-10-16" } },
      { id: "4", start: { dateTime: "2026-10-16T18:00:00Z" }, attendees: [{ email: "yo@smarteamcr.com", self: true, responseStatus: "declined" }] },
    ]);
    expect(ocupado.map((o) => o.id)).toEqual(["1"]);
  });
});

describe("«Agendar» de una cuenta sin reunión lleva hora", () => {
  const e: EstadoDeServicio = { clientId: "c1", accion: null, reunion: null, falta: ["accion", "reunion"] };
  it("con el hueco, Google Calendar abre con la hora; sin él, como antes", () => {
    const con = pendienteDeCuentaSinAccion({ clientId: "c1", empresa: "Acme" }, e, {
      ultimaReunion: null,
      hoyISO: DIA,
      correo: "ana@smarteamcr.com",
      hueco: { inicio: "2026-10-19T14:00:00Z", fin: "2026-10-19T15:00:00Z" },
    });
    expect(new URL(con!.href).searchParams.get("dates")).toBe("20261019T140000Z/20261019T150000Z");
    const sin = pendienteDeCuentaSinAccion({ clientId: "c1", empresa: "Acme" }, e, { ultimaReunion: null, hoyISO: DIA });
    expect(new URL(sin!.href).searchParams.get("dates")).toBeNull();
  });
});

describe("«Ya lo guardé» deja la reunión planeada", () => {
  const b: BorradorDeEvento = {
    id: "b1",
    correo: "ana@smarteamcr.com",
    inicio: "2026-10-19T15:00:00Z",
    fin: "2026-10-19T16:00:00Z",
    titulo: "",
    invitados: [{ correo: "x@acme.com", nombre: null, clientId: "c1" }],
    cuenta: { id: "c1", nombre: "Acme" },
    origen: "agendar",
    abierto: true,
    objetivo: "Ver el piloto.",
    deLaReunion: "s1",
  };
  it("con cuenta, sí; el bloque de una tarea o sin cuenta, no", () => {
    expect(reunionPlaneadaDelBorrador(b)).toEqual({ clientId: "c1", titulo: "Reunión con Acme", inicio: b.inicio, invitados: ["x@acme.com"], objetivo: "Ver el piloto.", deLaReunion: "s1" });
    expect(dejaReunionPlaneada({ ...b, tarea: { id: "t1", numero: 3 } })).toBe(false);
    expect(dejaReunionPlaneada({ ...b, cuenta: null })).toBe(false);
  });
  it("la descripción lleva el objetivo y la tarea", () => {
    const d = detalleDelBorrador({ ...b, tarea: { id: "t1", numero: 3 } }, "https://nexus.test/");
    expect(d).toContain("Objetivo: Ver el piloto.");
    expect(d).toContain("La tarea en Nexus (T-3): https://nexus.test/tareas?t=t1");
  });
});
