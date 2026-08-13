import { describe, it, expect, test } from "vitest";
import fs from "fs";
import path from "path";
import {
  clasificacionDeTags,
  reglasDeClasificacion,
  fuentesDelDetalle,
  renderDetalleDeCronograma,
  type ClasificacionDelDetalle,
  type EncabezadoDelDetalle,
} from "./detalle-cronograma";
import { PIEZAS_CON_CONTEXTO_NOMBRADO, renderFuentes } from "./tipos";

/**
 * lib/contexto/detalle-cronograma.test.ts — EL GOLDEN DE LA MIGRACIÓN + EL TRINQUETE.
 *
 * La regla de la migración al contexto nombrado es UNA: byte-idéntico. `viejoTemplate` de
 * abajo es el armado inline que vivía en analyze/route.ts (transcrito ANTES de borrarlo de
 * la ruta, no reconstruido desde el módulo — si se copiara del módulo, el golden afirmaría
 * `x === x` y una regresión del template pasaría en verde). Cinco casos cruzan las cuatro
 * variables reales: con/sin desarrollo, con/sin handoff, con/sin brief, con/sin regen.
 */

/* ── EL TEMPLATE VIEJO, TRANSCRITO DE LA RUTA (pre-migración, 2026-08-08) ───── */
const SIN_HANDOFF =
  '(Sin handoff confirmado. Generá las tareas típicas del tipo de cada fase y marcá CADA una con "porValidar": true. Títulos limpios, sin marcadores.)';

function viejoTemplate(i: {
  instruccionesDoc: string;
  companyName: string;
  industry: string | null;
  serviceTypeLabel: string | null;
  classificationLabel: string | null;
  timelineCtx: string;
  handoffCtx: string;
  desarrolloCtx: string;
  isReimpl: boolean;
  hasMigration: boolean;
  hasTechnical: boolean;
  regeneratePhaseId?: string | null;
}): string {
  const dbTaskRule = i.isReimpl && !i.hasMigration
    ? `- BASE DE DATOS (#6): es una RE-IMPLEMENTACIÓN sobre un HubSpot que el cliente YA usa, SIN migración desde otro CRM. NO incluyas una tarea de "cargar/crear la base de datos"; en su lugar, en la primera fase, incluí una tarea de REVISIÓN DE ESTRUCTURA Y LIMPIEZA de la base existente (propiedades, duplicados, datos sucios).`
    : `- BASE DE DATOS (#6): ${i.isReimpl ? "es una re-implementación pero CON migración desde otro CRM" : "es una implementación desde cero"}, así que SÍ incluí en la primera fase una tarea de CARGAR/ESTRUCTURAR LA BASE DE DATOS (importar y modelar los datos en HubSpot).`;
  const techRule = i.hasTechnical
    ? `\n- DESARROLLO/INTEGRACIÓN (#7): el proyecto lleva desarrollo a medida o Insider One. Las tareas técnicas (integraciones, desarrollo, APIs) marcalas con responsable "DEV" y, si existe una fase de "Desarrollo / Integración", ubicalas SOLO ahí (no las mezcles con las tareas funcionales de otras fases).`
    : "";
  let userMessage = `${i.instruccionesDoc}Empresa: ${i.companyName}
Industria: ${i.industry ?? "No especificada"}
${i.serviceTypeLabel ? `Tipo de servicio contratado: ${i.serviceTypeLabel}\n` : ""}${i.classificationLabel ? `Clasificación del proyecto: ${i.classificationLabel}\n` : ""}
=== CRONOGRAMA A DETALLAR (fases EXISTENTES — no cambies nombres, duraciones ni orden) ===
${i.timelineCtx}

=== HANDOFF CURADO (bloques confirmados por el CSE) ===
${i.handoffCtx || SIN_HANDOFF}
${i.desarrolloCtx ? `\n=== REQUERIMIENTO TÉCNICO (canvas Desarrollo — objetos, llaves y conexiones) ===\n${i.desarrolloCtx}\n` : ""}
=== REGLAS SEGÚN LA CLASIFICACIÓN ===
${dbTaskRule}${techRule}

Detallá el cronograma siguiendo tus instrucciones: asigná un activityType a cada fase y proponé las tareas por semana (weekIndex relativo a la fase, < durationWeeks). Usá los ids EXACTOS del input.`;
  if (i.instruccionesDoc) {
    userMessage += `\n\n=== FASES QUE LAS INSTRUCCIONES DAN POR RESUELTAS ===\nSi las instrucciones del CSE de arriba dicen que una fase concreta ya está terminada, resuelta o que no requirió trabajo, NO le propongas tareas: incluila en el JSON con su id EXACTO y "tasks": [] — se deja como está. Vale AUNQUE esa fase venga tarde en el orden del cronograma: el orden es la expectativa inicial del plan, no el orden real en que se hizo el trabajo. Concentrá el detalle en las fases donde todavía hay trabajo por delante.`;
  }
  if (i.regeneratePhaseId) {
    userMessage += `\n\n=== ALCANCE: REGENERAR UNA SOLA FASE ===\nDetallá ÚNICAMENTE las tareas de la fase id="${i.regeneratePhaseId}". Para TODAS las demás fases del input, incluilas en el JSON con su id EXACTO pero con "tasks": [] — no las toques. Concentrá todo el detalle en la fase indicada.`;
  }
  return userMessage;
}

/* El puente: los mismos insumos, por el camino NUEVO (fuentes nombradas + render). */
function nuevoTemplate(i: Parameters<typeof viejoTemplate>[0]): string {
  return renderDetalleDeCronograma({
    instrucciones: i.instruccionesDoc,
    encabezado: {
      companyName: i.companyName,
      industry: i.industry,
      serviceTypeLabel: i.serviceTypeLabel,
      classificationLabel: i.classificationLabel,
    } satisfies EncabezadoDelDetalle,
    fuentes: fuentesDelDetalle({
      timelineCtx: i.timelineCtx,
      handoffCtx: i.handoffCtx,
      desarrolloCtx: i.desarrolloCtx,
    }),
    clasificacion: {
      esReimplementacion: i.isReimpl,
      llevaMigracion: i.hasMigration,
      llevaDesarrollo: i.hasTechnical,
    } satisfies ClasificacionDelDetalle,
    regenerarFaseId: i.regeneratePhaseId ?? null,
  });
}

const BASE = {
  instruccionesDoc: "",
  companyName: "Wherex",
  industry: "Procurement" as string | null,
  serviceTypeLabel: "Implementación CRM" as string | null,
  classificationLabel: "Implementación · Migración" as string | null,
  timelineCtx: "Fase 1 (id=f1, 2 semanas): Arranque\nFase 2 (id=f2, 3 semanas): Build",
  handoffCtx: "=== ALCANCE CONTRATADO ===\nMigrar Salesforce a HubSpot.",
  desarrolloCtx: "Objetos: Deal, Empresa. Llave: rut.",
  isReimpl: false,
  hasMigration: true,
  hasTechnical: true,
  regeneratePhaseId: null as string | null,
};

describe("GOLDEN: el render del contexto nombrado es byte-idéntico al armado inline viejo", () => {
  const casos: Array<[string, Partial<typeof BASE>]> = [
    ["todo presente", {}],
    ["sin canvas Desarrollo (la fuente vacía no deja rastro)", { desarrolloCtx: "", hasTechnical: false }],
    ["sin handoff confirmado (cae el fallback de porValidar)", { handoffCtx: "" }],
    ["con brief del CSE + industria null + sin líneas opcionales", {
      instruccionesDoc: "=== INSTRUCCIONES DEL CSE PARA ESTA PIEZA (reglas duras) ===\nQA al final.\n\n",
      industry: null,
      serviceTypeLabel: null,
      classificationLabel: null,
    }],
    ["regen de una sola fase + re-implementación sin migración", {
      regeneratePhaseId: "f2",
      isReimpl: true,
      hasMigration: false,
    }],
  ];
  for (const [nombre, over] of casos) {
    it(nombre, () => {
      const insumos = { ...BASE, ...over };
      expect(nuevoTemplate(insumos)).toBe(viejoTemplate(insumos));
    });
  }
});

describe("las piezas puras", () => {
  /* 2026-08-12: los TRES hechos salen ahora de la MISMA lista de tags. Antes el primero venía de
     un segundo parámetro (la columna `implementationType`) y los otros dos de los tags. */
  it("clasificacionDeTags: la tabla", () => {
    expect(clasificacionDeTags(["crm_migration", "reimplementacion"])).toEqual({
      esReimplementacion: true,
      llevaMigracion: true,
      llevaDesarrollo: false,
    });
    expect(clasificacionDeTags(["custom_dev"]).llevaDesarrollo).toBe(true);
    expect(clasificacionDeTags(["insider_one", "implementacion"]).llevaDesarrollo).toBe(true);
    expect(clasificacionDeTags([])).toEqual({
      esReimplementacion: false,
      llevaMigracion: false,
      llevaDesarrollo: false,
    });
    // SIN el tag del eje ⇒ se comporta igual que el enum en null: "desde cero".
    expect(clasificacionDeTags(["crm_migration"]).esReimplementacion).toBe(false);
    // El valor VIEJO del enum entra por `TAG_ALIASES` — una fila sin migrar sigue leyéndose bien.
    expect(clasificacionDeTags(["REIMPLEMENTATION"]).esReimplementacion).toBe(true);
    // El eje es EXCLUYENTE: con los dos puestos gana el primero (lo curado, no lo del agente).
    expect(clasificacionDeTags(["implementacion", "reimplementacion"]).esReimplementacion).toBe(false);
    expect(clasificacionDeTags(["reimplementacion", "implementacion"]).esReimplementacion).toBe(true);
  });

  it("reglasDeClasificacion: re-implementación SIN migración ⇒ revisar, no cargar", () => {
    const limpiar = reglasDeClasificacion({ esReimplementacion: true, llevaMigracion: false, llevaDesarrollo: false });
    expect(limpiar).toContain("REVISIÓN DE ESTRUCTURA Y LIMPIEZA");
    expect(limpiar).not.toContain("CARGAR/ESTRUCTURAR");
    const cargar = reglasDeClasificacion({ esReimplementacion: false, llevaMigracion: false, llevaDesarrollo: true });
    expect(cargar).toContain("CARGAR/ESTRUCTURAR LA BASE DE DATOS");
    expect(cargar).toContain("DESARROLLO/INTEGRACIÓN (#7)");
  });

  it("toda fuente no vacía lleva su rótulo ADENTRO del texto (la lección del deal del vecino)", () => {
    const fuentes = fuentesDelDetalle({ timelineCtx: "x", handoffCtx: "y", desarrolloCtx: "z" });
    for (const f of fuentes) {
      expect(f.texto.startsWith("=== "), `la fuente ${f.key} perdió su rótulo`).toBe(true);
      expect(f.ambito).toBe("proyecto");
    }
    // Y la vacía es "" de verdad (renderFuentes la saltea sin separador huérfano).
    const sinDev = fuentesDelDetalle({ timelineCtx: "x", handoffCtx: "y", desarrolloCtx: "" });
    expect(sinDev.find((f) => f.key === "requerimiento-tecnico")?.texto).toBe("");
    expect(renderFuentes(sinDev).endsWith("\n\n")).toBe(false);
  });

  it("las instrucciones del CSE van PRIMERO en el mensaje (regla dura antes que el material)", () => {
    const msg = nuevoTemplate({ ...BASE, instruccionesDoc: "REGLA-DURA-DEL-CSE\n\n" });
    expect(msg.startsWith("REGLA-DURA-DEL-CSE")).toBe(true);
  });

  it("con brief: se le pide dejar en paz las fases que las instrucciones dan por resueltas", () => {
    /* El caso Wherex: las instrucciones decían "Service prácticamente finalizado" y el agente
       igual le re-propuso sus 9 tareas de siempre. `tasks: []` es el "no la toques" que el modal
       ya sabe leer (lib/timeline/regen-columnas: sin propuesta NUNCA se descarta nada). */
    const conBrief = nuevoTemplate({ ...BASE, instruccionesDoc: "Service ya está terminado.\n\n" });
    expect(conBrief).toContain("=== FASES QUE LAS INSTRUCCIONES DAN POR RESUELTAS ===");
    expect(conBrief).toContain('"tasks": []');
    expect(conBrief, "el orden del plan no puede vetar una instrucción explícita").toContain(
      "AUNQUE esa fase venga tarde en el orden del cronograma",
    );
  });

  it("sin brief: el bloque de fases resueltas NO aparece (sería ruido)", () => {
    expect(nuevoTemplate({ ...BASE, instruccionesDoc: "" })).not.toContain("DAN POR RESUELTAS");
  });
});

/**
 * ── EL TRINQUETE ─────────────────────────────────────────────────────────────
 * Una pieza registrada en PIEZAS_CON_CONTEXTO_NOMBRADO no puede volver a armar sus fuentes
 * a mano en la ruta. La muerte silenciosa: alguien "arregla el prompt rápido" re-inlineando
 * el template en analyze, el módulo queda huérfano, y el próximo consumidor nombra fuentes
 * que ya no son las que corren. La edición que pone esto en rojo: re-pegar el literal
 * `=== CRONOGRAMA A DETALLAR` dentro de la ruta, o borrar la llamada al cargador.
 */
describe("trinquete: el detalle del cronograma consume el contexto NOMBRADO", () => {
  const ruta = fs.readFileSync(
    path.join(process.cwd(), "app/api/clients/[id]/analyze/route.ts"),
    "utf8",
  );

  it("la pieza está registrada y el registro solo crece", () => {
    expect(PIEZAS_CON_CONTEXTO_NOMBRADO).toContain("timeline");
  });

  it("la rama del detalle carga y renderiza por el módulo — no arma fuentes a mano", () => {
    const rama = ruta.slice(ruta.indexOf("if (isTimelineDetailAgent && bodyProjectId) {"));
    const tramo = rama.slice(0, rama.indexOf("\n  }"));
    expect(tramo.length, "no encontré la rama del detalle; revisar esta guarda").toBeGreaterThan(200);
    expect(tramo, "la rama dejó de usar el cargador nombrado").toContain("cargarContextoDelDetalle(");
    expect(tramo, "la rama dejó de renderizar por el módulo").toContain("renderDetalleDeCronograma(");
    expect(tramo, "las instrucciones del CSE dejaron de fluir del contexto").toContain(
      "instrucciones: contexto.instrucciones",
    );
    /* ⚠ Ciclo 2: sin fijar el binding de las FUENTES, re-armarlas a mano en la ruta
       (fuentesDelDetalle con un loadHandoffContext SIN onlyConfirmed, por ejemplo) pasaba en
       verde — el mutante exacto que el docstring de este trinquete narra.
       ⚠ Ciclo 3: CON la coma de cierre — el pin sin coma era matcheo por prefijo y
       `contexto.fuentes.filter(...)` (una fuente suprimida en la ruta) pasaba verde. */
    expect(tramo, "las fuentes dejaron de venir del cargador TAL CUAL — alguien las re-armó o decoró en la ruta").toContain(
      "fuentes: contexto.fuentes,",
    );
  });

  it("el template tiene UN dueño: el rótulo del cronograma no puede volver a la ruta", () => {
    expect(
      ruta.includes("=== CRONOGRAMA A DETALLAR"),
      "el template del detalle volvió a armarse inline en analyze — el módulo quedó huérfano",
    ).toBe(false);
  });

  it("el cargador es quien lee el brief __doc (la ruta ya no lo toca)", () => {
    expect(ruta.includes("docBriefFrom(")).toBe(false);
    const cargador = fs.readFileSync(path.join(process.cwd(), "lib/contexto/cargar.ts"), "utf8");
    expect(cargador).toContain("docBriefFrom(");
    expect(cargador).toContain("onlyConfirmed: true");
    expect(cargador).toContain("includeIds: true");
  });
});

test("el fallback sin handoff sigue pidiendo porValidar (congelado: lo usa la UI de tareas)", () => {
  const msg = nuevoTemplate({ ...BASE, handoffCtx: "" });
  expect(msg).toContain('"porValidar": true');
});
