import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * lib/timeline/cerrar-desviacion.test.ts — EL ACTO DE DAR POR RESUELTA.
 *
 * El dato ya existía (`desviacion-cerrada.test.ts` protege qué significa cerrar). Acá se protege
 * el ACTO: quién lo puede hacer, qué pasa cuando el agente vuelve a detectar el mismo hecho, y qué
 * ve el cliente.
 *
 * ── ⛔ REABRIR, NO CLONAR ────────────────────────────────────────────────────
 * La salida intuitiva era «la cerrada es historia, si vuelve a pasar se crea una fila nueva». El
 * relevamiento midió por qué no cierra: el agente re-deriva las desviaciones desde los MISMOS
 * transcripts en cada corrida (26 corridas reales sobre Wherex). Con la cerrada fuera de su
 * alcance, la re-propone semana tras semana y cada vuelta crea otra fila con la MISMA huella — N
 * filas indistinguibles por identidad, todas del mismo hecho, y el corrimiento contado N veces.
 *
 * Por eso son DOS decisiones que solo funcionan juntas:
 *   1. la cerrada SIGUE en el bloque de «ya registradas» del prompt, rotulada; y
 *   2. si el agente igual la devuelve (o sea, el hecho volvió a pasar de verdad), el apply la
 *      REABRE en vez de clonarla.
 * Cualquiera de las dos sola vuelve a producir el duplicado infinito.
 *
 * Reabrir además conserva `convertedTaskId`: un compromiso ya convertido en tarea no vuelve a
 * pedir que alguien lo persiga, ni deja que se le cree una segunda tarea para lo mismo.
 */

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (rel: string) =>
  leer(rel)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

const CERRAR = "app/api/projects/[projectId]/timeline/particularidades/[particularidadId]/cerrar/route.ts";
const RESOLVE = "app/api/projects/[projectId]/timeline/particularidades/[particularidadId]/resolve/route.ts";
const APPLY = "app/api/projects/[projectId]/timeline/particularidades/apply/route.ts";
const CTX = "lib/canvas/load-canvas-context.ts";
const GANTT = "components/canvas/TimelineGantt.tsx";
const CANVAS = "components/canvas/CronogramaCanvas.tsx";

describe("el acto vive en su propia ruta", () => {
  it("⚠ NO se llama `resolve`: ese nombre ya significa otra cosa", () => {
    /* `resolve` decide si una SUGERENCIA es cierta (aprobar/descartar). Cerrar decide si un hecho
       ya aceptado sigue vigente. Son los dos ejes de `particularidad-state.ts`; mezclarlos en una
       ruta con dos significados es cómo se termina DESCARTANDO algo que se quería archivar —
       `resolve` con `discard` borra la fila físicamente. */
    expect(fs.existsSync(path.join(RAIZ, CERRAR)), "desapareció la ruta de cerrar").toBe(true);
    expect(sinComentarios(RESOLVE), "`resolve` empezó a hablar de estado").not.toContain(
      'estado: "CERRADA"',
    );
    expect(sinComentarios(RESOLVE), "`discard` dejó de borrar").toContain(
      "prisma.particularidad.delete",
    );
  });

  it("exige el permiso de editar el cronograma", () => {
    expect(sinComentarios(CERRAR)).toContain("guardTimelineEdit(projectId)");
  });

  it("y valida que la desviación sea de ESTE proyecto", () => {
    /* Sin esto, conociendo un id se podría cerrar la desviación de otro cliente. Mismo cinturón
       que la ruta de `resolve`. */
    expect(sinComentarios(CERRAR)).toMatch(/findFirst\([\s\S]{0,160}timeline: \{ projectId \}/);
  });

  it("⛔ no deja cerrar una SUGERENCIA sin confirmar", () => {
    /* Una propuesta todavía no es un hecho del proyecto: no hay nada que dar por resuelto, y
       dejarlo pasar haría que alguien «archive» una sugerencia creyendo que la descartó. */
    const src = sinComentarios(CERRAR);
    expect(src).toContain("existing.needsValidation");
    expect(src).toContain("409");
  });

  it("cerrar dos veces es 409, no un pisotón silencioso", () => {
    /* Doble clic o dos pestañas. Sin el corte, el segundo cierre pisa la nota y la autoría del
       primero — que es justamente el dato que hace legible el archivo. */
    expect(sinComentarios(CERRAR)).toContain("yaCerrada === quiereCerrar");
  });

  it("⚠ y al reabrir NO se borra el registro del cierre anterior", () => {
    /* `resueltaEn`/`resueltaPor`/`resueltaNota` pasan a significar «se había cerrado el …», que es
       lo que hace legible un hecho que volvió a pasar. Limpiarlos dejaría una fila abierta sin
       ninguna señal de que ya había estado resuelta. */
    const src = sinComentarios(CERRAR);
    const i = src.indexOf('{ estado: "ABIERTA" }');
    expect(i, "la rama de reabrir dejó de ser solo el estado").toBeGreaterThan(-1);
    expect(src, "reabrir empezó a limpiar el cierre anterior").not.toMatch(
      /estado: "ABIERTA",[\s\S]{0,120}resueltaEn: null/,
    );
  });
});

describe("⛔ REABRIR, NO CLONAR — las dos mitades, que solo sirven juntas", () => {
  it("1· el agente SIGUE viendo las cerradas", () => {
    /* Sacarlas del bloque de «ya registradas» es la lectura intuitiva («ya son historia») y es la
       que produce el duplicado infinito: el agente las re-deriva del mismo transcript en cada
       corrida y las propone de nuevo, para siempre. */
    const src = sinComentarios(CTX);
    const i = src.indexOf("particularidades: {");
    expect(i, "desapareció el bloque de particularidades del contexto").toBeGreaterThan(-1);
    const bloque = src.slice(i, i + 700);
    expect(bloque, "el where del contexto empezó a filtrar por estado").not.toMatch(
      /where:[\s\S]{0,120}estado/,
    );
    expect(bloque, "el contexto dejó de traer el estado para poder rotularlas").toContain(
      "estado: true",
    );
  });

  it("1b· y las ve ROTULADAS, con la instrucción de qué hacer si volvió a pasar", () => {
    /* Sin el rótulo el agente no puede distinguir «esto ya se resolvió» de «esto sigue vigente», y
       la única forma de que informe una recurrencia real sería proponerla como hecho nuevo. */
    /* ⚠ Mirar que el literal «[CERRADA» exista NO alcanza, y lo cazó romperla: dejando el texto y
       cortando el cálculo (`const cerrada = false && esCerrada(pt)`) el rótulo no se pinta nunca y
       el test seguía verde. Hay que afirmar que el rótulo SALE DEL ESTADO. */
    const codigo = sinComentarios(CTX);
    expect(codigo, "el rótulo dejó de derivarse del estado de la fila").toMatch(
      /const cerrada = esCerrada\(pt\)\s*\n?\s*\?/,
    );
    expect(codigo).toContain("[CERRADA");
    expect(codigo, "se perdió la instrucción de reusar la huella al recurrir").toContain(
      "se reabre, no se duplica",
    );
  });

  it("2· el apply REABRE la fila en vez de crear otra", () => {
    const src = sinComentarios(APPLY);
    expect(src, "el apply dejó de traer el estado de las existentes").toMatch(
      /select:[\s\S]{0,200}estado: true/,
    );
    expect(src, "la rama de re-detección dejó de reabrir").toMatch(
      /toUpdate\.push\(\{[\s\S]{0,400}estado: "ABIERTA"/,
    );
  });

  it("⚠ y NUNCA crea una fila con una huella que ya existe", () => {
    /* La regresión concreta: mandar la cerrada a `toCreate`. Se ve como «la historia se conserva
       y esto es nuevo», y deja N filas indistinguibles por identidad. */
    const src = sinComentarios(APPLY);
    const i = src.indexOf("toCreate.push({");
    const bloque = src.slice(Math.max(0, i - 400), i);
    expect(bloque, "crear dejó de ser la rama del `else` de un match").toContain("} else {");
  });
});

describe("⭐ el cliente lee una FOTO: cerrar no lo alcanza hasta re-subir", () => {
  it("cerrar marca el cronograma como pendiente de subir", () => {
    /* Lo que el cliente abre es un snapshot congelado. Sin esta marca, cerrar no cambia nada de su
       lado y la barra tampoco invita a re-publicar: el cliente sigue leyendo el estado viejo por
       tiempo indefinido, sin que nada avise. Falla silenciosa total. */
    const src = sinComentarios(CANVAS);
    const i = src.indexOf("const cerrarParticularidad");
    expect(i, "desapareció el handler de cerrar").toBeGreaterThan(-1);
    expect(src.slice(i, i + 1400), "cerrar dejó de marcar el cronograma como sucio").toContain(
      "setParticularidadesDirty(true)",
    );
  });

  it("y el fallo del servidor REVIERTE el pintado optimista", () => {
    const src = sinComentarios(CANVAS);
    const i = src.indexOf("const cerrarParticularidad");
    const cuerpo = src.slice(i, i + 2000);
    expect(cuerpo, "un rechazo deja la fila pintada como resuelta").toMatch(
      /if \(!res\.ok\) \{[\s\S]{0,200}setParticularidades\(prev\)/,
    );
  });
});

describe("la pantalla no ofrece trabajo por algo ya resuelto", () => {
  it("una desviación resuelta no se puede convertir en tarea", () => {
    /* Mismo criterio que apaga su contador en el panel. Si acá siguiera ofreciéndose, el botón
       crearía trabajo por algo que alguien ya dio por terminado — y el número del panel y el
       botón de la fila dirían cosas distintas. */
    const src = sinComentarios(GANTT);
    const i = src.indexOf("const convertible =");
    expect(src.slice(i, i + 260), "«Convertir en tarea» volvió a ofrecerse en las cerradas").toContain(
      "!cerrada",
    );
  });

  it("⚠ la cerrada se ATENÚA, no se esconde ni se tacha", () => {
    /* Esconderla borraría la bitácora; tacharla se lee como «esto no pasó», y lo que pasó movió el
       calendario igual. La fila sigue, más tenue, con su chip. */
    /* ⚠ Acotado a ESTA fila: `line-through` existe legítimamente en el archivo para las tareas
       hechas, así que un escaneo del archivo entero salía rojo con el código correcto. */
    const src = sinComentarios(GANTT);
    const i = src.indexOf("function ParticularidadRow");
    expect(i, "desapareció ParticularidadRow").toBeGreaterThan(-1);
    const sig = src.slice(i + 10).search(/^function /m);
    const fila = src.slice(i, sig === -1 ? src.length : i + 10 + sig);
    expect(fila).toContain('cerrada ? "opacity-60" : ""');
    expect(fila, "apareció un tachado sobre las cerradas").not.toContain("line-through");
  });

  it("el motivo del cierre se pide, y se muestra donde se lee la fila", () => {
    const src = leer(GANTT);
    expect(src, "se perdió el pedido del motivo").toContain("¿Por qué se resolvió?");
    expect(src, "el motivo guardado no se muestra en ningún lado").toContain("pt.resueltaNota");
  });
});
