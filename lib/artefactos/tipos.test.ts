/**
 * El registro de tipos y el catálogo de secciones (etapa V2 de docs/artefactos-plan.md), CONGELADOS.
 *
 * Agregar un tipo, cambiar cuántas copias admite o mover una sección de su catálogo es decisión de producto (como
 * lib/landing/registry.test.ts): el snapshot de abajo se cambia a la vista, nunca para callar el test.
 */
import { describe, expect, it } from "vitest";
import { TIPOS, admiteCopias, plantillaDelTipo, plantillasDelTipo, tipoDeArtefacto, tiposCreablesEnElProyecto } from "./tipos";
import { canvasDefDeUnaCopia, catalogoDelTipo, defsDelTipo, handoffKeysDelTipo, seccionesDeUnaCopia, templateDelTipo } from "./catalogo";
import { ENTREGABLES } from "@/lib/entregables/registro";
import { TEMPLATE_DE_LA_PLANTILLA } from "@/lib/entregables/plantillas";
import { EXPLORACION_TEMPLATE } from "@/components/landing/configs/exploracion.defs";
import { COLUMNAS_DEL_MAPA_DE_INTEGRACION, INTEGRACION_DEF_BY_KEY } from "@/components/landing/configs/integracion.defs";
import { ADOPCION_DEF_BY_KEY } from "@/components/landing/configs/adopcion.defs";
import { PLANIFICACION_DEF_BY_KEY } from "@/components/landing/configs/planificacion.defs";
import { DESARROLLO_DEF_BY_KEY } from "@/components/landing/configs/desarrollo.defs";

const DEL_MOTOR = TIPOS.filter((t) => t.vive === "canvas" && t.id !== "handoff");

describe("tipos: el set y lo que admite cada uno", () => {
  it("snapshot del set de tipos (id · copias · dueños · lo lee el cliente)", () => {
    expect(TIPOS.map((t) => `${t.id} · ${t.copias} · ${t.duenos.join("+")} · ${t.clientFacing ? "cliente" : "interno"}`)).toEqual([
      "exploration · una · proyecto+empresa · interno",
      "diagnosis · varias · proyecto+empresa · cliente",
      "kickoff · varias · proyecto · cliente",
      "planning · varias · proyecto · cliente",
      "tech-requirements · varias · proyecto · cliente",
      "adoption-plan · varias · proyecto · cliente",
      "roadmap · varias · proyecto+empresa · cliente",
      "delivery · varias · proyecto · cliente",
      "implementation · una · proyecto · interno",
      "timeline · una · proyecto · cliente",
      "handoff · una · proyecto · interno",
    ]);
  });

  it("los ids no se repiten", () => {
    expect(new Set(TIPOS.map((t) => t.id)).size).toBe(TIPOS.length);
  });

  it("se crean: los ocho del catálogo que viven en el motor (la propuesta y el cronograma tienen su lugar; la escala no es un artefacto)", () => {
    expect(tiposCreablesEnElProyecto().map((t) => t.id)).toEqual([
      "exploration",
      "diagnosis",
      "kickoff",
      "planning",
      "tech-requirements",
      "adoption-plan",
      "roadmap",
      "delivery",
    ]);
    for (const id of ["timeline", "handoff", "implementation", "escala", "integration", "exploration", "no-existe", null]) {
      expect(admiteCopias(id), String(id)).toBe(false);
    }
  });

  it("cada plantilla de cada tipo con canvas solo usa keys de su catálogo", () => {
    const ajenas: string[] = [];
    for (const t of DEL_MOTOR) {
      const keys = new Set((defsDelTipo(t.id) ?? []).map((d) => d.key));
      expect(keys.size, `${t.id} no tiene catálogo`).toBeGreaterThan(0);
      for (const p of plantillasDelTipo(t.id)) {
        for (const k of p.secciones ?? []) if (!keys.has(k)) ajenas.push(`${t.id}/${p.id}: ${k}`);
      }
    }
    expect(ajenas).toEqual([]);
  });

  it("toda plantilla lleva la portada y el cierre de su tipo", () => {
    const faltan: string[] = [];
    for (const t of DEL_MOTOR) {
      expect(t.estructurales.length, `${t.id} sin estructurales`).toBe(2);
      const keys = (defsDelTipo(t.id) ?? []).map((d) => d.key);
      expect(keys[0], `${t.id}: la portada abre el catálogo`).toBe(t.estructurales[0]);
      expect(keys[keys.length - 1], `${t.id}: el cierre lo cierra`).toBe(t.estructurales[1]);
      for (const p of plantillasDelTipo(t.id)) {
        const de = p.secciones ?? keys;
        for (const e of t.estructurales) if (!de.includes(e)) faltan.push(`${t.id}/${p.id}: ${e}`);
      }
    }
    expect(faltan).toEqual([]);
  });

  it("una plantilla sin id es la recomendada (o la primera); un id ajeno es null", () => {
    expect(plantillaDelTipo("diagnosis")?.id).toBe("diagnostico-esencial");
    expect(plantillaDelTipo("planning")?.id).toBe("planificacion");
    expect(plantillaDelTipo("adoption-plan")?.id).toBe("adopcion-equipo-comercial");
    expect(plantillaDelTipo("tech-requirements")?.id).toBe("integracion-mapa");
    expect(plantillaDelTipo("planning", "adopcion-tecnica")).toBeNull();
    expect(tipoDeArtefacto("no-existe")).toBeNull();
  });
});

describe("catálogo de secciones por tipo (congelado)", () => {
  it("snapshot de las keys de cada tipo, en orden", () => {
    const porTipo = Object.fromEntries(DEL_MOTOR.map((t) => [t.id, catalogoDelTipo(t.id).map((s) => s.key)]));
    expect(porTipo).toMatchInlineSnapshot(`
      {
        "adoption-plan": [
          "adopcion",
          "comportamientos",
          "reglas",
          "niveles",
          "rutinas_adopcion",
          "plan_despliegue",
          "comunicacion",
          "administradores",
          "altas_bajas",
          "introduccion",
          "estructura_equipo",
          "plan_por_equipo",
          "entrenamientos",
          "pilotos",
          "medicion",
          "cierre",
        ],
        "delivery": [
          "portada",
          "desafio_resuelto",
          "resumen",
          "alcance",
          "logros",
          "cumplimiento",
          "impacto",
          "escala",
          "pendientes",
          "continuidad",
          "recomendaciones",
          "avance_por_frente",
          "logros_del_periodo",
          "riesgos_y_pendientes_del_cliente",
          "cierre",
        ],
        "diagnosis": [
          "diagnostico",
          "situacion_actual",
          "objetivos",
          "problema",
          "desafio",
          "politica_rectora",
          "estado_actual",
          "fortalezas",
          "acciones",
          "herramientas",
          "equipos_licencias",
          "preguntas",
          "gap_analysis",
          "alcance_acordado",
          "cierre",
        ],
        "exploration": [
          "exploracion",
          "ya_sabemos",
          "sin_verificar",
          "sesiones",
          "personas",
          "profundidad",
          "cierre",
        ],
        "implementation": [
          "implementacion",
          "prompts_breeze",
          "a_mano",
          "cierre",
        ],
        "kickoff": [
          "bienvenida",
          "objetivos",
          "como_trabajamos",
          "primer_ciclo",
          "cadencia_del_servicio",
          "hoy_vs_sistema",
          "alcance",
          "equipo",
          "tu_rol",
          "solicitudes",
          "metricas_exito",
          "punto_de_partida",
          "horarios",
          "canales",
          "ruta_academy",
          "cronograma",
          "procesos",
          "proximos_pasos",
          "cierre",
        ],
        "planning": [
          "planificacion",
          "acciones_en_detalle",
          "brief_importado",
          "ficha_proyecto",
          "usuarios_permisos",
          "definicion_procesos",
          "ciclo_vida_crm",
          "canales_entrada",
          "arquitectura_solucion",
          "propiedades",
          "formularios",
          "pipelines",
          "automatizaciones",
          "conversaciones",
          "cotizaciones",
          "informes",
          "campana_objetivo",
          "campana_segmentos",
          "campana_piezas",
          "campana_presupuesto",
          "campana_resultado",
          "agente_objetivo",
          "agente_identidad",
          "agente_conocimiento",
          "agente_derivacion",
          "whatsapp_plantillas",
          "agente_fases",
          "cierre",
        ],
        "roadmap": [
          "hoja_de_ruta",
          "frentes",
          "horizonte",
          "backlog",
          "diferido",
          "decisiones",
          "horas",
          "cierre",
        ],
        "tech-requirements": [
          "requerimiento",
          "alcance_firmado",
          "retos_cliente",
          "arquitectura",
          "identificador_unico",
          "mapa_integracion",
          "relacion_objetos",
          "propiedades",
          "comunicacion",
          "entregables_de_terceros",
          "criterios_exito",
          "guion_pruebas",
          "migracion_datos",
          "cierre",
        ],
      }
    `);
  });

  it("los tipos nuevos prestan las secciones de siempre, no las copian (un renderer, un contrato de datos)", () => {
    // Las escribe el plan de adopción; la planificación vieja las lee con el mismo render.
    expect(ADOPCION_DEF_BY_KEY.rutinas_adopcion.agentGenerated).toBe(true);
    expect(ADOPCION_DEF_BY_KEY.plan_despliegue.agentGenerated).toBe(true);
    expect(PLANIFICACION_DEF_BY_KEY.plan_despliegue.sectionType).toBe(ADOPCION_DEF_BY_KEY.plan_despliegue.sectionType);
    for (const k of ["retos_cliente", "arquitectura", "relacion_objetos", "propiedades", "comunicacion", "criterios_exito", "cierre"]) {
      expect(INTEGRACION_DEF_BY_KEY[k], k).toBe(DESARROLLO_DEF_BY_KEY[k]);
    }
    expect(INTEGRACION_DEF_BY_KEY.estimacion, "la estimación lee el proyecto: una integración técnica no la lleva").toBeUndefined();
  });

  it("el mapa de integración nace con sus cinco columnas sembradas", () => {
    const empty = INTEGRACION_DEF_BY_KEY.mapa_integracion.empty as { columnas: { titulo: string }[]; filas: unknown[] };
    expect(empty.columnas.map((c) => c.titulo)).toEqual([...COLUMNAS_DEL_MAPA_DE_INTEGRACION]);
    expect(empty.columnas).toHaveLength(5);
    expect(empty.filas).toEqual([]);
    expect(INTEGRACION_DEF_BY_KEY.mapa_integracion.sectionType).toBe("tabla");
  });

  it("toda tabla de los tipos nuevos nace con columnas, y su brief se las nombra al agente", () => {
    for (const def of [...Object.values(ADOPCION_DEF_BY_KEY), ...Object.values(INTEGRACION_DEF_BY_KEY)]) {
      if (def.sectionType !== "tabla") continue;
      const cols = (def.empty as { columnas: { titulo: string }[] }).columnas;
      expect(cols.length, def.key).toBeGreaterThanOrEqual(2);
      expect(cols.length, `${def.key}: más de 5 columnas no entra en pantalla ni en el PDF`).toBeLessThanOrEqual(5);
      for (const c of cols) expect(def.brief, `${def.key} no le nombra «${c.titulo}» al agente`).toContain(`«${c.titulo}»`);
    }
  });
});

describe("una copia no lee el proyecto", () => {
  it("el kickoff de una copia no trae el cronograma ni los procesos, y sí la portada y el cierre", () => {
    const keys = seccionesDeUnaCopia("kickoff").map((d) => d.key);
    expect(keys).not.toContain("cronograma");
    expect(keys).not.toContain("procesos");
    expect(keys[0]).toBe("bienvenida");
    expect(keys[keys.length - 1]).toBe("cierre");
  });

  it("ninguna copia trae una sección que lee el proyecto salvo su portada o su cierre", () => {
    for (const t of tiposCreablesEnElProyecto()) {
      for (const p of plantillasDelTipo(t.id)) {
        for (const d of seccionesDeUnaCopia(t.id, p.id)) {
          if (d.ctxDriven) expect(t.estructurales, `${t.id}/${p.id}: ${d.key}`).toContain(d.key);
        }
      }
    }
  });

  it("la estructura de una copia siembra lo mismo que el documento de siempre (y el cierre en los tipos nuevos)", () => {
    const kickoff = canvasDefDeUnaCopia("kickoff");
    expect(kickoff.sections.find((s) => s.key === "cierre")?.defaultData).toBeTruthy();
    const adopcion = canvasDefDeUnaCopia("adoption-plan", "adopcion-tecnica");
    expect(adopcion.sections.map((s) => s.key)).toEqual(["adopcion", "administradores", "altas_bajas", "reglas", "medicion", "cierre"].sort((a, b) =>
      catalogoDelTipo("adoption-plan").findIndex((s) => s.key === a) - catalogoDelTipo("adoption-plan").findIndex((s) => s.key === b),
    ));
    expect(adopcion.sections.find((s) => s.key === "cierre")?.defaultData).toBeTruthy();
    expect(adopcion.sections.find((s) => s.key === "medicion")?.defaultData).toBeUndefined();
  });
});

describe("templates: generar una copia manda lo mismo que el documento de siempre", () => {
  it("la plantilla de siempre de cada entregable es EXACTAMENTE su template de siempre (el mismo objeto)", () => {
    for (const e of ENTREGABLES) {
      // El requerimiento técnico y la entrega tienen plantillas propias para las copias: su documento de siempre va por su botón.
      if (tipoDeArtefacto(e.slug)?.plantillas && e.slug !== "planning") continue;
      for (const p of e.plantillas) {
        expect(templateDelTipo(e.slug, p.id), `${e.slug}/${p.id}`).toBe(TEMPLATE_DE_LA_PLANTILLA[p.id]);
      }
    }
    expect(templateDelTipo("exploration")).toBe(EXPLORACION_TEMPLATE);
  });

  it("los tipos nuevos filtran su template a la plantilla, en el orden del canon", () => {
    const tpl = templateDelTipo("tech-requirements", "integracion-mapa");
    expect(tpl.id).toBe("integracion_v1:integracion-mapa");
    expect(tpl.sections.map((s) => s.key)).toEqual([
      "requerimiento",
      "alcance_firmado",
      "arquitectura",
      "identificador_unico",
      "mapa_integracion",
      "comunicacion",
      "entregables_de_terceros",
      "criterios_exito",
      "cierre",
    ]);
    expect(templateDelTipo("tech-requirements", "integracion-completa").sections.length).toBe(catalogoDelTipo("tech-requirements").length);
  });

  it("una plantilla ajena o un tipo sin template tiran con su motivo", () => {
    expect(() => templateDelTipo("planning", "adopcion-tecnica")).toThrow(/no tiene la plantilla/);
    expect(() => templateDelTipo("timeline")).toThrow();
    expect(() => templateDelTipo("no-existe")).toThrow(/no es un tipo/);
  });

  it("todo tipo que lee el cliente y se copia tiene su allowlist del handoff", () => {
    for (const t of tiposCreablesEnElProyecto()) expect(handoffKeysDelTipo(t.id).length, t.id).toBeGreaterThan(0);
  });
});
