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

describe("⚠ el composer crece con lo que se escribe o se pega", () => {
  it("⛔ el textarea tiene un techo — y scrollea adentro, no se come la pantalla", () => {
    /* Elías, 2026-08-21: al pegar un párrafo largo, con `rows` fijo el texto quedaba tapado
       detrás de un scroll interno de dos líneas — no se podía ver lo que se acababa de escribir.
       Con techo: crece hasta un límite y a partir de ahí scrollea adentro, en vez de devorarse el
       historial de mensajes arriba. */
    const i = PANEL.indexOf("ALTO_MAXIMO_COMPOSER");
    expect(i, "desapareció el techo del composer").toBeGreaterThan(-1);
    expect(PANEL, "el efecto de auto-grow desapareció").toContain("el.scrollHeight");
    /* ⚠ NO alcanza con `overflow-y-auto`: aparece en otros 3 lugares del archivo, así que
       sacárselo al composer no tocaba esta assert. Se afirma sobre el `style` exacto, que es
       único — es lo que de verdad limita el crecimiento. */
    expect(
      PANEL,
      "el textarea perdió el techo de altura: puede volver a devorarse la conversación",
    ).toContain("maxHeight: ALTO_MAXIMO_COMPOSER");
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
    const i = src.indexOf("<ChatDelDocumento");
    expect(i, "se fue el montaje del chat").toBeGreaterThan(-1);
    expect(src.slice(i, i + 200), "el chat dejó de remontarse por pieza").toContain(
      "key={activeSlug}",
    );
  });
});

describe("⛔ lo que Elías vio el 2026-08-21", () => {
  it("una tarea creada por el CHAT no nace «cargada a mano»", () => {
    /* «Me dijo que Revisión conjunta está cargada a mano, pero esa tarea la creó el chat».
       El daño era doble: le afirmaba al CSE algo falso sobre la procedencia, y como `isKept`
       protege lo HUMAN, el chat no podía borrar ni mover lo que él mismo acababa de crear.
       La edición que la pone en rojo: volver a `source: "HUMAN"` fijo. */
    const put = fs.readFileSync(
      path.join(RAIZ, "app/api/projects/[projectId]/timeline/route.ts"),
      "utf8",
    );
    expect(put, "el PUT volvió a marcar como HUMAN todo lo que crea").toContain(
      'changeKind === "AI_ASSIST" ? "MODIFIED" : "HUMAN"',
    );
  });

  it("⛔ un acuerdo con operaciones y SIN líneas no ofrece aplicar", () => {
    /* La cajita mostró la prosa y el botón «Aplicar al cronograma», sin ninguna lista: ofrecía
       aprobar cambios que la persona NO PODÍA LEER. Toda la garantía del diseño es «lo que se lee
       es lo que se ejecuta» — sin lista no queda nada que leer.
       La edición que la pone en rojo: sacar esa condición del `disabled`. */
    expect(PANEL).toContain("!t.acuerdo!.lineas?.length");
    expect(PANEL, "el caso sin líneas volvió a caer al camino legacy").toContain(
      ") : t.acuerdo.operaciones?.length ? (",
    );
  });

  it("⚠ se numeran los ASUNTOS, no las opciones — para que «la 2» no sea ambiguo", () => {
    /* Elías, 2026-08-21: *«la numeración no debe ser de los posibles valores, sino de los
       posibles cambios»*. El chat le numeró las tres fases candidatas y dejó el otro cambio en
       prosa suelta, así que «la 2» podía ser el segundo cambio o la segunda fase.
       ⚠ Y había una contradicción adentro del propio prompt: el ejemplo de «opciones que son
       respuestas» las numeraba. Los dos se corrigieron juntos.
       La edición que la pone en rojo: volver a numerar las opciones en cualquiera de los dos. */
    const turno = fs.readFileSync(path.join(RAIZ, "lib/asistente/turno.ts"), "utf8");
    expect(turno).toContain("SE NUMERAN LOS ASUNTOS, NO LAS OPCIONES");
    expect(
      turno.includes('"1. Alargar Setup'),
      "el ejemplo de opciones volvió a numerarlas, contradiciendo la regla de arriba",
    ).toBe(false);
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
    /* ⚠ SE AFIRMA SOBRE LA CONDICIÓN, NO SOBRE EL LITERAL. Antes anclaba en el template
       `${total} cambios` exacto, así que se puso roja el día que el contador aprendió el singular
       («1 cambio») — un rojo correcto pero por el motivo equivocado. Lo que importa es que el
       contador exista y sepa contar. */
    expect(PANEL, "desapareció el contador de cambios").toContain("plural(total)");
    expect(PANEL, "el contador dejó de decir cuántas se descartaron").toContain(
      "de ${plural(total)}",
    );
  });

  it("⚠ y el rótulo aparece SIEMPRE que haya texto arriba, aunque sean dos cambios", () => {
    /* Elías, primera prueba en pantalla: *«hay como dos listas numeradas, no sé por qué se ve
       así»*. El mensaje del asistente numera los ASUNTOS (la pregunta y el cambio) y la lista de
       abajo numera las OPERACIONES, así que quedaba un «1. 2.» pegado a otro «1. 2.» sin nada que
       los separe. El rótulo dice de cuál es cuál.
       La edición que la pone en rojo: volver a `if (total <= 3 && fuera === 0) return null;`. */
    expect(
      PANEL.includes("total <= 3 && fuera === 0 && !t.texto"),
      "con dos cambios y un mensaje arriba, las dos listas numeradas vuelven a pisarse",
    ).toBe(true);
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
       La edición que la pone en rojo: que el envoltorio haga fetch por su cuenta. */
    const envoltorio = fs.readFileSync(
      path.join(RAIZ, "components/asistente/ChatDelDocumento.tsx"),
      "utf8",
    );
    expect(envoltorio, "el chat aplica por su cuenta en vez de usar el editor").not.toContain(
      "fetch(",
    );
    expect(envoltorio).toContain("obtenerAplicador()");
  });

  it("⛔⭐ EL QUE PROVEE EL APLICADOR NO LO CONSUME — y esto estuvo roto en producción", () => {
    /* ── EL BUG QUE ESTA GUARDA EXISTE PARA IMPEDIR ───────────────────────────
       `ProjectCanvasPanel` monta `<AplicadorDeDocumentoProvider>` y, en el MISMO componente,
       llamaba a `useAplicadorDeDocumento()`. Un contexto solo fluye hacia ABAJO: el componente que
       provee lee el valor de AFUERA de su propio proveedor, o sea `null`. Siempre.

       Consecuencia, sin un solo error en consola: **el botón «Aplicar» del chat de documentos
       nunca funcionó**. Cada clic devolvía «El editor de este documento no está montado. Abrí el
       documento y volvé a intentar» — sobre un documento abierto delante de la persona.

       ⚠ Y la guarda que había NO lo cazaba: verificaba que `onAplicar` LLAMARA a
       `obtenerAplicador()`, que es exactamente lo que hacía. Medir «llama» donde hace falta
       «obtiene algo» es la trampa que este archivo ya documentó tres veces.

       La edición que la pone en rojo: volver a consumir el aplicador desde el panel. */
    const panel = fs.readFileSync(
      path.join(RAIZ, "components/clients/ProjectCanvasPanel.tsx"),
      "utf8",
    );
    expect(
      panel.includes("<AplicadorDeDocumentoProvider"),
      "el panel dejó de montar el proveedor: nadie puede aplicar",
    ).toBe(true);
    expect(
      panel.includes("useAplicadorDeDocumento(") || panel.includes("useHayAplicadorDeDocumento("),
      "el panel volvió a consumir el contexto que él mismo provee: siempre va a leer null",
    ).toBe(false);

    /* Y el que sí consume vive ADENTRO — lo monta el panel, así que está bajo el proveedor. */
    const envoltorio = fs.readFileSync(
      path.join(RAIZ, "components/asistente/ChatDelDocumento.tsx"),
      "utf8",
    );
    expect(envoltorio, "el envoltorio dejó de consumir el aplicador").toContain(
      "useAplicadorDeDocumento()",
    );
    expect(panel, "el panel dejó de montar el envoltorio").toContain("<ChatDelDocumento");
  });

  it("⭐ TODOS los documentos ejecutan lo acordado — ninguno se queda mudo", () => {
    /* ── QUÉ CAMBIÓ EL 2026-08-22, Y POR QUÉ LA GUARDA SE MUDÓ ────────────────
       Antes el registro vivía en `DocumentAssist`, que ya estaba montado en los seis: una sola
       línea los cableaba a todos. Eso era correcto mientras el chat emitiera una INSTRUCCIÓN, que
       es justo lo que ese componente sabe ejecutar.

       Desde que emite OPERACIONES, el que puede ejecutarlas es el que tiene los verbos de
       escritura del documento —el workspace, con su hook— y `DocumentAssist` no los tiene. Dejar
       el registro allá habría hecho que el chat le mande operaciones a un segundo modelo que
       espera prosa: el acuerdo se aplicaría a la nada, y el hilo diría que sí.

       El precio es que ahora son seis lugares en vez de uno, y esta guarda es lo que hace que no
       se olviden de a uno. La edición que la pone en rojo: sacarle la línea a cualquiera. */
    const WORKSPACES = [
      "components/canvas/KickoffWorkspace.tsx",
      "components/canvas/DesarrolloWorkspace.tsx",
      "components/canvas/DiagnosticoWorkspace.tsx",
      "components/canvas/PlanificacionWorkspace.tsx",
      "components/canvas/ImplementacionWorkspace.tsx",
      "components/canvas/EntregaWorkspace.tsx",
    ];
    for (const rel of WORKSPACES) {
      const src = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      /* ⚠ La LLAMADA, no el símbolo: `toContain("useEjecutar…")` lo satisface el propio import,
         así que borrar la llamada dejaría la guarda verde. Es la trampa que ya apareció tres
         veces en este archivo. */
      expect(
        src,
        `${rel} no ejecuta lo que el chat acuerda: conversa, dice «aplicado» y no pasa nada`,
      ).toContain("useEjecutarOperacionesDelChat(");
    }
  });

  it("⛔ y el kickoff declara que NO puede ocultar — su ojo escribe en otra columna", () => {
    /* ⚠ Ocultar tiene TRES mecanismos en el motor. El del kickoff vive en `hiddenKickoffKeys`,
       indexado por id de sección y provisional hasta «Subir al cliente»; el verbo genérico escribe
       en el Json del canvas, que para el kickoff NO LO LEE NADIE.
       Declararlo `true` haría que el chat escriba donde nadie lee: el hilo diría «aplicado» y el
       cliente seguiría viendo la sección. Es el modo de falla más caro de este carril, porque se
       usa justamente para SACAR algo que no se quería mostrar.
       La edición que la pone en rojo: ponerle `puedeOcultar: true` al kickoff. */
    const src = fs.readFileSync(path.join(RAIZ, "components/canvas/KickoffWorkspace.tsx"), "utf8");
    const i = src.indexOf("useEjecutarOperacionesDelChat(");
    expect(i, "el kickoff dejó de cablear el ejecutor").toBeGreaterThan(-1);
    const llamada = src.slice(i, src.indexOf(");", i));
    expect(llamada.length, "la guarda no está mirando nada").toBeGreaterThan(30);
    expect(
      llamada.includes("puedeOcultar: false"),
      "el kickoff dice que puede ocultar por chat, y escribiría en la columna que nadie lee",
    ).toBe(true);
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

describe("⭐ lo acordado y no aplicado sobrevive al turno siguiente", () => {
  const RUTA_CRUDA = soloCodigo(
    fs.readFileSync(
      path.join(RAIZ, "app/api/projects/[projectId]/asistente/route.ts"),
      "utf8",
    ),
  );
  /**
   * ⚠ SIN LAS LÍNEAS DE `import`, y esto no es prolijidad: es lo que separa una guarda de una
   * decoración.
   *
   * `marcaDeDesenlace` y `textoVisible` aparecen en el import aunque nadie los llame. Las tres
   * guardas de abajo nacieron buscándolos en el archivo entero, así que daban VERDE con el
   * arreglo apagado — se cazó rompiéndolas a propósito, que es exactamente para lo que sirve el
   * ritual.
   */
  const RUTA = RUTA_CRUDA.split("\n")
    .filter((l) => !l.trimStart().startsWith("import "))
    .join("\n");

  it("⛔ el botón sigue al ESTADO, no a la posición en el array", () => {
    /* ⭐ EL ARREGLO DEL 2026-08-21, afirmado sobre el código.

       `idDelAcuerdoVivo` decía «el último turno del array, si trae acuerdo». Elías pidió dos
       cosas, el asistente preguntó una y propuso la otra (acuerdo de 2 operaciones), Elías
       contestó la pregunta — y ese acuerdo dejó de ser el último. Perdió su botón sin que nadie
       hubiera aplicado nada, y las 2 operaciones se perdieron en silencio.

       La edición que la pone en rojo: volver a `turnos[turnos.length - 1]` como criterio único. */
    const i = PANEL.indexOf("const idDelAcuerdoVivo");
    expect(i, "desapareció el cálculo del acuerdo vivo").toBeGreaterThan(-1);
    const bloque = PANEL.slice(i, PANEL.indexOf("}, [turnos]);", i));
    expect(bloque.length, "la guarda no está mirando nada").toBeGreaterThan(60);
    expect(
      bloque.includes('t.estado === "vivo"'),
      "el botón volvió a decidirse por posición: contestar una pregunta apaga un acuerdo que " +
        "nadie aplicó",
    ).toBe(true);
  });

  it("⛔ y el estado lo DERIVA el servidor con la misma función que el libro", () => {
    /* Si la pantalla reimplementara la regla, podría ofrecer aplicar un conjunto mientras el
       turno siguiente arrastra otro. Las dos serían coherentes por dentro y contradictorias entre
       sí — la falla más difícil de diagnosticar. */
    expect(RUTA, "la ruta dejó de derivar el estado de cada acuerdo").toContain("estadosDeAcuerdo");
  });

  it("⛔ el desenlace deja escrito si el apply ANDUVO", () => {
    /* Sin ese bit, un apply FALLIDO vaciaría el libro de pendientes y la persona perdería
       justamente lo que NO se escribió.
       ⚠ Y el discriminador de «esto es un desenlace» NO es este marcador: es `shaDeContexto ===
       null`, que ya está en cada fila de producción. El marcador solo agrega el `ok`. */
    expect(
      RUTA,
      "el desenlace dejó de decir si el cambio entró: un apply FALLIDO vaciaría el libro y la " +
        "persona perdería justo lo que no se escribió",
    ).toContain("marcaDeDesenlace({ ok })");
  });

  it("⛔ la vista limpia LOS DOS marcadores", () => {
    /* Antes se sacaba solo el del acuerdo; el JSON del desenlace se pintaba crudo al pie del
       mensaje. No rompe nada y se ve pésimo. */
    expect(
      RUTA,
      "la vista dejó de limpiar el marcador del desenlace: se pinta el JSON crudo al pie del mensaje",
    ).toContain("textoVisible(t.contenido)");
  });

  it("⭐ con una pregunta abierta NO hay botón, y se dice por qué", () => {
    /* ⭐ LA CORRECCIÓN DE ELÍAS SOBRE LA PRIMERA PRUEBA EN PANTALLA (2026-08-21).

       El chat ofrecía aplicar la parte clara mientras la pregunta seguía sin contestar. Él aplicó
       esa mitad, contestó, y el pedido terminó en DOS escrituras sobre un cronograma que el
       cliente ve. Textual: *«es mejor que no dé la oportunidad de aplicar hasta que no haya
       resuelto las dudas… que solo haya una aplicación»*.

       Los cambios se siguen registrando —el libro los arrastra, no se pierde nada— pero el botón
       espera. La edición que la pone en rojo: sacar la rama de `en-espera` del render. */
    expect(
      PANEL.includes('t.estado === "en-espera"'),
      "volvió el botón con la pregunta abierta: un pedido se parte en dos escrituras",
    ).toBe(true);
    expect(
      PANEL.includes("Contestá la pregunta de arriba"),
      "el botón desapareció sin decir por qué: se lee como que el chat no entendió",
    ).toBe(true);
  });

  it("⭐ la caja DICE cuántos cambios venían de antes", () => {
    /* El acuerdo acumula, así que una caja mezcla lo que la persona acaba de pedir con lo que
       pidió hace tres turnos. Sin esta línea el arrastre es invisible.
       La edición que la pone en rojo: borrar el renglón que lee `arrastradas`. */
    /* ⚠ Se afirma sobre el TEXTO QUE SE PINTA, no sobre el nombre del campo: el campo aparece
       en el tipo y en el import aunque nadie lo renderice. */
    expect(
      PANEL.includes("ya los habías acordado y no se aplicaron"),
      "la caja dejó de decir qué cambios venían de antes: el arrastre se vuelve invisible y la " +
        "persona cree que los tres salieron de su último mensaje",
    ).toBe(true);
    /* ⚠ NO alcanza con `toContain("t.acuerdo.arrastradas")`: el campo también se lee más abajo
       para armar la frase (`t.acuerdo.arrastradas!.length`), así que la string sigue presente
       aunque se rompa la CONDICIÓN que decide si la nota se pinta. Se afirma sobre el literal
       exacto de la condición, que hoy es único en el archivo. */
    expect(
      PANEL,
      "la condición que decide si se pinta la nota dejó de mirar `arrastradas`",
    ).toContain('(t.acuerdo.arrastradas?.length ?? 0) > 0');
  });

  it("⛔ y DICE lo que se cayó SOLO — nunca lo que el modelo descartó a pedido", () => {
    /* ⚠ Este campo YA NO recibe lo que el modelo descartó porque el CSE pidió otra cosa (eso lo
       explica el resumen que el modelo escribe, y repetirlo era ruido — Elías, 2026-08-21). Sigue
       recibiendo lo que se invalidó SOLO, porque el cronograma cambió debajo de la conversación:
       eso el modelo nunca lo menciona, así que es lo único que de verdad se perdería callado. */
    expect(
      PANEL.includes("Ya no va:"),
      "un cambio invalidado por el cronograma dejó de mostrarse: se pierde en silencio",
    ).toBe(true);
    /* ⚠ Mismo defecto que ya se cazó en la nota de arrastradas: `toContain("t.acuerdo.descartadas")`
       pasa igual con la condición rota, porque el `.map()` de abajo repite la misma string. Se
       afirma sobre la condición completa, que es única. */
    expect(
      PANEL,
      "la condición que decide si se pinta la lista dejó de mirar `descartadas`",
    ).toContain('t.estado === "vivo" && t.acuerdo.descartadas?.length ?');
  });

  it("⭐ y ESE campo ya no lo alimenta lo que el modelo descartó por pedido del CSE", () => {
    /* ⭐ LA CORRECCIÓN DE ELÍAS SOBRE LA PRIMERA PRUEBA (2026-08-21): *«cuando se consensúan
       otras cosas, no hace falta el cuadro amarillo que diga 'ya no va'… busco que la experiencia
       sea más como hablar contigo, normal»*. El resumen del modelo ya narra el cambio de rumbo
       («Descarto la propuesta anterior de… En su lugar…»); la caja amarilla lo repetía.
       La edición que la pone en rojo: volver a sumar `fusion.descartadas` a `soltadas`. */
    const RUTA_ASISTENTE = soloCodigo(
      fs.readFileSync(path.join(RAIZ, "lib/asistente/turno.ts"), "utf8"),
    );
    const i = RUTA_ASISTENTE.indexOf("const soltadas = ");
    expect(i, "desapareció el armado de `soltadas`").toBeGreaterThan(-1);
    /* ⚠ NO se corta en el primer `;`: cae DENTRO del callback de `.map` (`const i = ...;`),
       antes de llegar a `fusion.descartadas`. Cortar ahí medía lo mismo en la versión correcta y
       en la rota — se cazó rompiendo la guarda y viéndola pasar igual. Se extiende hasta el
       próximo `acuerdo = {`, que cierra el statement completo en los dos casos. */
    const bloque = RUTA_ASISTENTE.slice(i, RUTA_ASISTENTE.indexOf("acuerdo = {", i));
    expect(bloque.length, "la guarda no está mirando nada").toBeGreaterThan(80);
    expect(
      bloque.includes("fusion.descartadas"),
      "volvió a mostrarse lo que el modelo descartó por pedido del CSE: es la misma información " +
        "que el resumen ya dice, dos veces",
    ).toBe(false);
    expect(bloque, "`soltadas` dejó de venir de lo invalidado por el cronograma").toContain(
      "libro.caidas",
    );
  });
});

describe("⭐ una caja que ya no es accionable no repite todo su razonamiento", () => {
  it("⛔ APLICADO se colapsa a una línea corta, no a la prosa entera", () => {
    /* ⭐ LA CORRECCIÓN DE ELÍAS SOBRE LA PRIMERA PRUEBA (2026-08-21): *«no hace falta que se vea
       el cuadro… con toda la explicación larga… sino más como: Aplicado, ¿Hay que cambiar algo
       más?»*. El detalle no se pierde —sigue en el cronograma— pero no hace falta releerlo en el
       hilo cada vez que se scrollea hacia arriba.
       La edición que la pone en rojo: sacar la rama `t.estado === "aplicado"` del render. */
    expect(
      PANEL.includes('t.estado === "aplicado" ? ('),
      "volvió a mostrarse la prosa entera de un acuerdo ya aplicado",
    ).toBe(true);
    expect(PANEL, "el texto corto que pidió Elías desapareció").toContain(
      "Aplicado. ¿Hay que cambiar algo más?",
    );
  });

  it("⛔ y RETOMADO no repite nada: el encabezado ya lo dice todo", () => {
    /* El encabezado ya dice «sigue abajo, en la propuesta vigente» — repetir la lista vieja debajo
       de esa frase sería leer dos veces lo mismo, numerado distinto en cada caja. */
    expect(
      PANEL.includes('t.estado === "retomado" ? null'),
      "un acuerdo retomado volvió a mostrar su cuerpo entero",
    ).toBe(true);
  });

  it("⚠ pero VIVO y EN-ESPERA conservan el detalle completo", () => {
    /* ⚠ ESTA GUARDA ESTABA MAL HECHA, y no se notó hasta re-auditarla a pedido de Elías.
       Cortaba en el PRIMER `) : (` literal después del ternario — pero ese patrón también
       aparece DENTRO del render de "vivo" (el ternario del checkbox de cada línea), mucho más
       abajo. La ventana terminaba devorando casi toda la rama "vivo" en vez de pararse en el
       límite real, así que las dos assertions pasaban sin medir el límite del colapso.

       El límite real es el LITERAL que separa la rama "retomado" (que devuelve `null`) de la
       rama por defecto (donde vive el detalle): `t.estado === "retomado" ? null : (`. Es un
       string que solo puede aparecer una vez, en esa unión exacta. */
    const iAplicado = PANEL.indexOf('t.estado === "aplicado" ? (');
    const iElse = PANEL.indexOf('t.estado === "retomado" ? null : (', iAplicado);
    expect(iElse, "el ternario de tres ramas cambió de forma").toBeGreaterThan(iAplicado);

    const bloqueColapsado = PANEL.slice(iAplicado, iElse);
    expect(
      bloqueColapsado.includes("t.acuerdo.lineas.map"),
      "las ramas aplicado/retomado volvieron a mostrar la lista de operaciones",
    ).toBe(false);

    const iDetalle = PANEL.indexOf("t.acuerdo.lineas.map", iElse);
    expect(
      iDetalle,
      "el detalle completo (lista de operaciones) desapareció del branch de vivo/en-espera",
    ).toBeGreaterThan(-1);
  });
});
