// ⚠⚠ BORRAR EL 2026-08-04 ⚠⚠
//
// Este archivo existe SOLO para mantener viva la URL vieja de la propuesta del CSL
// (`/external/propuesta/csl`), que ya se envió y puede estar guardada en algún lado.
// Es un puente de 5 días, pedido explícitamente por Elías.
//
// Qué se borra ese día: este archivo Y `app/external/propuesta/csl/`. Nada más depende
// de esto — la propuesta vive como una fila de RoleProfile con su propio link por token.
/**
 * El id EXPLÍCITO con el que el seed creó la fila. `RoleProfile.id` es un cuid por
 * default, pero acepta un id dado: eso hace el seed idempotente y le da a la página vieja
 * un ancla determinista. Buscar por título sería frágil — el título se edita desde la UI.
 */
export const PROPUESTA_CSL_ID = "propuesta-csl-v1";
