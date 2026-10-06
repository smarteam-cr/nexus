/**
 * lib/feedback/escala.test.ts — el feedback que se manda desde la escala (2026-10-05).
 *
 * · La escala no tiene comentarios propios: el botón de cada criterio abre el panel de Feedback y el
 *   reporte se manda con los tipos de siempre, anclado a lo que se leía.
 * · La «pantalla» y la dirección del reporte llevan al criterio, con su edición.
 * · La columna `escala` se lee con cuidado: un JSON roto no inventa nada.
 * · Lo que manda el panel se valida en la frontera; el texto nunca viaja (lo congela el servidor).
 * · Cuánto llegó de cada cosa lo ve quien revisa: lo que manda cada uno es privado, como todo el feedback.
 * · El SQL solo suma columnas e índices, sin tocar lo que ya estaba.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EVENTO_DE_FEEDBACK_ENVIADO, filaSugerida, leerEscalaDelReporte, pantallaDeLaEscala, rutaEnLaEscala } from "./escala";
import { CrearReporte } from "./schema";

const RAIZ = path.resolve(__dirname, "../..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

describe("dónde está", () => {
  it("la pantalla dice el área, para leerla en la bandeja y en «Personas»", () => {
    expect(pantallaDeLaEscala("Marketing")).toBe("Escala · Marketing");
  });

  it("la dirección abre el criterio en la matriz, con la edición con que se leía", () => {
    expect(rutaEnLaEscala({ slug: "marketing", ancla: "2.6.F1", edicion: null })).toBe("/escala/marketing?vista=matriz&c=2.6.F1");
    expect(rutaEnLaEscala({ slug: "ventas", ancla: "1.7.F1", edicion: "ecommerce-retail" })).toBe(
      "/escala/ventas?industria=ecommerce-retail&vista=matriz&c=1.7.F1",
    );
  });
});

describe("la fila del manual que se le propone a quien lo lleva a la hoja de ruta", () => {
  it("una mejora trae lo que se pidió; lo demás, solo el identificador", () => {
    expect(filaSugerida({ ancla: "1.7.F1", edicion: null, tipo: "mejora", cuerpo: "Definirlo a tiempo.", cambio: null })).toEqual({
      que: "`1.7.F1` — Definirlo a tiempo.",
      caso: "",
      decision: "",
    });
    expect(filaSugerida({ ancla: "1.7.F1", edicion: null, tipo: "duda", cuerpo: "¿Qué cuenta como a tiempo?", cambio: null }).que).toBe("`1.7.F1` — ");
  });

  it("si se leía con una edición, la fila dice cuál (las columnas del manual son fijas)", () => {
    expect(filaSugerida({ ancla: "1.7.F1", edicion: "Ecommerce y retail", tipo: "mejora", cuerpo: "Por producto.", cambio: null }).que).toBe(
      "`1.7.F1` (edición Ecommerce y retail) — Por producto.",
    );
  });

  it("si ya tiene su fila, es esa", () => {
    const cambio = { que: "`1.7.F1` — medirlo por producto", caso: "Tienda X", decision: "El nivel" };
    expect(filaSugerida({ ancla: "1.7.F1", edicion: null, tipo: "mejora", cuerpo: "otra cosa", cambio })).toBe(cambio);
  });
});

describe("la columna `escala`", () => {
  const completa = {
    tipoDeAncla: "criterio",
    dimension: "2.6",
    version: "8.7.0",
    textoAnclado: "Existen al menos 2 segmentos definidos con criterios escritos.",
    edicion: null,
    perfil: { cierre: "transaccional", despues: null },
    cambio: { que: "`2.6.F1` — contar segmentos por canal", caso: "", decision: "El nivel" },
  };

  it("se lee tal cual cuando está entera", () => {
    expect(leerEscalaDelReporte(completa)).toEqual(completa);
  });

  it("sin lo mínimo (de qué es, en qué versión y qué texto se leía) no inventa nada", () => {
    expect(leerEscalaDelReporte(null)).toBeNull();
    expect(leerEscalaDelReporte([])).toBeNull();
    expect(leerEscalaDelReporte({ ...completa, version: 8 })).toBeNull();
    expect(leerEscalaDelReporte({ ...completa, textoAnclado: undefined })).toBeNull();
    expect(leerEscalaDelReporte({ ...completa, tipoDeAncla: "celda" })).toBeNull();
  });

  it("lo opcional que viene mal queda vacío, no rompe", () => {
    const r = leerEscalaDelReporte({ ...completa, edicion: "", cambio: { que: " " }, perfil: "x" });
    expect(r?.edicion).toBeNull();
    expect(r?.cambio).toBeNull();
    expect(r?.perfil).toEqual({ cierre: null, despues: null });
  });
});

describe("lo que manda el panel", () => {
  const base = { tipo: "mejora", cuerpo: "Contar los segmentos por canal", pantalla: "Escala de Rendimiento", ruta: "/escala/marketing" };

  it("el ancla, la edición y el perfil: el texto no viaja", () => {
    const r = CrearReporte.parse({ ...base, escala: { ancla: "2.6.F1", edicion: "ecommerce-retail", perfilCierre: "transaccional", perfilDespues: null, texto: "inventado" } });
    expect(r.escala).toEqual({ ancla: "2.6.F1", edicion: "ecommerce-retail", perfilCierre: "transaccional", perfilDespues: null });
  });

  it("un identificador sin la forma de la escala, una edición rara o un perfil que no existe no entran", () => {
    expect(CrearReporte.safeParse({ ...base, escala: { ancla: "2.6.X9" } }).success).toBe(false);
    expect(CrearReporte.safeParse({ ...base, escala: { ancla: "2.6.F1", edicion: "../otra" } }).success).toBe(false);
    expect(CrearReporte.safeParse({ ...base, escala: { ancla: "2.6.F1", perfilCierre: "a veces" } }).success).toBe(false);
  });

  it("sin `escala` es un reporte de pantalla, como siempre", () => {
    expect(CrearReporte.parse(base).escala).toBeUndefined();
  });
});

describe("la pantalla de la escala", () => {
  it("cada botón abre el panel de Feedback: no hay otro formulario ni otra tabla", () => {
    const vista = leer("components/escala/VistaDeLaEscala.tsx");
    expect(vista).toContain("useFeedback()?.abrir");
    expect(vista).not.toMatch(/PanelDeComentarios|almacen/);
  });

  it("los contadores son de quien revisa: al resto no se le cuentan", () => {
    const pagina = leer("app/(shell)/escala/[area]/page.tsx");
    expect(pagina).toContain("esRevisor ? contarPorAncla(area.id) : nada()");
    expect(pagina).toContain("esRevisor ? contarPorArea() : nada()");
    expect(leer("components/escala/Mapa.tsx")).toContain('esRevisor ? CAPAS : CAPAS.filter((c) => c.clave !== "comentarios")');
  });

  it("al mandar, el panel avisa y la escala de quien revisa vuelve a contar", () => {
    expect(EVENTO_DE_FEEDBACK_ENVIADO).toBe("nexus:feedback-enviado");
    expect(leer("components/feedback/PanelDeFeedback.tsx")).toContain("window.dispatchEvent(new Event(EVENTO_DE_FEEDBACK_ENVIADO))");
    expect(leer("components/escala/VistaDeLaEscala.tsx")).toContain("window.addEventListener(EVENTO_DE_FEEDBACK_ENVIADO");
  });
});

describe("el SQL", () => {
  const sql = leer("scripts/sql/2026-10-05-feedback-escala.sql")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("--"));

  it("solo suma tres columnas y dos índices a FeedbackReporte, y se puede correr dos veces", () => {
    expect(sql).toEqual([
      'ALTER TABLE "FeedbackReporte" ADD COLUMN IF NOT EXISTS "escalaAncla" TEXT;',
      'ALTER TABLE "FeedbackReporte" ADD COLUMN IF NOT EXISTS "escalaArea" TEXT;',
      'ALTER TABLE "FeedbackReporte" ADD COLUMN IF NOT EXISTS "escala" JSONB;',
      'CREATE INDEX IF NOT EXISTS "FeedbackReporte_escalaArea_idx" ON "FeedbackReporte" ("escalaArea");',
      'CREATE INDEX IF NOT EXISTS "FeedbackReporte_escalaAncla_idx" ON "FeedbackReporte" ("escalaAncla");',
    ]);
  });
});
