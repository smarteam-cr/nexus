/**
 * lib/hubspot/project-properties.ts — QUÉ le pide Nexus al objeto Proyectos de HubSpot.
 *
 * Vivía dentro de `sync-projects.ts`, que arrastra el cliente de HubSpot y Prisma. Se extrajo
 * (2026-08-02) para que la sección de Documentación pueda mostrar la lista REAL sin importar
 * medio módulo de sincronización: acá no hay dependencias, así que lo puede leer cualquiera —
 * incluido un test y un componente.
 *
 * El punto de que esté acá y no copiada en la doc: la lista de propiedades cambia, y una copia
 * en prosa se vuelve mentira sin que nadie se entere. La doc lee ESTA constante.
 */

/**
 * Un `booleancheckbox` de HubSpot. Sin marcar llega como `null`, como `""` o directamente
 * ausente de la respuesta — nunca como `"false"` hasta que alguien lo marca y lo desmarca.
 * Los tres casos son "no", que es el default de negocio.
 *
 * Vive acá y no en el sync porque el espejo dejó de ser su único lector: el picker del alta
 * también necesita saber si un proyecto que ya existe está marcado interno, y este módulo es el
 * que puede importar cualquiera.
 */
export function parseCheckbox(v: string | null | undefined): boolean {
  return (v ?? "").trim().toLowerCase() === "true";
}

export const PROJECT_PROPERTIES = [
  "hs_name",
  "hs_status",
  "hs_object_id",
  "nombre_del_proyecto",
  "servicio_contratado",
  "estatus_del_proyecto",
  "tipo_de_servicio",
  "account_manager",
  // Para meta info del proyecto que se muestra en el GPS
  "hubspot_owner_id",
  "hs_createdate",
  "hs_pipeline",
  "hs_pipeline_stage",    // D.2: etapa actual del pipeline de CS (ancla del cronograma vivo)
  "proyecto_interno",     // booleancheckbox: proyecto de Smarteam para Smarteam (ver lib/projects/kind.ts)
  "csl_encargado",        // propiedad custom OWNER = CSE encargado (fuente de verdad de la asignación → visibilidad)
  // CS360 — dashboard de la CSL (internal names confirmados por discover-partner-clients.ts):
  "hs_priority",          // low | medium | high
  "motivo_de_bloqueo",    // enum radio 7 valores ("Cliente pidió pausa", "Atraso por Smarteam", …)
  "detalle_del_motivo_de_bloqueo", // texto libre "| Desarrollo"
  "detalle_del_motivo_de_bloqueo__implementaciones", // texto libre "| Implementaciones"
  "estado_de_adopcion",   // No iniciado | Bajo | Medio | Alto
] as const;

/**
 * Agrupación SOLO para mostrar en la documentación — no la consume el sync, que manda la lista
 * entera. Una propiedad que no esté en ningún grupo cae en "Otras" (ver `lib/manual/armar.ts`),
 * así que agregar una propiedad nunca la esconde.
 */
export const GRUPOS_DE_PROPIEDAD: { titulo: string; props: readonly string[] }[] = [
  {
    titulo: "Identidad del proyecto",
    props: ["hs_name", "hs_object_id", "nombre_del_proyecto", "servicio_contratado", "tipo_de_servicio"],
  },
  {
    titulo: "Estado y etapa",
    props: ["hs_status", "estatus_del_proyecto", "hs_pipeline", "hs_pipeline_stage", "hs_createdate"],
  },
  {
    titulo: "Quién lo lleva",
    props: ["hubspot_owner_id", "account_manager", "csl_encargado", "proyecto_interno"],
  },
  {
    titulo: "Seguimiento (CS360)",
    props: [
      "hs_priority",
      "motivo_de_bloqueo",
      "detalle_del_motivo_de_bloqueo",
      "detalle_del_motivo_de_bloqueo__implementaciones",
      "estado_de_adopcion",
    ],
  },
];
