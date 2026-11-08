/**
 * ⛔ El feedback de la sesión no puede volver a desaparecer (Elías, 2026-11-08: «Todo lo que hemos hecho de dar feedback
 * de las sesiones. No sé por qué eso desapareció… Esto no debería pasar en ninguna mejora que hagamos»).
 *
 * En la primera vuelta de la exploración (56ad171f), «Cómo trabajaste esta sesión» (`ComoTrabajasteEstaSesion`, la
 * autoevaluación del analizador de venta, S4 del 27 oct) pasó de estar a la vista a quedar dentro del plegable «Más de
 * esta sesión» del Análisis. No se borró: nadie lo veía. Esta prueba se pone roja si vuelve a quedar dentro de un plegable
 * (`<details>` o `<CollapsibleSection>`), si deja de montarse en el análisis de una sesión leída, o si baja de su lugar
 * junto a «Qué pasó». Lo mismo con «Siguiente paso acordado / Cuánto avanzó» (`PasoYAvance`), que también estaba a la vista
 * y tenía datos (8 de 49 exploraciones con siguiente paso, medido el 8 nov).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "..", "..");
const fuente = fs.readFileSync(path.join(RAIZ, "components", "exploraciones", "DespuesDeLaSesion.tsx"), "utf8").replace(/\r\n/g, "\n");

/** El último `return (` de la pantalla del Análisis (el de una sesión que ya se leyó), sin salirse de esa función. */
function loQueMuestraElAnalisis(): string {
  const inicio = fuente.indexOf("export default function DespuesDeLaSesion(");
  expect(inicio, "no está la pantalla del Análisis (DespuesDeLaSesion)").toBeGreaterThan(-1);
  const fin = fuente.indexOf("\n}\n", inicio);
  const cuerpo = fuente.slice(inicio, fin < 0 ? undefined : fin);
  const ultimo = cuerpo.lastIndexOf("\n  return (");
  expect(ultimo).toBeGreaterThan(-1);
  return cuerpo.slice(ultimo);
}

/** Lo mismo sin lo que está dentro de un plegable. */
function sinPlegables(jsx: string): string {
  return jsx.replace(/<details[\s\S]*?<\/details>/g, "").replace(/<CollapsibleSection[\s\S]*?<\/CollapsibleSection>/g, "");
}

describe("⛔ el feedback de la sesión se ve en el Análisis", () => {
  it("«Cómo trabajaste esta sesión» se importa del analizador de venta y se monta en el análisis de una sesión leída", () => {
    expect(fuente).toMatch(/import ComoTrabajasteEstaSesion from "@\/components\/analizador-venta\/ComoTrabajasteEstaSesion"/);
    expect(loQueMuestraElAnalisis()).toMatch(/<ComoTrabajasteEstaSesion pestana=\{pestana\} \/>/);
  });

  it("es hijo directo de la columna principal: ni plegable, ni otro envoltorio, ni otra condición", () => {
    const jsx = loQueMuestraElAnalisis();
    expect(jsx).toMatch(/^ {4}<div className="space-y-5">$/m);
    expect(jsx, "«Cómo trabajaste esta sesión» dejó de estar directo en la columna del Análisis").toMatch(/^ {6}\{!enProyecto && <ComoTrabajasteEstaSesion pestana=\{pestana\} \/>\}$/m);
    expect(jsx).toMatch(/^ {6}<PasoYAvance pestana=\{pestana\} lectura=\{lectura\} \/>$/m);
  });

  it("no está dentro de un plegable", () => {
    expect(sinPlegables(loQueMuestraElAnalisis()), "«Cómo trabajaste esta sesión» quedó dentro de un plegable: nadie lo ve").toMatch(/<ComoTrabajasteEstaSesion/);
  });

  it("va arriba, junto a «Qué pasó»: antes de «Lo que aprendimos»", () => {
    const jsx = sinPlegables(loQueMuestraElAnalisis());
    const quePaso = jsx.indexOf("<QuePasoEnLaReunion");
    const feedback = jsx.indexOf("<ComoTrabajasteEstaSesion");
    const aprendimos = jsx.indexOf("<LoQueAprendimos");
    expect(quePaso).toBeGreaterThan(-1);
    expect(feedback).toBeGreaterThan(quePaso);
    expect(aprendimos).toBeGreaterThan(feedback);
  });

  it("el siguiente paso acordado y cuánto avanzó también se ven, fuera del plegable", () => {
    expect(sinPlegables(loQueMuestraElAnalisis())).toMatch(/<PasoYAvance pestana=\{pestana\} lectura=\{lectura\} \/>/);
  });

  it("lo usado de la reunión se ve en «Lo que aprendimos» sin abrir nada", () => {
    expect(fuente).toMatch(/<UsadasHoy filtro=\{deEsta\} sinPendientes=\{!items\.length\} plegada=\{false\} \/>/);
  });

  it("el componente del feedback no se pliega solo", () => {
    const componente = fs.readFileSync(path.join(RAIZ, "components", "analizador-venta", "ComoTrabajasteEstaSesion.tsx"), "utf8");
    const raiz = componente.slice(componente.indexOf("export default function ComoTrabajasteEstaSesion"));
    expect(raiz.slice(0, raiz.indexOf("function ElAnalisis"))).not.toMatch(/<details|<CollapsibleSection/);
  });
});
