/**
 * lib/projects/kind.test.ts — LA TABLA DE VERDAD, CONGELADA.
 *
 * Cada combinación de (pipeline × interno × hermano) con su objeto de capacidades escrito
 * LITERAL. No se calcula el esperado: se transcribe. Un test que derive la respuesta del
 * mismo registro que está probando no prueba nada.
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * Alguien "arregla" una celda —le parece raro que un desarrollo hermano no se facture, o
 * que un interno conserve el ciclo de 8 etapas— y cambia sin querer el universo de
 * cobranza o el de la cartera. Las dos son cosas que se notan a fin de mes, no en el diff.
 *
 * Molde: lib/clients/kind.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  OVERLAY_INTERNO,
  PROJECT_PIPELINES,
  SENTINEL_SERVICE_TYPE,
  cerradoPorEstadoCrudo,
  decidirCierre,
  parseProjectPipeline,
  pipelineByKey,
  projectCapabilities,
  resolvePipeline,
  type ProjectCapabilities,
} from "./kind";

const CS = "826270797";
const DEV = "922785384";
const WEB = "922688687";
/** El pipeline que HubSpot trae de fábrica y que a propósito NO está declarado. */
const DESCONOCIDO = "default-onboarding-pipeline";

const TODO: ProjectCapabilities = {
  cobranza: true,
  carteraCs: true,
  publicable: true,
  cicloOchoEtapas: true,
  vigilante: true,
  pestana: true,
};

describe("los ids del registro son los que se leyeron del portal", () => {
  /* Si alguien toca un id acá, TODO lo demás sigue compilando y pasando: la tabla se
     aplicaría a un pipeline que no existe y todos los proyectos caerían a legacy en
     silencio. Los tres números salieron de scripts/inspect-project-pipelines.ts el
     2026-07-29, con el gate en verde. */
  it("Customer Success / Development / Sitios web", () => {
    expect(pipelineByKey("customer-success").hubspotPipelineId).toBe(CS);
    expect(pipelineByKey("development").hubspotPipelineId).toBe(DEV);
    expect(pipelineByKey("web").hubspotPipelineId).toBe(WEB);
  });

  it("las etapas de cierre son las que confirmó Elías", () => {
    expect(pipelineByKey("customer-success").closedStageIds).toContain("1225193543");
    expect(pipelineByKey("development").closedStageIds).toContain("1409932564");
    expect(pipelineByKey("web").closedStageIds).toContain("1409897129");
  });

  it("no hay ids de pipeline repetidos", () => {
    const ids = PROJECT_PIPELINES.map((p) => p.hubspotPipelineId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("LA TABLA — (pipeline × interno × hermano) → capacidades", () => {
  const filas: Array<{
    caso: string;
    hubspotPipelineId: string | null;
    interno: boolean;
    tieneHermanoCs: boolean;
    espera: ProjectCapabilities;
  }> = [
    {
      caso: "Customer Success, no interno — la implementación que compró el cliente",
      hubspotPipelineId: CS,
      interno: false,
      tieneHermanoCs: false,
      espera: {
        cobranza: true,
        carteraCs: true,
        publicable: true,
        cicloOchoEtapas: true,
        vigilante: true,
        pestana: true,
      },
    },
    {
      caso: "Customer Success, INTERNO — SmartAgro: misma metodología, sin plata ni cartera",
      hubspotPipelineId: CS,
      interno: true,
      tieneHermanoCs: false,
      espera: {
        cobranza: false,
        carteraCs: false,
        publicable: false,
        cicloOchoEtapas: true, // ← conserva el ciclo: la metodología es la misma
        vigilante: false,
        pestana: true,
      },
    },
    {
      caso: "Development HERMANO de una implementación — cobra el hermano, no él",
      hubspotPipelineId: DEV,
      interno: false,
      tieneHermanoCs: true,
      espera: {
        cobranza: false, // ← la única celda que cambia el hermano
        carteraCs: false,
        publicable: true,
        cicloOchoEtapas: false,
        vigilante: false,
        pestana: true,
      },
    },
    {
      caso: "Development APARTE — el caso Judesur: se factura",
      hubspotPipelineId: DEV,
      interno: false,
      tieneHermanoCs: false,
      espera: {
        cobranza: true,
        carteraCs: false,
        publicable: true,
        cicloOchoEtapas: false,
        vigilante: false,
        pestana: true,
      },
    },
    {
      caso: "Sitios web APARTE — se factura",
      hubspotPipelineId: WEB,
      interno: false,
      tieneHermanoCs: false,
      espera: {
        cobranza: true,
        carteraCs: false,
        publicable: true,
        cicloOchoEtapas: false,
        vigilante: false,
        pestana: true,
      },
    },
    {
      caso: "Sitios web HERMANO — mismo trato que un desarrollo hermano",
      hubspotPipelineId: WEB,
      interno: false,
      tieneHermanoCs: true,
      espera: {
        cobranza: false,
        carteraCs: false,
        publicable: true,
        cicloOchoEtapas: false,
        vigilante: false,
        pestana: true,
      },
    },
    {
      caso: "Development INTERNO — todo apagado menos la pestaña",
      hubspotPipelineId: DEV,
      interno: true,
      tieneHermanoCs: false,
      espera: {
        cobranza: false,
        carteraCs: false,
        publicable: false,
        cicloOchoEtapas: false,
        vigilante: false,
        pestana: true,
      },
    },
    {
      caso: "pipeline DESCONOCIDO — idéntico al comportamiento de siempre",
      hubspotPipelineId: DESCONOCIDO,
      interno: false,
      tieneHermanoCs: false,
      espera: TODO,
    },
    {
      caso: "SIN pipeline (sin backfill) — idéntico al comportamiento de siempre",
      hubspotPipelineId: null,
      interno: false,
      tieneHermanoCs: false,
      espera: TODO,
    },
    {
      caso: "Customer Success con hermano — un CS NO puede ser hermano de nadie",
      hubspotPipelineId: CS,
      interno: false,
      tieneHermanoCs: true,
      espera: TODO, // el hermano no lo toca: `canBeSiblingOf` de CS está vacío
    },
  ];

  for (const f of filas) {
    it(f.caso, () => {
      expect(
        projectCapabilities({
          hubspotPipelineId: f.hubspotPipelineId,
          interno: f.interno,
          tieneHermanoCs: f.tieneHermanoCs,
        }),
      ).toEqual(f.espera);
    });
  }
});

describe("las tres invariantes que salen de la tabla", () => {
  it("INTERNO apaga cobranza, cartera y publicación — SIEMPRE, incluso con pipeline desconocido", () => {
    /* Es incondicional a propósito: una sola propiedad de HubSpot apaga tres subsistemas, y
       condicionarla a conocer el pipeline sería justamente el agujero. */
    for (const pid of [CS, DEV, WEB, DESCONOCIDO, null]) {
      for (const hermano of [true, false]) {
        const caps = projectCapabilities({
          hubspotPipelineId: pid,
          interno: true,
          tieneHermanoCs: hermano,
        });
        expect(caps.cobranza, `pipeline=${pid}`).toBe(false);
        expect(caps.carteraCs, `pipeline=${pid}`).toBe(false);
        expect(caps.publicable, `pipeline=${pid}`).toBe(false);
      }
    }
  });

  it("la PESTAÑA nunca se apaga — nadie pierde acceso a su proyecto por esta tanda", () => {
    for (const pid of [CS, DEV, WEB, DESCONOCIDO, null]) {
      for (const interno of [true, false]) {
        for (const hermano of [true, false]) {
          expect(
            projectCapabilities({ hubspotPipelineId: pid, interno, tieneHermanoCs: hermano }).pestana,
            `pipeline=${pid} interno=${interno} hermano=${hermano}`,
          ).toBe(true);
        }
      }
    }
  });

  it("un pipeline desconocido Y no interno es EXACTAMENTE el comportamiento de hoy", () => {
    // Es lo que hace que el deploy sea invisible mientras el backfill no corrió.
    expect(
      projectCapabilities({ hubspotPipelineId: "un-pipeline-que-nadie-declaro", interno: false, tieneHermanoCs: false }),
    ).toEqual(TODO);
  });

  it("el overlay declara qué NO toca, y de verdad no lo toca", () => {
    for (const clave of OVERLAY_INTERNO.respeta) {
      expect(Object.keys(OVERLAY_INTERNO.apaga)).not.toContain(clave);
    }
  });
});

describe("resolvePipeline es tolerante", () => {
  it("desconocido, vacío y null dan null (no explotan)", () => {
    expect(resolvePipeline(DESCONOCIDO)).toBeNull();
    expect(resolvePipeline("")).toBeNull();
    expect(resolvePipeline(null)).toBeNull();
    expect(resolvePipeline(undefined)).toBeNull();
  });

  it("tolera espacios alrededor (HubSpot devuelve strings sin normalizar)", () => {
    expect(resolvePipeline(` ${CS} `)?.key).toBe("customer-success");
  });
});

describe("parseProjectPipeline (frontera HTTP)", () => {
  it("acepta las claves del registro y rechaza todo lo demás", () => {
    expect(parseProjectPipeline("development")?.hubspotPipelineId).toBe(DEV);
    expect(parseProjectPipeline(CS)).toBeNull(); // es un id, no una clave
    expect(parseProjectPipeline("")).toBeNull();
    expect(parseProjectPipeline(null)).toBeNull();
    expect(parseProjectPipeline(42)).toBeNull();
    expect(parseProjectPipeline({ key: "development" })).toBeNull();
  });
});

describe("decidirCierre — la UNIÓN de las dos señales", () => {
  it("la etapa terminal cierra aunque el estado crudo diga que va bien", () => {
    // Los 12 proyectos del censo: parados en "Finalizado" con hs_status = "on_track".
    expect(
      decidirCierre({ hubspotPipelineId: CS, stageId: "1225193543", rawStatus: "on_track" }),
    ).toBe("cerrado");
  });

  it("el estado crudo cierra aunque la etapa no sea terminal", () => {
    expect(
      decidirCierre({ hubspotPipelineId: CS, stageId: "1225193553", rawStatus: "completed" }),
    ).toBe("cerrado");
  });

  it("NUNCA reabre: todo lo que la regla vieja cerraba, la nueva también", () => {
    /* Ésta es LA propiedad. Si en vez de unir se le diera precedencia a la etapa, un
       proyecto con estado "completed" fuera de la etapa terminal daría "abierto" — y la
       rama de update del sync escribe status:"active", o sea que lo resucitaría. */
    const crudos = ["completed", "cancelled", "Completado", "cancelado", "cerrado", "COMPLETADO"];
    const etapas = [null, "1225193541", "1225193553", "1409932561", "etapa-inventada"];
    for (const pid of [CS, DEV, WEB, DESCONOCIDO, null]) {
      for (const rawStatus of crudos) {
        for (const stageId of etapas) {
          expect(
            decidirCierre({ hubspotPipelineId: pid, stageId, rawStatus }),
            `pipeline=${pid} etapa=${stageId} estado=${rawStatus}`,
          ).toBe("cerrado");
        }
      }
    }
  });

  it("un pipeline desconocido cae al criterio de siempre — la etapa no lo cierra", () => {
    expect(
      decidirCierre({ hubspotPipelineId: DESCONOCIDO, stageId: "1225193543", rawStatus: "on_track" }),
    ).toBe("abierto");
  });

  it("un proyecto vivo sigue abierto", () => {
    expect(decidirCierre({ hubspotPipelineId: CS, stageId: "1225193553", rawStatus: "on_track" })).toBe("abierto");
    expect(decidirCierre({ hubspotPipelineId: DEV, stageId: "1409932561", rawStatus: "" })).toBe("abierto");
    expect(decidirCierre({ hubspotPipelineId: null, stageId: null, rawStatus: null })).toBe("abierto");
  });

  it("«Cancelado» de Development y de Sitios web también cierra", () => {
    expect(decidirCierre({ hubspotPipelineId: DEV, stageId: "1409897657", rawStatus: "" })).toBe("cerrado");
    expect(decidirCierre({ hubspotPipelineId: WEB, stageId: "1409897130", rawStatus: "" })).toBe("cerrado");
  });

  it("«Bloqueado» de Customer Success NO cierra — está parado, no terminado", () => {
    expect(decidirCierre({ hubspotPipelineId: CS, stageId: "1225193545", rawStatus: "blocked" })).toBe("abierto");
  });

  it("la etapa de un pipeline NO se aplica a otro", () => {
    // El "Finalizado" de Development no puede cerrar un proyecto de Customer Success.
    expect(
      decidirCierre({ hubspotPipelineId: CS, stageId: "1409932564", rawStatus: "on_track" }),
    ).toBe("abierto");
  });
});

describe("cerradoPorEstadoCrudo conserva el criterio viejo, tal cual", () => {
  it("lo que cerraba, cierra; lo que no, no", () => {
    expect(cerradoPorEstadoCrudo("completed")).toBe(true);
    expect(cerradoPorEstadoCrudo("  Cancelled ")).toBe(true);
    expect(cerradoPorEstadoCrudo("proyecto completado")).toBe(true);
    expect(cerradoPorEstadoCrudo("on_track")).toBe(false);
    expect(cerradoPorEstadoCrudo("delayed")).toBe(false);
    expect(cerradoPorEstadoCrudo("")).toBe(false);
    expect(cerradoPorEstadoCrudo(null)).toBe(false);
  });
});

describe("el sentinel", () => {
  it("sigue siendo el mismo string — cambiarlo huerfaniza 49 proyectos en la base", () => {
    expect(SENTINEL_SERVICE_TYPE).toBe("__strategy__");
  });

  it("lo reexporta strategy-project para no romper los imports viejos", async () => {
    const legacy = await import("@/lib/canvas/strategy-project");
    expect(legacy.SENTINEL_SERVICE_TYPE).toBe(SENTINEL_SERVICE_TYPE);
  });
});
