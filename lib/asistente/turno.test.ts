/**
 * lib/asistente/turno.test.ts — UNA SOLA HERRAMIENTA, Y NO ESCRIBE.
 *
 * Correr: `npx vitest run lib/asistente/turno.test.ts --project unit`.
 *
 * ── LA GUARDA QUE IMPORTA ────────────────────────────────────────────────────────────────────
 * El chat le da al modelo UNA herramienta: `registrar_cambio_acordado`, que **emite texto**. La
 * tentación —nombrada en el plan como «lo que NO se hace»— es darle un catálogo: `aplicar_cambio`,
 * `mover_tarea`, `crear_fase`. Cada tool que escribe es una puerta nueva que saltea la vista
 * previa y la aceptación por ítem, y que corre con el permiso del chat en vez del permiso del
 * documento. Es el modo de falla de `artifact-gate` multiplicado, y no falla ruidoso: funciona.
 *
 * Por eso el test no dice «la tool no debería escribir» (eso no se puede afirmar sobre un string):
 * dice **cuántas tools hay**. Agregar la segunda es el diff que hay que leer.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "@/lib/ui/scan-source";
import { leerAcuerdo, marcaDeAcuerdo, MODELO_DEL_ASISTENTE, MARCA_DE_ACUERDO } from "./turno";
import { OPERACIONES_VALIDAS } from "@/lib/timeline/operaciones";

const FUENTE = fs.readFileSync(path.join(RAIZ, "lib/asistente/turno.ts"), "utf8");

const PROMPT = (() => {
  const i = FUENTE.indexOf("function promptDelAsistente");
  return FUENTE.slice(i, FUENTE.indexOf("const TOOL_ACUERDO", i));
})();

describe("el asistente tiene UNA herramienta y no escribe", () => {
  it("⛔ el pedido declara exactamente una tool", () => {
    /* La edición que la pone en rojo: `tools: [TOOL_ACUERDO, TOOL_APLICAR]`. */
    const m = FUENTE.match(/tools:\s*\[([^\]]*)\]/);
    expect(m, "desapareció el arreglo de tools del pedido").not.toBeNull();
    const declaradas = m![1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    /* ⚠ Se cuenta lo que va en UN PEDIDO, no cuántas constantes hay en el archivo. Desde que el
       prompt se bifurca por pieza hay DOS declaraciones —la del cronograma emite operaciones, la
       de documentos emite una instrucción— y el pedido elige una con un ternario. Eso no es una
       puerta de más: es la misma puerta con dos formas. Lo que la guarda protege es que el modelo
       nunca reciba DOS herramientas a la vez, y eso se sigue midiendo igual. */
    expect(
      declaradas,
      "El asistente declaró más de una herramienta EN EL MISMO PEDIDO. Cada tool extra es una " +
        "puerta que saltea la vista previa y la aceptación por ítem, y que corre con el permiso " +
        "del chat en vez del permiso del documento. La única tool emite TEXTO; aplicar es otro " +
        "acto, con otro botón.",
    ).toHaveLength(1);
    expect(declaradas[0], "el pedido dejó de elegir la tool por pieza").toContain("TOOL_ACUERDO");
  });

  it("⛔ el `op` de la tool NO puede salirse del vocabulario del ejecutor", () => {
    /* ⚠ ESTA GUARDA REEMPLAZA A OTRA QUE QUEDÓ OBSOLETA, y el cambio vale la pena explicarlo.

       Antes decía «la tool no pide ids», usando «no hay ids» como PROXY de «la tool no escribe».
       Con las operaciones ese proxy dejó de valer: la tool lleva `phaseId` justamente porque
       nombrar la fase por id es lo que impide adivinar entre dos casi homónimas.

       El invariante REAL no cambió —la tool no escribe, produce datos que un ejecutor
       determinista valida— y ahora se puede afirmar mejor: cada `op` que el modelo puede emitir
       tiene que EXISTIR en `OPERACIONES_VALIDAS`. Si el prompt inventa una que el ejecutor no
       conoce, el chat acordaría algo que después se rechaza en silencio.

       La edición que la pone en rojo: sumar un `op` al enum de la tool sin sumarlo al ejecutor. */
    /* ⚠ ESTA GUARDA SE ENDURECIÓ EL 2026-08-21, y por un motivo medido. La versión anterior
       barría con un regex TODO el bloque de la tool — que incluye la `description` del campo
       `op`, donde cada operación se nombra otra vez en prosa. O sea que una operación citada solo
       en el texto contaba como si estuviera en el enum, y una que se CAYERA del enum pero quedara
       nombrada en la prosa no se notaba. Con 7 operaciones eso era tolerable; con el vocabulario
       creciendo es una guarda que aprueba lo que no mira.

       Ahora se parsea el array `enum` de verdad, y se compara en los DOS sentidos. */
    /* ⚠ Con los dos puntos: `indexOf("const TOOL_ACUERDO")` matchea también
       `const TOOL_ACUERDO_DE_DOCUMENTO`, que se declara ANTES y no tiene enum — la guarda pasaba a
       mirar la tool equivocada y reportaba que el enum había desaparecido. */
    const i = FUENTE.indexOf("const TOOL_ACUERDO:");
    const bloque = FUENTE.slice(i, FUENTE.indexOf('required: ["resumen"', i));
    const j = bloque.indexOf("enum: [");
    expect(j, "el enum de operaciones desapareció de la tool").toBeGreaterThan(-1);
    const crudo = bloque.slice(j + "enum: [".length, bloque.indexOf("]", j));
    const enumDeLaTool = [...crudo.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

    const desconocidas = enumDeLaTool.filter(
      (o) => !(OPERACIONES_VALIDAS as readonly string[]).includes(o),
    );
    expect(
      desconocidas,
      "La tool ofrece operaciones que el ejecutor no conoce. El chat acordaría algo que después " +
        "se rechaza — y el CSE ya lo habría leído y aprobado.",
    ).toEqual([]);

    /* ⭐ Y EL SENTIDO INVERSO, que es el que faltaba: una operación construida y testeada que
       nadie puede pedir. No es hipotético — `tarea.mover-semana`, `tarea.mover-fase` y
       `tarea.borrar` vivieron así un día entero, y ese día el CSE se chocó con «no tengo forma de
       identificar cuáles tareas están atrasadas» sobre un ejecutor que sabía hacerlo.

       Si una operación se deja fuera a propósito, va acá con su motivo escrito. */
    const MUDAS_A_PROPOSITO: { op: string; porQue: string }[] = [];
    const inalcanzables = (OPERACIONES_VALIDAS as readonly string[]).filter(
      (o) => !enumDeLaTool.includes(o) && !MUDAS_A_PROPOSITO.some((m) => m.op === o),
    );
    expect(
      inalcanzables,
      "El ejecutor sabe hacer operaciones que el chat NO puede pedir. O entran al enum, o entran " +
        "a MUDAS_A_PROPOSITO con el motivo escrito — pero código muerto que parece vivo, no.",
    ).toEqual([]);
  });

  it("y el prompt le prohíbe decir que aplicó algo", () => {
    /* El daño de que lo diga no es cosmético: el CSE cierra la pantalla creyendo que el cambio
       está hecho. La edición que la pone en rojo: sacar esa línea del prompt. */
    expect(FUENTE).toContain("TÚ NO APLICAS NADA");
  });
});

describe("el asistente habla español neutro, no rioplatense", () => {
  /* ⚠ ESTA GUARDA NACIÓ DE UN ERROR PROPIO. Al reescribir el prompt para PROHIBIR el voseo se me
     coló un «proponé» dentro del párrafo que lo prohíbe. Ése es exactamente el modo de falla: el
     prompt es largo, se edita seguido, y una forma rioplatense pasa desapercibida — y el modelo
     copia el registro de su propio prompt, así que una sola le contagia la respuesta entera.

     El síntoma que reportó Elías fue el asistente arrancando con «Che». */

  /**
   * ⛔ EL ALCANCE ERA MÁS CHICO QUE EL TEXTO QUE EL MODELO LEE, y ahí vivía el voseo.
   *
   * `PROMPT` corta en `const TOOL_ACUERDO`, así que las descripciones de la tool quedaban
   * afuera — y viajan en CADA request igual que el prompt. `lib/asistente/contexto.ts` tampoco
   * se miraba, y también es texto que el modelo lee.
   *
   * Auditado el 2026-08-21: había seis formas vivas ahí, incluida «decilo», que está en la lista
   * de abajo desde el día uno. La guarda existía y no llegaba.
   */
  /* ⚠ Los COMENTARIOS se blanquean: el modelo no los lee, y contarlos produce falsos positivos
     que enseñan a ignorar la guarda. El primer barrido marcó «pedí» dentro de un docblock que
     decía «LO QUE SE PEDÍA». Lo que queda son las cadenas — el prompt y las descripciones de la
     tool — que es exactamente el texto que viaja en el request. */
  const sinComentarios = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/^\s*\/\/.*$/gm, "");

  const TEXTO_QUE_EL_MODELO_LEE = [
    sinComentarios(FUENTE),
    sinComentarios(fs.readFileSync(path.join(RAIZ, "lib/asistente/contexto.ts"), "utf8")),
  ].join("\n");

  /** Las líneas que PROHIBEN el voseo tienen que poder nombrarlo. */
  const lineasDeUso = TEXTO_QUE_EL_MODELO_LEE.split(/\r?\n/).filter(
    (l) => !/PROHIBIDO|NUNCA|Mal:|⛔ No|no uses/.test(l),
  );

  const VOSEO = [
    "proponé",
    "decilo",
    "usalo",
    "usá",
    "mirá",
    "fijate",
    "tenés",
    "podés",
    "preferís",
    "ofrecé",
    "avisalo",
    "pedí",
    "querés",
    "hacé",
    "dale",
    "che",
    "vos",
  ];

  it("⛔ ni una forma de voseo en el texto que el modelo copia", () => {
    /* La edición que la pone en rojo: cambiar cualquier «propón» por «proponé». */
    const encontradas: string[] = [];
    for (const linea of lineasDeUso) {
      for (const v of VOSEO) {
        /* ⚠ `\b` de JavaScript NO entiende acentos: para el motor, «í» es un caracter de NO
           palabra, así que `\bpedí\b` matchea dentro de «pedía». El borde se escribe a mano
           incluyendo las vocales acentuadas y la ñ. */
        if (new RegExp(`(?<![\\wáéíóúüñ])${v}(?![\\wáéíóúüñ])`, "i").test(linea)) {
          encontradas.push(`${v} — ${linea.trim().slice(0, 70)}`);
        }
      }
    }
    expect(
      encontradas,
      "El prompt del asistente usa voseo. El modelo copia el registro de su prompt, así que una " +
        "sola forma rioplatense le contagia la respuesta entera — y el CSE lee «che».",
    ).toEqual([]);
  });

  it("y las advertencias que interpola también están en tuteo", () => {
    /* Van DENTRO del contexto, así que el modelo también las lee y las parafrasea: si quedan en
       voseo, el prompt dice una cosa y los ejemplos muestran otra. */
    const cap = fs.readFileSync(path.join(RAIZ, "lib/timeline/capacidades.ts"), "utf8");
    const i = cap.indexOf("ADVERTENCIAS_DEL_CRONOGRAMA");
    const bloque = cap.slice(i, cap.indexOf("export function", i));
    for (const v of ["pedilo", "escribiste vos"]) {
      expect(bloque.includes(v), `la advertencia sigue en voseo: "${v}"`).toBe(false);
    }
  });

  it("⭐ y pide las listas NUMERADAS, que es como se leen bien", () => {
    /* Elías: «las listas deben ser numeradas siempre». Una viñeta se lee peor que un número en un
       panel de 400 px, y con guiones el modelo tiende a anidar. */
    expect(PROMPT).toContain("NUMERADAS");
  });
});

describe("la regla de las fechas está en el prompt", () => {
  it("⭐ toda propuesta que mueva el cierre lo dice — y si no lo mueve, también", () => {
    /* Decisión de Elías. El silencio se lee como «no cambió nada», y así es como alguien se
       entera tres semanas después. La edición que la pone en rojo: borrar el bloque de fechas. */
    expect(FUENTE).toContain("LAS FECHAS SE DICEN SIEMPRE");
    expect(
      FUENTE.includes("el cierre no se corre"),
      "se perdió la mitad de la regla: avisar también cuando la fecha NO se mueve",
    ).toBe(true);
  });

  it("⚠ y prohíbe ESTIMAR la fecha nueva cuando no la puede calcular", () => {
    /* Medido el 2026-08-20: ante un recorte de dos fases el modelo contestó «mediados/fines de
       julio». Estaba bien, pero es una adivinanza — las fases se solapan y el span no se calcula
       de cabeza. El CSE repite ese rango en una llamada y queda comprometido. La regla: decir
       cuántas semanas se corre, y que la fecha exacta la da la vista previa. */
    expect(PROMPT).toContain("NO la estimes");
  });

  it("⛔ y el prompt lleva la regla del VOCABULARIO CERRADO", () => {
    /* ⚠ REEMPLAZA a una guarda que pedía avisarle al editor sobre las semanas: eso ahora lo
       resuelve `normalizar()` en el ejecutor, determinista y sin depender de que el modelo se
       acuerde.

       Lo que SÍ depende del prompt es el riesgo nuevo: que un pedido fuera del vocabulario caiga
       en la operación más parecida. Rápido, silencioso y equivocado. El ejemplo del prompt es el
       real («sacar la semana del MEDIO», que no tiene operación y se parece a acortar).

       La edición que la pone en rojo: borrar ese bloque del prompt. */
    expect(PROMPT).toContain("VOCABULARIO ES UNA LISTA CERRADA");
    expect(PROMPT, "se perdió el ejemplo que enseña a NO aproximar").toContain("DEL MEDIO");
  });

  it("⭐ y la doble confirmación antes de borrar trabajo hecho", () => {
    /* Pedido de Elías: «el chat debería avisar, esa fase fue creada por un humano, ¿seguro que
       querés borrarla?, con una confirmación doble. Pero no es que no debería poder borrarlas». */
    expect(PROMPT).toContain("DOBLE CONFIRMACIÓN");
    expect(PROMPT).toContain("fase.borrar");
  });
});

describe("el breakpoint de caché está donde cachea", () => {
  it("⚠ va en el bloque de CONTEXTO, nunca en el prompt solo", () => {
    /* Medido el 2026-08-19: el prompt solo son ~700 tokens y cae bajo el mínimo cacheable de
       Sonnet 5 (1.024). Marcarlo ahí sería una escritura de caché PAGADA que nunca se lee — sin
       error y sin log. Juntos llegan a ~1.700 y sí cachean.
       La edición que la pone en rojo: mover el `cache_control` al primer bloque del system. */
    const i = FUENTE.indexOf("system: [");
    const bloque = FUENTE.slice(i, FUENTE.indexOf("tools:", i));
    const posPrompt = bloque.indexOf("promptDelAsistente(");
    const posContexto = bloque.indexOf("ctx.texto");
    const posCache = bloque.indexOf("cache_control");
    expect(posPrompt, "el prompt salió del system").toBeGreaterThan(-1);
    expect(posContexto, "el contexto salió del system").toBeGreaterThan(-1);
    expect(
      posCache > posContexto && posContexto > posPrompt,
      "el breakpoint de caché quedó antes del contexto: a ese tamaño no cachea y se paga igual",
    ).toBe(true);
    expect(
      (bloque.match(/cache_control/g) ?? []).length,
      "hay más de un breakpoint: cada uno es una escritura de caché que se paga",
    ).toBe(1);
  });

  it("⛔ y el bloque de PENDIENTES no entra al prefijo cacheado", () => {
    /* ⛔ LA FALLA MÁS CALLADA DE TODO EL DISEÑO, y solo se ve en la factura.

       Lo pendiente cambia en cada turno. Metido adentro de `system` —que es lo que el
       `cache_control` marca como prefijo estable— invalidaría la caché ENTERA en cada turno: sin
       error, sin log, sin nada raro en pantalla. Solo el gasto, multiplicado.

       Va en `messages`, que no está cacheado, así que tocarlo es neutro.
       La edición que la pone en rojo: mover `bloqueDePendientes(...)` al array de `system`. */
    const i = FUENTE.indexOf("system: [");
    const bloqueSystem = FUENTE.slice(i, FUENTE.indexOf("tools:", i));
    expect(bloqueSystem.length, "la guarda no está mirando nada").toBeGreaterThan(80);
    expect(
      bloqueSystem.includes("bloqueDePendientes"),
      "el bloque de pendientes entró al prefijo cacheado: invalida la caché en cada turno, y eso " +
        "no falla — solo se paga",
    ).toBe(false);

    const j = FUENTE.indexOf("const messages:");
    const bloqueMessages = FUENTE.slice(j, FUENTE.indexOf("];", j));
    expect(
      bloqueMessages.includes("bloqueDePendientes"),
      "lo pendiente dejó de llegarle al modelo: vuelve a proponer sin saber qué quedó sin aplicar",
    ).toBe(true);
  });

  it("⚠ el modelo es el que se midió, no el que suena barato", () => {
    /* Haiku 4.5 exige 4.096 tokens para cachear —el mínimo más alto de la familia— así que a este
       tamaño de prompt NO cachea nunca y paga el prefijo entero en cada turno. Cambiar esta
       constante no es cambiar una constante: hay que volver a medir. */
    expect(MODELO_DEL_ASISTENTE).toBe("claude-sonnet-5");
    expect(FUENTE).toContain("4.096");
  });
});

describe("⛔ el LECTOR acepta lo que el PRODUCTOR emite", () => {
  /* ⚠ ESTA GUARDA NACIÓ DE UN BUG QUE LOS TESTS DEJARON PASAR, y el porqué importa.

     Al pasar la herramienta a operaciones, `leerAcuerdo` siguió exigiendo `instruccion` —que ya
     no se emite— así que el acuerdo se GUARDABA bien en el hilo y se leía como `null`: la cajita
     azul nunca aparecía. Elías lo vio como «el asistente contesta y no pasa nada».

     Los tests de ida y vuelta seguían verdes porque su fixture era del shape VIEJO: probaban que
     el round-trip funcionaba para algo que el productor ya no producía. Un test que se prueba a
     sí mismo en vez de al sistema.

     La forma correcta es arrancar del shape REAL que arma `correrTurno`. */

  it("un acuerdo con OPERACIONES va y vuelve entero", () => {
    /* La edición que la pone en rojo: volver a exigir `instruccion` en `leerAcuerdo`. */
    const real = {
      resumen: "Sales Hub pasa de 4 a 2 semanas.",
      operaciones: [{ op: "fase.duracion", phaseId: "abc123", semanas: 2 }],
      lineas: ["«Sales Hub» pasa de 4 a 2 semanas"],
    };
    const leido = leerAcuerdo(`Listo.

${marcaDeAcuerdo(real)}`);
    expect(
      leido.acuerdo,
      "el acuerdo con operaciones se leyó como null: la cajita azul no va a aparecer",
    ).not.toBeNull();
    expect(leido.acuerdo!.operaciones).toEqual(real.operaciones);
    expect(leido.acuerdo!.lineas).toEqual(real.lineas);
  });

  it("⚠ y un acuerdo VIEJO, con instrucción de texto, sigue leyéndose", () => {
    /* Los hilos anteriores al 2026-08-20 tienen ese shape. Romperlos convertiría una
       conversación guardada en un texto sin su acuerdo. */
    const viejo = { resumen: "algo", instruccion: "Alarga la fase X" };
    const leido = leerAcuerdo(`ok

${marcaDeAcuerdo(viejo)}`);
    expect(leido.acuerdo!.instruccion).toBe("Alarga la fase X");
  });

  it("⛔ pero un acuerdo SIN operaciones ni instrucción no pinta botón", () => {
    /* Un «Aplicar» que no puede hacer nada es peor que no ofrecerlo. */
    const vacio = { resumen: "dije algo pero no acordé nada" };
    expect(leerAcuerdo(`x

${marcaDeAcuerdo(vacio)}`).acuerdo).toBeNull();
  });

  it("⛔ y un marcador FALSO dentro del texto no borra la cajita", () => {
    /* ⛔ EL MODELO PUEDE IMITAR EL MARCADOR, y hasta hoy eso borraba el acuerdo entero.

       `correrTurno` le manda su propio historial CRUDO, marcador incluido, y el prompt nunca se
       lo explica. Si lo escribe en su texto —citando lo que ve, o «explicando» cómo funciona— el
       `indexOf` cortaba en el FALSO, el `JSON.parse` tiraba, y el lector devolvía `acuerdo: null`:
       la cajita azul desaparecía y la persona veía «contesta pero no pasa nada».

       La edición que la pone en rojo: volver `lastIndexOf` a `indexOf` en `leerAcuerdo`. */
    const real = {
      resumen: "Sales Hub pasa de 4 a 2 semanas.",
      operaciones: [{ op: "fase.duracion", phaseId: "abc123", semanas: 2 }],
      lineas: ["«Sales Hub» pasa de 4 a 2 semanas"],
    };
    const conFalso = `Te dejo el cambio. (Internamente esto viaja como ${MARCA_DE_ACUERDO}{"algo":1}.)

${marcaDeAcuerdo(real)}`;
    const leido = leerAcuerdo(conFalso);
    expect(
      leido.acuerdo,
      "un marcador citado en el texto borró el acuerdo: la cajita azul no aparece",
    ).not.toBeNull();
    expect(leido.acuerdo!.operaciones).toEqual(real.operaciones);
    expect(leido.texto, "el texto visible tiene que conservar lo que el modelo escribió").toContain(
      "Te dejo el cambio",
    );
  });

  it("⛔ y el productor SOLO emite acuerdos que el lector va a aceptar", () => {
    /* El invariante de fondo, afirmado sobre el código: `correrTurno` acepta la tool call cuando
       hay resumen + operaciones, así que `leerAcuerdo` no puede pedir MÁS que eso. La edición
       que la pone en rojo: agregarle un requisito al lector que el productor no garantiza. */
    const i = FUENTE.indexOf("export function leerAcuerdo");
    const lector = FUENTE.slice(i, FUENTE.indexOf("return { texto, acuerdo: null };", i));
    expect(
      /crudo\?\.instruccion\s*\)/.test(lector) && !lector.includes("ops?.length"),
      "el lector volvió a exigir `instruccion`: el acuerdo se guarda y se lee como null",
    ).toBe(false);
  });
});

describe("el acuerdo sobrevive a recargar la pantalla", () => {
  const acuerdo = {
    resumen: "Alargar Setup una semana; el cierre pasa del 8 sep al 15 sep.",
    instruccion: "Alarga la fase «Semana 0» de 1 a 2 semanas.",
  };

  it("va y vuelve entero", () => {
    const contenido = `Listo, te lo dejo armado.\n\n${marcaDeAcuerdo(acuerdo)}`;
    const leido = leerAcuerdo(contenido);
    expect(leido.acuerdo).toEqual(acuerdo);
    expect(leido.texto).toBe("Listo, te lo dejo armado.");
  });

  it("un turno sin acuerdo se lee tal cual", () => {
    expect(leerAcuerdo("¿Quieres que alargue Setup o que mueva la tarea?")).toEqual({
      texto: "¿Quieres que alargue Setup o que mueva la tarea?",
      acuerdo: null,
    });
  });

  it("⚠ una marca truncada pierde el botón, NUNCA la conversación", () => {
    /* El modo de falla que importa: si el JSON quedó a medias, mostrar el texto igual. Perder la
       respuesta del asistente por un botón que no se pudo pintar sería el peor canje posible. */
    const roto = `Te lo dejo armado.\n\n${MARCA_DE_ACUERDO}{"resumen":"a medi`;
    const leido = leerAcuerdo(roto);
    expect(leido.acuerdo).toBeNull();
    expect(leido.texto).toBe("Te lo dejo armado.");
  });

  it("y un acuerdo sin instrucción no pinta botón", () => {
    /* Un «Aplicar» que no puede hacer nada es peor que no ofrecerlo. */
    const contenido = `ok\n\n${MARCA_DE_ACUERDO}${JSON.stringify({ resumen: "algo" })}`;
    expect(leerAcuerdo(contenido).acuerdo).toBeNull();
  });
});

describe("⭐ el traductor recibe lo que necesita para AVISAR", () => {
  it("⛔ las tareas que se le pasan llevan `status` y `source`", () => {
    /* ⛔ UNA GUARDA QUE NO EXISTÍA PORQUE EL DATO NO LLEGABA, y nadie se enteró.

       `describirOperaciones` pinta «⚠ N tienen trabajo hecho encima y se pierden» en `fase.borrar`,
       y lo decide con `isKept({ status, source })`. `turno.ts` armaba las tareas con solo
       `{id, title, weekIndex}`, así que `status` caía al default "PENDING" y `source` a `undefined`:
       `isKept` daba false para TODAS y **el aviso no se pintó nunca**. Es exactamente la red que su
       propio comentario dice estar tendiendo para cuando el modelo se olvida de la doble
       confirmación — una guarda decorativa por falta de datos, no por falta de código.

       La edición que la pone en rojo: sacar `status: t.status` del `map` de `paraTraducir`. */
    const i = FUENTE.indexOf("const paraTraducir");
    expect(i, "desapareció `paraTraducir`: el acuerdo ya no se traduce en el servidor").toBeGreaterThan(-1);
    const bloque = FUENTE.slice(i, FUENTE.indexOf("}));", i));
    expect(bloque.length, "la guarda no está mirando nada").toBeGreaterThan(80);
    for (const campo of ["status: t.status", "source: t.source"]) {
      expect(
        bloque.includes(campo),
        `\`paraTraducir\` dejó de pasar \`${campo}\`: el aviso de «se pierde trabajo hecho» ` +
          "vuelve a ser imposible de disparar, en silencio",
      ).toBe(true);
    }
  });

  it("⚠ y el contexto los TRAE de la base, o el punto anterior es imposible", () => {
    /* El otro extremo del mismo cable: si el contexto deja de seleccionarlos, `paraTraducir` los
       pasa como `undefined` y la guarda de arriba sigue verde sobre datos vacíos. */
    const ctx = fs.readFileSync(path.join(RAIZ, "lib/asistente/contexto.ts"), "utf8");
    const j = ctx.indexOf("items: f.tasks.map");
    expect(j, "el contexto dejó de mapear las tareas").toBeGreaterThan(-1);
    const mapeo = ctx.slice(j, ctx.indexOf("})),", j));
    expect(mapeo.includes("status: t.status"), "el contexto dejó de traer `status`").toBe(true);
    expect(mapeo.includes("source: t.source"), "el contexto dejó de traer `source`").toBe(true);
  });
});

describe("⭐ lo acordado y no aplicado no se pierde", () => {
  it("⛔ el prompt YA NO manda reemplazar la propuesta anterior", () => {
    /* ⭐ LA CAUSA RAÍZ DEL BUG DEL 2026-08-21, y era una línea de prompt.

       Decía, textual: «Si la persona pide otra cosa después, propones de nuevo: cada propuesta
       reemplaza a la anterior.» El CSE pidió dos cosas, el asistente preguntó una y propuso la
       otra (acuerdo de 2 operaciones), el CSE contestó la pregunta, y el asistente propuso de
       nuevo — reemplazando. Las 2 primeras se perdieron en silencio.

       No fue un bug de software: fue una regla cumplida al pie de la letra. Por eso la línea se
       BORRA, no se matiza.
       La edición que la pone en rojo: volver a escribirla. */
    expect(
      PROMPT.includes("cada propuesta reemplaza a la anterior"),
      "volvió la regla que causó la pérdida: contestar una pregunta cuesta la otra mitad del pedido",
    ).toBe(false);
    expect(PROMPT, "el prompt no explica el arrastre").toContain("LO QUE SIGUE PENDIENTE");
    expect(PROMPT, "el prompt no dice que NO se repita lo pendiente").toContain("SOLO lo nuevo");
  });

  it("⛔ y preguntar dejó de eximir de proponer", () => {
    /* La regla vieja («Solo NO llamas la herramienta cuando hiciste una pregunta de
       desambiguación») CONTRADECÍA al ejemplo ✅ del propio prompt, que es el turno correcto que
       produjo la pérdida. El turno del bug cayó en la grieta entre las dos. */
    expect(
      PROMPT.includes("Solo NO llamas la herramienta cuando hiciste una pregunta"),
      "volvió la regla que contradice al ejemplo ✅ del propio prompt",
    ).toBe(false);
    expect(PROMPT).toContain("PREGUNTAR Y PROPONER EN EL MISMO TURNO");
  });

  it("⭐ y por dónde decir que todavía falta una respuesta", () => {
    /* ⭐ La corrección de Elías sobre la primera prueba en pantalla: mientras haya una pregunta
       abierta no se ofrece aplicar, así el pedido termina en UNA sola escritura.
       La edición que la pone en rojo: sacar el campo de la tool, o la regla del prompt. */
    const i = FUENTE.indexOf("const TOOL_ACUERDO:");
    const tool = FUENTE.slice(i, FUENTE.indexOf("};", i));
    expect(tool, "la tool perdió `preguntaAbierta`").toContain("preguntaAbierta:");
    expect(
      PROMPT,
      "el prompt no le exige marcar la pregunta abierta: el modelo va a ofrecer aplicar media cosa",
    ).toContain('"preguntaAbierta": true');
  });

  it("⛔ y cuando pregunta, su mensaje NO repite la lista de cambios", () => {
    /* Elías: *«hay como dos listas numeradas, no sé por qué se ve así»*. El mensaje numeraba los
       asuntos y la lista numeraba las operaciones, pegadas y sin separación. */
    expect(PROMPT).toContain("TU MENSAJE ES LA PREGUNTA Y NADA MÁS");
  });

  it("⛔ la herramienta tiene por dónde soltar lo que ya no corresponde", () => {
    /* Sin `descartar`, la única forma de que el modelo suelte algo pendiente sería NO emitirlo —
       o sea, en silencio: exactamente el modo de falla que el libro vino a matar. */
    const i = FUENTE.indexOf("const TOOL_ACUERDO:");
    const tool = FUENTE.slice(i, FUENTE.indexOf("};", i));
    expect(tool, "la tool del cronograma perdió el campo `descartar`").toContain("descartar:");
  });

  it("⭐ las líneas se DESCARTAN si no hay una por operación", () => {
    /* ⭐ LA RED DE SEGURIDAD DEL INVARIANTE «lo que se LEE es lo que se EJECUTA».

       Si un día alguien calcula las líneas sobre un conjunto distinto del que se va a ejecutar
       —por ejemplo sobre las operaciones que emitió el modelo en vez de sobre las fusionadas— la
       cajita mostraría MENOS de lo que escribe, y la persona aprobaría cambios que no leyó.

       Descartarlas hace que el panel caiga a su aviso de «no se pudo armar el detalle» y
       DESHABILITE el botón: una superficie de falla que ya existe y ya es ruidosa.
       La edición que la pone en rojo: sacar la comparación de largos de `leerAcuerdo`. */
    const desparejo = {
      resumen: "tres cambios",
      operaciones: [
        { op: "fase.duracion", phaseId: "a", semanas: 2 },
        { op: "fase.duracion", phaseId: "b", semanas: 3 },
        { op: "fase.duracion", phaseId: "c", semanas: 4 },
      ],
      lineas: ["solo una linea"],
    };
    const leido = leerAcuerdo(`ok\n\n${marcaDeAcuerdo(desparejo)}`);
    expect(leido.acuerdo, "el acuerdo se perdió entero: solo había que soltar las líneas").not.toBeNull();
    expect(
      leido.acuerdo!.lineas,
      "se pintarían 1 línea para 3 operaciones: la persona aprueba lo que no leyó",
    ).toBeUndefined();
  });

  it("⚠ pero una por operación pasa intacta", () => {
    const parejo = {
      resumen: "dos cambios",
      operaciones: [
        { op: "fase.duracion", phaseId: "a", semanas: 2 },
        { op: "fase.duracion", phaseId: "b", semanas: 3 },
      ],
      lineas: ["una", "dos"],
    };
    expect(leerAcuerdo(`ok\n\n${marcaDeAcuerdo(parejo)}`).acuerdo!.lineas).toEqual(["una", "dos"]);
  });

  it("⚠ y el arrastre viaja en el acuerdo, o la cajita no puede decirlo", () => {
    /* `arrastradas` es lo que permite el renglón «2 de estos 3 ya los habías acordado». Sin él,
       el arrastre es invisible y la persona cree que los tres salieron de su último mensaje. */
    const conArrastre = {
      resumen: "x",
      operaciones: [{ op: "fase.duracion", phaseId: "a", semanas: 2 }],
      lineas: ["una"],
      arrastradas: [0],
      descartadas: ["algo que ya no aplica"],
    };
    const leido = leerAcuerdo(`ok\n\n${marcaDeAcuerdo(conArrastre)}`).acuerdo!;
    expect(leido.arrastradas).toEqual([0]);
    expect(leido.descartadas).toEqual(["algo que ya no aplica"]);
  });
});
