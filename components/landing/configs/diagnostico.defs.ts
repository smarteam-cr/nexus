/**
 * components/landing/configs/diagnostico.defs.ts
 *
 * Defs SERVER-SAFE del canvas "Diagnóstico" — el INFORME PARA EL CLIENTE que explica sus
 * resultados actuales: cómo opera hoy por hub, dónde está en la escala de rendimiento,
 * qué factores explican ese nivel, qué lo separa del siguiente, y qué hacemos. Corre
 * sobre el mismo motor `LandingView` que el Kickoff.
 *
 * ES DE CARA AL CLIENTE (paleta de marca, voz de marca): se presenta en la sesión de
 * diagnóstico y se puede exportar a PDF. La publicación con link propio llega en su
 * propia tanda — hasta entonces no existe `/external/diagnostico` a propósito.
 *
 * ── LA DECISIÓN DE LAS KEYS (leer antes de tocar) ─────────────────────────────
 * Este canvas EXISTÍA con 8 secciones legacy en prosa markdown. Para que el contenido ya
 * escrito (Teamnet) siga visible, las keys nuevas REUSAN las legacy donde la semántica
 * coincide (`contexto_alcance`, `estado_actual`, `causa_raiz`, `gap_analysis`,
 * `recomendaciones` — el markdown viejo se rinde vía `__legacyMd`). Tres legacy quedan
 * como defs SOLO-LECTURA (`agentGenerated: false` y el agente nuevo no las escribe):
 *   · `estado_deseado` — absorbida por el "cómo vas a operar" de estado_actual,
 *   · `impacto_gap`   — absorbida por el panel de consecuencias de gap_analysis,
 *   · `proximos_pasos`— reemplazada por recomendaciones + cierre.
 * Con contenido viejo se ven; vacías son blank y el modo lectura las omite solo.
 *
 * LA ESCALA: la única vara es la Escala de Rendimiento 5.2 (Deficiente · Inicial · Funcional ·
 * Eficiente · Óptimo, en dos capas por área), cuyo reglamento vive en la base de conocimiento.
 * Desde el 2026-09-12 la sección `escala` ubica cada área por capa y con evidencia
 * (`escala_posicion`, la misma forma que leen la Propuesta, el Kickoff y la Entrega), y un trato
 * marcado «Sin Escala» no la genera. Ver `lib/escala/`.
 */
import type { BCSectionDef } from "./business-case.defs";
import type { BcTemplateDef } from "./templates.defs";
import {
  PAIN_SCHEMA,
  PAIN_EMPTY,
  WEB_DIAGNOSIS_SCHEMA,
  WEB_DIAGNOSIS_SCHEMA_DEL_CHAT,
  WEB_DIAGNOSIS_EMPTY,
  ESCALA_POSICION_SCHEMA,
  ESCALA_POSICION_EMPTY,
  PROCESS_MAPPING_SCHEMA,
  PROCESS_MAPPING_EMPTY,
  PROSA_SCHEMA,
  PROSA_EMPTY,
  PROSA_SCHEMA_DEL_CHAT,
} from "./shared-sections.defs";
import { DIAGNOSTICO_CIERRE_DEFAULT } from "@/lib/canvas/canvas-defs";
import { heroTitleBrief } from "@/lib/landing/hero-title";

const str = { type: "string" } as const;
const strArray = { type: "array", items: { type: "string" } } as const;
const asSchema = (s: unknown) => s as unknown as Record<string, unknown>;

/* ⭐ Las CINCO copias de este esquema se consolidaron en `shared-sections.defs.ts` el
   2026-08-23. El trinquete «un renderer, un contrato de datos» probó que eran idénticas; una sola
   constante hace que no puedan volver a divergir. `schemaDelChat` le suma `subhead`, que el chat
   escribe y el agente no: ver `PROSA_SCHEMA_DEL_CHAT`. */
const proseSchema = PROSA_SCHEMA;
const proseEmpty = PROSA_EMPTY;

const obj = (properties: Record<string, unknown>, required?: string[]) =>
  ({ type: "object", properties, ...(required ? { required } : {}) }) as const;
const arrayOf = (properties: Record<string, unknown>, required?: string[]) => ({ type: "array", items: obj(properties, required) });

/* ── El HILO (2026-09-28) ─────────────────────────────────────────────────────────────────────
   Estructura aprobada por Elías sobre el diagnóstico de referencia de FUNDAUNA: todo encadenado con
   CÓDIGOS — síntomas S1…, causas F1…, objetivos OBJ-01… —, sin la Escala (llega la 7.0), sin
   «cómo vas a operar» (es enfoque: Planificación) y sin recomendaciones (son acciones: Ejecución).
   Las secciones que salieron (`escala`, `causa_raiz`, `recomendaciones` y las tres legacy) quedan
   al final como SOLO-LECTURA: un diagnóstico viejo se sigue viendo igual hasta que se regenera, y
   al regenerarlo el runner las retira (lib/canvas/diagnostico-generate.ts). */
export const SECCIONES_RETIRADAS_DEL_DIAGNOSTICO = [
  "estado_deseado",
  "escala",
  "causa_raiz",
  "impacto_gap",
  "recomendaciones",
  "proximos_pasos",
] as const;

export const DIAGNOSTICO_SECTION_DEFS: BCSectionDef[] = [
  {
    key: "diagnostico",
    label: "Diagnóstico",
    eyebrow: "Diagnóstico",
    theme: "dark",
    backdrop: true,
    selfTitled: true,
    pinned: true,
    noHide: true,
    sectionType: "hero",
    /* Se rotula con su titular, que en pantalla es lo correcto y para conversar es pésimo:
       el chip decía «kickoff Wherex». Ver `nombreParaElChat`. */
    chatLabel: "Portada",
    agentGenerated: true,
    empty: { titulo: "", headline: "", subhead: "", tags: [] },
    agentHint: "Portada: la tesis del diagnóstico en una frase + el desafío en una frase + los hubs.",
    brief:
      heroTitleBrief("Diagnóstico") +
      "Portada del informe. `headline`: la TESIS del diagnóstico en una línea, dicha al cliente, que junte lo que invierte y lo que pierde ('FUNDAUNA invierte en captar y en atender, pero hoy pierde la pista de cada lead después del primer contacto'). No pongas 'Diagnóstico de X': el título ya lo dice. " +
      "`subhead`: 2 frases — la primera con el dato que lo muestra (volumen, canales, lo que no deja registro); la segunda empieza con 'El desafío en una frase:' y lo nombra. " +
      "`tags`: los hubs/áreas diagnosticadas ('Marketing Hub', 'Sales Hub', 'Service Hub').",
    schema: { type: "object", properties: { titulo: str, headline: str, subhead: str, tags: strArray }, required: ["headline"] },
    /* ⭐ `eyebrow` SOLO acá y no en el esquema del agente: es el rótulo chico de arriba, lo
       cura una persona y `preserveNonSchemaKeys` lo acarrea entre regeneraciones. Hasta el
       2026-08-23 esta portada no tenía NINGUNA forma de cambiarlo: es `selfTitled`, así que
       `seccion.rotular` se rechaza —escribiría en una columna que nadie lee— y el renderer lo
       pintaba como texto pelado. Las dos puertas cerradas a la vez. */
    schemaDelChat: { type: "object", properties: { titulo: str, headline: str, subhead: str, tags: strArray, eyebrow: str } },
  },
  {
    key: "contexto_alcance",
    label: "Qué miramos y con qué fuentes",
    eyebrow: "Contexto y alcance",
    theme: "light",
    sectionType: "kickoff_prose",
    agentGenerated: true,
    empty: proseEmpty,
    agentHint: "Qué se diagnosticó y con qué fuentes. 3-5 items.",
    brief:
      "El encuadre, para que el informe sea auditable. `intro`: 1 frase con qué se diagnosticó. `items` (3-5): cada fuente usada — `title` = la fuente dicha al cliente ('Las sesiones que tuvimos', 'Sus respuestas a la encuesta', 'Sus procesos mapeados', 'Lo que conversamos al vender el proyecto'); `detail` = UNA línea con qué aportó y, si aplica, cuántas y de cuándo ('4 sesiones entre el 2 y el 16 de septiembre'). Solo fuentes que de verdad se usaron.",
    schema: asSchema(proseSchema),
    schemaDelChat: asSchema(PROSA_SCHEMA_DEL_CHAT),
  },
  {
    key: "situacion_actual",
    label: "Situación actual",
    eyebrow: "El punto de partida",
    theme: "light",
    sectionType: "kickoff_prose",
    agentGenerated: true,
    empty: proseEmpty,
    agentHint: "Quién es el cliente hoy: a quién atiende, sus frentes y el punto de partida del proyecto. 3-5 tarjetas.",
    brief:
      "La foto del cliente antes de hablar de problemas. `intro`: 1-2 frases con qué es la organización y qué atiende hoy. `items` (3-5 tarjetas): `title` = un frente o un hecho del contexto ('A quién atiende', 'Captación y matrícula', 'Mesa de ayuda', 'Punto de partida del proyecto'); `detail` = 1-2 frases concretas, con cifras si las fuentes las traen. La última tarjeta es siempre el punto de partida: qué contrató, cuánto dura y qué entrega. Sin juicios: los problemas van en la sección siguiente.",
    schema: asSchema(proseSchema),
    schemaDelChat: asSchema(PROSA_SCHEMA_DEL_CHAT),
  },
  {
    key: "objetivos",
    label: "Objetivos",
    eyebrow: "Lo que queremos lograr",
    theme: "soft",
    sectionType: "diagnostico_objetivos",
    avisoDelChat:
      "los códigos (S1, F1, OBJ-01) unen secciones: si borras o renumeras uno, actualiza también donde se cita " +
      "(«explica» de las causas, «por» de las consecuencias y los objetivos de Preguntas); códigos nuevos, correlativos.",
    agentGenerated: true,
    empty: { intro: "", objetivos: [] },
    agentHint: "OBJ-01…: cuantitativos y cualitativos, cada uno con cómo se mide y su meta (o «meta por validar»).",
    brief:
      "Lo que el cliente quiere lograr, con código. Parten de los RESULTADOS QUE PERSIGUE (el handoff y la ficha del cliente) y de sus respuestas a la encuesta. `objetivos` (5-9): primero TODOS los cuantitativos y después los cualitativos; `id` = 'OBJ-01', 'OBJ-02'… correlativos en ese orden (Nexus igual los renumera así al guardar); `tipo` = 'cuantitativo' (se mide con un número) o 'cualitativo' (cambia cómo se trabaja); `titulo` = el objetivo en una frase ('Conocer la tasa de conversión de lead a matrícula por proyecto'); `medida` = cómo se mide y la meta ('Línea base tras el primer ciclo de matrícula; meta numérica por validar'). " +
      "⛔ Nunca inventes una meta numérica: si ninguna fuente la da, la medida dice 'meta por validar'. `intro`: vacío salvo que haga falta una frase.",
    schema: obj({
      intro: str,
      objetivos: arrayOf({ id: str, tipo: str, titulo: str, medida: str }, ["id", "tipo", "titulo"]),
    }),
  },
  {
    key: "problema",
    label: "Explicación del problema",
    eyebrow: "Síntomas, causas y lo que cuestan",
    theme: "light",
    sectionType: "diagnostico_problema",
    avisoDelChat:
      "los códigos (S1, F1, OBJ-01) unen secciones: si borras o renumeras uno, actualiza también donde se cita " +
      "(«explica» de las causas, «por» de las consecuencias y los objetivos de Preguntas); códigos nuevos, correlativos.",
    agentGenerated: true,
    empty: { intro: "", sintomas: [], causas: [], consecuencias: [] },
    agentHint: "Síntomas S1… (lo que se ve, con datos) → causas F1… (por qué pasa) → qué le cuesta al cliente.",
    brief:
      "El corazón del informe: el problema contado en tres columnas unidas por códigos. " +
      "`sintomas` (4-8): lo que se VE hoy, con el dato que lo muestra — `id` = 'S1', 'S2'…; `titulo` en 3-7 palabras ('Leads sin seguimiento visible'); `detalle` = 1-2 líneas con cifras si las fuentes las traen ('Cerca de 2.900 leads al mes; la tasa de conversión es desconocida'). " +
      "`causas` (4-8): POR QUÉ pasa — causas, no síntomas ('Nadie es dueño del dato' explica; 'el CRM está desordenado' describe) — `id` = 'F1', 'F2'…; `titulo` en 3-8 palabras ('Sin CRM ni registro común'); `detalle` = 1 línea con cómo se manifiesta y de dónde salió; `explica` = los síntomas que explica ('S1, S3'). Cada causa explica al menos un síntoma y cada síntoma lo explica al menos una causa. " +
      "`consecuencias` (4-8): cómo se pierde dinero, tiempo o clientes por esas causas — `titulo` en 3-8 palabras ('Pauta pagada sin saber cuántas matrículas genera'); `detalle` = 1 línea; `por` = las causas que la producen ('F1, F2'). " +
      "Trazable o no va: un síntoma sin fuente o una causa sin evidencia es una opinión. `intro`: vacío salvo que haga falta una frase.",
    schema: obj({
      intro: str,
      sintomas: arrayOf({ id: str, titulo: str, detalle: str }, ["id", "titulo"]),
      causas: arrayOf({ id: str, titulo: str, detalle: str, explica: str }, ["id", "titulo", "explica"]),
      consecuencias: arrayOf({ titulo: str, detalle: str, por: str }, ["titulo", "por"]),
    }),
  },
  {
    key: "desafio",
    label: "Desafío principal",
    eyebrow: "El problema en una pregunta",
    theme: "dark",
    sectionType: "kickoff_prose",
    agentGenerated: true,
    empty: proseEmpty,
    agentHint: "La pregunta que resume el problema + los 4-6 bloqueos que la explican.",
    brief:
      "El problema en una pregunta. `intro` = UNA pregunta que lo resume, en palabras del cliente ('¿Qué nos está impidiendo convertir la pauta en matrículas medibles y atender a los proyectos con trazabilidad?'). `items` (4-6): los bloqueos que la explican — `title` = el bloqueo en 2-4 palabras ('Sin registro único', 'Sin medición'); `detail` = UNA línea que lo concreta. Cada bloqueo sale de una o más causas (F) de la sección anterior; no repitas sus textos, resúmelos.",
    schema: asSchema(proseSchema),
    schemaDelChat: asSchema(PROSA_SCHEMA_DEL_CHAT),
  },
  {
    key: "estado_actual",
    label: "Cómo operas hoy",
    eyebrow: "La operación actual",
    theme: "light",
    sectionType: "process_mapping",
    /* Solo el HOY: «cómo vas a operar» es enfoque y vive en Planificación (Elías, 2026-09-27). La
       columna derecha, que en el renderer compartido es «Con la implementación», acá son los
       puntos de fricción de ese hoy. Los diagnósticos viejos que la traen escrita como futuro se siguen viendo;
       al regenerar se reescriben. */
    compara: { izquierda: "hoy", derecha: "puntosDeFriccion", phDerecha: "puntosDeFriccionPh" },
    agentGenerated: true,
    empty: PROCESS_MAPPING_EMPTY,
    agentHint: "UN proceso por frente: cómo funciona HOY y sus puntos de fricción, con las herramientas que usa.",
    brief:
      "Cómo opera hoy, por proceso. `procesos`: UNO por frente que el proyecto toca ('Marketing y captación', 'Ventas y matrícula', 'Mesa de ayuda'). Por proceso: " +
      "`nombre` = en lenguaje del cliente; `resumenHoy` = titular de media línea que se lee solo ('La visibilidad termina en el clic'); `comoEsHoy` = 2-4 frases con la operación REAL, con quién la hace y con qué; " +
      "`resumenSera` = titular de media línea con el PUNTO DE FRICCIÓN ('El dato queda en una libreta'); `comoSera` = 1-3 frases con la fricción concreta — qué se pierde, qué se atrasa, qué depende de una persona —, respaldada por los procesos mapeados (los dolores marcados ⚠) y las sesiones; " +
      "`sistemas` = las herramientas que usa hoy ('WordPress, Meta Business, WhatsApp en el celular, Excel'). " +
      "⛔ No describas cómo va a operar con el proyecto: eso no es este informe.",
    schema: asSchema(PROCESS_MAPPING_SCHEMA),
  },
  {
    key: "fortalezas",
    label: "Fortalezas",
    eyebrow: "¿Qué estamos haciendo bien?",
    theme: "soft",
    sectionType: "kickoff_prose",
    agentGenerated: true,
    empty: proseEmpty,
    agentHint: "Lo que el cliente ya hace bien y el proyecto aprovecha. 3-6 tarjetas.",
    brief:
      "Lo que el cliente YA hace bien y sirve de base. `items` (3-6): `title` = la fortaleza en 3-6 palabras ('Pauta centralizada', 'Llave única por proyecto'); `detail` = 1-2 frases con por qué es una ventaja para lo que viene. Solo fortalezas reales, respaldadas por las fuentes — no halagos genéricos. `intro`: vacío.",
    schema: asSchema(proseSchema),
    schemaDelChat: asSchema(PROSA_SCHEMA_DEL_CHAT),
  },
  {
    key: "gap_analysis",
    label: "La brecha y lo que cuesta hoy",
    eyebrow: "La brecha",
    theme: "light",
    sectionType: "web_diagnosis",
    agentGenerated: true,
    empty: WEB_DIAGNOSIS_EMPTY,
    agentHint: "Qué falta para lograr los objetivos (izq) + qué le cuesta hoy no tenerlo (panel oscuro).",
    /* Rótulos de las dos columnas (antes se colaban por `plataforma`, ver exploracion.defs.ts). */
    chips: { retos: "Qué falta", panel: "Qué te cuesta hoy" },
    brief:
      "La brecha entre la operación de hoy y los objetivos (OBJ) — concreta, no aspiracional. `intro`: 1 frase de encuadre. " +
      "`retos`: qué falta para lograrlos — 3 a 5, cada uno `title` corto ('Un registro único', 'Reglas de propiedad y privacidad') + `detail` de máximo 20 PALABRAS. " +
      "`porQueBullets`: lo que le cuesta HOY no tenerlo — 3 a 5, con números SOLO si alguna fuente los trae ('De 2.900 a 3.000 leads al mes pagados sin saber cuántos matriculan'), `detail` de máximo 20 PALABRAS. " +
      "`objetivo`: cuál brecha se cierra primero y por qué esa ('Primero el registro único: todo lo demás depende de que el dato exista').",
    schema: asSchema(WEB_DIAGNOSIS_SCHEMA),
    schemaDelChat: asSchema(WEB_DIAGNOSIS_SCHEMA_DEL_CHAT),
  },
  {
    key: "preguntas",
    label: "Preguntas que hoy no puedes responder",
    eyebrow: "Preguntas de negocio",
    theme: "light",
    sectionType: "diagnostico_preguntas",
    avisoDelChat:
      "los códigos (S1, F1, OBJ-01) unen secciones: si borras o renumeras uno, actualiza también donde se cita " +
      "(«explica» de las causas, «por» de las consecuencias y los objetivos de Preguntas); códigos nuevos, correlativos.",
    agentGenerated: true,
    empty: { intro: "", preguntas: [] },
    agentHint: "Las preguntas de negocio que hoy no tienen respuesta, cada una atada a su OBJ.",
    brief:
      "Las preguntas de negocio que el cliente HOY no puede responder y que responderá cuando se cumplan los objetivos. `preguntas` (5-9): `pregunta` = en palabras de su gerencia, concreta ('¿Qué porcentaje de leads llega a matrícula por modalidad y por proyecto?'); `objetivos` = el o los OBJ que la responden ('OBJ-01'). Toda pregunta apunta a un OBJ que exista arriba. `intro`: vacío.",
    schema: obj({ intro: str, preguntas: arrayOf({ pregunta: str, objetivos: str }, ["pregunta", "objetivos"]) }),
  },
  {
    key: "quienes",
    label: "Quiénes participan",
    eyebrow: "Las personas",
    theme: "light",
    sectionType: "kickoff_prose",
    agentGenerated: true,
    empty: proseEmpty,
    agentHint: "Las personas y equipos del cliente que participan, con su papel. Sin opiniones sobre nadie.",
    brief:
      "Las personas y equipos DEL CLIENTE que participan del proyecto. `items`: `title` = el equipo o la persona ('Fomento y Gestión de Proyectos', 'Pablo Olivas'); `detail` = cargo y papel en el proyecto en UNA línea ('Sponsor de Marketing y Ventas; valida el mapeo con las ejecutivas'). " +
      "⛔ Nunca la postura, la opinión ni el nivel de apertura de nadie: este informe lo lee el cliente. Nunca a nadie del equipo de Smarteam. `intro`: vacío.",
    schema: asSchema(proseSchema),
    schemaDelChat: asSchema(PROSA_SCHEMA_DEL_CHAT),
  },
  {
    key: "cierre",
    label: "El siguiente paso",
    eyebrow: "El siguiente paso",
    theme: "dark",
    selfTitled: true,
    pinned: true,
    noHide: true,
    ctxDriven: true, // banda oscura propia que además lee `data` (CTA), como el kickoff
    sectionType: "kickoff_cta",
    agentGenerated: false, // CURADA: la escribe el equipo, el agente no la toca
    empty: DIAGNOSTICO_CIERRE_DEFAULT,
    agentHint: "",
    brief:
      "Cierre curado por el equipo: el siguiente paso con el cliente (presentar el plan, agendar la sesión de planificación) + botón opcional. El agente no la toca.",
    schema: {
      type: "object",
      properties: { eyebrow: str, headline: str, subhead: str, buttonLabel: str, buttonUrl: str, buttonTarget: str },
    },
  },

  // ── SOLO-LECTURA: lo que salió del diagnóstico el 2026-09-28 ───────────────────────────────
  // Con contenido viejo se ven; vacías son blank y el modo lectura las omite. El agente no las
  // escribe y el runner las retira al regenerar (SECCIONES_RETIRADAS_DEL_DIAGNOSTICO).
  {
    key: "estado_deseado",
    label: "Estado deseado",
    eyebrow: "A dónde vamos",
    theme: "light",
    sectionType: "kickoff_prose",
    agentGenerated: false,
    empty: proseEmpty,
    agentHint: "",
    brief: "Sección legacy. El agente no la escribe: cómo va a operar el cliente es enfoque y vive en Planificación.",
    schema: asSchema(proseSchema),
    schemaDelChat: asSchema(PROSA_SCHEMA_DEL_CHAT),
  },
  {
    key: "escala",
    label: "Dónde estás en la escala",
    eyebrow: "Escala de rendimiento",
    theme: "dark",
    // Los diagnósticos con la posición 5.2 o con las tarjetas «N/5» de la v4 se siguen viendo.
    sectionType: "escala_posicion",
    agentGenerated: false,
    empty: ESCALA_POSICION_EMPTY,
    agentHint: "",
    brief: "Sección legacy. El diagnóstico no ubica en la Escala hasta que llegue la versión 7.0.",
    schema: asSchema(ESCALA_POSICION_SCHEMA),
  },
  {
    key: "causa_raiz",
    label: "Qué explica estos resultados",
    eyebrow: "Causas, no síntomas",
    theme: "light",
    sectionType: "pain",
    agentGenerated: false,
    empty: PAIN_EMPTY,
    agentHint: "",
    brief: "Sección legacy. Las causas viven ahora, con código, en la Explicación del problema.",
    schema: asSchema(PAIN_SCHEMA),
  },
  {
    key: "impacto_gap",
    label: "Impacto del gap",
    eyebrow: "Qué cuesta",
    theme: "light",
    sectionType: "kickoff_prose",
    agentGenerated: false,
    empty: proseEmpty,
    agentHint: "",
    brief: "Sección legacy. El impacto vive en el panel oscuro de la brecha.",
    schema: asSchema(proseSchema),
    schemaDelChat: asSchema(PROSA_SCHEMA_DEL_CHAT),
  },
  {
    key: "recomendaciones",
    label: "Qué hacemos con esto",
    eyebrow: "Recomendaciones",
    theme: "soft",
    sectionType: "kickoff_prose",
    agentGenerated: false,
    empty: proseEmpty,
    agentHint: "",
    brief: "Sección legacy. Las acciones van al canvas de Ejecución, atadas a las causas y los objetivos del diagnóstico.",
    schema: asSchema(proseSchema),
    schemaDelChat: asSchema(PROSA_SCHEMA_DEL_CHAT),
  },
  {
    key: "proximos_pasos",
    label: "Próximos pasos",
    eyebrow: "Siguiente",
    theme: "light",
    sectionType: "kickoff_prose",
    agentGenerated: false,
    empty: proseEmpty,
    agentHint: "",
    brief: "Sección legacy. El siguiente paso vive en el cierre.",
    schema: asSchema(proseSchema),
    schemaDelChat: asSchema(PROSA_SCHEMA_DEL_CHAT),
  },
];

/** Template del canvas Diagnóstico para el agente tipado (`generateSectionsForTemplate`). */
export const DIAGNOSTICO_TEMPLATE: BcTemplateDef = {
  id: "diagnostico_v1",
  caseLabel: "Diagnóstico",
  // process_mapping + web_diagnosis + roi son secciones densas; el generador ABORTA sin
  // persistir si el stop_reason es max_tokens — mejor sobrar que abortar.
  maxTokens: 16000,
  brandVoice: true, // informe DE CARA AL CLIENTE: voz de marca, tuteo
  features: { useCaseChecklist: false },
  agentIntro:
    "Eres el consultor senior de Smarteam que escribe el DIAGNÓSTICO de un cliente: el informe que el cliente VA A LEER para entender dónde está, por qué, y qué quiere lograr. Se escribe DESPUÉS de las encuestas y de las sesiones de exploración, y queda en manos del cliente — cada frase tiene que sostenerse sola frente a su gerencia.\n\n" +
    "EL HILO (lo que hace distinto a este informe): todo se une con CÓDIGOS. Los síntomas son S1, S2…; las causas son F1, F2…; los objetivos son OBJ-01, OBJ-02…. Cada causa dice qué síntomas explica, cada consecuencia dice qué causas la producen, cada pregunta de negocio dice qué objetivo la responde. Nada queda suelto: un síntoma que ninguna causa explica, o una causa que no explica nada, es un error del informe. Los códigos son correlativos y no se repiten.\n\n" +
    "TU MÉTODO: parte de la evidencia — las sesiones con el cliente, sus respuestas a la encuesta, la ficha del cliente, lo que se conversó al vender el proyecto, la exploración y sus procesos mapeados. Los objetivos salen de los resultados que el cliente persigue. Explica dónde está con causas, no con síntomas: el cliente no compra un informe, compra entender POR QUÉ está donde está.\n\n" +
    "LO QUE ESTE INFORME NO HACE: no ubica al cliente en ninguna escala de madurez, no describe cómo va a operar con el proyecto (eso es la planificación) y no recomienda acciones (eso es la ejecución). Se queda en el diagnóstico.\n\n" +
    "REGISTRO CLIENTE-FACING: tuteo, claro, sin jerga interna de Smarteam ('handoff', 'CSE', 'exploración', 'ficha' no existen para el cliente — di 'las sesiones que tuvimos', 'tus respuestas a la encuesta'). Honesto sin ser cruel: la fricción se nombra con precisión, no con burla ni eufemismo. Nunca opines sobre las personas del cliente.\n\n" +
    "DISCIPLINA ANTI-ALUCINACIÓN (dura): NUNCA inventes datos, cifras, procesos ni personas del cliente. Todo lo que afirmes tiene que rastrearse a una fuente del contexto. Lo que la exploración marcó como 'sin verificar' NO se afirma como hecho — o se omite, o se presenta como pregunta abierta. Una meta numérica que nadie dio va como 'meta por validar'. Un número inventado en un informe que el cliente guarda es el peor error posible.\n\n" +
    "FORMATO: cada sección tiene su PROPIO shape (su `schema` y su guía) — NO es prosa libre. Los `detail` van en una o dos líneas. Español, tuteo. Si una sección no tiene respaldo en las fuentes, deja sus arrays vacíos — vacío es correcto, inventado no.",
  sections: DIAGNOSTICO_SECTION_DEFS,
};

/** Lookup key → def (seed, agente, SectionTools). */
export const DIAGNOSTICO_DEF_BY_KEY: Record<string, BCSectionDef> = Object.fromEntries(
  DIAGNOSTICO_SECTION_DEFS.map((d) => [d.key, d]),
);

/**
 * ALLOWLIST de secciones del Handoff que ve el agente del diagnóstico. RESTRICTIVA como
 * la del kickoff — el informe es de cara al cliente, así que las secciones internas
 * (riesgos, motivación de la decisión, acuerdos, estado en vuelo) NO entran: un dato de
 * esas secciones citado en el informe sería una filtración.
 */
export const DIAGNOSTICO_HANDOFF_KEYS = [
  // Lo que el cliente dijo que quiere lograr: de acá salen los objetivos (OBJ). Es apta para el
  // cliente — el kickoff y la entrega ya la leen (lib/canvas/handoff-al-cliente.test.ts).
  "resultados_cliente",
  "alcance_contratado",
  "dolor_principal",
  "expectativas",
  "stakeholders_handoff",
  "desarrollo",
] as const;
