/**
 * lib/asistente/panel.test.ts — EL CAJÓN CONVIVE CON EL DOCUMENTO, NO LO TAPA.
 *
 * Correr: `npx vitest run lib/asistente/panel.test.ts --project unit`.
 *
 * ── POR QUÉ ESTO ES UN TEST Y NO UNA CONVENCIÓN ──────────────────────────────────────────────
 * Los CUATRO paneles deslizantes del repo son modales: fondo oscuro, `aria-modal`, y candado
 * sobre `body.overflow`. Es el patrón de la casa, así que la próxima persona que toque este
 * archivo lo va a copiar sin pensarlo — y el resultado es que el CSE no puede mirar el cronograma
 * mientras habla de él. La conversación es SOBRE el documento: taparlo la vuelve inútil.
 *
 * Y no falla ruidoso. Un backdrop de más se ve prolijo; lo que se pierde es la razón de ser del
 * panel, y eso no lo reporta nadie: se reporta como «el chat no me sirve».
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "@/lib/ui/scan-source";
import { PIEZAS_CON_CHAT, tieneChat, puedeConversar } from "./piezas";

/**
 * ⚠ Se blanquean los COMENTARIOS antes de escanear, y hace falta de verdad: el docblock del
 * panel explica por qué NO es modal, y para explicarlo nombra `aria-modal` y el candado de
 * scroll. Sin esto la guarda se disparaba contra su propia justificación — mencionar no es usar.
 */
function soloCodigo(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "");
}

const PANEL = soloCodigo(
  fs.readFileSync(path.join(RAIZ, "components/asistente/ChatDelAsistente.tsx"), "utf8"),
);


describe("el panel del asistente NO es modal", () => {
  it("⛔ no le pone candado al scroll de la página", () => {
    /* La edición que la pone en rojo: copiar el `document.body.style.overflow = "hidden"` de
       TaskDetailDrawer. Con el candado puesto, el CSE no puede scrollear el cronograma del que
       está hablando — que es todo el punto del panel. */
    expect(
      /body\.style\.overflow/.test(PANEL),
      "el panel bloqueó el scroll del documento: la conversación es SOBRE el documento",
    ).toBe(false);
  });

  it("⛔ no pinta fondo oscuro sobre el documento", () => {
    /* Un `fixed inset-0 bg-black/30` es el gesto exacto de los otros cuatro. */
    expect(
      /inset-0[^"]*bg-black|bg-black[^"]*inset-0/.test(PANEL),
      "apareció un backdrop: el documento tiene que quedar visible y clickeable",
    ).toBe(false);
    /* ⚠ Se mira el ELEMENTO RAÍZ del panel, no el archivo entero. Mencionar `aria-modal` no es
       declararse modal: el chat consulta `[aria-modal="true"]` para NO cerrarse por debajo de un
       modal abierto — que es lo contrario de volverse uno. La versión anterior no distinguía
       «declara» de «nombra», así que castigaba justo al código que respeta la regla. */
    const i = PANEL.indexOf("<aside");
    expect(i, "se fue el elemento raíz del panel").toBeGreaterThan(-1);
    const raiz = PANEL.slice(i, PANEL.indexOf(">", i));
    expect(
      /aria-modal\s*=/.test(raiz),
      "el panel se declaró modal: deja de convivir con el documento",
    ).toBe(false);
  });

  it("⚠ y va por portal a body, porque el rail del cliente es sticky", () => {
    /* Ya mordido antes: una capa flotante dentro de un contenedor `sticky` se recorta contra él.
       La edición que la pone en rojo: devolver el <aside> directo en vez de createPortal. */
    expect(PANEL).toContain("createPortal(");
    expect(PANEL).toContain("document.body");
  });

  it("y queda POR DEBAJO de los modales de verdad", () => {
    /* Los modales del repo viven en z-55/60. Si el cajón subiera, un ConfirmDialog quedaría
       tapado por un panel que no es modal — y el usuario no podría confirmar nada. */
    const z = PANEL.match(/z-\[(\d+)\]/);
    expect(z, "el panel perdió su z declarado").not.toBeNull();
    expect(Number(z![1])).toBeLessThan(55);
  });
});

describe("⚠ el cajón se puede usar sin mouse", () => {
  /* El panel se portaliza al FINAL de `body` y su disparador vive en el header del documento.
     Sin manejo de foco, llegar al campo de escribir con teclado exige tabular por TODO el
     cronograma — cada input de cada tarea de cada fase. En la práctica era inalcanzable. */

  it("⛔ el foco entra al abrir y VUELVE al cerrar", () => {
    /* La edición que la pone en rojo: borrar el efecto. Nada falla a la vista; simplemente el
       chat deja de existir para quien no usa mouse. */
    expect(PANEL).toContain("composerRef.current?.focus()");
    expect(PANEL, "el foco no vuelve de donde vino: se cae a body").toContain("previo?.focus?.()");
  });

  it("⛔ y Escape no cierra el cajón por debajo de un modal", () => {
    /* `Modal` escucha en `document` y esto en `window`; el evento burbujea a los dos y ninguno
       corta, así que UN Escape cerraba el modal Y el chat. Es el z-index llevado al teclado. */
    expect(PANEL).toContain('[aria-modal="true"]');
  });

  it("⚠ la lista recortada es alcanzable con el teclado", () => {
    /* Un contenedor con `overflow-y-auto` y nada enfocable adentro no entra en el orden de
       tabulación: con 12 operaciones se aprobaban las 6 que se ven. */
    const i = PANEL.indexOf("acuerdo.lineas.map");
    const bloque = PANEL.slice(Math.max(0, i - 1200), i);
    expect(bloque, "la lista con scroll dejó de ser navegable").toContain("tabIndex: 0");
  });

  it("⛔ el estado y el error se ANUNCIAN, y desde una región ya montada", () => {
    /* Una región viva tiene que estar en el DOM ANTES del cambio para que la AT la observe:
       insertarla ya con el texto adentro no anuncia nada. Por eso van montadas siempre, vacías.
       La edición que la pone en rojo: envolverlas en `{error && (...)}`. */
    expect(PANEL).toContain('role="status"');
    expect(PANEL).toContain('role="alert"');
  });
});

describe("el asistente no escribe desde el panel", () => {
  it("⛔ el cajón no llama a ningún endpoint que persista el documento", () => {
    /* El único fetch de escritura permitido es al propio asistente. Aplicar lo acordado lo
       resuelve el CANVAS por `onAplicar`, que entra por el editor de siempre con su preview.
       La edición que la pone en rojo: un fetch a `/timeline` con method PUT desde acá. */
    const rutas = [...PANEL.matchAll(/fetch\(\s*`([^`]+)`/g)].map((m) => m[1]);
    expect(rutas.length, "el panel dejó de hacer fetch: ¿se movió la carga del hilo?").toBeGreaterThan(0);
    for (const r of rutas) {
      expect(
        r.includes("/asistente"),
        `el panel llama a "${r}", que no es el endpoint del asistente: aplicar es del editor`,
      ).toBe(true);
    }
  });

  it("el acuerdo LEGACY conserva su instrucción editable", () => {
    /* ⚠ ESTE TEST DECÍA OTRA COSA Y MEDÍA MAL. Se llamaba «la instrucción es EDITABLE antes de
       aplicar» y afirmaba `PANEL.toContain("<textarea")` — pero en el panel hay DOS textareas, y
       la otra es el compositor de mensajes, que no se va a ir nunca. Convertir la instrucción en
       un `<p>` de solo lectura dejaba el test VERDE.

       Y el nombre ya no describía el camino principal: desde que el chat emite operaciones, lo
       que se aprueba es la lista de líneas, que es de solo lectura A PROPÓSITO. Lo que este test
       protege de verdad es el camino LEGACY —documentos e hilos viejos— así que ahora se llama
       así y ancla DENTRO de ese bloque (medido: el textarea del compositor queda a 3.627
       caracteres, muy afuera de la ventana de 900).

       La edición que la pone en rojo: pintar la instrucción legacy como texto plano. */
    const i = PANEL.indexOf("Ver instrucción");
    expect(i, "se fue el bloque legacy de la instrucción").toBeGreaterThan(-1);
    const bloque = PANEL.slice(i, i + 900);
    expect(bloque).toContain("<textarea");
    expect(bloque).toContain("instruccionEditada");
  });

  it("⚠ pero va PLEGADA: es auditable, no protagonista", () => {
    /* Reportado el 2026-08-20: ocupaba media pantalla y tapaba la conversación. Se abre con
       «Ver instrucción». La edición que la pone en rojo: sacar el <details>. */
    expect(PANEL).toContain("<details");
    expect(PANEL).toContain("Ver instrucción");
  });
});

describe("un aplicar que falla NO se lee como uno que anduvo", () => {
  /* ⛔ EL BUG DE LA PRIMERA PRUEBA REAL. El panel se cerraba apenas `onAplicar` resolvía, sin
     mirar si había funcionado — y como el editor no lanza excepción (guarda su error en su
     propio estado), un rechazo se veía EXACTAMENTE igual que un éxito: el cajón se cerraba y el
     error aparecía suelto al pie del documento, sin contexto. */

  it("⛔ onAplicar tiene que poder decir que falló", () => {
    /* La edición que la pone en rojo: volver la firma a `Promise<void>`. */
    expect(PANEL).toContain("ResultadoDeAplicar");
    expect(
      /onAplicar\?:\s*\(instruccion: string\)\s*=>\s*Promise<void>/.test(PANEL),
      "onAplicar volvió a no devolver nada: el panel no puede distinguir éxito de fallo",
    ).toBe(false);
  });

  it("⛔ aplicar NUNCA cierra el panel", () => {
    /* ⚠ Esta guarda cambió de forma dos veces, y las dos por lo mismo: el cierre automático
       siempre estuvo mal, solo que al principio no se veía.

       Primero cerraba SIEMPRE, incluso cuando el aplicar había fallado — y como el editor no
       lanza excepción, un rechazo se veía igual que un éxito. Después cerraba solo si no había
       avisos. Ahora no cierra nunca (decisión de Elías, 2026-08-20): con las operaciones aplicar
       tarda ~1 ms, así que cerrar el cajón convierte un cambio instantáneo en «desapareció todo
       y no sé qué pasó». Y la conversación sigue: lo normal es encadenar dos o tres ajustes.

       La edición que la pone en rojo: volver a meter un `onClose()` en el camino de aplicar. */
    const i = PANEL.indexOf("await onAplicar(");
    expect(i, "se perdió el resultado de aplicar").toBeGreaterThan(-1);
    const bloque = PANEL.slice(i, PANEL.indexOf("} finally {", i));
    expect(bloque.indexOf("if (fallo)"), "dejó de mirar si falló").toBeGreaterThan(-1);
    expect(
      bloque.includes("onClose()"),
      "aplicar volvió a cerrar el panel: el desenlace queda escrito en el hilo, ahí mismo",
    ).toBe(false);
  });

  it("⚠ y el desenlace LLEVA los avisos, no un ✅ pelado", () => {
    /* «Se aplicó» sobre algo que no se aplicó es peor que un error: el CSE cierra el panel
       convencido y se entera días después.

       ⚠ Esta guarda anclaba en el literal `anotarDesenlace(true, avisos` y se puso roja el
       2026-08-21 cuando el llamado pasó a varias líneas — sin que la promesa cambiara ni un
       poco. Estaba midiendo la FORMA del llamado, no que los avisos viajen. Ahora mira el
       bloque del desenlace de éxito y exige el dato, no la tipografía. */
    const i = PANEL.indexOf("anotarDesenlace(");
    const bloque = PANEL.slice(PANEL.indexOf("await onAplicar("), PANEL.indexOf("} catch", i));
    expect(
      bloque.includes("avisos.join"),
      "el desenlace de éxito dejó de llevar los avisos del editor",
    ).toBe(true);
  });

  it("⚠ y el desenlace queda ESCRITO en el hilo", () => {
    /* Sin eso, reabrir el panel muestra el mismo botón «Aplicar», indistinguible de «nunca se
       intentó». Y como el modelo lee el hilo, escribirlo le enseña que su instrucción no entró. */
    expect(PANEL).toContain("anotarDesenlace");
    expect(PANEL).toContain("idDelAcuerdoVivo");
  });
});

describe("mientras aplica, el DOCUMENTO se bloquea — no el cajón", () => {
  /* Pedido de Elías el 2026-08-20, junto con «que el chat no se cierre»: son las dos mitades de
     un mismo gesto. El cajón queda vivo para leer lo que pasó; el cronograma queda quieto para
     que nadie lo edite a mitad de una escritura. */

  const CANVAS = soloCodigo(
    fs.readFileSync(path.join(RAIZ, "components/canvas/CronogramaCanvas.tsx"), "utf8"),
  );

  it("⚠ el velo tapa el cronograma y se anuncia como ocupado", () => {
    /* La edición que la pone en rojo: borrar el bloque `{ocupado.activo && (…)}` del canvas. Sin
       él la espera es invisible: el cronograma sigue mostrando lo viejo, acepta clicks, y el
       cambio aparece de golpe sin que nada lo haya anunciado. */
    const i = CANVAS.indexOf("{ocupado.activo && (");
    expect(i, "se fue el velo: el cronograma acepta clicks a mitad de la escritura").toBeGreaterThan(
      -1,
    );
    const velo = CANVAS.slice(i, i + 1800);
    expect(velo, "la guarda dejó de mirar el velo").toContain("aria-busy");
    expect(velo).toContain("skeleton-shimmer");
  });

  it("⭐ y cubre la GENERACIÓN, no solo el aplicar — que era el agujero reportado", () => {
    /* Elías, 2026-08-21: *«di clic en el cronograma mientras cargaba y como que se desbloqueó»*.
       No se desbloqueó: el velo solo miraba `applying`, y él estaba generando tareas — la espera
       LARGA, la que de verdad necesita el bloqueo. La edición que la pone en rojo: sacar
       `generating` del estado `ocupado` y dejar solo los aplicares. */
    const i = CANVAS.indexOf("const ocupado");
    expect(i, "se fue el estado único de ocupado").toBeGreaterThan(-1);
    /* ⚠ DOS DEFECTOS DE ESTA MISMA GUARDA, encontrados auditándola:

       1. `toContain("applying")` NO puede detectar que se saque `applying`: es substring de
          `applyingProgress` y `applyingPartic`, que están en el mismo ternario. Borrar su rama
          dejaba el test verde — y `applying` es justo el estado del que habla la historia de
          arriba. Ahora se busca el token seguido de su `?`, que es la forma de la rama.
       2. La ventana era un largo fijo (1.800) que terminaba a ~200 caracteres del final del
          ternario: sumar un séptimo estado empujaba el último afuera y ponía la guarda en rojo
          con el código bien. Así es como una guarda termina borrada por molesta. Ahora se recorta
          por el final REAL del ternario. */
    const fin = CANVAS.indexOf("activo: false", i);
    expect(fin, "el ternario de ocupado perdió su rama final").toBeGreaterThan(i);
    const bloque = CANVAS.slice(i, fin);
    for (const estado of [
      "assisting",
      "generating",
      "allRegenLoading",
      "chainingProgress",
      "applying",
      "applyingProgress",
      "applyingPartic",
    ]) {
      expect(
        new RegExp(`\\b${estado}\\s*\\?`).test(bloque),
        `«${estado}» dejó de bloquear el cronograma`,
      ).toBe(true);
    }
  });

  it("⛔ y el HEADER también — la fuga que hacía parecer que no bloqueaba", () => {
    /* Los botones del cronograma se inyectan en el header POR PORTAL, así que viven en otro nodo
       del DOM: ni el velo los tapa ni el `inert` del contenido los alcanza. Durante la generación
       seguían clickeables, y eso es lo que Elías vio.

       Se marca el SLOT entero y no botón por botón a propósito: el que se agregue mañana queda
       cubierto sin que nadie se acuerde. La edición que la pone en rojo: borrar el efecto. */
    expect(CANVAS, "el header del cronograma dejó de bloquearse").toContain(
      "headerSlot.inert = ocupado.activo",
    );
  });

  it("⛔ y BLOQUEA de verdad: el contenido queda `inert`, no solo tapado", () => {
    /* Un velo tapa y captura el mouse — pero lo de abajo sigue siendo enfocable con Tab, editable
       desde el teclado, y clickeable por cualquier hijo con un z mayor. `inert` saca el subárbol
       del foco y de los eventos, y es lo único que no depende de adivinar z-index uno por uno.
       La edición que la pone en rojo: borrar el atributo `inert` del contenedor del contenido. */
    expect(CANVAS, "el contenido del cronograma dejó de volverse inerte").toContain(
      "inert={ocupado.activo}",
    );
  });

  it("⛔ y queda POR DEBAJO del cajón, o el chat se vuelve inusable justo cuando importa", () => {
    /* ESTA es la que protege lo invisible. Subir el z del velo no rompe nada que se vea en un
       test: simplemente tapa el panel durante la espera, que es EL momento en que el CSE quiere
       leer qué está pasando y encadenar el ajuste siguiente.
       La edición que la pone en rojo: cambiar `z-[44]` por `z-50` en el velo. */
    const i = CANVAS.indexOf("{ocupado.activo && (");
    const z = CANVAS.slice(i, i + 400).match(/\bz-\[?(\d+)\]?\b/);
    expect(z, "el velo perdió su z declarado").not.toBeNull();
    const zPanel = PANEL.match(/z-\[(\d+)\]/);
    expect(Number(z![1])).toBeLessThan(Number(zPanel![1]));
  });
});

describe("⛔ el desenlace no manda a una vista previa que no existe", () => {
  /* Hallazgo de la auditoría del 2026-08-21. Al aplicar por el carril de operaciones —que escribe
     directo, en ~1 ms— el hilo cerraba con «✅ Se aplicó. Revisa la vista previa en el documento y
     acepta los cambios que quieras conservar». No hay vista previa: ya está guardado. La persona
     queda buscando un banner que no existe, y de paso creyendo que todavía puede descartar. */

  it("el cliente DECLARA por qué carril aplicó", () => {
    /* La edición que la pone en rojo: volver a `anotarDesenlace(true, avisos.join(" · "))` sin el
       tercer argumento. El default es `true` (vista previa) para no romper hilos viejos, así que
       olvidarlo no falla: miente. */
    expect(PANEL).toContain("vistaPrevia");
    expect(PANEL).toContain("!acuerdo.operaciones?.length");
  });
});

describe("⛔ el borrado silencioso no vuelve por la puerta de al lado", () => {
  /* `tarea.borrar` rechaza lo protegido mirando `isKept(status, source)` sobre el ESTADO LOCAL
     del canvas. Si ese estado local pierde `source`, una tarea que el servidor acaba de crear
     como HUMAN se le ve borrable al chat — y vuelve exactamente el defecto que se cerró. */

  it("⚠ al adoptar el id del servidor se adoptan también `source` y `status`", () => {
    const src = soloCodigo(
      fs.readFileSync(path.join(RAIZ, "components/canvas/CronogramaCanvas.tsx"), "utf8"),
    );
    const i = src.indexOf("mergeServerIds");
    expect(i, "se fue mergeServerIds").toBeGreaterThan(-1);
    const bloque = src.slice(i, i + 2200);
    expect(bloque, "el merge adopta el id pero no la procedencia").toContain("source: st.source");
    expect(bloque).toContain("status: st.status");
  });
});

describe("⭐ un turno con acuerdo es UNA caja, no dos que dicen lo mismo", () => {
  /* Elías, 2026-08-21, mirando la pantalla: *«lo siento repetitivo; de una el mensaje debería ser
     el cuadro azul»*. Y tenía razón: la burbuja del asistente enumeraba las tres tareas y la
     cajita azul las volvía a enumerar dos centímetros más abajo. */

  it("⛔ la burbuja suelta NO se pinta cuando el turno trae acuerdo", () => {
    /* La edición que la pone en rojo: volver a renderizar la burbuja siempre. Nada falla —
       simplemente vuelve a haber dos bloques con el mismo contenido, y la persona deja de leer
       los dos. */
    expect(PANEL).toContain("{!t.acuerdo && (");
  });

  it("⛔ y dentro de la caja va el texto O el resumen, nunca los dos", () => {
    /* Son la misma frase escrita dos veces: el modelo redacta el resumen para la caja y el texto
       para el hilo, y sobre el mismo acuerdo dicen lo mismo. */
    expect(PANEL).toContain("t.texto ? <Markdown>{t.texto}</Markdown> : <p>{t.acuerdo.resumen}</p>");
  });
});

describe("⛔ nunca un «Ver instrucción» que no lleva a ninguna instrucción", () => {
  /* Lo que Elías vio: un `<details>` que abría un textarea VACÍO, con el botón diciendo «Aplicar
     al cronograma». Era el `else` de «¿hay líneas?», así que un acuerdo con operaciones y sin
     líneas caía ahí. No sobraba por ruido: prometía que ese texto era «lo que se va a ejecutar
     tal cual», y en el camino de operaciones ese texto no se lee nunca. */

  it("el camino legacy exige que HAYA instrucción", () => {
    /* La edición que la pone en rojo: volver a `) : (` — el else incondicional. */
    expect(PANEL).toContain(") : t.acuerdo.instruccion ? (");
    /* ⚠ Acá había una segunda aserción que NO PODÍA PONERSE EN ROJO: buscaba el comentario
       `LEGACY` sobre `PANEL`, que viene de `soloCodigo()` y los blanquea. Devolvía `false`
       pasara lo que pasara, y `expect(false).toBe(false)` pasa siempre. Parecía cubrir «el
       legacy volvió a ser el else incondicional» y no cubría nada — que es peor que no tenerla:
       quien la lee en un review cree que ese caso está guardado. La línea de arriba ya lo cubre. */
  });
});

describe("⛔ lo que la revisión de calidad encontró, y son pérdidas de dato", () => {
  const CANVAS_SRC = fs.readFileSync(path.join(RAIZ, "components/canvas/CronogramaCanvas.tsx"), "utf8");

  it("⚠ el autosave se re-arma cuando cambia el cierre fijado a mano", () => {
    /* El `setTimeout` congela la closure del render en que se armó. Si `dirty` YA era true y
       dentro de 1,5 s se fija el cierre en el picker, sin esta dep el timer viejo dispara con
       `closeDateOverride: null` — y como la respuesta entra por la rama de adopción, el picker se
       VACÍA en pantalla y `dirty` queda en false: nada lo reintenta. `anchor` está listado desde
       siempre por exactamente la misma razón.
       La edición que la pone en rojo: sacar `closeOverride` de ese array. */
    expect(CANVAS_SRC, "el autosave dejó de mirar el cierre fijado a mano").toContain(
      "[dirty, phases, anchor, closeOverride, proposal, saving]",
    );
  });

  it("⛔ el desenlace DICE si quedó escrito, y el aplicar lo mira", () => {
    /* El botón «Aplicar» se apaga por una sola vía: dejar de ser el último turno. Y el único que
       corre ese último turno es `anotarDesenlace`. Si falla mudo, el cambio ya entró y el botón
       sigue vivo → se aplica dos veces, sobre operaciones que NO son idempotentes (`tarea.crear`
       duplica la tarea, `fase.crear` duplica la fase).
       La edición que la pone en rojo: que `anotarDesenlace` vuelva a no devolver nada. */
    expect(PANEL).toContain("if (!r.ok || !j.hilo?.turnos) return false;");
    expect(PANEL, "el aplicar dejó de mirar si el desenlace quedó escrito").toContain(
      "if (!quedoEscrito)",
    );
  });

  it("⚠ y no se puede escribir ni empezar de cero a mitad de un apply", () => {
    /* En el carril lento el apply tarda minutos. Un turno que se cuela ahí deja el desenlace
       colgando del acuerdo equivocado, y «Nueva» hace que se escriba sobre un hilo recién creado.
       La edición que la pone en rojo: sacar `aplicando` de cualquiera de los tres. */
    expect(PANEL).toContain("if (!mensaje || pensando || aplicando) return;");
    expect(PANEL).toContain("disabled={pensando || aplicando || !texto.trim()}");
    expect(PANEL).toContain("disabled={pensando || aplicando}");
  });

  it("⛔ «Nueva» no vacía la pantalla si el servidor rechazó", () => {
    /* El `?? []` de antes vaciaba el hilo también con un body de error: la persona daba la
       conversación por archivada —sin que se hubiera archivado nada— y reaparecía entera con el
       mensaje siguiente, porque `abrirHilo` reusa el hilo vivo.
       ⚠ Un hilo recién abierto trae `turnos: []`, así que VACÍO es válido y AUSENTE no: por eso
       `Array.isArray` y no un truthy sobre el largo. */
    expect(PANEL).toContain("if (!Array.isArray(j.hilo?.turnos))");
  });

  it("⚠ el cajón se REMONTA al cambiar de canvas", () => {
    /* Cambiar de canvas es puro estado (`router.replace` sobre la misma ruta), así que sin `key`
       el panel conserva el hilo del documento anterior mientras el encabezado ya dice el nombre
       nuevo — y «Nueva» y el envío postean contra la pieza NUEVA. La conversación que se lee y la
       que se toca dejan de ser la misma. */
    const src = fs.readFileSync(path.join(RAIZ, "components/clients/ProjectCanvasPanel.tsx"), "utf8");
    const i = src.indexOf("<ChatDelAsistente");
    expect(i, "se fue el montaje del chat").toBeGreaterThan(-1);
    expect(src.slice(i, i + 200), "el chat dejó de remontarse por pieza").toContain(
      "key={activeSlug}",
    );
  });
});

describe("el texto del asistente se renderiza", () => {
  it("⛔ como Markdown, no como texto plano", () => {
    /* Reportado el 2026-08-20: se veía el `- **Sumar…**` crudo. La edición que la pone en rojo:
       volver a `whitespace-pre-wrap` para el turno del asistente. */
    expect(PANEL).toContain("ReactMarkdown");
    expect(PANEL).toContain("list-decimal");
  });
});

describe("un acuerdo de doce líneas se sigue pudiendo leer entero", () => {
  /* El vocabulario del cronograma pasó de 10 a 18 operaciones el 2026-08-21, y las de tarea se
     emiten ENUMERADAS —una por tarea— para que la cajita las nombre por título en vez de aprobar
     un criterio a ciegas. El efecto: un acuerdo normal pasó de 2 líneas a 12, en un cajón de
     400 px. Sin recorte, la lista empuja el botón «Aplicar» fuera de pantalla. */

  it("⚠ la lista tiene scroll propio cuando se hace larga", () => {
    /* La edición que la pone en rojo: sacar el `max-h` del <ol>. Nada falla, nada se ve raro en
       un acuerdo de dos líneas — y con doce el botón deja de estar donde la persona lo busca. */
    const i = PANEL.indexOf("acuerdo.lineas.map");
    expect(i, "se perdió el render de las líneas del acuerdo").toBeGreaterThan(-1);
    const bloque = PANEL.slice(Math.max(0, i - 900), i);
    expect(bloque, "la lista de operaciones perdió su recorte").toContain("max-h-");
    expect(bloque).toContain("overflow-y-auto");
  });

  it("⭐ y dice CUÁNTOS cambios son, arriba", () => {
    /* Es lo que la persona necesita ANTES de leer: doce o dos cambia si revisa uno por uno o si
       lee y aprieta. Desde que se pueden descartar, además dice cuántas quedan de cuántas.
       La edición que la pone en rojo: borrar el contador. */
    expect(PANEL).toContain("${total} cambios");
    expect(PANEL, "el contador dejó de decir cuántas se descartaron").toContain(
      "de ${total} cambios",
    );
  });

  it("⭐ se pueden aceptar 10 de 12, y desmarcar arrastra lo que ya no puede correr", () => {
    /* La auditoría del 2026-08-21 marcó el todo-o-nada como el hueco más caro del carril rápido:
       con lotes de doce, «Aplicar» era una apuesta.
       ⛔ Y la cascada es obligatoria: desmarcar la fase que se crea y dejar sus tareas produce
       operaciones que apuntan a una fase inexistente; el ejecutor las rechaza y un solo rechazo
       aborta el lote ENTERO — peor que el todo-o-nada.
       La edición que la pone en rojo: aplicar `acuerdo.operaciones` entero en vez del subconjunto,
       o guardar lo desmarcado sin pasar por `arrastreAlDesmarcar`. */
    expect(PANEL).toContain("arrastreAlDesmarcar(ops, pedido)");
    expect(PANEL).toContain("operaciones: operacionesAceptadas(t.id, t.acuerdo!)");
    expect(PANEL, "el botón deja aplicar con cero operaciones marcadas").toContain(
      "sinNadaQueAplicar",
    );
  });
});

describe("⭐ etapa 3 — el chat de DOCUMENTOS también aplica", () => {
  /* Hasta el 2026-08-21 el chat de documentos conversaba y no terminaba en nada: la única
     herramienta pedía `operaciones` —fases y semanas, que en un kickoff no significan nada— y no
     tenía ningún campo donde poner una instrucción. No podía cerrar un acuerdo NUNCA. */

  const TURNO = fs.readFileSync(path.join(RAIZ, "lib/asistente/turno.ts"), "utf8");

  it("⛔ un documento recibe la herramienta de INSTRUCCIÓN, no la de operaciones", () => {
    /* La edición que la pone en rojo: volver a `tools: [TOOL_ACUERDO]` fijo. Nada falla —
       simplemente el chat de documentos vuelve a no poder acordar nada. */
    expect(TURNO).toContain("TOOL_ACUERDO_DE_DOCUMENTO");
    expect(TURNO).toContain("esCronograma ? TOOL_ACUERDO : TOOL_ACUERDO_DE_DOCUMENTO");
  });

  it("⛔ y el PROMPT también se bifurca: el vocabulario de fases no va a un kickoff", () => {
    expect(TURNO).toContain("promptDelAsistente(esCronograma)");
    expect(TURNO).toContain("COLA_DE_DOCUMENTO");
  });

  it("⚠ el chat NO escribe el documento: dispara el aplicador que ya existe", () => {
    /* ⛔ La alternativa era que el chat llamara a `canvas-assist` y escribiera con
       `upsertCardData`: un SEGUNDO camino de escritura para lo mismo. No sería interfaz
       duplicada, sería lógica de pérdida de datos duplicada.
       La edición que la pone en rojo: que `onAplicar` haga fetch por su cuenta. */
    const panel = fs.readFileSync(
      path.join(RAIZ, "components/clients/ProjectCanvasPanel.tsx"),
      "utf8",
    );
    const i = panel.indexOf("onAplicar={async (acuerdo)");
    expect(i, "el chat de documentos volvió a no poder aplicar").toBeGreaterThan(-1);
    const bloque = panel.slice(i, i + 1400);
    expect(bloque, "el chat aplica por su cuenta en vez de usar el editor").not.toContain("fetch(");
    expect(bloque).toContain("obtenerAplicador()");
  });

  it("⭐ y el editor se registra SOLO, así que los seis documentos entran sin tocarlos", () => {
    /* Registrarlo en cada workspace serían seis lugares que se olvidan de a uno. La edición que
       la pone en rojo: mover el registro fuera de `DocumentAssist`. */
    /* ⚠ Se busca la LLAMADA, no el símbolo: `toContain("useRegistrar…")` lo satisface el propio
       import, así que borrar la llamada dejaba la guarda verde. Medir «menciona» donde se quiere
       decir «llama» es la misma trampa que ya apareció tres veces en este archivo. */
    const editor = fs.readFileSync(path.join(RAIZ, "components/ai/DocumentAssist.tsx"), "utf8");
    expect(editor, "el editor de documentos dejó de anunciarse al chat").toContain(
      "useRegistrarAplicadorDeDocumento((",
    );
  });
});

describe("las piezas con chat se DERIVAN de las que tienen editor", () => {
  it("⭐ el cronograma y todos los documentos del assist, sin lista paralela", () => {
    /* Si fuera una lista escrita a mano, divergiría el día que alguien sume un documento al
       assist: el chat quedaría ausente justo donde ya se puede usar, y nada avisaría. */
    const fuente = fs.readFileSync(path.join(RAIZ, "lib/asistente/piezas.ts"), "utf8");
    expect(fuente).toContain("Object.keys(DOC)");
    expect(PIEZAS_CON_CHAT).toContain("timeline");
    expect(PIEZAS_CON_CHAT).toContain("kickoff");
    expect(PIEZAS_CON_CHAT).toContain("delivery");
    /* Exploración NO: su merge shallow borra el trabajo curado del CSE, en silencio. */
    expect(PIEZAS_CON_CHAT).not.toContain("exploration");
  });

  it("⚠ sin contenido generado no hay chat", () => {
    /* Un asistente sobre un documento vacío no tiene qué modificar: la primera generación sigue
       siendo «Generar». Ofrecerlo antes sería prometer una conversación que no termina en nada. */
    expect(puedeConversar("timeline", false)).toBe(false);
    expect(puedeConversar("timeline", true)).toBe(true);
    expect(tieneChat("handoff")).toBe(false);
  });
});
