/**
 * lib/para-ti/importa.test.ts — «Lo que importa hoy» (fase 1.1 de docs/nexus-sistema-de-trabajo-plan.md): como mucho
 * cinco, una por cuenta, por peso.
 */
import { describe, expect, it } from "vitest";
import { armarParaTi, cuentaDelMenu } from "./armar";
import { cuentaDe, elegirLoQueImporta, MAX_LO_QUE_IMPORTA, pesoDe, PESOS } from "./importa";
import type { Pendiente } from "./tipos";

const id = (n: string) => `cmr${n.padEnd(22, "0")}`;
const p = (clave: string, extra: Partial<Pendiente> = {}): Pendiente => ({
  clave,
  fuente: clave.split(":")[0],
  cuando: "hoy",
  delAgente: false,
  titulo: clave,
  detalle: "",
  meta: "",
  accion: "Ir",
  href: "/",
  ...extra,
});

describe("⭐ el orden de Elías", () => {
  it("riesgo > servicio > decisión > reunión > lo interno > limpieza", () => {
    const pesos = ["cs-vigia:1", "cuenta-sin-accion:1", "cronograma-propuesta:1", "reuniones-sin-revisar:1", "tareas:1", "tiempos:1"].map((c) => pesoDe(p(c)));
    expect([...pesos].sort((a, b) => b - a)).toEqual(pesos);
    expect(pesoDe(p("nueva-fuente:1"))).toBe(PESOS.interno);
  });
  it("lo que falló sube; un pendiente puede traer su peso", () => {
    expect(pesoDe(p("tareas:1", { error: true }))).toBeGreaterThan(pesoDe(p("tareas:1")));
    expect(pesoDe(p("tareas:1", { peso: 95 }))).toBe(95);
  });
});

describe("una cosa por cuenta", () => {
  it("la cuenta sale del enlace o del pendiente", () => {
    expect(cuentaDe(p("x:1", { href: `/clients/${id("wherex")}?canvas=cronograma` }))).toBe(id("wherex"));
    expect(cuentaDe(p("x:1", { href: `/customer-success/${id("kolbi")}` }))).toBe(id("kolbi"));
    expect(cuentaDe(p("x:1", { href: "/tareas" }))).toBeNull();
    expect(cuentaDe(p("x:1", { href: `/clients/${id("wherex")}`, clientId: null }))).toBeNull();
  });
  it("de cada cuenta, la de más peso; lo demás de esa cuenta va adentro", () => {
    const w = `/clients/${id("wherex")}`;
    const { importa } = elegirLoQueImporta([p("tareas:1", { href: w }), p("cs-vigia:1", { href: w }), p("tareas:2")]);
    expect(importa.map((x) => x.clave)).toEqual(["cs-vigia:1", "tareas:2"]);
    expect(importa[0].otrosEnLaCuenta?.map((x) => x.clave)).toEqual(["tareas:1"]);
    expect(importa[1].otrosEnLaCuenta).toBeUndefined();
  });
  it("como mucho cinco; lo que no entra queda en «También para hoy»", () => {
    const muchos = Array.from({ length: 8 }, (_, i) => p(`tareas:${i}`, { href: `/clients/${id(`c${i}`)}` }));
    const { importa, tambien } = elegirLoQueImporta(muchos);
    expect(importa).toHaveLength(MAX_LO_QUE_IMPORTA);
    expect(tambien).toHaveLength(3);
  });
});

describe("en «Para ti»", () => {
  it("el número del menú cuenta las cinco, no todo lo de hoy", () => {
    const items = Array.from({ length: 9 }, (_, i) => p(`tareas:${i}`, { href: `/clients/${id(`c${i}`)}` }));
    const m = armarParaTi([{ fuente: "tareas", alDia: "Tus tareas", ok: true, items }]);
    expect(m.importa).toHaveLength(5);
    expect(m.tambien).toHaveLength(4);
    expect(cuentaDelMenu(m, 1)).toBe(6);
  });
});
