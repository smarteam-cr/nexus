import { describe, expect, it } from "vitest";
import { instante } from "./inicio";
import { invitacionAPlanificar, planificarLaSemana, resumenDelPlan, semanaAPlanificar, type CuentaParaPlanificar, type TareaDelPlan } from "./planificar";

// Viernes 16 de octubre de 2026, 11:00 en Costa Rica: se planifica la semana del 19 al 23.
const AHORA = new Date("2026-10-16T17:00:00Z");
const HOY = "2026-10-16";
const lunes = "2026-10-19";
const l = (h: number, m = 0, dia = lunes) => instante(dia, h * 60 + m);

const tarea = (o: Partial<TareaDelPlan> = {}): TareaDelPlan => ({
  id: "t1",
  numero: 1,
  titulo: "Revisar el uso",
  clientId: "c1",
  estado: "pendiente",
  privada: false,
  venceEl: null,
  semana: null,
  reunionDia: null,
  equipo: "cs",
  responsableEmail: "ana@smarteamcr.com",
  prioridad: "media",
  clase: "accion",
  lado: "smarteam",
  version: 3,
  ...o,
});

const cuenta = (o: Partial<CuentaParaPlanificar> = {}): CuentaParaPlanificar => ({
  clientId: "c1",
  empresa: "Acme",
  proyectos: ["Acme · Implementación"],
  tareas: [],
  reuniones: [],
  invitados: ["ana@acme.com"],
  ultimaReunion: "2026-10-09T16:00:00Z",
  proximaSugerida: null,
  ...o,
});

describe("la semana que se planifica", () => {
  it("desde el viernes, la que viene; de lunes a jueves, lo que queda de esta", () => {
    expect(semanaAPlanificar("2026-10-16")).toMatchObject({ desde: lunes, viernes: "2026-10-23", cual: "proxima" });
    expect(semanaAPlanificar("2026-10-18").dias).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
    expect(semanaAPlanificar("2026-10-14")).toMatchObject({ desde: "2026-10-12", cual: "esta", dias: ["2026-10-14", "2026-10-15", "2026-10-16"] });
  });
});

describe("la invitación a planificar", () => {
  it("sale de viernes a domingo, cada día con lo suyo", () => {
    // Del lunes 12 al domingo 18 de octubre de 2026.
    expect(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"].map(invitacionAPlanificar)).toEqual([null, null, null, null]);
    expect(invitacionAPlanificar("2026-10-16")).toBe("Es viernes: planifica la semana que viene");
    expect(invitacionAPlanificar("2026-10-17")).toBe("Es sábado: planifica la semana que viene");
    expect(invitacionAPlanificar("2026-10-18")).toBe("Mañana empieza la semana: planifícala");
  });

  it("los días que invita son los que planifican la semana que viene", () => {
    for (const dia of ["2026-10-16", "2026-10-17", "2026-10-18"]) expect(semanaAPlanificar(dia).cual).toBe("proxima");
  });
});

describe("planificar la semana", () => {
  it("una cuenta sin nada: crear una acción y una reunión en el primer hueco del lunes", () => {
    const p = planificarLaSemana([cuenta()], { hoyISO: HOY, ahora: AHORA, ocupado: [{ id: "x", inicio: l(8), fin: l(9) }] });
    const c = p.cuentas[0];
    expect(c.accion).toMatchObject({ tipo: "nueva", titulo: "Seguimiento semanal con Acme", dia: lunes });
    expect(c.reunion).toMatchObject({ tipo: "sugerida", inicio: l(9), fin: l(10), invitados: ["ana@acme.com"], objetivoDe: "la regla de servicio: una reunión cada semana" });
    // El hueco de hoy viernes no cuenta: se planifica la semana que viene.
    expect(p.calendarioLeido).toBe(true);
  });

  it("lo que ya tiene se respeta: la acción con fecha y la reunión de la semana", () => {
    const p = planificarLaSemana(
      [cuenta({ tareas: [tarea({ venceEl: "2026-10-21" })], reuniones: [{ clientId: "c1", titulo: "Revisión", inicio: l(10, 0, "2026-10-22"), fuente: "calendario" }] })],
      { hoyISO: HOY, ahora: AHORA, ocupado: [] },
    );
    expect(p.cuentas[0].accion).toMatchObject({ tipo: "tiene", dia: "2026-10-21" });
    expect(p.cuentas[0].reunion.tipo).toBe("tiene");
    expect(resumenDelPlan(p)).toEqual({ cuentas: 1, conAccion: 1, conReunion: 1, noCaben: 0 });
  });

  it("sin acción: darle fecha a la abierta más importante, el día de la reunión", () => {
    const p = planificarLaSemana(
      [
        cuenta({
          tareas: [tarea({ id: "a", numero: 5, prioridad: "media" }), tarea({ id: "b", numero: 9, prioridad: "alta" }), tarea({ id: "c", numero: 2, lado: "cliente", titulo: "Mandar la base" })],
          reuniones: [{ clientId: "c1", titulo: "Revisión", inicio: l(10, 0, "2026-10-22"), fuente: "tarea" }],
        }),
      ],
      { hoyISO: HOY, ahora: AHORA, ocupado: [] },
    );
    expect(p.cuentas[0].accion).toMatchObject({ tipo: "darle-fecha", dia: "2026-10-22", tarea: { id: "b", version: 3 } });
  });

  it("el objetivo sale de la próxima que dejó sugerida la última reunión, o de lo que debe el cliente", () => {
    const sugerida = { titulo: "Revisar el piloto", objetivo: "Ver los resultados del piloto.", deLaReunion: "la reunión «Kickoff» del 9 oct", sessionId: "s1" };
    const p = planificarLaSemana([cuenta({ proximaSugerida: sugerida })], { hoyISO: HOY, ahora: AHORA, ocupado: [] });
    expect(p.cuentas[0].reunion).toMatchObject({ tipo: "sugerida", titulo: "Revisar el piloto", objetivo: "Ver los resultados del piloto.", sessionId: "s1" });
    const q = planificarLaSemana([cuenta({ tareas: [tarea({ lado: "cliente", titulo: "Mandar la base" })] })], { hoyISO: HOY, ahora: AHORA, ocupado: [] });
    expect(q.cuentas[0].reunion).toMatchObject({ objetivoDe: "las tareas del cliente en Tareas" });
    expect(q.cuentas[0].accion).toMatchObject({ tipo: "nueva", titulo: "Darle seguimiento con Acme a «Mandar la base»" });
  });

  it("las reuniones sugeridas no se pisan, y la que lleva más sin reunión toma el primer hueco", () => {
    const p = planificarLaSemana(
      [cuenta({ clientId: "a", empresa: "Alfa", ultimaReunion: "2026-10-10T16:00:00Z" }), cuenta({ clientId: "b", empresa: "Beta", ultimaReunion: "2026-09-01T16:00:00Z" })],
      { hoyISO: HOY, ahora: AHORA, ocupado: [] },
    );
    const de = (id: string) => p.cuentas.find((c) => c.clientId === id)!.reunion;
    expect(de("b")).toMatchObject({ inicio: l(8) });
    expect(de("a")).toMatchObject({ inicio: l(9) });
    expect(p.cuentas.map((c) => c.empresa)).toEqual(["Alfa", "Beta"]);
  });

  it("lo que no cabe antes del viernes a las 17:00 se dice", () => {
    const llena = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"].map((d) => ({ id: d, inicio: l(8, 0, d), fin: l(17, 0, d) }));
    const p = planificarLaSemana([cuenta()], { hoyISO: HOY, ahora: AHORA, ocupado: llena });
    expect(p.cuentas[0].reunion).toMatchObject({ tipo: "no-cabe", inicio: null });
    expect(resumenDelPlan(p).noCaben).toBe(1);
  });

  it("sin calendario lo dice", () => {
    expect(planificarLaSemana([cuenta()], { hoyISO: HOY, ahora: AHORA, ocupado: null }).calendarioLeido).toBe(false);
  });
});
