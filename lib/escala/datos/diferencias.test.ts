/**
 * lib/escala/datos/diferencias.test.ts — la bitácora: cada cambio, anclado a lo que tocó.
 *
 * Se cambia una cosa en la escala de juguete y se mira que la bitácora diga exactamente esa, con el
 * ancla que usa el resto de Nexus (`1.1.F1`, `1.1.F`, `1.2`…), el campo, el antes y el después.
 */
import { describe, expect, it } from "vitest";
import { leerArchivoDeLaEscala } from "@/lib/escala/documento/archivos";
import { cambiosEntre, pedazoQueCambia, resumenDeCambios } from "./diferencias";
import { importarEscala } from "./importar";
import { MINI_EN_UNA_FORMA } from "./mini.fixture";

const BASE = importarEscala(MINI_EN_UNA_FORMA);

/** Los cambios de la escala de juguete a la misma con un reemplazo. */
function cambiosAl(de: string, a: string) {
  if (!MINI_EN_UNA_FORMA.includes(de)) throw new Error(`la escala de juguete no trae «${de}»`);
  return cambiosEntre(BASE, importarEscala(MINI_EN_UNA_FORMA.replace(de, a)));
}

describe("qué cambió entre dos versiones", () => {
  it("la misma escala no tiene cambios (tampoco la publicada)", () => {
    expect(cambiosEntre(BASE, BASE)).toEqual([]);
    const real = importarEscala(leerArchivoDeLaEscala("escala"));
    expect(cambiosEntre(real, structuredClone(real))).toEqual([]);
  });

  it("el texto de un criterio", () => {
    expect(cambiosAl("Hay un pipeline configurado.", "Hay un pipeline con sus etapas.")).toEqual([
      { ancla: "1.1.F1", tipoDeAncla: "criterio", accion: "cambiado", campo: "texto", antes: "Hay un pipeline configurado.", despues: "Hay un pipeline con sus etapas." },
    ]);
  });

  it("una marca y un requerido de un criterio", () => {
    expect(cambiosAl("`[1.1.F1 · comprobable]`", "`[1.1.F1 · comprobable · riesgo]`")).toEqual([
      { ancla: "1.1.F1", tipoDeAncla: "criterio", accion: "cambiado", campo: "riesgo", antes: "no", despues: "sí" },
    ]);
    expect(cambiosAl("`[1.1.F2 · declarado · hábito · venta con equipo]`", "`[1.1.F2 · declarado · hábito · venta con equipo · requiere 1.1.F1]`")).toEqual([
      { ancla: "1.1.F2", tipoDeAncla: "criterio", accion: "cambiado", campo: "requiere", antes: null, despues: "1.1.F1" },
    ]);
  });

  it("un criterio nuevo y uno que sale", () => {
    const nuevo = "- El pipeline tiene dueño. `[1.1.F4 · declarado]`";
    expect(cambiosAl("`[1.1.F3 · comprobable · riesgo]`\n", `\`[1.1.F3 · comprobable · riesgo]\`\n${nuevo}\n`)).toEqual([
      { ancla: "1.1.F4", tipoDeAncla: "criterio", accion: "agregado", campo: null, antes: null, despues: nuevo },
    ]);
    expect(cambiosAl("- El proceso se refina en cadencia. `[1.1.E2 · declarado · hábito]`\n", "")).toEqual([
      { ancla: "1.1.E2", tipoDeAncla: "criterio", accion: "quitado", campo: null, antes: "- El proceso se refina en cadencia. `[1.1.E2 · declarado · hábito]`", despues: null },
    ]);
  });

  it("la frase de un nivel y la pregunta de una dimensión", () => {
    expect(cambiosAl("**Funcional.** Maquinaria base.", "**Funcional.** La maquinaria base.")).toEqual([
      { ancla: "1.1.F", tipoDeAncla: "nivel", accion: "cambiado", campo: "frase", antes: "Maquinaria base.", despues: "La maquinaria base." },
    ]);
    expect(cambiosAl("¿Qué pasa cuando un negocio se enfría?", "¿Qué pasa cuando un negocio se detiene?")).toEqual([
      { ancla: "1.2", tipoDeAncla: "dimension", accion: "cambiado", campo: "pregunta", antes: "¿Qué pasa cuando un negocio se enfría?", despues: "¿Qué pasa cuando un negocio se detiene?" },
    ]);
  });

  it("los mismos criterios en otro orden", () => {
    const a = "- Hay un pipeline configurado. `[1.1.F1 · comprobable]`\n- La definición se aplica igual. `[1.1.F2 · declarado · hábito · venta con equipo]`";
    const b = "- La definición se aplica igual. `[1.1.F2 · declarado · hábito · venta con equipo]`\n- Hay un pipeline configurado. `[1.1.F1 · comprobable]`";
    expect(cambiosAl(a, b)).toEqual([
      { ancla: "1.1.F", tipoDeAncla: "nivel", accion: "cambiado", campo: "orden", antes: "1.1.F1 1.1.F2 1.1.F3", despues: "1.1.F2 1.1.F1 1.1.F3" },
    ]);
  });

  it("el texto, por la sección donde está", () => {
    expect(cambiosAl("**Equipos chicos.** Los roles se leen como la función escrita.", "**Equipos chicos.** Los roles se leen como la función.")).toMatchObject([
      { ancla: "texto:Parte 2 — Cómo se aplica / Cómo se leen los criterios", tipoDeAncla: "texto", accion: "cambiado", campo: "texto" },
    ]);
  });

  it("el encabezado", () => {
    expect(cambiosAl("version: 9.9.9", "version: 9.10.0")).toEqual([
      { ancla: "encabezado:version", tipoDeAncla: "encabezado", accion: "cambiado", campo: "valor", antes: "9.9.9", despues: "9.10.0" },
    ]);
  });

  it("lo que dice una edición, anclado a la edición", () => {
    expect(cambiosAl("Cada venta de la tienda entra sola al sistema.", "Cada venta entra sola al sistema.")).toEqual([
      {
        ancla: "edicion:tiendas/1.2.F1",
        tipoDeAncla: "criterio",
        accion: "cambiado",
        campo: "texto",
        antes: "Cada venta de la tienda entra sola al sistema.",
        despues: "Cada venta entra sola al sistema.",
      },
    ]);
    expect(cambiosAl("*No aplican:* `1.2.I1`.", "*No aplican:* `1.2.I1`, `1.2.E1`.")).toMatchObject([
      { ancla: "edicion:tiendas/1.2", tipoDeAncla: "dimension", campo: "noAplican", antes: "1.2.I1", despues: "1.2.I1, 1.2.E1" },
    ]);
    expect(cambiosAl("| Hábito | Rutina de la tienda |", "| Hábito | Costumbre de la tienda |")).toMatchObject([
      { ancla: "edicion:tiendas", tipoDeAncla: "edicion", campo: "palabras" },
    ]);
  });

  it("de un texto largo se muestra solo el pedazo que cambió", () => {
    const antes = "Los deals estancados se reconocen a tiempo y tienen un paso de reactivación acordado, no la improvisación de cada vendedor.";
    const despues = "Los deals estancados se reconocen a tiempo y tienen un paso de reactivación acordado, no la improvisación de cada vendedor (en 14 días).";
    expect(pedazoQueCambia(antes, despues, 10)).toEqual({ antes: "…a vendedor.", despues: "…a vendedor (en 14 días)." });
    expect(pedazoQueCambia("corto", "corta")).toEqual({ antes: "corto", despues: "corta" });
  });

  it("el resumen", () => {
    const cambios = cambiosAl("`[1.1.F3 · comprobable · riesgo]`\n", "`[1.1.F3 · comprobable · riesgo]`\n- Otro. `[1.1.F4 · declarado]`\n");
    expect(resumenDeCambios(cambios)).toBe("1 agregado");
    expect(resumenDeCambios([])).toBe("sin cambios");
  });
});
