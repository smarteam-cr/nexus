/**
 * lib/canvas/load-canvas-context.test.ts
 *
 * `flattenCardData` es el embudo por el que un canvas se convierte en el CONTEXTO que lee
 * otro agente. Lo que se cae acá se cae en silencio: el resultado sigue siendo un string
 * válido, solo que más pobre, así que ni los tipos ni el build ni la pantalla lo notan.
 *
 * Pasó de verdad: las preguntas del plan de sesiones vivían en un array DENTRO de cada
 * sesión, y el filtro de `rest` exigía `typeof v === "string"` — se perdían enteras. Medido
 * sobre Wherex, el contexto de Exploración que leían Diagnóstico y Planificación pasó de
 * 13.750 a 16.492 caracteres al arreglarlo, con la sección del plan de 1.584 a 4.326.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { flattenCardData, ENTREGA_PREVIA_KEYS, formatEntregaPreviaBlock } from "./load-canvas-context";
import { ENTREGA_SECTION_DEFS } from "@/components/landing/configs/entrega.defs";

/** El shape real de la sección `sesiones` de Exploración (formato nuevo). */
const PLAN = {
  intro: "Tres sesiones ordenadas por dependencia.",
  sesiones: [
    {
      orden: "2",
      titulo: "Cómo venden hoy",
      objetivo: "Confirmar si hay uno o varios procesos de venta",
      participantes: "Gerente comercial + un vendedor senior",
      preguntas: [
        { q: "¿Por dónde entró el último negocio que cerraron?", repregunta: "Si contesta el ideal: pedile el caso real.", hecha: "si" },
        { q: "¿Quedó algún tipo de venta fuera del pipeline?", repregunta: "" },
      ],
    },
  ],
};

describe("flattenCardData: las preguntas del plan de sesiones llegan al agente", () => {
  const out = flattenCardData(PLAN);

  it("cada pregunta aparece con su texto completo", () => {
    expect(out).toContain("¿Por dónde entró el último negocio que cerraron?");
    expect(out).toContain("¿Quedó algún tipo de venta fuera del pipeline?");
  });

  it("la repregunta también — es la mitad del valor de la sección", () => {
    expect(out).toContain("Si contesta el ideal: pedile el caso real.");
  });

  // Las dos ausencias (`hecha`, `orden`) se prueban con la LÍNEA ENTERA, no buscando la
  // palabra suelta: "si" y "orden" aparecen en castellano corriente dentro del propio
  // contenido ("Confirmar SI hay…", "sesiones ORDENadas…") y un `not.toContain` daría un
  // falso positivo. Si el campo se colara, aparecería como un ` · valor` extra al final.
  it("la casilla del CSE NO llega al prompt", () => {
    expect(out).toContain(
      "- ¿Por dónde entró el último negocio que cerraron? — Si contesta el ideal: pedile el caso real.",
    );
  });

  it("el `orden` viejo de la IA tampoco: el orden real es el del array", () => {
    // La UI ya decidió numerar por posición porque el `orden` queda viejo al reordenar.
    // Imprimirlo acá solo puede contradecir el orden en que el agente lee las sesiones.
    // La línea completa también prueba lo otro: el título ENCABEZA, antes del "—".
    // El schema usa `titulo`, no `title`; sin agregarlo a la lista, "título — detalle"
    // se degradaba a un `·` más en el medio de la línea.
    expect(out).toContain(
      "- Cómo venden hoy — Confirmar si hay uno o varios procesos de venta · Gerente comercial + un vendedor senior",
    );
  });
});

describe("flattenCardData: lo que ya andaba sigue andando", () => {
  it("el formato viejo (`preguntas: string[]`) se aplana igual", () => {
    const out = flattenCardData({ sesiones: [{ titulo: "Vieja", preguntas: ["¿Pregunta suelta?"] }] });
    expect(out).toContain("- Vieja");
    expect(out).toContain("¿Pregunta suelta?");
  });

  it("el shape `{title, detail}` de las demás secciones no cambia", () => {
    const out = flattenCardData({ items: [{ title: "Facturan en Odoo", detail: "Handoff · ¿Qué vendimos?" }] });
    expect(out).toBe("- Facturan en Odoo — Handoff · ¿Qué vendimos?");
  });

  it("las claves técnicas se siguen salteando y la data basura no rompe", () => {
    expect(flattenCardData({ __lang: "es", diagram: { nodes: [] }, ok: "sí" })).toBe("ok: sí");
    expect(flattenCardData({ items: [null, 42, ""] as never })).toBe("");
  });

  it("el tope de profundidad sigue vigente (no se recorre un JSON infinito)", () => {
    const hondo = { a: [{ titulo: "n1", b: [{ titulo: "n2", c: [{ titulo: "n3", d: [{ titulo: "n4" }] }] }] }] };
    const out = flattenCardData(hondo);
    expect(out).toContain("n1");
    expect(out).toContain("n2");
    expect(out).not.toContain("n4");
  });
});

describe("Fase 10 — «qué logramos antes»: la Entrega previa entra al contexto", () => {
  /**
   * El canvas de Entrega se escribe, se publica, y hasta el 2026-08-17 ningún otro documento
   * lo volvía a leer. `loadPriorRelationshipContext` (DB-coupled, sin test directo posible sin
   * base) pasa a sumar la Entrega PUBLICADA más reciente del cliente. Como el circuito real no
   * se puede ejercitar acá, este archivo prueba las DOS partes puras —el allowlist y el
   * formateador— y un escaneo del código fuente confirma que la función las usa de verdad, con
   * los tres gates que la vuelven segura: solo PUBLICADA, solo confirmada, y nunca el proyecto
   * que se está generando ahora mismo.
   */

  const KEYS_REALES = new Set(ENTREGA_SECTION_DEFS.map((d) => d.key));

  it("⭐ cada key de ENTREGA_PREVIA_KEYS existe de verdad en el canvas de Entrega", () => {
    // Sin esto, un typo o un renombre de sección deja la Entrega previa vacía para siempre,
    // sin que nada avise — el mismo agujero que ya se cerró del lado de handoff-por-tipo.
    for (const k of ENTREGA_PREVIA_KEYS) {
      expect(KEYS_REALES.has(k), `"${k}" no es una sección real del canvas de Entrega`).toBe(true);
    }
  });

  it("⛔ y NO incluye las que llevan números sin vetar, lo interno o el CTA", () => {
    // Números (impacto/cumplimiento) de OTRO proyecto sin que el CSE los revise para ESTE
    // contexto; lo interno (pendientes) no es historia para afuera; portada/cierre no aportan.
    for (const excluida of ["portada", "cumplimiento", "impacto", "pendientes", "cierre"]) {
      expect(
        ENTREGA_PREVIA_KEYS as readonly string[],
        `"${excluida}" se coló en la allowlist de la Entrega previa`,
      ).not.toContain(excluida);
    }
  });

  it("formatEntregaPreviaBlock lleva el nombre del proyecto ADENTRO del texto", () => {
    // Mismo criterio que loadHandoffDelHermanoMayorContext: con `{texto, origen}` un caller
    // puede interpolar el texto y dejar caer el origen sin que nada falle.
    const out = formatEntregaPreviaBlock("Wherex", "Se implementaron los tres hubs.");
    expect(out).toContain("«Wherex»");
    expect(out).toContain("Entrega publicada al cliente");
    expect(out).toContain("Se implementaron los tres hubs.");
    expect(out.indexOf("Wherex")).toBeLessThan(out.indexOf("Se implementaron"));
  });

  describe("⛔ el escaneo del código: los tres gates están en la función real", () => {
    /* soloCodigo: los propios docblocks de arriba MENCIONAN publishedSnapshotAt, onlyConfirmed
       y ENTREGA_PREVIA_KEYS en prosa — sin blanquear comentarios, esta guarda pasaría en verde
       aunque el código real los perdiera. «Mencionar no es usar» (lección de duenio.test.ts). */
    const soloCodigo = (rel: string): string =>
      fs
        .readFileSync(path.join(process.cwd(), rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/^\s*\/\/.*$/gm, " ");

    const src = soloCodigo("lib/canvas/load-canvas-context.ts");
    const i = src.indexOf("export async function loadPriorRelationshipContext");
    const fin = src.indexOf("\nexport ", i + 10);
    const cuerpo = src.slice(i, fin > 0 ? fin : undefined);

    it("el ancla sigue viva y el tramo no salió vacío", () => {
      expect(i, "se movió o se borró loadPriorRelationshipContext: revisar esta guarda").toBeGreaterThan(0);
      expect(cuerpo.length, "el tramo salió vacío — la guarda no está mirando nada").toBeGreaterThan(500);
    });

    it("gate 1 — solo la Entrega PUBLICADA, nunca un borrador", () => {
      expect(cuerpo, "se perdió el filtro de publicado").toContain("publishedSnapshotAt");
      expect(cuerpo, 'el filtro dejó de exigir "not: null"').toMatch(/publishedSnapshotAt:\s*\{\s*not:\s*null\s*\}/);
    });

    it("gate 2 — solo lo CONFIRMADO por un humano, nunca contenido a medio revisar", () => {
      expect(cuerpo, "onlyConfirmed dejó de pedirse en true").toMatch(/onlyConfirmed:\s*true/);
    });

    it("gate 3 — filtrado por el allowlist, nunca el canvas completo", () => {
      expect(cuerpo, "el llamador dejó de usar ENTREGA_PREVIA_KEYS").toContain("ENTREGA_PREVIA_KEYS");
    });

    it("⚠ y el proyecto que se está generando ahora mismo queda afuera de la búsqueda", () => {
      // Sin esto, regenerar el handoff DESPUÉS de publicar la propia Entrega la citaría a
      // sí misma como "lo que se entregó antes" — un proyecto hablando de su propio futuro.
      const iEntrega = cuerpo.indexOf("projectCanvas.findFirst");
      expect(iEntrega, "no se encontró la query de la Entrega previa").toBeGreaterThan(0);
      const bloqueQuery = cuerpo.slice(iEntrega, cuerpo.indexOf("]);", iEntrega));
      expect(bloqueQuery, "la query de la Entrega no excluye el proyecto actual").toContain("excluirActual");
    });
  });
});
