/**
 * components/landing/configs/diagnostico.defs.ts
 *
 * Defs SERVER-SAFE del canvas "Diagnóstico" — el INFORME PARA EL CLIENTE. Corre sobre el mismo
 * motor `LandingView` que el Kickoff.
 *
 * ── EL CONTRATO (2026-10-02) ─────────────────────────────────────────────────────────────────
 * Acordado por Elías con Caroline Bersot y Alex Vanegas: el diagnóstico es la parte TEÓRICA —qué
 * le pasa al cliente y cómo lo vamos a resolver— y la planificación es la PRÁCTICA, lo que termina
 * configurado en HubSpot. La plantilla es el diagnóstico real que Caroline hizo para FUNDAUNA, y el
 * ORDEN de `DIAGNOSTICO_SECTION_DEFS` es el de sus secciones (lo cuida
 * `lib/canvas/diagnostico-contrato.test.ts`). Revierte tres decisiones del 27-sep: «cómo va a
 * operar», la política rectora (venía de Planificación) y las acciones con sus herramientas (venían
 * de Ejecución) vuelven acá. Nada de detalle de configuración: propiedades, pipelines, etapas y
 * workflows son de la planificación. La escala de madurez queda afuera por decisión de Elías
 * (2026-10-02): va después de «Cómo opera hoy y cómo va a operar» cuando vuelva.
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
 * LA ESCALA: la sección `escala` (Escala 5.2, `escala_posicion`) quedó SOLO-LECTURA desde el
 * 2026-09-28. Los diagnósticos viejos la conservan oculta porque la Entrega lee de ahí el punto de
 * partida del cliente (`posicionDelDiagnostico`, lib/escala/contexto.ts).
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

/* ── El HILO (2026-09-28, completado el 2026-10-02) ─────────────────────────────────────────────
   Todo se encadena con CÓDIGOS, como en FUNDAUNA: síntomas S1… → causas F1… → consecuencias →
   acciones AC-01… (cada una ataca causas y mueve objetivos) → objetivos OBJ-01…. Lo que falta o
   quedó suelto lo encuentra lib/canvas/revisar-hilo.ts, y sin el hilo cerrado no se presenta.

   Las secciones que salieron quedan al final como SOLO-LECTURA: un diagnóstico viejo se sigue
   viendo igual hasta que se regenera, y al regenerarlo el runner las OCULTA sin borrar sus datos
   (lib/canvas/diagnostico-generate.ts). `contexto_alcance` y `quienes` salieron el 2026-10-02:
   FUNDAUNA no tiene «Qué miramos y con qué fuentes» (las fuentes se ven en el panel «Contexto»), y
   «Quiénes participan» pasó a ser la tabla de equipos y licencias. */
export const SECCIONES_RETIRADAS_DEL_DIAGNOSTICO = [
  "contexto_alcance",
  "quienes",
  "estado_deseado",
  "escala",
  "causa_raiz",
  "impacto_gap",
  "recomendaciones",
  "proximos_pasos",
] as const;

/** Las keys que se movieron entre documentos el 2026-10-02. Una sola fuente para los tres runners. */
export const POLITICA_RECTORA_KEY = "politica_rectora";
export const ACCIONES_KEY = "acciones";
export const HERRAMIENTAS_KEY = "herramientas";

/**
 * Los esquemas de las acciones y las herramientas, UNO por tipo: los usan el diagnóstico (donde viven
 * desde el 2026-10-02) y las defs solo-lectura de Ejecución (donde vivieron). Un renderer, un contrato.
 */
export const ACCIONES_SCHEMA = obj({
  intro: str,
  acciones: arrayOf(
    { id: str, accion: str, detalle: str, grupo: str, ataca: str, mueve: str, hub: str, quickWin: str, alcance: str },
    ["id", "accion", "ataca", "mueve"],
  ),
});
export const HERRAMIENTAS_SCHEMA = obj({
  intro: str,
  herramientas: arrayOf({ herramienta: str, paraQue: str, acciones: str }, ["herramienta"]),
});

/** Rótulo interno de la política mientras el ejecutivo no la revisa. El cliente nunca lo ve. */
export const SUGERENCIA_POR_REVISAR = "Sugerencia por revisar";

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
    // La portada del BC + la línea «Cliente · Fecha · Versión · Estado» (2026-10-02). Tipo propio y no
    // `hero`: el mismo nombre resolviendo a dos componentes es justo lo que el registro prohíbe.
    sectionType: "diagnostico_portada",
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
    agentHint: "OBJ-01…: los cuantitativos SON los resultados medibles del handoff (uno por R, con su `resultado`); los cualitativos, lo que cambia en cómo se trabaja.",
    /* 2026-10-02 — Los cuantitativos NO se capturan dos veces (Elías): cada uno apunta a un resultado
       medible del handoff (`resultado` = 'R1') y la línea base, la meta y el plazo los pinta el
       renderer desde ahí (`ctx.diagnostico.resultados`); sin línea base, «Por validar». */
    brief:
      "Lo que el cliente quiere lograr, con código. `objetivos` (5-9): primero TODOS los cuantitativos y después los cualitativos; `id` = 'OBJ-01', 'OBJ-02'… correlativos en ese orden (Nexus igual los renumera así al guardar); `tipo` = 'cuantitativo' o 'cualitativo'. " +
      "CUANTITATIVOS = los RESULTADOS MEDIBLES DEL HANDOFF (vienen en el contexto como R1, R2…): uno por cada resultado que se mide con un número, con `resultado` = su código ('R1'); `titulo` = ese resultado dicho como objetivo ('Conocer la tasa de conversión de lead a matrícula por proyecto'); `medida` = SOLO cómo se mide ('Tasa de conversión por proyecto y modalidad'). ⛔ NO escribas línea base, meta ni plazo: Nexus los muestra desde el handoff, y si no hay línea base, el objetivo sale «Por validar». Si no hay resultados medibles en el contexto, deriva los cuantitativos de lo que el cliente persigue y deja `resultado` vacío. " +
      "CUALITATIVOS = lo que cambia en cómo se trabaja: `resultado` vacío; `titulo` = el objetivo; `medida` = cómo se va a notar ('Ningún proyecto accede a registros de otro'). `intro`: vacío salvo que haga falta una frase.",
    schema: obj({
      intro: str,
      objetivos: arrayOf({ id: str, tipo: str, titulo: str, medida: str, resultado: str }, ["id", "tipo", "titulo"]),
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
    /* La CUARTA columna de FUNDAUNA —«Consecuencias positivas: acciones coherentes y cómo generan
       dinero»— no se escribe acá: la pinta el renderer leyendo la tabla de Acciones del mismo
       documento (`ctx.diagnostico.acciones`). Escribirla dos veces sería que diverjan. */
    brief:
      "El corazón del informe: el problema contado en tres columnas unidas por códigos (la cuarta, las acciones y cómo generan dinero, sale sola de la tabla de Acciones). " +
      "`sintomas` (4-8): lo que se VE hoy, con el dato que lo muestra — `id` = 'S1', 'S2'…; `titulo` en 3-7 palabras ('Leads sin seguimiento visible'); `detalle` = 1-2 líneas con cifras si las fuentes las traen ('Cerca de 2.900 leads al mes; la tasa de conversión es desconocida'). " +
      "`causas` (4-8): POR QUÉ pasa — causas, no síntomas ('Nadie es dueño del dato' explica; 'el CRM está desordenado' describe) — `id` = 'F1', 'F2'…; `titulo` en 3-8 palabras ('Sin CRM ni registro común'); `detalle` = 1 línea con cómo se manifiesta y de dónde salió; `explica` = los síntomas que explica ('S1, S3'). Cada causa explica al menos un síntoma y cada síntoma lo explica al menos una causa. " +
      "`consecuencias` (4-8): las consecuencias NEGATIVAS, cómo se pierde dinero, tiempo o clientes por esas causas — `titulo` en 3-8 palabras ('Pauta pagada sin saber cuántas matrículas genera'); `detalle` = 1 línea; `por` = las causas que la producen ('F1, F2'). Cada causa tiene al menos una. " +
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
    /* 2026-10-02 — Vuelve de Planificación: FUNDAUNA la pone al lado del desafío. Casi nunca se
       habla en las sesiones, así que la IA la PROPONE y el ejecutivo la ajusta antes de presentar:
       el renderer la marca «Sugerencia por revisar» (solo en edición) hasta que alguien la revisa,
       y sin revisar no se presenta. Revisada, regenerar no la pisa (diagnostico-generate.ts). */
    key: POLITICA_RECTORA_KEY,
    label: "Política rectora",
    eyebrow: "¿En qué debemos enfocarnos y para qué?",
    theme: "dark",
    sectionType: "diagnostico_politica",
    agentGenerated: true,
    empty: proseEmpty,
    agentHint: "La pregunta del enfoque + 4-6 principios, cada uno nacido de las causas (F). Es una sugerencia: la revisa el ejecutivo.",
    brief:
      "Los principios que guían la solución — lo que se decide una vez y no se vuelve a discutir. Es una SUGERENCIA: casi nunca se habla en las sesiones, así que la propones desde las causas (F) y los objetivos (OBJ), y el ejecutivo la ajusta antes de presentarla. " +
      "`intro` = UNA pregunta de enfoque ('¿En qué debemos enfocarnos y para qué?'). `items` (4-6): `title` = el principio en 3-7 palabras, dicho como decisión ('HubSpot como única fuente', 'Automatizar lo repetitivo, dejar el criterio a las personas', 'Medir desde el día uno con lo mínimo'); " +
      "`detail` = 1-2 frases con qué significa EN CONCRETO para este cliente. Un principio que no ataca ninguna causa, sobra. Sin detalle de configuración.",
    schema: asSchema(proseSchema),
    schemaDelChat: asSchema(PROSA_SCHEMA_DEL_CHAT),
  },
  {
    key: "estado_actual",
    label: "Cómo opera hoy y cómo va a operar",
    eyebrow: "La operación",
    theme: "light",
    sectionType: "process_mapping",
    /* 2026-10-02 — Vuelve «cómo va a operar» (FUNDAUNA): la columna derecha es otra vez «Con la
       implementación», contada como lo que cambia para las personas y NUNCA como configuración. Del
       27-sep al 2-oct esa columna fueron «puntos de fricción»; esos diagnósticos se siguen viendo y
       al regenerar se reescriben. Las fricciones ya están en los síntomas y las causas. */
    agentGenerated: true,
    empty: PROCESS_MAPPING_EMPTY,
    agentHint: "UN proceso por frente: cómo funciona HOY y cómo va a operar con la implementación, con las herramientas de hoy → las de HubSpot.",
    brief:
      "Cómo opera hoy y cómo va a operar, por proceso. `procesos`: UNO por frente que el proyecto toca ('Marketing y captación', 'Ventas y matrícula', 'Mesa de ayuda', 'Atención con IA'). Por proceso: " +
      "`nombre` = en lenguaje del cliente; `resumenHoy` = titular de media línea que se lee solo ('La visibilidad termina en el clic'); `comoEsHoy` = 2-4 frases con la operación REAL, con quién la hace y con qué; " +
      "`resumenSera` = titular de media línea de cómo va a operar ('Cada lead entra con fuente, proyecto y programa'); `comoSera` = 2-4 frases con lo que cambia para las PERSONAS y para el cliente con la implementación — quién recibe qué, qué deja de depender de alguien, qué se ve que antes no se veía —; " +
      "`sistemas` = las herramientas de hoy → las de HubSpot que las reemplazan o conectan ('WordPress, Meta Business y WhatsApp en el celular → Formularios, Anuncios y Bandeja de entrada de HubSpot'). " +
      "⛔ Sin detalle de configuración: ni nombres de propiedades, ni etapas de pipeline, ni reglas de workflow — eso es de la planificación.",
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
    /* 2026-10-02 — Vienen de Ejecución (FUNDAUNA las pone en el diagnóstico): las acciones son el
       «cómo lo vamos a resolver» contado al cliente. Cada una ATACA causas (F) y MUEVE objetivos
       (OBJ); sin eso no se presenta (lib/canvas/revisar-hilo.ts). Su `detalle` es también la
       cuarta columna de la Explicación del problema: cómo genera dinero. */
    key: ACCIONES_KEY,
    label: "Acciones coherentes",
    eyebrow: "¿Qué nos hace falta?",
    theme: "light",
    sectionType: "ejecucion_acciones",
    agentGenerated: true,
    avisoDelChat:
      "cada acción ataca causas (F) y mueve objetivos (OBJ) que existen en este diagnóstico, y toda causa tiene al menos una acción: si cambias un código, cámbialo donde se cita; códigos AC nuevos, correlativos.",
    empty: { intro: "", acciones: [] },
    agentHint: "AC-01…: la acción, cómo genera dinero, su grupo, qué causas (F) ataca, qué objetivos (OBJ) mueve, hub, quick win y alcance.",
    brief:
      "Las acciones coherentes: cómo se resuelve el problema, en el orden en que se hacen. `acciones` (5-10): `id` = 'AC-01', 'AC-02'… correlativos; `accion` = la acción en 4-10 palabras, dicha al cliente ('Captación conectada: formularios nativos, Meta, LinkedIn y Google Ads'); `detalle` = UNA línea con cómo genera dinero o qué gana el cliente ('Cada lead que llega por la pauta entra al CRM con su campaña, para saber qué inversión genera matrículas'); " +
      "`grupo` = UNO de: Planeación · Configuración · Integración · Reportería · Adopción; `ataca` = las causas que ataca ('F1, F2') — OBLIGATORIO; `mueve` = los objetivos que mueve ('OBJ-01, OBJ-04') — OBLIGATORIO; `hub` = el hub o herramienta ('Sales Hub', 'Smart CRM', 'Breeze'); " +
      "`quickWin` = 'si' si da resultado en semanas, si no 'no'; `alcance` = 'dentro' si lo contratado la cubre, 'fuera' si no (una acción fuera de alcance se lista igual: es la conversación de la siguiente etapa). " +
      "⛔ Toda causa (F) tiene al menos una acción que la ataca, y toda acción cita causas y objetivos que EXISTEN arriba. Sin detalle de configuración (ni propiedades, ni etapas, ni reglas de workflow). `intro`: vacío.",
    schema: ACCIONES_SCHEMA,
  },
  {
    key: HERRAMIENTAS_KEY,
    label: "Herramientas de HubSpot y para qué",
    eyebrow: "Con qué lo vamos a resolver",
    theme: "light",
    sectionType: "ejecucion_herramientas",
    agentGenerated: true,
    empty: { intro: "", herramientas: [] },
    agentHint: "Una fila por herramienta de HubSpot: para qué se usa con este cliente y en qué acciones (AC).",
    brief:
      "Las herramientas de HubSpot que usa la solución. `herramientas` (5-12): `herramienta` = el nombre en HubSpot ('Equipos, permisos y propietarios', 'Pipelines de leads y de negocios', 'Customer Agent (Breeze)', 'Help Desk y SLA'); " +
      "`paraQue` = UNA línea con para qué se usa con ESTE cliente, en sus palabras; `acciones` = las AC de arriba que la usan ('AC-02, AC-05'). Solo herramientas que alguna acción usa. " +
      "⛔ Dice PARA QUÉ, nunca CÓMO se configura: ni nombres de propiedades, ni etapas, ni reglas. `intro`: vacío.",
    schema: HERRAMIENTAS_SCHEMA,
  },
  {
    /* 2026-10-02 — Reemplaza a «Quiénes participan» (prosa) con la tabla de FUNDAUNA: quién está de
       cada lado, qué hace en el proyecto y con qué asiento o licencia. Suma la fila de Smarteam. */
    key: "equipos_licencias",
    label: "Equipos involucrados y licencias",
    eyebrow: "Las personas",
    theme: "light",
    sectionType: "diagnostico_equipos",
    agentGenerated: true,
    empty: { intro: "", equipos: [] },
    agentHint: "Una fila por equipo: personas, rol en el proyecto y asiento o licencia (o «Por validar»). La última fila es Smarteam.",
    brief:
      "Quién participa, de los dos lados. `equipos` (3-9): `equipo` = el equipo o el área del cliente ('Fomento y Gestión de Proyectos', 'Mercadeo y Comunicación', 'Contact center'); `personas` = los nombres que dan las fuentes, o cuántas son si no hay nombres ('4 agentes del servicio'); " +
      "`rol` = qué hace en el proyecto en UNA línea ('Sponsor de Marketing y Ventas; valida el mapeo con las ejecutivas'); `licencia` = el asiento o la licencia de HubSpot que usa ('Sales Hub Professional (3 licencias)', 'Solo consulta, sin costo', 'Core seat'), y 'Por validar' si ninguna fuente lo dice. " +
      "La ÚLTIMA fila es Smarteam: `equipo` = 'Smarteam', `personas` = el equipo de Smarteam del proyecto (viene en el contexto), `rol` = qué hace Smarteam ('Diagnóstico, configuración, capacitación y acompañamiento'), `licencia` = 'Acceso de partner'. " +
      "⛔ Nunca la postura, la opinión ni el nivel de apertura de nadie: este informe lo lee el cliente. `intro`: vacío.",
    schema: obj({ intro: str, equipos: arrayOf({ equipo: str, personas: str, rol: str, licencia: str }, ["equipo"]) }),
  },
  {
    key: "preguntas",
    label: "Preguntas que vas a poder responder",
    eyebrow: "Preguntas de negocio",
    theme: "light",
    sectionType: "diagnostico_preguntas",
    avisoDelChat:
      "los códigos (S1, F1, OBJ-01) unen secciones: si borras o renumeras uno, actualiza también donde se cita " +
      "(«explica» de las causas, «por» de las consecuencias y los objetivos de Preguntas); códigos nuevos, correlativos.",
    agentGenerated: true,
    empty: { intro: "", preguntas: [] },
    agentHint: "Las preguntas de negocio que el cliente va a poder responder, cada una atada a su OBJ.",
    brief:
      "Las preguntas de negocio que el cliente HOY no puede responder y que va a poder responder cuando se cumplan los objetivos. `preguntas` (5-9): `pregunta` = en palabras de su gerencia, concreta ('¿Qué porcentaje de leads llega a matrícula por modalidad y por proyecto?'); `objetivos` = el o los OBJ que la responden ('OBJ-01'). Toda pregunta apunta a un OBJ que exista arriba. `intro`: vacío.",
    schema: obj({ intro: str, preguntas: arrayOf({ pregunta: str, objetivos: str }, ["pregunta", "objetivos"]) }),
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
    /* 2026-10-02 — Cierra el informe como FUNDAUNA: lo contratado, agrupado por hub, cada ítem con
       las acciones (AC) que lo cubren. Lo que está fuera queda nombrado: es la siguiente conversación. */
    key: "alcance_acordado",
    label: "Alcance acordado",
    eyebrow: "Qué incluye este proyecto",
    theme: "soft",
    sectionType: "diagnostico_alcance",
    agentGenerated: true,
    empty: { intro: "", grupos: [], fuera: [] },
    agentHint: "Lo contratado agrupado por hub (o «Transversal»), cada ítem con sus AC. Lo que queda fuera, aparte.",
    brief:
      "El alcance contratado, tal como se vendió (SOLO lo que respaldan el alcance contratado y el desarrollo del handoff — no inflar). `grupos` (2-5): `titulo` = el hub o el frente ('Smart CRM y Sales Hub Professional', 'Service Hub Enterprise', 'Transversal'); `items` (2-6 por grupo): `texto` = lo que incluye, en una línea ('Pipeline de tickets de cinco etapas, formulario de entrada y asignación por categoría'), `acciones` = las AC que lo cubren ('AC-05'). " +
      "`fuera` (0-4): las acciones con alcance 'fuera', dichas como la siguiente conversación — `texto` + `acciones`. Toda acción 'dentro' aparece en algún ítem. `intro`: vacío.",
    schema: obj({
      intro: str,
      grupos: arrayOf({ titulo: str, items: arrayOf({ texto: str, acciones: str }, ["texto"]) }, ["titulo"]),
      fuera: arrayOf({ texto: str, acciones: str }, ["texto"]),
    }),
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
      "Cierre curado por el equipo: el siguiente paso con el cliente (la aprobación del diagnóstico por correo, agendar la sesión de planificación) + botón opcional. El agente no la toca.",
    schema: {
      type: "object",
      properties: { eyebrow: str, headline: str, subhead: str, buttonLabel: str, buttonUrl: str, buttonTarget: str },
    },
  },

  // ── SOLO-LECTURA: lo que salió del diagnóstico (2026-09-28 y 2026-10-02) ───────────────────
  // Con contenido viejo se ven; vacías son blank y el modo lectura las omite. El agente no las
  // escribe y el runner las retira al regenerar (SECCIONES_RETIRADAS_DEL_DIAGNOSTICO).
  {
    key: "contexto_alcance",
    label: "Qué miramos y con qué fuentes",
    eyebrow: "Contexto y alcance",
    theme: "light",
    sectionType: "kickoff_prose",
    agentGenerated: false,
    empty: proseEmpty,
    agentHint: "",
    brief: "Sección legacy. FUNDAUNA no la tiene: las fuentes del diagnóstico se ven en su panel «Contexto».",
    schema: asSchema(proseSchema),
    schemaDelChat: asSchema(PROSA_SCHEMA_DEL_CHAT),
  },
  {
    key: "quienes",
    label: "Quiénes participan",
    eyebrow: "Las personas",
    theme: "light",
    sectionType: "kickoff_prose",
    agentGenerated: false,
    empty: proseEmpty,
    agentHint: "",
    brief: "Sección legacy. Las personas viven ahora en «Equipos involucrados y licencias».",
    schema: asSchema(proseSchema),
    schemaDelChat: asSchema(PROSA_SCHEMA_DEL_CHAT),
  },
  {
    key: "estado_deseado",
    label: "Estado deseado",
    eyebrow: "A dónde vamos",
    theme: "light",
    sectionType: "kickoff_prose",
    agentGenerated: false,
    empty: proseEmpty,
    agentHint: "",
    brief: "Sección legacy. Cómo va a operar el cliente vive en «Cómo opera hoy y cómo va a operar».",
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
    brief: "Sección legacy. Las acciones viven ahora en «Acciones coherentes», atadas a las causas y los objetivos.",
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
  // Catorce secciones generadas, varias densas (el problema, las acciones, el cómo va a operar):
  // el generador ABORTA sin persistir si se corta por max_tokens — mejor sobrar que abortar.
  // ⚠ Tope 20.000 y no más: es una llamada SIN streaming, y por encima de ~21.300 el SDK de
  // Anthropic exige streaming y rechaza el pedido antes de mandarlo.
  maxTokens: 20000,
  brandVoice: true, // informe DE CARA AL CLIENTE: voz de marca, tuteo
  features: { useCaseChecklist: false },
  agentIntro:
    "Eres el consultor senior de Smarteam que escribe el DIAGNÓSTICO de un cliente: el informe que el cliente VA A LEER para entender qué le pasa y cómo lo vamos a resolver. Se escribe DESPUÉS de las encuestas y de las sesiones de exploración, se le presenta, y queda en manos del cliente — cada frase tiene que sostenerse sola frente a su gerencia.\n\n" +
    "LA DIVISIÓN DEL TRABAJO: este informe es la parte TEÓRICA — el problema, sus causas, a dónde queremos llegar y CÓMO lo vamos a resolver (las acciones, las herramientas y cómo va a operar). La parte PRÁCTICA, lo que termina configurado en HubSpot, es de la planificación: aquí NUNCA va detalle de configuración — ni nombres de propiedades, ni etapas de pipeline, ni reglas de workflow.\n\n" +
    "EL HILO (lo que hace distinto a este informe): todo se une con CÓDIGOS. Los síntomas son S1, S2…; las causas son F1, F2…; los objetivos son OBJ-01, OBJ-02…; las acciones son AC-01, AC-02…. Cada causa dice qué síntomas explica, cada consecuencia dice qué causas la producen, cada ACCIÓN dice qué causas ataca y qué objetivos mueve, cada pregunta de negocio dice qué objetivo la responde. Nada queda suelto: una causa sin acción, una acción sin causa o sin objetivo, o un síntoma que ninguna causa explica, es un error del informe. Los códigos son correlativos y no se repiten.\n\n" +
    "TU MÉTODO: parte de la evidencia — las sesiones con el cliente, sus respuestas a la encuesta, la ficha del cliente, lo que se conversó al vender el proyecto, la exploración y sus procesos mapeados. Los objetivos salen de los resultados que el cliente persigue. Explica dónde está con causas, no con síntomas: el cliente no compra un informe, compra entender POR QUÉ está donde está y cómo se sale de ahí.\n\n" +
    "LA POLÍTICA RECTORA es una sugerencia tuya: casi nunca se habla en las sesiones. Propónla desde las causas y los objetivos; el ejecutivo la ajusta antes de presentarla.\n\n" +
    "LO QUE ESTE INFORME NO HACE: no ubica al cliente en ninguna escala de madurez y no baja a la configuración.\n\n" +
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
