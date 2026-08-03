import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  detectarFusion,
  detectarFusionesEnLote,
  explicarFusion,
  type LectorDeHubspot,
} from "./empresa-fusionada";

/**
 * lib/hubspot/empresa-fusionada.test.ts — UNA EMPRESA QUE RESPONDE NO ES UNA EMPRESA QUE EXISTE.
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * Encontrada EN VIVO el 2026-08-03: se creó un proyecto en HubSpot para Spectrum y no aparecía
 * en Nexus. El botón "Actualizar" decía «la empresa 52577965185 no tiene proyectos asociados»
 * — cierto, y por eso inútil: mandaba a revisar HubSpot, donde el proyecto estaba perfecto.
 *
 * Lo que pasaba es que las dos fichas de Spectrum se habían fusionado. La perdedora SIGUE
 * respondiendo 200 con nombre, dominio y fecha correctos; lo único que se mudó al sobreviviente
 * fueron las asociaciones. O sea: nada falla, nada tira error, y el dato se vuelve mentira sin
 * cambiar de forma. La única señal es que la respuesta viene firmada con OTRO id.
 */

/** Doble de HubSpot: mapea `path` → respuesta. Sin red, sin SDK. */
function lector(rutas: Record<string, { ok?: boolean; status?: number; body?: unknown }>): {
  hs: LectorDeHubspot;
  llamadas: string[];
} {
  const llamadas: string[] = [];
  const hs: LectorDeHubspot = {
    async apiRequest({ method, path: p, body }) {
      llamadas.push(`${method} ${p}`);
      const clave = Object.keys(rutas).find((k) => p.startsWith(k));
      const r = clave ? rutas[clave] : undefined;
      if (!r) throw new Error(`ruta no simulada: ${p}`);
      // El batch necesita ver los inputs para responder coherente.
      const cuerpo =
        typeof r.body === "function"
          ? (r.body as (b: unknown) => unknown)(body)
          : r.body;
      return {
        ok: r.ok ?? true,
        status: r.status ?? 200,
        json: async () => cuerpo,
      };
    },
  };
  return { hs, llamadas };
}

describe("detectar una empresa fusionada", () => {
  it("responde con SU id → vigente", () => {
    const { hs } = lector({ "/crm/v3/objects/companies/111": { body: { id: "111" } } });
    return expect(detectarFusion(hs, "111")).resolves.toEqual({ estado: "vigente" });
  });

  it("responde con OTRO id → fusionada (el caso Spectrum)", async () => {
    const { hs } = lector({ "/crm/v3/objects/companies/52577965185": { body: { id: "57140844832" } } });
    expect(await detectarFusion(hs, "52577965185")).toEqual({
      estado: "fusionada",
      idSobreviviente: "57140844832",
    });
  });

  it("404 NO es una fusión", async () => {
    /* Un id borrado, uno de otro portal y uno mal tipeado dan los tres 404. Tratarlos como
       fusión mandaría a "seguir la fusión" cuando no hay ninguna que seguir. */
    const { hs } = lector({ "/crm/v3/objects/companies/999": { ok: false, status: 404 } });
    expect(await detectarFusion(hs, "999")).toEqual({ estado: "ilegible", motivo: "HTTP 404" });
  });

  it("429 tampoco: un rate-limit no puede parecer una fusión", async () => {
    const { hs } = lector({ "/crm/v3/objects/companies/111": { ok: false, status: 429 } });
    expect((await detectarFusion(hs, "111")).estado).toBe("ilegible");
  });

  it("la red que se cae → ilegible, no explota", async () => {
    const hs: LectorDeHubspot = {
      apiRequest: () => Promise.reject(new Error("ECONNRESET")),
    };
    expect(await detectarFusion(hs, "111")).toEqual({ estado: "ilegible", motivo: "ECONNRESET" });
  });

  it("una respuesta sin id → ilegible", async () => {
    const { hs } = lector({ "/crm/v3/objects/companies/111": { body: {} } });
    expect((await detectarFusion(hs, "111")).estado).toBe("ilegible");
  });

  it("compara como TEXTO, no como número", async () => {
    /* Los ids de HubSpot pasan de 2^53. Comparados como números, dos ids distintos pero
       cercanos colapsarían al mismo valor y una fusión real pasaría por vigente. */
    const grande = "9007199254740993"; // 2^53 + 1
    const otro = "9007199254740992"; // 2^53 — indistinguibles como Number
    const { hs } = lector({ [`/crm/v3/objects/companies/${grande}`]: { body: { id: otro } } });
    expect(await detectarFusion(hs, grande)).toEqual({
      estado: "fusionada",
      idSobreviviente: otro,
    });
  });
});

describe("revisar muchas de una", () => {
  /** Batch que devuelve los ids pedidos, sustituyendo los fusionados por su sobreviviente. */
  const batchCon = (fusiones: Record<string, string>) => ({
    "/crm/v3/objects/companies/batch/read": {
      body: (b: unknown) => {
        const inputs = (b as { inputs: { id: string }[] }).inputs;
        return { results: inputs.map(({ id }) => ({ id: fusiones[id] ?? id })) };
      },
    },
  });

  it("todas vigentes → UNA sola llamada, ninguna individual", async () => {
    /* El punto entero del lote. Si se pierde, el invariante pasa de 2 llamadas a 158 y suma un
       minuto al comando que corre antes de cada commit. */
    const { hs, llamadas } = lector(batchCon({}));
    const r = await detectarFusionesEnLote(hs, ["1", "2", "3"]);
    expect([...r.values()].every((v) => v.estado === "vigente")).toBe(true);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]).toContain("batch/read");
  });

  it("una fusionada → el lote la señala y una individual la empareja", async () => {
    const { hs, llamadas } = lector({
      ...batchCon({ "52577965185": "57140844832" }),
      "/crm/v3/objects/companies/52577965185": { body: { id: "57140844832" } },
    });
    const r = await detectarFusionesEnLote(hs, ["1", "52577965185", "3"]);
    expect(r.get("52577965185")).toEqual({ estado: "fusionada", idSobreviviente: "57140844832" });
    expect(r.get("1")).toEqual({ estado: "vigente" });
    // 1 batch + 1 individual SOLO por la sospechosa.
    expect(llamadas).toHaveLength(2);
  });

  it("el batch NO alcanza para emparejar: por eso existe el segundo paso", async () => {
    /* Con DOS fusiones en el mismo lote vuelven dos ids nuevos y ninguna forma de saber cuál
       corresponde a cuál. La llamada individual es lo único que da el par correcto. */
    const { hs } = lector({
      ...batchCon({ a: "AAA", b: "BBB" }),
      "/crm/v3/objects/companies/a": { body: { id: "AAA" } },
      "/crm/v3/objects/companies/b": { body: { id: "BBB" } },
    });
    const r = await detectarFusionesEnLote(hs, ["a", "b"]);
    expect(r.get("a")).toEqual({ estado: "fusionada", idSobreviviente: "AAA" });
    expect(r.get("b")).toEqual({ estado: "fusionada", idSobreviviente: "BBB" });
  });

  it("el batch caído deja el lote ILEGIBLE, no fusionado", async () => {
    /* Es la trampa peligrosa: si un 429 se leyera como "no volvió → fusionada", el invariante
       reportaría el portal entero como fusionado y el script reapuntaría 158 clientes. */
    const { hs } = lector({
      "/crm/v3/objects/companies/batch/read": { ok: false, status: 429 },
    });
    const r = await detectarFusionesEnLote(hs, ["1", "2"]);
    expect([...r.values()].every((v) => v.estado === "ilegible")).toBe(true);
  });

  it("un id que no existe queda ilegible, no fusionado", async () => {
    const { hs } = lector({
      ...batchCon({}),
      "/crm/v3/objects/companies/borrado": { ok: false, status: 404 },
    });
    // El batch lo omite (no vuelve), pero la individual dice 404.
    const { hs: hs2 } = lector({
      "/crm/v3/objects/companies/batch/read": { body: { results: [{ id: "1" }] } },
      "/crm/v3/objects/companies/borrado": { ok: false, status: 404 },
    });
    void hs;
    const r = await detectarFusionesEnLote(hs2, ["1", "borrado"]);
    expect(r.get("1")).toEqual({ estado: "vigente" });
    expect(r.get("borrado")?.estado).toBe("ilegible");
  });

  it("no repite ids duplicados", async () => {
    const { hs, llamadas } = lector(batchCon({}));
    const r = await detectarFusionesEnLote(hs, ["1", "1", "1"]);
    expect(r.size).toBe(1);
    expect(llamadas).toHaveLength(1);
  });

  it("lista vacía → ni una llamada", async () => {
    const { hs, llamadas } = lector({});
    expect((await detectarFusionesEnLote(hs, [])).size).toBe(0);
    expect(llamadas).toHaveLength(0);
  });
});

describe("el mensaje sirve para actuar", () => {
  it("nombra las dos fichas y el comando que lo arregla", () => {
    /* El mensaje viejo ("la empresa X no tiene proyectos asociados") era cierto e inútil:
       mandaba a revisar HubSpot, que estaba bien. Éste dice qué pasó y qué hacer. */
    const m = explicarFusion("52577965185", "57140844832");
    expect(m).toContain("52577965185");
    expect(m).toContain("57140844832");
    expect(m).toContain("reapuntar-empresa-fusionada");
    expect(m).not.toContain("no tiene proyectos asociados");
  });
});

describe("está cableado donde el síntoma aparece", () => {
  const RAIZ = process.cwd();
  const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

  it("el sync pregunta ANTES de decir «no tiene proyectos»", () => {
    /* Sin esto el arreglo es un módulo que nadie llama: el mensaje inútil seguiría saliendo. */
    const src = leer("lib/hubspot/sync-projects.ts");
    expect(src).toContain("detectarFusion(hsClient, companyId)");
    expect(src).toContain("explicarFusion(");
  });

  it("el alta NO pregunta por fusiones, y está escrito por qué", () => {
    /* Congela una DECISIÓN, no una ausencia. `projects-of-company` también devuelve cero
       proyectos, así que parece la otra superficie a cablear — y llegué a cablearla. Pero sus
       dos llamadores mandan el id que salió de `/api/handoffs/lookup`, que busca POR DOMINIO, y
       el buscador de HubSpot solo devuelve fichas VIVAS: el id que llega ahí es siempre el
       sobreviviente. El aviso no podía dispararse nunca y costaba una llamada en el caso más
       común del alta. Si alguien lo agrega de nuevo, que sea leyendo este motivo. */
    const ruta = leer("app/api/handoffs/projects-of-company/route.ts");
    expect(ruta, "volvió el aviso que no puede dispararse").not.toContain("detectarFusion(");
    expect(ruta).toContain("POR DOMINIO");
  });

  it("el reapuntado y el invariante miran las DOS tablas donde vive el id", () => {
    /* `BusinessCase.hubspotCompanyId` es una copia denormalizada que nadie cascadea. Arreglar
       solo el Client dejaba la lápida ahí y el BC se regeneraba sin línea de tiempo, en
       silencio — el mismo silencio que esta tanda vino a matar. */
    expect(leer("scripts/reapuntar-empresa-fusionada.ts")).toContain("businessCase.updateMany");
    expect(leer("scripts/check-invariants.ts")).toContain("prisma.businessCase.findMany");
  });

  it("el invariante lo vigila EN LOTE, no cliente por cliente", () => {
    /* Cliente por cliente serían ~158 llamadas y más de un minuto en un comando que corre antes
       de cada commit. Un gate que tarda es un gate que se saltea. */
    const src = leer("scripts/check-invariants.ts");
    expect(src).toContain("detectarFusionesEnLote");
    expect(src, "el invariante volvió a la llamada por cliente").not.toContain(
      "detectarFusion(hs, c.hubspotCompanyId",
    );
  });

  it("INV13 está en el índice del docblock", () => {
    // El índice es el orden canónico; si no se actualiza, miente sobre lo que el archivo hace.
    expect(leer("scripts/check-invariants.ts")).toMatch(/\*\s+13\.\s+Ninguna empresa/);
  });
});
