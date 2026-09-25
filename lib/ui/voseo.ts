/**
 * lib/ui/voseo.ts — el detector de voseo por su FORMA, para las guardas de los textos que se leen.
 *
 * Regla del repo: la app habla en tuteo, nunca en voseo. Este módulo no decide nada del producto: lo usan las
 * guardas (tests) que miran el código de una pantalla y afirman que ningún texto volvió al voseo.
 *
 * ── DE DÓNDE SALE ────────────────────────────────────────────────────────────────
 * Es el criterio de la guarda del cronograma (lib/timeline/contexto-cronograma.test.ts, 2026-09-24): una lista
 * cerrada de palabras no alcanza —«Aceptá o descartá cada cambio» pasaba en verde porque ninguna estaba en la
 * lista—, así que se mira la FORMA. El imperativo y el presente del voseo son agudos: «Revisá», «volvé»,
 * «Describí», «tenés», «podés». Toda palabra así que no esté en `AGUDAS_DE_TUTEO` es sospechosa.
 * ⚠ Esa guarda lleva su propia copia adentro y no se tocó: la puede adoptar quien la mantenga.
 *
 * ── LO QUE SUMA: EL PRONOMBRE PEGADO ─────────────────────────────────────────────
 * «Marcala», «Buscalo», «Decile», «pasale», «fijate» no llevan tilde, y la regla de las agudas no las ve. En la
 * sección Odoo de Cobranza eran casi la mitad del voseo (medido el 2026-09-25: 47 de 97 palabras). En
 * tuteo la misma palabra lleva tilde («Márcala», «Búscalo», «Pásale», «Fíjate») o es otra («Dile»). Así que una
 * palabra SIN tilde que termina en a/e/i + lo, la, le, los, las, les, me o te es sospechosa.
 * ⚠ Esa forma también la tienen sustantivos y adjetivos («escala», «modelo», «totales», «internacionales»), la
 *   tercera persona («permite», «cancela») y palabras en inglés del código («update»). Van en `NO_SON_VOSEO`,
 *   calibrada el 2026-09-25 sobre todos los textos de app/, components/ y lib/.
 * ⚠ No mira -nos («decinos»): esa forma la comparten decenas de gentilicios y sustantivos («mexicanos»,
 *   «destinos»), y en la app no apareció nunca.
 *
 * Si una guarda marca una palabra que es tuteo de verdad (un futuro como «mostrará», un sustantivo), se suma a la
 * lista que corresponde, a propósito y con su porqué. Si es voseo, se corrige el texto.
 *
 * ── SOLO LO QUE SE LEE ───────────────────────────────────────────────────────────
 * `textosDelFuente` saca del código las cadenas, las plantillas y el texto de JSX con el AST de TypeScript. Los
 * comentarios y los nombres del código no cuentan (un comentario que cita el voseo para prohibirlo no puede poner
 * una guarda en rojo), ni los atributos que nadie lee como texto (`className`: «truncate» tiene la forma).
 */
import ts from "typescript";

export interface TextoDelFuente {
  /** Línea del archivo donde empieza el texto (1 = la primera). */
  linea: number;
  texto: string;
}

/** Atributos de JSX que son código, no texto: nadie los lee en pantalla. */
const ATRIBUTOS_DE_CODIGO = new Set(["className", "key", "href", "src", "id", "htmlFor", "type", "role", "variant", "size", "target", "rel"]);

/**
 * Los textos de un archivo .ts o .tsx: cadenas, plantillas (cada tramo entre `${…}`) y texto de JSX, con su línea.
 * `soloDeclaraciones` limita la búsqueda a las constantes de primer nivel cuyo nombre pasa el filtro: sirve para
 * mirar solo los esquemas de unas rutas en un archivo de esquemas que comparten muchas.
 */
export function textosDelFuente(
  fuente: string,
  archivo: string,
  opciones: { soloDeclaraciones?: (nombre: string) => boolean } = {},
): TextoDelFuente[] {
  const sf = ts.createSourceFile(
    archivo,
    fuente,
    ts.ScriptTarget.Latest,
    true,
    archivo.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const out: TextoDelFuente[] = [];
  const visitar = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (ts.isJsxAttribute(n) && ATRIBUTOS_DE_CODIGO.has(n.name.getText(sf))) return;
    if (
      ts.isStringLiteral(n) ||
      ts.isNoSubstitutionTemplateLiteral(n) ||
      ts.isTemplateHead(n) ||
      ts.isTemplateMiddle(n) ||
      ts.isTemplateTail(n) ||
      ts.isJsxText(n)
    ) {
      out.push({ linea: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, texto: n.text });
    }
    ts.forEachChild(n, visitar);
  };
  const filtro = opciones.soloDeclaraciones;
  if (!filtro) {
    visitar(sf);
    return out;
  }
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && filtro(d.name.text)) visitar(d);
    }
  }
  return out;
}

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
  // Primera persona del pretérito (el chat cuenta lo que hizo)
  "dejé", "cambié", "registré", "quedé", "encontré", "contesté",
  // Sustantivos, gentilicios y nombres
  "país", "multipaís", "inglés", "interés", "cortés", "comité", "caché", "josé", "andrés", "mié",
]);

/**
 * Palabras sin tilde con la forma del pronombre pegado que NO son voseo: sustantivos, adjetivos en plural, la
 * tercera persona y el subjuntivo, y palabras en inglés que viven en textos del código.
 */
export const NO_SON_VOSEO: ReadonlySet<string> = new Set([
  // Sustantivos y nombres
  "escala", "modelo", "modelos", "estilo", "estilos", "paralelo", "gemela", "centinela", "cautela", "paquete",
  "rescate", "empate", "limite", "portapapeles", "carteles", "perfiles", "niveles", "canales", "señales",
  "umbrales", "portales", "paneles", "metales", "guatemala", "huthwaite",
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
  "quirinale",
]);

const AGUDA = /(?<!\p{L})\p{L}+(?:á|é|í|ás|és|ís)(?!\p{L})/gu;
/* Minúsculas después de la primera letra: «paymentState» es código, no texto. Al menos tres letras antes de la
   vocal: «dale», «dile», «vale» son tuteo o tercera persona. */
const PRONOMBRE_PEGADO = /(?<!\p{L})[A-Za-zñÑ][a-zñ]{2,}[aei](?:l[oae]s?|me|te)(?!\p{L})/gu;
const palabraEntera = (w: string) => new RegExp(`(?<!\\p{L})${w}(?!\\p{L})`, "u");

/** Las palabras de un texto que tienen la forma del voseo. Vacío = tuteo (o sin verbos). */
export function formasDeVoseo(texto: string): string[] {
  const out: string[] = [];
  for (const v of VOSEO_SIN_FORMA) if (palabraEntera(v).test(texto)) out.push(v);
  for (const m of texto.matchAll(AGUDA)) if (!AGUDAS_DE_TUTEO.has(m[0].toLowerCase())) out.push(m[0]);
  for (const m of texto.matchAll(PRONOMBRE_PEGADO)) if (!NO_SON_VOSEO.has(m[0].toLowerCase())) out.push(m[0]);
  return out;
}
