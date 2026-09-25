import { describe, it, expect, test } from "vitest";
import fs from "fs";
import path from "path";
import {
  clasificacionDeTags,
  reglasDeClasificacion,
  fuentesDelDetalle,
  renderDetalleDeCronograma,
  SIN_HANDOFF_CON_MATERIAL,
  FASES_RESUELTAS_CON_MATERIAL,
  FASES_RESUELTAS_POR_INSTRUCCIONES,
  EXCEPCION_DE_LA_FASE_A_REGENERAR,
  EXCEPCION_DE_LAS_FASES_A_REGENERAR,
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
 *
 * ⚠ ACTUALIZADO (revisión adversarial, 2026-09-24), con esta razón: el template pasó de voseo a
 * tuteo («Generá… marcá», «incluí», «marcalas… ubicalas», «Detallá… asigná… proponé… Usá»,
 * «incluila», «Concentrá», «incluilas» → «Genera… marca», «incluye», «márcalas… ubícalas»,
 * «Detalla… asigna… propón… Usa», «inclúyela», «Concentra», «inclúyelas»): el texto para el modelo
 * va en tuteo y el módulo ya mezclaba los dos registros con los bloques nuevos. Qué pide no cambió
 * ni una palabra. La transcripción de abajo se corrigió A MANO, frase por frase, y no se copió del
 * módulo: sigue siendo una segunda escritura independiente, así que la guarda no afirma `x === x`.
 */

/* ── EL TEMPLATE VIEJO, TRANSCRITO DE LA RUTA (pre-migración, 2026-08-08) ───── */
const SIN_HANDOFF =
  '(Sin handoff confirmado. Genera las tareas típicas del tipo de cada fase y marca CADA una con "porValidar": true. Títulos limpios, sin marcadores.)';

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
    ? `- BASE DE DATOS (#6): es una RE-IMPLEMENTACIÓN sobre un HubSpot que el cliente YA usa, SIN migración desde otro CRM. NO incluyas una tarea de "cargar/crear la base de datos"; en su lugar, en la primera fase, incluye una tarea de REVISIÓN DE ESTRUCTURA Y LIMPIEZA de la base existente (propiedades, duplicados, datos sucios).`
    : `- BASE DE DATOS (#6): ${i.isReimpl ? "es una re-implementación pero CON migración desde otro CRM" : "es una implementación desde cero"}, así que SÍ incluye en la primera fase una tarea de CARGAR/ESTRUCTURAR LA BASE DE DATOS (importar y modelar los datos en HubSpot).`;
  const techRule = i.hasTechnical
    ? `\n- DESARROLLO/INTEGRACIÓN (#7): el proyecto lleva desarrollo a medida o Insider One. Las tareas técnicas (integraciones, desarrollo, APIs) márcalas con responsable "DEV" y, si existe una fase de "Desarrollo / Integración", ubícalas SOLO ahí (no las mezcles con las tareas funcionales de otras fases).`
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

Detalla el cronograma siguiendo tus instrucciones: asigna un activityType a cada fase y propón las tareas por semana (weekIndex relativo a la fase, < durationWeeks). Usa los ids EXACTOS del input.`;
  if (i.instruccionesDoc) {
    userMessage += `\n\n=== FASES QUE LAS INSTRUCCIONES DAN POR RESUELTAS ===\nSi las instrucciones del CSE de arriba dicen que una fase concreta ya está terminada, resuelta o que no requirió trabajo, NO le propongas tareas: inclúyela en el JSON con su id EXACTO y "tasks": [] — se deja como está. Vale AUNQUE esa fase venga tarde en el orden del cronograma: el orden es la expectativa inicial del plan, no el orden real en que se hizo el trabajo. Concentra el detalle en las fases donde todavía hay trabajo por delante.`;
  }
  if (i.regeneratePhaseId) {
    userMessage += `\n\n=== ALCANCE: REGENERAR UNA SOLA FASE ===\nDetalla ÚNICAMENTE las tareas de la fase id="${i.regeneratePhaseId}". Para TODAS las demás fases del input, inclúyelas en el JSON con su id EXACTO pero con "tasks": [] — no las toques. Concentra todo el detalle en la fase indicada.`;
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
    /* ⚠ E2c P1 (2026-09-25): `regenerarFaseId` pasó a `regenerarFaseIds` (el recálculo pide varias
       fases en UNA corrida). Con un solo id el texto es el de siempre: el golden sigue byte a byte. */
    regenerarFaseIds: i.regeneratePhaseId ? [i.regeneratePhaseId] : null,
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

describe("#14 · «Regenerar» una fase que el material da por resuelta: igual se detalla", () => {
  /* Revisión adversarial (2026-09-24): con material (o instrucciones) va siempre la válvula de las
     fases resueltas, y en la regeneración de UNA fase se sumaba después «detalla ÚNICAMENTE la fase X».
     Si una reunión daba por cerrada X, el modelo recibía dos órdenes contrarias y devolvía
     `tasks: []`: el CSE pagaba una corrida y veía «Sin tareas». La edición que la pone en rojo: sacar
     la excepción del alcance, o emitirla sin la válvula (ruido sin material). */
  // (E2c P1: `regenerarFaseIds`, con un solo id; el texto esperado no cambia.)
  const conMaterial = (regenerarFaseId: string | null, instrucciones = "") =>
    renderDetalleDeCronograma({
      instrucciones,
      encabezado: { companyName: "C", industry: null, serviceTypeLabel: null, classificationLabel: null },
      fuentes: fuentesDelDetalle({
        timelineCtx: "t",
        handoffCtx: "h",
        desarrolloCtx: "",
        notasCtx: "=== NOTAS DEL CSE PARA EL CRONOGRAMA (pegadas a mano — material INTERNO) ===\nLa capacitación ya se dio.",
      }),
      clasificacion: { esReimplementacion: false, llevaMigracion: false, llevaDesarrollo: false },
      regenerarFaseIds: regenerarFaseId ? [regenerarFaseId] : null,
    });

  it("con material y regenerando una fase, esa fase queda fuera de la válvula", () => {
    const msg = conMaterial("f2");
    expect(msg).toContain(FASES_RESUELTAS_CON_MATERIAL);
    expect(msg.indexOf(EXCEPCION_DE_LA_FASE_A_REGENERAR)).toBeGreaterThan(msg.indexOf("=== ALCANCE: REGENERAR UNA SOLA FASE ==="));
    expect(EXCEPCION_DE_LA_FASE_A_REGENERAR).toContain("detalla sus tareas aunque las instrucciones, una reunión o una nota la den por resuelta");
  });

  it("con solo instrucciones, también; sin regenerar una fase, o sin válvula, no va", () => {
    const soloBrief = renderDetalleDeCronograma({
      instrucciones: "=== INSTRUCCIONES DEL CSE PARA ESTA PIEZA (reglas duras — cúmplelas SIEMPRE) ===\nx\n\n",
      encabezado: { companyName: "C", industry: null, serviceTypeLabel: null, classificationLabel: null },
      fuentes: fuentesDelDetalle({ timelineCtx: "t", handoffCtx: "h", desarrolloCtx: "" }),
      clasificacion: { esReimplementacion: false, llevaMigracion: false, llevaDesarrollo: false },
      regenerarFaseIds: ["f2"],
    });
    expect(soloBrief).toContain(EXCEPCION_DE_LA_FASE_A_REGENERAR);
    expect(conMaterial(null)).not.toContain(EXCEPCION_DE_LA_FASE_A_REGENERAR);
    // El golden «regen de una sola fase» (sin brief ni material) sigue sin la excepción: byte-idéntico.
  });
});

describe("E2c · el recálculo de VARIAS fases desfasadas en una sola corrida", () => {
  /* El recálculo pide todas las fases desfasadas en UNA corrida: el alcance va en plural. Con un solo
     id tiene que ser el texto de siempre, byte a byte (el golden de arriba). La edición que la pone en
     rojo: usar el plural también con un solo id, o emitir la excepción sin material ni instrucciones. */
  const render = (ids: readonly string[] | null, o: { instrucciones?: string; notas?: string } = {}) =>
    renderDetalleDeCronograma({
      instrucciones: o.instrucciones ?? "",
      encabezado: { companyName: "C", industry: null, serviceTypeLabel: null, classificationLabel: null },
      fuentes: fuentesDelDetalle({ timelineCtx: "t", handoffCtx: "h", desarrolloCtx: "", notasCtx: o.notas }),
      clasificacion: { esReimplementacion: false, llevaMigracion: false, llevaDesarrollo: false },
      regenerarFaseIds: ids,
    });
  const PLURAL =
    '\n\n=== ALCANCE: REGENERAR SOLO ALGUNAS FASES ===\nDetalla ÚNICAMENTE las tareas de las fases id="A", id="B". Para TODAS las demás fases del input, inclúyelas en el JSON con su id EXACTO pero con "tasks": [] — no las toques. Concentra todo el detalle en las fases indicadas.';
  const NOTAS = "=== NOTAS DEL CSE PARA EL CRONOGRAMA (pegadas a mano — material INTERNO) ===\nLa capacitación ya se dio.";

  it("⭐ con dos ids va el alcance en plural, con los ids en orden", () => {
    const msg = render(["A", "B"]);
    expect(msg.endsWith(PLURAL), "el alcance en plural no es el de la spec").toBe(true);
    expect(msg).not.toContain("REGENERAR UNA SOLA FASE");
    expect(msg).not.toContain(EXCEPCION_DE_LAS_FASES_A_REGENERAR);
  });

  it("⭐ con un solo id, el texto de siempre (nunca el plural)", () => {
    const uno = render(["A"]);
    expect(uno).not.toContain("REGENERAR SOLO ALGUNAS FASES");
    expect(uno.endsWith('Detalla ÚNICAMENTE las tareas de la fase id="A". Para TODAS las demás fases del input, inclúyelas en el JSON con su id EXACTO pero con "tasks": [] — no las toques. Concentra todo el detalle en la fase indicada.')).toBe(true);
    // Sin ids (null o []) no hay alcance.
    expect(render(null)).not.toContain("=== ALCANCE");
    expect(render([])).toBe(render(null));
  });

  it("la excepción en plural va solo con material o instrucciones, después del alcance", () => {
    for (const o of [{ notas: NOTAS }, { instrucciones: "=== INSTRUCCIONES DEL CSE ===\nx\n\n" }]) {
      const msg = render(["A", "B"], o);
      expect(msg.endsWith(PLURAL + EXCEPCION_DE_LAS_FASES_A_REGENERAR), JSON.stringify(o)).toBe(true);
      expect(msg).not.toContain(EXCEPCION_DE_LA_FASE_A_REGENERAR);
    }
    expect(EXCEPCION_DE_LAS_FASES_A_REGENERAR).toBe(
      " Estas fases las pidió regenerar el CSE: detalla sus tareas aunque las instrucciones, una reunión o una nota las den por resueltas (la regla de las fases resueltas no vale para ellas). Lo que ya se hizo va como tarea, igual que lo que falta.",
    );
  });
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
       igual le re-propuso sus 9 tareas de siempre. `tasks: []` es el "no la toques" que el borrador
       ya sabe leer (R1 de lib/timeline/tareas-del-detalle.ts: sin propuesta NUNCA se descarta nada). */
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

/**
 * ── CON MATERIAL (paso D2 de la validación del 2026-09-23) ─────────────────────
 * Las reuniones elegidas y las notas del CSE contradecían tres textos que el detalle ya traía: el
 * fallback sin handoff (que marcaba «por validar» CADA tarea, también las que salían de lo que el
 * cliente acordó), la válvula de «fase ya resuelta» (que solo miraba el brief) y el calendario (que
 * no le llegaba). Sin material, NADA de esto cambia: el golden de arriba lo sigue afirmando.
 */
describe("⭐ con material, el mensaje no se contradice con las reuniones", () => {
  const REUNIONES = "=== REUNIONES QUE EL CSE ELIGIÓ PARA EL CRONOGRAMA (material INTERNO) ===\nKick-off: se cerró Service.";
  const NOTAS = "=== NOTAS DEL CSE PARA EL CRONOGRAMA (pegadas a mano — material INTERNO) ===\nService está terminado.";
  const CALENDARIO =
    "=== CALENDARIO DEL CRONOGRAMA ACTUAL (solo lectura — para ubicar en el tiempo lo que dicen las reuniones y las notas) ===\n1. Arranque";

  function conMaterial(
    over: Partial<typeof BASE> & { reunionesCtx?: string; notasCtx?: string; calendarioCtx?: string },
  ): string {
    const i = { ...BASE, ...over };
    return renderDetalleDeCronograma({
      instrucciones: i.instruccionesDoc,
      encabezado: {
        companyName: i.companyName,
        industry: i.industry,
        serviceTypeLabel: i.serviceTypeLabel,
        classificationLabel: i.classificationLabel,
      },
      fuentes: fuentesDelDetalle({
        timelineCtx: i.timelineCtx,
        handoffCtx: i.handoffCtx,
        desarrolloCtx: i.desarrolloCtx,
        reunionesCtx: over.reunionesCtx,
        notasCtx: over.notasCtx,
        calendarioCtx: over.calendarioCtx,
      }),
      clasificacion: { esReimplementacion: i.isReimpl, llevaMigracion: i.hasMigration, llevaDesarrollo: i.hasTechnical },
      regenerarFaseIds: i.regeneratePhaseId ? [i.regeneratePhaseId] : null, // E2c P1: un id, el texto de siempre
    });
  }

  it("⭐ sin handoff y con material: solo las típicas van «por validar», no CADA una", () => {
    /* La edición que la pone en rojo: volver al fallback de siempre también con material. */
    const msg = conMaterial({ handoffCtx: "", reunionesCtx: REUNIONES });
    expect(msg).toContain(SIN_HANDOFF_CON_MATERIAL);
    // (2026-09-24: el fallback de siempre pasó a tuteo, «marca CADA una»; la guarda pide lo mismo.)
    expect(msg, "con reuniones enfrente, seguía pidiendo marcar TODO por validar").not.toContain("marca CADA una");
    expect(msg, "la marca de las típicas tiene que seguir existiendo").toContain('"porValidar": true');
    // Sin material rige el fallback de siempre (y el golden «sin handoff» lo fija byte a byte).
    expect(conMaterial({ handoffCtx: "" })).toContain("marca CADA una");
    // Con handoff confirmado, ninguna variante del fallback aparece.
    expect(conMaterial({ reunionesCtx: REUNIONES })).not.toContain("Sin handoff confirmado");
  });

  it("⭐ la válvula de «fase resuelta» también se abre con una reunión o una nota, sin brief", () => {
    /* La edición que la pone en rojo: que la condición vuelva a ser solo `if (i.instrucciones)`. */
    const msg = conMaterial({ instruccionesDoc: "", notasCtx: NOTAS });
    expect(msg).toContain("una reunión elegida o una nota");
    expect(msg).toContain('"tasks": []');
    expect(msg.endsWith(FASES_RESUELTAS_CON_MATERIAL), "la válvula tiene que ir al final, como la de siempre").toBe(true);
  });

  it("con brief Y material va UNA sola válvula (la que nombra las tres fuentes)", () => {
    const msg = conMaterial({ instruccionesDoc: "Service ya está terminado.\n\n", reunionesCtx: REUNIONES });
    expect(msg).toContain(FASES_RESUELTAS_CON_MATERIAL);
    expect(msg).not.toContain(FASES_RESUELTAS_POR_INSTRUCCIONES);
  });

  it("con brief y SIN material, la válvula es byte a byte la de siempre", () => {
    const msg = conMaterial({ instruccionesDoc: "Service ya está terminado.\n\n" });
    expect(msg.endsWith(FASES_RESUELTAS_POR_INSTRUCCIONES)).toBe(true);
    expect(msg).toBe(nuevoTemplate({ ...BASE, instruccionesDoc: "Service ya está terminado.\n\n" }));
  });

  it("⭐ el calendario entra SOLO con material, y antes de las reuniones", () => {
    /* Sin reuniones ni notas no hay nada que ubicar: un calendario suelto le cambiaría el mensaje
       a todo proyecto sin material. La edición que la pone en rojo: agregarlo con solo tener texto. */
    expect(conMaterial({ calendarioCtx: CALENDARIO }), "el calendario entró sin material").toBe(nuevoTemplate(BASE));
    const msg = conMaterial({ calendarioCtx: CALENDARIO, reunionesCtx: REUNIONES, notasCtx: NOTAS });
    const cal = msg.indexOf("=== CALENDARIO DEL CRONOGRAMA ACTUAL");
    const reu = msg.indexOf("=== REUNIONES QUE EL CSE ELIGIÓ");
    const not = msg.indexOf("=== NOTAS DEL CSE");
    expect(cal, "con material, el calendario no llegó").toBeGreaterThan(-1);
    expect(cal, "las reuniones citan semanas del calendario: tiene que ir antes").toBeLessThan(reu);
    expect(reu).toBeLessThan(not);
    expect(
      fuentesDelDetalle({ timelineCtx: "t", handoffCtx: "h", desarrolloCtx: "", notasCtx: NOTAS, calendarioCtx: CALENDARIO }).map(
        (f) => f.key,
      ),
    ).toContain("calendario-del-cronograma");
  });
});

/**
 * ── LA RUTA: lo que el detalle NO recibe y lo que la corrida registra ───────────────────────────
 */
describe("⛔ analyze: PRIORIDAD DEL CANVAS, trazabilidad y frontera del detalle", () => {
  const ruta = fs.readFileSync(path.join(process.cwd(), "app/api/clients/[id]/analyze/route.ts"), "utf8");
  const codigo = ruta.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

  it("⭐ PRIORIDAD DEL CANVAS no va al detalle (su mensaje no trae ningún «CANVAS DEL PROYECTO»)", () => {
    /* Colgada, la orden «prioriza SIEMPRE el canvas» le restaba peso a las reuniones elegidas, que
       son lo único del proyecto que el detalle sí lee. La edición que la pone en rojo: sacar la
       condición. */
    const i = codigo.indexOf("PRIORIDAD DEL CANVAS");
    expect(i, "se movió el ancla: revisa esta guarda").toBeGreaterThan(0);
    expect(codigo.slice(Math.max(0, i - 300), i)).toContain("if (!isTimelineDetailAgent)");
  });

  it("⭐ la corrida del detalle registra las reuniones que leyó — y el anclaje del handoff no las usa", () => {
    const traza =
      codigo.match(/sourceSessionIds: isTimelineDetailAgent \? sesionesDelDetalle : handoffSourceSessionIds,/g) ?? [];
    expect(traza.length, "las dos escrituras de la corrida (async y síncrona) tienen que registrarlas").toBe(2);
    /* El 12a estampa handoffOverride sobre las sesiones del HANDOFF. Si mirara las del detalle, cada
       «Regenerar» anclaría al handoff las reuniones que el CSE eligió para el cronograma. */
    expect(codigo).toContain("if (isHandoffAgent && bodyProjectId && handoffSourceSessionIds.length > 0)");
    const rama = codigo.slice(codigo.indexOf("if (isTimelineDetailAgent && bodyProjectId) {"));
    const tramo = rama.slice(0, rama.indexOf("\n  }"));
    expect(tramo, "la rama dejó de guardar qué reuniones leyó").toContain("sesionesDelDetalle = contexto.sesionesUsadas");
    expect(tramo, "la rama dejó de armar las huellas del material").toContain(
      "huellasDelDetalle = huellasDeFrontera(contexto.materialInterno",
    );
  });

  it("⭐ las tareas del agente se marcan con sus fugas ANTES de sumar las fijas de la Semana 0", () => {
    /* ⚠ REAPUNTADA en E2b P5a (2026-09-25), con esta razón: miraba las DOS vistas previas de analyze
       (`computeTimelineDetailPreview` y `…AllPhases`), que se borraron. Desde E2a lo que armó el agente
       entra al borrador por lib/timeline/tareas-del-detalle.ts: `tareasPropuestasDelDetalle` marca las
       fugas de las tareas del agente, y las fijas de la Semana 0 se suman después, en R7, sin marca
       (son texto nuestro, no del modelo). La edición que la pone en rojo: dejar de marcar las fugas,
       dejar de recibir las huellas, marcar las fijas, o que analyze deje de pasarle las huellas. */
    const detalle = fs
      .readFileSync(path.join(process.cwd(), "lib/timeline/tareas-del-detalle.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, " ");
    const iPropuestas = detalle.indexOf("export function tareasPropuestasDelDetalle(");
    expect(iPropuestas, "no encontré tareasPropuestasDelDetalle").toBeGreaterThan(0);
    // Hasta el cierre del CUERPO: la firma también empieza una línea con `}` (`}): {…`).
    const propuestas = detalle.slice(iPropuestas, detalle.indexOf("\n}\n", iPropuestas));
    expect(propuestas.length, "la guarda no está mirando el cuerpo").toBeGreaterThan(800);
    expect(propuestas, "dejó de recibir las huellas").toContain("huellas: HuellasDeFrontera | null;");
    expect(propuestas, "las tareas del agente dejaron de marcar sus fugas").toMatch(
      /const delAgente: ComputedDetailTask\[\] = marcarFugas\(\s*computeDetailTasksForPhase\(/,
    );
    expect(propuestas, "las fijas no se marcan: se suman después").not.toContain("tareasFijasDeSemanaCero(");
    const iCambios = detalle.indexOf("export function cambiosDeTareasDelDetalle(");
    expect(iCambios, "no encontré cambiosDeTareasDelDetalle").toBeGreaterThan(iPropuestas);
    const cambios = detalle.slice(iCambios, detalle.indexOf("\n}\n", iCambios));
    const iFijas = cambios.indexOf("for (const t of tareasFijasDeSemanaCero(i.tags, base)) {");
    expect(iFijas, "R7 dejó de sumar las fijas").toBeGreaterThan(-1);
    expect(cambios.slice(iFijas, cambios.indexOf("});", iFijas)), "una fija salió marcada como fuga").toContain("fuga: null,");
    expect(cambios, "las fijas dejaron de ir después de las del agente").toContain(
      "const nuevas: Array<ContenidoDeTareaNueva | null> = [...delAgente.map(contenidoDelAgente), ...fijas];",
    );
    // Y analyze le pasa las huellas del material que leyó el agente a la fusión.
    const iFusion = codigo.indexOf("fusionarDetalleEnElBorrador({");
    expect(iFusion, "analyze ya no fusiona el detalle").toBeGreaterThan(-1);
    expect(codigo.slice(iFusion, codigo.indexOf("});", iFusion))).toContain("huellas: huellasDelDetalle,");
    expect(codigo, "volvió una vista previa del detalle").not.toMatch(/computeTimelineDetailPreview|fijasDeSemanaCeroParaPreview/);
  });
});
