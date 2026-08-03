/**
 * lib/manual/manual.test.ts — que la Documentación no pueda mentir.
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * Una documentación de producto se pudre en silencio: alguien agrega un canvas, nadie toca la
 * doc, y a los tres meses la pantalla describe un producto que ya no existe. Acá la mitad se
 * DERIVA de los registros, así que esa parte se actualiza sola; lo que este test cubre es la
 * costura — que la parte escrita a mano no se quede atrás de la derivada.
 *
 * El otro frente es de PRIVACIDAD: esta sección la ve TODO el equipo (no tiene gate), mientras
 * que el catálogo de `/agents` está detrás de un permiso. Los prompts de los agentes son
 * calibración interna y no pueden cruzar esa frontera por descuido.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PIECES } from "@/lib/pieces/registry";
import { CANVAS_DEF_BY_SLUG, HANDOFF_CANVAS } from "@/lib/canvas/canvas-defs";
import { PROJECT_PROPERTIES } from "@/lib/hubspot/project-properties";
import { DOC_PIEZAS } from "./contenido";
import {
  armarDocumentos,
  armarAgentes,
  armarPipelines,
  armarPropiedades,
  totalPropiedades,
  type FilaDeAgente,
} from "./armar";

describe("Documentación · lo escrito a mano no se queda atrás de lo derivado", () => {
  it("cada documento del registro tiene su explicación", () => {
    const sinDoc = PIECES.filter((p) => !DOC_PIEZAS[p.slug]).map((p) => `${p.label} (${p.slug})`);
    expect(
      sinDoc,
      `Agregaste ${sinDoc.length} documento(s) al registro sin explicarlos en la Documentación.\n` +
        `Escribí su entrada en lib/manual/contenido.ts → DOC_PIEZAS:\n` +
        sinDoc.map((s) => `  "${s}": { paraQue: "…", cuando: "…" },`).join("\n"),
    ).toEqual([]);
  });

  it("no sobran explicaciones de documentos que ya no existen", () => {
    const slugs = new Set(PIECES.map((p) => p.slug));
    const huerfanas = Object.keys(DOC_PIEZAS).filter((k) => !slugs.has(k));
    expect(
      huerfanas,
      "Hay explicaciones de documentos que ya no están en el registro — borralas o corregí la clave.",
    ).toEqual([]);
  });

  it("ninguna explicación quedó vacía", () => {
    const flojas = Object.entries(DOC_PIEZAS)
      .filter(([, d]) => d.paraQue.trim().length < 20 || d.cuando.trim().length < 20)
      .map(([k]) => k);
    expect(flojas, "Estas explicaciones están vacías o son demasiado cortas para servir.").toEqual([]);
  });
});

describe("Documentación · la parte derivada refleja los registros", () => {
  const docs = armarDocumentos();

  it("muestra TODOS los documentos, sin perder ni duplicar ninguno", () => {
    expect(docs).toHaveLength(PIECES.length);
    expect(new Set(docs.map((d) => d.slug)).size).toBe(PIECES.length);
  });

  it("las secciones salen en el orden REAL en que se crean", () => {
    for (const d of docs) {
      const def = CANVAS_DEF_BY_SLUG[d.slug];
      if (!def) continue; // el handoff va aparte; las piezas sin def de secciones no aplican
      expect(d.secciones, `secciones de ${d.slug}`).toEqual(def.sections.map((s) => s.label));
    }
  });

  it("el handoff muestra sus secciones aunque no esté en el registro de canvases", () => {
    /* `CANVAS_DEF_BY_SLUG` lo excluye a propósito (no se activa desde el desplegable), pero es
       el documento con el que arranca todo — mostrarlo con cero secciones era el peor error
       posible de esta pantalla. */
    const handoff = docs.find((d) => d.slug === "handoff");
    expect(handoff?.secciones).toEqual(HANDOFF_CANVAS.sections.map((s) => s.label));
    expect(handoff?.secciones.length).toBeGreaterThan(0);
  });

  it("el kickoff se declara como visible para el cliente y el de exploración no", () => {
    // Dos casos concretos: si la derivación se rompe, esto lo dice en lenguaje de negocio.
    expect(docs.find((d) => d.slug === "kickoff")?.etiquetas).toContain("Lo ve el cliente");
    expect(docs.find((d) => d.slug === "exploration")?.etiquetas).toContain("Uso interno");
  });

  it("los documentos del recorrido van antes que los que no pertenecen a una etapa", () => {
    const conEtapa = docs.findLastIndex((d) => d.etapa !== null);
    const sinEtapa = docs.findIndex((d) => d.etapa === null);
    expect(sinEtapa).toBeGreaterThan(-1);
    expect(sinEtapa, "un documento sin etapa quedó en medio del recorrido").toBeGreaterThan(conEtapa);
  });
});

describe("Documentación · agentes", () => {
  const filas: FilaDeAgente[] = [
    { id: "agent-kickoff-canvas", name: "Kickoff", description: "Arma el kickoff.", status: "ACTIVE", agentType: "CANVAS_PROJECT", agentGroup: "kickoff" },
    { id: "agent-post-session", name: "Post sesión", description: null, status: "ACTIVE", agentType: "SESSION_PROCESSOR", agentGroup: null },
    { id: "agent-viejo", name: "Viejo", description: null, status: "INACTIVE", agentType: "CANVAS_PROJECT", agentGroup: null },
  ];
  const cats = armarAgentes(filas);

  it("agrupa con el mismo criterio que el catálogo de /agents", () => {
    expect(cats.find((c) => c.key === "canvas")?.agentes.map((a) => a.id)).toEqual(["agent-kickoff-canvas"]);
    expect(cats.find((c) => c.key === "session")?.agentes.map((a) => a.id)).toEqual(["agent-post-session"]);
    expect(cats.find((c) => c.key === "library")?.agentes.map((a) => a.id)).toEqual(["agent-viejo"]);
  });

  it("dice en qué documento escribe cada uno y si está activo", () => {
    const k = cats.flatMap((c) => c.agentes).find((a) => a.id === "agent-kickoff-canvas")!;
    expect(k.escribeEn).toBe("Kickoff");
    expect(k.disparo).toBe("Canvas Kickoff");
    expect(k.activo).toBe(true);
    expect(cats.flatMap((c) => c.agentes).find((a) => a.id === "agent-viejo")!.activo).toBe(false);
  });

  it("no muestra categorías vacías", () => {
    expect(armarAgentes([]).length).toBe(0);
    expect(cats.every((c) => c.agentes.length > 0)).toBe(true);
  });
});

describe("Documentación · HubSpot", () => {
  it("lista los pipelines reales del portal con sus etapas", () => {
    const pipes = armarPipelines();
    expect(pipes.length).toBeGreaterThanOrEqual(3);
    for (const p of pipes) {
      expect(p.help.length, `${p.label} sin explicación`).toBeGreaterThan(20);
      expect(p.etapas.length, `${p.label} sin etapas`).toBeGreaterThan(0);
      expect(p.etapas.some((e) => e.cierra), `${p.label} sin etapa de cierre`).toBe(true);
    }
  });

  it("ninguna propiedad leída se queda fuera de los grupos", () => {
    const mostradas = armarPropiedades().flatMap((g) => g.props);
    expect(new Set(mostradas).size).toBe(totalPropiedades());
    expect([...PROJECT_PROPERTIES].sort()).toEqual([...mostradas].sort());
  });
});

describe("Documentación · privacidad", () => {
  /* La sección NO tiene gate: la ve todo el equipo. El catálogo de /agents, en cambio, está
     detrás del permiso `agentes.read` justamente porque muestra y edita los prompts. Traer un
     prompt acá sería mover esa frontera sin decidirlo. */
  /* Se escanea el CÓDIGO, no los comentarios: los dos archivos EXPLICAN por qué el prompt no
     está, y esa explicación es justamente lo que hay que conservar. Un test que la prohibiera
     empujaría a borrar el comentario — el resultado opuesto al que se busca. */
  const sinComentarios = (rel: string) =>
    fs
      .readFileSync(path.join(process.cwd(), rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");

  it("la página no lee el prompt de los agentes", () => {
    const src = sinComentarios("app/(shell)/documentacion/page.tsx");
    expect(src).not.toContain("systemPrompt");
    expect(src).not.toContain("additionalInstructions");
  });

  it("el tipo que consume el armado tampoco los declara", () => {
    const src = sinComentarios("lib/manual/armar.ts");
    const iface = src.slice(src.indexOf("interface FilaDeAgente"), src.indexOf("interface AgenteDoc"));
    expect(iface).not.toContain("systemPrompt");
    expect(iface).not.toContain("additionalInstructions");
  });
});
