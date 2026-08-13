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
import { CANVAS_DEF_BY_SLUG, HANDOFF_CANVAS, AGENT_GROUP_TO_CANVAS } from "@/lib/canvas/canvas-defs";
import { PROJECT_PROPERTIES } from "@/lib/hubspot/project-properties";
import { FULL_CYCLE_ORDER, SHORT_CYCLE_ORDER } from "@/lib/lifecycle/stage-engine";
import { DOC_PIEZAS, DOC_AGENTES, ETAPAS, SIN_SECCIONES } from "./contenido";
import { SECCIONES, anclaDeAgente, anclaDeDocumento } from "./anclas";
import {
  armarDocumentos,
  armarAgentes,
  armarPipelines,
  armarPropiedades,
  armarRecorrido,
  armarCicloCorto,
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

describe("Documentación · el recorrido sale del motor de etapas", () => {
  /* Hasta el 2026-08-02 estas etapas estaban escritas a mano y decían SIETE mientras el motor
     tenía NUEVE — el único bloque del módulo que incumplía su propia regla. Estos casos son lo
     que impide que vuelva a pasar. */
  it("muestra TODAS las etapas del ciclo completo, en el orden del motor", () => {
    expect(armarRecorrido().map((e) => e.clave)).toEqual([...FULL_CYCLE_ORDER]);
  });

  it("el ciclo corto también sale del motor", () => {
    expect(armarCicloCorto().map((e) => e.clave)).toEqual([...SHORT_CYCLE_ORDER]);
  });

  it("cada etapa del motor tiene su frase escrita a mano", () => {
    const claves = new Set([...FULL_CYCLE_ORDER, ...SHORT_CYCLE_ORDER]);
    const sinFrase = [...claves].filter((c) => !ETAPAS[c]?.trim());
    expect(
      sinFrase,
      `El motor de etapas ganó ${sinFrase.length} etapa(s) que la Documentación no explica.\n` +
        `Escribí su frase en lib/manual/contenido.ts → ETAPAS:\n` +
        sinFrase.map((c) => `  ${c}: "…",`).join("\n"),
    ).toEqual([]);
  });

  it("no sobran frases de etapas que el motor ya no tiene", () => {
    const claves = new Set([...FULL_CYCLE_ORDER, ...SHORT_CYCLE_ORDER]);
    expect(Object.keys(ETAPAS).filter((k) => !claves.has(k as never))).toEqual([]);
  });

  it("las etapas sin documento se declaran como hito, no como hueco", () => {
    /* Adopción, Validación de uso y Finalizado no tienen documento A PROPÓSITO (decisión de
       negocio 2026-07-25). Si dejaran de ser hitos, la doc tiene que enterarse.
       ⚠ ENTREGA salió de la lista el 2026-08-12: estrenó el documento de cierre. */
    const hitos = armarRecorrido().filter((e) => e.esHito).map((e) => e.clave);
    expect(hitos).toEqual(["ADOPCION", "VALIDACION_USO", "FINALIZADO"]);
  });

  it("el documento que cierra una etapa es el primario del mapa etapa↔pieza", () => {
    const planificacion = armarRecorrido().find((e) => e.clave === "PLANIFICACION");
    expect(planificacion?.cierraCon?.slug).toBe("timeline");
    expect(planificacion?.seCierraCon).toBe("Cronograma consensuado");
  });
});

describe("Documentación · anclas", () => {
  /* Media documentación existe para poder mandarle a alguien el pedazo exacto. Un documento sin
     ancla es un documento que no se puede compartir, y eso no puede pasar en silencio. */
  it("toda ancla es un fragmento de URL válido", () => {
    const anclas = [
      ...SECCIONES.map((s) => s.id),
      ...PIECES.map((p) => anclaDeDocumento(p.slug)),
    ];
    expect(anclas.filter((a) => !/^[a-z0-9-]+$/.test(a))).toEqual([]);
  });

  it("las anclas de documento no chocan con las de sección", () => {
    const secciones = new Set<string>(SECCIONES.map((s) => s.id));
    expect(PIECES.map((p) => anclaDeDocumento(p.slug)).filter((a) => secciones.has(a))).toEqual([]);
  });

  it("el ancla de un agente es su id, sin transformar", () => {
    // Si algún día se le agregara un prefijo, los links ya pegados en un chat morirían.
    expect(anclaDeAgente("agent-kickoff-canvas")).toBe("agent-kickoff-canvas");
  });
});

describe("Documentación · lo que no tiene secciones lo dice", () => {
  it("todo documento sin secciones explica por qué", () => {
    const mudos = armarDocumentos()
      .filter((d) => d.secciones.length === 0 && !SIN_SECCIONES[d.slug])
      .map((d) => d.slug);
    expect(
      mudos,
      "Estos documentos no derivan secciones y tampoco explican por qué — el lector no puede " +
        "distinguir «no aplica» de «falta documentar». Agregalos a SIN_SECCIONES en contenido.ts.",
    ).toEqual([]);
  });

  it("no sobran explicaciones de documentos que sí tienen secciones", () => {
    const conSecciones = new Set(
      armarDocumentos().filter((d) => d.secciones.length > 0).map((d) => d.slug),
    );
    expect(Object.keys(SIN_SECCIONES).filter((k) => conSecciones.has(k))).toEqual([]);
  });
});

describe("Documentación · agentes", () => {
  const filas: FilaDeAgente[] = [
    { id: "agent-kickoff-canvas", name: "Kickoff", status: "ACTIVE", agentType: "CANVAS_PROJECT", agentGroup: "kickoff" },
    { id: "agent-post-session", name: "Post sesión", status: "ACTIVE", agentType: "SESSION_PROCESSOR", agentGroup: null },
    { id: "agent-viejo", name: "Viejo", status: "INACTIVE", agentType: "CANVAS_PROJECT", agentGroup: null },
  ];
  const cats = armarAgentes(filas);

  it("la explicación sale del contenido curado, NO de la base", () => {
    /* El texto que se ve tiene que ser el del repo. Si volviera a salir de `Agent.description`,
       cualquiera podría publicar jerga —o un prompt— a toda la empresa desde /agents, sin
       deploy y sin que ningún test se entere. Ya pasó. */
    const k = cats.flatMap((c) => c.agentes).find((a) => a.id === "agent-kickoff-canvas")!;
    expect(k.descripcion).toBe(DOC_AGENTES.kickoff);
  });

  it("un agente sin grupo no inventa explicación", () => {
    expect(cats.flatMap((c) => c.agentes).find((a) => a.id === "agent-post-session")!.descripcion).toBeNull();
  });

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

  it("cada grupo de agentes que escribe un documento tiene su explicación", () => {
    const sinFrase = Object.keys(AGENT_GROUP_TO_CANVAS).filter(
      (g) => (DOC_AGENTES[g]?.trim().length ?? 0) < 20,
    );
    expect(
      sinFrase,
      `Hay ${sinFrase.length} grupo(s) de agentes sin explicar en la Documentación.\n` +
        `Escribí su frase en lib/manual/contenido.ts → DOC_AGENTES:\n` +
        sinFrase.map((g) => `  ${g}: "…",`).join("\n"),
    ).toEqual([]);
  });

  it("no sobran explicaciones de grupos que ya no escriben ningún documento", () => {
    const grupos = new Set(Object.keys(AGENT_GROUP_TO_CANVAS));
    expect(Object.keys(DOC_AGENTES).filter((g) => !grupos.has(g))).toEqual([]);
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

  it("la página tampoco lee la descripción libre de la base", () => {
    /* `Agent.description` se edita desde /agents sin deploy, sin test y sin regla de audiencia:
       es la MISMA clase de fuga que el prompt, con otra puerta. La explicación de cada agente
       vive curada en contenido.ts.

       Se busca la forma del `select` de Prisma y no la palabra suelta: `description` también es
       una prop legítima del PageHeader, y un test que la prohibiera entera obligaría a quitar el
       subtítulo de la pantalla para pasar. */
    expect(sinComentarios("app/(shell)/documentacion/page.tsx")).not.toMatch(/description:\s*true/);
  });

  it("el tipo que consume el armado tampoco los declara", () => {
    const src = sinComentarios("lib/manual/armar.ts");
    const iface = src.slice(src.indexOf("interface FilaDeAgente"), src.indexOf("interface AgenteDoc"));
    expect(iface).not.toContain("systemPrompt");
    expect(iface).not.toContain("additionalInstructions");
  });
});
