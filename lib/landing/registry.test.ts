/**
 * lib/landing/registry.test.ts — registros CONGELADOS del motor de landing (Ola 7).
 *
 * `toSectionDef` devuelve null —y la sección DESAPARECE sin romper nada— cuando un
 * `sectionType` no está en el registry de componentes. Un typo se iría a producción
 * con la suite verde y una sección del documento del cliente se esfumaría en
 * silencio. Este test lo hace imposible, para los 3 tipos sobre CanvasBlock
 * (BC_TEMPLATES + kickoff + desarrollo); Roles tiene el suyo (lib/roles/roles.test).
 *
 * Además congela las KEYS por template: agregar/quitar/reordenar una sección es una
 * decisión de producto — el snapshot obliga a tocarlo a conciencia, no por accidente.
 *
 * Espejo de lib/roles/roles.test.ts. Vive en lib/ (el project unit de vitest solo
 * incluye lib/**). Contrato completo del motor: ARCHITECTURE §1-WEB.
 */
import { describe, it, expect } from "vitest";
import { CRONOGRAMA_SECTION_DEFS } from "@/components/landing/configs/cronograma.defs";
import {
  CRONOGRAMA_SECTION_COMPONENTS,
  landingConfigForCronograma,
} from "@/components/landing/configs/cronograma";
import { BC_TEMPLATES } from "@/components/landing/configs/templates.defs";
import { SECTION_COMPONENTS, landingConfigFor } from "@/components/landing/configs/templates";
import { KICKOFF_SECTION_DEFS } from "@/components/landing/configs/kickoff.defs";
import { KICKOFF_SECTION_COMPONENTS, landingConfigForKickoff } from "@/components/landing/configs/kickoff";
import { DESARROLLO_SECTION_DEFS } from "@/components/landing/configs/desarrollo.defs";
import { DESARROLLO_SECTION_COMPONENTS, landingConfigForDesarrollo } from "@/components/landing/configs/desarrollo";
import { EXPLORACION_SECTION_DEFS } from "@/components/landing/configs/exploracion.defs";
import { EXPLORACION_SECTION_COMPONENTS, landingConfigForExploracion } from "@/components/landing/configs/exploracion";
import { DIAGNOSTICO_SECTION_DEFS, DIAGNOSTICO_DEF_BY_KEY } from "@/components/landing/configs/diagnostico.defs";
import { DIAGNOSTICO_SECTION_COMPONENTS, landingConfigForDiagnostico } from "@/components/landing/configs/diagnostico";
import { DIAGNOSTICO_CANVAS, PLANIFICACION_CANVAS, IMPLEMENTACION_CANVAS, ENTREGA_CANVAS } from "@/lib/canvas/canvas-defs";
import { ENTREGA_SECTION_DEFS, ENTREGA_DEF_BY_KEY } from "@/components/landing/configs/entrega.defs";
import { ENTREGA_SECTION_COMPONENTS, landingConfigForEntrega } from "@/components/landing/configs/entrega";
import { IMPLEMENTACION_SECTION_DEFS } from "@/components/landing/configs/implementacion.defs";
import { IMPLEMENTACION_SECTION_COMPONENTS, landingConfigForImplementacion } from "@/components/landing/configs/implementacion";
import { PLANIFICACION_SECTION_DEFS, PLANIFICACION_DEF_BY_KEY } from "@/components/landing/configs/planificacion.defs";
import { PLANIFICACION_SECTION_COMPONENTS, landingConfigForPlanificacion } from "@/components/landing/configs/planificacion";
import { HTML_EMBED_TYPE } from "@/lib/landing/custom-sections";
import {
  CATALOGO_DE_SECCIONES,
  TABLA_TYPE,
  TIPO_POR_DEFECTO,
} from "@/lib/landing/catalogo-de-secciones";
import { COMPONENTES_CREABLES } from "@/components/landing/configs/templates";
import {
  PROCESS_MAPPING_SCHEMA,
  PROCESS_MAPPING_SCHEMA_CON_TITULAR,
} from "@/components/landing/configs/shared-sections.defs";
import { t } from "@/components/landing/i18n";
import fs from "node:fs";
import path from "node:path";

/** Renderers que ningún def VIVO usa pero que se conservan a PROPÓSITO: los
 *  snapshots publicados congelan `sectionType` y `configForSnapshot` los
 *  resuelve por este registry — borrarlos rompería lo ya publicado. Entra acá
 *  SOLO con esa justificación (ej. `tech_architecture`, reemplazado por
 *  `diagram` en el retema 2026-07 — ver shared-sections.defs). */
const LEGACY_SNAPSHOT_TYPES = new Set(["tech_architecture"]);

/** Renderers que NINGÚN template declara porque la sección no existe hasta que alguien la
 *  CREA en runtime: el resolver la sintetiza desde la key (`custom:<tipo>:<uuid>`, ver
 *  lib/landing/catalogo-de-secciones.ts). No son legacy —están vivos y son la única forma de
 *  renderizar una sección creada—, así que van en su propio set: meterlos en
 *  LEGACY_SNAPSHOT_TYPES diría lo contrario de lo que pasa.
 *
 *  ⭐ `tabla` entró el 2026-08-21 y es el ÚNICO tipo del catálogo que hubo que construir: Elías
 *  pidió que el chat pudiera crear tablas y el motor no tenía ninguna genérica (las dos que había
 *  son de propósito único — líneas de factura con totales, y propiedades con columnas cerradas).
 *  Los otros cinco tipos creables ya los declara alguna plantilla, así que resuelven por su mapa
 *  y no son huérfanos en ninguno.
 *
 *  ⚠ Este set NO es una lista de excepciones cómoda: cada entrada es un renderer que solo se
 *  alcanza sintetizando la def desde una key. Si un tipo entra acá y el catálogo NO lo ofrece,
 *  queda código que nadie puede alcanzar; si el catálogo lo ofrece y no está registrado,
 *  `toSectionDef` devuelve null y la sección desaparece sin error. El test de abajo cierra las
 *  dos direcciones. */
const RUNTIME_SECTION_TYPES = new Set([HTML_EMBED_TYPE, TABLA_TYPE]);

describe("BC_TEMPLATES: toda def resuelve renderer y las keys están congeladas", () => {
  it("cada sectionType de cada template tiene componente registrado", () => {
    for (const tpl of Object.values(BC_TEMPLATES)) {
      const faltantes = tpl.sections.filter((d) => !SECTION_COMPONENTS[d.sectionType ?? d.key]);
      expect(faltantes.map((d) => `${tpl.id}:${d.key}→${d.sectionType}`)).toEqual([]);
    }
  });

  it("la config viva no dropea ninguna def (defs === config, en orden)", () => {
    for (const tpl of Object.values(BC_TEMPLATES)) {
      expect(landingConfigFor(tpl.id).sections.map((s) => s.key)).toEqual(
        tpl.sections.map((d) => d.key),
      );
    }
  });

  it("snapshot de keys por template (cambiarlas = decisión de producto)", () => {
    expect(BC_TEMPLATES.hubspot_v1.sections.map((d) => d.key)).toEqual([
      "hero", "dolores", "antes_despues", "solucion", "casos_de_uso", "roi",
      "cronograma", "inversion", "partner", "cta", "arquitectura_tecnologica", "mapeo_procesos",
    ]);
    expect(BC_TEMPLATES.website_v1.sections.map((d) => d.key)).toEqual([
      "hero", "diagnostico", "arquitectura_sitio", "arquitectura_conexion",
      "alcance", "metodologia", "inversion", "por_que_smarteam",
    ]);
    // Un template nuevo declara acá su snapshot al nacer.
    expect(Object.keys(BC_TEMPLATES).sort()).toEqual(["hubspot_v1", "website_v1"]);
  });

  it("hero abre cada template", () => {
    for (const tpl of Object.values(BC_TEMPLATES)) {
      expect(tpl.sections[0]?.key).toBe("hero");
    }
  });

  it("sin componentes huérfanos en SECTION_COMPONENTS (salvo legacy y dinámicos)", () => {
    const usados = new Set(
      Object.values(BC_TEMPLATES).flatMap((tpl) => tpl.sections.map((d) => d.sectionType ?? d.key)),
    );
    const huerfanos = Object.keys(SECTION_COMPONENTS).filter(
      (t) => !usados.has(t) && !LEGACY_SNAPSHOT_TYPES.has(t) && !RUNTIME_SECTION_TYPES.has(t),
    );
    expect(huerfanos).toEqual([]);
  });
});

describe("Kickoff: registry completo + keys congeladas", () => {
  it("cada def resuelve componente y la config no dropea ninguna", () => {
    const faltantes = KICKOFF_SECTION_DEFS.filter((d) => !KICKOFF_SECTION_COMPONENTS[d.sectionType ?? d.key]);
    expect(faltantes.map((d) => `${d.key}→${d.sectionType}`)).toEqual([]);
    expect(landingConfigForKickoff().sections.map((s) => s.key)).toEqual(
      KICKOFF_SECTION_DEFS.map((d) => d.key),
    );
  });

  it("snapshot de keys: bienvenida abre, cierre cierra", () => {
    expect(KICKOFF_SECTION_DEFS.map((d) => d.key)).toEqual([
      "bienvenida", "objetivos", "hoy_vs_sistema", "alcance", "equipo", "tu_rol",
      "metricas_exito", "horarios", "canales", "proximos_pasos", "cronograma", "procesos", "cierre",
    ]);
  });

  it("sin componentes huérfanos en KICKOFF_SECTION_COMPONENTS", () => {
    const usados = new Set(KICKOFF_SECTION_DEFS.map((d) => d.sectionType ?? d.key));
    const huerfanos = Object.keys(KICKOFF_SECTION_COMPONENTS).filter((t) => !usados.has(t));
    expect(huerfanos).toEqual([]);
  });
});

describe("Desarrollo: registry completo + keys congeladas", () => {
  it("cada def resuelve componente y la config no dropea ninguna", () => {
    const faltantes = DESARROLLO_SECTION_DEFS.filter((d) => !DESARROLLO_SECTION_COMPONENTS[d.sectionType ?? d.key]);
    expect(faltantes.map((d) => `${d.key}→${d.sectionType}`)).toEqual([]);
    expect(landingConfigForDesarrollo().sections.map((s) => s.key)).toEqual(
      DESARROLLO_SECTION_DEFS.map((d) => d.key),
    );
  });

  it("snapshot de keys: requerimiento abre, cierre cierra", () => {
    expect(DESARROLLO_SECTION_DEFS.map((d) => d.key)).toEqual([
      "requerimiento", "estimacion", "retos_cliente", "criterios_exito", "arquitectura",
      "relacion_objetos", "propiedades", "comunicacion", "cierre",
    ]);
  });

  it("sin componentes huérfanos en DESARROLLO_SECTION_COMPONENTS (salvo legacy de snapshots)", () => {
    const usados = new Set(DESARROLLO_SECTION_DEFS.map((d) => d.sectionType ?? d.key));
    const huerfanos = Object.keys(DESARROLLO_SECTION_COMPONENTS).filter(
      (t) => !usados.has(t) && !LEGACY_SNAPSHOT_TYPES.has(t),
    );
    expect(huerfanos).toEqual([]);
  });
});

describe("Exploración: registry completo + keys congeladas", () => {
  it("cada def resuelve componente y la config no dropea ninguna", () => {
    const faltantes = EXPLORACION_SECTION_DEFS.filter((d) => !EXPLORACION_SECTION_COMPONENTS[d.sectionType ?? d.key]);
    expect(faltantes.map((d) => `${d.key}→${d.sectionType}`)).toEqual([]);
    expect(landingConfigForExploracion().sections.map((s) => s.key)).toEqual(
      EXPLORACION_SECTION_DEFS.map((d) => d.key),
    );
  });

  it("snapshot de keys: exploracion abre, cierre cierra", () => {
    expect(EXPLORACION_SECTION_DEFS.map((d) => d.key)).toEqual([
      "exploracion", "ya_sabemos", "sin_verificar", "sesiones",
      "personas", "profundidad", "cierre",
    ]);
  });

  it("sin componentes huérfanos en EXPLORACION_SECTION_COMPONENTS", () => {
    const usados = new Set(EXPLORACION_SECTION_DEFS.map((d) => d.sectionType ?? d.key));
    const huerfanos = Object.keys(EXPLORACION_SECTION_COMPONENTS).filter(
      (t) => !usados.has(t) && !LEGACY_SNAPSHOT_TYPES.has(t),
    );
    expect(huerfanos).toEqual([]);
  });

  // La sección que sostiene el documento: separar lo confirmado de lo supuesto. Si
  // alguna de las dos se cayera del set, el documento perdería su razón de ser y el
  // snapshot de arriba lo diría — pero este test lo dice POR QUÉ.
  it("las dos secciones del eje confirmado-vs-supuesto existen y el agente las genera", () => {
    for (const key of ["ya_sabemos", "sin_verificar"]) {
      const def = EXPLORACION_SECTION_DEFS.find((d) => d.key === key);
      expect(def, `falta la sección ${key}`).toBeDefined();
      expect(def?.agentGenerated, `${key} debe generarla el agente`).not.toBe(false);
    }
  });

  // El cierre es CURADO: si el agente pudiera escribirlo, una regeneración pisaría lo
  // que el equipo dejó anotado (mismo criterio que el `cierre` de kickoff/desarrollo).
  it("el cierre es curado (agentGenerated:false) y va pinneado al final", () => {
    const cierre = EXPLORACION_SECTION_DEFS.at(-1);
    expect(cierre?.key).toBe("cierre");
    expect(cierre?.agentGenerated).toBe(false);
    expect(cierre?.pinned).toBe(true);
  });
});

/**
 * El renderer `web_diagnosis` nació para la PROPUESTA DE SITIO WEB: su panel oscuro se
 * rotula "Por qué " + `data.plataforma` (el nombre de la plataforma que se propone), y su
 * columna izquierda "Retos actuales". Cuando Exploración, Diagnóstico y Desarrollo lo
 * reusaron, los briefs le hicieron escribir al agente un RÓTULO adentro de `plataforma`
 * para tapar el problema — y el resultado renderizado fue el stutter que el usuario vio en
 * vivo: «POR QUÉ QUÉ SE ROMPE SI EL SUPUESTO ES FALSO». El rótulo ahora es `chips`, un
 * dato de la def; `plataforma` volvió a ser solo un dato.
 */
describe("web_diagnosis: los rótulos son `chips` de la def, no texto que escriba el agente", () => {
  const INTERNOS = [
    ...EXPLORACION_SECTION_DEFS.map((d) => ["exploración", d] as const),
    ...DIAGNOSTICO_SECTION_DEFS.map((d) => ["diagnóstico", d] as const),
    ...DESARROLLO_SECTION_DEFS.map((d) => ["desarrollo", d] as const),
  ].filter(([, d]) => d.sectionType === "web_diagnosis");

  it("los 3 documentos internos reusan el renderer (si no, este test no protege nada)", () => {
    expect(INTERNOS.map(([doc, d]) => `${doc}:${d.key}`)).toEqual([
      "exploración:sin_verificar", "diagnóstico:gap_analysis", "desarrollo:retos_cliente",
    ]);
  });

  it("cada uno declara su rótulo de panel y ninguno arranca con «Por qué»", () => {
    for (const [doc, d] of INTERNOS) {
      expect(d.chips?.panel, `${doc}:${d.key} sin chips.panel → rotula "Por qué" a secas`).toBeTruthy();
      // El componente ya no antepone "Por qué" cuando hay chip: repetirlo lo duplicaría.
      expect(d.chips?.panel?.toLowerCase().startsWith("por qué")).toBe(false);
    }
  });

  it("ningún brief le pide al agente que escriba `plataforma` (es la fuente del stutter)", () => {
    for (const [doc, d] of INTERNOS) {
      expect(d.brief.includes("`plataforma`"), `${doc}:${d.key} vuelve a rotular por \`plataforma\``).toBe(false);
    }
  });

  it("la propuesta de sitio web NO declara chips: sus rótulos son los históricos", () => {
    // Cinco propuestas publicadas los tienen congelados en su snapshot. Cambiarlos acá
    // haría que el documento vivo y el publicado dijeran cosas distintas.
    const web = BC_TEMPLATES.website_v1.sections.find((d) => d.sectionType === "web_diagnosis");
    expect(web?.key).toBe("diagnostico");
    expect(web?.chips).toBeUndefined();
  });
});

/**
 * La sección de INVERSIÓN es UNA sola desde 2026-08-12, pero sigue declarada por los DOS
 * templates bajo la misma key. `findDefAcrossTemplates` devuelve la PRIMERA que encuentre,
 * así que cualquier cosa load-bearing que difiera entre las dos produce un comportamiento
 * que depende del orden de un objeto — lo peor de depurar.
 */
describe("Inversión: una sola sección, dos defs que no pueden divergir", () => {
  const defs = Object.entries(BC_TEMPLATES).map(
    ([id, tpl]) => [id, tpl.sections.find((d) => d.key === "inversion")] as const,
  );

  it("los dos templates la declaran", () => {
    for (const [id, def] of defs) expect(def, `${id} sin sección inversion`).toBeTruthy();
  });

  it("los dos sectionType apuntan al MISMO componente", () => {
    expect(SECTION_COMPONENTS.inversion).toBe(SECTION_COMPONENTS.web_investment);
  });

  it("las dos son `agentGenerated:false` — el flag decide 4 gates a la vez", () => {
    // generableSections, la píldora ✨IA, el 400 de regenerate y el contrato del assist.
    for (const [id, def] of defs) expect(def?.agentGenerated, `${id}`).toBe(false);
  });

  it("las dos tienen el MISMO schema vacío: el agente no escribe montos por ninguna vía", () => {
    for (const [id, def] of defs) {
      const props = (def?.schema as { properties?: Record<string, unknown> })?.properties;
      expect(props, `${id} declara propiedades: el agente podría escribir precios`).toEqual({});
    }
  });

  it("ningún brief le pide montos al agente", () => {
    for (const [id, def] of defs) {
      expect(def?.brief.includes("la escribe VENTAS"), `${id}`).toBe(true);
    }
  });

  /* ⚠ Congelado porque hay propuestas de sitio web PUBLICADAS que dicen "Inversión única —
     Fase 1" / "Rango Fase 1", y `configForSnapshot` resuelve por key contra la config viva
     → estrenan el renderer nuevo. Sin esta declaración heredarían los rótulos genéricos y
     al cliente le cambiaría el documento que ya tiene. */
  it("sitio web conserva sus rótulos históricos; HubSpot usa los genéricos", () => {
    const web = BC_TEMPLATES.website_v1.sections.find((d) => d.key === "inversion");
    expect(web?.invest).toEqual({ servicios: "inversionFase", totalServicios: "rangoFase" });
    expect(BC_TEMPLATES.hubspot_v1.sections.find((d) => d.key === "inversion")?.invest).toBeUndefined();
  });
});

describe("Diagnóstico: registry completo + keys congeladas", () => {
  it("cada def resuelve componente y la config no dropea ninguna", () => {
    const faltantes = DIAGNOSTICO_SECTION_DEFS.filter((d) => !DIAGNOSTICO_SECTION_COMPONENTS[d.sectionType ?? d.key]);
    expect(faltantes.map((d) => `${d.key}→${d.sectionType}`)).toEqual([]);
    expect(landingConfigForDiagnostico().sections.map((s) => s.key)).toEqual(
      DIAGNOSTICO_SECTION_DEFS.map((d) => d.key),
    );
  });

  it("snapshot de keys: hero abre, cierre cierra, las legacy se conservan", () => {
    // Las 8 keys legacy SIGUEN acá a propósito: el contenido markdown viejo (Teamnet)
    // se rinde vía __legacyMd. Tres son solo-lectura (el agente nuevo no las escribe).
    expect(DIAGNOSTICO_SECTION_DEFS.map((d) => d.key)).toEqual([
      "diagnostico", "contexto_alcance", "estado_actual", "estado_deseado",
      "escala", "causa_raiz", "gap_analysis", "impacto_gap",
      "recomendaciones", "proximos_pasos", "cierre",
    ]);
  });

  it("sin componentes huérfanos en DIAGNOSTICO_SECTION_COMPONENTS", () => {
    const usados = new Set(DIAGNOSTICO_SECTION_DEFS.map((d) => d.sectionType ?? d.key));
    const huerfanos = Object.keys(DIAGNOSTICO_SECTION_COMPONENTS).filter(
      (t) => !usados.has(t) && !LEGACY_SNAPSHOT_TYPES.has(t),
    );
    expect(huerfanos).toEqual([]);
  });

  it("las keys 1:1 con las secciones del canvas — el runner saltea EN SILENCIO las que no matchean", () => {
    // Es literalmente el bug que tenía el diagnóstico viejo (prompt de 6 secciones
    // contra canvas de 8): el agente emitía keys sin sección y no se escribía nada.
    const canvasKeys = new Set(DIAGNOSTICO_CANVAS.sections.map((s) => s.key));
    for (const d of DIAGNOSTICO_SECTION_DEFS) {
      expect(canvasKeys.has(d.key), `la def "${d.key}" no existe como sección del canvas`).toBe(true);
    }
    expect(DIAGNOSTICO_CANVAS.sections.length).toBe(DIAGNOSTICO_SECTION_DEFS.length);
  });

  it("las solo-lectura legacy y el cierre NO las escribe el agente", () => {
    for (const key of ["estado_deseado", "impacto_gap", "proximos_pasos", "cierre"]) {
      expect(DIAGNOSTICO_DEF_BY_KEY[key].agentGenerated, `${key} debería ser agentGenerated:false`).toBe(false);
    }
  });
});

describe("Planificación: registry completo + keys congeladas", () => {
  it("cada def resuelve componente y la config no dropea ninguna", () => {
    const faltantes = PLANIFICACION_SECTION_DEFS.filter((d) => !PLANIFICACION_SECTION_COMPONENTS[d.sectionType ?? d.key]);
    expect(faltantes.map((d) => `${d.key}→${d.sectionType}`)).toEqual([]);
    expect(landingConfigForPlanificacion().sections.map((s) => s.key)).toEqual(
      PLANIFICACION_SECTION_DEFS.map((d) => d.key),
    );
  });

  it("snapshot de keys: hero abre, cierre cierra, las 4 legacy se conservan", () => {
    expect(PLANIFICACION_SECTION_DEFS.map((d) => d.key)).toEqual([
      "planificacion", "arquitectura_solucion", "roadmap", "definicion_procesos",
      "ciclo_vida_crm", "rutinas_adopcion", "plan_despliegue", "metricas_exito", "cierre",
    ]);
  });

  it("las keys 1:1 con las secciones del canvas (el runner saltea en silencio lo que no matchea)", () => {
    const canvasKeys = new Set(PLANIFICACION_CANVAS.sections.map((s) => s.key));
    for (const d of PLANIFICACION_SECTION_DEFS) {
      expect(canvasKeys.has(d.key), `la def "${d.key}" no existe como sección del canvas`).toBe(true);
    }
    expect(PLANIFICACION_CANVAS.sections.length).toBe(PLANIFICACION_SECTION_DEFS.length);
  });

  it("el plan de despliegue es CONDICIONAL: el agente puede dejarlo vacío", () => {
    // La decisión de negocio: con adopción directa la sección queda vacía y el modo
    // lectura la omite. Si dejara de ser agentGenerated, el mecanismo se rompe.
    expect(PLANIFICACION_DEF_BY_KEY["plan_despliegue"].agentGenerated).toBe(true);
    expect(PLANIFICACION_DEF_BY_KEY["cierre"].agentGenerated).toBe(false);
  });
});

describe("Implementación: registry completo + keys congeladas", () => {
  it("cada def resuelve componente y la config no dropea ninguna", () => {
    const faltantes = IMPLEMENTACION_SECTION_DEFS.filter((d) => !IMPLEMENTACION_SECTION_COMPONENTS[d.sectionType ?? d.key]);
    expect(faltantes.map((d) => `${d.key}→${d.sectionType}`)).toEqual([]);
    expect(landingConfigForImplementacion().sections.map((s) => s.key)).toEqual(
      IMPLEMENTACION_SECTION_DEFS.map((d) => d.key),
    );
  });

  it("snapshot de keys: el ORDEN es la doctrina — arquitectura antes que prompts", () => {
    // Decisión de negocio 2026-07-25: primero se decide la arquitectura (propiedades,
    // pipelines, marketing) y RECIÉN AHÍ valen los prompts para Breeze. Pedirle a
    // Breeze que construya sin arquitectura decidida es pedirle que la invente.
    const keys = IMPLEMENTACION_SECTION_DEFS.map((d) => d.key);
    expect(keys).toEqual([
      "implementacion", "arquitectura_propiedades", "pipelines",
      "procesos_marketing", "prompts_breeze", "a_mano", "cierre",
    ]);
    expect(keys.indexOf("prompts_breeze")).toBeGreaterThan(keys.indexOf("arquitectura_propiedades"));
    expect(keys.indexOf("prompts_breeze")).toBeGreaterThan(keys.indexOf("pipelines"));
  });

  it("las keys 1:1 con las secciones del canvas", () => {
    const canvasKeys = new Set(IMPLEMENTACION_CANVAS.sections.map((s) => s.key));
    for (const d of IMPLEMENTACION_SECTION_DEFS) {
      expect(canvasKeys.has(d.key), `la def "${d.key}" no existe como sección del canvas`).toBe(true);
    }
    expect(IMPLEMENTACION_CANVAS.sections.length).toBe(IMPLEMENTACION_SECTION_DEFS.length);
  });
});

describe("Cronograma: registry completo + keys congeladas", () => {
  it("cada def resuelve componente y la config no dropea ninguna", () => {
    const faltantes = CRONOGRAMA_SECTION_DEFS.filter(
      (d) => !CRONOGRAMA_SECTION_COMPONENTS[d.sectionType ?? d.key],
    );
    expect(faltantes.map((d) => `${d.key}→${d.sectionType}`)).toEqual([]);
    expect(landingConfigForCronograma().sections.map((s) => s.key)).toEqual(
      CRONOGRAMA_SECTION_DEFS.map((d) => d.key),
    );
  });

  it("snapshot de keys: portada y Gantt, y nada más", () => {
    /* Es el documento más chico de los nueve, y tiene que seguir siéndolo: todo lo demás del
       cronograma (avisos, propuestas, publicación) es del EDITOR, no del documento. */
    expect(CRONOGRAMA_SECTION_DEFS.map((d) => d.key)).toEqual(["portada", "cronograma"]);
  });

  it("sin componentes huérfanos en CRONOGRAMA_SECTION_COMPONENTS", () => {
    const usados = new Set(CRONOGRAMA_SECTION_DEFS.map((d) => d.sectionType ?? d.key));
    expect(Object.keys(CRONOGRAMA_SECTION_COMPONENTS).filter((t) => !usados.has(t))).toEqual([]);
  });

  it("ninguna de sus secciones la escribe un agente", () => {
    /* Las dos salen de `ctx` o del proyecto. Si alguna se marcara `agentGenerated`, el
       catálogo de agentes le ofrecería al CSE generar un texto que nadie va a leer —
       el motor las pinta desde ProjectTimeline igual. */
    expect(CRONOGRAMA_SECTION_DEFS.filter((d) => d.agentGenerated).map((d) => d.key)).toEqual([]);
  });
});

/* ── El encabezado no puede decir dos veces lo mismo ───────────────────────────
   `LandingView` pinta eyebrow ARRIBA del título; si los dos traen la misma palabra, el
   documento abre la sección con «INVERSIÓN / Inversión», que se lee como un error de armado.
   Pasó de verdad (Elías lo vio en la propuesta de HubSpot) y el eyebrow de esa sección pasó a
   ser «Propuesta económica».

   Las `selfTitled` quedan FUERA a propósito: ahí el motor NO pinta encabezado —lo hace la
   propia sección— así que su `eyebrow` es solo el respaldo que viaja por props y repetir el
   label no produce ninguna repetición en pantalla. Hoy son las cuatro secciones de cierre. */
describe("eyebrow ≠ título en toda def con encabezado del motor", () => {
  const GRUPOS: Record<string, readonly { key: string; label: string; eyebrow?: string; selfTitled?: boolean }[]> = {
    ...Object.fromEntries(Object.entries(BC_TEMPLATES).map(([id, t]) => [id, t.sections])),
    kickoff: KICKOFF_SECTION_DEFS,
    desarrollo: DESARROLLO_SECTION_DEFS,
    exploracion: EXPLORACION_SECTION_DEFS,
    diagnostico: DIAGNOSTICO_SECTION_DEFS,
    implementacion: IMPLEMENTACION_SECTION_DEFS,
    planificacion: PLANIFICACION_SECTION_DEFS,
    cronograma: CRONOGRAMA_SECTION_DEFS,
  };

  it("ninguna sección repite la misma palabra en el rótulo chico y en el grande", () => {
    const norm = (s?: string) => (s ?? "").trim().toLowerCase();
    const repetidos: string[] = [];
    for (const [id, defs] of Object.entries(GRUPOS)) {
      for (const d of defs) {
        if (d.selfTitled) continue;
        if (d.eyebrow && norm(d.eyebrow) === norm(d.label)) repetidos.push(`${id}:${d.key} → "${d.eyebrow}"`);
      }
    }
    expect(repetidos).toEqual([]);
  });
});

describe("Entrega: registry completo + keys congeladas", () => {
  it("cada def resuelve componente y la config no dropea ninguna", () => {
    const faltantes = ENTREGA_SECTION_DEFS.filter((d) => !ENTREGA_SECTION_COMPONENTS[d.sectionType ?? d.key]);
    expect(faltantes.map((d) => `${d.key}→${d.sectionType}`)).toEqual([]);
    expect(landingConfigForEntrega().sections.map((s) => s.key)).toEqual(
      ENTREGA_SECTION_DEFS.map((d) => d.key),
    );
  });

  it("snapshot de keys: el ORDEN es la narrativa del cierre", () => {
    /* Primero QUÉ se construyó, después CÓMO se cumplió, al final QUÉ FALTA. Al revés el
       documento arranca justificándose, que es lo último que uno quiere leer en una entrega. */
    const keys = ENTREGA_SECTION_DEFS.map((d) => d.key);
    expect(keys).toEqual([
      "portada", "resumen", "alcance", "logros",
      "cumplimiento", "impacto", "pendientes", "continuidad", "recomendaciones", "cierre",
    ]);
    expect(keys.indexOf("pendientes")).toBeGreaterThan(keys.indexOf("logros"));
    /* `recomendaciones` DESPUÉS de `continuidad` y no antes: la propuesta del próximo proyecto
       va primero, y lo que el cliente puede hacer solo va después, como la salida para el que
       no quiere contratar nada. Al revés, la propuesta se lee como el plan B. */
    expect(keys.indexOf("recomendaciones")).toBeGreaterThan(keys.indexOf("continuidad"));
  });

  it("⚠ LOS NÚMEROS NO LOS ESCRIBE EL AGENTE", () => {
    /* La única promesa de honestidad del documento. `cumplimiento` y `pendientes` son cifras
       sobre el proyecto del cliente y las calcula el runner desde el cronograma; el agente ni
       las ve. Poner `agentGenerated: true` en cualquiera de las dos deja al modelo escribiendo
       «se completó el 100% del plan» sin que nada lo contradiga — y este es el documento que
       el cliente archiva y cita. */
    expect(ENTREGA_DEF_BY_KEY["cumplimiento"].agentGenerated).toBe(false);
    expect(ENTREGA_DEF_BY_KEY["pendientes"].agentGenerated).toBe(false);
    // Y el template que se le manda al modelo NO puede incluirlas.
    const alModelo = ENTREGA_SECTION_DEFS.filter((d) => d.agentGenerated !== false).map((d) => d.key);
    expect(alModelo).not.toContain("cumplimiento");
    expect(alModelo).not.toContain("pendientes");
  });

  it("la portada y el cierre no se ocultan ni se mueven", () => {
    /* Elías pidió que las secciones se puedan ocultar y mover — las SIETE del medio lo son.
       Estas dos no: publicar una entrega sin portada no es libertad, es un agujero. */
    for (const k of ["portada", "cierre"]) {
      expect(ENTREGA_DEF_BY_KEY[k].pinned, `${k} debería estar fijada`).toBe(true);
      expect(ENTREGA_DEF_BY_KEY[k].noHide, `${k} no debería poder ocultarse`).toBe(true);
    }
    const ocultables = ENTREGA_SECTION_DEFS.filter((d) => !d.noHide).map((d) => d.key);
    expect(ocultables).toHaveLength(8);
  });

  it("las keys 1:1 con las secciones del canvas", () => {
    const canvasKeys = new Set(ENTREGA_CANVAS.sections.map((s) => s.key));
    for (const d of ENTREGA_SECTION_DEFS) {
      expect(canvasKeys.has(d.key), `la def "${d.key}" no existe como sección del canvas`).toBe(true);
    }
    expect(ENTREGA_CANVAS.sections.length).toBe(ENTREGA_SECTION_DEFS.length);
  });
});

describe("Cronograma: registry completo + keys congeladas", () => {
  it("cada def resuelve componente y la config no dropea ninguna", () => {
    const faltantes = CRONOGRAMA_SECTION_DEFS.filter(
      (d) => !CRONOGRAMA_SECTION_COMPONENTS[d.sectionType ?? d.key],
    );
    expect(faltantes.map((d) => `${d.key}→${d.sectionType}`)).toEqual([]);
    expect(landingConfigForCronograma().sections.map((s) => s.key)).toEqual(
      CRONOGRAMA_SECTION_DEFS.map((d) => d.key),
    );
  });

  it("snapshot de keys: portada y Gantt, y nada más", () => {
    /* Es el documento más chico de los nueve, y tiene que seguir siéndolo: todo lo demás del
       cronograma (avisos, propuestas, publicación) es del EDITOR, no del documento. */
    expect(CRONOGRAMA_SECTION_DEFS.map((d) => d.key)).toEqual(["portada", "cronograma"]);
  });

  it("sin componentes huérfanos en CRONOGRAMA_SECTION_COMPONENTS", () => {
    const usados = new Set(CRONOGRAMA_SECTION_DEFS.map((d) => d.sectionType ?? d.key));
    expect(Object.keys(CRONOGRAMA_SECTION_COMPONENTS).filter((t) => !usados.has(t))).toEqual([]);
  });

  it("ninguna de sus secciones la escribe un agente", () => {
    /* Las dos salen de `ctx` o del proyecto. Si alguna se marcara `agentGenerated`, el
       catálogo de agentes le ofrecería al CSE generar un texto que nadie va a leer —
       el motor las pinta desde ProjectTimeline igual. */
    expect(CRONOGRAMA_SECTION_DEFS.filter((d) => d.agentGenerated).map((d) => d.key)).toEqual([]);
  });
});

describe("La comparación de procesos: rótulo por documento, subtítulo por caja", () => {
  /* `process_mapping` la comparten CINCO documentos y en cuatro el proyecto todavía no ocurrió.
     Estos asserts protegen las dos formas en que este cambio se rompe en silencio. */

  const propsDe = (schema: unknown) =>
    (
      (schema as { properties: { procesos: { items: { properties: Record<string, unknown> } } } })
        .properties.procesos
    ).items.properties;

  it("⚠ los subtítulos viven DENTRO del schema — fuera se borran en cada regeneración", () => {
    /* `preserveNonSchemaKeys` (lib/ai/section-schema.ts) solo acarrea claves de PRIMER nivel.
       `resumenHoy`/`resumenSera` están dentro de `procesos[]`, así que si alguien los saca del
       schema pensando «esto es solo UI», `coerceToSchema` los borra en cada regeneración y
       nada los rescata: el CSE escribe el titular, regenera, y desapareció sin error. */
    const props = propsDe(PROCESS_MAPPING_SCHEMA_CON_TITULAR);
    for (const k of ["resumenHoy", "resumenSera", "comoEsHoy", "comoSera"]) {
      expect(props, `"${k}" fuera del schema = se borra al regenerar`).toHaveProperty(k);
    }
  });

  it("⚠ y NO viven en el schema compartido: el schema es el prompt de los otros cuatro", () => {
    /* `shapeOf` recursa dentro de `items`, así que el schema ES la forma que el modelo recibe.
       Meter los titulares en el compartido pone a los agentes de Diagnóstico, Planificación,
       Implementación y el Business Case a escribir dos campos que ningún brief de ellos
       explica — y en `implementacion.pipelines`, donde el «antes» es una lista de etapas, un
       titular de media línea no tiene contenido posible. La variante entra por el documento
       que la pidió, igual que `CompararLabels`. */
    const compartido = propsDe(PROCESS_MAPPING_SCHEMA);
    expect(compartido).not.toHaveProperty("resumenHoy");
    expect(compartido).not.toHaveProperty("resumenSera");
  });

  it("solo la Entrega cambia los rótulos; los otros cuatro miran hacia adelante", () => {
    /* «Con la implementación» en un documento de cierre convierte un hecho en una promesa.
       Y al revés: «Ahora» en un diagnóstico afirmaría algo que todavía no pasó. */
    expect(ENTREGA_DEF_BY_KEY["resumen"].compara).toEqual({
      izquierda: "antes",
      derecha: "ahora",
      // Los placeholders del EDITOR también, o el CSE lee «Cómo quedará…» bajo «AHORA».
      phIzquierda: "comoFuncionabaAntes",
      phDerecha: "comoFuncionaAhora",
    });

    /* Los BC_TEMPLATES entran por el barrido y no a mano: la quinta def de `process_mapping`
       no vive en ningún `*_SECTION_DEFS` —la sintetiza `makeProcessMappingDef` dentro del
       template— así que enumerar los tres arrays dejaba fuera justo la propuesta comercial,
       donde rotular «Antes/Ahora» sobre un proyecto que todavía no se vendió es lo más caro. */
    const otros = [
      ...DIAGNOSTICO_SECTION_DEFS,
      ...PLANIFICACION_SECTION_DEFS,
      ...IMPLEMENTACION_SECTION_DEFS,
      ...Object.values(BC_TEMPLATES).flatMap((t) => t.sections),
    ].filter((d) => d.sectionType === "process_mapping");
    expect(otros.length, "ningún otro documento usa process_mapping — ¿se movió?").toBeGreaterThan(0);
    for (const d of otros) {
      expect(d.compara, `"${d.key}" no debería redefinir los rótulos`).toBeUndefined();
    }
  });

  it("el renderer LEE el rótulo de la def, no un literal", () => {
    /* Sin esto la plomería queda a medias y falla del peor modo: el campo se declara, el tipo
       compila, y el componente sigue pintando «Hoy». Verificado sobre el archivo real. */
    const src = fs.readFileSync(
      path.join(__dirname, "..", "..", "components", "landing", "sections-shared.tsx"),
      "utf8",
    );
    expect(src).toContain('t(lang, sectionCompara?.izquierda ?? "hoy")');
    expect(src).toContain('t(lang, sectionCompara?.derecha ?? "conImplementacion")');
  });

  it("los rótulos nuevos existen en los dos idiomas", () => {
    /* Tipar contra `LandingStringKey` obliga a que la clave exista; esto fija que no quede a
       medias. La Entrega se le comparte al CLIENTE y se traduce por `__lang`: un literal en
       español saldría tal cual dentro de un documento en inglés. */
    expect(t("es", "antes")).toBe("Antes");
    expect(t("en", "antes")).toBe("Before");
    expect(t("es", "ahora")).toBe("Ahora");
    expect(t("en", "ahora")).toBe("Now");
  });
});

describe("⭐ el catálogo de secciones creables y sus renderers no pueden divergir", () => {
  it("todo tipo del catálogo resuelve un renderer", () => {
    /* ⛔ EL MODO DE FALLA: `toSectionDef` devuelve `null` para un `sectionType` que no está en el
       mapa, el `.filter()` lo descarta, y **la sección desaparece del editor, del PDF y de la
       propuesta del cliente sin un solo error**. Ofrecer en el catálogo un tipo que no se puede
       dibujar es prometer una sección que se evapora al crearla.
       La edición que la pone en rojo: sumar un tipo al catálogo sin registrar su componente. */
    const sinRenderer = CATALOGO_DE_SECCIONES.filter(
      (t) => !COMPONENTES_CREABLES[t.sectionType] && !SECTION_COMPONENTS[t.sectionType],
    );
    expect(
      sinRenderer.map((t) => `${t.tipo}→${t.sectionType}`),
      "hay tipos ofrecidos que no se pueden dibujar: crearlos haría desaparecer la sección",
    ).toEqual([]);
  });

  it("y ningún renderer creable queda sin tipo que lo ofrezca", () => {
    /* La otra dirección: un componente registrado como creable que el catálogo no ofrece es
       código que nadie puede alcanzar. Se saca del mapa o se ofrece. */
    const ofrecidos = new Set(CATALOGO_DE_SECCIONES.map((t) => t.sectionType));
    const huerfanos = Object.keys(COMPONENTES_CREABLES).filter((k) => !ofrecidos.has(k));
    expect(
      huerfanos,
      "hay renderers creables que el catálogo no ofrece: son inalcanzables",
    ).toEqual([]);
  });

  it("⚠ toda hoja del schema de un tipo creable es un TEXTO", () => {
    /* `coerceToSchema` aplana a vacío cualquier hoja que no sea string. Un `{type:"number"}` no
       falla: devuelve `""`, y el campo queda mudo sin que nada avise. Es la regla que
       `shared-sections.defs.ts` ya declara en su encabezado, acá hecha cumplir sobre el catálogo.
       La edición que la pone en rojo: declarar un precio como número en el schema de la tabla. */
    const malas: string[] = [];
    const recorrer = (nodo: unknown, ruta: string) => {
      const n = nodo as { type?: string; properties?: Record<string, unknown>; items?: unknown };
      if (n?.type === "object") {
        for (const [k, sub] of Object.entries(n.properties ?? {})) recorrer(sub, `${ruta}.${k}`);
        return;
      }
      if (n?.type === "array") return recorrer(n.items, `${ruta}[]`);
      if (n?.type !== "string") malas.push(`${ruta} es ${String(n?.type)}`);
    };
    for (const t of CATALOGO_DE_SECCIONES) recorrer(t.schema, t.tipo);
    expect(malas, "una hoja que no es texto se guarda vacía, sin error").toEqual([]);
  });

  it("⚠ el tipo por defecto sigue siendo el embebido de HTML", () => {
    /* Las secciones creadas antes del 2026-08-21 tienen keys de DOS segmentos, sin tipo, y son
       embebidos. Cambiar el default les cambia el renderer a todas, retroactivamente, en
       propuestas que ya se enviaron. */
    const porDefecto = CATALOGO_DE_SECCIONES.find((t) => t.tipo === TIPO_POR_DEFECTO);
    expect(porDefecto?.sectionType, "cambió el renderer de todas las secciones creadas viejas").toBe(
      HTML_EMBED_TYPE,
    );
  });
});
