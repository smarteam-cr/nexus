/**
 * lib/roles — documentos de puesto del equipo (perfiles y propuestas de
 * contratación, según `RoleProfile.docType`), documentados a mano y renderizados
 * como páginas web resumidas.
 *
 * ESCRIBIR es solo de dirección (`guardRolesAdmin` en toda la API); LEER no:
 * el filtro es `visibleRoleWhere` (./access) — SUPER_ADMIN ve todo, el resto solo
 * lo que le compartieron (`RoleProfileShare`), y el link público (`publicToken`)
 * abre una lectura sin login por `./public-view`. Por eso las lecturas de
 * `./queries` toman un `subject` y filtran con él: no asumas superficie cerrada —
 * llamarlas sin `subject` desde una superficie con sesión SALTA el filtro.
 *
 * La IA participa SOLO como propuesta (assist de documento,
 * POST /api/roles/[id]/assist — el humano revisa y aplica); el CRUD sigue plano.
 *
 * OJO (ARCHITECTURE §5/§8): `queries`/`mutations` son server-only (importan
 * Prisma). Los componentes cliente NO deben importar este barrel — usan la API
 * (`/api/roles`) y, para las labels de la plantilla, importan `./schema` directo
 * (client-safe).
 */
export * from "./schema";
export * from "./queries";
export * from "./mutations";
