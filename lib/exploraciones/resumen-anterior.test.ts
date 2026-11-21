/**
 * lib/exploraciones/resumen-anterior.test.ts — «Volver a la versión anterior» del Resumen de La escala (Elías, 21 nov).
 * Rehacer guarda el que había tal como estaba (con lo escrito a mano); volver lo pone otra vez y se deshace con el mismo
 * botón; nada de eso toca lo publicado ni sube la versión.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cambioLoConfirmado, contenidoVacio, type ContenidoDeExploracion, type EstadoDeExploracion } from "./contenido";
import { leerContenido, leerPropuesta, VolverAlResumenAnteriorSchema } from "./esquemas";
import { conElResumenNuevo, firmaParaVolver, volverALaAnterior } from "./resumen-anterior";
import type { ResumenGuardado } from "./resumen-de-la-escala";

const CITA = { reunion: "gmeet_r1", fecha: "2026-11-05T16:00:00.000Z", turno: 10, hablante: "Diego Rojas", texto: "las ventas se registran a mano en una hoja" };

function resumen(at: string, tesis: string, aMano: string | null = null): ResumenGuardado {
  return {
    v: 2,
    at,
    por: "ana@smarteam.example",
    modelo: "claude-sonnet-4-6",
    agentRunId: null,
    hicimos: { sesiones: [{ fecha: "2026-11-05T16:00:00.000Z", equipo: "Ventas", minutos: 60, quienes: ["diego rojas"] }], personas: 1, texto: aMano },
    datosRojos: [],
    areas: {},
    entendimos: [],
    falta: [],
    negocio: { tesis: [{ id: "n1", texto: tesis, citas: [CITA] }] },
    operativas: [],
    puntos: [{ id: "p1", titulo: "Las ventas van a mano", texto: "Cada venta se anota en una hoja.", areaId: null, citas: [CITA] }],
  };
}

// El que había: armado el 18 y con un texto escrito a mano después.
const A = resumen("2026-11-18T18:00:00.000Z", "Las ventas se anotan a mano.", "Tres sesiones con el equipo de ventas (escrito por Ana).");
// El que trae «Rehacer con IA».
const B = resumen("2026-11-21T15:00:00.000Z", "Nadie ve el mes de ventas.");
const QUIEN = { por: "luis@smarteam.example", en: "2026-11-21T15:00:05.000Z" };

const con = (c: Partial<ContenidoDeExploracion>): ContenidoDeExploracion => ({ ...contenidoVacio(), ...c });
/** Lo que llega a la pantalla: el JSON de lo que leyó el servidor. */
const porLaRed = (c: ContenidoDeExploracion) => JSON.parse(JSON.stringify(c)) as ContenidoDeExploracion;

describe("rehacer el Resumen guarda la versión anterior", () => {
  it("el que había queda como anterior, tal como estaba (con lo escrito a mano), con quién y cuándo se rehízo", () => {
    const c = conElResumenNuevo(con({ resumenDeLaEscala: A }), B, QUIEN);
    expect(c.resumenDeLaEscala).toEqual(B);
    expect(c.resumenAnterior).toEqual({ resumen: A, en: QUIEN.en, por: QUIEN.por, motivo: "rehacer" });
    expect(c.resumenAnterior?.resumen.hicimos.texto).toBe("Tres sesiones con el equipo de ventas (escrito por Ana).");
  });

  it("el primer armado no deja anterior (no había nada que guardar)", () => {
    expect(conElResumenNuevo(con({}), B, QUIEN).resumenAnterior).toBeUndefined();
  });

  it("basta una versión atrás: rehacer otra vez reemplaza la anterior por el de ahora", () => {
    const C = resumen("2026-11-21T16:00:00.000Z", "Otra vuelta.");
    const c = conElResumenNuevo(conElResumenNuevo(con({ resumenDeLaEscala: A }), B, QUIEN), C, QUIEN);
    expect(c.resumenDeLaEscala).toEqual(C);
    expect(c.resumenAnterior?.resumen).toEqual(B);
  });

  it("la anterior sobrevive a la lectura del contenido (cualquier PATCH la vuelve a escribir) y la firma es la misma en la pantalla", () => {
    const c = conElResumenNuevo(con({ resumenDeLaEscala: A }), B, QUIEN);
    const leido = leerContenido(porLaRed(c));
    // El Resumen de la anterior se lee igual que el Resumen (el lector completa las listas vacías).
    expect(leido.resumenAnterior).toEqual({ ...c.resumenAnterior, resumen: leerContenido(porLaRed(con({ resumenDeLaEscala: A }))).resumenDeLaEscala });
    expect(firmaParaVolver(porLaRed(leido))).toBe(firmaParaVolver(leido));
  });

  it("una anterior sin un Resumen legible no se lee", () => {
    expect(leerContenido({ resumenAnterior: { resumen: { v: 9 }, en: QUIEN.en, por: null, motivo: "rehacer" } }).resumenAnterior).toBeUndefined();
    expect(leerContenido({ resumenAnterior: { resumen: A, en: "no es fecha", por: null, motivo: "rehacer" } }).resumenAnterior).toBeUndefined();
  });

  it("el servidor guarda la anterior en el mismo lugar donde rehace (la cuenta regresiva llama a esa misma función)", () => {
    const fuente = readFileSync(join(__dirname, "resumen-de-la-escala-server.ts"), "utf8");
    const guardar = fuente.slice(fuente.indexOf("async function guardar("), fuente.indexOf("function conLoDesconocido("));
    expect(guardar).toContain("conElResumenNuevo(c, resumenDeLaEscala");
    expect(fuente).toContain("await guardar(o.exploracionId, nuevo, le.ctx.reuniones, o.email)");
  });
});

describe("volver a la versión anterior", () => {
  const rehecho = conElResumenNuevo(con({ resumenDeLaEscala: A }), B, QUIEN);
  const ELIAS = { por: "elias@smarteam.example", en: "2026-11-21T15:10:00.000Z" };

  it("restaura el Resumen como estaba y deja el de ahora como anterior", () => {
    const r = volverALaAnterior(rehecho, firmaParaVolver(porLaRed(rehecho)), ELIAS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.contenido.resumenDeLaEscala).toEqual(A);
    expect(r.contenido.resumenAnterior).toEqual({ resumen: B, en: ELIAS.en, por: ELIAS.por, motivo: "volver" });
  });

  it("se puede deshacer: volver otra vez trae el que se había reemplazado", () => {
    const una = volverALaAnterior(rehecho, firmaParaVolver(rehecho), ELIAS);
    if (!una.ok) throw new Error("no volvió");
    const dos = volverALaAnterior(una.contenido, firmaParaVolver(porLaRed(una.contenido)), ELIAS);
    expect(dos.ok && dos.contenido.resumenDeLaEscala).toEqual(B);
    expect(dos.ok && dos.contenido.resumenAnterior?.resumen).toEqual(A);
  });

  it("si otra persona cambió el Resumen entretanto, no pisa nada", () => {
    const vista = firmaParaVolver(rehecho);
    const editado = con({ ...rehecho, resumenDeLaEscala: { ...B, hicimos: { ...B.hicimos, texto: "Lo cambió otra persona." } } });
    expect(volverALaAnterior(editado, vista, ELIAS)).toEqual({ ok: false, motivo: "cambio" });
    // Ni si Nexus lo rehízo otra vez (la anterior ya es otra).
    const otraVuelta = conElResumenNuevo(rehecho, resumen("2026-11-21T15:20:00.000Z", "Otra."), QUIEN);
    expect(volverALaAnterior(otraVuelta, vista, ELIAS)).toEqual({ ok: false, motivo: "cambio" });
  });

  it("sin versión anterior guardada, no hay a qué volver", () => {
    const c = con({ resumenDeLaEscala: A });
    expect(volverALaAnterior(c, firmaParaVolver(c), ELIAS)).toEqual({ ok: false, motivo: "sin-anterior" });
  });

  it("el pedido solo acepta la firma y la intención", () => {
    expect(VolverAlResumenAnteriorSchema.safeParse({ volver: "anterior", firma: firmaParaVolver(rehecho) }).success).toBe(true);
    expect(VolverAlResumenAnteriorSchema.safeParse({ volver: "anterior", firma: "x".repeat(40) }).success).toBe(false);
    expect(VolverAlResumenAnteriorSchema.safeParse({ volver: "anterior", firma: "abc", resumen: A }).success).toBe(false);
  });
});

describe("volver no toca lo publicado", () => {
  const rehecho = conElResumenNuevo(con({ resumenDeLaEscala: A, notas: { "equipo:1": "Una nota." } }), B, QUIEN);
  const estado = (c: ContenidoDeExploracion): EstadoDeExploracion => ({
    contenido: c,
    propuesta: leerPropuesta(null),
    areas: ["ventas"],
    edicion: null,
    perfilCierre: null,
    perfilDespues: null,
    responsableEmail: null,
    archivada: false,
  });

  it("solo cambian el Resumen y su anterior: lo demás del contenido queda igual y la versión no sube", () => {
    const r = volverALaAnterior(rehecho, firmaParaVolver(rehecho), QUIEN);
    if (!r.ok) throw new Error("no volvió");
    const { resumenDeLaEscala: _a, resumenAnterior: _b, ...resto } = r.contenido;
    const { resumenDeLaEscala: _c, resumenAnterior: _d, ...antes } = rehecho;
    void [_a, _b, _c, _d];
    expect(resto).toEqual(antes);
    expect(cambioLoConfirmado(estado(rehecho), estado(r.contenido))).toBe(false);
    // Rehacer tampoco sube la versión por guardar la anterior.
    expect(cambioLoConfirmado(estado({ ...rehecho, resumenDeLaEscala: A, resumenAnterior: undefined }), estado(rehecho))).toBe(false);
  });

  it("el servidor solo escribe la exploración: ni la foto publicada (AccesoALaEscala) ni la publica, y respeta el candado", () => {
    const fuente = readFileSync(join(__dirname, "resumen-de-la-escala-server.ts"), "utf8");
    const inicio = fuente.indexOf("export async function volverAlResumenAnterior(");
    expect(inicio).toBeGreaterThan(0);
    const volver = fuente.slice(inicio);
    expect(volver).not.toMatch(/accesoALaEscala|publicada|publicar/i);
    expect(volver).toContain("corridaEnCurso(tx, o.exploracionId)");
    expect(volver).toContain("bloquearFila(tx, o.exploracionId)");
  });
});
