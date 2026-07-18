/**
 * lib/roles — perfiles de puesto del equipo (roles y responsabilidades),
 * documentados a mano y renderizados como páginas web resumidas. Superficie
 * SOLO SUPER_ADMIN. Sin IA.
 *
 * OJO (ARCHITECTURE §5/§8): `queries`/`mutations` son server-only (importan
 * Prisma). Los componentes cliente NO deben importar este barrel — usan la API
 * (`/api/roles`) y, para las labels de la plantilla, importan `./schema` directo
 * (client-safe).
 */
export * from "./schema";
export * from "./queries";
export * from "./mutations";
