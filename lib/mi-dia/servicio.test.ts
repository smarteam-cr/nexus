import { describe, expect, it } from "vitest";
import {
  accionDeLaSemana,
  cuandoEsLaReunion,
  diasDeLasReuniones,
  elDiaDeLaReunion,
  estadoDeServicio,
  estaVencida,
  FUENTE_CUENTA_SIN_ACCION,
  FUENTE_REUNION_CON_LA_CUENTA,
  pendienteDeCuentaSinPaso,
  pendienteDeReunion,
  pendienteDeTareasVencidas,
  reunionEnLosProximosDias,
  reunionesDeLosProximosDias,
  siguientePasoDeLaCuenta,
  SIN_CSE,
  textoDelSiguientePaso,
  tieneSiguientePaso,
  ventanaDeLaSemana,
  type ReunionDeLaCuenta,
  type TareaDeLaCuenta,
  type TareaParaVencer,
} from "./servicio";
import { pesoDe, PESOS } from "@/lib/para-ti/importa";

const tarea = (o: Partial<TareaDeLaCuenta> = {}): TareaDeLaCuenta => ({
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
  ...o,
});

// Viernes 16 de octubre de 2026, 11:00 en Costa Rica.
const AHORA = new Date("2026-10-16T17:00:00Z");
const HOY = "2026-10-16";

describe("la semana de la regla", () => {
  it("de lunes a domingo; desde el sábado, la que viene", () => {
    expect(ventanaDeLaSemana("2026-10-12")).toEqual({ desde: "2026-10-12", hasta: "2026-10-18" });
    expect(ventanaDeLaSemana("2026-10-16")).toEqual({ desde: "2026-10-12", hasta: "2026-10-18" });
    expect(ventanaDeLaSemana("2026-10-17")).toEqual({ desde: "2026-10-19", hasta: "2026-10-25" });
    expect(ventanaDeLaSemana("2026-10-18")).toEqual({ desde: "2026-10-19", hasta: "2026-10-25" });
  });
});

describe("la acción de la semana", () => {
  const semana = ventanaDeLaSemana(HOY);
  it("una tarea abierta con fecha dentro de la semana", () => {
    expect(accionDeLaSemana([tarea({ venceEl: "2026-10-14" })], semana)?.id).toBe("t1");
    expect(accionDeLaSemana([tarea({ semana: "2026-10-12" })], semana)?.id).toBe("t1");
    expect(accionDeLaSemana([tarea({ reunionDia: "2026-10-18" })], semana)?.id).toBe("t1");
  });
  it("sin fecha, fuera de la semana, hecha o «Solo para mí» no cuenta", () => {
    expect(accionDeLaSemana([tarea()], semana)).toBeNull();
    expect(accionDeLaSemana([tarea({ venceEl: "2026-10-09" })], semana)).toBeNull();
    expect(accionDeLaSemana([tarea({ venceEl: "2026-10-20" })], semana)).toBeNull();
    expect(accionDeLaSemana([tarea({ venceEl: "2026-10-14", estado: "hecha" })], semana)).toBeNull();
    expect(accionDeLaSemana([tarea({ venceEl: "2026-10-14", estado: "propuesta" })], semana)).toBeNull();
    expect(accionDeLaSemana([tarea({ venceEl: "2026-10-14", privada: true })], semana)).toBeNull();
  });
  it("la fecha de la reunión manda sobre el vencimiento, y el vencimiento sobre la semana", () => {
    // Vence fuera de la semana aunque esté en el sprint de esta semana: no cuenta.
    expect(accionDeLaSemana([tarea({ venceEl: "2026-10-30", semana: "2026-10-12" })], semana)).toBeNull();
  });
  it("de varias, la de fecha más temprana", () => {
    const a = tarea({ id: "a", numero: 5, venceEl: "2026-10-15" });
    const b = tarea({ id: "b", numero: 6, venceEl: "2026-10-13" });
    expect(accionDeLaSemana([a, b], semana)?.id).toBe("b");
  });
});

describe("la reunión de los próximos 8 días", () => {
  it("cuenta la que viene en 8 días; no la que pasó ni la de más adelante", () => {
    const r = (inicio: string) => ({ clientId: "c1", titulo: "Seguimiento", inicio, fuente: "calendario" as const });
    expect(reunionEnLosProximosDias([r("2026-10-20T15:00:00Z")], AHORA)?.inicio).toBe("2026-10-20T15:00:00Z");
    expect(reunionEnLosProximosDias([r("2026-10-16T14:00:00Z")], AHORA)).toBeNull();
    expect(reunionEnLosProximosDias([r("2026-10-25T15:00:00Z")], AHORA)).toBeNull();
  });
});

describe("LA REGLA: ¿la cuenta tiene siguiente paso?", () => {
  const reunion = (inicio: string): ReunionDeLaCuenta => ({ clientId: "c1", titulo: "Seguimiento", inicio, fuente: "calendario", eventoId: "ev1" });

  it("una reunión agendada ES el siguiente paso, aunque no haya ninguna tarea", () => {
    // Lunes 19 de octubre; la reunión es mañana.
    const e = estadoDeServicio("c1", [], [reunion("2026-10-20T15:00:00Z")], { hoyISO: "2026-10-19", ahora: new Date("2026-10-19T15:00:00Z") });
    expect(e.falta).toEqual(["accion"]);
    expect(e.paso?.tipo).toBe("reunion");
    expect(tieneSiguientePaso(e)).toBe(true);
    expect(textoDelSiguientePaso(e.paso!, "2026-10-19")).toBe("Siguiente paso: reunión mañana");
    expect(pendienteDeCuentaSinPaso({ clientId: "c1", empresa: "Cicadex" }, e, { ultimaReunion: null, hoyISO: "2026-10-19" })).toBeNull();
  });

  it("una reunión de la semana que viene (dentro de 8 días) también lo es", () => {
    const e = estadoDeServicio("c1", [], [reunion("2026-10-22T17:00:00Z")], { hoyISO: HOY, ahora: AHORA });
    expect(e.paso).toMatchObject({ tipo: "reunion", dia: "2026-10-22" });
    expect(textoDelSiguientePaso(e.paso!, HOY)).toBe("Siguiente paso: reunión el jue 22");
  });

  it("una tarea con fecha esta semana también, sin reunión", () => {
    const e = estadoDeServicio("c1", [tarea({ numero: 12, titulo: "Enviar la propuesta", venceEl: "2026-10-16" })], [], { hoyISO: HOY, ahora: AHORA });
    expect(e.paso).toMatchObject({ tipo: "accion", dia: "2026-10-16" });
    expect(textoDelSiguientePaso(e.paso!, HOY)).toBe("Siguiente paso: T-12 · Enviar la propuesta, hoy");
  });

  it("con las dos, la que va antes; el mismo día, la reunión", () => {
    const r = reunion("2026-10-20T15:00:00Z");
    expect(siguientePasoDeLaCuenta(tarea({ venceEl: "2026-10-14" }), r)?.tipo).toBe("accion");
    expect(siguientePasoDeLaCuenta(tarea({ venceEl: "2026-10-20" }), r)?.tipo).toBe("reunion");
    expect(siguientePasoDeLaCuenta(tarea({ venceEl: "2026-10-22" }), r)?.tipo).toBe("reunion");
  });

  it("sin ninguna de las dos no tiene (y solo mira lo de esa cuenta)", () => {
    expect(siguientePasoDeLaCuenta(null, null)).toBeNull();
    const e = estadoDeServicio("c1", [tarea({ clientId: "c2", venceEl: "2026-10-16" })], [{ ...reunion("2026-10-20T15:00:00Z"), clientId: "c2" }], { hoyISO: HOY, ahora: AHORA });
    expect(e.paso).toBeNull();
    expect(tieneSiguientePaso(e)).toBe(false);
  });
});

describe("«Cuentas sin siguiente paso»", () => {
  it("sin tarea ni reunión: «Agendar» abre Google Calendar con los invitados, y pesa como cuenta sin acción", () => {
    const e = estadoDeServicio("c1", [], [], { hoyISO: HOY, ahora: AHORA });
    const p = pendienteDeCuentaSinPaso({ clientId: "c1", empresa: "Cemaco" }, e, {
      ultimaReunion: "2026-10-02T16:00:00Z",
      invitados: ["ana@cemaco.com", "no-es-correo"],
      hoyISO: HOY,
    })!;
    expect(p.fuente).toBe(FUENTE_CUENTA_SIN_ACCION);
    expect(p.clientId).toBe("c1");
    expect(p.cuando).toBe("hoy");
    expect(p.meta).toBe("Cemaco · Sin siguiente paso");
    expect(p.titulo).toBe("Cemaco: sin siguiente paso");
    expect(p.detalle).toBe(
      "Ni una tarea con fecha esta semana ni una reunión en los próximos 8 días; la última reunión fue el 2 oct. Agenda la próxima reunión: esa reunión es el siguiente paso.",
    );
    expect(p.accion).toBe("Agendar");
    expect(p.href.startsWith("https://calendar.google.com/calendar/render?")).toBe(true);
    expect(decodeURIComponent(p.href)).toContain("add=ana@cemaco.com");
    expect(decodeURIComponent(p.href)).not.toContain("no-es-correo");
    expect(pesoDe(p)).toBe(PESOS.servicio);
    expect(p.grupo).toBeUndefined();
  });

  it("con tarea y sin reunión NO sale: la tarea es el siguiente paso", () => {
    const e = estadoDeServicio("c1", [tarea({ venceEl: "2026-10-16" })], [], { hoyISO: HOY, ahora: AHORA });
    expect(e.falta).toEqual(["reunion"]);
    expect(pendienteDeCuentaSinPaso({ clientId: "c1", empresa: "Cemaco" }, e, { ultimaReunion: null, hoyISO: HOY })).toBeNull();
  });

  it("sin el calendario lo dice; a quien lidera, con el CSE como grupo", () => {
    const e = estadoDeServicio("c1", [], [], { hoyISO: HOY, ahora: AHORA });
    const p = pendienteDeCuentaSinPaso({ clientId: "c1", empresa: "Cemaco" }, e, { ultimaReunion: null, hoyISO: HOY, calendarioLeido: false, grupo: "Heiver Gomez" })!;
    expect(p.detalle).toContain("No se pudo leer el calendario");
    expect(p.grupo).toBe("Heiver Gomez");
    expect(pendienteDeCuentaSinPaso({ clientId: "c1", empresa: "Cemaco" }, e, { ultimaReunion: null, hoyISO: HOY, grupo: null })!.grupo).toBe(SIN_CSE);
  });
});

describe("las reuniones del primer bloque", () => {
  const r = (inicio: string, o: Partial<ReunionDeLaCuenta> = {}): ReunionDeLaCuenta => ({ clientId: "c1", titulo: "Revisión mensual", inicio, fuente: "calendario", eventoId: "ev1", ...o });

  it("hoy y los dos días hábiles que siguen (un viernes mira el lunes y el martes)", () => {
    expect(diasDeLasReuniones("2026-10-19")).toEqual(["2026-10-19", "2026-10-20", "2026-10-21"]);
    expect(diasDeLasReuniones("2026-10-16")).toEqual(["2026-10-16", "2026-10-19", "2026-10-20"]);
    expect(diasDeLasReuniones("2026-10-17")).toEqual(["2026-10-19", "2026-10-20", "2026-10-21"]);
  });

  it("solo las que no empezaron, en orden; la del jueves no entra un lunes", () => {
    const lunes = new Date("2026-10-19T16:00:00Z"); // 10:00 en Costa Rica
    const lista = reunionesDeLosProximosDias(
      [r("2026-10-21T15:00:00Z"), r("2026-10-19T15:00:00Z"), r("2026-10-19T20:00:00Z"), r("2026-10-22T15:00:00Z")],
      "2026-10-19",
      lunes,
    );
    expect(lista.map((x) => x.inicio)).toEqual(["2026-10-19T20:00:00Z", "2026-10-21T15:00:00Z"]);
  });

  it("«Preparar» abre el resumen de la cuenta para esa reunión; una planeada en Tareas abre la tarea", () => {
    const p = pendienteDeReunion({ clientId: "c1", empresa: "Honda" }, r("2026-10-19T20:00:00Z"), "2026-10-19");
    expect(p.fuente).toBe(FUENTE_REUNION_CON_LA_CUENTA);
    expect(p.titulo).toBe("Honda: Revisión mensual");
    expect(p.detalle).toBe("Hoy, 14:00");
    expect(p.accion).toBe("Preparar");
    expect(p.href).toBe("/para-ti/reunion/ev1?cliente=c1");
    const t = pendienteDeReunion({ clientId: "c1", empresa: "Honda" }, r("2026-10-20T15:00:00Z", { fuente: "tarea", eventoId: undefined, tareaId: "t9" }), "2026-10-19", "Ana");
    expect(t.accion).toBe("Abrir");
    expect(t.href).toBe("/tareas?t=t9");
    expect(t.detalle).toBe("Mañana, 9:00 · planeada en Tareas");
    expect(t.grupo).toBe("Ana");
  });
});

describe("las tareas vencidas de la cuenta", () => {
  const t = (o: Partial<TareaParaVencer> = {}): TareaParaVencer => ({ id: "t1", numero: 1, titulo: "Enviar el acta", estado: "pendiente", privada: false, clase: "tarea", venceEl: null, semana: null, ...o });

  it("vencida: con vencimiento antes de hoy, o sin vencimiento y de una semana pasada", () => {
    expect(estaVencida(t({ venceEl: "2026-10-15" }), HOY)).toBe(true);
    expect(estaVencida(t({ venceEl: "2026-10-16" }), HOY)).toBe(false);
    expect(estaVencida(t({ semana: "2026-10-05" }), HOY)).toBe(true);
    expect(estaVencida(t({ semana: "2026-10-12" }), HOY)).toBe(false);
    expect(estaVencida(t(), HOY)).toBe(false);
  });

  it("no cuentan las hechas, las propuestas, las «Solo para mí» ni las reuniones planeadas", () => {
    expect(estaVencida(t({ venceEl: "2026-10-01", estado: "hecha" }), HOY)).toBe(false);
    expect(estaVencida(t({ venceEl: "2026-10-01", estado: "propuesta" }), HOY)).toBe(false);
    expect(estaVencida(t({ venceEl: "2026-10-01", privada: true }), HOY)).toBe(false);
    expect(estaVencida(t({ venceEl: "2026-10-01", clase: "reunion" }), HOY)).toBe(false);
  });

  it("una línea por cuenta, las más viejas primero", () => {
    const p = pendienteDeTareasVencidas(
      { clientId: "c1", empresa: "Fundauna" },
      [t({ id: "a", numero: 7, titulo: "Configurar el pipeline", venceEl: "2026-10-14" }), t({ id: "b", numero: 3, venceEl: "2026-10-02" }), t({ id: "c", numero: 9, venceEl: "2026-10-30" })],
      HOY,
    )!;
    expect(p.titulo).toBe("Fundauna: 2 tareas vencidas");
    expect(p.detalle).toBe("T-3 · Enviar el acta (venció el 2 oct) · T-7 · Configurar el pipeline (venció el 14 oct). Ciérralas si ya están, o dales una fecha nueva.");
    expect(p.enlaces?.map((e) => e.href)).toEqual(["/tareas?t=b", "/tareas?t=a"]);
    expect(p.href).toBe("/clients/c1?tab=__tareas__");
    expect(pendienteDeTareasVencidas({ clientId: "c1", empresa: "Fundauna" }, [t({ venceEl: "2026-10-30" })], HOY)).toBeNull();
  });
});

describe("el día de la reunión, en palabras", () => {
  it("hoy, mañana o el día con su número", () => {
    expect(elDiaDeLaReunion("2026-10-19T20:00:00Z", "2026-10-19")).toBe("hoy");
    expect(elDiaDeLaReunion("2026-10-20T15:00:00Z", "2026-10-19")).toBe("mañana");
    expect(elDiaDeLaReunion("2026-10-22T17:00:00Z", "2026-10-19")).toBe("el jue 22");
  });
});

describe("cuándo es la reunión", () => {
  it("hoy, mañana, el día de la semana o con el número si es más adelante", () => {
    expect(cuandoEsLaReunion("2026-10-16T20:00:00Z", HOY)).toBe("hoy");
    expect(cuandoEsLaReunion("2026-10-17T15:00:00Z", HOY)).toBe("mañana");
    expect(cuandoEsLaReunion("2026-10-20T15:00:00Z", HOY)).toBe("mar");
    expect(cuandoEsLaReunion("2026-10-23T15:00:00Z", HOY)).toBe("vie 23");
  });
});

describe("la fuente de «Para ti»", () => {
  it("su clave es la de la regla (la que pesa 80 en lo que importa)", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("lib/para-ti/fuentes/servicio.ts", "utf8")).toContain(`clave: "${FUENTE_CUENTA_SIN_ACCION}",`);
  });
});
