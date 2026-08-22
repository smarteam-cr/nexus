/**
 * lib/asistente/loop-de-operaciones.test.ts — EL CHAT SE CORRIGE ANTES DE PROMETER.
 *
 * ── QUÉ PROTEGE ─────────────────────────────────────────────────────────────────────────────
 * El modelo tiene que nombrar las listas y los campos de cada sección, y son decenas de esquemas
 * distintos: va a errar alguno. Lo que decide si eso es un problema es CUÁNDO se descubre.
 *
 * Antes del 2026-08-22 se descubría al final: la persona leía cuatro renglones, marcaba las
 * casillas, apretaba «Aplicar» y recién ahí aparecía «no se pudieron aplicar 4 de 4». Ahora el
 * ejecutor corre en seco antes de acordar y lo rechazado vuelve al modelo como resultado de su
 * propia herramienta, para que lo corrija en la misma llamada.
 *
 * Estas guardas son de FUENTE: el loop vive dentro de una función que llama a Anthropic, así que
 * no se puede ejecutar sin modelo. Lo que se afirma es que las piezas siguen conectadas y que el
 * corte existe — un loop sin techo se descubre en la factura, no en un error.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { RAIZ } from "@/lib/ui/scan-source";
import {
  reclamoDeOperaciones,
  renderSeccionParaElChat,
  CAPACIDADES_POR_PIEZA,
} from "@/lib/canvas/capacidades-de-documento";

const TURNO = fs.readFileSync(path.join(RAIZ, "lib/asistente/turno.ts"), "utf8");
/** El tramo de la rama de DOCUMENTOS, que es donde vive el loop. */
const RAMA = TURNO.slice(TURNO.indexOf("if (!esCronograma) {"), TURNO.indexOf("} else {", TURNO.indexOf("if (!esCronograma) {")));

describe("lo que se acuerda ya pasó por el editor", () => {
  it("⭐ el turno prepara las operaciones contra el documento REAL antes de armar el acuerdo", () => {
    /* Sin esto vuelve el fallo del 2026-08-22: la cajita ofrecía cambios que el editor iba a
       rechazar, y el rechazo llegaba después del clic.
       La edición que la pone en rojo: acordar `opsNuevas` directo, sin preparar. */
    expect(RAMA.length, "la guarda no está mirando nada").toBeGreaterThan(500);
    expect(RAMA, "el turno dejó de validar las operaciones antes de acordar").toContain(
      "prepararOperacionesDeDocumento(",
    );
    expect(
      RAMA,
      "el acuerdo se arma con lo que emitió el modelo, no con lo que sobrevivió al editor",
    ).toContain("const opsDeDoc = prep.aceptadas;");
  });

  it("⛔ y las líneas salen de lo ACEPTADO, no de lo que el modelo pidió", () => {
    /* Es el invariante viejo del carril («lo que se lee es lo que se ejecuta») aplicado al
       conjunto nuevo: si las líneas salieran de `opsNuevas`, la cajita mostraría renglones de
       operaciones que se cayeron en el dry-run. */
    expect(RAMA).toContain("describirOperacionesDeDocumento(seccionesDelDoc, opsDeDoc)");
  });

  it("⭐ un solo reintento, y el techo está escrito", () => {
    /* Un loop sin corte no falla: encadena llamadas que nadie ve hasta que aparecen en la
       factura. La edición que la pone en rojo: envolver el reintento en un `while`. */
    expect(RAMA, "el reintento dejó de devolverle el error al modelo").toContain("tool_result");
    expect(RAMA, "el resultado tiene que llegar marcado como error, o el modelo lo lee como dato").toContain(
      "is_error: true",
    );
    expect(
      (RAMA.match(/await preguntarleAlModelo\(/g) ?? []).length,
      "hay más de un reintento: el turno puede encadenar llamadas sin techo",
    ).toBe(1);
    expect(RAMA, "el reintento dejó de ser condicional").toContain("prep.rechazadas.length > 0 && idDeLaHerramienta");
  });

  it("⛔ lo que sigue rechazado DESPUÉS del reintento se dice, no se calla", () => {
    /* Callarlo dejaría a la persona creyendo que se acordó todo lo que pidió — el modo de falla
       que este carril entero existe para matar. */
    expect(RAMA).toContain("No registré");
  });

  it("⚠ el prefijo cacheado es el MISMO en los dos intentos: reintentar cuesta el delta", () => {
    /* Si el reintento armara su propio `system`, la caché no aplicaría y cada corrección pagaría
       el prefijo entero otra vez — sin error y sin log.
       La edición que la pone en rojo: duplicar el `messages.create` para el reintento. */
    expect(
      (TURNO.match(/anthropic\.messages\.create\(/g) ?? []).length,
      "el pedido se arma en dos lugares: los prefijos pueden divergir y la caché deja de servir",
    ).toBe(1);
    expect(TURNO).toContain("cache_control: { type: \"ephemeral\" }");
  });
});

describe("las capacidades del documento son una sola tabla", () => {
  it("⭐ el servidor y el editor leen la MISMA fuente", () => {
    /* El dry-run corre en el servidor y el apply en el navegador. Con dos literales, el chat
       acordaría ocultar una sección del kickoff y el editor la rechazaría al aplicar — y la
       persona vería «aplicado» seguido de un rechazo sobre lo mismo.
       La edición que la pone en rojo: volver a escribir el literal en el turno. */
    expect(RAMA).toContain("capacidadesDeLaPieza(hilo.pieza)");
    expect(RAMA, "el turno volvió a declarar capacidades a mano").not.toMatch(/puedeOcultar:\s*(true|false)/);
  });

  it("⚠ una pieza sin declarar cae al fallback conservador, no al permisivo", () => {
    /* Si el fallback permitiera todo, un documento nuevo podría acordar ocultar o crear sin que
       su editor sepa hacerlo — y el hilo diría «aplicado». Al revés se nota enseguida. */
    expect(CAPACIDADES_POR_PIEZA["una-pieza-que-no-existe"]).toBeUndefined();
  });
});

describe("el contenido completo de la sección del chip", () => {
  it("⛔ va en los MENSAJES, nunca en el prefijo cacheado", () => {
    /* El breakpoint de caché está al final del bloque de contexto. Meter ahí algo que cambia turno
       a turno invalida la caché entera SIN ERROR Y SIN LOG: se ve tres semanas después, en la
       factura. La edición que la pone en rojo: interpolarlo en el `system`. */
    const i = TURNO.indexOf("const messages:");
    const j = TURNO.indexOf("system: [");
    expect(i, "se movió el armado de mensajes").toBeGreaterThan(-1);
    expect(TURNO.slice(i, TURNO.indexOf("];", i)), "el bloque dejó de ir en messages").toContain(
      "bloqueDeLaSeccion(",
    );
    expect(
      TURNO.slice(j, TURNO.indexOf("],", j)),
      "el contenido de la sección se coló al prefijo: invalida la caché en cada turno",
    ).not.toContain("bloqueDeLaSeccion");
  });

  it("⛔ y NO se persiste en el hilo", () => {
    /* Si se guardara, el turno siguiente le re-mandaría al modelo una foto vieja del documento,
       para siempre — y encima contaría como contenido que la persona escribió.
       La edición que la pone en rojo: guardar el mensaje ya compuesto. */
    const i = TURNO.indexOf('rol: "CSE"');
    expect(i, "cambió cómo se persiste el turno del CSE").toBeGreaterThan(-1);
    expect(TURNO.slice(i - 120, i + 200)).toContain("contenido: mensajeDelCse");
  });

  it("⭐ los ítems se numeran desde 0 — el mismo número que va en `posicion`", () => {
    /* Numerarlos desde 1, que es lo natural al leer, fabricaría un error de una posición en cada
       borrado: el modelo pediría el 3 pensando en el que la lista llama 2. */
    const render = renderSeccionParaElChat(
      {
        type: "object",
        properties: {
          intro: { type: "string" },
          items: {
            type: "array",
            items: { type: "object", properties: { title: { type: "string" } } },
          },
        },
      },
      { intro: "Hola", items: [{ title: "Uno" }, { title: "Dos" }] },
    );
    expect(render).toContain("0. title: «Uno»");
    expect(render).toContain("1. title: «Dos»");
    expect(render).toContain("intro: «Hola»");
  });

  it("⛔ y solo cruza lo que el esquema declara", () => {
    /* Misma regla de privacidad que el contexto: ids, banderas y lo que curó una persona fuera del
       esquema no entran al prompt. La edición que la pone en rojo: recorrer la data en vez del
       esquema. */
    const render = renderSeccionParaElChat(
      { type: "object", properties: { titulo: { type: "string" } } },
      { titulo: "Visible", teamMemberId: "cm123secreto", __marca: "interna" },
    );
    expect(render).toContain("Visible");
    expect(render).not.toContain("cm123secreto");
    expect(render).not.toContain("__marca");
  });
});

describe("el reclamo que se le devuelve al modelo", () => {
  it("⛔ pide re-emitir TODO, porque estas operaciones no son idempotentes", () => {
    /* Si le pidiéramos «mandá solo las corregidas» habría que fusionar dos intentos, y un
       `seccion.item.agregar` que entra dos veces agrega dos ítems.
       La edición que la pone en rojo: pedirle solo las que fallaron. */
    const texto = reclamoDeOperaciones([
      { operacion: { op: "seccion.item.agregar", lista: "items" }, motivo: "«items» no es una lista de esa sección" },
    ]);
    expect(texto).toContain("no entró ninguna");
    expect(texto).toContain("TODAS las operaciones");
    expect(texto, "el modelo necesita ver QUÉ falló y por qué").toContain("«items» no es una lista");
    expect(texto, "y de dónde salen los nombres buenos").toContain("entre corchetes");
  });
});
