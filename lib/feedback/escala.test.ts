/**
 * lib/feedback/escala.test.ts — los comentarios de la escala como reportes de Feedback (2026-10-05).
 *
 * · Cada tipo de la escala cuenta como un tipo de feedback, y cada estado tiene su par en los dos lados.
 * · La «pantalla» y la dirección de un comentario llevan al criterio, con su edición.
 * · La columna `escala` se lee con cuidado: un JSON roto no inventa un comentario.
 * · El SQL solo suma columnas e índices, sin tocar lo que ya estaba.
 * · Las rutas de la escala no hablan más con las tablas viejas, y decidir es de quien revisa el feedback.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ESTADO_EN_EL_FEEDBACK,
  ESTADO_EN_LA_ESCALA,
  estadoEnLaEscala,
  leerEscalaDelReporte,
  pantallaDeLaEscala,
  rutaEnLaEscala,
  TIPO_EN_EL_FEEDBACK,
} from "./escala";
import { ESTADOS_DE_REPORTE, TIPOS_DE_FEEDBACK } from "./reglas";

const RAIZ = path.resolve(__dirname, "../..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

describe("tipos y estados", () => {
  it("cada tipo de la escala es un tipo de feedback que la bandeja conoce", () => {
    expect(TIPO_EN_EL_FEEDBACK).toEqual({ no_se_entiende: "duda", no_calza: "falla", propuesta: "mejora" });
    for (const t of Object.values(TIPO_EN_EL_FEEDBACK)) expect(TIPOS_DE_FEEDBACK).toContain(t);
  });

  it("cada estado del feedback tiene su par en la escala, y al revés vuelve al mismo", () => {
    for (const e of ESTADOS_DE_REPORTE) expect(ESTADO_EN_EL_FEEDBACK[ESTADO_EN_LA_ESCALA[e]]).toBe(e);
    expect(estadoEnLaEscala("en_hoja")).toBe("cambio_pendiente");
    expect(estadoEnLaEscala("no_se_hara")).toBe("descartado");
    // Un estado que no se conoce se muestra como lo que pide atención: sin revisar.
    expect(estadoEnLaEscala("otro")).toBe("abierto");
  });
});

describe("dónde está", () => {
  it("la pantalla dice el área, para leerla en la bandeja y en «Personas»", () => {
    expect(pantallaDeLaEscala("Marketing")).toBe("Escala · Marketing");
  });

  it("la dirección abre el criterio en la matriz, con la edición desde la que se comentó", () => {
    expect(rutaEnLaEscala({ slug: "marketing", ancla: "2.6.F1", edicion: null })).toBe("/escala/marketing?vista=matriz&c=2.6.F1");
    expect(rutaEnLaEscala({ slug: "ventas", ancla: "1.7.F1", edicion: "ecommerce-retail" })).toBe(
      "/escala/ventas?industria=ecommerce-retail&vista=matriz&c=1.7.F1",
    );
  });
});

describe("la columna `escala`", () => {
  const completa = {
    tipoDeAncla: "criterio",
    dimension: "2.6",
    version: "8.7.0",
    textoAnclado: "Existen al menos 2 segmentos definidos con criterios escritos.",
    edicion: null,
    tipo: "no_calza",
    decision: "El nivel de Segmentación.",
    cliente: { id: null, nombre: "Tienda X" },
    perfil: { cierre: "transaccional", despues: null },
    cambio: { que: "`2.6.F1` — contar segmentos por canal", caso: "", decision: "El nivel" },
    editadoAt: null,
  };

  it("se lee tal cual cuando está entera", () => {
    expect(leerEscalaDelReporte(completa)).toEqual(completa);
  });

  it("sin lo mínimo (tipo, versión, texto leído) no inventa un comentario", () => {
    expect(leerEscalaDelReporte(null)).toBeNull();
    expect(leerEscalaDelReporte([])).toBeNull();
    expect(leerEscalaDelReporte({ ...completa, tipo: "otro" })).toBeNull();
    expect(leerEscalaDelReporte({ ...completa, version: 8 })).toBeNull();
    expect(leerEscalaDelReporte({ ...completa, tipoDeAncla: "celda" })).toBeNull();
  });

  it("lo opcional que viene mal queda vacío, no rompe", () => {
    const r = leerEscalaDelReporte({ ...completa, cliente: { nombre: "" }, cambio: { que: " " }, perfil: "x" });
    expect(r?.cliente).toBeNull();
    expect(r?.cambio).toBeNull();
    expect(r?.perfil).toEqual({ cierre: null, despues: null });
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

describe("las rutas de la escala", () => {
  const RUTAS = [
    "app/api/escala/comentarios/route.ts",
    "app/api/escala/comentarios/[id]/route.ts",
    "app/api/escala/comentarios/[id]/respuestas/route.ts",
    "app/api/escala/comentarios/exportar/route.ts",
  ];

  it("guardan en Feedback, no en las tablas viejas", () => {
    for (const r of RUTAS) {
      const src = leer(r);
      expect(src, r).toContain("@/lib/feedback/escala-server");
      expect(src, r).not.toContain("@/lib/escala/comentarios/consultas");
    }
  });

  it("las tablas viejas ya no tienen quién las lea: su archivo se borró", () => {
    expect(fs.existsSync(path.join(RAIZ, "lib/escala/comentarios/consultas.ts"))).toBe(false);
  });

  it("el estado ya no se cambia desde la escala: se decide en /feedback", () => {
    expect(fs.existsSync(path.join(RAIZ, "app/api/escala/comentarios/[id]/estado/route.ts"))).toBe(false);
  });

  it("exportar los cambios es de quien revisa el feedback", () => {
    expect(leer("app/api/escala/comentarios/exportar/route.ts")).toContain("esRevisorDeFeedback(guard.role)");
  });
});
