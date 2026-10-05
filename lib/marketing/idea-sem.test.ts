/**
 * lib/marketing/idea-sem.test.ts — cómo se parte la descripción de una idea de SEM (rediseño de Marketing, 2026-10-04).
 *
 * Las descripciones son reales. La regla que importa: nunca se pierde texto, y una frase con dos puntos que no es
 * un rótulo sigue en su campo.
 */
import { describe, expect, it } from "vitest";
import { keywordsDe, seccionesDeIdeaSem } from "./idea-sem";

const BUSQUEDA =
  "Objetivo: capturar demanda activa de directores de ventas y gerentes comerciales en LATAM que sienten que su CRM no está generando impacto. Audiencia: empresas medianas/grandes B2B con CRM activo pero baja adopción o pipeline desordenado. Ángulo: el problema no es el CRM, es el modelo de uso — Smarteam ayuda a transformar la operación, no solo a configurar la herramienta. Keywords sugeridas: 'cómo mejorar adopción de CRM', 'CRM que no funciona', 'equipo de ventas no usa el CRM', 'RevOps LATAM'.";

const REDES =
  "Objetivo: generar awareness y leads calificados entre directores de ventas y CEOs de empresas medianas en LATAM (México, Colombia, Argentina, Chile, Perú). Audiencia: cargos de Director Comercial, VP de Ventas, Gerente de Ventas, CEO en empresas de 100+ empleados. Ángulo/mensaje: '¿Tu equipo dedica más tiempo a cargar el CRM que a cerrar deals? Eso tiene solución.' Creatividad sugerida: imagen con el contraste visual entre tiempo administrativo vs. tiempo de venta, con CTA a contenido educativo (diagnóstico o artículo) — no a demo directa.";

describe("seccionesDeIdeaSem", () => {
  it("separa objetivo, audiencia, ángulo y keywords, con la primera letra en mayúscula", () => {
    const s = seccionesDeIdeaSem(BUSQUEDA);
    expect(s.map((x) => x.campo)).toEqual(["objetivo", "audiencia", "angulo", "keywords"]);
    expect(s[0].texto.startsWith("Capturar demanda activa")).toBe(true);
    expect(s[3].keywords).toEqual([
      "cómo mejorar adopción de CRM",
      "CRM que no funciona",
      "equipo de ventas no usa el CRM",
      "RevOps LATAM",
    ]);
  });

  it("junta los rótulos que dicen lo mismo y respeta un rótulo después de una comilla", () => {
    const s = seccionesDeIdeaSem(REDES);
    expect(s.map((x) => x.campo)).toEqual(["objetivo", "audiencia", "angulo", "formato"]);
    expect(s[2].texto).toBe("«¿Tu equipo dedica más tiempo a cargar el CRM que a cerrar deals? Eso tiene solución.»");
    expect(s[3].rotulo).toBe("Formato y creatividad");
  });

  it("el CTA dentro de una frase no es un rótulo", () => {
    const s = seccionesDeIdeaSem(REDES);
    expect(s.some((x) => x.campo === "cta")).toBe(false);
  });

  it("una frase con dos puntos que no es rótulo se queda en su campo", () => {
    const s = seccionesDeIdeaSem("Objetivo: ordenar el pipeline. El tono es consultivo: sin vender. Audiencia: CEOs.");
    expect(s.map((x) => x.campo)).toEqual(["objetivo", "audiencia"]);
    expect(s[0].texto).toBe("Ordenar el pipeline. El tono es consultivo: sin vender.");
  });

  it("lo que viene antes del primer rótulo queda como descripción, y sin rótulos no se pierde nada", () => {
    const s = seccionesDeIdeaSem("Campaña de awareness en LinkedIn. Objetivo: posicionar a Smarteam.");
    expect(s.map((x) => x.campo)).toEqual(["intro", "objetivo"]);
    expect(seccionesDeIdeaSem("Una idea sin rótulos.")).toEqual([
      { campo: "intro", rotulo: "Descripción", texto: "Una idea sin rótulos." },
    ]);
    expect(seccionesDeIdeaSem("   ")).toEqual([]);
  });
});

describe("keywordsDe", () => {
  it("sin comillas, separa por comas y no repite", () => {
    expect(keywordsDe("CRM LATAM, RevOps, crm latam.")).toEqual(["CRM LATAM", "RevOps"]);
  });
});
