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
  buscarEtapa,
  cerradoPorEstadoCrudo,
  decidirCierre,
  fuenteDelCiclo,
  lineaDeAvance,
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

describe("LAS ETAPAS — transcritas del portal, no derivadas", () => {
  it("Development: la línea completa, LITERAL", () => {
    // Es la que SE PINTA. Transcrita de scripts/inspect-project-pipelines.ts (2026-07-30),
    // en el orden de `displayOrder` del portal.
    expect(pipelineByKey("development").stages).toEqual([
      { id: "1409898886", label: "Handoff", enLinea: true, terminal: false },
      { id: "1409897653", label: "Exploración", enLinea: true, terminal: false },
      { id: "1409897655", label: "Requerimientos", enLinea: true, terminal: false },
      { id: "1409932561", label: "Desarrollo", enLinea: true, terminal: false },
      { id: "1409932562", label: "Pruebas", enLinea: true, terminal: false },
      { id: "1409932563", label: "Entrega", enLinea: true, terminal: false },
      { id: "1409932564", label: "Finalizado", enLinea: true, terminal: true },
      { id: "1409897657", label: "Cancelado", enLinea: false, terminal: true },
    ]);
  });

  it("Sitios web: la línea completa, LITERAL — con «Consenso» ANTES que «Desarrollo»", () => {
    /* El orden del portal NO es el numérico de los ids: …127 (Consenso) va antes que …126
       (Desarrollo). Ordenar por id —que parece más prolijo— invierte dos etapas. */
    expect(pipelineByKey("web").stages).toEqual([
      { id: "1409897123", label: "Handoff", enLinea: true, terminal: false },
      { id: "1409897124", label: "Exploración", enLinea: true, terminal: false },
      { id: "1409897125", label: "Mockup", enLinea: true, terminal: false },
      { id: "1409897127", label: "Consenso", enLinea: true, terminal: false },
      { id: "1409897126", label: "Desarrollo", enLinea: true, terminal: false },
      { id: "1409897128", label: "Entrega", enLinea: true, terminal: false },
      { id: "1409897129", label: "Finalizado", enLinea: true, terminal: true },
      { id: "1409897130", label: "Cancelado", enLinea: false, terminal: true },
    ]);
  });

  it("Customer Success: la línea completa, LITERAL", () => {
    /* Faltaba, y por eso el desalineo no rompió nada: el 2026-07-30 el pipeline se rehízo en
       el portal (3 renombres + 4 etapas nuevas) y la suite siguió verde con la tabla vieja
       durante todo el día. Transcrita del portal a las 16:17 UTC. */
    expect(pipelineByKey("customer-success").stages).toEqual([
      { id: "1225193551", label: "Handoff", enLinea: true, terminal: false },
      { id: "1410223916", label: "Exploración", enLinea: true, terminal: false },
      { id: "1410223917", label: "Diagnóstico", enLinea: true, terminal: false },
      { id: "1410223918", label: "Planificación", enLinea: true, terminal: false },
      { id: "1225193541", label: "Configuración técnica", enLinea: true, terminal: false },
      { id: "1225193553", label: "Adopción", enLinea: true, terminal: false },
      { id: "1410223919", label: "Validación de uso", enLinea: true, terminal: false },
      { id: "1241442148", label: "Entrega", enLinea: true, terminal: false },
      { id: "1225193543", label: "Finalizado", enLinea: true, terminal: true },
      { id: "1370129216", label: "Continuidad", enLinea: false, terminal: false },
      { id: "1225193545", label: "Bloqueado", enLinea: false, terminal: false },
    ]);
  });

  it("los 7 ids VIEJOS de Customer Success siguen todos declarados", () => {
    /* El rediseño del pipeline renombró tres etapas y agregó cuatro, pero no borró ninguna.
       Si alguna desapareciera de la tabla, los proyectos parados ahí perderían su rótulo —
       y uno de esos ids es el que cierra proyectos. */
    const declarados = new Set(pipelineByKey("customer-success").stages.map((s) => s.id));
    for (const id of ["1225193551", "1225193541", "1225193553", "1241442148", "1225193543", "1370129216", "1225193545"]) {
      expect(declarados.has(id), `se perdió la etapa ${id}`).toBe(true);
    }
  });

  it("«Bloqueado» de Customer Success: fuera de línea y NO terminal", () => {
    /* HubSpot lo marca con `isClosed: true` y acá se le lleva la contraria a propósito:
       hay 3 proyectos ACTIVOS parados ahí. Si alguien "sincroniza" este flag con el
       portal, los oculta de Nexus — que es lo contrario de lo que un bloqueo necesita. */
    const bloqueado = buscarEtapa(pipelineByKey("customer-success"), "1225193545");
    expect(bloqueado).toEqual({ id: "1225193545", label: "Bloqueado", enLinea: false, terminal: false });
  });

  it("`closedStageIds` y las etapas `terminal` dicen lo mismo — EN LOS DOS SENTIDOS", () => {
    /* LA guarda de esta tanda. `closedStageIds` decide si un proyecto desaparece de Nexus
       (y con él, de la cobranza); `terminal` decide cómo se pinta. Que se separen es la
       clase de bug que solo se ve a fin de mes. */
    for (const def of PROJECT_PIPELINES) {
      const porBandera = def.stages.filter((s) => s.terminal).map((s) => s.id).sort();
      expect([...def.closedStageIds].sort(), `${def.label}: closedStageIds vs stages.terminal`).toEqual(
        porBandera,
      );
    }
  });

  it("`initialStageId` es la PRIMERA etapa en línea", () => {
    // Es con la que nace un proyecto creado desde Nexus. Si apuntara a otra, un proyecto
    // nuevo aparecería a mitad de su propia línea.
    for (const def of PROJECT_PIPELINES) {
      expect(lineaDeAvance(def)[0]?.id, `${def.label}`).toBe(def.initialStageId);
    }
  });

  it("ninguna etapa está declarada en dos pipelines", () => {
    /* `decidirCierre` y `buscarEtapa` resuelven la etapa DENTRO de su pipeline, pero un id
       repetido volvería ambiguo cualquier diagnóstico. Hoy los ids son globales en HubSpot. */
    const todas = PROJECT_PIPELINES.flatMap((p) => p.stages.map((s) => s.id));
    expect(new Set(todas).size).toBe(todas.length);
  });

  it("toda fila tiene línea de avance y al menos una terminal", () => {
    for (const def of PROJECT_PIPELINES) {
      expect(lineaDeAvance(def).length, `${def.label} sin etapas en línea`).toBeGreaterThan(0);
      expect(def.closedStageIds.length, `${def.label} sin etapa de cierre`).toBeGreaterThan(0);
    }
  });

  it("buscarEtapa tolera lo que llega de afuera", () => {
    const dev = pipelineByKey("development");
    expect(buscarEtapa(dev, null)).toBeNull();
    expect(buscarEtapa(dev, "")).toBeNull();
    // Una etapa que alguien agregó en el portal y nadie transcribió acá: se degrada a
    // "sin etapa", no rompe.
    expect(buscarEtapa(dev, "etapa-que-no-existe")).toBeNull();
    // El "Finalizado" de OTRO pipeline no resuelve dentro de éste.
    expect(buscarEtapa(dev, "1225193543")).toBeNull();
    expect(buscarEtapa(dev, " 1409932562 ")?.label).toBe("Pruebas");
  });
});

describe("fuenteDelCiclo — quién manda la etapa del proyecto", () => {
  const filas: Array<{ caso: string; pid: string | null; interno: boolean; hermano: boolean; espera: string }> = [
    { caso: "Customer Success → el ciclo de 8 etapas de Nexus", pid: CS, interno: false, hermano: false, espera: "customer-success" },
    { caso: "Customer Success INTERNO → sigue corriendo el ciclo (misma metodología)", pid: CS, interno: true, hermano: false, espera: "customer-success" },
    { caso: "Development → su propio pipeline de HubSpot", pid: DEV, interno: false, hermano: false, espera: "pipeline" },
    { caso: "Development hermano → su propio pipeline igual", pid: DEV, interno: false, hermano: true, espera: "pipeline" },
    { caso: "Development INTERNO → su propio pipeline igual", pid: DEV, interno: true, hermano: false, espera: "pipeline" },
    { caso: "Sitios web → su propio pipeline de HubSpot", pid: WEB, interno: false, hermano: false, espera: "pipeline" },
    { caso: "pipeline DESCONOCIDO → el ciclo de siempre (comportamiento legacy)", pid: DESCONOCIDO, interno: false, hermano: false, espera: "customer-success" },
    { caso: "SIN pipeline → el ciclo de siempre (comportamiento legacy)", pid: null, interno: false, hermano: false, espera: "customer-success" },
  ];

  for (const f of filas) {
    it(f.caso, () => {
      expect(
        fuenteDelCiclo({ hubspotPipelineId: f.pid, interno: f.interno, tieneHermanoCs: f.hermano }).tipo,
      ).toBe(f.espera);
    });
  }

  it("la rama «pipeline» SIEMPRE trae su fila — nadie tiene que volver a resolverla", () => {
    const f = fuenteDelCiclo({ hubspotPipelineId: DEV, interno: false, tieneHermanoCs: false });
    expect(f.tipo).toBe("pipeline");
    if (f.tipo === "pipeline") expect(f.pipeline.label).toBe("Development");
  });

  it("es EXACTAMENTE la negación de `cicloOchoEtapas` — no una segunda opinión", () => {
    /* Se deriva a propósito: dos campos que responden lo mismo se contradicen algún día, y
       entonces hay que averiguar cuál manda. Esto lo ata. */
    for (const pid of [CS, DEV, WEB, DESCONOCIDO, null]) {
      for (const interno of [true, false]) {
        for (const hermano of [true, false]) {
          const facts = { hubspotPipelineId: pid, interno, tieneHermanoCs: hermano };
          expect(fuenteDelCiclo(facts).tipo === "customer-success", `${pid}/${interno}/${hermano}`).toBe(
            projectCapabilities(facts).cicloOchoEtapas,
          );
        }
      }
    }
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
