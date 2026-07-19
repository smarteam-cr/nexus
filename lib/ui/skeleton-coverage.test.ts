/**
 * lib/ui/skeleton-coverage.test.ts — "VALIDAR SIEMPRE QUE CADA MÓDULO TENGA SU SKELETON".
 *
 * Escanea `app/(shell)/` y exige que TODA ruta con page.tsx esté declarada en
 * SKELETON_COVERAGE. Agregar una página sin decidir su estado de carga rompe el test:
 * la omisión deja de ser posible en silencio (mismo mecanismo que el registry de
 * permisos, que ya funciona así en este repo).
 *
 * Lo que NO puede verificar: que la altura del skeleton calce al píxel con el render
 * final — jsdom no hace layout y medir CLS de verdad exige un browser logueado, que
 * este entorno no tiene. Los proxies que sí se verifican acá y en skeleton-vocab.test:
 * que el skeleton EXISTA, que la herencia sea legítima, y que no sea un slab.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SKELETON_COVERAGE } from "./skeleton-coverage";

const RAIZ = process.cwd();
const SHELL = path.join(RAIZ, "app", "(shell)");

/** Directorios (relativos a app/(shell)/) que contienen un page.tsx. */
function rutasConPage(dir = "", acc: string[] = []): string[] {
  const abs = path.join(SHELL, dir);
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (fs.existsSync(path.join(SHELL, rel, "page.tsx"))) acc.push(rel);
    rutasConPage(rel, acc);
  }
  return acc;
}

const RUTAS = rutasConPage();
const tieneLoading = (rel: string) => fs.existsSync(path.join(SHELL, rel, "loading.tsx"));

describe("cobertura de skeletons — toda ruta interna declara cómo carga", () => {
  it("hay rutas para verificar (el escáner no quedó vacío por un cambio de estructura)", () => {
    expect(RUTAS.length).toBeGreaterThan(30);
  });

  it("TODA ruta con page.tsx está declarada en SKELETON_COVERAGE", () => {
    const sinDeclarar = RUTAS.filter((r) => !SKELETON_COVERAGE[r]);
    expect(
      sinDeclarar,
      `Rutas sin declarar su estado de carga. Agregalas a lib/ui/skeleton-coverage.ts con ` +
        `own (loading.tsx propio) · inherits (mismo shape que un ancestro) · exempt (con razón):\n` +
        sinDeclarar.join("\n"),
    ).toEqual([]);
  });

  it("el registro no tiene entradas muertas (rutas que ya no existen)", () => {
    const muertas = Object.keys(SKELETON_COVERAGE).filter((k) => !RUTAS.includes(k));
    expect(muertas, `Entradas de rutas inexistentes:\n${muertas.join("\n")}`).toEqual([]);
  });

  it("cada `own` tiene efectivamente su loading.tsx", () => {
    const mentirosas = Object.entries(SKELETON_COVERAGE)
      .filter(([rel, c]) => c.modo === "own" && !tieneLoading(rel))
      .map(([rel]) => rel);
    expect(
      mentirosas,
      `Declaran loading.tsx propio pero el archivo no existe:\n${mentirosas.join("\n")}`,
    ).toEqual([]);
  });

  it("cada `inherits` apunta a un ancestro que SÍ tiene loading.tsx", () => {
    const rotas = Object.entries(SKELETON_COVERAGE)
      .filter(([rel, c]) => {
        if (c.modo !== "inherits") return false;
        // `de: ""` = la raíz del route group (app/(shell)/loading.tsx, el fallback).
        const destino = c.de === "" ? "" : c.de;
        if (!tieneLoading(destino)) return true;
        // La herencia solo es real si el destino es ancestro (o la raíz).
        return destino !== "" && !rel.startsWith(`${destino}/`);
      })
      .map(([rel]) => rel);
    expect(
      rotas,
      `Herencia rota: el ancestro no tiene loading.tsx, o no es ancestro de la ruta:\n${rotas.join("\n")}`,
    ).toEqual([]);
  });

  it("cada `exempt` explica por qué", () => {
    const sinRazon = Object.entries(SKELETON_COVERAGE)
      .filter(([, c]) => c.modo === "exempt" && !c.razon.trim())
      .map(([rel]) => rel);
    expect(sinRazon, `Exenciones sin razón escrita:\n${sinRazon.join("\n")}`).toEqual([]);
  });
});
