/**
 * lib/timeline/revision-de-la-propuesta.test.ts — la PANTALLA de la revisión de la propuesta de fases
 * (E1 del borrador del cronograma, 2026-09-24).
 *
 * Correr: `npx vitest run lib/timeline/revision-de-la-propuesta.test.ts --project unit`.
 *
 * La lógica vive en lib/timeline/borrador.ts (y sus tests); esto mira el cableado que solo existe en
 * los componentes: un solo botón que alterna sobre el MISMO Gantt, la barra fija sobre el Gantt
 * entero, la vista de la propuesta que nunca pasa por el guardado, «Subir al cliente» libre con
 * aviso, el aplicar que espera el guardado y la cadena al paso 2.
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
  LINEA_DEL_CLIENTE,
  MENSAJE_PROPUESTA_ABIERTA,
  TEXTO_VER_ANTES,
  TEXTO_VER_PROPUESTA,
  textoDeAplicar,
} from "./borrador";

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
    // Y «Descartar» también sigue con las tareas: eso se lee, no queda solo en un `title`.
    expect(BARRA, "el paso 2 que sigue al descartar dejó de verse").toContain("Paso 1 de 2 · después, las tareas");
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

  it("⭐ aplicar: espera el guardado, limpia el deshacer, manda token + sin + huella + foto, y sigue al paso 2", () => {
    /* La edición que la pone en rojo: aplicar sin esperar lo que está guardándose (el servidor
       compararía contra otra foto), no mandar el token, o cortar la cadena al paso 2. */
    const aplicar = tramo(CANVAS, "const aplicarBorrador = async (", "useEffect(");
    expect(aplicar.length).toBeGreaterThan(1500);
    const iEspera = aplicar.indexOf("await esperarQueSeGuarde()");
    const iLimpia = aplicar.indexOf("clearScope(undoScope)");
    const iFetch = aplicar.indexOf("/timeline/borrador/aplicar");
    expect(iEspera).toBeGreaterThan(-1);
    expect(iEspera).toBeLessThan(iLimpia);
    expect(iLimpia).toBeLessThan(iFetch);
    expect(
      contiene(aplicar, "body: JSON.stringify({ token: proposalMeta.current.runId, sin: [...sin], huella: resumen.huella, foto })"),
    ).toBe(true);
    expect(aplicar, "lee la revisión del render del clic, no la de ahora").toContain("revisionRef.current");
    expect(aplicar).toContain("pasoTrasResolver(");
    expect(contiene(aplicar, "pedirPropuestaDeDetalle(modoDeLaCadena, { saltarEstructura: true })")).toBe(true);
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
    expect(CANVAS.match(/if \(hayBorrador\) \{/g)?.length, "las dos guardas (modificador y chat)").toBe(2);
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
