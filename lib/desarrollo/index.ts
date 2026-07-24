/**
 * lib/desarrollo — módulo del canvas "Desarrollo" (requerimiento técnico).
 *
 * Hoy cubre la ESTIMACIÓN de esfuerzo del equipo técnico (`DevEstimate`): el dato que el
 * documento muestra pero NO guarda (la sección `estimacion` es `ctxDriven` y lo lee de acá).
 * El contenido del requerimiento en sí vive en `CanvasBlock` y lo genera `lib/canvas/desarrollo-generate`.
 *
 * Superficie pública del módulo (ARCHITECTURE §5: nadie importa los archivos internos).
 */
export { loadDevEstimate, type DevEstimateDTO, type DevEstimateState } from "./queries";
export { addDevEstimate } from "./mutations";
export { devEstimateCreateSchema, type DevEstimateCreateInput } from "./schema";
