/**
 * lib/canvas/operaciones-arregladas.test.ts — LOS CUATRO FALLOS DE PRODUCCIÓN, COMO TESTS.
 *
 * El 2026-08-22 Elías probó el chat sobre varios canvas y cada pedido falló al aplicar. Los cuatro
 * síntomas eran distintos y la causa era casi siempre la misma: el vocabulario no podía expresar
 * lo que se le pedía, y lo decía tarde —después de que la persona aprobó— o no lo decía en
 * absoluto.
 *
 * Cada `describe` de acá es uno de esos pedidos, con el error textual que se vio en pantalla.
 * Si alguno vuelve a ponerse rojo, es que el chat volvió a prometer algo que no puede cumplir.
 */
import { describe, it, expect } from "vitest";
import {
  aplicarOperacionesDeDocumento,
  describirOperacionesDeDocumento,
  prepararOperacionesDeDocumento,
  validarOperacionDeDocumento,
  type SeccionActual,
} from "./operaciones-de-documento";

const TODO_PERMITIDO = { puedeOcultar: true, puedeCrear: true };

/** El cuadro «Del hoy al nuevo sistema» del kickoff, con su schema REAL (dos listas de textos). */
const COMPARACION: SeccionActual = {
  id: "s1",
  key: "hoy_vs_sistema",
  label: "Del hoy al nuevo sistema",
  data: { subhead: "De tres herramientas a una", hoy: ["Todo en Excel"], conSistema: ["Un solo sistema"] },
  schema: {
    type: "object",
    properties: {
      subhead: { type: "string" },
      hoy: { type: "array", items: { type: "string" } },
      conSistema: { type: "array", items: { type: "string" } },
    },
  },
  oculta: false,
  esCreada: false,
  movible: true,
  rotulosDeListas: { hoy: "Hoy", conSistema: "Con el sistema" },
};

/** «El plan, cumplido» de Entrega, con su schema REAL: la lista se llama `metrics`, no `items`. */
const CUMPLIMIENTO: SeccionActual = {
  id: "s2",
  key: "cumplimiento",
  label: "El plan, cumplido",
  data: {
    metrics: [
      { value: "1 de 10", label: "Fases del plan cerradas" },
      { value: "33 de 94", label: "Tareas completadas" },
    ],
  },
  schema: {
    type: "object",
    properties: {
      metrics: {
        type: "array",
        items: { type: "object", properties: { value: { type: "string" }, label: { type: "string" } } },
      },
    },
  },
  oculta: false,
  esCreada: false,
  movible: true,
};

describe("① «agregá 2 ítems más a cada lado» — la comparación del kickoff", () => {
  /* Lo que pasó: 4 cambios acordados, 0 aplicados.
     «texto» no es un campo de esa lista · «sistema» no es una lista de esa sección */

  it("⭐ agregar a una lista de TEXTOS ahora se puede — antes era imposible por construcción", () => {
    /* El ejecutor asumía que toda lista era de objetos: los campos permitidos salían de
       `items.properties`, que en una lista de textos no existe. Con cualquier `valores` rechazaba;
       con `valores:{}` metía un objeto vacío en el array de strings y el motor lo borraba al
       pintar, en silencio, mientras el chat decía «aplicado».
       La edición que lo pone en rojo: borrar la rama `items?.type === "string"`. */
    const r = aplicarOperacionesDeDocumento(
      [COMPARACION],
      [
        { op: "seccion.item.agregar", key: "hoy_vs_sistema", lista: "hoy", valor: "Sin trazabilidad" },
        { op: "seccion.item.agregar", key: "hoy_vs_sistema", lista: "conSistema", valor: "Todo auditable" },
      ],
      TODO_PERMITIDO,
    );
    expect(r.rechazadas, JSON.stringify(r.rechazadas)).toHaveLength(0);
    const escrito = r.plan.find((e) => e.tipo === "data");
    const data = escrito && escrito.tipo === "data" ? (escrito.data as Record<string, string[]>) : null;
    expect(data?.hoy).toEqual(["Todo en Excel", "Sin trazabilidad"]);
    expect(data?.conSistema).toEqual(["Un solo sistema", "Todo auditable"]);
  });

  it("⛔ y nunca inserta un objeto vacío: `valores` sobre una lista de textos se rechaza diciendo cómo", () => {
    const r = aplicarOperacionesDeDocumento(
      [COMPARACION],
      [{ op: "seccion.item.agregar", key: "hoy_vs_sistema", lista: "hoy", valores: { texto: "X" } }],
      TODO_PERMITIDO,
    );
    expect(r.rechazadas).toHaveLength(1);
    expect(r.rechazadas[0].motivo).toContain("lista de textos");
    expect(r.rechazadas[0].motivo, "el motivo tiene que decir DÓNDE va el texto").toContain("valor");
  });

  it("⭐ la línea dice A CUÁL columna va el bullet, con el nombre que se lee en pantalla", () => {
    /* Pedido explícito de Elías: «me especifique cuáles van en una lista y cuáles en otra (hoy vs
       con el sistema)». Con las keys crudas, los dos renglones se leían igual.
       La edición que lo pone en rojo: volver a interpolar `o.lista` pelado. */
    const [uno, dos] = describirOperacionesDeDocumento(
      [COMPARACION],
      [
        { op: "seccion.item.agregar", key: "hoy_vs_sistema", lista: "hoy", valor: "Sin trazabilidad" },
        { op: "seccion.item.agregar", key: "hoy_vs_sistema", lista: "conSistema", valor: "Todo auditable" },
      ],
    );
    expect(uno).toContain("«Hoy»");
    expect(dos).toContain("«Con el sistema»");
    expect(uno, "la key cruda no se le muestra a nadie").not.toContain("conSistema");
  });
});

describe("② «borrá lo de 1 de 10 fases» — «Se quita «undefined» de items»", () => {
  it("⭐⭐ el ancla la calcula la app: borrar sin que el modelo la emita AHORA funciona", () => {
    /* ⛔ Era el bug más grave: el tipo exigía `ancla`, la herramienta del modelo no la declaraba, y
       nadie la calculaba. `item.borrar` e `item.mover` se rechazaban SIEMPRE, en los diez
       documentos, con un mensaje que culpaba a un reordenamiento que nunca pasó.
       La edición que lo pone en rojo: sacar el enriquecimiento de `prepararOperacionesDeDocumento`. */
    const prep = prepararOperacionesDeDocumento(
      [CUMPLIMIENTO],
      [{ op: "seccion.item.borrar", key: "cumplimiento", lista: "metrics", posicion: 0 }],
      TODO_PERMITIDO,
    );
    expect(prep.rechazadas, JSON.stringify(prep.rechazadas)).toHaveLength(0);
    expect(prep.aceptadas[0], "la app tiene que haber puesto el ancla").toHaveProperty("ancla");

    const r = aplicarOperacionesDeDocumento([CUMPLIMIENTO], prep.aceptadas, TODO_PERMITIDO);
    expect(r.rechazadas, "y con el ancla puesta el editor la acepta").toHaveLength(0);
  });

  it("⛔ ninguna línea puede volver a decir «undefined»", () => {
    /* Se leyó tal cual en pantalla: «Se quita «undefined» de items de «El plan, cumplido»».
       La edición que lo pone en rojo: interpolar `o.ancla` sin respaldo. */
    const lineas = describirOperacionesDeDocumento(
      [CUMPLIMIENTO],
      [
        { op: "seccion.item.borrar", key: "cumplimiento", lista: "metrics", posicion: 0 },
        { op: "seccion.item.mover", key: "cumplimiento", lista: "metrics", posicion: 0, a: 1 },
        { op: "seccion.campo", key: "cumplimiento", campo: "metrics.0.label" } as never,
      ],
    );
    for (const l of lineas) expect(l, l).not.toContain("undefined");
    expect(lineas[0], "sin ancla, la línea nombra la posición").toContain("ítem 1");
  });

  it("⭐ el nombre equivocado de una lista se descubre ANTES de acordar, no al aplicar", () => {
    /* «items» no es una lista de esa sección → la persona aprobó cuatro renglones y recién ahí se
       enteró. Con el dry-run, la operación ni siquiera llega a la cajita.
       La edición que lo pone en rojo: sacar el dry-run de `prepararOperacionesDeDocumento`. */
    const prep = prepararOperacionesDeDocumento(
      [CUMPLIMIENTO],
      [{ op: "seccion.item.borrar", key: "cumplimiento", lista: "items", posicion: 0 }],
      TODO_PERMITIDO,
    );
    expect(prep.aceptadas).toHaveLength(0);
    expect(prep.rechazadas[0].motivo).toContain("no es una lista de esa sección");
  });
});

describe("lo degenerado no entra al acuerdo", () => {
  it("⛔ una operación sin sus campos se rechaza con lo que le falta", () => {
    /* La herramienta declara `required: ["op"]`, así que `{op:"seccion.item.borrar"}` es una
       entrada válida para Anthropic: entraba al acuerdo, se persistía en el hilo y se pintaba
       como un cambio aprobable. La edición que lo pone en rojo: sacar una fila de la tabla. */
    expect(validarOperacionDeDocumento({ op: "seccion.item.borrar" })).toMatchObject({ ok: false });
    expect(validarOperacionDeDocumento({ op: "seccion.campo", key: "x", campo: "intro" })).toMatchObject({
      ok: false,
    });
    expect(validarOperacionDeDocumento({ op: "fase.duracion", key: "x" })).toMatchObject({
      ok: false,
      motivo: expect.stringContaining("no es una operación de documento"),
    });
  });

  it("un campo de texto SÍ puede quedar vacío a propósito — borrar una bajada es un cambio", () => {
    expect(
      validarOperacionDeDocumento({ op: "seccion.campo", key: "x", campo: "subhead", valor: "" }),
    ).toMatchObject({ ok: true });
  });

  it("⛔ vaciar una sección que se dibuja desde el proyecto se rechaza, no escribe una string", () => {
    /* Con schema sin properties, el molde caía al `return ""` y se guardaba la STRING VACÍA como
       data de la sección: data corrupta que los normalizadores tapan al pintar.
       La edición que lo pone en rojo: sacar el chequeo del molde. */
    const derivada: SeccionActual = {
      id: "s3", key: "cronograma", label: "El plan", data: {}, schema: {},
      oculta: false, esCreada: false, movible: true,
    };
    const r = aplicarOperacionesDeDocumento([derivada], [{ op: "seccion.vaciar", key: "cronograma" }], TODO_PERMITIDO);
    expect(r.plan).toHaveLength(0);
    expect(r.rechazadas[0].motivo).toContain("se dibuja desde el proyecto");
  });
});
