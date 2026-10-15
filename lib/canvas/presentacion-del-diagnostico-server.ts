/**
 * lib/canvas/presentacion-del-diagnostico-server.ts — lo que la lectura de cada reunión necesita del diagnóstico: si
 * todavía no se presentó (para buscar la fecha en la reunión) y guardar la fecha que leyó. SERVIDOR.
 *
 * Desde el 2026-10-14 la pregunta de cuándo se presenta es de los cuatro documentos y vive en lib/presentaciones; esto
 * queda como la puerta que ya usan sessions/post-process.ts y post-process-viejo.ts.
 */
import "server-only";

export { diagnosticoSinPresentar, proponerFechaDesdeReunion } from "@/lib/presentaciones/servidor";
