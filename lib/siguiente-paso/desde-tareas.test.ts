import { describe, expect, it } from "vitest";
import { equipoDelPasoDeSprint, esDelObjeto, fechaDelPaso, fuenteDeLaTarea, mismoQueLaTarea, siguientePasoDe, type TareaDelPaso } from "./desde-tareas";
import { equiposQueEscribe } from "./reglas";

const t = (o: Partial<TareaDelPaso> = {}): TareaDelPaso => ({
  id: o.id ?? "t1",
  numero: o.numero ?? 1,
  titulo: o.titulo ?? "Mandar la propuesta",
  estado: o.estado ?? "pendiente",
  privada: o.privada ?? false,
  equipo: o.equipo === undefined ? "cs" : o.equipo,
  responsableEmail: o.responsableEmail === undefined ? "ana@smarteamcr.com" : o.responsableEmail,
  venceEl: o.venceEl ?? null,
  semana: o.semana ?? null,
  reunionDia: o.reunionDia ?? null,
  clientId: o.clientId === undefined ? "c1" : o.clientId,
  projectId: o.projectId ?? null,
  hubspotDealId: o.hubspotDealId ?? null,
  origen: o.origen ?? "mano",
  creadaPorEmail: o.creadaPorEmail === undefined ? "ana@smarteamcr.com" : o.creadaPorEmail,
  creadaAt: o.creadaAt ?? "2026-10-10T12:00:00.000Z",
  version: o.version ?? 0,
});

describe("⭐ el siguiente paso de un equipo es su próxima tarea abierta con fecha", () => {
  it("la de fecha más temprana: el día de la reunión, el vencimiento o su semana", () => {
    const tareas = [
      t({ id: "semana", semana: "2026-10-19" }),
      t({ id: "vence", venceEl: "2026-10-17" }),
      t({ id: "reunion", reunionDia: "2026-10-21" }),
    ];
    expect(siguientePasoDe(tareas, "cs")?.id).toBe("vence");
    expect(fechaDelPaso(t({ reunionDia: "2026-10-21", venceEl: "2026-10-30" }))).toBe("2026-10-21");
  });

  it("solo del sprint del equipo, abierta y no privada; una propuesta no cuenta", () => {
    const tareas = [
      t({ id: "dev", equipo: "desarrollo", venceEl: "2026-10-17" }),
      t({ id: "propuesta", estado: "propuesta", venceEl: "2026-10-17" }),
      t({ id: "privada", privada: true, venceEl: "2026-10-17" }),
      t({ id: "hecha", estado: "hecha", venceEl: "2026-10-17" }),
      t({ id: "cs", venceEl: "2026-10-20" }),
    ];
    expect(siguientePasoDe(tareas, "cs")?.id).toBe("cs");
    expect(siguientePasoDe(tareas, "dev")?.id).toBe("dev");
    expect(siguientePasoDe(tareas, "ventas")).toBeNull();
  });

  it("«Por asignar» del sprint también cuenta si tiene fecha", () => {
    expect(siguientePasoDe([t({ responsableEmail: null, venceEl: "2026-10-20" })], "cs")?.id).toBe("t1");
  });

  it("sin fecha no hay siguiente paso, salvo la que ya está escrita en HubSpot", () => {
    const sinFecha = [t({ id: "a" })];
    expect(siguientePasoDe(sinFecha, "cs")).toBeNull();
    expect(siguientePasoDe(sinFecha, "cs", "a")?.id).toBe("a");
  });

  it("con la misma fecha, la más vieja", () => {
    const tareas = [t({ id: "nueva", venceEl: "2026-10-20", creadaAt: "2026-10-12T00:00:00Z" }), t({ id: "vieja", venceEl: "2026-10-20", creadaAt: "2026-10-01T00:00:00Z" })];
    expect(siguientePasoDe(tareas, "cs")?.id).toBe("vieja");
  });
});

describe("de qué objeto es", () => {
  it("la empresa ve todas las de la cuenta; el negocio y el proyecto, las suyas", () => {
    const deal = t({ hubspotDealId: "d9" });
    expect(esDelObjeto(deal, { objeto: "empresa", objetoId: "c1", clientId: "c1" })).toBe(true);
    expect(esDelObjeto(deal, { objeto: "negocio", objetoId: "n1", clientId: "c1", hubspotDealId: "d9" })).toBe(true);
    expect(esDelObjeto(t(), { objeto: "negocio", objetoId: "n1", clientId: "c1", hubspotDealId: "d9" })).toBe(false);
    expect(esDelObjeto(t({ projectId: "p1" }), { objeto: "proyecto", objetoId: "p1", clientId: "c1" })).toBe(true);
  });
});

describe("la copia de HubSpot", () => {
  it("dice lo mismo que la tarea solo si es la misma tarea con el mismo título, fecha y responsable", () => {
    const tarea = t({ venceEl: "2026-10-20" });
    const escrito = { tareaId: "t1", que: "Mandar  la propuesta", fecha: "2026-10-20", responsableEmail: "ana@smarteamcr.com" };
    expect(mismoQueLaTarea(escrito, tarea)).toBe(true);
    expect(mismoQueLaTarea({ ...escrito, fecha: "2026-10-21" }, tarea)).toBe(false);
    expect(mismoQueLaTarea({ ...escrito, tareaId: "otra" }, tarea)).toBe(false);
  });

  it("de dónde salió: una tarea escrita en HubSpot dice HubSpot", () => {
    expect(fuenteDeLaTarea({ origen: "paso", creadaPorEmail: null })).toBe("hubspot");
    expect(fuenteDeLaTarea({ origen: "paso", creadaPorEmail: "ana@x" })).toBe("persona");
    expect(fuenteDeLaTarea({ origen: "reunion", creadaPorEmail: null })).toBe("reunion");
  });
});

describe("equipos", () => {
  it("el sprint de cada equipo con paso", () => {
    expect(equipoDelPasoDeSprint("desarrollo")).toBe("dev");
    expect(equipoDelPasoDeSprint("marketing")).toBeNull();
  });
  it("quien lidera un sprint escribe también su siguiente paso (Alex: CS y Desarrollo)", () => {
    expect(equiposQueEscribe("CSL")).toEqual(["cs"]);
    expect(equiposQueEscribe("CSL", ["cs", "desarrollo"])).toEqual(["cs", "dev"]);
    expect(equiposQueEscribe("MARKETING", ["marketing"])).toEqual([]);
  });
});
