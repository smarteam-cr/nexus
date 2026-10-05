import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Hallazgo } from "./foto";
import { fotoDePrueba, HOY } from "./__fixtures__/foto";
import { armarVista } from "./vista";

/**
 * lib/auditoria-portal/vista.test.ts — LA FICHA NO DECIDE NADA: el estado de cada sección y «Qué
 * sigue» salen de acá.
 */

const PORTAL = { titulo: "Portal de prueba", esDelSistema: true, portalId: "1", dominio: null };

const hallazgo = (id: string, seccion: Hallazgo["seccion"], estado: Hallazgo["estado"]): Hallazgo => ({
  id,
  seccion,
  severidad: "atencion",
  titulo: id,
  hallazgo: "…",
  porQueImporta: "",
  recomendacion: "",
  decision: "corregir",
  evidencia: [],
  pregunta: null,
  estado,
});

const vista = (cambios: Parameters<typeof fotoDePrueba>[0] = {}, ahora = HOY) =>
  armarVista({ audit: { id: "a1", name: "Auditoría" }, foto: fotoDePrueba(cambios), portal: PORTAL, anteriores: [], ahora });

const analisis = (hallazgos: Hallazgo[]) => ({
  generadoEn: HOY.toISOString(),
  modelo: "modelo",
  agentRunId: "r1",
  resumen: "Resumen.",
  hallazgos,
  preguntas: [],
  descartadosPorCifras: 0,
  etiquetas: {},
});

describe("armarVista", () => {
  it("las sugerencias se cuentan en su sección y en el Resumen", () => {
    const v = vista({ analisis: analisis([hallazgo("h1", "workflows", "sugerido"), hallazgo("h2", "empresas", "sugerido"), hallazgo("h3", "workflows", "confirmado")]) });
    const fila = (k: string) => v.barra.find((f) => f.clave === k)!;
    expect(fila("resumen").sugeridas).toBe(2);
    expect(fila("workflows").sugeridas).toBe(1);
    expect(fila("ciclo").sugeridas).toBe(1);
    expect(v.queSigue.accion).toEqual({ etiqueta: "Revisar los 2 →", a: "resumen" });
  });

  it("lo que no se pudo leer va primero en «Qué sigue» y deja la sección sin leer", () => {
    const v = vista({ lecturas: { version: 1, intentos: 67, fallidas: [{ bloque: "propietarios", que: "Los propietarios", motivo: "sin_permiso", status: 403 }] } });
    expect(v.barra.find((f) => f.clave === "propietarios")!.estado).toBe("sin_leer");
    expect(v.queSigue.accion?.a).toBe("comprobar");
    expect(v.pendientes.sinLeer.map((c) => c.clave)).toEqual(["lectura:propietarios"]);
  });

  it("sin sugerencias ni lecturas fallidas, sigue lo que la API no muestra", () => {
    const v = vista({ analisis: analisis([hallazgo("h1", "workflows", "confirmado")]) });
    expect(v.queSigue.texto).toMatch(/Comprueba a mano/);
    expect(v.pendientes.abiertos).toBe(v.pendientes.api.length);
  });

  it("una corrida colgada más de 15 minutos se da por perdida", () => {
    const v = vista({ estado: "capturando", capturedAt: undefined, iniciadaEn: "2026-10-04T11:00:00.000Z" });
    expect(v.estado).toBe("perdida");
    expect(v.queSigue.accion?.a).toBe("volver-a-correr");
    expect(vista({ estado: "capturando", capturedAt: undefined, iniciadaEn: "2026-10-04T11:55:00.000Z" }).estado).toBe("capturando");
  });

  it("volver a generar el análisis no la da por perdida: se mide desde que arrancó el análisis, no desde la lectura", () => {
    /* La lectura del portal es de ayer y el análisis arrancó hace dos minutos. Lo que lo pone en rojo:
       volver a medir «analizando» desde `capturedAt` (salía «perdida», sin refresco y con «Volver a correr»). */
    const ahora = new Date("2026-10-05T12:00:00.000Z");
    const regenerando = { estado: "analizando" as const, capturedAt: "2026-10-04T12:00:00.000Z", analisisIniciadoEn: "2026-10-05T11:58:00.000Z" };
    const v = vista(regenerando, ahora);
    expect(v.estado).toBe("analizando");
    expect(v.queSigue.accion).toBeNull();
    // Y si de verdad se colgó, se da por perdida igual.
    expect(vista({ ...regenerando, analisisIniciadoEn: "2026-10-05T11:30:00.000Z" }, ahora).estado).toBe("perdida");
    // La marca la deja quien arranca el análisis (servidor.ts), en el mismo cambio que lo pone «analizando».
    const servidor = readFileSync(join(process.cwd(), "lib/auditoria-portal/servidor.ts"), "utf8");
    expect(servidor).toMatch(/estado: "analizando", analisisIniciadoEn: new Date\(\)\.toISOString\(\)/);
  });

  it("deriva los creadores y los workflows sin cambios hace un año", () => {
    const v = vista();
    expect(v.derivados.creadores?.deQuienesYaNoEstan).toBe(2);
    expect(v.derivados.workflowsSinCambiosHaceUnAnio).toEqual(["w1", "w3"]);
    expect(v.barra.find((f) => f.clave === "workflows")!.estado).toBe("pendiente");
    expect(v.barra.find((f) => f.clave === "usuarios")!.aviso).toBe("sin equipos");
  });
});
