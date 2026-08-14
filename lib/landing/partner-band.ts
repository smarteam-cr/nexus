/**
 * lib/landing/partner-band.ts — los HECHOS de Smarteam que publica la banda «Por qué
 * Smarteam», y que no salen de la propuesta ni del agente.
 *
 * ── POR QUÉ SON CONSTANTES Y NO CAMPOS ───────────────────────────────────────
 * Las insignias ya vivían acá por una razón de fondo: son hechos de la empresa, iguales en
 * toda propuesta, y un campo editable solo habilitaría publicarle a un prospecto una
 * acreditación que no tenemos.
 *
 * Las CIFRAS de experiencia se sumaron a esa lista el 2026-08-14 con la misma lógica, después
 * de medirlo: de las 28 secciones `partner` guardadas, las 28 dicen lo mismo con tres
 * redacciones ("+200 proyectos, +8 países LATAM" ×25 y dos variantes de la misma frase). El
 * campo hacía que un dato fijo de la empresa diera la vuelta por un LLM en cada generación —
 * puro riesgo de deriva ("+500 proyectos") a cambio de cero información. Y como
 * `configForSnapshot` resuelve el renderer por KEY contra la config viva, tenerlas acá es lo
 * único que hace que la tercera ficha —«+3.000 usuarios capacitados», que faltaba— aparezca
 * también en las propuestas YA PUBLICADAS, sin regenerar ninguna.
 *
 * ⚠ La contrapartida, a ojos abiertos: cambiar una cifra ahora es un cambio de código. Es el
 * mismo trato que las insignias, y el correcto para un dato que solo dirección puede afirmar.
 */

export interface FichaExperiencia {
  /** El número, en grande. */
  valor: string;
  /** Qué cuenta ese número. */
  etiqueta: string;
}

/** Las cifras que Smarteam publica de sí misma. Tres entran holgadas en la banda. */
export const EXPERIENCIA_SMARTEAM: readonly FichaExperiencia[] = [
  { valor: "+200", etiqueta: "proyectos" },
  { valor: "+8", etiqueta: "países LATAM" },
  { valor: "+3.000", etiqueta: "usuarios capacitados" },
] as const;

export interface Insignia {
  /** Ruta bajo `public/`. El test la verifica contra el disco. */
  src: string;
  alt: string;
}

/** La insignia grande: la credencial de partner. */
export const INSIGNIA_ELITE: Insignia = {
  src: "/partner/hubspot-elite-partner.png",
  alt: "Smarteam — HubSpot Elite Solutions Partner",
};

/**
 * El logotipo apaisado (3.61:1) de Top Partner. Va en su propia celda con fondo navy: el PNG
 * trae el texto en BLANCO sobre transparente, así que sobre la tarjeta clara el rótulo
 * desaparece y quedan sus dos íconos sueltos.
 */
export const INSIGNIA_TOP: Insignia = {
  src: "/partner/hubspot-top-partner.png",
  alt: "Top HubSpot Partner",
};

/** Las dos acreditaciones (escudos casi cuadrados, 0.93:1). */
export const ACREDITACIONES: readonly Insignia[] = [
  { src: "/partner/hubspot-onboarding.png", alt: "HubSpot Onboarding Accreditation" },
  { src: "/partner/hubspot-implementacion.png", alt: "HubSpot Service Implementation Accreditation" },
] as const;

/** Todas, para verificar de una que ningún archivo se perdió en un rename. */
export const INSIGNIAS: readonly Insignia[] = [INSIGNIA_ELITE, INSIGNIA_TOP, ...ACREDITACIONES];

/**
 * El pie de la tarjeta de insignias. NO pasa por i18n a propósito: son los nombres propios de
 * los programas de HubSpot y no se traducen — traducirlos inventaría credenciales que HubSpot
 * no emite con ese nombre. El rótulo que sí es prosa (`insigniasFirma`) sí está en i18n.
 */
export const INSIGNIAS_DETALLE =
  "HubSpot Elite Solutions Partner · Onboarding · Service Implementation";
