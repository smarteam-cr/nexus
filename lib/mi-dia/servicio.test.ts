import { describe, expect, it } from "vitest";
import {
  accionDeLaSemana,
  cuandoEsLaReunion,
  estadoDeServicio,
  FUENTE_CUENTA_SIN_ACCION,
  pendienteDeCuentaSinAccion,
  reunionEnLosProximosDias,
  ventanaDeLaSemana,
  type TareaDeLaCuenta,
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

describe("el estado de servicio y «Cuenta sin acción»", () => {
  it("al día: no hay pendiente", () => {
    const e = estadoDeServicio("c1", [tarea({ venceEl: "2026-10-16" })], [{ clientId: "c1", titulo: "x", inicio: "2026-10-19T15:00:00Z", fuente: "calendario" }], { hoyISO: HOY, ahora: AHORA });
    expect(e.falta).toEqual([]);
    expect(pendienteDeCuentaSinAccion({ clientId: "c1", empresa: "Cemaco" }, e, { ultimaReunion: null, hoyISO: HOY })).toBeNull();
  });

  it("solo mira lo de esa cuenta", () => {
    const e = estadoDeServicio("c1", [tarea({ clientId: "c2", venceEl: "2026-10-16" })], [], { hoyISO: HOY, ahora: AHORA });
    expect(e.falta).toEqual(["accion", "reunion"]);
  });

  it("sin acción ni reunión: «Agendar» abre Google Calendar con los invitados, y pesa como cuenta sin acción", () => {
    const e = estadoDeServicio("c1", [], [], { hoyISO: HOY, ahora: AHORA });
    const p = pendienteDeCuentaSinAccion({ clientId: "c1", empresa: "Cemaco" }, e, {
      ultimaReunion: "2026-10-02T16:00:00Z",
      invitados: ["ana@cemaco.com", "no-es-correo"],
      hoyISO: HOY,
    })!;
    expect(p.fuente).toBe(FUENTE_CUENTA_SIN_ACCION);
    expect(p.clientId).toBe("c1");
    expect(p.cuando).toBe("hoy");
    expect(p.meta).toBe("Cemaco · Cuenta sin acción");
    expect(p.titulo).toBe("Cemaco: sin acción ni reunión");
    expect(p.detalle).toBe("Nada agendado en los próximos 8 días; la última reunión fue el 2 oct. Agenda la próxima reunión y deja una tarea con fecha esta semana.");
    expect(p.accion).toBe("Agendar");
    expect(p.href.startsWith("https://calendar.google.com/calendar/render?")).toBe(true);
    expect(decodeURIComponent(p.href)).toContain("add=ana@cemaco.com");
    expect(decodeURIComponent(p.href)).not.toContain("no-es-correo");
    expect(pesoDe(p)).toBe(PESOS.servicio);
  });

  it("con reunión y sin acción: crear la tarea en la ficha de la cuenta", () => {
    const e = estadoDeServicio("c1", [], [{ clientId: "c1", titulo: "x", inicio: "2026-10-19T15:00:00Z", fuente: "calendario" }], { hoyISO: HOY, ahora: AHORA });
    const p = pendienteDeCuentaSinAccion({ clientId: "c1", empresa: "Honda" }, e, { ultimaReunion: null, hoyISO: HOY })!;
    expect(p.meta).toBe("Honda · Cuenta sin acción");
    expect(p.titulo).toBe("Honda: sin acción esta semana");
    expect(p.accion).toBe("Crear la acción");
    expect(p.href).toBe("/clients/c1?tab=__tareas__");
    expect(p.detalle).toContain("lun");
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
