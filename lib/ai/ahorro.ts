/**
 * lib/ai/ahorro.ts — LAS PALANCAS PARA GASTAR MENOS EN CLAUDE, EN UN SOLO LUGAR (2026-10-18).
 *
 * Cada palanca es una constante: para volver atrás se cambia ESA línea y se despliega. Ninguna toca un prompt guardado
 * en la base ni pide SQL para revertirse. Cada una dice qué ahorra (medido sobre lo gastado del 17-sep al 17-oct) y
 * qué riesgo tiene. El panel /integrations/gasto-ia › «Proyección» usa las mismas fracciones para estimar lo que ahorran.
 *
 * ⛔ Antes de cambiar el MODELO de un agente, una comparación en simulacro (un script como
 * scripts/comparar-modelo-del-clasificador.ts) y la decisión de una persona. Nunca con Wherex.
 */

/**
 * La lectura de cada reunión y la de sus hechos comparten el prefijo cacheado: la reunión va en el `system` con
 * `cache_control` y las dos herramientas en `tools`, así los hechos leen la reunión a 0,1 en vez de pagarla entera.
 * Solo actúa con los hechos prendidos (SEGUIMIENTO_HECHOS=1 y su SQL): apagados, la lectura queda como siempre y no
 * paga el recargo de escribir una caché que nadie lee. Ahorro: ~0,02 US$ por reunión (~35 % de los hechos). Riesgo: la
 * lectura pasa a leer la conversación comprimida (la misma que leen los hechos) en vez de la transcripción cruda; lo
 * compara `scripts/comparar-lectura-de-reuniones.ts --prefijo`. `false` vuelve al pedido de antes.
 */
export const LECTURA_Y_HECHOS_COMPARTEN_PREFIJO = true;

/**
 * El modelo del clasificador de reuniones a proyectos (lib/sessions/classify-session-project.ts): 365 llamadas y
 * US$8,47 en 30 días con Sonnet 4.6. Con Haiku 4.5 costaría un tercio (~US$5,6 menos por mes). ⚠ Sigue en Sonnet hasta
 * que una persona mire `scripts/comparar-modelo-del-clasificador.ts`: el clasificador decide a qué proyecto va cada
 * reunión, y un error ahí lo heredan el handoff y el cronograma. Para cambiarlo: esta línea.
 */
export const MODELO_DEL_CLASIFICADOR: "claude-sonnet-4-6" | "claude-haiku-4-5-20251001" = "claude-sonnet-4-6";

/**
 * El vigía manda su prompt (~2.000 tokens, igual para todos los proyectos) con `cache_control`: en el barrido diario, el
 * primero lo escribe y los demás lo leen a 0,1. Riesgo: ninguno sobre la respuesta (la caché no cambia lo que lee el
 * modelo). `false` vuelve al `system` sin caché.
 */
export const VIGIA_CACHEA_EL_PROMPT = true;

/**
 * El barrido del vigía no vuelve a triar un proyecto cuyos motivos de riesgo son los mismos que la última vez que se
 * trió y no dejó alerta, si pasaron menos de `DIAS_PARA_VOLVER_A_TRIAR`. Lo nuevo (eventos del cronograma, riesgos de
 * una reunión) entra siempre. Riesgo: un cambio que no cambia los motivos (otro correo del mismo tema) espera hasta el
 * plazo. `false` vuelve a triarlos cada día.
 */
export const VIGIA_NO_REPITE_SIN_CAMBIOS = true;
export const DIAS_PARA_VOLVER_A_TRIAR = 7;

/**
 * El barrido diario del vigía manda por la API Batch (la mitad del precio) los proyectos que entran solo por un riesgo
 * persistente, sin eventos ni riesgos nuevos de una reunión: nadie espera esa respuesta. Lo que llega por un cambio
 * sigue en el momento. La respuesta llega en minutos u horas (lib/ai/lotes-server.ts, job «ia-lotes»). Riesgo: la alerta
 * aparece más tarde ese día. `false` los vuelve a triar en el momento.
 */
export const VIGIA_BARRIDO_POR_LOTE = true;
