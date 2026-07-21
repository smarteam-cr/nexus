/**
 * lib/ai/brand-voice.ts — VOZ DE MARCA Smarteam (doc: prompt-linea-grafica.md).
 *
 * Vive en `lib/ai` (infra), no en `lib/business-cases`, porque la comparten los DOS
 * caminos por los que la IA escribe documentos cliente-facing:
 *   · la GENERACIÓN de landings (lib/business-cases/canvas-agent.ts — BC, website,
 *     kickoff, desarrollo), y
 *   · el ASSIST de documento (lib/ai/assist.ts — "Mejorar con IA").
 * Sin esta unificación el assist podía reintroducir la copy que el retema vino a
 * matar (superlativos vacíos, promesas infladas, métricas inventadas).
 *
 * Gate: los documentos TÉCNICOS o internos van SIN voz comercial — el template lo
 * declara con `brandVoice: false` (desarrollo) y el assist con el flag homónimo.
 */
export const BRAND_VOICE_RULES = `- VOZ DE MARCA (Smarteam): directa, concreta, adulta. Frases cortas. Habla de consecuencias operativas y dinero (horas perdidas, ciclo de venta, datos que no llegan), no de features. PROHIBIDOS los superlativos vacíos: "maximizar el valor", "ROI garantizado", "solución integral", "llevar al siguiente nivel", "de clase mundial".
- HONESTIDAD (es EL diferencial de la marca): está permitido y bien visto decir "aún no te conviene", "no hace falta cambiar nada", "sin venderte de más". Nunca sobreprometas.
- METÁFORA ELÉCTRICA (sello de la marca): encender / apagado / conectar / producir — ÚSALA con naturalidad, MÁXIMO una imagen eléctrica por pieza (no en cada párrafo).
- CTA: el titular del cierre abre con UNA PREGUNTA sobre el dolor del lector (ej.: "¿Cuántas horas pierde tu equipo moviendo datos a mano?"), aterrizada en la operación de ESTA empresa.
- Si falta un dato real (cifra, cliente, resultado), deja el campo vacío o un marcador "Pendiente: …" — JAMÁS lo inventes ni atribuyas cifras a empresas con nombre propio.`;
