/**
 * lib/knowledge/escala-v5-documentos.test.ts — la Escala que reciben los agentes es la 5.2, entera.
 *
 * Correr: `npx vitest run lib/knowledge/escala-v5-documentos.test.ts --project unit`.
 *
 * Cierra las dos formas en que un agente terminó midiendo con otra vara: recibir una escala vieja
 * (Conocimientos tuvo la v4 hasta el 2026-09-12) y recibir el reglamento recortado — el cargador
 * omite completo lo que no entra en el tope, sin error.
 */
import { describe, it, expect } from "vitest";
import {
  construirDocumentosDeEscala,
  cuerpoDe,
  versionDeContenido,
} from "./escala-v5-documentos";
import {
  leerFuente,
  TOPE_ESCALA_COMPLETA,
  TOPE_ESCALA_RESUMEN,
  VERSION_VIGENTE,
} from "@/lib/escala/fuente";
import { leerReglamentoV5, NIVELES_V5 } from "@/lib/documentacion/semillas/escala-v5";

const docs = construirDocumentosDeEscala();

/** Como lo arma `loadKnowledgeByTags`: el título como encabezado y el contenido debajo. */
const bloqueCargado = (d: { titulo: string; contenido: string }) => `## ${d.titulo}\n${d.contenido.trim()}`;

describe("la Escala que leen los agentes es la 5.2", () => {
  it("los dos documentos se declaran vigentes y no traen rastros de una escala vieja", () => {
    expect(docs.version).toBe(VERSION_VIGENTE);
    for (const d of [docs.completo, docs.resumen]) {
      const lectura = leerFuente(d.contenido);
      expect(lectura.vigente, d.titulo).toBe(true);
      expect(lectura.viejas, d.titulo).toEqual([]);
    }
  });

  it("⛔ el reglamento entra ENTERO en el tope del Diagnóstico", () => {
    /* La edición que la pone en rojo: que el reglamento crezca por encima del tope. Ahí el cargador
       lo omite completo y el Diagnóstico puntúa sin vara — sin un solo error. */
    expect(bloqueCargado(docs.completo).length).toBeLessThan(TOPE_ESCALA_COMPLETA);
  });

  it("el reglamento conserva lo que el lector de Documentación no trae: las reglas y el anexo", () => {
    expect(docs.completo.contenido).toContain("# Reglas para asignar el nivel");
    expect(docs.completo.contenido).toContain("## Formato de salida");
    expect(docs.completo.contenido).not.toMatch(/^---\ndocumento:/);
  });

  it("el resumen nombra las 24 dimensiones y las que no tienen Funcional, y entra en su tope", () => {
    const reglamento = leerReglamentoV5();
    const dimensiones = reglamento.areas.flatMap((a) => a.dimensiones);
    expect(dimensiones).toHaveLength(24);
    for (const d of dimensiones) expect(docs.resumen.contenido).toContain(`- ${d.id} ${d.nombre} — `);
    for (const d of dimensiones.filter((x) => x.sinFuncional)) {
      expect(docs.resumen.contenido).toContain(`${d.id} ${d.nombre}`);
    }
    expect(bloqueCargado(docs.resumen).length).toBeLessThan(TOPE_ESCALA_RESUMEN);
  });

  it("el resumen trae cómo se lee: piso, capas, brecha y remedición", () => {
    const r = docs.resumen.contenido;
    expect(r).toContain("dimensión más débil");
    expect(r).toContain("Base más alta que producción");
    expect(r).toContain("entre 60 y 90 días");
    for (const nivel of NIVELES_V5) expect(r).toContain(`### ${nivel}`);
  });

  it("el resumen dice que en preventa el nivel es un estimado, y que la entrega no declara uno nuevo", () => {
    expect(docs.resumen.contenido).toContain("ESTIMADO");
    expect(docs.resumen.contenido).toContain("no se declara un nivel nuevo");
  });

  it("⛔ un encabezado que desaparece del reglamento rompe acá, no en silencio", () => {
    expect(() => cuerpoDe("\n# Otra cosa\ntexto", "## Volver a medir")).toThrow(/Volver a medir/);
  });

  it("la versión de un contenido sembrado se reconoce; la v4 no declaraba ninguna", () => {
    expect(versionDeContenido(docs.completo.contenido)).toBe(VERSION_VIGENTE);
    expect(versionDeContenido("# Escala de Rendimiento\n\nCapacidad/Output 60/40")).toBeNull();
  });
});

describe("las marcas de escala vieja", () => {
  it("reconocen cada vocabulario viejo", () => {
    expect(leerFuente("ponderación Capacidad / Output 60/40").viejas).toContain("Capacidad/Output (v4)");
    expect(leerFuente("fase Tailor del ciclo").viejas).toContain("fases del marco Loop (v4)");
    expect(leerFuente("el Loop Marketing").viejas).toContain("marco Loop (v4)");
    expect(leerFuente("escala_nivel 0-4").viejas).toContain("escala 0-4");
    expect(leerFuente("Ordenamiento, Velocidad y Efectividad").viejas).toContain(
      "Ordenamiento/Velocidad/Efectividad (0-4)",
    );
  });

  it("no confunden fechas, horas ni SmartLoop con una escala vieja", () => {
    expect(leerFuente("Reunión del 2026-10-04 de 10-45, sobre SmartLoop").viejas).toEqual([]);
  });

  it("sin versión o sin capas, un texto no es la vigente", () => {
    expect(leerFuente("Deficiente, Inicial, Funcional, Eficiente, Óptimo").vigente).toBe(false);
    expect(leerFuente(`versión ${VERSION_VIGENTE}, sin capas`).vigente).toBe(false);
  });
});
