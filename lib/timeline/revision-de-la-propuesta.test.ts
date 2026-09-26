/**
 * lib/timeline/revision-de-la-propuesta.test.ts — la PANTALLA de la revisión de la propuesta de fases
 * (E1 del borrador del cronograma, 2026-09-24).
 *
 * Correr: `npx vitest run lib/timeline/revision-de-la-propuesta.test.ts --project unit`.
 *
 * La lógica vive en lib/timeline/borrador.ts (y sus tests); esto mira el cableado que solo existe en
 * los componentes: un solo botón que alterna sobre el MISMO Gantt, la barra fija sobre el Gantt
 * entero, la vista de la propuesta que nunca pasa por el guardado, «Subir al cliente» libre con
 * aviso y el aplicar que espera el guardado (E2b: ya sin la cadena vieja al paso 2).
 *
 * ⚠ Cómo se mira (reescrito en la corrección de E1, 2026-09-24, con esta razón: varias guardas
 * exigían líneas enteras de código literal —un reformateo inofensivo las ponía en rojo por el motivo
 * equivocado—, `tramo` leía hasta el final del archivo sin avisar si faltaba el marcador de fin, y la
 * guarda del `sticky` quedaba en verde con la barra que se iba con su sección):
 *   · el código SIN comentarios, y comparado SIN espacios (`sinEspacios`): el formato no cuenta;
 *   · `tramo` TIRA si falta un marcador, y cada tramo se verifica no vacío antes de las negaciones;
 *   · la ESTRUCTURA (qué elemento es hijo de cuál, dónde vive el `sticky`) se lee con el parser de
 *     TypeScript, no con texto: es la estructura la que decide si la barra queda fija.
 * Cada `it` nombra la edición que lo pone en rojo.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  AVISO_SUBIR_CON_PROPUESTA,
  borradorVacio,
  debeDescartarseSolo,
  leerBorrador,
  LINEA_DEL_CLIENTE,
  marcarCambios,
  MENSAJE_PROPUESTA_ABIERTA,
  planDeAplicacion,
  REVISION_VACIA,
  TEXTO_VER_ANTES,
  TEXTO_VER_PROPUESTA,
  textoDeAplicar,
  type Vivo,
} from "./borrador";
import { RAW_NEUTRAL_RE } from "../ui/raw-neutral.mjs";
import { motivoParaElAcuerdo, MOTIVOS_DEL_CHAT } from "../asistente/textos-del-acuerdo";

const RUTA_CANVAS = "components/canvas/CronogramaCanvas.tsx";
const RUTA_BARRA = "components/canvas/RevisionDeLaPropuesta.tsx";
const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const soloCodigo = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/^\s*\/\/.*$/gm, "");
/** Sin ningún espacio: `contiene(src, "a ( b )")` no depende de cómo lo formateó nadie. */
const sinEspacios = (s: string) => s.replace(/\s+/g, "");
const contiene = (src: string, esperado: string) => sinEspacios(src).includes(sinEspacios(esperado));

const CANVAS = soloCodigo(leer(RUTA_CANVAS));
const BARRA = soloCodigo(leer(RUTA_BARRA));
const GANTT = soloCodigo(leer("components/canvas/TimelineGantt.tsx"));
const HOOK = soloCodigo(leer("components/canvas/useBorradorDelCronograma.ts"));
// E2a P5: las tareas de la propuesta (la lista agrupada por fase y la línea de la corrida).
const RUTA_TAREAS = "components/canvas/TareasDeLaPropuesta.tsx";
const RUTA_LINEA = "components/canvas/LineaDeLasTareas.tsx";
const TAREAS = soloCodigo(leer(RUTA_TAREAS));
const LINEA = soloCodigo(leer(RUTA_LINEA));

/** El código entre dos marcadores. TIRA si falta alguno: nunca un tramo vacío ni hasta el final. */
const tramo = (src: string, desde: string, hasta: string) => {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error(`no encuentro el inicio del tramo: «${desde}»`);
  const j = src.indexOf(hasta, i + desde.length);
  if (j < 0) throw new Error(`no encuentro el fin del tramo: «${hasta}» (después de «${desde}»)`);
  return src.slice(i, j);
};

// ── EL PARSER: la estructura del JSX ────────────────────────────────────────────────────────
const arbol = (rel: string) => ts.createSourceFile(rel, leer(rel), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function todos(n: ts.Node, pred: (x: ts.Node) => boolean): ts.Node[] {
  const out: ts.Node[] = [];
  const visitar = (x: ts.Node) => {
    if (pred(x)) out.push(x);
    ts.forEachChild(x, visitar);
  };
  visitar(n);
  return out;
}
const abrir = (el: ts.JsxElement | ts.JsxSelfClosingElement) => (ts.isJsxElement(el) ? el.openingElement : el);
const nombre = (el: ts.JsxElement | ts.JsxSelfClosingElement) => abrir(el).tagName.getText();
const atributo = (el: ts.JsxElement | ts.JsxSelfClosingElement, attr: string) =>
  abrir(el)
    .attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === attr)
    ?.initializer?.getText() ?? null;
const esElemento = (x: ts.Node): x is ts.JsxElement | ts.JsxSelfClosingElement =>
  ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x);
/** Los hijos que cuentan (sin el texto en blanco entre etiquetas). */
const hijos = (el: ts.JsxElement | ts.JsxFragment) =>
  el.children.filter((c) => !(ts.isJsxText(c) && c.containsOnlyTriviaWhiteSpaces));
/** Una clase que vuelve a un elemento contenedor de scroll: un `sticky` adentro se pega a ÉL, no a la ventana. */
const CLASE_DE_SCROLL = /\boverflow-(?!visible\b)[a-z-]+/;

describe("los textos de la barra", () => {
  it("«Aplicar todo» si va todo lo que se puede marcar; si no, «Aplicar N de M»", () => {
    /* ⚠ REESCRITA en la corrección de E1 (2026-09-24), con esta razón: el segundo número ya no es el
       total (que cuenta los choques, que nunca se aplican) sino lo que se puede marcar. Los casos con
       choques, llamando al núcleo, están en borrador.test.ts («10 · …»). */
    expect(textoDeAplicar(5, 5)).toBe("Aplicar todo");
    expect(textoDeAplicar(3, 5)).toBe("Aplicar 3 de 5");
    expect(textoDeAplicar(0, 2)).toBe("Aplicar 0 de 2");
  });

  it("la línea fija y los avisos dicen lo que pasa con el cliente y qué hacer, en tuteo", () => {
    /* ⚠ ACTUALIZADA el 2026-09-24 con esta razón: Elías pidió menos texto en la barra y la línea va
       ahora junto al cierre, así que se acortó. Sigue diciendo lo mismo: nada llega al cliente hasta
       aplicar. */
    expect(LINEA_DEL_CLIENTE).toBe("El cliente no ve estos cambios hasta que apliques.");
    expect(AVISO_SUBIR_CON_PROPUESTA).toContain("sin aplicar");
    expect(AVISO_SUBIR_CON_PROPUESTA).toContain("si subes ahora");
    expect([TEXTO_VER_ANTES, TEXTO_VER_PROPUESTA]).toEqual(["Ver como estaba antes", "Ver la propuesta"]);
    /* Se retiró «Pedir cambio con IA» (E4): salió el aviso de la propuesta que entraba con su vista previa
       abierta (`AVISO_PROPUESTA_ABIERTA_CON_VISTA_PREVIA`), que se borró con ella. */
  });

  it("E2a · la propuesta abierta se nombra «del cronograma»: desde E2a trae también tareas", () => {
    /* E2a P3 (2026-09-25): «Regenerar todo» deja UN borrador con fases y tareas, así que «propuesta
       de cambios de fases» pasa a ser falso (y el cartel del proyecto decía «sugirió cambios de
       fases»). Son verdad en los dos mundos: con la propuesta vieja, solo de fases, y con la nueva.
       La edición que la pone en rojo: volver a nombrar la propuesta abierta «de cambios de fases» en
       uno de estos textos, o en el cartel que ve el CSE fuera del cronograma. */
    // E4: sin el aviso de la vista previa de «Pedir cambio con IA» (se retiró y se borró con ella).
    for (const texto of [MENSAJE_PROPUESTA_ABIERTA, AVISO_SUBIR_CON_PROPUESTA]) {
      expect(texto).toContain("propuesta del cronograma");
      expect(texto, "volvió a decir que la propuesta es solo de fases").not.toMatch(/cambios de fases/);
    }
    const cartel = soloCodigo(leer("components/projects/TimelineProposalPendiente.tsx"));
    expect(cartel.length).toBeGreaterThan(1500);
    expect(cartel.match(/El cronograma tiene una propuesta sin decidir/g)?.length, "las dos variantes").toBe(2);
    /* ⚠ ACTUALIZADA en E2b P7 (2026-09-25), con esta razón: pedía «la IA propuso cambios del
       cronograma», la segunda oración del compacto. Esa oración se fue: ahora dice de dónde viene, quién
       la dejó y cuándo (`fraseDeAutoria`, en autoria-de-la-propuesta.test.ts). El completo sigue diciendo
       «La IA propuso cambios del cronograma». */
    expect(cartel).toContain("propuso cambios del cronograma");
    expect(cartel, "el cartel volvió a hablar solo de fases").not.toMatch(/cambios de fases/);
    expect(cartel, "el cartel volvió a decir que se aceptan uno por uno").not.toContain("los acepte");
  });
});

describe("la barra: UN botón que alterna, la línea fija, la lista con casillas y el cierre", () => {
  it("⭐ un solo botón alterna la vista y dice lo que vas a ver (sin `aria-pressed`)", () => {
    /* La edición que la pone en rojo: dos botones (uno por vista), un texto que no cambia, o volver a
       `aria-pressed` con un texto que cambia (el lector anunciaba «Ver la propuesta, presionado»). */
    expect(BARRA.length).toBeGreaterThan(2000);
    expect(BARRA.match(/onClick=\{onAlternar\}/g)?.length, "tiene que haber UN botón que alterna").toBe(1);
    expect(contiene(BARRA, '{vista === "propuesta" ? TEXTO_VER_ANTES : TEXTO_VER_PROPUESTA}')).toBe(true);
    expect(BARRA, "texto que cambia + aria-pressed se contradicen").not.toContain("aria-pressed");
    expect(contiene(BARRA, "{LINEA_DEL_CLIENTE}")).toBe(true);
    /* ⚠ ACTUALIZADA en la revisión de E2c (2026-09-25), con esta razón: con tareas que esperan su recálculo el botón dice
       solo «Aplicar» (`textoDelBotonDeAplicar`; su conducta, en recalculo-en-la-pantalla.test.ts). */
    expect(contiene(BARRA, "const textoDelBoton = textoDelBotonDeAplicar(resumen);")).toBe(true);
    expect(contiene(BARRA, 'enCurso === "aplicar" ? "Aplicando…" : textoDelBoton')).toBe(true);
    expect(contiene(BARRA, "onClick={onDescartar}")).toBe(true);
  });

  it("⭐ la barra es FIJA sobre el Gantt entero: el `sticky` es hermano del Gantt, no hijo de una sección propia", () => {
    /* Un `sticky` no sale de su bloque padre. La barra vivía en una <section> que solo tenía la barra y
       la lista, así que apenas se bajaba al Gantt se iba con ella, y «Ver como estaba antes» y
       «Aplicar» dejaban de estar a mano (revisión de E1, 2026-09-24). La guarda de antes pedía el
       literal `sticky top-0` y pasaba con eso roto; esta mira la ESTRUCTURA.
       La edición que la pone en rojo: volver a envolver la barra en su propio contenedor, sacar la
       barra o el Gantt del contenedor común, o ponerle overflow a ese contenedor. */
    const barra = arbol(RUTA_BARRA);
    const retornos = todos(barra, ts.isReturnStatement).filter((r) => {
      const e = (r as ts.ReturnStatement).expression;
      return !!e && ts.isParenthesizedExpression(e) && ts.isJsxFragment(e.expression);
    });
    expect(retornos.length, "la barra tiene que devolver HERMANOS (un fragmento), no un contenedor").toBe(1);
    const fragmento = ((retornos[0] as ts.ReturnStatement).expression as ts.ParenthesizedExpression)
      .expression as ts.JsxFragment;
    const fija = hijos(fragmento).filter(esElemento).find((el) => atributo(el, "ref") === "{barraRef}");
    expect(fija, "la barra fija (ref={barraRef}) no es hija directa del fragmento").toBeDefined();
    const clase = atributo(fija!, "className") ?? "";
    expect(clase).toMatch(/\bsticky\b/);
    expect(clase).toMatch(/\btop-0\b/);
    expect(atributo(fija!, "id"), "el ancla del botón «Revisar N cambios»").toBe('"cronograma-propuesta"');

    const canvas = arbol(RUTA_CANVAS);
    const contenedores = todos(
      canvas,
      (x) => ts.isJsxElement(x) && atributo(x, "ref") === "{revision.contenedorRef}",
    ) as ts.JsxElement[];
    expect(contenedores.length, "tiene que haber UN contenedor de la barra y el Gantt").toBe(1);
    const contenedor = contenedores[0];
    const suyos = hijos(contenedor);
    const ultimo = suyos[suyos.length - 1];
    expect(
      esElemento(ultimo) && nombre(ultimo) === "TimelineGantt",
      "el Gantt tiene que ser el ÚLTIMO hijo del contenedor (aparecer la barra no lo remonta)",
    ).toBe(true);
    const conLaBarra = suyos.filter(
      (c) => ts.isJsxExpression(c) && todos(c, (x) => esElemento(x) && nombre(x) === "RevisionDeLaPropuesta").length > 0,
    );
    expect(conLaBarra.length, "la barra tiene que ser hija directa del MISMO contenedor que el Gantt").toBe(1);
    // Nada entre el contenedor y la ventana puede ser un contenedor de scroll.
    for (let n: ts.Node | undefined = contenedor; n; n = n.parent) {
      if (!ts.isJsxElement(n)) continue;
      expect(atributo(n, "className") ?? "", `<${nombre(n)}> vuelve el scroll local y el sticky no se pega a la ventana`).not.toMatch(
        CLASE_DE_SCROLL,
      );
    }
  });

  it("las casillas: lo que choca o ya está así no se puede marcar, y el número es el del núcleo", () => {
    /* La edición que la pone en rojo: dejar marcar un choque (aplicarlo pisaría lo que editaste) o
       numerar en la pantalla en vez de usar `it.numero` (los números se correrían al marcar). */
    const lista = tramo(BARRA, "{items.map((it) => {", "</ol>");
    expect(lista.length).toBeGreaterThan(500);
    expect(lista).toContain('type="checkbox"');
    expect(contiene(lista, 'const sePuedeMarcar = it.estado === "aplica" || it.estado === "excluido";')).toBe(true);
    expect(contiene(lista, "disabled={trabajando || !sePuedeMarcar}")).toBe(true);
    expect(contiene(lista, "onChange={(e) => onMarcar(it.clave, e.target.checked)}")).toBe(true);
    expect(lista).toContain("{it.numero}.");
    expect(lista, "la pantalla numera por su cuenta").not.toMatch(/\bindex\s*\+\s*1\b|\bi\s*\+\s*1\b/);
  });

  it("aplicando o descartando, los dos botones y las casillas se apagan", () => {
    /* La edición que la pone en rojo: volver a `trabajando` solo con el aplicar (un doble clic en
       «Descartar» mandaba dos DELETE, y «Aplicar» durante el descarte caía en un 409). */
    expect(contiene(BARRA, "const trabajando = enCurso !== null;")).toBe(true);
    expect(contiene(BARRA, "disabled={trabajando || marcadas === 0 || bloqueo !== null}")).toBe(true);
    expect(contiene(BARRA, "onClick={onDescartar} disabled={trabajando}")).toBe(true);
    expect(contiene(BARRA, 'enCurso === "descartar" ? "Descartando…" : "Descartar"')).toBe(true);
  });

  it("el cierre de la barra y de la confirmación sale del núcleo, con el cierre fijado", () => {
    /* La edición que la pone en rojo: calcular el cierre en el componente sin el cierre fijado (el
       «antes» de la barra no era la fecha que se ve en ningún lado). */
    expect(contiene(BARRA, "const cierre = fraseDelCierre(resumen, cierreFijado);")).toBe(true);
    expect(tramo(BARRA, "<ConfirmDialog", "/>")).toContain("{cierre}");
  });

  it("solo tokens semánticos: ningún color crudo de Tailwind", () => {
    /* El ratchet de grises (lib/ui/token-vocab.test.ts) no mira los colores de familia; esto sí. */
    expect(BARRA, "color crudo en la barra de revisión").not.toMatch(
      /\b(bg|text|border)-(gray|slate|zinc|neutral|red|amber|yellow|blue|sky|emerald|green|violet|fuchsia)-\d/,
    );
    expect(BARRA).toContain("bg-info-surface");
    expect(BARRA).toContain("text-warn-ink");
  });

  it("⭐ la barra dice poco: el motivo sin rótulo, lo que notó la IA plegado, y el origen sin inventar", () => {
    /* Elías, 2026-09-24: «¿puedes simplificar un poco la interfaz? Creo que hay mucho texto». La barra
       fija dice qué propone, cuánto se corre el cierre y que el cliente no ve nada todavía; qué vista
       es y si se puede editar va en el `title` del botón que alterna; lo que la IA notó y no aplica
       sola va plegado. Y el origen no puede afirmar «las reuniones y notas que elegiste» cuando lo
       único que había eran las instrucciones adicionales (pasó en la prueba de Wherex).
       La edición que la pone en rojo: volver a pintar el rótulo «Por qué (solo lo ves tú)», desplegar
       las observaciones, devolver las oraciones de la vista a la barra, o la frase del origen. */
    expect(BARRA.length).toBeGreaterThan(2000);
    expect(BARRA, "volvió el rótulo largo del motivo").not.toContain("Por qué (solo lo ves tú)");
    expect(BARRA, "el origen volvió a afirmar reuniones y notas").not.toContain("de las reuniones y notas que elegiste");
    const notas = tramo(BARRA, "{observaciones.length > 0 && (", "</details>");
    expect(notas.length, "la guarda no está mirando lo que notó la IA").toBeGreaterThan(200);
    expect(notas, "lo que notó la IA dejó de ir plegado").toContain("<details");
    expect(notas).toContain("<summary");
    expect(notas, "lo que notó la IA se despliega solo").not.toMatch(/<details[^>]*\bopen\b/);
    // Qué vista es y si se puede editar: en el `title` del botón que alterna, no en oraciones de la barra.
    const alternar = tramo(BARRA, "onClick={onAlternar}", "</Button>");
    expect(alternar, "el botón que alterna perdió su explicación").toContain("title={");
    expect(alternar).toContain("Estás viendo la propuesta, solo para leer");
    expect(alternar).toContain("Estás viendo el cronograma actual y puedes editarlo");
    // TODAS las veces que la barra dice «Estás viendo» están en ese botón: ninguna volvió a un <p>.
    expect(BARRA.match(/Estás viendo/g)?.length, "las oraciones de la vista volvieron a la barra").toBe(
      alternar.match(/Estás viendo/g)?.length,
    );
    /* ⚠ REESCRITA AL REVÉS en E2b P4 (2026-09-25), con esta razón: pedía la chapa «Paso 1 de 2 ·
       después, las tareas», porque aplicar o descartar la propuesta de las reuniones seguía SOLO con
       las tareas (la cadena vieja). La cadena se fue: nada sigue solo, y si las tareas no llegaron la
       línea suelta las ofrece después. La edición que la pone en rojo: volver a pintar la chapa. */
    expect(BARRA, "volvió la chapa de la cadena vieja").not.toContain("Paso 1 de 2");
    expect(BARRA).not.toContain("después, las tareas");
    // La línea del cliente va junto al cierre, en UNA línea.
    expect(contiene(BARRA, '{cierre} <span className="text-fg-muted">{LINEA_DEL_CLIENTE}</span>')).toBe(true);
  });
});

describe("el Gantt pinta las marcas de la vista «Ver la propuesta»", () => {
  it("⭐ la fila marcada lleva el fondo del token TAL CUAL y la línea a la izquierda, y las etiquetas", () => {
    /* Nadie cuidaba que el Gantt las pintara: borrar el fondo y la línea dejaba la suite en verde
       (revisión de E1, 2026-09-24). La edición que la pone en rojo: sacar el fondo, la línea o las
       etiquetas, o bajar el token a la mitad (`/50`: ya está al 15 % en oscuro y no se vería). */
    expect(contiene(GANTT, "const marca = marcas?.get(p.key);")).toBe(true);
    expect(
      contiene(
        GANTT,
        'marca ? marca.tono === "nueva" ? "bg-success-surface border-l-2 border-success-line" : "bg-info-surface border-l-2 border-info-line" : ""',
      ),
      "la fila marcada perdió el fondo del token o la línea a la izquierda",
    ).toBe(true);
    expect(GANTT, "el token se pintó a la mitad").not.toMatch(/bg-(success|info)-surface\/\d/);
    const etiquetas = tramo(GANTT, "{marca && marca.etiquetas.length > 0 && (", "</div>");
    expect(etiquetas.length).toBeGreaterThan(100);
    expect(contiene(etiquetas, "{marca.etiquetas.map((e) => (")).toBe(true);
    expect(contiene(etiquetas, "{e}")).toBe(true);
  });

  it("⭐ el arranque y el cierre se ven IGUAL en las dos vistas (el mismo chip, solo para mostrar)", () => {
    /* Elías, 2026-09-24: «los CTAs de cierre proyectado y arranque se ven distintos en la propuesta
       que en el vigente». En «Ver la propuesta» el arranque no aparecía y el cierre era un rótulo de
       otro estilo: el encabezado cambiaba de forma al alternar. Ahora es el MISMO componente con
       `readOnly`, que no abre el calendario. La edición que la pone en rojo: volver a un rótulo propio
       en la rama de solo lectura, o dejar de mostrar el arranque en la propuesta. */
    const arranque = tramo(GANTT, "{onSetAnchor ? (", "{onSetCloseOverride ? (");
    expect(arranque.length).toBeGreaterThan(100);
    expect(contiene(arranque, "<AnchorDatePicker value={anchor} onChange={() => {}} readOnly />")).toBe(true);
    const cierreSoloLectura = tramo(GANTT, "cierreVisible.label && (", "{onSetAnchor && kickoffDate");
    expect(cierreSoloLectura.length).toBeGreaterThan(100);
    expect(cierreSoloLectura, "el cierre de la propuesta dejó de ser el mismo chip").toContain("<DatePickerField");
    expect(cierreSoloLectura).toContain("readOnly");
    expect(cierreSoloLectura, "volvió el rótulo de otro estilo").not.toContain("Cierre proyectado: {cierreVisible.label}");
    // Y el modo solo-lectura de verdad no abre el calendario, en los dos componentes.
    for (const rel of ["components/canvas/AnchorDatePicker.tsx", "components/ui/DatePickerField.tsx"]) {
      const comp = soloCodigo(leer(rel));
      expect(contiene(comp, "{open && !readOnly && ("), `${rel} abre el calendario en solo lectura`).toBe(true);
      expect(contiene(comp, "disabled={readOnly}"), `${rel} se puede apretar en solo lectura`).toBe(true);
    }
  });
});

describe("el Canvas: el MISMO Gantt en las dos vistas, y la propuesta nunca pasa por el guardado", () => {
  const rama = tramo(CANVAS, '<div id="cronograma-gantt"', "<TaskDetailDrawer");

  it("⭐ un solo <TimelineGantt> para las dos vistas (no se desmonta: las fases abiertas siguen abiertas)", () => {
    /* La edición que la pone en rojo: pintar la propuesta en OTRO <TimelineGantt> (un ternario de dos
       elementos): React lo desmonta al alternar y se pierden las fases abiertas y el lugar. */
    expect(rama.length).toBeGreaterThan(2000);
    expect(rama.match(/<TimelineGantt\b/g)?.length).toBe(1);
    expect(contiene(rama, "phases={verPropuesta ? fasesDeLaPropuesta : ganttPhases}")).toBe(true);
    expect(contiene(rama, "readOnly={verPropuesta || !canEdit}")).toBe(true);
    expect(contiene(rama, "marcas={verPropuesta ? marcasDeLaPropuesta : undefined}")).toBe(true);
    expect(
      contiene(rama, "onSetAnchor={verPropuesta ? undefined : setAnchorFromGantt}"),
      "en la vista de la propuesta el arranque se edita",
    ).toBe(true);
    // El lugar del scroll: la fila que se mira, medida contra la barra.
    expect(GANTT).toContain("data-fase-key={p.key}");
    expect(HOOK).toContain('querySelectorAll<HTMLElement>("[data-fase-key]")');
    expect(HOOK).toMatch(/useLayoutEffect\(\(\) => \{[\s\S]*?restaurarAncla\([\s\S]*?\}, \[actual\.vista\]\);/);
  });

  it("⭐ una fase existente conserva la MISMA key en la vista de la propuesta (sigue abierta al alternar)", () => {
    /* La `key` de una fase creada en esta sesión es su `_key`, no su id: si la vista de la propuesta
       usara el id (o la clave del núcleo), esa fila se remontaría cerrada al alternar. La edición que
       la pone en rojo: `key: f.clave`, o buscar la fila actual por otra cosa que el id. */
    const vista = tramo(CANVAS, "const ganttPorId = new Map(", "const marcasDeLaPropuesta");
    expect(contiene(vista, "ganttPhases.filter((g) => g.id).map((g) => [g.id as string, g])")).toBe(true);
    expect(contiene(vista, "const actual = f.id ? ganttPorId.get(f.id) : undefined;")).toBe(true);
    expect(contiene(vista, "key: actual?.key ?? f.clave,")).toBe(true);
    // Y las marcas se buscan por ESA misma key.
    expect(contiene(CANVAS, "f.marca ? [[fasesDeLaPropuesta[i].key, f.marca] as const] : []")).toBe(true);
  });

  it("⛔ la proyección es SOLO LECTURA: nunca pasa por setPhases ni por el guardado (plan §3.4)", () => {
    /* La edición que la pone en rojo: meter las fases proyectadas en el estado editable (el
       autoguardado las mandaría como si el CSE las hubiera escrito). */
    expect(contiene(CANVAS, "const fasesDeLaPropuesta: GanttPhase[] = (revision.proyeccion?.fases ?? [])")).toBe(true);
    const llamadas = CANVAS.match(/setPhases\([^;]*;/g) ?? [];
    expect(llamadas.length).toBeGreaterThan(3);
    for (const llamada of llamadas) {
      expect(llamada).not.toContain("fasesDeLaPropuesta");
      expect(llamada).not.toContain("proyeccion");
    }
    expect(CANVAS).not.toMatch(/buildPutBody\([^)]*(fasesDeLaPropuesta|proyeccion)/);
  });

  it("la barra va arriba del Gantt, solo para quien edita, y aplica/descarta con la cadena de siempre", () => {
    const iBarra = rama.indexOf("<RevisionDeLaPropuesta");
    expect(iBarra).toBeGreaterThan(-1);
    expect(iBarra).toBeLessThan(rama.indexOf("<TimelineGantt"));
    expect(contiene(rama.slice(Math.max(0, iBarra - 160), iBarra), "canEdit && hayBorrador && revision.resumen && (")).toBe(true);
    expect(contiene(rama, "onAplicar={() => void aplicarBorrador()}")).toBe(true);
    expect(contiene(rama, "onDescartar={() => void discardProposal()}")).toBe(true);
    expect(contiene(rama, 'enCurso={aplicandoBorrador ? "aplicar" : descartando ? "descartar" : null}')).toBe(true);
  });

  it("⭐ el cierre fijado a mano se ve en las dos vistas, y la barra lo conoce", () => {
    /* Con `closeOverride={verPropuesta ? null : …}` la fecha del encabezado saltaba al alternar aunque
       nada moviera el cierre, y la barra nombraba un «antes» que no se veía en ningún lado. La
       edición que la pone en rojo: volver a esconder el cierre fijado en la vista de la propuesta. */
    expect(contiene(rama, "closeOverride={closeOverride}")).toBe(true);
    expect(rama).not.toMatch(/closeOverride=\{\s*verPropuesta/);
    expect(contiene(rama, "onSetCloseOverride={verPropuesta ? undefined : setCloseOverrideFromGantt}")).toBe(true);
    expect(contiene(rama, "cierreFijado={closeOverride || null}")).toBe(true);
  });

  it("⭐ aplicar: espera el guardado, limpia el deshacer, manda token + sin + huella + versión, y ofrece las tareas que faltan", () => {
    /* La edición que la pone en rojo: aplicar sin esperar lo que está guardándose (el servidor
       compararía contra otra foto), no mandar el token, o volver a pedir las tareas solo.
       ⚠ ACTUALIZADA en E2b P4 (2026-09-25), con esta razón: pedía la cadena vieja al paso 2
       (`pedirPropuestaDeDetalle(modoDeLaCadena, …)`), que se fue. Aplicar ya no pide nada solo: si las
       tareas no llegaron, las ofrece (`setOfrecerTareas(true)`).
       ⚠ REESCRITA en E2a P5 (2026-09-25), con esta razón: el body suma la `version` del
       `borrador-v1` que ves. Sin ella, cuando el servidor reescribe el borrador en el medio (llegan
       las tareas), el aplicar caía en PLAN_CAMBIO, recargaba lo vivo —`load` no reemplaza la
       propuesta de la pantalla— y volvía a caer: el bucle de 409. Con ella, la ruta responde
       PROPUESTA_CAMBIO y la pantalla trae la nueva. Aplicar sin versión la pone en rojo. */
    const aplicar = tramo(CANVAS, "const aplicarBorrador = async (", "useEffect(");
    expect(aplicar.length).toBeGreaterThan(1500);
    const iEspera = aplicar.indexOf("await esperarQueSeGuarde()");
    const iLimpia = aplicar.indexOf("clearScope(undoScope)");
    const iFetch = aplicar.indexOf("/timeline/borrador/aplicar");
    expect(iEspera).toBeGreaterThan(-1);
    expect(iEspera).toBeLessThan(iLimpia);
    expect(iLimpia).toBeLessThan(iFetch);
    /* ⚠ ACTUALIZADA en E3 P3 (2026-09-25), con esta razón: lo desmarcado se guarda en el servidor y cada
       casilla sube la versión que viaja. Aplicar espera también las casillas (`esperarCasillas`), después del
       guardado y antes de la pausa que deja adoptar lo último (y de leer `sin` y `version`): sin eso, un clic
       de hace 100 ms todavía en la cola haría caer el aplicar en PROPUESTA_CAMBIO, o mandaría un `sin` que
       el servidor no tiene. Si no se pudo guardar, no se aplica. Sacarla o moverla después de leer la
       revisión la pone en rojo. El literal del body no cambia en P3. */
    /* ⚠ ACTUALIZADA en E3 P5 (2026-09-25), con esta razón: aplicar devuelve su resultado (lo aplica también
       el chat), así que la espera de las casillas ya no es `if (await …) return;` sino que devuelve el motivo.
       Lo que se pide no cambia: espera después del guardado y antes de leer la revisión. */
    const iCasillas = aplicar.indexOf("const sinCasillas = await revisionRef.current.esperarCasillas();");
    expect(iCasillas, "aplicar no espera lo marcado").toBeGreaterThan(iEspera);
    expect(contiene(aplicar, "if (sinCasillas) return resultado(sinCasillas);"), "aplica aunque lo marcado no se guardó").toBe(true);
    expect(iCasillas, "aplicar lee la revisión antes de esperar lo marcado").toBeLessThan(
      aplicar.indexOf("const { resumen, sin, forzadas } = revisionRef.current;"),
    );
    expect(iCasillas).toBeLessThan(aplicar.indexOf("await new Promise<void>((r) => window.setTimeout(r, 60));"));
    expect(iCasillas).toBeLessThan(iLimpia);
    /* ⚠ ACTUALIZADA en E2c P3 (2026-09-25), con esta razón: quitar un cambio de fase ya no deja sus tareas fuera: se recalculan. Si el
       recálculo falla, «Aplicar de todos modos» manda las fases forzadas (`forzar`), que viven en el hook.
       ⚠ REESCRITA en E3 P5 (2026-09-25), con esta razón: el chat aplica con la lista que se ACORDÓ (D7). Desde el
       chat viajan la huella acordada, lo desmarcado del SERVIDOR (con lo que se calculó esa huella) y nada
       forzado; desde la barra, lo mismo que antes. Las ediciones que la ponen en rojo: mandar desde el chat la
       huella de la pantalla (aplicaría otra lista que la leída), forzar desde el chat, o dejar de mandar la
       versión o la foto. */
    const cuerpo = tramo(aplicar, "body: JSON.stringify({", "}),");
    expect(contiene(cuerpo, "token: proposalMeta.current.runId,")).toBe(true);
    expect(contiene(cuerpo, "sin: desdeElChat ? (excluidosDelGuardado(proposalRef.current) ?? [...sin]) : [...sin],")).toBe(true);
    expect(contiene(cuerpo, "huella: opts?.acordada?.huella ?? resumen.huella,")).toBe(true);
    /* ⚠ E4 (2026-09): la foto ya no viaja (solo servía para convertir el formato viejo, que ya no se lee).
       Volver a mandarla la pone en rojo. */
    expect(cuerpo, "volvió a mandar la foto").not.toMatch(/\bfoto\b/);
    expect(contiene(cuerpo, "version: revisionRef.current.version,")).toBe(true);
    expect(contiene(cuerpo, "forzar: desdeElChat ? [] : [...forzadas],")).toBe(true);
    /* E3 P5: desde el chat, la versión de la pantalla tiene que ser la acordada, DESPUÉS de esperar lo marcado
       (si va atrás, se trae la guardada y se compara una vez más); si no, no se escribe nada. */
    const iVersion = aplicar.indexOf("if (acordada === null || revisionRef.current.version !== acordada) return resultado(");
    expect(iVersion, "el chat aplica una lista que no es la acordada").toBeGreaterThan(iCasillas);
    expect(iVersion).toBeLessThan(iFetch);
    expect(aplicar.indexOf("await traerPropuestaPendiente();"), "si la pantalla va atrás no se trae la guardada").toBeLessThan(iVersion);
    // Y la versión es la de lo que se VE: sale de la propuesta del hook, no de otra lectura.
    expect(contiene(HOOK, "const version = useMemo(() => versionDelBorrador(propuesta), [propuesta]);")).toBe(true);
    expect(aplicar, "lee la revisión del render del clic, no la de ahora").toContain("revisionRef.current");
    expect(aplicar).toContain("pasoTrasResolver(");
    expect(aplicar, "aplicar volvió a pedir las tareas solo").not.toContain("pedirPropuestaDeDetalle(");
    expect(contiene(aplicar, 'if (siguiente === "ofrecer") {')).toBe(true);
    expect(aplicar).toContain("setOfrecerTareas(true);");
    // Un 409 de «el plan cambió» recarga lo vivo (misma propuesta); otro trae la propuesta nueva.
    expect(contiene(aplicar, 'if (d?.error === "PLAN_CAMBIO") {')).toBe(true);
    expect(aplicar).not.toContain("apply-items");
    // Con un descarte en curso no se aplica.
    // (E3 P5: devuelve el motivo en vez de nada: el chat lo dice.)
    expect(
      contiene(aplicar, "if (aplicandoBorrador || descartandoRef.current || !revisionRef.current.resumen) return resultado(MOTIVO_SIN_APLICAR);"),
    ).toBe(true);
  });

  it("⭐ descartar no corre dos veces: el ref frena el doble clic y el estado apaga los botones", () => {
    /* La edición que la pone en rojo: sacar el freno (dos DELETE: el segundo, 409 «otra propuesta»,
       cortaba la cadena y traía otra vez la propuesta) o no liberarlo si el DELETE falla. */
    const descartar = tramo(CANVAS, "const discardProposal = async (", "const aplicarBorrador = async (");
    expect(descartar.length).toBeGreaterThan(800);
    /* ⚠ ACTUALIZADA en E3 P5 (2026-09-25), con esta razón: descartar devuelve cómo terminó (el chat da éxito
       solo si el servidor la borró), así que el freno devuelve «fallo» en vez de nada. */
    const iFreno = descartar.indexOf('if (descartandoRef.current) return "fallo";');
    expect(iFreno).toBeGreaterThan(-1);
    expect(iFreno).toBeLessThan(descartar.indexOf("/timeline/proposal`"));
    expect(contiene(descartar, "finally { descartandoRef.current = false; setDescartando(false); }")).toBe(true);
  });

  it("⭐ lo desmarcado se recuerda por la identidad de la propuesta, y se olvida al resolverla", () => {
    /* La foto vivía solo en el estado del componente: cambiar de canvas o terminar «Chequear avance»
       la reemplazaba por una del cronograma ya editado (revisión de E1, 2026-09-24; el caso, en
       borrador.test.ts «12 · …»). La edición que la pone en rojo: no pasar el token o el proyecto al
       hook, no leer lo recordado al cambiar de propuesta, o no olvidarlo al aplicar/descartar.
       ⚠ REESCRITA en E4 (2026-09), con esta razón: la foto se fue (un v1 trae su `desde`). Lo que se
       recuerda es solo lo desmarcado; `revisionPara` ya no recibe lo vivo y el efecto no mira `base`. */
    expect(contiene(CANVAS, "token: hayBorrador ? proposalMeta.current.runId : null,")).toBe(true);
    expect(contiene(tramo(CANVAS, "const revision = useBorradorDelCronograma({", "});"), "projectId,")).toBe(true);
    expect(contiene(HOOK, "const clave = useMemo(() => claveDeRevision(propuesta, token), [propuesta, token]);")).toBe(true);
    expect(contiene(HOOK, "actual = revisionPara(clave, clave ? recordado(projectId, clave) : null);")).toBe(true);
    /* ⚠ ACTUALIZADA en E3 P3 (2026-09-25), con esta razón: lo desmarcado se guarda en el servidor, y lo
       que se recuerda en el navegador es lo desmarcado EFECTIVO (`sin`: lo del servidor con lo pendiente
       encima), no la memoria de la pantalla (`actual.sin`), así una vuelta atrás a E2c arranca con lo mismo
       que se veía. Recordar `actual.sin` (lo de antes de E3), o dejar de recordar, la pone en rojo. */
    expect(HOOK).toMatch(/useEffect\(\(\) => \{[\s\S]*?recordarRevision\([\s\S]*?\}, \[projectId, actual\.clave, sin\]\);/);
    expect(contiene(tramo(HOOK, "if (!actual.clave) return;", "}, ["), "const recuerdo = { sin: [...sin] };")).toBe(true);
    expect(HOOK, "volvió la foto al hook").not.toMatch(/actual\.base|foto:/);
    const aplicar = tramo(CANVAS, "const aplicarBorrador = async (", "useEffect(");
    expect(aplicar.indexOf("revisionRef.current.olvidar()")).toBeGreaterThan(-1);
    expect(aplicar.indexOf("revisionRef.current.olvidar()")).toBeLessThan(aplicar.indexOf("setProposal(null)"));
    const descartar = tramo(CANVAS, "const discardProposal = async (", "const aplicarBorrador = async (");
    /* ⚠ ACTUALIZADA en E4 (2026-09), con esta razón: se retiró «Pedir cambio con IA» y descartar ya no tiene
       la rama de su vista previa (`if (!eraDelModificador) {`): el DELETE corre siempre. Lo que se pide es
       lo mismo: olvidar la foto antes de limpiar la propuesta. */
    expect(tramo(descartar, 'if (descartandoRef.current) return "fallo";', "proposalMeta.current = { runId: null")).toContain(
      "revisionRef.current.olvidar()",
    );
  });

  it("⛔ el token que se lee en el render es el de la propuesta en pantalla: todo setProposal escribe proposalMeta", () => {
    /* El hook recibe `proposalMeta.current.runId` en el render. Eso vale porque CADA `setProposal`
       escribe `proposalMeta` antes (o dentro de su updater). La edición que la pone en rojo: un
       `setProposal` nuevo que no lo haga (la propuesta se mostraría con el token de otra). */
    const llamadas = [...CANVAS.matchAll(/setProposal\(/g)].map((m) => m.index!);
    expect(llamadas.length).toBeGreaterThan(6);
    for (const i of llamadas) {
      // Antes de la llamada, o adentro de su updater (`setProposal((prev) => { … })`).
      const conUpdater = CANVAS.startsWith("setProposal((", i);
      const alrededor = CANVAS.slice(Math.max(0, i - 400), i + (conUpdater ? 500 : 0));
      expect(alrededor, `setProposal sin proposalMeta cerca: «${CANVAS.slice(i, i + 60)}»`).toContain(
        "proposalMeta.current =",
      );
    }
    /* E2b P7 (2026-09-25): la autoría (quién y cuándo) viaja en el MISMO `proposalMeta` y se lee en el
       render igual que el token: por esta misma invariante, nunca se pinta la de otra propuesta. La
       edición que la pone en rojo: guardarla en un estado aparte, o leerla sin propuesta en pantalla. */
    expect(contiene(CANVAS, "const autoriaEnPantalla = proposal ? (proposalMeta.current.autoria ?? null) : null;")).toBe(true);
  });

  it("⭐ un 409 PROPUESTA_ABIERTA del PUT no deja un callejón: se trae la guardada y se dice", () => {
    /* Mientras el chat acuerda, alguien regenera el handoff: el PUT con motivo responde 409 con un texto
       que habla de una barra que no estaba. La edición que la pone en rojo: volver a mostrar el texto del
       servidor sin traer la propuesta.
       ⚠ ACTUALIZADA en E4 (2026-09), con esta razón: se retiró «Pedir cambio con IA». `anteLaPropuestaGuardada`
       queda en dos líneas (ya no hay vista previa que no se pueda pisar), salen el tramo de su aplicar
       (`applyProposal`) y la rama que descartaba su vista previa. El chat sigue igual. */
    const ruta = soloCodigo(leer("app/api/projects/[projectId]/timeline/route.ts"));
    expect(contiene(ruta, 'code: "PROPUESTA_ABIERTA"')).toBe(true);
    const ante = tramo(CANVAS, "const anteLaPropuestaGuardada = async (", "};");
    /* ⚠ ACTUALIZADA en la revisión de E4 (#5c), con esta razón: el texto sale de lo que se trajo
       (`mensajeDeLaPropuestaAbierta`): con algo que no se sabe leer ya no dice «aplícala». Sin traer, o sin
       nada guardado, el de siempre. */
    expect(
      contiene(
        ante,
        "=> { const traida = await traerPropuestaPendiente(); return traida.ok && traida.propuesta !== null ? mensajeDeLaPropuestaAbierta(traida.propuesta) : MENSAJE_PROPUESTA_ABIERTA;",
      ),
    ).toBe(true);
    expect(MENSAJE_PROPUESTA_ABIERTA).toContain("arriba del Gantt");
    const chat = tramo(CANVAS, "const aplicarOperacionesAcordadas = async (", "const discardProposal = async (");
    expect(contiene(chat, 'res.status === 409 && data?.code === "PROPUESTA_ABIERTA" ? await anteLaPropuestaGuardada()')).toBe(true);
    expect(CANVAS, "volvió el aplicar de la vista previa del modificador").not.toContain("const applyProposal");
  });

  it("con un borrador abierto se puede editar a mano: el autoguardado sigue, y el chat/«IA» siguen frenados", () => {
    /* Respuesta 2 de Elías: se puede seguir editando; lo que choque queda fuera. La edición que la
       pone en rojo: volver a frenar el autoguardado con cualquier propuesta. */
    /* ⚠ ACTUALIZADA en E4 (2026-09), con esta razón: se retiró «Pedir cambio con IA», cuya vista previa
       congelaba el Gantt. El autoguardado ya no mira la propuesta (tampoco una que no se sabe leer). */
    expect(contiene(CANVAS, "if (!dirty || saving || !canEdit) return;")).toBe(true);
    /* ⚠ ACTUALIZADA en E2a P6 (2026-09-25), con esta razón: suma la guarda de «Regenerar todo» /
       «Generar cronograma» (`pedirPropuestaDeDetalle`): con UN borrador por proyecto, pedir otra
       propuesta con una abierta se frena antes del paso 1. Lo que se protege es lo mismo: las guardas
       frenan, el autoguardado no. */
    /* ⚠ Y en E4 (2026-09) la cuenta pasa de 3 a 2: la guarda del modificador (`submitAssist`) se fue con él.
       Quedan el chat y «Regenerar todo». */
    expect(CANVAS.match(/if \(hayBorrador\) \{/g)?.length, "las dos guardas (chat y «Regenerar todo»)").toBe(2);
  });

  it("⭐ «Subir al cliente» queda LIBRE con un borrador abierto, con el aviso (respuesta 4 de Elías)", () => {
    /* La edición que la pone en rojo: volver a esconder el PublishBar con cualquier propuesta, o
       perder el aviso. */
    /* ⚠ ACTUALIZADA en E4 (2026-09), con esta razón: la condición perdió `(!proposal || hayBorrador)`, que
       solo escondía la barra con la vista previa de «Pedir cambio con IA» (se retiró). Subir queda libre. */
    expect(contiene(CANVAS, "{canEdit && phases.length > 0 && (<PublishBar")).toBe(true);
    const barra = tramo(CANVAS, "<PublishBar", "/>");
    expect(barra.length).toBeGreaterThan(200);
    expect(barra).toContain("AVISO_SUBIR_CON_PROPUESTA");
    const modal = tramo(CANVAS, "{publishReasonOpen && (", "<textarea");
    expect(modal.length).toBeGreaterThan(200);
    expect(contiene(modal, "{hayBorrador && (")).toBe(true);
    expect(modal).toContain("{AVISO_SUBIR_CON_PROPUESTA}");
  });

  it("lo viejo se fue: ni franja, ni recuadros «Sugerencia», ni filas fantasma, ni apply-items en pantalla", () => {
    expect(fs.existsSync(path.join(process.cwd(), "components/canvas/ProposalGlobalStrip.tsx"))).toBe(false);
    // E4 (2026-09): y las tres rutas lápida ya no existen.
    for (const ruta of ["proposal/apply-items", "phases/[phaseId]/apply", "detail/apply-all"]) {
      expect(fs.existsSync(path.join(process.cwd(), `app/api/projects/[projectId]/timeline/${ruta}/route.ts`)), ruta).toBe(false);
    }
    expect(CANVAS).not.toContain("ProposalGlobalStrip");
    expect(CANVAS).not.toContain("resolveProposalItems");
    expect(CANVAS).not.toContain("proposal/apply-items");
    expect(GANTT).not.toContain("onResolveProposalDelta");
    expect(GANTT).not.toContain("Fase propuesta");
    expect(GANTT).not.toContain("proposalGlobalSlot");
  });

  it("una propuesta que no se sabe leer no traba nada: una línea ofrece descartarla y el Gantt sigue editable", () => {
    /* ⚠ REESCRITA en E4 (2026-09), con esta razón: se retiró «Pedir cambio con IA». Esta guarda pedía que su
       vista previa no leyera un `borrador-v1` (`proposal.phases` no existe ahí y reventaba). Sin vista previa,
       lo guardado que no es un borrador (`propuestaIlegible`) se dice en una línea con «Descartarla», el
       autoguardado no se frena y el Canvas no lee ningún campo de la propuesta a mano. Las ediciones que la
       ponen en rojo: volver a frenar el autoguardado con una propuesta, sacar la línea, o volver a leer
       `proposal.phases`. */
    /* ⚠ ACTUALIZADA en E4 P4 (2026-09), con esta razón: `esBorradorGuardado` se borró con el lector viejo.
       Lo guardado es siempre un v1: todo lo que no lo es cae en `propuestaIlegible`. */
    expect(contiene(CANVAS, "const hayBorrador = !!proposal && esBorradorV1(proposal);")).toBe(true);
    expect(contiene(CANVAS, "const propuestaIlegible = !!proposal && !hayBorrador;")).toBe(true);
    const linea = tramo(CANVAS, "{propuestaIlegible && (", "</div>");
    expect(linea).toContain("Descartarla");
    /* ⚠ ACTUALIZADA en la revisión de E4 (#1), con esta razón: «Descartarla» borraba sin preguntar, y en el rato
       entre el deploy y la conversión las 6 viejas se ven así. Ahora abre una confirmación que dice que lo que
       proponía se pierde de la pantalla, y recién ella descarta, avisándole al servidor que es lo ilegible (guarda
       una copia; si ya se convirtió, 409 y se trae). Descartar directo desde la línea, o sin `ilegible`, la pone
       en rojo. */
    expect(contiene(linea, "onClick={() => setConfirmarDescarteIlegible(true)}")).toBe(true);
    expect(linea, "la línea descarta sin preguntar").not.toContain("discardProposal(");
    const confirmacion = tramo(CANVAS, "open={confirmarDescarteIlegible}", "/>");
    expect(contiene(confirmacion, 'description="Lo que proponía se pierde de la pantalla. El cronograma no cambia."')).toBe(true);
    expect(contiene(confirmacion, "await discardProposal(undefined, { ilegible: true });")).toBe(true);
    expect(contiene(CANVAS, "...(opts?.ilegible ? { ilegible: true } : {}),"), "el DELETE no dice que descarta lo ilegible").toBe(true);
    const autoguardado = tramo(CANVAS, "if (!dirty ||", "return;");
    expect(autoguardado, "el autoguardado volvió a frenarse con una propuesta").not.toContain("proposal &&");
    expect(CANVAS, "el Canvas volvió a leer las fases de la propuesta a mano").not.toMatch(/proposal\??\.phases/);
    /* E4 P4: el formato viejo pasó de `hayBorrador` a `propuestaIlegible`, pero sigue guardado y el PUT con
       motivo respondería 409: el botón de un acuerdo del chat dice que se resuelve en su línea, como antes
       («Resuelve la propuesta en su barra»). La edición que la pone en rojo: sacar esa línea (el botón
       quedaría vivo y fallaría), o ponerla después de `if (!hayBorrador) return null;`. */
    /* ⚠ REESCRITA en la revisión de E3 (#24), con esta razón: la regla salió a `motivoParaElAcuerdo` (pura), así
       que se CORRE: sin propuesta en el acuerdo y con algo ilegible guardado, «Resuelve la propuesta en su
       barra» (no null). Y el cronograma le pasa `propuestaIlegible`. */
    const motivo = tramo(CANVAS, "const motivoDelChat = (a: AcuerdoDelChat): string | null =>", "const pasarALaPropuesta");
    expect(contiene(motivo, "ilegible: propuestaIlegible,"), "el cronograma no le dice a la regla que hay algo ilegible").toBe(true);
    const ilegible = { hayBorrador: false, ilegible: true, token: null, version: null, conDesconocidos: false, tareasArmando: false, bloqueada: false };
    /* ⚠ ACTUALIZADA en la revisión de E4 (#5c), con esta razón: el motivo decía «Resuelve la propuesta en su
       barra» y lo ilegible no tiene barra. Ahora «Descártala arriba del Gantt» (su tabla, en
       textos-del-acuerdo.test.ts). */
    expect(
      motivoParaElAcuerdo({ borrador: null, operaciones: [{ op: "fase.duracion" }] }, ilegible),
      "con una propuesta que no se sabe leer, el botón del chat queda vivo",
    ).toBe(MOTIVOS_DEL_CHAT.ilegible);
  });
});

/**
 * ── E2a P5 · LA PANTALLA REVISA TAREAS (2026-09-25) ──────────────────────────────────────────────
 * «Regenerar todo» deja UNA propuesta con fases y tareas. La pantalla la revisa en la misma barra:
 * las tareas agrupadas por fase, la línea de la corrida que las arma, la corrida seguida con
 * `useAgentRun` y un solo aviso. Inerte hasta P6 (nadie escribe todavía un `borrador-v1`): lo que
 * se mira acá es el cableado. Cada `it` nombra la edición que lo pone en rojo.
 */
describe("E2a P5 · la pantalla revisa las tareas de la propuesta", () => {
  const rama = tramo(CANVAS, '<div id="cronograma-gantt"', "<TaskDetailDrawer");
  const VIVO_VACIO: Vivo = { ancla: null, fases: [] };

  it("⭐ la corrida que arma las tareas se SIGUE con `track(`, y el aviso del sistema sale solo de ese seguimiento", () => {
    /* [A23] `track` marca la corrida como anunciada en el centro de corridas: el aviso del cronograma
       es el del seguimiento. La edición que la pone en rojo: volver a llamar a `notifyAgentDone` en
       otro lado (el error de «Generar cronograma», el aplicar del acordeón viejo), dejar de seguir la
       corrida, o seguirla sin releer la propuesta al terminar. */
    const seguimiento = tramo(CANVAS, "const { phase: faseDelArmado, track } = useAgentRun(clientId);", "const tareasDeLaBarra");
    expect(seguimiento.length).toBeGreaterThan(600);
    expect(seguimiento).toContain("await track(corrida)");
    expect(seguimiento.indexOf("await traerPropuestaPendiente()"), "al terminar no se relee la propuesta").toBeGreaterThan(
      seguimiento.indexOf("await track(corrida)"),
    );
    expect(seguimiento.match(/notifyAgentDone\(/g)?.length, "el seguimiento no avisa al terminar").toBe(1);
    expect(
      CANVAS.match(/notifyAgentDone\(/g)?.length,
      "hay un aviso del sistema del cronograma FUERA del seguimiento: la misma corrida se anuncia dos veces",
    ).toBe(1);
    // Remontado a mitad de camino (cambiar de pieza y volver), el seguimiento viejo y el nuevo avisan UNA vez.
    const iYaAnunciada = seguimiento.indexOf("if (CORRIDAS_ANUNCIADAS.has(corrida)) return;");
    expect(iYaAnunciada, "dos seguimientos de la misma corrida avisan dos veces").toBeGreaterThan(-1);
    expect(iYaAnunciada).toBeLessThan(seguimiento.indexOf("notifyAgentDone("));
    expect(iYaAnunciada, "sin releer la propuesta, el cronograma remontado queda «armando»").toBeGreaterThan(
      seguimiento.indexOf("await traerPropuestaPendiente()"),
    );
    /* ~6 min sin terminar: se relee y se vuelve a seguir (no queda «armando» para siempre).
       ⚠ ACTUALIZADA en la revisión de E2a (2026-09-25), con esta razón: pedía `if (r.status ===
       "TIMEOUT") {` en el Canvas. Qué hacer al terminar (seguir, callar o avisar) lo decide ahora
       `desenlaceDelSeguimiento` (borrador.ts), que se prueba LLAMÁNDOLO en borrador-tareas.test.ts:
       «armando» (el TIMEOUT de siempre) y un GET que falló siguen. Acá se pide que el Canvas la use y
       que «seguir» vuelva a mirar ANTES de dar la corrida por avisada. */
    const iDesenlace = seguimiento.indexOf("desenlaceDelSeguimiento({");
    expect(iDesenlace, "el Canvas decide solo qué avisar").toBeGreaterThan(seguimiento.indexOf("await traerPropuestaPendiente()"));
    const seguir = tramo(seguimiento, 'if (desenlace.que === "seguir") {', "}");
    expect(contiene(seguir, "setVueltaDelSeguimiento((n) => n + 1);")).toBe(true);
    expect(contiene(seguir, "return;")).toBe(true);
    expect(seguimiento.indexOf('if (desenlace.que === "seguir") {'), "un GET fallido da la corrida por avisada").toBeLessThan(
      iYaAnunciada,
    );
    /* El GET que falla NO es «no hay propuesta»: la lectura llega como null y el desenlace sigue.
       ⚠ ACTUALIZADA en E2c P3 (2026-09-25), con esta razón: quitar un cambio de fase ya no deja sus tareas fuera: se recalculan; la lectura suma
       el recálculo del mismo GET, que decide el aviso de su corrida. */
    expect(
      contiene(
        seguimiento,
        "lectura: leida.ok ? { hayPropuesta: leida.propuesta !== null, tareas: leida.tareas, recalculo: leida.tareas?.recalculo ?? null } : null,",
      ),
    ).toBe(true);
    // (El marcador no cierra el paréntesis: desde E3 la firma trae su tipo de retorno.)
    const traer = tramo(CANVAS, "const traerPropuestaPendiente = async (", "const anteLaPropuestaGuardada");
    expect(contiene(traer, "if (!res.ok) return { ok: false };"), "un 5xx se lee como «no hay propuesta»").toBe(true);
    expect(contiene(traer, "} catch { return { ok: false }; }"), "un error de red se lee como «no hay propuesta»").toBe(true);
    // Nunca el código crudo de la corrida en el aviso: el texto sale del desenlace.
    expect(seguimiento, "el aviso volvió a leer el error crudo de la corrida").not.toMatch(/toast\.\w+\(r\.(error|timelineSyncError)/);
    /* Revisión de E2b: lo que notó una corrida que terminó sin cambios va a la franja «La IA también
       notó» (el toast solo dice el desenlace y cuántas: lo prueba borrador-tareas.test.ts). La edición que
       la pone en rojo: no sumarlo a la franja, o reemplazar lo que la franja ya mostraba. */
    expect(contiene(seguimiento, 'const notadas = desenlace.que === "avisar" ? desenlace.observaciones : undefined;')).toBe(true);
    expect(
      contiene(seguimiento, "if (notadas && notadas.length > 0) setObservacionesPaso1((previas) => juntarObservaciones(previas, notadas));"),
      "lo notado de una corrida sin cambios no llega a la franja",
    ).toBe(true);
    /* Solo quien edita recibe el aviso: la barra y la línea son suyas.
       ⚠ REESCRITA en el cierre de la revisión de E2a (2026-09-25), con esta razón: pedía que quien solo
       mira NO siguiera la corrida («le alcanza el chip»), y su chip «Armando las tareas…» quedaba fijo
       hasta recargar: nadie volvía a leer el cronograma. Ahora la sigue en silencio: al terminar se relee
       (el chip se apaga) y el aviso sale solo con el permiso de editar, leído AL TERMINAR (`useMe` puede
       llegar después). Las ediciones que la ponen en rojo: volver a cortar el seguimiento con `canEdit`,
       o avisar antes de mirar el permiso. */
    expect(
      contiene(seguimiento, "if (!corridaQueArma || siguiendoRef.current === corridaQueArma) return;"),
      "quien solo mira no sigue la corrida: su chip queda «Armando las tareas…» hasta recargar",
    ).toBe(true);
    expect(seguimiento, "el seguimiento vuelve a cortarse para quien solo mira").not.toMatch(/if \(!canEdit \|\|/);
    const iPermiso = seguimiento.indexOf("if (!puedeEditarRef.current) return;");
    expect(iPermiso, "quien solo mira recibe «revísala arriba del Gantt» sin barra").toBeGreaterThan(
      seguimiento.indexOf('if (desenlace.que === "seguir") {'),
    );
    expect(iPermiso, "se da por avisada antes de mirar el permiso").toBeLessThan(iYaAnunciada);
    expect(contiene(CANVAS, "useEffect(() => { puedeEditarRef.current = canEdit; });")).toBe(true);
    expect(contiene(seguimiento, "}, [corridaQueArma, vueltaDelSeguimiento]);")).toBe(true);
    /* ⚠ REESCRITA en E4 (2026-09), con esta razón: se retiró «Pedir cambio con IA». Con su vista previa en
       pantalla la guardada se LEÍA sin ponerla (`soloLeer`, `conVistaPrevia`); sin ella, el seguimiento
       siempre la trae y la pone. Lo que se sigue pidiendo: que se lea siempre (nunca `? null`), y que traer
       la ponga en pantalla. La edición que la pone en rojo: volver a no leer, o a leer sin ponerla. */
    expect(seguimiento, "el aviso de las tareas se pierde").not.toMatch(/\?\s*null\s*:\s*await traerPropuestaPendiente/);
    expect(contiene(seguimiento, "const leida = await traerPropuestaPendiente();")).toBe(true);
    expect(seguimiento, "volvió la vista previa del modificador al seguimiento").not.toMatch(/conVistaPrevia|soloLeer/);
    expect(traer, "volvió el leer sin poner").not.toContain("soloLeer");
    expect(contiene(traer, "setProposal(nueva);"), "traer no pone la guardada en pantalla").toBe(true);
    /* Descartar A MANO mientras se arman las tareas: su corrida termina sin aviso (ni «PROPUESTA_CAMBIO»,
       ni «no propone cambios»). La edición que la pone en rojo: no darla por avisada al descartar. */
    const descartar = tramo(CANVAS, "const discardProposal = async (", "const aplicarBorrador = async (");
    /* ⚠ ACTUALIZADA en la revisión de E2c (2026-09-25), con esta razón: también la corrida del RECÁLCULO (si en ese minuto entraba
       otra propuesta, avisaba «Listas las tareas recalculadas…» sobre la otra). Cuáles son las dos lo dice
       `corridasDeLaPropuesta` (su guarda la llama, en recalculo-de-tareas.test.ts); acá, que se usen al
       descartar (leídas ANTES de limpiar) y al aplicar. */
    expect(contiene(descartar, "const corridasDescartadas = corridasDeLaPropuesta(tareasEnPantalla);")).toBe(true);
    expect(descartar.indexOf("corridasDeLaPropuesta(tareasEnPantalla)"), "se leen después de limpiar").toBeLessThan(
      descartar.indexOf("setTareasDelBorrador(null)"),
    );
    /* ⚠ ACTUALIZADA en la revisión de E3 (#14), con esta razón: «ya no está guardada» lo dice ahora
       `trasElDescarte` (puro, con su tabla en propuesta-de-estructura.test.ts): `tras.olvidar`. */
    expect(
      contiene(descartar, "if (tras.olvidar && !reason) for (const c of corridasDescartadas) CORRIDAS_ANUNCIADAS.add(c);"),
      "las corridas de una propuesta descartada a mano siguen avisando",
    ).toBe(true);
    const aplicarLas = tramo(CANVAS, "const aplicarBorrador = async (", "useEffect(");
    expect(contiene(aplicarLas, "const corridasResueltas = corridasDeLaPropuesta(tareasEnPantalla);")).toBe(true);
    expect(
      contiene(tramo(aplicarLas, "revisionRef.current.olvidar();", "await load();"), "for (const c of corridasResueltas) CORRIDAS_ANUNCIADAS.add(c);"),
      "las corridas de una propuesta aplicada siguen avisando",
    ).toBe(true);
    /* Se sigue la corrida del MISMO GET que dio el estado, y solo el de la propuesta en pantalla.
       ⚠ ACTUALIZADA en E2c P3 (2026-09-25), con esta razón: quitar un cambio de fase ya no deja sus tareas fuera: se recalculan, y la corrida del
       recálculo también se sigue (después de la del armado de las tareas). */
    expect(
      contiene(
        CANVAS,
        'const corridaQueArma = tareasEnPantalla?.estado === "armando" ? tareasEnPantalla.corrida : tareasEnPantalla?.recalculo?.estado === "armando" ? tareasEnPantalla.recalculo.corrida : null;',
      ),
    ).toBe(true);
    expect(
      contiene(
        CANVAS,
        "hayBorrador && tareasDelBorrador && tareasDelBorrador.token === proposalMeta.current.runId ? tareasDelBorrador : null;",
      ),
      "el estado de las tareas de OTRA propuesta se pinta sobre la de la pantalla",
    ).toBe(true);
    // Los tres lectores del GET lo leen.
    expect(CANVAS.match(/setTareasDelBorrador\(tareasDelGet\(data\)\);/g)?.length, "load, refrescarPropuesta y traerPropuestaPendiente").toBe(
      3,
    );
  });

  it("⭐ el cronograma que se compara lleva sus TAREAS, con las fechas fijadas a mano [D7]", () => {
    /* Sin las tareas, un «se quita» no ve la tarea viva y choca siempre; sin las fechas fijadas, una
       tarea que alguien fijó a mano después de la propuesta se borraría como si nadie la hubiera tocado.
       La edición que la pone en rojo: sacar las tareas del `vivo`, o dejar las fechas en null. */
    const vivo = tramo(CANVAS, "const vivo: Vivo = useMemo(", "[phases, anchor],");
    expect(vivo.length).toBeGreaterThan(400);
    expect(contiene(vivo, "tareas: p.tasks")).toBe(true);
    expect(contiene(vivo, ".filter((t): t is TaskDraft & { id: string } => !!t.id)"), "una tarea sin guardar no existe para la base").toBe(true);
    expect(contiene(vivo, "inicioFijado: diaFijado(t.startDateOverride),")).toBe(true);
    expect(contiene(vivo, "finFijado: diaFijado(t.dueDateOverride),")).toBe(true);
    expect(contiene(vivo, "status: t.status,")).toBe(true);
    expect(contiene(vivo, 'source: t.source ?? "AGENT",')).toBe(true);
  });

  it("⭐ en «Ver la propuesta» se ven las tareas nuevas, y una que ya existe es la MISMA fila (misma key)", () => {
    /* La edición que la pone en rojo: volver a pintar las tareas del cronograma actual (sin las nuevas
       y con las que se van), o darle a una existente otra `key` (se remontaría al alternar). */
    const vista = tramo(CANVAS, "const ganttPorId = new Map(", "const marcasDeLaPropuesta");
    expect(contiene(vista, "const tasks: GanttTask[] = f.tareas.map((t) => {")).toBe(true);
    /* ⚠ ACTUALIZADA en E3 P3 (2026-09-25), con esta razón: una tarea que ya existe puede CAMBIAR (título,
       semana, dueño, tipo) o MUDARSE de fase conservando su estado (`tarea-cambia`). Su fila se busca en
       TODO el Gantt (la que se muda viene de otra fase: buscarla solo en la suya la pintaba como nueva, sin
       su avance) y se ve con lo que propone. Buscarla solo en su fase, o pintarla con el título de hoy, la
       pone en rojo. */
    expect(
      contiene(vista, "const filaPorId = new Map(ganttPhases.flatMap((g) => g.tasks).filter((t) => t.id).map((t) => [t.id as string, t]));"),
      "la fila de una tarea que se muda se busca solo en su fase",
    ).toBe(true);
    expect(contiene(vista, "if (fila) return { ...fila, title: t.title, weekIndex: t.weekIndex, party: t.party, type: t.type };")).toBe(true);
    expect(vista, "la fila se volvió a buscar solo en la fase actual").not.toContain("(actual?.tasks ?? []).filter((t) => t.id).map(");
    expect(contiene(vista, "key: t.clave,")).toBe(true);
    expect(vista, "las tareas volvieron a salir del cronograma actual").not.toContain("tasks: (actual?.tasks ?? []).map(");
  });

  it("⭐ la barra: el título cuenta fases y tareas, la línea de la corrida, sin la chapa vieja, y la confirmación de quitar", () => {
    /* La edición que la pone en rojo: volver al título que cuenta solo «cambios», no pintar la línea
       (o pintarla con las tareas listas), volver a la chapa «Paso 1 de 2», o volver al texto fijo de la
       confirmación, que promete no borrar ninguna tarea justo cuando aplicar QUITA tareas.
       ⚠ REESCRITA AL REVÉS en E2b P4 (2026-09-25), con esta razón: pedía la chapa de la cadena vieja
       (`encadenado && delContexto && !esV1`), que solo iba en una propuesta vieja de las reuniones. La
       cadena se fue con su prop: la barra no sabe de `encadenado` ni pinta la chapa. */
    expect(contiene(BARRA, "{tituloDeLaBarra(resumen)}")).toBe(true);
    /* E2b P5a (2026-09-25): de dónde viene lo dice `desde`, con UNA clasificación (`deDondeViene`, que
       se prueba en borrador.test.ts). La barra decía «desde el último handoff» para todo lo que no era
       «contexto»: ya era falso con la regla del handoff, y lo sería para «Regenerar» de una fase. La
       edición que la pone en rojo: volver al texto fijo, o que el Canvas arme `desde` por su cuenta. */
    expect(contiene(BARRA, '<span className="text-xs text-fg-muted">{desde}</span>'), "la barra no dice de dónde viene").toBe(true);
    expect(BARRA, "volvió el texto fijo del origen").not.toContain("desde el último handoff");
    expect(BARRA).not.toContain("delContexto");
    /* ⚠ ACTUALIZADA en E2b P7 (2026-09-25), con esta razón: con la autoría del GET, la barra dice
       también quién la dejó y cuándo (`fraseDeAutoria`, que parte de la misma clasificación). Sin
       autoría (la vista previa del modificador, o el paso 1 recién guardado) sigue `deDondeViene`. */
    expect(
      contiene(rama, "desde={autoriaEnPantalla ? fraseDeAutoria(autoriaEnPantalla) : desdeDeLaPropuesta(deDondeViene(proposal))}"),
      "el Canvas no le dice a la barra de dónde viene",
    ).toBe(true);
    expect(contiene(BARRA, 'const lineaDeTareas = tareas && tareas.estado !== "listas" ? tareas : null;')).toBe(true);
    expect(contiene(tramo(BARRA, "{lineaDeTareas && (", "/>"), "onAccion={onArmarTareas}")).toBe(true);
    expect(BARRA, "volvió la prop de la cadena vieja").not.toMatch(/\bencadenado\b/);
    expect(BARRA).not.toContain("esV1");
    expect(CANVAS, "el Canvas le vuelve a pasar la cadena a la barra").not.toContain("encadenado={");
    const confirmacion = tramo(BARRA, "<ConfirmDialog", "/>");
    expect(contiene(confirmacion, 'variant={resumen.borraAlgo ? "destructive" : "default"}')).toBe(true);
    expect(contiene(confirmacion, "{textoDeLaConfirmacion(resumen)}")).toBe(true);
    expect(confirmacion, "volvió el texto fijo que promete no borrar ninguna tarea").not.toContain("No se borra ninguna fase");
    /* Revisión de E2a: la primera oración sale de `resumenDeLaConfirmacion` (fases y tareas por
       separado, sin «: .»; se prueba en borrador-tareas.test.ts). La edición que la pone en rojo:
       volver a armarla con `redactarResumenDeCambios`, que solo cuenta fases. */
    expect(contiene(confirmacion, "{resumenDeLaConfirmacion(resumen)} {cierre}"), "la confirmación no cuenta las tareas").toBe(true);
    expect(BARRA, "la confirmación volvió a contar solo las fases").not.toContain("redactarResumenDeCambios");
    expect(BARRA).toContain('aria-label="Propuesta de cambios del cronograma"');
    // Las tareas van debajo de la lista de fases.
    expect(BARRA.indexOf("<TareasDeLaPropuesta")).toBeGreaterThan(BARRA.indexOf("</ol>"));
    // Y el Canvas le pasa el estado de la propuesta en pantalla, y el botón pide el paso 2 sobre ella.
    expect(contiene(rama, "tareas={tareasDeLaBarra}")).toBe(true);
    /* ⚠ ACTUALIZADA en la revisión de E2a (2026-09-25), con esta razón: la acción se define UNA vez
       (`armarLasTareas`) para la barra y la línea suelta, y solo existe con el permiso que el servidor
       exige (`generate` en la primera pasada, `regenerate` después): sin él se ofrecía y el servidor
       respondía 403. Sigue pidiendo el paso 2 sobre la propuesta, saltando el paso 1. La edición que
       la pone en rojo: pedir fases de nuevo, u ofrecer el botón sin mirar el permiso. */
    /* ⚠ ACTUALIZADA en E2c P3 (2026-09-25), con esta razón: quitar un cambio de fase ya no deja sus tareas fuera: se recalculan, con la MISMA
       vara que «Armar las tareas»: la condición de permiso pasa a UNA constante (`puedeArmarTareas`),
       que usan las dos. */
    expect(
      contiene(CANVAS, 'const puedeArmarTareas = revision.borrador?.pedido === "primera" ? canGenerateTimeline : canRegenerateTimeline;'),
      "la vara de «Armar las tareas» dejó de ser la de siempre",
    ).toBe(true);
    const armar = tramo(CANVAS, "const armarLasTareas =", ": undefined;");
    expect(
      contiene(
        armar,
        'puedeArmarTareas ? () => void pedirPropuestaDeDetalle(revision.borrador?.pedido === "primera" ? "primera" : "regen", { saltarEstructura: true, })',
      ),
      "«Armar las tareas» / «Volver a intentar» no piden el paso 2 sobre la propuesta, o se ofrecen sin permiso",
    ).toBe(true);
    expect(contiene(rama, "onArmarTareas={armarLasTareas}")).toBe(true);
    /* E2b P5a (2026-09-25): con «Regenerar» de una fase en pantalla (`soloFase`) no hay «Armar las
       tareas» ni «Volver a intentar», ni en la barra ni en la línea (las dos usan `armarLasTareas`). Si
       no, tomaría el token de ESA propuesta y armaría las tareas de todo el cronograma: una corrida
       pagada que nadie pidió. La edición que la pone en rojo: sacar la condición de `soloFase`. */
    expect(
      contiene(armar, "const armarLasTareas = !revision.borrador?.soloFase && puedeArmarTareas"),
      "«Volver a intentar» de una fase arma las tareas de todo el cronograma",
    ).toBe(true);
    /* ⚠ ACTUALIZADA en E2b P4 (2026-09-25), con esta razón: la línea suelta suma el estado «ofrecer»
       (sin propuesta: pide el paso 2 sin token). En los demás estados sigue siendo `armarLasTareas`. */
    expect(
      contiene(
        tramo(rama, "<LineaDeLasTareas", "/>"),
        'onAccion={ lineaSuelta.estado === "ofrecer" ? () => void pedirPropuestaDeDetalle(hasAiDetail ? "regen" : "primera", { saltarEstructura: true }) : armarLasTareas }',
      ),
    ).toBe(true);
    expect(BARRA, "la barra exige la acción aunque no haya permiso").toMatch(/onArmarTareas\?: \(\) => void;/);
    expect(LINEA).toMatch(/\{linea\.accion && onAccion && \(/);
    // El encabezado: con tareas no cuenta «57 cambios» mezclados.
    expect(contiene(CANVAS, '{revision.resumen.grupos.length > 0 ? "Revisar la propuesta"')).toBe(true);
  });

  it("la casilla de un grupo marca o desmarca TODAS sus tareas marcables de una vez (`marcarCambios`)", () => {
    /* La edición que la pone en rojo: que el grupo marque solo la primera, que marque también las que
       chocan o quedaron fuera con su cambio de fase, o que el hook no le pase la función a la barra. */
    const e = { ...REVISION_VACIA, clave: "tok|v1" };
    const sinDos = marcarCambios(e, ["t:a", "t:b"], false);
    expect([...sinDos.sin].sort()).toEqual(["t:a", "t:b"]);
    expect([...marcarCambios(sinDos, ["t:a", "t:b"], true).sin]).toEqual([]);
    expect(marcarCambios(e, [], false), "sin claves no hay estado nuevo que recordar").toBe(e);
    /* ⚠ ACTUALIZADA en E2c P3 (2026-09-25), con esta razón: quitar un cambio de fase ya no deja sus tareas fuera: se recalculan. Cada casilla
       del CSE suma una marca (arranca la espera del recálculo), y la lista de tareas recibe en qué está
       el recálculo para decirlo en cada grupo desfasado. */
    /* ⚠ ACTUALIZADA en E3 P3 (2026-09-25), con esta razón: lo desmarcado se guarda en el servidor. Las dos
       casillas pasan por `tocar`: con un `borrador-v1` y quien edita, a la cola que sube al servidor
       (`cola.clic`, todas las claves en UN clic); si no, a la memoria de la pantalla con `marcarCambios`
       (todas de una vez), como antes. Que el grupo marque clave por clave, o que la cola deje de usarse, la
       pone en rojo. */
    expect(contiene(HOOK, "(claves: readonly string[], incluir: boolean) => { tocar(claves, incluir);")).toBe(true);
    const tocar = tramo(HOOK, "const tocar = useCallback(", "const marcar = useCallback(");
    expect(contiene(tocar, "const cola = paraEnviarRef.current.compartidas ? colaDeAhora() : null;")).toBe(true);
    expect(contiene(tocar, "if (cola) cola.clic(claves, incluir);")).toBe(true);
    expect(contiene(tocar, "else setRevision((r) => marcarCambios(r, claves, incluir));")).toBe(true);
    expect(contiene(rama, "onMarcarVarios={revision.marcarVarios}")).toBe(true);
    expect(
      contiene(
        BARRA,
        "<TareasDeLaPropuesta grupos={grupos} onMarcar={onMarcar} onMarcarVarios={onMarcarVarios} trabajando={trabajando} recalculo={recalculo} />",
      ),
    ).toBe(true);
    expect(TAREAS.length).toBeGreaterThan(2000);
    expect(contiene(TAREAS, "const marcables = g.tareas.filter((t) => t.seMarca);")).toBe(true);
    expect(contiene(TAREAS, "onMarcarVarios( marcables.map((t) => t.clave), e.target.checked, )")).toBe(true);
    expect(contiene(TAREAS, "disabled={trabajando || !t.seMarca}")).toBe(true);
    expect(contiene(TAREAS, "disabled={trabajando || marcables.length === 0}")).toBe(true);
  });

  it("⭐ el hook: sin cambios no hay barra, pero «nada que decidir» sale igual del plan [D11]", () => {
    /* Un v1 recién marcado «armando» no tiene cambios todavía: la barra no se monta vacía, pero el
       descarte automático tiene que saber que ESPERA tareas (no se descarta) y que uno vacío cuya
       corrida falló sí. La edición que la pone en rojo: volver a `resumen ? … : false` (el vacío en
       «fallo» quedaría para siempre), o calcular la barra sin cambios. */
    /* ⚠ ACTUALIZADA en E2c P3 (2026-09-25), con esta razón: quitar un cambio de fase ya no deja sus tareas fuera: se recalculan; si el recálculo
       falla, las fases forzadas («Aplicar de todos modos») entran al plan de la pantalla igual que al
       del servidor (si no, las huellas no coincidirían). */
    /* ⚠ ACTUALIZADA en E3 P3 (2026-09-25), con esta razón: lo desmarcado se guarda en el servidor. El plan
       y la barra se calculan con lo desmarcado EFECTIVO (`sin`: lo del servidor con los clics pendientes
       encima), no con la memoria de la pantalla (`actual.sin`): si no, lo que marcó otra computadora no se
       vería. Volver a `actual.sin` la pone en rojo. */
    expect(contiene(HOOK, "borrador && borrador.cambios.length > 0 ? resumir(vivo, borrador, sin, { tareas, forzar: forzadas }) : null")).toBe(
      true,
    );
    expect(contiene(HOOK, "const proyeccion = resumen?.proyeccion ?? null;")).toBe(true);
    expect(contiene(HOOK, "return debeDescartarseSolo(planDeAplicacion(vivo, borrador, sin, { tareas, forzar: forzadas }));")).toBe(true);
    expect(HOOK, "el plan volvió a leer la memoria de la pantalla").not.toMatch(/(resumir|planDeAplicacion)\(vivo, borrador, actual\.sin/);
    // El núcleo que eso usa: vacío «armando» o «faltan» no se descarta; vacío «fallo», sí.
    const vacio = leerBorrador(borradorVacio({ pedido: "regenerar", corrida: "r1" }))!;
    expect(debeDescartarseSolo(planDeAplicacion(VIVO_VACIO, vacio, [], { tareas: "armando" }))).toBe(false);
    expect(debeDescartarseSolo(planDeAplicacion(VIVO_VACIO, vacio, [], { tareas: "faltan" }))).toBe(false);
    expect(debeDescartarseSolo(planDeAplicacion(VIVO_VACIO, vacio, [], { tareas: "fallo" }))).toBe(true);
  });

  it("resolver una propuesta con tareas: su estado se lee ANTES de limpiarla y decide si se ofrecen", () => {
    /* La edición que la pone en rojo: pasarle `tareas: null` a `pasoTrasResolver` (un v1 resuelto no
       ofrecería sus tareas), o leer el estado después de limpiar (ya no está).
       ⚠ ACTUALIZADA en E2b P4 (2026-09-25), con esta razón: la firma nueva de `pasoTrasResolver`. Cada
       lado dice cómo resolvió (`como`) y pasa si traía cambios de fases y si era «Regenerar» de una
       fase, leídos también ANTES de limpiar. Pasar el `como` del otro lado, o dejar de leer alguno, la
       pone en rojo. */
    const aplicar = tramo(CANVAS, "const aplicarBorrador = async (", "useEffect(");
    const limpiaA = aplicar.indexOf("setProposal(null)");
    for (const lectura of [
      "const tareasResueltas = tareasEnPantalla?.estado ?? null;",
      "const conFasesLaResuelta = traeCambiosDeFases(proposal);",
      "const soloFaseLaResuelta = !!revisionRef.current.borrador?.soloFase;",
    ]) {
      const i = aplicar.indexOf(lectura);
      expect(i, lectura).toBeGreaterThan(-1);
      expect(i, `${lectura} después de limpiar`).toBeLessThan(limpiaA);
    }
    const resolverA = tramo(aplicar, "siguiente = pasoTrasResolver({", "});");
    for (const campo of ['como: "aplicar",', "tareas: tareasResueltas,", "conCambiosDeFases: conFasesLaResuelta,", "soloFase: soloFaseLaResuelta,"]) {
      expect(contiene(resolverA, campo), campo).toBe(true);
    }
    const descartar = tramo(CANVAS, "const discardProposal = async (", "const aplicarBorrador = async (");
    const limpiaD = descartar.indexOf("setProposal(null)");
    for (const lectura of [
      "const tareasDescartadas = tareasEnPantalla?.estado ?? null;",
      "const conFasesLaDescartada = traeCambiosDeFases(proposal);",
      "const soloFaseLaDescartada = !!revision.borrador?.soloFase;",
    ]) {
      const i = descartar.indexOf(lectura);
      expect(i, lectura).toBeGreaterThan(-1);
      expect(i, `${lectura} después de limpiar`).toBeLessThan(limpiaD);
    }
    const resolverD = tramo(descartar, "const siguiente = pasoTrasResolver({", "});");
    for (const campo of ['como: "descartar",', "tareas: tareasDescartadas,", "conCambiosDeFases: conFasesLaDescartada,", "soloFase: soloFaseLaDescartada,"]) {
      expect(contiene(resolverD, campo), campo).toBe(true);
    }
  });

  it("aplicar con tareas encadena la reevaluación del avance; las fases solas, no", () => {
    /* Lo que hacía el camino viejo de «Regenerar todo» al aplicar (apply-all). La edición que la pone
       en rojo: sacar la reevaluación, o pedirla siempre (una propuesta solo de fases no la necesita). */
    const aplicar = tramo(CANVAS, "const aplicarBorrador = async (", "useEffect(");
    const i = aplicar.indexOf('if (typeof d.tareasTocadas === "number" && d.tareasTocadas > 0) {');
    expect(i).toBeGreaterThan(-1);
    const bloque = aplicar.slice(i, aplicar.indexOf("siguiente = pasoTrasResolver(", i));
    expect(bloque.length).toBeGreaterThan(200);
    expect(bloque).toContain("/timeline/progress");
    expect(bloque).toContain("setChainingProgress(true)");
    expect(bloque).toContain("setChainingProgress(false)");
    expect(i, "reevalúa antes de recargar lo aplicado").toBeGreaterThan(aplicar.indexOf("await load();"));
  });

  it("con una propuesta abierta, «Regenerar» de una fase no se ofrece (un borrador por proyecto)", () => {
    /* La edición que la pone en rojo: volver a ofrecerlo con la propuesta abierta (su aplicar
       escribiría tareas debajo de ella; el servidor lo frena con 409, pero después de pagar la corrida).
       ⚠ ACTUALIZADA en E2b P5a (2026-09-25), con esta razón: pedía `!verPropuesta && !hayBorrador` y
       abría el modal viejo (`startRegenPreview`). Ahora pide `pedirRegenerarFase` (una propuesta más),
       frena con CUALQUIER propuesta en pantalla (`!proposal`, que ya implica `!verPropuesta`) y
       mientras esta pantalla ya pide algo (`armando === null`: si no, sería una segunda corrida pagada).
       Ofrecerlo con una propuesta en pantalla o mientras se pide otra la pone en rojo. */
    expect(
      contiene(
        rama,
        "onRegeneratePhase={ hasAiDetail && canRegenerateTimeline && !proposal && armando === null ? (phase) => void pedirRegenerarFase(phase) : undefined }",
      ),
      "«Regenerar» de una fase se ofrece con una propuesta en pantalla o mientras esta pantalla ya pide algo",
    ).toBe(true);
  });

  it("los componentes nuevos de las tareas: solo tokens del tema (info = en curso, success = se crea, warn = se quita o choca)", () => {
    /* El ratchet de grises (lib/ui/token-vocab.test.ts) no mira los colores de familia; esto sí. La
       edición que la pone en rojo: un color crudo de Tailwind (gris, blanco, o de familia) en uno de
       los dos componentes. */
    const CRUDO = /\b(bg|text|border|ring)-(gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d/;
    for (const [rel, src] of [
      [RUTA_TAREAS, TAREAS],
      [RUTA_LINEA, LINEA],
    ] as const) {
      expect(src.length, `${rel}: la guarda no está mirando nada`).toBeGreaterThan(1000);
      expect(src, `${rel}: color crudo de familia`).not.toMatch(CRUDO);
      expect(src, `${rel}: gris, blanco o negro crudo`).not.toMatch(new RegExp(RAW_NEUTRAL_RE));
    }
    expect(LINEA).toContain("text-info-ink");
    expect(LINEA).toContain("text-warn-ink");
    expect(TAREAS).toContain("text-success-ink");
    expect(TAREAS).toContain("text-warn-ink");
  });
});

/**
 * E2c P3 (2026-09-25) — EL INTERRUPTOR: si el CSE quita un cambio de fase, las tareas de esa fase se
 * recalculan solas (~1 min), en UNA corrida para todas, 4 s después de la última casilla. Aplicar espera;
 * si el recálculo falla, «Aplicar de todos modos» (siempre confirma). Lo que decide es puro y se prueba
 * en recalculo-de-tareas.test.ts; acá, el cableado. Cada `it` nombra la edición que lo pone en rojo.
 */
describe("E2c P3 · el interruptor: las tareas de una fase desfasada se recalculan solas", () => {
  const RUTA_ESPERA = "components/canvas/useRecalculoDeLasTareas.ts";
  const ESPERA = soloCodigo(leer(RUTA_ESPERA));
  const rama = tramo(CANVAS, '<div id="cronograma-gantt"', "<TaskDetailDrawer");
  const pedir = tramo(CANVAS, "const pedirRecalculo = async (", "const recalc = useRecalculoDeLasTareas(");

  it("⭐ pedirRecalculo: el Canvas le pasa al pedido lo de la pantalla LEÍDO EN EL MOMENTO, y no usa `armando`", () => {
    /* ⚠ ACTUALIZADA en la revisión de E2c (2026-09-25), con esta razón: el pedido vive en
       lib/timeline/recalculo-de-tareas.ts (`pedirElRecalculo`) y su guarda lo CORRE
       (recalculo-en-la-pantalla.test.ts): espera el guardado y las casillas, lee lo de ese momento, corta
       sin desfasadas o con otra propuesta, manda `recalcular: { sin }`, trae la propuesta al lanzar y relee
       lo vivo con NADA_QUE_RECALCULAR. Quitar el `await traerPropuestaPendiente()` de después de lanzar
       pasaba la suite entera. Acá queda el cableado: cada cosa se lee en el momento (una función, no un
       valor del render en que se armó el pedido). Las ediciones que la ponen en rojo: pasar un valor en vez
       de leerlo, dejar de mandar las instrucciones tipeadas, o usar `setArmando` / `pedirPropuestaDeDetalle`
       (frena el chat y «Generar», y su «Volver a intentar» arma TODAS las fases). */
    expect(pedir.length, "la guarda no está mirando la función").toBeGreaterThan(600);
    expect(pedir.indexOf("await flushDocBrief();"), "no manda antes las instrucciones tipeadas").toBeLessThan(pedir.indexOf("await pedirElRecalculo("));
    for (const cable of [
      "token: proposalMeta.current.runId,",
      // E4: sin `!proposalMeta.current.deAssist` (se retiró la vista previa de «Pedir cambio con IA»).
      "sePuedePedir: !!revisionRef.current.borrador && !descartandoRef.current,",
      "esperarQueSeGuarde,",
      "esperarCasillas: () => revisionRef.current.esperarCasillas(),",
      "revision: () => revisionRef.current,",
      "traerPropuesta: () => traerPropuestaPendiente(),",
      "recargar: () => load(),",
      "automatico,",
    ]) {
      expect(contiene(pedir, cable), cable).toBe(true);
    }
    expect(pedir, "usa `armando`").not.toContain("setArmando(");
    expect(pedir, "arma todas las fases").not.toContain("pedirPropuestaDeDetalle(");
  });

  it("⭐ el seguimiento: la corrida del recálculo se sigue y su aviso nombra sus fases, tomadas ANTES de seguirla", () => {
    /* Al terminar, el recálculo ya no está en el GET: sin los nombres de antes, el aviso no sabría de
       qué fases habla, y sin `recalculo` en la entrada caería en «otra propuesta → callar» (terminaría
       mudo). Las ediciones que la ponen en rojo: tomar los nombres después de `await track(`, o no
       pasárselos al desenlace. */
    const seguimiento = tramo(CANVAS, "const { phase: faseDelArmado, track } = useAgentRun(clientId);", "const tareasDeLaBarra");
    const iCaptura = seguimiento.indexOf(
      "const recalcula = tareasEnPantalla?.recalculo?.corrida === corrida ? tareasEnPantalla.recalculo.nombres : null;",
    );
    expect(iCaptura, "no toma los nombres del recálculo").toBeGreaterThan(-1);
    expect(iCaptura, "toma los nombres después de seguirla").toBeLessThan(seguimiento.indexOf("await track(corrida)"));
    expect(contiene(tramo(seguimiento, "desenlaceDelSeguimiento({", "});"), "recalculo: recalcula,"), "el desenlace no sabe que es un recálculo").toBe(
      true,
    );
  });

  it("⭐ aplicarBorrador: corta con un bloqueo, manda las fases forzadas y las suelta SIEMPRE al terminar", () => {
    /* Las ediciones que la ponen en rojo: mandar con un bloqueo (el servidor lo rechaza igual), no
       mandar `forzar` («Aplicar de todos modos» no haría nada), o soltar la fuerza solo si sale bien
       (un aplicar fallido o con 409 la dejaría puesta para el siguiente). */
    const aplicar = tramo(CANVAS, "const aplicarBorrador = async (", "useEffect(");
    const iLee = aplicar.indexOf("const { resumen, sin, forzadas } = revisionRef.current;");
    const iBloqueo = aplicar.indexOf("if (resumen.bloqueo) {");
    expect(iLee).toBeGreaterThan(-1);
    expect(iBloqueo, "manda con un bloqueo").toBeGreaterThan(iLee);
    expect(iBloqueo).toBeLessThan(aplicar.indexOf("/timeline/borrador/aplicar"));
    /* ⚠ ACTUALIZADA en E3 P5 (2026-09-25), con esta razón: aplicar devuelve su resultado (también lo llama el
       chat): el bloqueo se dice (toast en la barra, el motivo en el chat) y se vuelve sin mandar nada. Desde
       el chat no se fuerza nada; desde la barra, las fases de «Aplicar de todos modos». */
    expect(contiene(tramo(aplicar, "if (resumen.bloqueo) {", "}"), 'return decir(resumen.bloqueo, "info");')).toBe(true);
    expect(contiene(aplicar, "forzar: desdeElChat ? [] : [...forzadas],")).toBe(true);
    const fin = tramo(aplicar, "} finally {", "}");
    expect(contiene(fin, "revisionRef.current.forzar([]);"), "la fuerza queda puesta tras un aplicar fallido").toBe(true);
  });

  it("⭐ el hook: SOLO una casilla del CSE arranca la espera; nunca al montar ni por un cambio del cronograma", () => {
    /* Las ediciones que la ponen en rojo: sumar una marca fuera de `marcar`/`marcarVarios` (al traer la
       propuesta, al recargar), que el efecto de la espera dependa de otra cosa que `marcasDelCse` (un
       cambio del cronograma vivo lanzaría una corrida pagada), o armar la espera al montar. */
    /* ⚠ ACTUALIZADA en E3 P5 (2026-09-25), con esta razón: lo que el chat pasa a la propuesta también cuenta
       como una marca (`contarMarcaDelChat`: puede dejar tareas desfasadas). Son tres vías, y la tercera la
       llama SOLO el Canvas después de pasar algo a la propuesta (su guarda, abajo). */
    expect(HOOK.match(/setMarcasDelCse\(/g)?.length, "la marca se suma fuera de las casillas y del chat").toBe(3);
    expect(contiene(HOOK, "const contarMarcaDelChat = useCallback(() => setMarcasDelCse((n) => n + 1), []);")).toBe(true);
    expect(CANVAS.match(/contarMarcaDelChat\(\)/g)?.length, "la marca del chat se suma fuera de «pasar a la propuesta»").toBe(1);
    expect(
      tramo(CANVAS, "const pasarALaPropuesta = async (", "const atenderElAcuerdo ="),
      "la marca del chat se suma antes de que la propuesta la adopte",
    ).toMatch(/adoptarPropuesta\(d\);[\s\S]*revisionRef\.current\.contarMarcaDelChat\(\);/);
    const marcar = tramo(HOOK, "const marcar = useCallback(", "const forzar = useCallback(");
    expect(marcar.match(/setMarcasDelCse\(\(n\) => n \+ 1\);/g)?.length, "marcar y marcarVarios").toBe(2);
    expect(marcar.indexOf("const marcarVarios = useCallback(")).toBeGreaterThan(marcar.indexOf("setMarcasDelCse("));
    expect(ESPERA.length, "la guarda no está mirando el hook").toBeGreaterThan(1500);
    expect(ESPERA).toContain("trasLaMarca(");
    expect(ESPERA).toContain("alVencer(");
    const efecto = tramo(ESPERA, "if (i.marcasDelCse === marcasVistas.current) return;", "}, [");
    expect(efecto).toContain("trasLaMarca(");
    expect(ESPERA, "el efecto de la espera depende de otra cosa que la marca").toContain("}, [i.marcasDelCse]);");
    expect(ESPERA.indexOf("}, [i.marcasDelCse]);"), "la espera se arma fuera del efecto de la marca").toBeGreaterThan(
      ESPERA.indexOf("if (i.marcasDelCse === marcasVistas.current) return;"),
    );
    expect(contiene(ESPERA, "const marcasVistas = useRef(i.marcasDelCse);"), "arma la espera al montar").toBe(true);
    // La clave con la que se compara la próxima marca se actualiza DESPUÉS del efecto de la marca.
    /* ⚠ ACTUALIZADA en la revisión de E2c (2026-09-25), con esta razón: el hook recibe las desfasadas (recuerda lo lanzado
       por fase) y arma la barra; la clave se calcula acá. Su conducta la prueba recalculo-en-la-pantalla.test.ts. */
    expect(ESPERA.indexOf("claveVista.current = claveDeDesfasadas(i.desfasadas);")).toBeGreaterThan(ESPERA.indexOf("}, [i.marcasDelCse]);"));
    // Las forzadas viven en memoria: nunca se recuerdan.
    expect(tramo(HOOK, "const recuerdo = {", "};"), "las forzadas se recuerdan").not.toContain("forzadas");
    // El Canvas: la misma vara que «Armar las tareas», y el botón de la línea relanza ya.
    const hook = tramo(CANVAS, "const recalc = useRecalculoDeLasTareas({", "});");
    expect(contiene(hook, "marcasDelCse: revision.marcasDelCse,")).toBe(true);
    expect(contiene(hook, "puedePedir: canEdit && puedeArmarTareas,")).toBe(true);
    /* ⚠ ACTUALIZADA en la revisión de E2c (2026-09-25), con esta razón: cuándo se puede lanzar lo decide
       `puedeLanzarElRecalculo` (su guarda prueba cada freno); la guarda de antes fijaba solo el final de la
       condición, y quitar `armando === null && !aplicandoBorrador && !descartando` pasaba. Acá, que el
       Canvas le pase TODOS los frenos y las tareas del mismo GET, y que el hook reciba lo que decide.
       También lo que llega a la barra: las desfasadas, el recálculo del GET y la fase de la corrida. */
    const lanzamiento = tramo(CANVAS, "const lanzamientoDelRecalculo = puedeLanzarElRecalculo({", "});");
    for (const cable of [
      "puedeEditar: canEdit,",
      "hayBorrador,",
      // E4: sale `vistaPrevia` (se retiró «Pedir cambio con IA»; su freno salió de `puedeLanzarElRecalculo`).
      "armando: armando !== null,",
      "aplicando: aplicandoBorrador,",
      "descartando,",
      "tareas: tareasEnPantalla,",
    ]) {
      expect(contiene(lanzamiento, cable), cable).toBe(true);
    }
    for (const cable of [
      "desfasadas: revision.desfasadas,",
      "servidor: tareasEnPantalla?.recalculo ?? null,",
      "faseDeLaCorrida: faseDelArmado,",
      "puedeLanzar: lanzamientoDelRecalculo.puedeLanzar,",
      "puedeEsperar: lanzamientoDelRecalculo.puedeEsperar,",
      "lanzar: (automatico) => pedirRecalculo(automatico),",
    ]) {
      expect(contiene(hook, cable), cable).toBe(true);
    }
  });

  it("⭐ la barra: la línea del recálculo relanza (nunca arma todas), y «Aplicar de todos modos» fuerza y confirma", () => {
    /* Las ediciones que la ponen en rojo: darle `onArmarTareas` a la línea del recálculo (armaría las
       tareas de TODAS las fases), abrir la confirmación sin forzar antes (el diálogo no sabría qué
       dice), cancelar sin soltar la fuerza (el próximo «Aplicar» forzaría sin confirmar), o confirmar
       sin decir qué pasa con esas tareas. */
    const linea = tramo(BARRA, "{recalculo && (", "/>");
    expect(contiene(linea, "onAccion={onRecalcular}")).toBe(true);
    expect(linea, "la línea del recálculo arma todas las fases").not.toContain("onArmarTareas");
    const iForzar = linea.indexOf("onForzar(");
    expect(iForzar, "no fuerza").toBeGreaterThan(-1);
    expect(iForzar, "confirma sin forzar antes").toBeLessThan(linea.indexOf('setConfirmar("forzar")'));
    expect(contiene(linea, 'onForzar && recalculo.que === "fallo"'), "«Aplicar de todos modos» sin que haya fallado").toBe(true);
    const confirmacion = tramo(BARRA, "<ConfirmDialog", "/>");
    expect(contiene(tramo(confirmacion, "onCancel={() => {", "}}"), "if (forzando) onForzar?.([]);"), "cancelar deja la fuerza").toBe(true);
    /* ⚠ ACTUALIZADA en la revisión de E2c (2026-09-25), con esta razón: pedía solo el nombre de la función, y con
       `resumen.desfasadas` (compila igual) o `{false && …}` el diálogo quedaba mudo. Lo que dice se prueba
       ABRIÉNDOLO (recalculo-en-la-pantalla.test.ts); acá, la lista que recibe. */
    expect(contiene(confirmacion, "{forzando && textoDeAplicarDeTodosModos(resumen.forzadas).map(")).toBe(true);
    expect(contiene(confirmacion, "confirmLabel={forzando ? ACCION_APLICAR_DE_TODOS_MODOS : textoDelBoton}")).toBe(true);
    // Lo de siempre sigue: las dos oraciones.
    expect(contiene(confirmacion, "{resumenDeLaConfirmacion(resumen)} {cierre}")).toBe(true);
    expect(contiene(confirmacion, "{textoDeLaConfirmacion(resumen)}")).toBe(true);
    // El bloqueo de las desfasadas lo dice la línea: no dos veces. El de una versión nueva, sí.
    expect(contiene(BARRA, "{bloqueo && !(recalculo && resumen.bloqueoPorDesfasadas) && <p")).toBe(true);
    // El Canvas: la línea con permiso, el botón relanza ya y «Aplicar de todos modos» fuerza.
    expect(contiene(rama, "recalculo={recalculoDeLaBarra}")).toBe(true);
    // ⚠ ACTUALIZADA en la revisión de E2c (2026-09-25), con esta razón: lo arma el hook (`recalc.barra`), con el recálculo del GET.
    expect(contiene(CANVAS, "const recalculoDeLaBarra = recalc.barra;")).toBe(true);
    expect(contiene(rama, "onRecalcular={canEdit && puedeArmarTareas ? recalc.lanzarYa : undefined}")).toBe(true);
    expect(contiene(rama, "onForzar={canEdit && puedeArmarTareas ? revision.forzar : undefined}")).toBe(true);
    // La línea: sin permiso, sin botones (lo dice `textoDelRecalculo`), y UN solo botón chico secundario.
    expect(contiene(LINEA, "textoDelRecalculo(recalculo, { puedePedir: !!onAccion })")).toBe(true);
    expect(LINEA.match(/onClick=\{onSecundaria\}/g)?.length).toBe(1);
  });

  it("⭐ las tareas en espera se ven marcadas y se pueden desmarcar; el grupo desfasado dice en qué está", () => {
    /* Las ediciones que la ponen en rojo: pintarlas desmarcadas (parecería que se quitaron), contarlas
       fuera de la casilla del grupo (quedaría a medias), trabarlas mientras corre, o no decir en el grupo
       en qué está el recálculo. */
    expect(contiene(TAREAS, "checked={seAplica || !!t.enEspera}")).toBe(true);
    expect(contiene(TAREAS, 'const marcadas = marcables.filter((t) => t.estado === "aplica" || t.enEspera).length;')).toBe(true);
    expect(contiene(TAREAS, "disabled={trabajando || !t.seMarca}"), "mientras corre se traba").toBe(true);
    /* ⚠ ACTUALIZADA en la revisión de E2c (2026-09-25), con esta razón: con una sola fase desfasada el grupo no repite la
       línea: recibe cuántas hay (su conducta, en recalculo-en-la-pantalla.test.ts). */
    expect(contiene(TAREAS, "const desfase = g.desfasada ? textoDelGrupoDesfasado(g.fase, recalculo, desfasadas) : null;")).toBe(true);
    expect(contiene(TAREAS, "const desfasadas = grupos.filter((g) => g.desfasada).length;")).toBe(true);
  });

  it("los componentes del recálculo: solo tokens del tema (info = en curso, warn = falta o falló)", () => {
    /* La edición que la pone en rojo: un color crudo de Tailwind en la barra, la línea, el grupo o el hook. */
    const CRUDO = /\b(bg|text|border|ring)-(gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d/;
    for (const [rel, src] of [
      [RUTA_BARRA, BARRA],
      [RUTA_TAREAS, TAREAS],
      [RUTA_LINEA, LINEA],
      [RUTA_ESPERA, ESPERA],
    ] as const) {
      expect(src.length, `${rel}: la guarda no está mirando nada`).toBeGreaterThan(1000);
      expect(src, `${rel}: color crudo de familia`).not.toMatch(CRUDO);
      expect(src, `${rel}: gris, blanco o negro crudo`).not.toMatch(new RegExp(RAW_NEUTRAL_RE));
    }
    const grupo = tramo(TAREAS, "{desfase && (", "{desfase.texto}");
    expect(grupo).toContain("text-info-ink");
    expect(grupo).toContain("text-warn-ink");
  });
});

/**
 * E3 P3 (2026-09-25) — LAS CASILLAS COMPARTIDAS: lo desmarcado se guarda en el servidor (`excluidos`) y se
 * ve en cualquier computadora. La cola (juntar, encadenar, revertir) es pura y se prueba en
 * cola-de-casillas.test.ts; acá, el cableado del hook y del Canvas. Cada `it` nombra la edición que lo pone
 * en rojo.
 */
describe("E3 P3 · lo que desmarcas se ve en otra computadora", () => {
  const rama = tramo(CANVAS, '<div id="cronograma-gantt"', "<TaskDetailDrawer");

  it("⭐ el hook: con un v1 y quien edita, lo desmarcado es lo del servidor con lo pendiente encima", () => {
    /* Las ediciones que la ponen en rojo: seguir leyendo la memoria de la pantalla con un v1 (lo que marcó
       otra computadora no se vería), compartir sin `guardarCasillas` (quien solo mira mandaría POST que la
       ruta rechaza), o no devolver `sin` y `esperarCasillas`. */
    expect(contiene(HOOK, "const compartidas = esBorradorV1(propuesta) && !!entrada.guardarCasillas;")).toBe(true);
    expect(
      contiene(HOOK, "compartidas ? superponerCasillas(excluidosDelServidor ?? (servidorManda ? [] : actual.sin), pendientes) : actual.sin"),
      "lo desmarcado no sale del servidor",
    ).toBe(true);
    expect(contiene(HOOK, "const excluidosDelServidor = useMemo(() => excluidosDelGuardado(propuesta), [propuesta]);")).toBe(true);
    // Los clics pendientes son de ESTA propuesta: los de otra no se superponen.
    expect(contiene(HOOK, "const pendientes = pendientesDe.clave === clave ? pendientesDe.ops : SIN_PENDIENTES.ops;")).toBe(true);
    // E4: sin `foto` en lo que devuelve el hook.
    expect(contiene(HOOK, "vista: actual.vista, sin, esperarCasillas, version,")).toBe(true);
    // La cola: una por propuesta; la de otra se suelta.
    const cola = tramo(HOOK, "const colaDeAhora = useCallback(", "const esperarCasillas = useCallback(");
    expect(contiene(cola, "if (colaRef.current?.clave === k) return colaRef.current.cola;")).toBe(true);
    expect(cola.indexOf("colaRef.current?.cola.soltar();"), "la cola de otra propuesta sigue mandando").toBeGreaterThan(-1);
    expect(contiene(cola, "return guardar ? guardar(ops, t)"), "los clics viajan con el token de otra propuesta").toBe(true);
    // Esperar: si falló, corta con el motivo; si mandó, deja adoptar la versión nueva.
    const esperar = tramo(HOOK, "const esperarCasillas = useCallback(", "}, []);");
    expect(contiene(esperar, "const { motivo, mando } = await actualDeLaCola.cola.esperar();")).toBe(true);
    expect(contiene(esperar, "if (motivo) return motivo;")).toBe(true);
    expect(contiene(esperar, "if (mando) await unRespiro();")).toBe(true);
  });

  it("⭐ la migración única: sube lo recordado solo con `excluidos` AUSENTE, una vez por propuesta", () => {
    /* Las ediciones que la ponen en rojo: migrar con `excluidos` presente (pisaría lo que decidió otra
       computadora), migrar en cada render, o no migrar. La regla pura (`casillasAMigrar`) se prueba en
       cola-de-casillas.test.ts. */
    const migracion = tramo(HOOK, "if (!compartidas || !clave || migradaRef.current === clave) return;", "}, [");
    expect(migracion.indexOf("migradaRef.current = clave;"), "se migra más de una vez").toBeGreaterThan(-1);
    expect(contiene(migracion, "const migrar = casillasAMigrar(excluidosDelServidor, actual.sin);")).toBe(true);
    expect(contiene(migracion, "cola.clic(migrar.claves, false);")).toBe(true);
    // Y mientras el servidor no guardó nada, lo recordado sube delante de cada lote.
    expect(
      contiene(
        HOOK,
        "migracion: () => (servidorMandaRef.current === k ? null : casillasAMigrar(paraEnviarRef.current.excluidos, paraEnviarRef.current.local)),",
      ),
    ).toBe(true);
  });

  it("⭐ adoptarPropuesta: sin GET, la versión nunca baja, otro token trae la guardada y `proposalMeta` va pegado", () => {
    /* Las ediciones que la ponen en rojo: adoptar una versión menor (lo recién desmarcado volvería a verse
       marcado), poner la propuesta de otro token, poner una propuesta sin su token en `proposalMeta`, o hacer
       un GET (o `bumpGpsRefresh`) por cada casilla.
       ⚠ ACTUALIZADA en E4 (2026-09), con esta razón: se retiró «Pedir cambio con IA» y sale el freno de su
       vista previa (`if (proposalMeta.current.deAssist) return;`); lo primero es mirar el token. */
    const adoptar = tramo(CANVAS, "const adoptarPropuesta = (", "const guardarCasillas = async (");
    expect(adoptar.length, "la guarda no está mirando la función").toBeGreaterThan(400);
    const iToken = adoptar.indexOf('if (typeof r.token !== "string" || r.token !== proposalMeta.current.runId) {');
    expect(iToken, "adoptar dejó de mirar primero el token").toBeGreaterThan(-1);
    expect(iToken).toBeLessThan(adoptar.indexOf("setProposal("));
    expect(contiene(tramo(adoptar, 'if (typeof r.token !== "string"', "}"), "void traerPropuestaPendiente(); return;")).toBe(true);
    const actualizar = tramo(adoptar, "setProposal((p) => {", "});");
    expect(contiene(actualizar, "if (p === null || enPantalla === null || version < enPantalla) return p;"), "la versión en pantalla baja").toBe(true);
    // E4: `proposalMeta` ya no lleva `deAssist`, y la propuesta es `PropuestaGuardada` (se fue el tipo de la vista previa).
    const iMeta = actualizar.indexOf("proposalMeta.current = { ...proposalMeta.current, runId: token };");
    expect(iMeta, "la propuesta se pone sin su token").toBeGreaterThan(-1);
    expect(iMeta).toBeLessThan(actualizar.indexOf("return r.propuesta as PropuestaGuardada;"));
    expect(
      contiene(actualizar, "return { ...p, version, ...(Array.isArray(r.excluidos) ? { excluidos: r.excluidos } : {}) };"),
    ).toBe(true);
    expect(adoptar, "cada casilla hace un GET").not.toContain("fetch(");
    expect(adoptar).not.toContain("bumpGpsRefresh");
  });

  it("⭐ guardarCasillas: POST «casillas» con el token de los clics; un 409 trae la guardada y lo dice; solo quien edita", () => {
    /* Las ediciones que la ponen en rojo: mandar el token de la pantalla en vez del de los clics, no adoptar
       la respuesta, no traer la guardada ante un 409, callar la falla (la casilla volvería sin explicación), o
       darle `guardarCasillas` a quien solo mira. */
    const guardar = tramo(CANVAS, "const guardarCasillas = async (", "const revision = useBorradorDelCronograma({");
    expect(contiene(guardar, "fetch(`/api/projects/${projectId}/timeline/borrador/operaciones`")).toBe(true);
    expect(
      contiene(guardar, 'body: JSON.stringify({ token, version: revisionRef.current.version ?? 0, origen: "casillas", operaciones: ops }),'),
    ).toBe(true);
    expect(contiene(guardar, "if (res.ok) { adoptarPropuesta(d); return { ok: true }; }"), "la respuesta no se adopta").toBe(true);
    /* ⚠ ACTUALIZADA en la revisión de E3 (#20), con esta razón: el 409 ya no muestra el texto de aplicar («…: no
       se aplicó nada», tras un clic en una casilla): dice lo suyo según lo que trajo (`motivoDeLasCasillasSinGuardar`,
       su tabla en cola-de-casillas.test.ts). Lo que se pide es lo mismo: trae la guardada y lo dice. */
    expect(
      contiene(
        tramo(guardar, "if (res.status === 409) {", "toast.info(motivo);"),
        'const ahora = await traerPropuestaPendiente(); const motivo = motivoDeLasCasillasSinGuardar(d, !ahora.ok ? null : ahora.propuesta ? "hay" : "ninguna");',
      ),
      "el 409 de las casillas no dice lo que encontró",
    ).toBe(true);
    expect(contiene(guardar, "const motivo = motivoDeLasCasillasSinGuardar(d, null); toast.error(motivo);"), "otra falla queda muda").toBe(true);
    expect(guardar, "las casillas volvieron a mostrar el mensaje del servidor tal cual").not.toContain("d?.message");
    expect(guardar.match(/toast\.error\(motivo\)/g)?.length, "una falla del guardado queda muda").toBe(2);
    expect(contiene(tramo(CANVAS, "const revision = useBorradorDelCronograma({", "});"), "guardarCasillas: canEdit ? guardarCasillas : undefined,")).toBe(
      true,
    );
  });

  it("⭐ esperarCasillas() va antes de leer la versión en los carriles que la mandan", () => {
    /* Cada casilla sube la versión. Los carriles que la mandan (aplicar, recalcular, y «Armar las tareas» /
       «Volver a intentar», que van por la continuación del paso 2) esperan las casillas y leen la versión de
       DESPUÉS; si no se pudo guardar, no siguen. Las ediciones que la ponen en rojo: sacar una espera,
       ponerla después de leer, o sumar un lector de la versión sin decidir si espera. */
    const aplicar = tramo(CANVAS, "const aplicarBorrador = async (", "useEffect(");
    /* ⚠ ACTUALIZADA en la revisión de E2c (2026-09-25), con esta razón: recalcular espera las casillas dentro de
       `pedirElRecalculo` (lib/timeline/recalculo-de-tareas.ts), y su guarda lo CORRE: el orden guardar →
       casillas → leer → pedir sale de lo que llama (recalculo-en-la-pantalla.test.ts). Acá, que el Canvas le
       pase la espera de las casillas y la revisión leída en el momento. */
    const recalcular = tramo(CANVAS, "const pedirRecalculo = async (", "const recalc = useRecalculoDeLasTareas(");
    expect(contiene(recalcular, "esperarCasillas: () => revisionRef.current.esperarCasillas(),")).toBe(true);
    expect(contiene(recalcular, "revision: () => revisionRef.current,")).toBe(true);
    const continuacion = tramo(tramo(CANVAS, "const pedirPropuestaDeDetalle = async (", "const pedirRegenerarFase"), "if (opts?.saltarEstructura) {", "} else {");
    /* ⚠ ACTUALIZADA en E3 P5 (2026-09-25), con esta razón: aplicar (que ahora también llama el chat) y el POST
       que pasa lo acordado a la propuesta devuelven el motivo si lo marcado no se guardó, así que su espera es
       `const sinCasillas = await …`. Los dos esperan y leen la versión DESPUÉS, como los demás. */
    const pasar = tramo(CANVAS, "const pasarALaPropuesta = async (", "const atenderElAcuerdo =");
    for (const [nombre, src, espera, lectura] of [
      ["aplicar", aplicar, "const sinCasillas = await revisionRef.current.esperarCasillas();", "if (acordada === null || revisionRef.current.version !== acordada)"],
      ["aplicar (la barra)", aplicar, "const sinCasillas = await revisionRef.current.esperarCasillas();", "const { resumen, sin, forzadas } = revisionRef.current;"],
      ["pasar a la propuesta", pasar, "const sinCasillas = await revisionRef.current.esperarCasillas();", "version: revisionRef.current.version ?? 0,"],
      ["armar las tareas", continuacion, "if (await revisionRef.current.esperarCasillas()) return;", "version = revisionRef.current.version;"],
    ] as const) {
      const iEspera = src.indexOf(espera);
      expect(iEspera, `${nombre}: no espera lo marcado`).toBeGreaterThan(-1);
      expect(src.indexOf(lectura), `${nombre}: lee la versión antes de esperar lo marcado`).toBeGreaterThan(iEspera);
    }
    // «Armar las tareas» y «Volver a intentar» (la barra y la línea suelta) van por la continuación.
    expect(contiene(tramo(CANVAS, "const armarLasTareas =", ": undefined;"), "saltarEstructura: true,")).toBe(true);
    /* Los lectores de la versión del borrador en el Canvas: los tres carriles, el POST de las casillas (la
       manda como informativa) y `traerPropuestaPendiente` (para que no baje). Uno nuevo pone esto en rojo:
       ¿manda la versión? entonces espera las casillas.
       ⚠ ACTUALIZADA en E3 P5 (2026-09-25), con esta razón: suman tres, y los tres esperan las casillas (arriba):
       aplicar desde el chat compara la versión acordada dos veces (antes y después de traer la guardada) y el
       POST que pasa lo acordado a la propuesta la manda. La apertura del chat manda `revision.version` como
       informativa (no escribe `excluidos` ni sube la versión) y no cuenta: no es un lector de `revisionRef`. */
    const lectores =
      (CANVAS.match(/revisionRef\.current\.version\b/g)?.length ?? 0) +
      (CANVAS.match(/const \{[^}]*\bversion\b[^}]*\} = revisionRef\.current/g)?.length ?? 0);
    /* ⚠ ACTUALIZADA en la revisión de E2c (2026-09-25), con esta razón: el de recalcular salió del Canvas (lo lee
       `pedirElRecalculo`, después de esperar las casillas): son siete. */
    expect(lectores, "hay un lector nuevo de la versión: ¿espera las casillas?").toBe(7);
    expect(CANVAS, "la versión volvió a salir de la closure de un clic").not.toContain("versionDelBorrador(proposal)");
  });

  it("⭐ al volver a la pestaña se relee la propuesta, y la versión en pantalla nunca baja", () => {
    /* Las ediciones que la ponen en rojo: no escuchar la vuelta (lo que marcó otra computadora no se vería
       hasta recargar), escucharla sin propuesta, no soltar los oyentes, comparar solo la corrida al
       refrescar, o poner una propuesta más vieja al traerla. (E4: sale «o con la vista previa del
       modificador»: se retiró «Pedir cambio con IA».) */
    /* ⚠ ACTUALIZADA en la revisión de E3 (#23), con esta razón: `visibilitychange` y `focus` llegan juntos al
       volver y cada uno hacía un GET completo; ahora los dos llaman a UNA relectura (`crearRelecturaAlVolver`,
       su conducta en refresco-tras-handoff.test.ts). Cuándo se relee es lo mismo: al volver, con propuesta. El
       «escucha sin propuesta» mira ahora desde la relectura, y ya no pasa en verde si no encuentra el `if`. */
    /* ⚠ ACTUALIZADA en la revisión de E4 (#2), con esta razón: escuchaba solo con un v1 en pantalla. Con algo que
       no se sabe leer tampoco releía, así que una pestaña abierta antes de la conversión de las viejas nunca veía
       la convertida y seguía ofreciendo «Descartarla». Ahora escucha con cualquier propuesta guardada en pantalla
       (y `debeReemplazarPropuesta` cambia la ilegible por su v1). Volver a `if (!hayBorrador) return;` la pone
       en rojo. */
    const iReleer = CANVAS.indexOf("const releer = crearRelecturaAlVolver(refrescarPropuesta);");
    expect(iReleer, "la vuelta a la pestaña dejó de pasar por una sola relectura").toBeGreaterThan(-1);
    expect(CANVAS.lastIndexOf("if (!hayBorrador && !propuestaIlegible) return;", iReleer), "escucha sin propuesta, o no con una ilegible").toBeGreaterThan(
      iReleer - 80,
    );
    const volver = tramo(CANVAS, "const releer = crearRelecturaAlVolver(refrescarPropuesta);", "}, [hayBorrador, propuestaIlegible, refrescarPropuesta]);");
    expect(contiene(volver, 'if (document.visibilityState !== "visible") return;')).toBe(true);
    expect(contiene(volver, 'const alVolver = () => { if (document.visibilityState !== "visible") return; releer(); };')).toBe(true);
    expect(volver, "un oyente volvió a releer por su cuenta (dos GET al volver)").not.toContain("refrescarPropuesta()");
    expect(contiene(volver, 'document.addEventListener("visibilitychange", alVolver);')).toBe(true);
    expect(contiene(volver, 'window.addEventListener("focus", alVolver);')).toBe(true);
    expect(contiene(volver, 'document.removeEventListener("visibilitychange", alVolver);')).toBe(true);
    expect(contiene(volver, 'window.removeEventListener("focus", alVolver);')).toBe(true);
    const refrescar = tramo(CANVAS, "const refrescarPropuesta = useCallback(", "}, [projectId]);");
    expect(contiene(refrescar, "versionEnPantalla: versionDelBorrador(prev), versionNueva: versionDelBorrador(nueva),")).toBe(true);
    const traer = tramo(CANVAS, "const traerPropuestaPendiente = async (", "const anteLaPropuestaGuardada");
    const iMasVieja = traer.indexOf("esLaMismaMasVieja(");
    expect(iMasVieja, "traer la guardada puede bajar la versión").toBeGreaterThan(-1);
    expect(contiene(traer, "if (!masVieja) {")).toBe(true);
    expect(traer.indexOf("setProposal(nueva);")).toBeGreaterThan(traer.indexOf("if (!masVieja) {"));
  });

  it("⭐ el cronograma que se compara lleva el `status` de cada fase, igual que el del servidor", () => {
    /* «Quitar una fase» choca si la fase ya arrancó: el plan lee `status`. Sin él en la pantalla, la huella
       de la pantalla y la del servidor no coincidirían y aplicar caería en PLAN_CAMBIO para siempre. La
       edición que la pone en rojo: sacarlo del `vivo` de la pantalla o del servidor. */
    const vivo = tramo(CANVAS, "const vivo: Vivo = useMemo(", "[phases, anchor],");
    expect(contiene(vivo, 'status: p.status ?? "PENDING",')).toBe(true);
    expect(vivo.indexOf('status: p.status ?? "PENDING",'), "el status quedó en las tareas, no en la fase").toBeLessThan(vivo.indexOf("tareas: p.tasks"));
    const servidor = soloCodigo(leer("lib/timeline/borrador-del-detalle.ts"));
    expect(contiene(tramo(servidor, "export function vivoDeLaBase(", "\n}"), "status: f.status,")).toBe(true);
  });

  it("la lista pinta lo que cambia y lo que llega (con qué le cambia), y la barra la nota de una fase que se queda", () => {
    /* Las ediciones que la ponen en rojo: pintar «~» o «→» como si se quitaran (warn), no decir qué le
       cambia, no contar las que cambian en el grupo, o esconder la nota de la fase que se queda. */
    expect(contiene(TAREAS, '"~": "text-info-ink",')).toBe(true);
    expect(contiene(TAREAS, '"→": "text-info-ink",')).toBe(true);
    expect(contiene(TAREAS, '<span className={cn("font-semibold", COLOR_DEL_SIGNO[t.signo])}>{t.signo}</span>')).toBe(true);
    expect(contiene(TAREAS, '{t.cambio && <span className="text-fg-muted">{t.cambio}</span>}')).toBe(true);
    expect(contiene(TAREAS, 'if (g.cambian > 0) partes.push(`${g.cambian} ${g.cambian === 1 ? "cambia" : "cambian"}`);')).toBe(true);
    expect(contiene(TAREAS, "aria-label={`${ACCION_DEL_SIGNO[t.signo]} la tarea «${t.titulo}»`}")).toBe(true);
    expect(contiene(BARRA, '{it.nota && <p className="text-xs text-fg-muted">{it.nota}</p>}')).toBe(true);
    // Las casillas siguen llegando por la misma prop (el hook decide si suben).
    expect(contiene(rama, "onMarcar={revision.marcar}")).toBe(true);
  });
});

describe("E3 P5 · el chat con una propuesta abierta: el despachador, la apertura y el cajón", () => {
  it("⭐ el botón del chat va por el despachador: sin propuesta los carriles de siempre, con una, a ella", () => {
    /* Las ediciones que la ponen en rojo: volver a mandar todo acuerdo al PUT (lo acordado para la propuesta
       escribiría el cronograma por debajo), o sumar un carril nuevo con el nombre de los viejos. */
    expect(contiene(CANVAS, "onAplicar={atenderElAcuerdo}")).toBe(true);
    const atender = tramo(CANVAS, "const atenderElAcuerdo =", "const tokenParaLaApertura");
    expect(contiene(atender, "acuerdo.borrador == null")).toBe(true);
    /* ⚠ ACTUALIZADA en la revisión de E3 (#19), con esta razón: el carril de siempre también recibe las líneas de
       lo mandado, para citar la que el ejecutor rechaza (el número contaba solo lo marcado). */
    expect(contiene(atender, "aplicarOperacionesAcordadas(acuerdo.operaciones as Operacion[], acuerdo.resumen, acuerdo.lineas)")).toBe(true);
    expect(contiene(atender, ": pasarALaPropuesta(acuerdo);")).toBe(true);
    // Ningún `aplicarOperaciones…(` nuevo: el del ejecutor y la llamada del despachador (antes, la del JSX).
    expect(CANVAS.match(/aplicarOperaciones\w*\(/g)?.length, "apareció un carril nuevo con el nombre del PUT").toBe(2);
    // Las dos funciones nuevas van fuera de todo tramo que miran otras guardas: detrás del recálculo.
    // ⚠ ACTUALIZADA en la revisión de E2c (2026-09-25), con esta razón: la barra del recálculo sale del hook (`recalc.barra`).
    expect(CANVAS.indexOf("const pasarALaPropuesta = async (")).toBeGreaterThan(CANVAS.indexOf("const recalculoDeLaBarra = recalc.barra;"));
  });

  it("⛔ pasar a la propuesta frena ANTES del POST: el cronograma ocupado, esta pantalla pidiendo, el motivo", () => {
    /* La edición que la pone en rojo: mandar lo acordado mientras la IA calcula (quedaría debajo de una
       propuesta calculada sobre la versión de antes) o sin mirar para qué propuesta se acordó. */
    const pasar = tramo(CANVAS, "const pasarALaPropuesta = async (", "const atenderElAcuerdo =");
    const iPost = pasar.indexOf("/timeline/borrador/operaciones");
    expect(iPost).toBeGreaterThan(-1);
    for (const freno of [
      "if (ocupado.activo) { return { fallo: esperaEnCurso(ocupado.rotulo), avisos: [] }; }",
      'if (armando !== null) { return { fallo: esperaEnCurso("armando la propuesta del cronograma"), avisos: [] }; }',
      "if (aplicandoBorrador || descartandoRef.current) return falla(MOTIVO_SIN_APLICAR);",
      "const motivo = motivoDelChat(acuerdo); if (motivo) return falla(motivo);",
      "const sinGuardar = await esperarQueSeGuarde();",
    ]) {
      const i = sinEspacios(pasar).indexOf(sinEspacios(freno));
      expect(i, `falta el freno: ${freno}`).toBeGreaterThan(-1);
      expect(i, `el freno va después del POST: ${freno}`).toBeLessThan(sinEspacios(pasar).indexOf("/timeline/borrador/operaciones"));
    }
    expect(contiene(pasar, 'body: JSON.stringify({ token: acuerdo.borrador, version: revisionRef.current.version ?? 0, origen: "chat", operaciones: ops }),')).toBe(true);
    // Aplicar va por el MISMO aplicar de la barra, con la lista acordada; el 422 dice qué línea.
    expect(contiene(pasar, "return aplicarBorrador({ acordada: { version: ops[0]?.version, huella: ops[0]?.huella }, desdeElChat: true });")).toBe(true);
    /* ⚠ ACTUALIZADA en la revisión de E3 (#19), con esta razón: el 422 cita la LÍNEA de la cajita
       (`textoDeLosRechazos`, su conducta en textos-del-acuerdo.test.ts), no «#n» contado entre lo marcado. */
    expect(contiene(pasar, "textoDeLosRechazos(d.rechazadas as Array<{ indice: number; motivo: string }>, acuerdo.lineas),")).toBe(true);
    expect(pasar, "el 422 volvió a numerar entre lo marcado").not.toContain("r.indice + 1");
    // El carril de siempre (sin propuesta) cita igual: la posición en lo mandado y sus líneas.
    const ejecutor = tramo(CANVAS, "const aplicarOperacionesAcordadas = async (", "setApplying(true);");
    expect(contiene(ejecutor, "const motivo = textoDeLosRechazos(conIndice, lineas);")).toBe(true);
    expect(ejecutor, "el carril de siempre volvió a numerar entre lo marcado").not.toContain("indexOf(r.operacion) + 1");
    expect(contiene(pasar, 'if (revisionRef.current.vista === "antes") revisionRef.current.alternar();')).toBe(true);
  });

  it("⛔ descartar desde el chat da éxito SOLO si el servidor la borró («otra» no es éxito)", () => {
    /* Hoy un 409 (la guardada ya era otra) se trataba como «ya no está guardada». La edición que la pone en
       rojo: devolver éxito con «otra» o con un DELETE que falló. */
    /* ⚠ ACTUALIZADA en la revisión de E3 (#14, #24), con esta razón: cómo terminó lo decide `trasElDescarte`
       (puro: su tabla está en propuesta-de-estructura.test.ts), y descartar recibe qué propuesta (`token`) y si
       viene del chat. Lo que se pide es lo mismo: éxito solo con «descartada». */
    /* ⚠ ACTUALIZADA en la revisión de E4 (#1), con esta razón: `opts` suma `ilegible` (descartar lo que no se sabe
       leer: el servidor guarda una copia). Lo que se pide sigue igual. */
    const descartar = tramo(CANVAS, "const discardProposal = async (", "const aplicarBorrador = async (");
    expect(
      contiene(
        descartar,
        'const discardProposal = async ( reason?: string, opts?: { token?: string | null; desdeElChat?: boolean; ilegible?: boolean }, ): Promise<"descartada" | "otra" | "fallo"> => {',
      ),
    ).toBe(true);
    expect(contiene(descartar, "respuesta = { ok: res.ok, status: res.status };")).toBe(true);
    expect(contiene(descartar, "const tras = trasElDescarte(respuesta, !!reason);")).toBe(true);
    expect(contiene(tramo(descartar, 'if (tras.resultado === "otra") {', "}"), 'return "otra";')).toBe(true);
    expect(contiene(descartar, "return tras.resultado;")).toBe(true);
    const pasar = tramo(CANVAS, "const pasarALaPropuesta = async (", "const atenderElAcuerdo =");
    expect(contiene(pasar, 'if (r === "descartada") return { fallo: null, avisos: [], destino: "descarte" };')).toBe(true);
    expect(contiene(pasar, 'return falla(r === "otra" ? MOTIVO_OTRA_PROPUESTA : MOTIVO_NO_SE_DESCARTO);')).toBe(true);
  });

  it("⛔ revisión de E3 (#24) · «Descártala» manda el token del ACUERDO: con otra propuesta guardada, el servidor no borra nada", () => {
    /* La única defensa era que el botón comparara el token del acuerdo con el de la pantalla; el DELETE mandaba
       el de la pantalla. Ahora el chat manda el suyo y la ruta responde 409 si la guardada es otra (su prueba de
       conducta, en borrador-rutas.test.ts). Las ediciones que la ponen en rojo: volver a mandar siempre el token
       de la pantalla, o que el chat no pase el del acuerdo. */
    const descartar = tramo(CANVAS, "const discardProposal = async (", "const aplicarBorrador = async (");
    expect(contiene(descartar, "runId: opts?.token !== undefined ? opts.token : proposalMeta.current.runId,")).toBe(true);
    const pasar = tramo(CANVAS, "const pasarALaPropuesta = async (", "const atenderElAcuerdo =");
    expect(contiene(pasar, "const r = await discardProposal(undefined, { token: acuerdo.borrador ?? null, desdeElChat: true });")).toBe(true);
  });

  it("⛔ revisión de E3 (#14) · un descarte a mano que falló deja la propuesta en pantalla (y la barra lo dice)", () => {
    /* Antes la pantalla la vaciaba pase lo que pase: el chat decía «vuelve a intentar» sin botón ni barra con que
       hacerlo. La edición que la pone en rojo: limpiar la propuesta antes de mirar `tras.soltar`, o callar el
       fallo en la barra. */
    const descartar = tramo(CANVAS, "const discardProposal = async (", "const aplicarBorrador = async (");
    const iSoltar = sinEspacios(descartar).indexOf(sinEspacios("if (!tras.soltar) {"));
    expect(iSoltar, "descartar ya no pregunta si suelta la propuesta").toBeGreaterThan(-1);
    const limpia = sinEspacios(descartar).indexOf(sinEspacios("proposalMeta.current = { runId: null };"));
    expect(iSoltar, "se limpia la propuesta antes de saber si el DELETE anduvo").toBeLessThan(limpia);
    expect(iSoltar).toBeLessThan(sinEspacios(descartar).indexOf("setProposal(null)"));
    expect(contiene(tramo(descartar, "if (!tras.soltar) {", 'return "fallo";'), "if (!opts?.desdeElChat) toast.error(MOTIVO_NO_SE_DESCARTO);")).toBe(true);
  });

  it("⭐ aplicar desde el chat: sin toasts ni diálogo (la línea fue la confirmación), y devuelve el resultado", () => {
    const aplicar = tramo(CANVAS, "const aplicarBorrador = async (", "useEffect(");
    expect(contiene(aplicar, "const desdeElChat = !!opts?.desdeElChat;")).toBe(true);
    expect(contiene(aplicar, "if (!desdeElChat) { toast.success(")).toBe(true);
    expect(contiene(aplicar, "return final;")).toBe(true);
    expect(contiene(aplicar, 'const motivo = desdeElChat ? d?.error === "PLAN_CAMBIO" ? MOTIVO_CRONOGRAMA_CAMBIO_DESDE_EL_ACUERDO')).toBe(true);
  });

  it("⛔ revisión de E3 (#10, #15) · aplicar desde el chat no espera al agente del avance y lo cuenta como NOTA, no como aviso", () => {
    /* El botón seguía en «Aplicando la propuesta…» toda la corrida del agente del avance (otra llamada a la IA),
       y el hilo quedaba con «⚠ el editor hizo algo distinto: Avance re-evaluado…». Las ediciones que la ponen en
       rojo: volver a esperarlo desde el chat, o volver a sumarlo a los avisos. El texto que escribe la nota se
       corre en textos-del-acuerdo.test.ts. */
    const aplicar = tramo(CANVAS, "const aplicarBorrador = async (", "useEffect(");
    const bloque = tramo(aplicar, 'if (typeof d.tareasTocadas === "number" && d.tareasTocadas > 0) {', "siguiente = pasoTrasResolver(");
    expect(
      contiene(
        bloque,
        "if (desdeElChat) { final = { ...final, notas: [NOTA_AVANCE_REEVALUANDOSE] }; void reevaluarElAvance(); } else { await reevaluarElAvance(); }",
      ),
    ).toBe(true);
    expect(bloque, "el avance volvió a los avisos del desenlace").not.toMatch(/final\.avisos/);
  });

  it("⭐ los motivos del botón del chat entran en el botón (≤ 60 caracteres)", () => {
    /* ⚠ ACTUALIZADA en la revisión de E3 (#24), con esta razón: los motivos y su regla salieron del cronograma a
       lib/asistente/textos-del-acuerdo.ts (donde su tabla se corre). Se leen de ahí, y el cronograma no vuelve
       a tener los suyos (dos listas divergen). */
    const motivos = Object.values(MOTIVOS_DEL_CHAT);
    // E4: 6 → 5 (sale «Descarta la vista previa de «Pedir cambio con IA»»: se retiró).
    // Revisión de E4 (#5c): 5 → 6 (entra «Descártala arriba del Gantt», para lo que no se sabe leer).
    expect(motivos.length).toBe(6);
    for (const m of motivos) expect(m.length, m).toBeLessThanOrEqual(60);
    expect(CANVAS, "el cronograma volvió a tener sus propios motivos del botón").not.toContain("const MOTIVOS_DEL_CHAT");
  });

  it("⭐ la apertura sola: una vez por persona (servidor y navegador), sin foco, y el cajón corre el cronograma", () => {
    /* Las ediciones que la ponen en rojo: abrirlo sin preguntar la regla pura, mirar solo el navegador,
       tomar el foco al abrirse solo, o correr el cronograma también sin propuesta (el cajón tapa a
       propósito). */
    const apertura = tramo(CANVAS, "const tokenParaLaApertura", "}, [tokenParaLaApertura");
    /* ⚠ ACTUALIZADA en la revisión de los arreglos, con esta razón: la entrada se arma aparte (`entrada`), porque
       el motivo de posponer (`motivoParaPosponer`) se pregunta sobre la MISMA entrada que la decisión. */
    expect(apertura).toContain("const entrada: EntradaDeLaApertura = {");
    expect(apertura).toContain("const decision = debeAbrirseElChat(entrada);");
    expect(contiene(apertura, "puedeConversar: me?.permissions?.sections?.asistente?.read === true,")).toBe(true);
    expect(contiene(apertura, "abiertoEnElServidor: abiertoPara(proposal, me?.email),")).toBe(true);
    expect(contiene(apertura, "recordadoLocal: leerApertura(projectId, tokenParaLaApertura),")).toBe(true);
    expect(contiene(apertura, 'anchoSuficiente: window.matchMedia("(min-width: 1280px)").matches,')).toBe(true);
    expect(contiene(apertura, "conOtraCapa: !!selectedTask || !!document.querySelector('[aria-modal=\"true\"]'),")).toBe(true);
    expect(contiene(apertura, 'origen: "apertura",')).toBe(true);
    expect(apertura, "la apertura escribe lo desmarcado").not.toContain("excluir");
    expect(contiene(CANVAS, "enfocarAlAbrir={!aperturaAutomatica}")).toBe(true);
    /* ⚠ ACTUALIZADA antes del push (2026-09-26), con esta razón: el 💬 ya no alterna a ciegas (`(v) => !v`): no cierra
       un cajón que se abrió solo en medio de su clic (`abiertoTrasTocarElChat`, su tabla en apertura-del-chat.test.ts).
       Abierto a mano sigue sin ser automático (toma el foco). */
    expect(contiene(CANVAS, "onClick={(e) => { setAperturaAutomatica(false);"), "abierto a mano no toma el foco").toBe(true);
    expect(CANVAS.match(/xl:pr-\[400px\]/g)?.length).toBe(1);
    expect(contiene(CANVAS, '<div className={chatAbierto && hayBorrador ? "relative xl:pr-[400px]" : "relative"}>')).toBe(true);
    expect(contiene(CANVAS, "motivoParaNoAplicar={motivoDelChat}")).toBe(true);
    /* ⚠ ACTUALIZADA en la revisión de E3 (#12), con esta razón: la referencia la arma `referenciaDelChat` (pura,
       con su tabla en apertura-del-chat.test.ts): solo con una propuesta que el chat puede editar. */
    expect(
      contiene(
        CANVAS,
        "referencia={referenciaDelChat({ puedeEditar: canEdit, hayBorrador, editable: !conDesconocidos, conCambios: !!revision.resumen, desde: desdeDeLaPropuesta(deDondeViene(proposal)), })}",
      ),
    ).toBe(true);
    expect(contiene(CANVAS, "const conDesconocidos = hayBorrador && (revision.borrador?.desconocidos ?? 0) > 0;")).toBe(true);
  });

  it("⛔ revisión de E3 (#26, #17, #12) · el cronograma HACE lo que dice cada decisión de la apertura", () => {
    /* La regla y las acciones son puras (sus tablas, en apertura-del-chat.test.ts); esto mira el último tramo,
       el que las aplica. Las ediciones que la ponen en rojo (mutaciones CV2, CV3 y CV4 de la revisión, antes en
       verde con la suite entera): abrirlo sin marcarlo automático (tomaría el foco), abrirlo con cualquier
       decisión que no sea «abrir», no recordarlo; y (#17) no pasarle a la regla si se escribe, si el puntero está
       sobre el Gantt o si ya se pospuso, o no dejar el punto al posponer. */
    const apertura = tramo(CANVAS, "const tokenParaLaApertura", "}, [tokenParaLaApertura");
    expect(contiene(apertura, "const acciones = accionesDeLaApertura(decision);")).toBe(true);
    /* ⚠ ACTUALIZADA antes del push (2026-09-26), con esta razón: abrirse solo anota cuándo (`abiertoSoloEnRef`), para
       que el clic en el 💬 que estaba en curso no lo cierre (su guarda, abajo). */
    expect(
      contiene(apertura, "if (acciones.abrir) { setChatAbierto(true); setAperturaAutomatica(acciones.automatica); abiertoSoloEnRef.current = Date.now(); }"),
      "abrirse solo dejó de anotar cuándo (el clic en curso en el 💬 lo cerraría)",
    ).toBe(true);
    expect(apertura.match(/setChatAbierto\(/g)?.length, "el efecto abre el cajón por otro camino").toBe(1);
    expect(contiene(apertura, "if (!acciones.decidida) return; aperturaVistaRef.current = tokenParaLaApertura;")).toBe(true);
    expect(contiene(apertura, "if (!acciones.recordar) return; recordarApertura(projectId, tokenParaLaApertura);")).toBe(true);
    /* ⚠ ACTUALIZADA en la revisión de los arreglos, con esta razón: posponer guarda el MOTIVO (estado, no ref) para
       esperar a que termine, y el reintento se gasta al decidir. */
    expect(
      contiene(
        apertura,
        "if (acciones.posponer && motivo) { setPospuestaDeLaApertura({ token: tokenParaLaApertura, motivo }); setPuntoDelChat(tokenParaLaApertura); }",
      ),
    ).toBe(true);
    expect(contiene(apertura, "const motivo = motivoParaPosponer(entrada);")).toBe(true);
    expect(contiene(apertura, "if (reintento && (acciones.decidida || acciones.posponer)) setReintentoDeLaApertura(null);")).toBe(true);
    for (const entrada of [
      "editable: !conDesconocidos,",
      "soloFase: soloFaseEnPantalla,",
      "recalculando: recalculandoEnPantalla,",
      "escribiendo: esCampoDeEscritura(document.activeElement as HTMLElement | null),",
      "gestoEnCurso: gestoEnCurso(gestoDelGanttRef.current, Date.now()),",
      'punteroEnElGantt: !!document.querySelector("#cronograma-gantt:hover"),',
      "pospuesta: pospuestaDeLaApertura?.token === tokenParaLaApertura,",
      "const reintento = reintentoDeLaApertura === tokenParaLaApertura;",
    ]) {
      expect(contiene(apertura, entrada), entrada).toBe(true);
    }
    // El selector del puntero mira algo que existe: el Gantt lleva ese id.
    expect(CANVAS).toContain('<div id="cronograma-gantt"');
    // Lo que la regla mira también despierta al efecto (si no, la propuesta «lista» no se decide nunca).
    const deps = tramo(CANVAS, "}, [tokenParaLaApertura", "]);");
    for (const d of [
      "conDesconocidos",
      "soloFaseEnPantalla",
      "recalculandoEnPantalla",
      "tareasArmandoEnPantalla",
      "chatAbierto",
      "pospuestaDeLaApertura",
      "reintentoDeLaApertura",
    ]) {
      expect(deps, d).toContain(d);
    }
    // El punto del 💬: solo para ESTA propuesta y con el chat cerrado; abrirlo a mano lo apaga.
    expect(contiene(CANVAS, "{puntoDelChat !== null && puntoDelChat === tokenParaLaApertura && !chatAbierto ? (")).toBe(true);
    /* ⚠ ACTUALIZADA antes del push (2026-09-26), con esta razón: el 💬 ya no alterna con `(v) => !v` (ver arriba);
       sigue apagando el punto. */
    expect(
      contiene(
        CANVAS,
        "setChatAbierto((v) => abiertoTrasTocarElChat({ abierto: v, apretadoEn, abiertoSoloEn })); setPuntoDelChat(null);",
      ),
    ).toBe(true);
    expect(contiene(tramo(CANVAS, "const abrirElChatDesdeUnaFase = useCallback(", "}, []);"), "setPuntoDelChat(null);")).toBe(true);
  });

  it("⛔ revisión de los arreglos · el gesto sale de lo que se HACE en el Gantt, y lo pasajero se espera para decidir de nuevo", () => {
    /* La regla es pura (sus filas, en apertura-del-chat.test.ts: el puntero quieto abre, el reintento decide una
       vez). Esto mira el cableado que la alimenta. Las ediciones que la ponen en rojo: volver a sacar el gesto del
       `:hover` del contenedor (casi toda la pantalla), no registrar el clic, la tecla o el soltar, o no esperar lo
       que pospuso (el gesto que termina, el campo que pierde el foco, la capa que se cierra): el chat quedaría en
       «nada» para siempre en esa pantalla. */
    const apertura = tramo(CANVAS, "const tokenParaLaApertura", "}, [tokenParaLaApertura");
    expect(sinEspacios(apertura), "el gesto volvió a salir del hover").not.toMatch(/gestoEnCurso:[^,]*:hover/);
    expect(
      contiene(
        CANVAS,
        '<div id="cronograma-gantt" className="space-y-4 scroll-mt-24" onPointerDownCapture={() => registrarGestoEnElGantt("apretar")} onKeyDownCapture={() => registrarGestoEnElGantt("tecla")}>',
      ),
    ).toBe(true);
    expect(contiene(apertura, 'document.addEventListener("pointerup", soltar, true);')).toBe(true);
    expect(contiene(apertura, 'document.addEventListener("pointercancel", soltar, true);')).toBe(true);
    expect(contiene(apertura, "alCambiarElGestoRef.current?.();")).toBe(true);

    const espera = tramo(CANVAS, "}, [tokenParaLaApertura", "}, [pospuestaDeLaApertura, selectedTask]);");
    expect(contiene(espera, "if (!p || !seVuelveADecidir(p.motivo) || p.motivo === \"capa\") return;")).toBe(true);
    expect(contiene(espera, "setReintentoDeLaApertura(p.token);")).toBe(true);
    /* ⚠ ACTUALIZADA antes del push (2026-09-26), con esta razón: el `focusout` ya no reintenta en el acto (llega a
       mitad del clic); anota y se espera a que termine el gesto en el documento (su guarda, abajo). */
    expect(contiene(espera, 'document.addEventListener("focusout", alPerderElFoco);')).toBe(true);
    expect(contiene(espera, "const falta = faltaParaQueTermineElGesto(gestoDelGanttRef.current, Date.now());")).toBe(true);
    expect(contiene(espera, "alCambiarElGestoRef.current = esperar;")).toBe(true);
    expect(contiene(espera, "const libre = () => !selectedTask && !document.querySelector('[aria-modal=\"true\"]');")).toBe(true);
    expect(espera).toContain("new MutationObserver(");
  });

  it("⛔ revisión antes del push · el campo que pierde el foco espera a que termine el clic, y el 💬 no cierra lo que se abrió en su clic", () => {
    /* Se pospuso con el foco en un campo (las instrucciones del cronograma) y la persona aprieta «💬 Asistente»: el
       `focusout` llega en el pointerdown, el reintento abría el cajón a mitad del clic y el click del 💬 lo cerraba.
       Las reglas son puras (sus tablas, en apertura-del-chat.test.ts); esto mira el cableado. Las ediciones que la
       ponen en rojo: volver a reintentar en el `focusout`, no escuchar el pointerdown y el pointerup del DOCUMENTO
       (el 💬 va por portal, fuera del Gantt), o que el 💬 vuelva a alternar a ciegas. */
    const espera = tramo(CANVAS, "}, [tokenParaLaApertura", "}, [pospuestaDeLaApertura, selectedTask]);");
    const delCampo = tramo(espera, 'if (p.motivo === "escribiendo") {', "let espera: ReturnType<typeof setTimeout> | undefined;");
    expect(delCampo, "el campo que pierde el foco volvió a reintentar en el acto").not.toMatch(/addEventListener\("focusout",\s*reintentar\)/);
    expect(contiene(delCampo, "const falta = faltaParaReintentarPorElCampo(espera, Date.now());"), "el campo dejó de esperar el fin del gesto").toBe(true);
    expect(contiene(delCampo, "if (falta === 0) reintentar(); else reloj = setTimeout(mirar, falta);")).toBe(true);
    expect(contiene(delCampo, "espera = anotarEnLaEspera(espera, evento, Date.now()); mirar();")).toBe(true);
    for (const escucha of [
      'document.addEventListener("focusout", alPerderElFoco);',
      'document.addEventListener("pointerdown", alApretar, true);',
      'document.addEventListener("pointerup", alSoltar, true);',
      'document.addEventListener("pointercancel", alSoltar, true);',
      'const alPerderElFoco = anotar("foco-afuera");',
      'const alApretar = anotar("apretar");',
      'const alSoltar = anotar("soltar");',
      "clearTimeout(reloj);",
    ]) {
      expect(contiene(delCampo, escucha), escucha).toBe(true);
    }

    // El 💬: anota su pointerdown y no cierra un cajón que se abrió solo después de él.
    const boton = tramo(CANVAS, "{canEdit && phases.length > 0 && (", "💬 Asistente");
    expect(contiene(boton, "onPointerDown={() => { apretadoDelChatRef.current = Date.now(); }}"), "el 💬 dejó de anotar su pointerdown").toBe(true);
    expect(contiene(boton, "const apretadoEn = e.detail > 0 ? apretadoDelChatRef.current : null;")).toBe(true);
    expect(contiene(boton, "const abiertoSoloEn = abiertoSoloEnRef.current;")).toBe(true);
    expect(
      contiene(boton, "setChatAbierto((v) => abiertoTrasTocarElChat({ abierto: v, apretadoEn, abiertoSoloEn }));"),
      "el 💬 cierra un cajón que se abrió solo en su clic",
    ).toBe(true);
    expect(sinEspacios(boton), "el 💬 volvió a alternar a ciegas").not.toContain(sinEspacios("setChatAbierto((v) => !v)"));
  });
});
