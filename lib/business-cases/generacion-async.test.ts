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
