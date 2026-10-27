/**
 * lib/tests-diagnostico/pixeles.ts — LOS PÍXELES DE ANUNCIOS de la página del test (O6 etapa 2, 2026-10-26). PURO.
 *
 * La página vieja (`dev.smarteamcr.com/diagnostico-rendimiento`) carga tres, medido el 2026-10-26 sobre lo publicado:
 *   · la etiqueta de Google Ads (`AW-18355922702`), con la conversión `AW-18355922702/9SvvCKjmp9kcEI7O5LBE` cuando la
 *     persona deja sus datos (ahí se gana el lead);
 *   · el píxel de Meta (`1206241703610274`), solo la vista de página;
 *   · el código de seguimiento de HubSpot (portal `6553628`), que pone la cookie `hubspotutk` con la que el formulario
 *     atribuye el lead a la campaña. Sin el chat: en el teléfono su burbuja tapa el botón de empezar.
 * Para que el día del corte las campañas sigan midiendo, la página nueva carga los mismos. Cada uno se prende con SU
 * variable (vacía = no se carga): hasta el corte, Nexus no le habla a nadie. Los valores se validan por su forma, porque
 * van dentro de un `<script>`.
 *
 * ⛔ Solo en la página del test y en la de elegir el área. NUNCA en el resultado: su dirección lleva el token del
 * intento, y un píxel manda la dirección entera a Meta o a Google.
 */

export interface PixelesDelTest {
  /** `AW-…`: la etiqueta de Google Ads. */
  googleAds: string | null;
  /** `AW-…/…`: la conversión que se dispara al empezar. Solo con la etiqueta. */
  conversionGoogleAds: string | null;
  /** El id del píxel de Meta. */
  meta: string | null;
  /** El portal de HubSpot del código de seguimiento. */
  hubspot: string | null;
}

const valor = (v: string | undefined, forma: RegExp) => {
  const t = v?.trim() ?? "";
  return forma.test(t) ? t : null;
};

export function pixelesDelTest(env: Record<string, string | undefined>): PixelesDelTest {
  const googleAds = valor(env.TESTS_PIXEL_GOOGLE_ADS, /^AW-\d{5,15}$/);
  const conversion = valor(env.TESTS_PIXEL_GOOGLE_ADS_CONVERSION, /^AW-\d{5,15}\/[A-Za-z0-9_-]{4,40}$/);
  return {
    googleAds,
    conversionGoogleAds: googleAds && conversion?.startsWith(`${googleAds}/`) ? conversion : null,
    meta: valor(env.TESTS_PIXEL_META, /^\d{8,20}$/),
    hubspot: valor(env.TESTS_PIXEL_HUBSPOT, /^\d{3,12}$/),
  };
}
