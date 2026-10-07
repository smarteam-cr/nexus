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
 * ⚠ Pegada a un guion no cuenta: es código, una clase de Tailwind («animate-pulse») o un slug, no una palabra de
 *   una frase. Se decidió así y no sumando «animate» a la lista porque «Animate» también es voseo («anímate»).
 *   Medido el 2026-10-01: en todo app/, components/ y lib/ la regla saca un solo texto, esa clase.
 *
 * Si una guarda marca una palabra que es tuteo de verdad (un futuro como «mostrará», un sustantivo), se suma a la
 * lista que corresponde, a propósito y con su porqué. Si es voseo, se corrige el texto. Las listas y la regla viven
 * en voseo-formas.ts (2026-10-07), para que el servidor las use sin cargar el parser de TypeScript.
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

export { AGUDAS_DE_TUTEO, formasDeVoseo, NO_SON_VOSEO } from "./voseo-formas";
