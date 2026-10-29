/**
 * lib/ui/voseo-formas.ts — la regla del voseo por su FORMA, sin el parser de TypeScript.
 *
 * Vive aparte de `voseo.ts` (que la reexporta) para que el SERVIDOR la pueda usar con lo que escribe un
 * agente (la guía de la preventa, 2026-10-07: salió en voseo, «vivís», «podés») sin cargar `typescript`, que
 * solo necesitan las guardas para leer el código. La explicación de la regla y de sus listas está en voseo.ts.
 */

/** El voseo que no tiene forma propia: se nombra. Con mayúsculas a propósito: «SOS» no es «sos». */
const VOSEO_SIN_FORMA = ["vos", "Vos", "sos", "Sos"];

/**
 * Palabras agudas terminadas en á, é, í (o -ás, -és, -ís) que son tuteo o no son verbos: adverbios, el futuro
 * («podrás», «mostrará»), el subjuntivo («esté», «dé»), la primera persona del pretérito («dejé») y sustantivos.
 * ⚠ Sin reglas por terminación: «-rá» es futuro («mostrará») y también imperativo del voseo («mirá», «entrá»).
 */
export const AGUDAS_DE_TUTEO: ReadonlySet<string> = new Set([
  // Adverbios, pronombres y palabras de uso diario
  "acá", "ahí", "allá", "allí", "aquí", "así", "sí", "mí", "más", "además", "atrás", "detrás", "jamás", "demás",
  "después", "través", "revés", "qué", "porqué", "quizá", "está", "estás", "esté", "dé", "sé",
  // Futuro
  "será", "serás", "verá", "verás", "estará", "podrá", "podrás", "tendrá", "tendrás", "habrá", "hará", "harás",
  "irá", "dirá", "quedará", "aplicará", "mostrará", "cambiará", "pasará", "llegará", "seguirá", "volverá", "sabrá",
  "deberá", "moverá", "correrá", "aparecerá", "eliminará", "dejará", "usará", "creará", "tratará", "recibirás",
  "priorizará", "actualizará", "importará", "medirá", "registrará", "reemplazará", "funcionará", "desasociará",
  "confirmará", "corregirá", "avisará",
  // Primera persona del pretérito (el chat cuenta lo que hizo)
  "dejé", "cambié", "registré", "quedé", "encontré", "contesté",
  // …y el vendedor cuenta lo que entendió (el guion de la exploración de venta)
  "entendí",
  // …y quien registra avisa que terminó el mes («Ya anoté todos los gastos de octubre») o que arregló algo devuelto
  "anoté", "corregí",
  // …y el ejemplo de cómo contar una falla en Feedback («guardé la fecha y al recargar volvió a la anterior»)
  "guardé",
  // Sustantivos, gentilicios y nombres
  "país", "multipaís", "inglés", "interés", "cortés", "comité", "caché", "josé", "andrés", "mié",
  // …y lo que escribe la IA en el contexto de una tarea («traducir la landing al portugués», «el estrés del equipo»)
  "quizás", "francés", "portugués", "japonés", "holandés", "escocés", "irlandés", "finlandés", "danés", "libanés",
  "neerlandés", "estrés", "exprés", "compás", "anís", "ciempiés", "cafés", "papás", "mamás", "bebés", "sofás",
  "comités", "veintitrés", "dieciséis", "veintiséis", "marqués", "burgués", "ciprés", "adiós", "autobús", "parís",
]);

/**
 * Palabras sin tilde con la forma del pronombre pegado que NO son voseo: sustantivos, adjetivos en plural, la
 * tercera persona y el subjuntivo, y palabras en inglés que viven en textos del código.
 */
export const NO_SON_VOSEO: ReadonlySet<string> = new Set([
  // Sustantivos y nombres
  "escala", "escuela", "modelo", "modelos", "estilo", "estilos", "paralelo", "gemela", "centinela", "cautela", "paquete",
  "rescate", "empate", "limite", "portapapeles", "carteles", "perfiles", "niveles", "canales", "señales",
  "umbrales", "portales", "paneles", "metales", "papeles", "guatemala", "huthwaite",
  // …y una pestaña del Excel de facturación, con el nombre que le deja Excel (31 letras): «Implementaciones Internacionale»
  "internacionale",
  // Adjetivos en plural (-ales, -eles, -iles)
  "totales", "subtotales", "internacionales", "comerciales", "adicionales", "manuales", "actuales", "opcionales",
  "credenciales", "puntuales", "mensuales", "semanales", "principales", "sociales", "informales", "formales",
  "ideales", "decimales", "operacionales", "verbales", "iniciales", "parciales", "generales", "diferenciales",
  "textuales", "circunstanciales", "oficiales", "fiscales", "literales", "transversales", "visuales", "iguales",
  "individuales", "especiales", "funcionales", "finales", "locales", "legales", "materiales", "empresariales",
  "ambientales", "gubernamentales", "laborales", "profesionales", "presenciales", "personales", "digitales",
  "modales", "textiles",
  // Tercera persona y subjuntivo
  "permite", "admite", "repite", "compite", "transmite", "compromete", "promete", "equivale", "imprime", "congela",
  "congele", "revela", "señala", "iguala", "cancela", "asimila", "vigila", "necesite", "habilite", "interprete",
  // Inglés del código (propiedades de HubSpot, parámetros, métodos de Odoo, nombres de archivo)
  "create", "update", "delete", "generate", "regenerate", "template", "private", "profile", "rotate", "translate",
  "estimate", "estate", "rationale", "realtime", "datetime", "filename", "website", "iframe", "infinite", "polite",
  "authenticate", "createdate", "closedate", "dealname", "lastmodifieddate", "lastactivitydate", "assigneddate",
  "firstname", "lastname", "reconcile",
  // El evento del navegador al ir «Atrás» o «Adelante» (el enlace de cada sesión, components/exploraciones/LienzoDeExploracion.tsx)
  "popstate",
  // Nombres de herramientas (los alias del cruce de gastos con Mercury, lib/finanzas/gastos-mercury.ts)
  "gsuite", "googlegsuite",
  "quirinale",
]);

const AGUDA = /(?<!\p{L})\p{L}+(?:á|é|í|ás|és|ís)(?!\p{L})/gu;
/* Minúsculas después de la primera letra: «paymentState» es código, no texto. Al menos tres letras antes de la
   vocal: «dale», «dile», «vale» son tuteo o tercera persona. Pegada a un guion es código («animate-pulse»). */
const PRONOMBRE_PEGADO = /(?<![\p{L}-])[A-Za-zñÑ][a-zñ]{2,}[aei](?:l[oae]s?|me|te)(?![\p{L}-])/gu;
const palabraEntera = (w: string) => new RegExp(`(?<!\\p{L})${w}(?!\\p{L})`, "u");

/** Las palabras de un texto que tienen la forma del voseo. Vacío = tuteo (o sin verbos). */
export function formasDeVoseo(texto: string): string[] {
  const out: string[] = [];
  for (const v of VOSEO_SIN_FORMA) if (palabraEntera(v).test(texto)) out.push(v);
  for (const m of texto.matchAll(AGUDA)) if (!AGUDAS_DE_TUTEO.has(m[0].toLowerCase())) out.push(m[0]);
  for (const m of texto.matchAll(PRONOMBRE_PEGADO)) if (!NO_SON_VOSEO.has(m[0].toLowerCase())) out.push(m[0]);
  return out;
}

/**
 * Los imperativos del voseo que aparecen en un correo o en un mensaje («contame», «avisame», «fijate»).
 * En PROSA son los únicos de la familia del pronombre pegado que se cuentan: la regla por forma también caza
 * «hoteles», «Alajuela» o «wireframe», y en un texto que escribe un agente eso es un aviso falso en cada corrida.
 */
const IMPERATIVOS_DEL_VOSEO: ReadonlySet<string> = new Set([
  "contame", "decime", "avisame", "escribime", "mandame", "pasame", "compartime", "confirmame", "llamame", "mostrame",
  "contanos", "decinos", "avisanos", "escribinos", "mandanos", "pasanos", "compartinos", "confirmanos", "llamanos",
  "mostranos", "fijate", "acordate", "mirá", "avisá", "contá", "decí", "escribí", "mandá", "pasá", "compartí",
  "confirmá", "revisá", "probá", "pensá", "tené", "poné", "vení",
]);

/**
 * El voseo de un texto en PROSA, el que escribe un agente para una persona (un correo, una guía): solo lo que
 * casi seguro es voseo. Cuenta «vos» y «sos», el presente terminado en -ás, -és o -ís («podés», «tenés»,
 * «vivís») salvo el futuro («podrás», que es igual en tuteo), y los imperativos de la lista de arriba. El
 * presente solo en minúscula: con mayúscula casi siempre es un nombre propio («Inés», «Tomás», «Bogotá»), y un
 * agente que vosea no lo hace solo al empezar una frase.
 */
export function voseoEnProsa(texto: string): string[] {
  const out = new Set<string>();
  for (const w of formasDeVoseo(texto)) {
    const l = w.toLowerCase();
    if (l === "vos" || l === "sos" || IMPERATIVOS_DEL_VOSEO.has(l)) out.add(w);
    else if (w === l && /(?:ás|és|ís)$/.test(l) && !/rás$/.test(l)) out.add(w);
  }
  return [...out];
}
