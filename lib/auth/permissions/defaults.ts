/**
 * lib/auth/permissions/defaults.ts — DEFAULT_MATRIX + merge de precedencia. CLIENT-SAFE, puro.
 *
 * DEFAULT_MATRIX = el comportamiento ACTUAL EXACTO del sistema, celda por celda,
 * derivado de: la matriz CAPABILITIES histórica (lib/auth/roles.ts), las 3
 * whitelists de área (sales/marketing/cobranza-roles.ts), los arrays del Sidebar
 * y los withRole(SUPER_ADMIN) sueltos. Es el FALLBACK de código: con la tabla
 * RolePermission vacía o inválida, el sistema se comporta idéntico a siempre
 * (deploy-safe). El test de compat congela esta equivalencia.
 *
 * OJO: el delta operativo pedido por el usuario (DEV a solo-lectura en
 * handoff/kickoff/cronograma/procesos) NO vive acá — vive en la SEMILLA de la
 * DB (scripts/seed-role-permissions.ts). El default de código es compat exacta.
 *
 * ÚNICA DESVIACIÓN de "compat exacta" (2026-07-24): `proyectos.deleteCanvas` nace
 * apagado para todos salvo CSL. Antes ese borrado solo pedía acceso al cliente, así
 * que la compat literal sería darlo a los 7 roles. Se decidió restringirlo, y es
 * gratis: el endpoint NO tiene ningún llamador en la aplicación — no hay botón que
 * deje de funcionar. Va en el default de código y no en la semilla justamente para
 * que no haya que acordarse de aplicarlo en ningún entorno.
 *
 * Precedencia (computeEffective): DEFAULT_MATRIX[rol] ← plantilla del rol (DB)
 * ← overrides del usuario (sparse). SUPER_ADMIN = all-true SIEMPRE (anti-lockout:
 * ni la DB ni los overrides pueden recortarlo). Rol desconocido en runtime
 * (client Prisma viejo vs DB nueva) → all-false, defensivo.
 */
import type { TeamRole } from "@prisma/client";
import type { PermissionMap } from "./types";
import {
  PERMISSION_SECTIONS,
  allTrueMap,
  uniformMap,
  type ActionKeyOf,
  type SectionKey,
} from "./registry";

/** Acciones CONCEDIDAS por sección (las ausentes quedan en false). */
type Grants = { [S in SectionKey]?: readonly ActionKeyOf<S>[] };

/** Construye un mapa COMPLETO (toda celda explícita) desde la lista de concedidas. */
function grant(grants: Grants): PermissionMap {
  const map = uniformMap(false);
  for (const [section, actions] of Object.entries(grants) as [SectionKey, readonly string[]][]) {
    for (const action of actions) map.sections[section][action] = true;
  }
  return map;
}

export const DEFAULT_MATRIX: Record<TeamRole, PermissionMap> = {
  // CSE (scoped): edita el cronograma pero NO borra (suspende); genera kickoff/
  // procesos/cronograma en SUS clientes (el row-level lo acota access.ts);
  // NADA de handoff; lee Marketing (área universal).
  CSE: grant({
    kickoff: ["generate", "regenerate"],
    desarrollo: ["generate", "regenerate"],
    exploracion: ["generate", "regenerate"],
    diagnostico: ["generate", "regenerate"],
    planificacion: ["generate", "regenerate"],
    implementacion: ["generate", "regenerate"],
    entrega: ["generate", "regenerate"],
    procesos: ["generate", "regenerate"],
    cronograma: ["write", "generate"],
    /* PRIMERA celda de `proyectos` que toca el CSE, y es deliberado: mantener al día el estado y
       la etapa en HubSpot es su trabajo, no del liderazgo. Si exigiera CSL, el tablero seguiría
       viejo — que es el problema que esto viene a resolver. No le abre `create`, `deleteCanvas`
       ni `marcarInterno`: ésas siguen donde estaban. */
    proyectos: ["cambiarEstadoHubspot"],
    /* El CSE ES quien hace éxito del cliente, y hasta 2026-08-16 era el único rol operativo que
       NO podía entrar a su propia pantalla: el área colgaba de `clientes.viewAll`, que él no
       tiene. El row-level lo sigue acotando a SUS clientes, y los datos de partner siguen siendo
       de CSL/SUPER_ADMIN por su chequeo propio. */
    customerSuccess: ["read"],
    marketing: ["read"],
  }),
  // VENTAS: ve todo + handoff completo + cronograma (sin regenerar IA) + área
  // de Ventas + auditorías + agentes + conocimientos.
  VENTAS: grant({
    // `classify` va a los MISMOS roles que `viewAll`: quien ve la cartera entera es
    // quien nota que una fila no es un cliente (un aliado, nosotros mismos). Un CSE
    // scoped no ve el listado completo, así que no tiene con qué comparar.
    clientes: ["viewAll", "classify"],
    // Conserva lo que ya tenía: hasta 2026-08-16 entraba al área por `clientes.viewAll`.
    customerSuccess: ["read"],
    handoff: ["create", "write", "generate", "regenerate"],
    kickoff: ["generate", "regenerate"],
    desarrollo: ["generate", "regenerate"],
    exploracion: ["generate", "regenerate"],
    diagnostico: ["generate", "regenerate"],
    planificacion: ["generate", "regenerate"],
    implementacion: ["generate", "regenerate"],
    entrega: ["generate", "regenerate"],
    procesos: ["generate", "regenerate"],
    cronograma: ["write", "delete", "generate"],
    // Dar de alta un proyecto (Tanda C). Ventas ya lo hacía: el único botón de alta
    // vivía adentro del asistente de handoff, que exige `handoff.create`. La celda
    // propia no le amplía nada — le pone nombre a lo que ya podía.
    proyectos: ["create"],
    ventas: ["read", "write"],
    marketing: ["read"],
    conocimientos: ["write"],
    agentes: ["read"],
    auditoria: ["read"],
  }),
  // DEV ≡ VENTAS en el DEFAULT (invariante histórica del rol). El recorte a
  // solo-lectura pedido por el usuario va en la SEMILLA, no acá.
  DEV: grant({
    clientes: ["viewAll", "classify"],
    // Conserva lo que ya tenía: hasta 2026-08-16 entraba al área por `clientes.viewAll`.
    customerSuccess: ["read"],
    handoff: ["create", "write", "generate", "regenerate"],
    kickoff: ["generate", "regenerate"],
    // `estimate` es de DEV y de nadie más en el default: la estimación de esfuerzo la
    // escribe el equipo técnico tras leer el requerimiento (SUPER_ADMIN la tiene por el
    // all-true hardcodeado). Se le puede prender a otro rol desde /team.
    desarrollo: ["generate", "regenerate", "estimate"],
    exploracion: ["generate", "regenerate"],
    diagnostico: ["generate", "regenerate"],
    planificacion: ["generate", "regenerate"],
    implementacion: ["generate", "regenerate"],
    entrega: ["generate", "regenerate"],
    procesos: ["generate", "regenerate"],
    // `suggest` es redundante para DEV mientras tenga `write` (quien puede escribir puede
    // sugerir), pero se declara igual: si mañana se le recorta el write —que es el recorte
    // que ya se pidió y vive en la semilla, no en el default— el canal de sugerencias
    // tiene que sobrevivir. Es la razón de ser de la celda.
    cronograma: ["write", "delete", "generate", "suggest"],
    // Igual que Ventas: DEV ya daba de alta por el asistente de handoff. Además es
    // el rol que arranca los proyectos de Desarrollo y de Sitios web, que con la
    // arquitectura multi-pipeline son altas de pleno derecho, no anexos de una
    // implementación.
    proyectos: ["create"],
    ventas: ["read", "write"],
    marketing: ["read"],
    conocimientos: ["write"],
    agentes: ["read"],
    auditoria: ["read"],
  }),
  // CSL: como super admin salvo gestión de equipo/administraciones; único rol
  // (junto a SA) que REGENERA el cronograma con IA y borra clientes.
  CSL: grant({
    clientes: ["viewAll", "share", "delete", "classify"],
    // El área es SU centro de decisión; además es el único rol (con SUPER_ADMIN) que ve partner.
    customerSuccess: ["read"],
    handoff: ["write", "generate", "regenerate"],
    kickoff: ["generate", "regenerate"],
    desarrollo: ["generate", "regenerate"],
    exploracion: ["generate", "regenerate"],
    diagnostico: ["generate", "regenerate"],
    planificacion: ["generate", "regenerate"],
    implementacion: ["generate", "regenerate"],
    entrega: ["generate", "regenerate"],
    procesos: ["generate", "regenerate"],
    cronograma: ["write", "delete", "generate", "regenerate"],
    // `deleteCanvas`: único rol operativo (fuera de SUPER_ADMIN) que puede borrar un
    // canvas entero. Misma doctrina que `cronograma.delete`: el CSE suspende, el líder borra.
    //
    // `create` es la ÚNICA ampliación real de la Tanda C: hasta hoy un líder de CS podía
    // editar, generar y regenerar un handoff pero no arrancar el proyecto que lo contiene,
    // porque el botón de alta vivía adentro del asistente de Ventas. Se resuelve con esta
    // celda y NO tocando `handoff.create` — son dos cosas distintas, y mezclarlas obligaría
    // a romper las tablas congeladas de roles.
    /* `marcarInterno` va SOLO acá, junto a `deleteCanvas`, y no con los que pueden crear:
       dar de alta es una decisión de arranque, pero sacar de cobranza un proyecto que ya está
       andando cambia la plata de algo en marcha. Mismo peso que borrarle un canvas. */
    proyectos: ["create", "deleteCanvas", "marcarInterno", "cambiarEstadoHubspot"],
    ventas: ["read", "write"],
    marketing: ["read", "write"],
    conocimientos: ["write"],
    agentes: ["read"],
    auditoria: ["read"],
    configuracion: ["read"],
  }),
  // MARKETING: ≈ CSL pero sin borrar clientes, sin regenerar cronograma, sin
  // área de Ventas ni auditorías; editor del área de Marketing.
  MARKETING: grant({
    clientes: ["viewAll", "share", "classify"],
    // Conserva lo que ya tenía: hasta 2026-08-16 entraba al área por `clientes.viewAll`.
    customerSuccess: ["read"],
    handoff: ["write", "generate", "regenerate"],
    kickoff: ["generate", "regenerate"],
    desarrollo: ["generate", "regenerate"],
    exploracion: ["generate", "regenerate"],
    diagnostico: ["generate", "regenerate"],
    planificacion: ["generate", "regenerate"],
    implementacion: ["generate", "regenerate"],
    entrega: ["generate", "regenerate"],
    procesos: ["generate", "regenerate"],
    cronograma: ["write", "delete", "generate"],
    marketing: ["read", "write"],
    conocimientos: ["write"],
    agentes: ["read"],
    configuracion: ["read"],
  }),
  // ADMIN (asistente administrativo, Finanzas): SOLO Cobranza + lectura de
  // Marketing (área universal). Cero acceso a clientes/artefactos.
  ADMIN: grant({
    marketing: ["read"],
    cobranza: ["read", "write"],
  }),
  // SUPER_ADMIN: all-true. El engine ni siquiera consulta esta fila (hardcodea
  // allTrueMap), pero se declara completa para hasCapability/capabilitiesFor sync.
  SUPER_ADMIN: allTrueMap(),
};

/**
 * Resuelve el mapa EFECTIVO de un rol: DEFAULT ← plantilla (DB) ← overrides.
 * Puro (testeable sin DB) — el engine le acerca las capas ya parseadas.
 * Solo celdas CONOCIDAS por el registry pisan el default (forward-compat:
 * cuando el registry crece, las claves nuevas caen al default de código).
 */
export function computeEffective(
  role: TeamRole,
  template: PermissionMap | null,
  overrides: PermissionMap | null,
): PermissionMap {
  // Anti-lockout: SUPER_ADMIN es all-true SIEMPRE, antes de mirar DB/overrides.
  if (role === "SUPER_ADMIN") return allTrueMap();

  const base = DEFAULT_MATRIX[role];
  // Rol desconocido (enum viejo en el client vs DB nueva) → sin permisos.
  const effective = base ? structuredClone(base) : uniformMap(false);
  if (!base) return effective;

  for (const layer of [template, overrides]) {
    if (!layer) continue;
    for (const s of PERMISSION_SECTIONS) {
      const layerSection = layer.sections?.[s.key];
      if (!layerSection) continue;
      for (const a of s.actions) {
        const v = layerSection[a.key];
        if (typeof v === "boolean") effective.sections[s.key][a.key] = v;
      }
    }
  }
  return effective;
}
