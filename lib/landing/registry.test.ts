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
import { DIAGNOSTICO_CANVAS, PLANIFICACION_CANVAS, IMPLEMENTACION_CANVAS } from "@/lib/canvas/canvas-defs";
import { IMPLEMENTACION_SECTION_DEFS } from "@/components/landing/configs/implementacion.defs";
import { IMPLEMENTACION_SECTION_COMPONENTS, landingConfigForImplementacion } from "@/components/landing/configs/implementacion";
import { PLANIFICACION_SECTION_DEFS, PLANIFICACION_DEF_BY_KEY } from "@/components/landing/configs/planificacion.defs";
import { PLANIFICACION_SECTION_COMPONENTS, landingConfigForPlanificacion } from "@/components/landing/configs/planificacion";

/** Renderers que ningún def VIVO usa pero que se conservan a PROPÓSITO: los
 *  snapshots publicados congelan `sectionType` y `configForSnapshot` los
 *  resuelve por este registry — borrarlos rompería lo ya publicado. Entra acá
 *  SOLO con esa justificación (ej. `tech_architecture`, reemplazado por
 *  `diagram` en el retema 2026-07 — ver shared-sections.defs). */
const LEGACY_SNAPSHOT_TYPES = new Set(["tech_architecture"]);

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

  it("sin componentes huérfanos en SECTION_COMPONENTS (salvo legacy de snapshots)", () => {
    const usados = new Set(
      Object.values(BC_TEMPLATES).flatMap((tpl) => tpl.sections.map((d) => d.sectionType ?? d.key)),
    );
    const huerfanos = Object.keys(SECTION_COMPONENTS).filter(
      (t) => !usados.has(t) && !LEGACY_SNAPSHOT_TYPES.has(t),
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
