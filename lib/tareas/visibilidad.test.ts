/**
 * lib/tareas/visibilidad.test.ts — la regla de las cuentas (2026-10-16, decisión 9 de
 * docs/nexus-sistema-de-trabajo-plan.md): quien ve una cuenta ve todas sus tareas, de cualquier equipo, menos las
 * «Solo para mí» y las de un espacio de «solo miembros» donde no está.
 */
import { describe, expect, it } from "vitest";
import { tareasVisiblesWhere, veLaTarea, type QuienVe } from "./visibilidad";

const ana: QuienVe = { email: "ana@smarteamcr.com", esSuperAdmin: false, lidera: [], equipo: "cs", cuentas: { ids: new Set(["wherex"]) } };

const deDev = (o: Partial<Parameters<typeof veLaTarea>[0]> = {}) => ({
  responsableEmail: "breiner@smarteamcr.com",
  creadaPorEmail: "breiner@smarteamcr.com",
  pedidaPorEmail: null,
  equipo: "desarrollo",
  privada: false,
  archivadaAt: null,
  clientId: "wherex",
  espacio: null,
  ...o,
});

describe("⭐ quien ve una cuenta ve sus tareas, de cualquier equipo", () => {
  it("CS ve lo que Desarrollo le está haciendo a su cliente", () => {
    expect(veLaTarea(deDev(), ana)).toBe(true);
  });
  it("menos lo «Solo para mí»", () => {
    expect(veLaTarea(deDev({ privada: true }), ana)).toBe(false);
  });
  it("menos lo de un espacio de «solo miembros» donde no está", () => {
    expect(veLaTarea(deDev({ espacio: { tipo: "libre", visibilidad: "miembros", equipo: null, miembros: ["breiner@smarteamcr.com"] } }), ana)).toBe(false);
  });
  it("de una cuenta que no ve, nada", () => {
    expect(veLaTarea(deDev({ clientId: "otra" }), ana)).toBe(false);
  });
  it("sin las cuentas (un aviso a otra persona, un script) ve menos, nunca más", () => {
    expect(veLaTarea(deDev(), { ...ana, cuentas: null })).toBe(false);
    expect(veLaTarea({ ...deDev(), clientId: undefined }, ana)).toBe(false);
  });
  it("el filtro de la base dice lo mismo: las tareas de sus cuentas, no privadas", () => {
    const w = tareasVisiblesWhere(ana);
    const ramas = (w.OR ?? []) as Array<Record<string, unknown>>;
    const deCuentas = ramas.find((r) => "clientId" in r);
    expect(deCuentas).toMatchObject({ clientId: { in: ["wherex"] }, privada: false });
    expect(((tareasVisiblesWhere({ ...ana, cuentas: null }).OR ?? []) as Array<Record<string, unknown>>).some((r) => "clientId" in r)).toBe(false);
  });
});
