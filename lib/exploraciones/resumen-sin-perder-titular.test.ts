/**
 * lib/exploraciones/resumen-sin-perder-titular.test.ts — rehacer el Resumen no deja la página sin titular (21 nov, Elías:
 * «que al hacer un resumen no se pierda el titular»). En Tecnosagot la tesis nueva nombraba a una persona y en Polaris
 * seguía larga después de corregirla: la verificación la descartó, el Resumen quedó sin titular y al publicar el cliente lo
 * habría visto. Ahora: (1) una pieza obligatoria que no pasa se queda como estaba; (2) una página sin titular no se publica;
 * (3) la reparación cambia un nombre por su rol y pide acortar otra vez la tesis que sigue larga.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseObject } from "@/lib/ai/section-schema";
import { faltaParaPublicar, PIEZAS_OBLIGATORIAS } from "@/lib/external/pagina-del-resumen";
import {
  escribirElResumen,
  juntarConLoEditado,
  leerElResumen,
  leerLasPiezas,
  pedidoDeLasPiezas,
  resumenParaLaPagina,
  type ContextoDelResumen,
  type PiezaPorArreglar,
  type ResumenGuardado,
  type ReunionParaElResumen,
} from "./resumen-de-la-escala";

const REUNION: ReunionParaElResumen = {
  id: "gmeet_r1",
  clave: "R1",
  fecha: "2026-11-05T16:00:00.000Z",
  equipo: null,
  titulo: "EMPRESA | VENTAS",
  minutos: 60,
  delCliente: ["Diego Rojas"],
  deSmarteam: ["Marco Salas"],
  turnos: [
    { n: 10, hablante: "Diego Rojas", texto: "las ventas se registran a mano en una hoja y nadie ve el avance real del mes" },
    { n: 20, hablante: "Diego Rojas", texto: "cada vendedor lleva su propia lista de clientes y no la comparte con nadie del equipo" },
  ],
};
const CTX: ContextoDelResumen = { empresa: "Empresa de prueba", reuniones: [REUNION], instrucciones: "", areas: [] };
const REGLAS = { personas: ["Diego Rojas", "Marco Salas"], parse: parseObject, firmas: {} };
const C = (turno: number, texto: string) => ({ reunion: "R1", turno, texto });
const CITA = { reunion: "gmeet_r1", fecha: REUNION.fecha, turno: 10, hablante: "Diego Rojas", texto: "las ventas se registran a mano en una hoja" };
const responde = (x: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(x), citations: null }], usage: { input_tokens: 0, output_tokens: 0 } as never, stop_reason: "end_turn" as const });

const TESIS_DE_ANTES = { id: "n1", texto: "Las ventas se anotan a mano. Nadie ve el mes.", citas: [CITA] };
function guardado(tesis = true): ResumenGuardado {
  return {
    v: 2,
    at: "2026-11-18T18:00:00.000Z",
    por: null,
    modelo: "claude-sonnet-4-6",
    agentRunId: null,
    hicimos: { sesiones: [], personas: 1, texto: null },
    datosRojos: [],
    areas: {},
    entendimos: [],
    falta: [],
    negocio: tesis ? { tesis: [TESIS_DE_ANTES] } : {},
    operativas: [],
  };
}

describe("1 · rehacer no pierde el titular", () => {
  it("la tesis nueva que la verificación descartó: se queda la de antes, con sus citas, y adentro se avisa", () => {
    const nuevo = { ...guardado(false), at: "2026-11-21T10:00:00.000Z" };
    const j = juntarConLoEditado(nuevo, guardado());
    expect(j.negocio?.tesis).toEqual([TESIS_DE_ANTES]);
    expect(j.avisos?.some((a) => a.includes("quedó la de antes"))).toBe(true);
  });

  it("una tesis nueva que pasó reemplaza a la de antes, sin aviso", () => {
    const nueva = { id: "n9", texto: "Cada vendedor lleva su lista. Nadie la comparte.", citas: [{ ...CITA, turno: 20 }] };
    const j = juntarConLoEditado({ ...guardado(false), negocio: { tesis: [nueva] } }, guardado());
    expect(j.negocio?.tesis).toEqual([nueva]);
    expect(j.avisos ?? []).toEqual([]);
  });

  it("la que quitó una persona no vuelve: eso es suyo (y la página queda sin titular hasta que la escriba)", () => {
    // Quitarla la saca de lo guardado y deja su lápida: no hay de dónde devolverla.
    const antes = { ...guardado(false), quitados: ["negocio:tesis|cita:gmeet_r1:10"] };
    expect(juntarConLoEditado(guardado(false), antes).negocio?.tesis).toBeUndefined();
  });

  it("⛔ la de antes vuelve solo si sus citas siguen en las reuniones de hoy (una reunión que pasó a otra empresa no la sostiene)", () => {
    const nuevo = { ...guardado(false), at: "2026-11-21T10:00:00.000Z" };
    expect(juntarConLoEditado(nuevo, guardado(), [REUNION]).negocio?.tesis).toEqual([TESIS_DE_ANTES]);
    expect(juntarConLoEditado(nuevo, guardado(), []).negocio?.tesis).toBeUndefined();
    const otroTexto: ReunionParaElResumen = { ...REUNION, turnos: [{ n: 10, hablante: "Diego Rojas", texto: "hablamos de otra cosa que no tiene nada que ver con la cita" }] };
    expect(juntarConLoEditado(nuevo, guardado(), [otroTexto]).negocio?.tesis).toBeUndefined();
  });

  it("el aviso «quedó la de antes» se va cuando una persona ya escribió el titular", () => {
    const j = juntarConLoEditado({ ...guardado(false), at: "2026-11-21T10:00:00.000Z" }, guardado());
    expect(resumenParaLaPagina(j, [], {}, {}, { conCitas: true }).avisos?.some((x) => x.includes("quedó la de antes"))).toBe(true);
    const aMano = { ...j, negocio: { tesis: [{ id: "n9", texto: "Las ventas se anotan a mano. Nadie ve el mes.", citas: [], mano: true }] } };
    expect(resumenParaLaPagina(aMano, [], {}, {}, { conCitas: true }).avisos?.some((x) => x.includes("quedó la de antes"))).toBe(false);
  });

  it("la tesis es la pieza obligatoria", () => {
    expect(PIEZAS_OBLIGATORIAS).toContain("tesis");
  });
});

describe("2 · una página sin titular no se publica", () => {
  const pagina = (g: ResumenGuardado | null) => resumenParaLaPagina(g, [], {}, {}, { conCitas: false });

  it("un Resumen armado sin tesis lo dice; con tesis, sin Resumen o uno del 9 nov, se publica", () => {
    expect(faltaParaPublicar(pagina(guardado(false)))).toMatch(/no tiene titular/);
    expect(faltaParaPublicar(pagina(guardado()))).toBeNull();
    expect(faltaParaPublicar(pagina(null))).toBeNull();
    expect(faltaParaPublicar({ at: "2026-11-09T00:00:00.000Z", formato: 1, negocio: null })).toBeNull();
  });

  it("⛔ «Publicar» lo mira antes de guardar la foto, el estado del acceso lo trae y el botón se apaga", () => {
    const acceso = fs.readFileSync(path.join(process.cwd(), "lib/exploraciones/acceso-a-la-escala.ts"), "utf8");
    const publicar = acceso.slice(acceso.indexOf("export async function publicarLaEscala"), acceso.indexOf("export async function crearAcceso"));
    expect(publicar.indexOf("faltaParaPublicar(")).toBeGreaterThan(-1);
    expect(publicar.indexOf("faltaParaPublicar(")).toBeLessThan(publicar.indexOf("updateMany"));
    expect(acceso).toMatch(/noSePublica: [^\n]*faltaParaPublicar\(/);
    const boton = fs.readFileSync(path.join(process.cwd(), "components/exploraciones/PublicarLaEscala.tsx"), "utf8");
    expect(boton).toMatch(/disabled=\{publicando \|\| !!estado\.noSePublica\}/);
  });
});

describe("3 · la reparación", () => {
  it("una tesis que nombra a una persona se pide corregida (antes se tiraba entera)", () => {
    const e = leerElResumen(
      responde({ negocio: { tesis: [{ texto: "Diego anota las ventas a mano. Nadie ve el mes.", citas: [C(10, "las ventas se registran a mano en una hoja y nadie ve el avance real del mes")] }] }, areas: [] }),
      CTX,
      REGLAS,
    );
    expect(e.negocio.tesis).toBeUndefined();
    expect(e.piezasPorArreglar.find((p) => p.lugar === "negocio:tesis")?.problema).toMatch(/nombra a una persona/);
    expect(String(pedidoDeLasPiezas(e.piezasPorArreglar).system)).toMatch(/cámbiala por su rol/);
  });

  it("la tesis corregida que sigue larga vuelve en «aCortar», con el pedido de acortarla", () => {
    const de: PiezaPorArreglar = { lugar: "negocio:tesis", texto: "x", citas: [CITA], problema: "es demasiado largo para el titular" };
    const a = leerLasPiezas(responde({ piezas: [{ i: 0, texto: "Las ventas se registran a mano en una hoja larga de la empresa. Nadie ve el mes." }] }), [de], CTX, REGLAS);
    expect(a.piezas).toEqual([]);
    expect(a.aCortar).toHaveLength(1);
    expect(a.aCortar[0].problema).toMatch(/acórtala/);
  });

  it("escribirElResumen pide acortarla UNA vez más y, si vuelve corta, el titular queda", async () => {
    const larga = "Las ventas se registran a mano en una hoja larga de la empresa. Nadie ve el mes.";
    const respuestas = [
      responde({ negocio: { tesis: [{ texto: larga, citas: [C(10, "las ventas se registran a mano en una hoja y nadie ve el avance real del mes")] }] }, areas: [] }),
      responde({ piezas: [{ i: 0, texto: larga }] }),
      responde({ piezas: [{ i: 0, texto: "Las ventas se anotan a mano. Nadie ve el mes." }] }),
    ];
    const pedidos: unknown[] = [];
    const e = await escribirElResumen({ ctx: CTX, personas: REGLAS.personas, firmas: {} }, async (p) => {
      pedidos.push(p);
      return respuestas.shift() ?? responde({});
    });
    expect(pedidos).toHaveLength(3);
    expect(e.negocio.tesis?.[0].texto).toBe("Las ventas se anotan a mano. Nadie ve el mes.");
  });
});
