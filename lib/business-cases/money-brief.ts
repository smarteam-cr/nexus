/**
 * lib/business-cases/money-brief.ts — la regla de DINERO de la propuesta comercial.
 *
 * Vive suelta y no dentro del preámbulo de `generate/route.ts` por dos razones: un
 * `route.ts` de App Router no puede exportar nada que no sea un handler (Next lo rechaza
 * en build), y esta regla es doctrina — la citan el arnés de validación y su guard, que
 * si copiaran el texto lo dejarían envejecer aparte.
 *
 * Hay DOS clases de plata en una propuesta y confundirlas rompe las dos:
 *
 *   · PRECIO — lo que cobra Smarteam. No es del agente: desde que Inversión pasó a
 *     `agentGenerated:false` (2026-08-12) el modelo se quedó sin el destino natural de los
 *     montos del contexto y los tejía en la prosa del hero o de la solución, donde nadie
 *     los revisa antes de que la propuesta salga.
 *
 *   · IMPACTO — lo que la operación le cuesta HOY al cliente. Es EL argumento, y la
 *     primera versión de la prohibición se lo llevó puesto: decía "no pongas montos en
 *     NINGÚN texto … ni en el ROI" justo cuando el brief del ROI pide "$[X]k valor
 *     estimado". Con dos instrucciones opuestas el modelo desempataba solo, y se nota en
 *     los datos: de las 9 propuestas generadas, 5 de 53 dolores traían alguna cifra y
 *     UNO SOLO traía plata — y ahí la cifra se había comido el título del dolor.
 *
 * Por eso la regla nombra las dos y dice de quién es cada una. Lo que la hace segura no es
 * prohibir números, es exigir que la cuenta esté ESCRITA: un total sin sus factores a la
 * vista no se puede verificar antes de mandárselo a un prospecto.
 */
export const MONEY_RULE_BRIEF = `# Dinero: el PRECIO no es tuyo, el IMPACTO sí
PRECIO (lo que cobra Smarteam): NO lo escribís vos. Los montos, rangos de inversión y condiciones comerciales de esta propuesta viven SOLO en Casos de uso e Inversión, y ninguna de las dos la generás vos (las llena el vendedor a mano o el catálogo). No pongas un precio nuestro en el titular, ni en la solución, ni en los dolores, ni en el ROI, ni en el cierre — aunque el precio aparezca dicho en el contexto.
IMPACTO (lo que la operación del cliente le cuesta HOY): SÍ va, y es lo que hace que la propuesta pese. Volumen, tiempo, porcentajes y dinero del CLIENTE — es plata suya, no precio nuestro. Barré TODAS las fuentes buscándolos: el transcript, las notas internas y el timeline de HubSpot (notas, llamadas, reuniones). Los números que ya están escritos ahí son el activo más caro del contexto.
CÓMO CUANTIFICAR, y esto no es negociable: podés MULTIPLICAR o sumar factores que estén en las fuentes (ej. «15% de 2.000 leads al mes × ticket de $2.000 ≈ $360.000 al año»), pero la cuenta va ESCRITA con sus factores a la vista, para que el vendedor la verifique de un vistazo antes de mandarla. Si falta cualquiera de los factores, NO estimás: dejás el dato afuera. Nombrá la fuente cuando la sepas («según Ronald», «según su propia estimación»). JAMÁS inventes, redondees hacia arriba ni traigas un promedio de industria.
SI LA FUENTE DA UN RANGO, EL RESULTADO ES UN RANGO: «entre el 15% y el 20%» da «$360.000–480.000», nunca «$480.000». Quedarte con el extremo alto es inflar la cifra un tercio y se nota en la primera pregunta del cliente. Lo mismo con las FECHAS: si la fuente dice «el año pasado» o «hace unos meses», escribí eso mismo — no lo conviertas en un año ni en un mes concreto, porque errarle al año de una pérdida de $48.000 hunde la credibilidad de todo el documento.`;
