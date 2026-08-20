/**
 * lib/auth/permissions/registry.ts — REGISTRY de secciones × acciones. CLIENT-SAFE.
 *
 * Fuente ÚNICA de qué secciones y acciones existen en el sistema de permisos
 * (patrón TAG_CATALOG). Agregar un módulo nuevo (finanzas, pagos, …) = 1 entrada
 * acá → aparece solo en el modal de permisos de /team y el engine lo respeta.
 *
 * `enforced: false` = la acción está declarada pero ningún guard la consulta
 * TODAVÍA → el modal la oculta (nunca un switch mentiroso). Se flipea cuando el
 * enforcement real queda cableado (F5: generate/regenerate de IA; F6: sidebar,
 * áreas de lectura, deudas).
 *
 * Fuera a propósito:
 *   - Sesiones (universal para todo interno — no hay nada que gatear).
 *   - Customer Success: SEPARADO el 2026-08-16 (era `clientes.viewAll` vía compat). Ver la
 *     sección `customerSuccess` abajo, y su motivo.
 *   - El row-level (QUÉ clientes ve alguien) vive en lib/auth/access.ts.
 */
import type { ActionDef, PermissionMap, SectionDef } from "./types";

// Labels de acciones repetidas (generación de artefactos con IA). enforced:true
// desde PERM-F5: las gatean resolveArtifactGate (analyze) y timeline/assist.
// OJO: `as const satisfies` (no anotación directa) para que `key` quede como
// literal — la anotación ensancharía a string y rompería ActionKeyOf/PermissionCell.
const GENERATE = { key: "generate", label: "Generar con IA (primera vez)", enforced: true } as const satisfies ActionDef;
const REGENERATE = { key: "regenerate", label: "Regenerar con IA", enforced: true } as const satisfies ActionDef;

export const PERMISSION_SECTIONS = [
  {
    key: "clientes",
    label: "Clientes",
    actions: [
      { key: "viewAll", label: "Ver todos los clientes", enforced: true },
      { key: "share", label: "Compartir clientes", enforced: true },
      { key: "delete", label: "Eliminar clientes", enforced: true },
      // Decir QUÉ ES una empresa (cliente / prospecto / aliado / interno). Solo lo
      // necesita quien ve la cartera completa: es ahí donde se nota que una fila no
      // es un cliente. Ver lib/clients/kind.ts.
      { key: "classify", label: "Clasificar empresas (cliente/prospecto/aliado/interno)", enforced: true },
    ],
  },
  {
    key: "handoff",
    label: "Handoff",
    actions: [
      { key: "create", label: "Crear handoff", enforced: true },
      { key: "write", label: "Editar handoff", enforced: true },
      GENERATE,
      REGENERATE,
    ],
  },
  {
    key: "kickoff",
    label: "Kickoff",
    actions: [GENERATE, REGENERATE],
  },
  {
    key: "desarrollo",
    label: "Desarrollo (requerimiento técnico)",
    actions: [
      GENERATE,
      REGENERATE,
      // La estimación de esfuerzo la escribe el EQUIPO TÉCNICO tras leer el requerimiento,
      // no cualquiera que pueda ver el documento. Es una celda de la matriz (no un whitelist
      // de roles en código) justamente para que sumar un perfil técnico nuevo sea prender un
      // switch en /team, sin deploy.
      { key: "estimate", label: "Estimar esfuerzo (horas/fecha)", enforced: true },
    ],
  },
  {
    key: "exploracion",
    label: "Exploración (descubrimiento del negocio)",
    actions: [GENERATE, REGENERATE],
  },
  {
    key: "implementacion",
    label: "Implementación (guía de construcción)",
    actions: [GENERATE, { key: "regenerate", label: "Regenerar con IA", enforced: true }],
  },
  {
    key: "entrega",
    label: "Entrega (documento de cierre)",
    actions: [GENERATE, { key: "regenerate", label: "Regenerar con IA", enforced: true }],
  },
  {
    key: "planificacion",
    label: "Planificación",
    actions: [GENERATE, { key: "regenerate", label: "Regenerar con IA", enforced: true }],
  },
  {
    key: "diagnostico",
    label: "Diagnóstico",
    actions: [GENERATE, { key: "regenerate", label: "Regenerar con IA", enforced: true }],
  },
  {
    key: "procesos",
    label: "Procesos",
    actions: [
      GENERATE,
      REGENERATE,
      { key: "manage", label: "Administrar implementaciones", enforced: true },
    ],
  },
  {
    key: "cronograma",
    label: "Cronograma",
    actions: [
      { key: "write", label: "Editar (tareas, fases, fechas)", enforced: true },
      { key: "delete", label: "Borrar tareas y fases", enforced: true },
      GENERATE,
      { key: "regenerate", label: "Regenerar con IA", enforced: true },
      // SUGERIR ≠ ESCRIBIR: quien tiene esta celda propone una particularidad que el CSE
      // revisa y recién entonces se vuelve real. Existe para que el equipo técnico (que ve
      // los atrasos y las pruebas de conectividad) tenga canal SIN poder tocar el cronograma.
      { key: "suggest", label: "Sugerir particularidades (sin aplicarlas)", enforced: true },
    ],
  },
  {
    // EL ASISTENTE QUE CONVERSA (2026-08-19). Es una superficie NUEVA: el CSE le pide un
    // cambio hablando y el asistente responde qué se puede, qué cuesta y qué fecha mueve.
    //
    // ⛔ `aplicar` nace declarada y NO enforced a propósito, para no hacer DOS migraciones de
    // permisos: hoy el chat no aplica nada (emite una instrucción que el editor de siempre
    // ejecuta con su propia celda). Cuando el botón de aplicar exista, esta celda se flipea y
    // ⛔ se chequea JUNTO con la del documento (`cronograma.write` / la de la pieza): el chat
    // nunca puede otorgar más de lo que la persona ya tenía parada en el canvas.
    key: "asistente",
    label: "Asistente (chat sobre un documento)",
    actions: [
      { key: "read", label: "Conversar con el asistente", enforced: true },
      { key: "aplicar", label: "Aplicar lo acordado en el chat", enforced: false },
    ],
  },
  {
    // El PROYECTO como contenedor, no su contenido. Las celdas por pieza (kickoff,
    // desarrollo, exploración…) gobiernan generar y regenerar con IA; ninguna cubría
    // borrar el canvas entero, que hasta 2026-07-24 solo pedía acceso al cliente.
    // O sea: borrar UNA tarea del cronograma exigía capacidad, y borrar el canvas que
    // la contiene no exigía nada. Esta sección cierra esa asimetría.
    key: "proyectos",
    label: "Proyectos (estructura)",
    actions: [
      {
        // Dar de alta un proyecto (Tanda C). Es celda PROPIA y no reusa `handoff.create`
        // a propósito: arrancar un proyecto y redactar su documento de handoff son dos
        // cosas distintas. Hoy los líderes de CS pueden editar, generar y regenerar un
        // handoff pero no pueden arrancar un proyecto — una asimetría que existía solo
        // porque el único botón de alta vivía adentro del asistente de handoff.
        key: "create",
        label: "Dar de alta un proyecto",
        enforced: true,
      },
      {
        key: "deleteCanvas",
        label: "Eliminar un canvas del proyecto",
        enforced: true,
      },
      {
        /* Marcar o desmarcar "interno" DESPUÉS del alta. Celda propia y no `create` porque son
           dos momentos distintos: dar de alta es una decisión de arranque; esto cambia si un
           proyecto que ya está andando FACTURA o no. Quien puede crear no necesariamente debería
           poder sacar de cobranza algo que ya está en marcha. */
        key: "marcarInterno",
        label: "Marcar un proyecto como interno",
        enforced: true,
      },
      {
        /* Aceptar una sugerencia de Nexus sobre el ESTADO o la ETAPA del proyecto y mandarla a
           HubSpot. Celda propia y no `marcarInterno` porque el peso es otro: interno saca de
           cobranza (plata), esto mueve la tarjeta de columna y el semáforo que mira todo el
           equipo. Y va al CSE —que `marcarInterno` no tiene— porque es quien sabe cómo va el
           proyecto: si mantener el tablero al día exigiera al liderazgo, el tablero seguiría
           viejo, que es exactamente el problema que esto viene a resolver. */
        key: "cambiarEstadoHubspot",
        label: "Cambiar el estado y la etapa del proyecto en HubSpot",
        enforced: true,
      },
    ],
  },
  {
    /* ── ÉXITO DEL CLIENTE ─────────────────────────────────────────────────
       Hasta 2026-08-16 esta área no tenía celda propia: cabalgaba sobre
       `clientes.viewAll` vía el compat de `seeAllClients`, y la cabecera de este
       archivo ya anticipaba que separarlas sería «1 entrada nueva acá».

       POR QUÉ SE SEPARA AHORA. Ver todos los clientes y hacer éxito del cliente
       son dos cosas distintas, y atarlas dejaba al CSE —que ES quien hace éxito
       del cliente— fuera de su propia pantalla, mientras Ventas, Desarrollo y
       Marketing entraban por ser roles «que ven todo». Al revés de lo que hace
       falta.

       ⚠ ESTO NO ES «VER TODOS LOS CLIENTES». El row-level sigue viviendo aparte
       (`lib/auth/access.ts`): un CSE con esta celda ve el área acotada a SUS
       clientes, porque `accessibleClientWhere` se aplica igual. Y los datos de
       partner (uso, UUS, MRR) siguen siendo de CSL y SUPER_ADMIN por su propio
       chequeo de rol en la página — esta celda no los destraba. */
    key: "customerSuccess",
    label: "Éxito del cliente",
    actions: [
      { key: "read", label: "Acceder al área de Éxito del cliente", enforced: true },
    ],
  },
  {
    key: "ventas",
    label: "Ventas / Propuestas comerciales",
    actions: [
      { key: "read", label: "Acceder al área", enforced: true },
      // enforced desde 2026-07-24: su primer guard real es el TAM del cliente
      // (PATCH /api/clients/[id]/classification). El área de Ventas es quien
      // estima cuánto vale una cuenta; el resto la ve pero no la escribe.
      { key: "write", label: "Editar (incluye el TAM de un cliente)", enforced: true },
    ],
  },
  {
    key: "marketing",
    label: "Marketing y Contenido",
    actions: [
      { key: "read", label: "Acceder al área", enforced: false },
      { key: "write", label: "Editar (insumos, ingesta, aprobar)", enforced: true },
    ],
  },
  {
    key: "cobranza",
    label: "Cobranza",
    actions: [
      { key: "read", label: "Acceder al módulo", enforced: true },
      { key: "write", label: "Editar", enforced: false },
    ],
  },
  {
    key: "conocimientos",
    label: "Conocimientos",
    actions: [{ key: "write", label: "Editar documentos", enforced: true }],
  },
  {
    key: "equipo",
    label: "Equipo",
    actions: [{ key: "manage", label: "Gestionar equipo y permisos", enforced: true }],
  },
  {
    key: "agentes",
    label: "Agentes",
    actions: [
      { key: "read", label: "Ver catálogo", enforced: true },
      { key: "manage", label: "Administrar agentes", enforced: true },
    ],
  },
  {
    key: "auditoria",
    label: "Auditoría",
    actions: [
      { key: "read", label: "Ver auditorías", enforced: true },
      { key: "delete", label: "Eliminar registros", enforced: true },
    ],
  },
  {
    key: "configuracion",
    label: "Configuración",
    actions: [
      { key: "read", label: "Acceder", enforced: true },
      { key: "manage", label: "Administrar configuración", enforced: true },
    ],
  },
] as const satisfies readonly SectionDef[];

/** Claves de sección válidas (derivadas del registry — compile-time). */
export type SectionKey = (typeof PERMISSION_SECTIONS)[number]["key"];

/** Claves de acción válidas PARA una sección dada (compile-time). */
export type ActionKeyOf<S extends SectionKey> = Extract<
  (typeof PERMISSION_SECTIONS)[number],
  { key: S }
>["actions"][number]["key"];

/** Una celda válida de la matriz — par sección/acción correlacionado. */
export type PermissionCell = {
  [S in SectionKey]: { section: S; action: ActionKeyOf<S> };
}[SectionKey];

const SECTION_BY_KEY = new Map(PERMISSION_SECTIONS.map((s) => [s.key as string, s]));

/** Def de la sección, o undefined si la clave no existe en el registry. */
export function sectionByKey(key: string): SectionDef | undefined {
  return SECTION_BY_KEY.get(key);
}

/** ¿La celda sección/acción existe en el registry? (para validación runtime) */
export function isKnownCell(section: string, action: string): boolean {
  return !!SECTION_BY_KEY.get(section)?.actions.some((a) => a.key === action);
}

/** Mapa COMPLETO con toda celda del registry en el valor dado. */
export function uniformMap(value: boolean): PermissionMap {
  const sections: PermissionMap["sections"] = {};
  for (const s of PERMISSION_SECTIONS) {
    sections[s.key] = {};
    for (const a of s.actions) sections[s.key][a.key] = value;
  }
  return { v: 1, sections };
}

/** Mapa all-true — lo que ve un SUPER_ADMIN (hardcodeado, anti-lockout). */
export function allTrueMap(): PermissionMap {
  return uniformMap(true);
}
