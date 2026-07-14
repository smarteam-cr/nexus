/**
 * components/landing/configs/desarrollo.defs.ts
 *
 * Defs SERVER-SAFE (sin React) del canvas "Desarrollo" — el REQUERIMIENTO TÉCNICO que
 * recibe el desarrollador cuando el handoff detecta una integración / migración /
 * desarrollo a medida. Corre sobre el mismo motor `LandingView` que el Kickoff.
 *
 * DISEÑO (menos texto, más estructura visual → legible para técnicos y NO técnicos):
 * las 5 secciones de contenido se rinden con renderers VISUALES ya existentes del motor
 * (ver `configs/desarrollo.ts`), no con prosa:
 *  - `retos_cliente`   → `web_diagnosis` (retos + panel oscuro de consecuencias)
 *  - `criterios_exito` → `roi`           (métricas grandes)
 *  - `arquitectura`    → `tech_architecture` (cadena con flechas HubSpot ↔ destino)
 *  - `relacion_objetos`→ `tech_architecture` (cadena de objetos Contacto → Empresa → Negocio)
 *  - `comunicacion`    → `pain`          (grid de tarjetas de disparadores)
 * El hero es propio (`desarrollo_hero`) y el cierre reusa `desarrollo_cta`.
 *
 * Fuente del agente: la sección `desarrollo` del handoff (el veredicto + lo conversado)
 * + el alcance + el deal. El canvas EXPANDE esa sección — no la reemplaza. El destinatario
 * es el DEV: preciso y técnico; marca lo no confirmado como `⚠️ Por validar`, nunca inventa.
 */
import type { BCSectionDef } from "./business-case.defs";
import type { BcTemplateDef } from "./templates.defs";
import {
  TECH_ARCHITECTURE_SCHEMA,
  TECH_ARCHITECTURE_EMPTY,
  WEB_DIAGNOSIS_SCHEMA,
  WEB_DIAGNOSIS_EMPTY,
  ROI_SCHEMA,
  ROI_EMPTY,
  PAIN_SCHEMA,
  PAIN_EMPTY,
} from "./shared-sections.defs";
// Fuente única del default del cierre (canvas-defs.ts, sin dependencias — seguro para
// server y cliente): evita que este `empty` derive del literal sembrado y quede
// desincronizado (ej. si se agrega/edita un campo del CTA en un solo lugar).
import { DESARROLLO_CIERRE_DEFAULT } from "@/lib/canvas/canvas-defs";

const str = { type: "string" } as const;
const strArray = { type: "array", items: { type: "string" } } as const;
const asSchema = (s: unknown) => s as unknown as Record<string, unknown>;

export const DESARROLLO_SECTION_DEFS: BCSectionDef[] = [
  {
    key: "requerimiento",
    label: "Requerimiento técnico",
    eyebrow: "Desarrollo e integración",
    theme: "dark",
    backdrop: true,
    selfTitled: true,
    pinned: true,
    noHide: true,
    sectionType: "desarrollo_hero",
    agentGenerated: true,
    empty: { headline: "", subhead: "", tags: [] },
    agentHint: "Título técnico del requerimiento + una bajada de qué conecta con qué + chips de los sistemas.",
    brief:
      "Portada del requerimiento técnico. `headline`: patrón `Requerimiento técnico: [integración de HubSpot con [sistema]] / [migración desde [plataforma]] / [desarrollo a medida]` — sacá el nombre propio del sistema destino de la sección `desarrollo` del handoff (SAP, ERP, Aircall, e-commerce, Salesforce…). `subhead`: UNA frase, en lenguaje llano (que la entienda alguien no técnico), de qué conecta con qué y para qué (ej. 'Sincroniza los negocios cerrados en HubSpot con el ERP para facturar sin recaptura'). `tags`: 2-5 chips cortos de los sistemas/APIs/tipo (ej. 'HubSpot', 'SAP', 'API REST', 'Webhook', 'Migración'). Fuente: sección `desarrollo` del handoff + tags del proyecto. No inventes sistemas.",
    schema: { type: "object", properties: { headline: str, subhead: str, tags: strArray }, required: ["headline"] },
  },
  {
    key: "retos_cliente",
    label: "Qué duele hoy (y qué cuesta)",
    eyebrow: "El problema a resolver",
    theme: "light",
    sectionType: "web_diagnosis",
    agentGenerated: true,
    empty: WEB_DIAGNOSIS_EMPTY,
    agentHint: "Retos As-Is (cards de 1 línea, izq) + panel oscuro con las CONSECUENCIAS (bullets) + objetivo de la integración. Escueto.",
    brief:
      "Le da al desarrollador empatía con el negocio en un vistazo (lo entiende también alguien no técnico). Se rinde como cards de retos a la izquierda + un panel oscuro de consecuencias a la derecha + un objetivo abajo. `intro`: 1 frase de contexto (opcional). `retos`: el ESTADO ACTUAL (As-Is) — cada uno `title` = el problema en 3-6 palabras (ej. 'Recaptura manual a facturación'), `detail` = cómo operan hoy en 1 línea (ej. 'Ventas copia a mano los datos al ERP, cliente por cliente'). `plataforma`: rótulo del panel oscuro → poné exactamente `Lo que cuesta hoy`. `porQueBullets`: las CONSECUENCIAS del dolor — cada una `title` corto (ej. '~15 min por cliente') + `detail` de 1 línea (tiempo perdido, errores de dedo, datos fiscales erróneos, retraso en el cobro). `objetivo`: 1 frase de qué debe lograr la integración (la meta). Fuente: sección `desarrollo` + `dolor_principal` del handoff; si el handoff no describe el As-Is, marcá `⚠️ Por validar con Ventas/cliente` en vez de inventar.",
    schema: asSchema(WEB_DIAGNOSIS_SCHEMA),
  },
  {
    key: "criterios_exito",
    label: "Cómo sabremos que funcionó",
    eyebrow: "Definición de éxito",
    theme: "soft",
    sectionType: "roi",
    agentGenerated: true,
    empty: ROI_EMPTY,
    agentHint: "Hasta 4 métricas CUANTITATIVAS (value grande + label): rendimiento, calidad de datos, tolerancia a fallas.",
    brief:
      "Define de forma CUANTITATIVA y escaneable cómo se medirá el éxito — guía al QA. Se rinde como métricas grandes (número + qué mide), así que un no técnico también capta los umbrales. Hasta 4 `metrics`, cada una con `value` (el número/umbral CORTO: '<5 min', '0', '3×', '99.9%') y `label` (qué mide, 3-6 palabras). Cubrí tres frentes: RENDIMIENTO (value='<5 min', label='Negocio cerrado reflejado en el ERP'), CALIDAD DE DATOS (value='0', label='Registros duplicados creados en el ERP'), TOLERANCIA A FALLAS (value='3×', label='Reintentos ante error de red antes de alertar'). Proponé los umbrales como PROPUESTA técnica cuando el handoff no los traiga (nunca los presentes como un SLA ya acordado). Fuente: `expectativas` + sección `desarrollo`. Si no hay NADA de respaldo, dejá `metrics` vacío.",
    schema: asSchema(ROI_SCHEMA),
  },
  {
    key: "arquitectura",
    label: "Arquitectura: HubSpot ↔ sistema destino",
    eyebrow: "Cómo se conectan los sistemas",
    theme: "light",
    sectionType: "tech_architecture",
    agentGenerated: true,
    empty: TECH_ARCHITECTURE_EMPTY,
    agentHint: "CADENA del flujo entre sistemas (HubSpot → conector → destino), con los IDs y la clave de desduplicación en el `detalle` de cada paso.",
    brief:
      "La sección técnica MÁS crítica, presentada como una CADENA con flechas (cards con actor + qué pasa) para que se lea de un vistazo. `intro`: 1-2 frases con la idea central del flujo. `cadena` (3-5 pasos): cada uno `actor` (el sistema: 'HubSpot', 'Conector/Middleware', 'ERP', 'API REST'…), `titulo` de 3-6 palabras (qué hace ese paso) y `detalle` de 1 línea con el DETALLE TÉCNICO de identificación. Cubrí en los `detalle`: (1) que en HubSpot cada registro tiene un `hs_object_id` interno inmutable que se usa para PATCH/UPSERT; (2) que el ID del sistema destino se guarda en una propiedad personalizada de HubSpot configurada como Única (External ID, ej. `id_cliente_erp`); (3) la CLAVE DE DESDUPLICACIÓN por objeto — Contactos → email (HubSpot desduplica por correo por defecto), Empresas → dominio web o registro fiscal (RFC/NIT/NIF/RUT), Negocios → NO se desduplican solos, definí la regla. Dejá `fueraDeAlcance` y `opcionales` vacíos salvo que el handoff mencione algo explícito. Marcá con `⚠️ Por definir` cualquier propiedad/regla que el handoff no especifique — no inventes nombres de propiedades del cliente.",
    schema: asSchema(TECH_ARCHITECTURE_SCHEMA),
  },
  {
    key: "relacion_objetos",
    label: "Relación entre objetos",
    eyebrow: "Qué datos viajan y en qué cantidad",
    theme: "soft",
    sectionType: "tech_architecture",
    agentGenerated: true,
    empty: TECH_ARCHITECTURE_EMPTY,
    agentHint: "CADENA de objetos HubSpot (Contacto → Empresa → Negocio) con el mapeo al destino + la cardinalidad en el `detalle`.",
    brief:
      "Cómo viajan las ASOCIACIONES de HubSpot (un Contacto pertenece a una Empresa; una Empresa tiene varios Negocios) hacia un sistema destino más plano — presentado como cadena de objetos. `intro`: 1 frase. `cadena`: cada paso es un OBJETO — `actor` = el objeto HubSpot ('Contacto', 'Empresa', 'Negocio'), `titulo` = a qué equivale en el destino (ej. 'Cliente en el ERP'), `detalle` de 1 línea con el MAPEO + la CARDINALIDAD (ej. '1 Empresa ↔ 1 cliente en el ERP; sus Negocios se envían como cotizaciones' o '¿los 3 contactos de la empresa o solo el de compras? 1 Negocio = 1 factura?'). Dejá `fueraDeAlcance`/`opcionales` vacíos. Marcá `⚠️ Por definir con el cliente` las cardinalidades que el handoff no aclare. Fuente: sección `desarrollo` + `alcance_contratado`.",
    schema: asSchema(TECH_ARCHITECTURE_SCHEMA),
  },
  {
    key: "comunicacion",
    label: "Momentos de sincronización",
    eyebrow: "Cuándo se dispara cada flujo",
    theme: "light",
    sectionType: "pain",
    agentGenerated: true,
    empty: PAIN_EMPTY,
    agentHint: "Grid de tarjetas de disparadores: cada uno un evento (con ↑ Outbound / ↓ Inbound) + mecanismo + acción.",
    brief:
      "Los disparadores basados en eventos y la DIRECCIÓN del flujo, como tarjetas escaneables. Cada `item`: `title` = el momento con su dirección al inicio (↑ para OUTBOUND HubSpot→destino, ↓ para INBOUND destino→HubSpot; ej. '↑ Negocio pasa a Cerrado Ganado', '↓ Factura pagada en el ERP') y `detail` = mecanismo + acción en 1-2 frases (ej. 'Webhook de HubSpot (Workflow si hay licencia Pro/Enterprise) envía Negocio + Empresa + Contacto asociado' / 'La app llama a la API de HubSpot y mueve el Negocio a Facturado, marcando estado_de_pago = Pagado'). Listá todos los gatillos conversados; marcá `⚠️ Por definir` los mecanismos no confirmados. Fuente: sección `desarrollo` del handoff.",
    schema: asSchema(PAIN_SCHEMA),
  },
  {
    key: "cierre",
    label: "Notas de cierre",
    eyebrow: "Siguiente paso",
    theme: "dark",
    selfTitled: true,
    pinned: true,
    noHide: true,
    ctxDriven: true, // rinde su propia sección dark; además lee `data` (CTA), como el kickoff
    sectionType: "desarrollo_cta",
    agentGenerated: false, // CURADA: el CSE/arquitecto edita el cierre + botón (ej. link al repo o a la doc)
    empty: DESARROLLO_CIERRE_DEFAULT,
    agentHint: "",
    brief: "Cierre curado por el equipo: titular + subtítulo + botón opcional (ej. enlace al repo, a la documentación técnica o a agendar la sesión de arranque técnico con el dev).",
    schema: {
      type: "object",
      properties: { eyebrow: str, headline: str, subhead: str, buttonLabel: str, buttonUrl: str, buttonTarget: str },
    },
  },
];

/** Template del canvas Desarrollo para el agente tipado (`generateSectionsForTemplate`).
 *  El input es el handoff curado (sección `desarrollo` + alcance + deal), NO transcripts. */
export const DESARROLLO_TEMPLATE: BcTemplateDef = {
  id: "desarrollo_v1",
  caseLabel: "Requerimiento técnico",
  maxTokens: 12000, // secciones densas; generateSectionsForTemplate ABORTA si stop_reason === "max_tokens"
  features: { useCaseChecklist: false },
  agentIntro:
    "Eres Arquitecto de Integraciones de Smarteam y escribes el REQUERIMIENTO TÉCNICO que recibe el DESARROLLADOR para construir una integración / migración / desarrollo a medida sobre HubSpot. El documento tiene DOBLE audiencia: un desarrollador que necesita el detalle preciso, y un perfil no técnico (CSE/cliente) que debe entender de qué va la integración de un vistazo. Por eso el documento es VISUAL y ESCUETO: títulos claros, poco texto, cada dato en su lugar.\n\n" +
    "FUENTE ÚNICA: la sección `desarrollo` del handoff (veredicto + lo conversado), el alcance contratado y el deal del mensaje. No inventes NADA que no esté ahí.\n\n" +
    "DISCIPLINA ANTI-ALUCINACIÓN (dura): NUNCA inventes nombres de propiedades del cliente, IDs, volúmenes de datos, SLAs acordados ni sistemas. Cuando algo no esté confirmado en la fuente, escribilo igual pero marcado con `⚠️ Por validar con Ventas/cliente/dev` — un hueco marcado es correcto; un dato inventado es un error grave (el dev lo tomaría como verdad).\n\n" +
    "CONOCIMIENTO DE HubSpot que SÍ podés aplicar (son buenas prácticas de la plataforma, no datos del cliente): que el identificador interno es `hs_object_id` y sirve para PATCH/UPSERT; que un External ID se guarda en una propiedad personalizada configurada como Única; que HubSpot desduplica Contactos por email por defecto, Empresas por dominio, y que los Negocios NO se desduplican solos; que HubSpot emite eventos vía Webhooks/Workflows (Outbound) y recibe cambios vía su API REST (Inbound); que las asociaciones (Contacto↔Empresa↔Negocio) hay que mapearlas explícitamente a un destino más plano. Usá esto para PROPONER la arquitectura y dejar el esqueleto técnico listo, marcando como `⚠️ Por definir` lo específico del cliente.\n\n" +
    "FORMATO: cada sección tiene su PROPIO shape estructurado (lo indican su `schema` y su guía) — NO es prosa libre. Respetá los campos de cada sección: métricas cortas (número + qué mide), cadenas de pasos (actor + qué pasa + detalle de 1 línea), tarjetas (título + detalle breve), retos + consecuencias. Mantené los `detalle`/`label` en UNA línea; podés usar nombres de objetos/propiedades/endpoints entre backticks. Concreto y accionable — el dev tiene que poder empezar a construir con esto.\n\n" +
    "ESTO ES UN BORRADOR DE ARRANQUE (scaffold), no una spec final: da la estructura y las decisiones técnicas base; el desarrollador y el CSE lo refinan. Español, tuteo neutro. Si una sección no tiene NADA de respaldo en la fuente, dejá sus arrays vacíos — vacío es correcto, inventado no.",
  sections: DESARROLLO_SECTION_DEFS,
};

/** Lookup key → def (seed, agente, SectionTools). */
export const DESARROLLO_DEF_BY_KEY: Record<string, BCSectionDef> = Object.fromEntries(
  DESARROLLO_SECTION_DEFS.map((d) => [d.key, d]),
);

/**
 * ALLOWLIST de secciones del canvas Handoff que ve el agente de desarrollo como fuente.
 * A diferencia del kickoff (cliente-facing), acá el destinatario es interno/dev, así que
 * la fuente puede ser más amplia — pero mantenemos el foco en lo técnico + alcance.
 */
export const DESARROLLO_HANDOFF_KEYS = [
  "desarrollo",
  "alcance_contratado",
  "dolor_principal",
  "expectativas",
  "stakeholders_handoff",
] as const;
