/**
 * lib/para-ti/importa.test.ts — «Lo que importa hoy» (fase 1.1 de docs/nexus-sistema-de-trabajo-plan.md): como mucho
 * cinco, una por cuenta, por peso.
 */
import { describe, expect, it } from "vitest";
import { armarParaTi, cuentaDelMenu } from "./armar";
import {
  cuentaDe,
  elegirLoQueImporta,
  FUENTE_ESTABILIZAR,
  MAX_LO_QUE_IMPORTA,
  MIN_CUENTAS_PARA_ESTABILIZAR,
  necesitaEstabilizar,
  pesoDe,
  PESOS,
  UMBRAL_PARA_ESTABILIZAR,
} from "./importa";

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

describe("⭐ nada queda fuera sin decirlo: «Estabilizar N cuentas» (2026-10-17)", () => {
  const cuentaN = (i: number) => id(`c${i}`);
  const enRiesgo = (i: number) => p(`cs-tus-cuentas:${i}`, { titulo: `Cuenta ${i} está en riesgo`, href: `/clients/${cuentaN(i)}` });
  const lleva = (n: number) => new Set(Array.from({ length: n }, (_, i) => cuentaN(i)));

  it("el umbral es 3 cuentas fuera de las cinco: hacen falta 7 cuentas que pidan atención", () => {
    expect(UMBRAL_PARA_ESTABILIZAR).toBe(3);
    expect(MIN_CUENTAS_PARA_ESTABILIZAR).toBe(7);
    expect(necesitaEstabilizar(6)).toBe(false);
    expect(necesitaEstabilizar(7)).toBe(true);
  });

  it("con 7 cuentas suyas, la quinta es «Estabilizar 3 cuentas», con el enlace a cada una", () => {
    const cands = Array.from({ length: 7 }, (_, i) => enRiesgo(i));
    const { importa, tambien } = elegirLoQueImporta(cands, MAX_LO_QUE_IMPORTA, { cuentasQueLleva: lleva(7) });
    expect(importa).toHaveLength(MAX_LO_QUE_IMPORTA);
    const quinta = importa[4];
    expect(quinta.fuente).toBe(FUENTE_ESTABILIZAR);
    expect(quinta.titulo).toBe("Estabilizar 3 cuentas");
    expect(quinta.enlaces?.map((e) => e.href)).toEqual([4, 5, 6].map((i) => `/clients/${cuentaN(i)}`));
    expect(quinta.enlaces?.[0].texto).toBe("Cuenta 4 está en riesgo");
    // Lo que no entró sigue en «También para hoy»: no se pierde nada.
    expect(tambien.map((x) => x.clave)).toEqual(["cs-tus-cuentas:4", "cs-tus-cuentas:5", "cs-tus-cuentas:6"]);
  });

  it("con 6, solo dos quedarían fuera: no hay «Estabilizar» y las cinco son las de siempre", () => {
    const cands = Array.from({ length: 6 }, (_, i) => enRiesgo(i));
    const { importa, tambien } = elegirLoQueImporta(cands, MAX_LO_QUE_IMPORTA, { cuentasQueLleva: lleva(6) });
    expect(importa.map((x) => x.fuente)).not.toContain(FUENTE_ESTABILIZAR);
    expect(importa).toHaveLength(5);
    expect(tambien).toHaveLength(1);
  });

  it("solo cuentan las cuentas que lleva: las de otros (la cartera de quien lidera) no suman", () => {
    const cands = Array.from({ length: 9 }, (_, i) => enRiesgo(i));
    const { importa } = elegirLoQueImporta(cands, MAX_LO_QUE_IMPORTA, { cuentasQueLleva: lleva(5) });
    expect(importa.map((x) => x.fuente)).not.toContain(FUENTE_ESTABILIZAR);
  });

  it("sin las cuentas que lleva (el correo de la mañana), nada cambia", () => {
    const cands = Array.from({ length: 9 }, (_, i) => enRiesgo(i));
    expect(elegirLoQueImporta(cands).importa.map((x) => x.clave)).toEqual(elegirLoQueImporta(cands, MAX_LO_QUE_IMPORTA, {}).importa.map((x) => x.clave));
  });

  it("en «Para ti», el número del menú sigue contando cinco", () => {
    const items = Array.from({ length: 8 }, (_, i) => enRiesgo(i));
    const m = armarParaTi([{ fuente: "cs-tus-cuentas", alDia: "Tus cuentas", ok: true, items }], { cuentasQueLleva: lleva(8) });
    expect(m.importa).toHaveLength(5);
    expect(m.importa[4].titulo).toBe("Estabilizar 4 cuentas");
    expect(cuentaDelMenu(m, 0)).toBe(5);
  });
});
