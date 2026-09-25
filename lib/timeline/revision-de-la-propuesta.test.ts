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
  AVISO_PROPUESTA_ABIERTA_CON_VISTA_PREVIA,
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
    expect(AVISO_PROPUESTA_ABIERTA_CON_VISTA_PREVIA).toContain("Descarta esta vista previa");
    expect(AVISO_PROPUESTA_ABIERTA_CON_VISTA_PREVIA).toContain("vuelve a pedir el cambio");
  });

  it("E2a · la propuesta abierta se nombra «del cronograma»: desde E2a trae también tareas", () => {
    /* E2a P3 (2026-09-25): «Regenerar todo» deja UN borrador con fases y tareas, así que «propuesta
       de cambios de fases» pasa a ser falso (y el cartel del proyecto decía «sugirió cambios de
       fases»). Son verdad en los dos mundos: con la propuesta vieja, solo de fases, y con la nueva.
       La edición que la pone en rojo: volver a nombrar la propuesta abierta «de cambios de fases» en
       uno de estos textos, o en el cartel que ve el CSE fuera del cronograma. */
    for (const texto of [MENSAJE_PROPUESTA_ABIERTA, AVISO_SUBIR_CON_PROPUESTA, AVISO_PROPUESTA_ABIERTA_CON_VISTA_PREVIA]) {
      expect(texto).toContain("propuesta del cronograma");
      expect(texto, "volvió a decir que la propuesta es solo de fases").not.toMatch(/cambios de fases/);
    }
    const cartel = soloCodigo(leer("components/projects/TimelineProposalPendiente.tsx"));
    expect(cartel.length).toBeGreaterThan(1500);
    expect(cartel.match(/El cronograma tiene una propuesta sin decidir/g)?.length, "las dos variantes").toBe(2);
    expect(cartel).toContain("la IA propuso cambios del cronograma");
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
    expect(contiene(BARRA, "const textoDelBoton = textoDeAplicar(marcadas, aplicables);")).toBe(true);
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

  it("⭐ aplicar: espera el guardado, limpia el deshacer, manda token + sin + huella + foto + versión, y ofrece las tareas que faltan", () => {
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
    expect(
      contiene(
        aplicar,
        "body: JSON.stringify({ token: proposalMeta.current.runId, sin: [...sin], huella: resumen.huella, foto, version: revisionRef.current.version })",
      ),
    ).toBe(true);
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
    expect(contiene(aplicar, "if (aplicandoBorrador || descartandoRef.current || !revisionRef.current.resumen) return;")).toBe(true);
  });

  it("⭐ descartar no corre dos veces: el ref frena el doble clic y el estado apaga los botones", () => {
    /* La edición que la pone en rojo: sacar el freno (dos DELETE: el segundo, 409 «otra propuesta»,
       cortaba la cadena y traía otra vez la propuesta) o no liberarlo si el DELETE falla. */
    const descartar = tramo(CANVAS, "const discardProposal = async (", "const aplicarBorrador = async (");
    expect(descartar.length).toBeGreaterThan(800);
    const iFreno = descartar.indexOf("if (descartandoRef.current) return;");
    expect(iFreno).toBeGreaterThan(-1);
    expect(iFreno).toBeLessThan(descartar.indexOf("/timeline/proposal`"));
    expect(contiene(descartar, "finally { descartandoRef.current = false; setDescartando(false); }")).toBe(true);
  });

  it("⭐ la foto se recuerda por la identidad de la propuesta, y se olvida al resolverla", () => {
    /* La foto vivía solo en el estado del componente: cambiar de canvas o terminar «Chequear avance»
       la reemplazaba por una del cronograma ya editado (revisión de E1, 2026-09-24; el caso, en
       borrador.test.ts «12 · …»). La edición que la pone en rojo: no pasar el token o el proyecto al
       hook, no leer lo recordado al cambiar de propuesta, o no olvidarla al aplicar/descartar. */
    expect(contiene(CANVAS, "token: hayBorrador ? proposalMeta.current.runId : null,")).toBe(true);
    expect(contiene(tramo(CANVAS, "const revision = useBorradorDelCronograma({", "});"), "projectId,")).toBe(true);
    expect(contiene(HOOK, "const clave = useMemo(() => claveDeRevision(propuesta, token), [propuesta, token]);")).toBe(true);
    expect(contiene(HOOK, "actual = revisionPara(clave, vivo, clave ? recordado(projectId, clave) : null);")).toBe(true);
    expect(HOOK).toMatch(/useEffect\(\(\) => \{[\s\S]*?recordarRevision\([\s\S]*?\}, \[projectId, actual\.clave, actual\.base, actual\.sin\]\);/);
    const aplicar = tramo(CANVAS, "const aplicarBorrador = async (", "useEffect(");
    expect(aplicar.indexOf("revisionRef.current.olvidar()")).toBeGreaterThan(-1);
    expect(aplicar.indexOf("revisionRef.current.olvidar()")).toBeLessThan(aplicar.indexOf("setProposal(null)"));
    const descartar = tramo(CANVAS, "const discardProposal = async (", "const aplicarBorrador = async (");
    expect(tramo(descartar, "if (!eraDelModificador) {", "proposalMeta.current = { deAssist: false")).toContain(
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
  });

  it("⭐ un 409 PROPUESTA_ABIERTA del PUT no deja un callejón: se trae la guardada o se dice qué hacer", () => {
    /* Mientras corre «Pedir cambio con IA» alguien regenera el handoff: el PUT con motivo responde 409
       con un texto que habla de una barra que no estaba. La edición que la pone en rojo: volver a
       mostrar el texto del servidor sin traer la propuesta, o pisar la vista previa del modificador
       sin preguntar. */
    const ruta = soloCodigo(leer("app/api/projects/[projectId]/timeline/route.ts"));
    expect(contiene(ruta, 'code: "PROPUESTA_ABIERTA"')).toBe(true);
    const ante = tramo(CANVAS, "const anteLaPropuestaGuardada = async (", "};");
    expect(contiene(ante, "if (proposalMeta.current.deAssist) return AVISO_PROPUESTA_ABIERTA_CON_VISTA_PREVIA;")).toBe(true);
    expect(contiene(ante, "await traerPropuestaPendiente();")).toBe(true);
    expect(contiene(ante, "return MENSAJE_PROPUESTA_ABIERTA;")).toBe(true);
    expect(MENSAJE_PROPUESTA_ABIERTA).toContain("arriba del Gantt");
    const modificador = tramo(CANVAS, "const applyProposal = async (", "const discardProposal = async (");
    expect(contiene(modificador, 'res.status === 409 && d?.code === "PROPUESTA_ABIERTA" ? await anteLaPropuestaGuardada()')).toBe(true);
    const chat = tramo(CANVAS, "const aplicarOperacionesAcordadas = async (", "const applyProposal = async (");
    expect(contiene(chat, 'res.status === 409 && data?.code === "PROPUESTA_ABIERTA" ? await anteLaPropuestaGuardada()')).toBe(true);
    // Descartar la vista previa del modificador trae la guardada, si hay.
    const descartar = tramo(CANVAS, "const discardProposal = async (", "const aplicarBorrador = async (");
    expect(contiene(tramo(descartar, "if (eraDelModificador) {", "return;"), "void refrescarPropuesta();")).toBe(true);
  });

  it("con un borrador abierto se puede editar a mano: el autoguardado sigue, y el chat/«IA» siguen frenados", () => {
    /* Respuesta 2 de Elías: se puede seguir editando; lo que choque queda fuera. La edición que la
       pone en rojo: volver a frenar el autoguardado con cualquier propuesta. */
    expect(contiene(CANVAS, "if (!dirty || (proposal && !hayBorrador) || saving || !canEdit) return;")).toBe(true);
    /* ⚠ ACTUALIZADA en E2a P6 (2026-09-25), con esta razón: suma la guarda de «Regenerar todo» /
       «Generar cronograma» (`pedirPropuestaDeDetalle`): con UN borrador por proyecto, pedir otra
       propuesta con una abierta se frena antes del paso 1. Lo que se protege es lo mismo: las guardas
       frenan, el autoguardado no. */
    expect(CANVAS.match(/if \(hayBorrador\) \{/g)?.length, "las tres guardas (modificador, chat y «Regenerar todo»)").toBe(3);
  });

  it("⭐ «Subir al cliente» queda LIBRE con un borrador abierto, con el aviso (respuesta 4 de Elías)", () => {
    /* La edición que la pone en rojo: volver a esconder el PublishBar con cualquier propuesta, o
       perder el aviso. */
    expect(contiene(CANVAS, "{canEdit && (!proposal || hayBorrador) && phases.length > 0 && (")).toBe(true);
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
    expect(CANVAS).not.toContain("ProposalGlobalStrip");
    expect(CANVAS).not.toContain("resolveProposalItems");
    expect(CANVAS).not.toContain("proposal/apply-items");
    expect(GANTT).not.toContain("onResolveProposalDelta");
    expect(GANTT).not.toContain("Fase propuesta");
    expect(GANTT).not.toContain("proposalGlobalSlot");
  });

  it("un borrador del formato nuevo no revienta la pantalla: la vista previa del modificador no lo lee", () => {
    /* `proposal.phases` no existe en `borrador-v1`: leerlo como la del modificador reventaba. */
    expect(contiene(CANVAS, "const propuestaDelAssist = proposal && !hayBorrador ? proposal : null;")).toBe(true);
    expect(tramo(CANVAS, "const diffSummary = (() => {", "})();")).toContain("const proposal = propuestaDelAssist;");
    expect(contiene(CANVAS, "const hayBorrador = !!proposal && esBorradorGuardado(proposal);")).toBe(true);
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
    // El GET que falla NO es «no hay propuesta»: la lectura llega como null y el desenlace sigue.
    expect(contiene(seguimiento, "lectura: leida.ok ? { hayPropuesta: leida.propuesta !== null, tareas: leida.tareas } : null,")).toBe(
      true,
    );
    // (El marcador ya no cierra el paréntesis: desde el cierre de la revisión de E2a recibe `soloLeer`.)
    const traer = tramo(CANVAS, "const traerPropuestaPendiente = async (", "const anteLaPropuestaGuardada");
    expect(contiene(traer, "if (!res.ok) return { ok: false };"), "un 5xx se lee como «no hay propuesta»").toBe(true);
    expect(contiene(traer, "} catch { return { ok: false }; }"), "un error de red se lee como «no hay propuesta»").toBe(true);
    // Nunca el código crudo de la corrida en el aviso: el texto sale del desenlace.
    expect(seguimiento, "el aviso volvió a leer el error crudo de la corrida").not.toMatch(/toast\.\w+\(r\.(error|timelineSyncError)/);
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
    /* Con la vista previa del modificador en pantalla, la guardada se LEE sin ponerla (cierre de la
       revisión de E2a: no se leía nada, el desenlace callaba y la corrida quedaba avisada sin aviso).
       La edición que la pone en rojo: volver a no leer (`deAssist ? null`), o leerla pisando la vista
       previa. */
    expect(seguimiento, "con la vista previa abierta, el aviso de las tareas se pierde").not.toMatch(/\?\s*null\s*:\s*await traerPropuestaPendiente/);
    expect(
      contiene(seguimiento, "const leida = conVistaPrevia ? await traerPropuestaPendiente({ soloLeer: true }) : await traerPropuestaPendiente();"),
    ).toBe(true);
    expect(contiene(seguimiento, "conVistaPrevia,")).toBe(true);
    const soloLeer = tramo(traer, "if (!opts?.soloLeer) {", "return { ok: true");
    expect(contiene(soloLeer, "setProposal(nueva);"), "leer pisa la vista previa").toBe(true);
    expect(traer.indexOf("setProposal("), "pone la guardada en pantalla aunque solo lea").toBeGreaterThan(traer.indexOf("if (!opts?.soloLeer) {"));
    /* Descartar A MANO mientras se arman las tareas: su corrida termina sin aviso (ni «PROPUESTA_CAMBIO»,
       ni «no propone cambios»). La edición que la pone en rojo: no darla por avisada al descartar. */
    const descartar = tramo(CANVAS, "const discardProposal = async (", "const aplicarBorrador = async (");
    expect(contiene(descartar, "const corridaDescartada = tareasEnPantalla?.corrida ?? null;")).toBe(true);
    expect(
      contiene(descartar, "if (yaNoEstaGuardada && !reason && corridaDescartada) CORRIDAS_ANUNCIADAS.add(corridaDescartada);"),
      "la corrida de una propuesta descartada a mano sigue avisando",
    ).toBe(true);
    // Se sigue la corrida del MISMO GET que dio el estado, y solo el de la propuesta en pantalla.
    expect(contiene(CANVAS, 'const corridaQueArma = tareasEnPantalla?.estado === "armando" ? tareasEnPantalla.corrida : null;')).toBe(
      true,
    );
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
    expect(contiene(vista, "if (fila) return { ...fila, weekIndex: t.weekIndex };")).toBe(true);
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
    expect(contiene(rama, "desde={desdeDeLaPropuesta(deDondeViene(proposal))}"), "el Canvas no le dice a la barra de dónde viene").toBe(true);
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
    const armar = tramo(CANVAS, "const armarLasTareas =", ": undefined;");
    expect(
      contiene(
        armar,
        '(revision.borrador?.pedido === "primera" ? canGenerateTimeline : canRegenerateTimeline) ? () => void pedirPropuestaDeDetalle(revision.borrador?.pedido === "primera" ? "primera" : "regen", { saltarEstructura: true, })',
      ),
      "«Armar las tareas» / «Volver a intentar» no piden el paso 2 sobre la propuesta, o se ofrecen sin permiso",
    ).toBe(true);
    expect(contiene(rama, "onArmarTareas={armarLasTareas}")).toBe(true);
    /* E2b P5a (2026-09-25): con «Regenerar» de una fase en pantalla (`soloFase`) no hay «Armar las
       tareas» ni «Volver a intentar», ni en la barra ni en la línea (las dos usan `armarLasTareas`). Si
       no, tomaría el token de ESA propuesta y armaría las tareas de todo el cronograma: una corrida
       pagada que nadie pidió. La edición que la pone en rojo: sacar la condición de `soloFase`. */
    expect(
      contiene(armar, 'const armarLasTareas = !revision.borrador?.soloFase && (revision.borrador?.pedido === "primera"'),
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
    expect(contiene(HOOK, "(claves: readonly string[], incluir: boolean) => setRevision((r) => marcarCambios(r, claves, incluir)),")).toBe(
      true,
    );
    expect(contiene(rama, "onMarcarVarios={revision.marcarVarios}")).toBe(true);
    expect(
      contiene(BARRA, "<TareasDeLaPropuesta grupos={grupos} onMarcar={onMarcar} onMarcarVarios={onMarcarVarios} trabajando={trabajando} />"),
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
    expect(contiene(HOOK, "borrador && borrador.cambios.length > 0 ? resumir(vivo, borrador, actual.sin, { tareas }) : null")).toBe(true);
    expect(contiene(HOOK, "const proyeccion = resumen?.proyeccion ?? null;")).toBe(true);
    expect(contiene(HOOK, "return debeDescartarseSolo(planDeAplicacion(vivo, borrador, actual.sin, { tareas }));")).toBe(true);
    // El núcleo que eso usa: vacío «armando» o «faltan» no se descarta; vacío «fallo», sí.
    const vacio = leerBorrador(borradorVacio({ pedido: "regenerar", corrida: "r1" }), VIVO_VACIO)!;
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
