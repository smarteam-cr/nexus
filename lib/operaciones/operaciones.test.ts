/**
 * lib/operaciones/operaciones.test.ts — la capa de operaciones (2026-10-16, fase 0.4 de
 * docs/nexus-sistema-de-trabajo-plan.md).
 *
 * 1. El orquestador: valida con el zod de cada operación, prepara sin escribir y aplica en orden, cortando en la que
 *    falla (con un orquestador de prueba, sin base).
 * 2. Las herramientas salen del zod: un objeto, un nombre válido para la API.
 * 3. Escaneo del registro: nombres únicos, en tuteo, y que cada operación escriba SOLO por el escritor único de su
 *    módulo (nunca `prisma.x.create/update` desde lib/operaciones) ni lea la cita de una tarea.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { voseoEnProsa } from "@/lib/ui/voseo-formas";
import { aplicarOperaciones, leerOperacion, prepararOperaciones } from "./ejecutar";
import { herramientaDe, nombreDeHerramienta, operacionDeHerramienta } from "./herramientas";
import type { ContextoDeOperacion, Operacion } from "./tipos";

const ctx: ContextoDeOperacion = { persona: { email: "ana@smarteamcr.com" }, ahora: new Date("2026-10-16T15:00:00Z"), extras: {} };
const escritas: string[] = [];

class ErrorDePrueba extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const OPS: Operacion[] = [
  {
    nombre: "prueba.leer",
    paraQue: "Lee algo.",
    clase: "lee",
    pide: z.object({ id: z.string().min(1) }).strict(),
    leer: async (_c, e) => ({ eco: e.id }),
  },
  {
    nombre: "prueba.escribir",
    paraQue: "Escribe algo.",
    clase: "propone",
    pide: z.object({ texto: z.string().min(1, "Escribe algo.") }).strict(),
    preparar: async (_c, e) => (e.texto === "no" ? { ok: false, motivo: "Eso no se puede." } : { ok: true, datos: e.texto, linea: `Escribir «${e.texto}»` }),
    aplicar: async (_c, d) => {
      if (d === "falla") throw new ErrorDePrueba(409, "Otra persona cambió esto.");
      escritas.push(d as string);
      return { ok: true };
    },
  },
];

describe("⭐ el orquestador", () => {
  it("leer valida con el zod de la operación y no deja leer una que propone", async () => {
    expect(await leerOperacion(OPS, ctx, { nombre: "prueba.leer", entrada: { id: "x" } })).toEqual({ ok: true, valor: { eco: "x" } });
    expect(await leerOperacion(OPS, ctx, { nombre: "prueba.leer", entrada: { id: "" } })).toMatchObject({ ok: false });
    expect(await leerOperacion(OPS, ctx, { nombre: "prueba.escribir", entrada: { texto: "a" } })).toMatchObject({ ok: false });
    expect(await leerOperacion(OPS, ctx, { nombre: "no.existe", entrada: {} })).toMatchObject({ ok: false, motivo: expect.stringContaining("No existe") });
  });

  it("preparar no escribe: lo que se puede va con su línea; lo que no, con su motivo", async () => {
    escritas.length = 0;
    const p = await prepararOperaciones(OPS, ctx, [
      { nombre: "prueba.escribir", entrada: { texto: "uno" } },
      { nombre: "prueba.escribir", entrada: { texto: "no" } },
      { nombre: "prueba.escribir", entrada: { texto: "" } },
      { nombre: "prueba.escribir", entrada: { texto: "x", sobra: 1 } },
      { nombre: "prueba.leer", entrada: { id: "a" } },
    ]);
    expect(p.preparadas.map((x) => x.linea)).toEqual(["Escribir «uno»"]);
    expect(p.rechazadas.map((x) => x.motivo)).toEqual([
      "Eso no se puede.",
      "texto: Escribe algo.",
      expect.stringContaining("sobra"),
      expect.stringContaining("solo lee"),
    ]);
    expect(escritas).toEqual([]);
  });

  it("aplicar va en orden y corta en la que falla: lo anterior queda, lo de después no se intenta", async () => {
    escritas.length = 0;
    const a = await aplicarOperaciones(OPS, ctx, [
      { nombre: "prueba.escribir", datos: "a", linea: "A" },
      { nombre: "prueba.escribir", datos: "falla", linea: "B" },
      { nombre: "prueba.escribir", datos: "c", linea: "C" },
    ]);
    expect(escritas).toEqual(["a"]);
    expect(a.aplicadas.map((x) => x.linea)).toEqual(["A"]);
    expect(a.fallo).toEqual({ nombre: "prueba.escribir", linea: "B", motivo: "Otra persona cambió esto." });
    expect(a.sinIntentar).toBe(1);
  });
});

describe("las herramientas salen del zod", () => {
  it("un objeto, con un nombre que acepta la API (sin el punto) y de ida y vuelta", () => {
    const h = herramientaDe(OPS[1]);
    expect(h.name).toBe("prueba_escribir");
    expect(h.input_schema.type).toBe("object");
    expect(h.input_schema).not.toHaveProperty("$schema");
    expect(h.description).toContain("se aplica cuando la persona lo confirma");
    expect(operacionDeHerramienta(OPS, "prueba_escribir")?.nombre).toBe("prueba.escribir");
    expect(nombreDeHerramienta("siguiente-paso.fijar")).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
  });
});

/* ── Escaneo del registro (lee el código: las operaciones reales importan Prisma y server-only) ── */

const RAIZ = join(__dirname, "..", "..");
const DIR = "lib/operaciones";
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");
const fuentes = readdirSync(join(RAIZ, DIR))
  .filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))
  .map((n) => ({ rel: `${DIR}/${n}`, texto: leer(`${DIR}/${n}`) }));
const deOperaciones = fuentes.filter((f) => /nombre: "[a-z-]+\.[a-z-]+"/.test(f.texto));

describe("⛔ el registro", () => {
  const nombres = deOperaciones.flatMap((f) => [...f.texto.matchAll(/^\s{2}nombre: "([^"]+)",$/gm)].map((m) => m[1]));
  const paraQue = deOperaciones.flatMap((f) => [...f.texto.matchAll(/paraQue:\s*"([^"]+)"/g)].map((m) => m[1]));

  it("cada operación tiene un nombre único y está en el registro", () => {
    expect(nombres.length).toBeGreaterThanOrEqual(8);
    expect(new Set(nombres).size).toBe(nombres.length);
    const registro = leer(`${DIR}/registro-server.ts`);
    const exportadas = deOperaciones.flatMap((f) => [...f.texto.matchAll(/export const ([A-Z_]+): Operacion/g)].map((m) => m[1]));
    expect(exportadas.length).toBe(nombres.length);
    for (const e of exportadas) expect(registro, `${e} no está en OPERACIONES`).toMatch(new RegExp(`\\b${e},`));
  });

  it("lo que lee el modelo va en tuteo", () => {
    expect(paraQue.length).toBe(nombres.length);
    for (const t of paraQue) expect(voseoEnProsa(t), t).toEqual([]);
  });

  it("escribe SOLO por el escritor único de cada módulo, nunca directo en la base", () => {
    for (const f of fuentes) expect(f.texto, f.rel).not.toMatch(/\b(?:prisma|tx)\.\w+\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\(/);
    const escritores = new Set(
      fuentes.flatMap((f) => [...f.texto.matchAll(/from "(@\/lib\/[^"]+)"/g)].map((m) => m[1])).filter((m) => /mutaciones|escritura/.test(m)),
    );
    expect([...escritores].sort()).toEqual(["@/lib/notas/escritura-server", "@/lib/siguiente-paso/escritura-server", "@/lib/tareas/mutaciones"]);
  });

  it("no lee la cita, el contexto ni las notas de una tarea", () => {
    const puerta = leer("lib/tareas/para-operaciones.ts");
    for (const campo of ["cita", "contexto", "notas", "pasos"]) expect(puerta, `para-operaciones.ts pide «${campo}»`).not.toMatch(new RegExp(`\\b${campo}:\\s*true`));
    for (const f of fuentes) expect(f.texto, f.rel).not.toMatch(/\.tarea\.find/);
  });
});
