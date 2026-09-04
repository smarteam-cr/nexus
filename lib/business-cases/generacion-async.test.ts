/**
 * lib/business-cases/generacion-async.test.ts — los dos candados de la tanda del 2026-08-21.
 *
 * ── LO QUE ATACAN ────────────────────────────────────────────────────────────
 * Los dos arreglos de esta tanda son INVISIBLES cuando se rompen, y ése es exactamente el
 * motivo del test:
 *
 *  1. **La generación corre fuera del request.** Medido en producción antes de tocar nada:
 *     p50 = 61 s, p90 = 81 s, 24 de 40 corridas por encima del minuto. Colgada de un POST
 *     síncrono, más de la mitad cruzaba el `proxy_read_timeout` de 60 s de nginx (y 4 de 40
 *     cruzaban los 100 s de Cloudflare): el servidor terminaba —cero corridas RUNNING
 *     colgadas en la base— pero la respuesta se perdía y Ventas veía "queda cargando y no la
 *     genera", con la propuesta ya generada del otro lado. Volver a hacerlo síncrono no
 *     rompería nada en local: se rompe SOLO en el VPS, semanas después.
 *
 *  2. **La "X" del contexto filtra de verdad.** `fetchCompanyTimeline` serializa la company
 *     entera y no deja dónde filtrar. El día que alguien lo reimporte por comodidad, la X
 *     sigue viéndose igual en pantalla y el ítem excluido vuelve al prompt en silencio — el
 *     vendedor creería haber sacado una nota que igual se usó.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { serializeTimeline, type TimelineItem } from "@/lib/hubspot/company-timeline";
import { GeneracionFallidaError, diagnosticarRespuesta } from "@/lib/business-cases/diagnostico-de-generacion";

const RAIZ = process.cwd();
const RUTA_GENERATE = path.join(RAIZ, "app/api/business-cases/[id]/generate/route.ts");

/** Mencionar un símbolo en un comentario no es usarlo (mismo criterio que publicable.test.ts). */
function sinComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

const generate = () => sinComentarios(fs.readFileSync(RUTA_GENERATE, "utf8"));

describe("candado 1 — la generación NO vuelve a colgarse del request", () => {
  it("el POST devuelve el runId, no el canvas", () => {
    const src = generate();
    expect(
      /return NextResponse\.json\(\s*\{\s*runId/.test(src),
      "El handler tiene que devolver { runId, status } en el acto. Si vuelve a devolver el " +
        "canvas es porque volvió a esperar el trabajo, y con él los 61 s de mediana.",
    ).toBe(true);
  });

  it("el trabajo pesado se lanza detached", () => {
    const src = generate();
    expect(
      /void \(async \(\) =>/.test(src),
      "El trabajo va lanzado con `void (async () => …)()` — mismo patrón que " +
        "app/api/clients/[id]/analyze/route.ts, donde este error ya se pagó una vez.",
    ).toBe(true);
  });

  it("el resultado viaja por el output de la corrida", () => {
    const src = generate();
    expect(
      /status:\s*"DONE"[\s\S]{0,80}output:\s*JSON\.stringify/.test(src),
      "El cliente ya no está esperando cuando esto termina: el canvasId tiene que quedar en " +
        "el `output` del AgentRun o el workspace no sabe qué caso de uso abrir.",
    ).toBe(true);
  });

  it("el GET de status sabe decir cómo terminó", () => {
    const src = sinComentarios(
      fs.readFileSync(path.join(RAIZ, "app/api/business-cases/[id]/generate/status/route.ts"), "utf8"),
    );
    for (const campo of ["canvasId", "version", "error"]) {
      expect(src.includes(campo), `el status tiene que devolver \`${campo}\``).toBe(true);
    }
  });
});

describe("candado 2 — la X del contexto filtra de verdad", () => {
  it("generate NO importa el serializador que no filtra", () => {
    const src = generate();
    expect(
      /fetchCompanyTimeline\b(?!Items)/.test(src),
      "`fetchCompanyTimeline` serializa la company ENTERA: no hay dónde sacar lo excluido. " +
        "Va `fetchCompanyTimelineItems` + `serializeTimeline`, filtrando antes de serializar.",
    ).toBe(false);
  });

  it("generate lee las exclusiones y las aplica", () => {
    const src = generate();
    expect(src.includes("excludedEngagementIds"), "hay que traer la lista del BusinessCase").toBe(true);
    expect(
      /filter\(\(i\) => !excluidos\.has\(i\.id\)\)/.test(src),
      "y filtrarla contra los ítems ANTES de serializar",
    ).toBe(true);
  });

  it("lo excluido no aparece en el texto que va al prompt", () => {
    const items: TimelineItem[] = [
      { id: "1", type: "NOTE", title: "", body: "La nota que sí va", date: null, ts: 1 },
      { id: "2", type: "CALL", title: "Soporte", body: "Llamada de OTRO proyecto", date: null, ts: 2 },
    ];
    const excluidos = new Set(["2"]);
    const texto = serializeTimeline(items.filter((i) => !excluidos.has(i.id)));
    expect(texto).toContain("La nota que sí va");
    expect(texto).not.toContain("Llamada de OTRO proyecto");
    expect(texto).not.toContain("Soporte");
  });

  it("sin exclusiones, el texto es el de siempre (nadie estrena recorte)", () => {
    const items: TimelineItem[] = [
      { id: "1", type: "NOTE", title: "", body: "A", date: null, ts: 1 },
      { id: "2", type: "MEETING", title: "B", body: "C", date: null, ts: 2 },
    ];
    const vacio = new Set<string>();
    expect(serializeTimeline(items.filter((i) => !vacio.has(i.id)))).toBe(serializeTimeline(items));
  });
});

describe("candado B-10 — una generación fallida dice POR QUÉ falló (stop_reason y largo del texto)", () => {
  /**
   * 1 de 4 propuestas terminaba en ERROR con un output que solo decía «reintentá». Un corte por
   * max_tokens y un JSON malformado se tratan distinto (reducir contexto vs. arreglar el prompt)
   * y se veían igual. El diagnóstico viaja en el mensaje, y el route escribe el mensaje en
   * `AgentRun.output` — así que el output del run en ERROR ahora los distingue.
   */
  const respuesta = (stop_reason: string | null, texto: string) => ({
    stop_reason,
    content: [{ type: "text", text: texto }],
  });

  it("truncada por tokens: el diagnóstico lo dice ANTES de intentar parsear, con el largo", () => {
    /* La edición que lo pone en rojo: parsear primero — un JSON cortado a la mitad se reportaría
       como «JSON inválido» y mandaría a arreglar el prompt cuando el problema es el tamaño. */
    const r = diagnosticarRespuesta(respuesta("max_tokens", '{"hero": {"titulo": "Propuesta pa'), () => {
      throw new Error("no se parsea una respuesta truncada");
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.diagnostico.motivo).toBe("max_tokens");
    expect(r.diagnostico.textoLength).toBe(33);
    expect(r.diagnostico.mensaje).toContain("se cortó por límite de tokens");
    expect(r.diagnostico.mensaje).toContain("[stop_reason=max_tokens · texto=33 chars]");
  });

  it("terminó pero el JSON no parsea: json_invalido, con el stop_reason real y el largo", () => {
    const r = diagnosticarRespuesta(respuesta("end_turn", "Acá va la propuesta: no puedo devolver JSON."));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.diagnostico.motivo).toBe("json_invalido");
    expect(r.diagnostico.mensaje).toContain("[stop_reason=end_turn · texto=44 chars]");
    // El error que lanza canvas-agent lleva el diagnóstico Y el mensaje: lo que el route escribe.
    const e = new GeneracionFallidaError(r.diagnostico);
    expect(e.message).toBe(r.diagnostico.mensaje);
    expect(e.name).toBe("GeneracionFallida");
    expect(e.diagnostico.stopReason).toBe("end_turn");
  });

  it("una respuesta sana devuelve el objeto parseado", () => {
    const r = diagnosticarRespuesta(respuesta("end_turn", '```json\n{"hero": {"titulo": "Propuesta"}}\n```'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.obj).toEqual({ hero: { titulo: "Propuesta" } });
  });

  it("canvas-agent.ts consume el diagnóstico y el route escribe err.message en el output del run", () => {
    /* La edición que lo pone en rojo: volver al `throw new Error("…reintentá")` inline, que
       era exactamente lo que dejaba el output mudo. */
    const agente = sinComentarios(fs.readFileSync(path.join(RAIZ, "lib/business-cases/canvas-agent.ts"), "utf8"));
    expect(agente).toContain("diagnosticarRespuesta(msg)");
    expect(agente).toContain("throw new GeneracionFallidaError(");
    expect(agente, "sin copia inline del chequeo de max_tokens").not.toContain('msg.stop_reason === "max_tokens"');
    const route = generate();
    expect(route, "el diagnóstico llega al run porque el route persiste el mensaje del error").toMatch(
      /status: "ERROR", output: message/,
    );
  });
});
