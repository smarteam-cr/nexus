/**
 * lib/cuentas/pase.test.ts — de quién a quién pasa lo abierto cuando cambia quien lleva la cuenta (2026-10-19).
 * Correr: `npx vitest run lib/cuentas --project unit`.
 */
import { describe, expect, it } from "vitest";
import { destinoDelPase, hayPase, paresDelPase, planDelPase, planExplicito, type ProyectoDelPase } from "./pase";

const p = (id: string, email: string | null, o: Partial<ProyectoDelPase> = {}): ProyectoDelPase => ({
  id,
  hubspotServiceId: `hs-${id}`,
  activo: true,
  deCs: true,
  deHubspot: true,
  email,
  nombre: email,
  creadoAt: null,
  ownerId: email ? `id-${email}` : null,
  ...o,
});

describe("planDelPase (antes y después de la sincronización)", () => {
  it("el pase de una cuenta con un proyecto: lo de la cuenta y lo del proyecto van al nuevo", () => {
    const plan = planDelPase([p("1", "heiver@x.com")], [p("1", "caroline@x.com")]);
    expect(plan.cuenta).toEqual({ de: ["heiver@x.com"], a: "caroline@x.com" });
    expect(plan.porProyecto.get("1")).toEqual({ de: "heiver@x.com", a: "caroline@x.com" });
    expect(destinoDelPase(plan, { responsableEmail: "Heiver@x.com", projectId: null })).toBe("caroline@x.com");
    expect(destinoDelPase(plan, { responsableEmail: "heiver@x.com", projectId: "1" })).toBe("caroline@x.com");
  });

  it("nada cambió: no hay pase", () => {
    expect(hayPase(planDelPase([p("1", "a@x.com")], [p("1", "a@x.com")]))).toBe(false);
  });

  it("⭐ Librería: la fila fusionada sale y su dueño le pasa todo a quien lleva el proyecto que sigue", () => {
    const antes = [p("vieja", "hgomez@x.com", { hubspotServiceId: "505467859346" }), p("viva", "cbersot@x.com", { hubspotServiceId: "586345112479" })];
    const despues = [p("viva", "cbersot@x.com", { hubspotServiceId: "586345112479" })];
    const plan = planDelPase(antes, despues, { fusiones: [{ viejoProjectId: "vieja", nuevoHubspotId: "586345112479" }] });
    expect(plan.cuenta).toEqual({ de: ["hgomez@x.com"], a: "cbersot@x.com" });
    expect(destinoDelPase(plan, { responsableEmail: "hgomez@x.com", projectId: "vieja" })).toBe("cbersot@x.com");
  });

  it("dos proyectos con encargados distintos: solo cambia el de un proyecto, y lo de la cuenta no se toca", () => {
    const antes = [p("1", "a@x.com"), p("2", "a@x.com"), p("3", "b@x.com")];
    const despues = [p("1", "a@x.com"), p("2", "a@x.com"), p("3", "c@x.com")];
    const plan = planDelPase(antes, despues);
    expect(plan.porProyecto.get("3")).toEqual({ de: "b@x.com", a: "c@x.com" });
    expect(plan.cuenta).toBeNull(); // la cuenta la sigue llevando a
    expect(paresDelPase(plan)).toEqual([]); // los avisos y las alertas no se mudan por un solo proyecto
    expect(destinoDelPase(plan, { responsableEmail: "b@x.com", projectId: "3" })).toBe("c@x.com");
    expect(destinoDelPase(plan, { responsableEmail: "a@x.com", projectId: null })).toBeNull();
  });

  it("⛔ cerrar el proyecto de otra persona, o uno nuevo de otro CSE, no es un pase", () => {
    const antes = [p("1", "a@x.com"), p("2", "b@x.com"), p("3", "b@x.com")];
    expect(hayPase(planDelPase(antes, [p("2", "b@x.com"), p("3", "b@x.com")]))).toBe(false);
    expect(hayPase(planDelPase(antes, [...antes, p("4", "c@x.com")]))).toBe(false);
  });

  it("⛔ si el correo cambió con el mismo id de dueño (no se pudo leer el dueño), no hay pase", () => {
    const antes = [p("1", "a@x.com"), p("2", "a@x.com")];
    const despues = [p("1", "lider@x.com", { ownerId: "id-a@x.com" }), p("2", "a@x.com")];
    expect(hayPase(planDelPase(antes, despues))).toBe(false);
    expect(hayPase(planDelPase([p("1", "a@x.com")], [p("1", null)]))).toBe(false);
  });

  it("⛔ nunca hacia alguien que no está en el equipo activo de Nexus", () => {
    const plan = planDelPase([p("1", "a@x.com")], [p("1", "externo@x.com")], { activos: new Set(["a@x.com"]) });
    expect(hayPase(plan)).toBe(false);
  });

  it("encargado que se fue: lo suyo pasa al nuevo; nunca se le pasa nada a alguien de baja", () => {
    const deBaja = new Map([["lorena@x.com", "Lorena"]]);
    const plan = planDelPase([p("1", "lorena@x.com")], [p("1", "caroline@x.com")], { deBaja });
    expect(destinoDelPase(plan, { responsableEmail: "lorena@x.com", projectId: null })).toBe("caroline@x.com");
    const alQueSeFue = planDelPase([p("1", "caroline@x.com")], [p("1", "lorena@x.com")], { deBaja });
    expect(hayPase(alQueSeFue)).toBe(false);
  });

  it("cuenta que se queda sin proyecto de CS: no hay a quién pasarle nada", () => {
    expect(hayPase(planDelPase([p("1", "a@x.com")], []))).toBe(false);
  });

  it("el pase ida y vuelta: la vuelta devuelve lo mismo, sin perder nada", () => {
    const ida = planDelPase([p("1", "a@x.com")], [p("1", "b@x.com")]);
    const vuelta = planDelPase([p("1", "b@x.com")], [p("1", "a@x.com")]);
    expect(destinoDelPase(ida, { responsableEmail: "a@x.com", projectId: "1" })).toBe("b@x.com");
    expect(destinoDelPase(vuelta, { responsableEmail: "b@x.com", projectId: "1" })).toBe("a@x.com");
  });

  it("la tarea de un proyecto que su responsable SIGUE llevando (su Desarrollo) no se mueve", () => {
    const antes = [p("cs", "a@x.com"), p("dev", "a@x.com", { deCs: false })];
    const despues = [p("cs", "b@x.com"), p("dev", "a@x.com", { deCs: false })];
    const plan = planDelPase(antes, despues);
    expect(destinoDelPase(plan, { responsableEmail: "a@x.com", projectId: "dev" })).toBeNull();
    expect(destinoDelPase(plan, { responsableEmail: "a@x.com", projectId: "cs" })).toBe("b@x.com");
    expect(destinoDelPase(plan, { responsableEmail: "a@x.com", projectId: null })).toBe("b@x.com");
  });

  it("lo de otra persona nunca se mueve", () => {
    const plan = planDelPase([p("1", "a@x.com")], [p("1", "b@x.com")]);
    expect(destinoDelPase(plan, { responsableEmail: "z@x.com", projectId: "1" })).toBeNull();
    expect(destinoDelPase(plan, { responsableEmail: "z@x.com", projectId: null })).toBeNull();
  });
});

describe("planExplicito (la celda del pase, la migración de Librería)", () => {
  it("de los anteriores al nuevo, sin el nuevo entre los anteriores", () => {
    const plan = planExplicito(["HGomez@x.com", "cbersot@x.com"], "cbersot@x.com");
    expect(plan.cuenta).toEqual({ de: ["hgomez@x.com"], a: "cbersot@x.com" });
    expect(paresDelPase(plan)).toEqual([{ de: "hgomez@x.com", a: "cbersot@x.com" }]);
  });
  it("respeta lo que el anterior sigue llevando", () => {
    const plan = planExplicito(["a@x.com"], "b@x.com", new Map([["dev", "a@x.com"]]));
    expect(destinoDelPase(plan, { responsableEmail: "a@x.com", projectId: "dev" })).toBeNull();
  });
  it("sin anteriores no hay pase", () => {
    expect(hayPase(planExplicito([], "b@x.com"))).toBe(false);
    expect(hayPase(planExplicito(["b@x.com"], "b@x.com"))).toBe(false);
  });
});
