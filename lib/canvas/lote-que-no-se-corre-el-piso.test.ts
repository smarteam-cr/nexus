/**
 * lib/canvas/lote-que-no-se-corre-el-piso.test.ts — BORRAR DOS ÍTEMS DE LA MISMA LISTA.
 *
 * ── EL FALLO ─────────────────────────────────────────────────────────────────────────────────
 * Elías, sobre «Del hoy al nuevo sistema» de un kickoff (2026-08-23), dos listas de SEIS:
 *
 *   «Borra las últimas 2 opciones a cada card»
 *   → ⚠ «No registré 2 de los cambios: esa lista tiene 5 ítems y se pidió el 6»
 *   → y la cajita ofrecía quitar los QUINTOS, no los sextos.
 *
 * ⭐ Un mensaje que describe un documento que NUNCA EXISTIÓ. El servidor tenía seis; el «5» era
 * `arr.length` a mitad del lote, después de que el borrado hermano ya había encogido la copia de
 * trabajo. Las posiciones se congelaban ANTES del lote y se juzgaban DESPUÉS.
 *
 * ⚠ Y era INTERMITENTE por construcción: emitidas al revés (5 y después 4) las cuatro entraban.
 * Nada obliga a un orden, así que el mismo pedido sobre el mismo documento daba resultados
 * distintos según cómo saliera el modelo.
 *
 * ⛔ Y el camino que el prompt RECOMIENDA caía en el mismo pozo: la `cita` se traduce a una
 * posición absoluta antes del dry-run. No era que el modelo contara mal.
 *
 * ── LO QUE NO SE TOCÓ, Y POR QUÉ ─────────────────────────────────────────────────────────────
 * La mutación acumulada del lote es DELIBERADA: «creá una sección y llenala» la necesita, y hay
 * un test que la congela. Lo que se arregló es cómo se resuelve la coordenada, no que el lote
 * comparta una copia.
 */
import { describe, it, expect } from "vitest";
import {
  aplicarOperacionesDeDocumento,
  prepararOperacionesDeDocumento,
  describirOperacionesDeDocumento,
  type SeccionActual,
} from "./operaciones-de-documento";

const TODO = { puedeOcultar: true, puedeCrear: true };

/** El esquema real del comparativo del kickoff: dos listas de textos sueltos. */
const SCHEMA = {
  type: "object",
  properties: {
    subhead: { type: "string" },
    hoy: { type: "array", items: { type: "string" } },
    conSistema: { type: "array", items: { type: "string" } },
  },
};

/** Los bullets EXACTOS de la captura. */
const HOY = [
  "Salesforce, Pardot y HubSpot corriendo en paralelo — datos duplicados y poco confiables.",
  "La experiencia de cada cuenta depende del CSM que le toca, no de un estándar.",
  "Si sale el coordinador de marketing, las campañas se detienen.",
  "Sin atribución: no pueden demostrar qué campañas generan oportunidades reales.",
  "Aircall no sincroniza correctamente con el CRM: llamadas y datos de contacto se pierden.",
  "Los tickets de Jira y las conversaciones con clientes viven en sistemas separados, sin trazabilidad.",
];
const CON = [
  "Un único sistema de registro: toda la operación vive en HubSpot.",
  "Playbooks, macros y guías de tono definen la experiencia, no la persona.",
  "Atribución activa: cada lead vinculado a su campaña de origen.",
  "Procesos de marketing documentados que funcionan sin depender de un individuo.",
  "Telefonía y tickets conectados: Aircall y Jira integrados directamente con HubSpot.",
  "Reporting unificado: paneles de ventas, CS y marketing consolidados en un solo lugar.",
];

const seccion = (): SeccionActual[] => [
  {
    id: "s1",
    key: "hoy_vs_sistema",
    label: "Del hoy al nuevo sistema",
    data: { subhead: "", hoy: [...HOY], conSistema: [...CON] },
    schema: SCHEMA,
    schemaDelAgente: SCHEMA,
    oculta: false,
    esCreada: false,
    movible: true,
    rotulosDeListas: { hoy: "Hoy", conSistema: "Con el sistema" },
  },
];

const borrar = (lista: string, posicion: number) => ({
  op: "seccion.item.borrar" as const,
  key: "hoy_vs_sistema",
  lista,
  posicion,
});

const dataDelPlan = (plan: { tipo: string; data?: unknown }[]) =>
  (plan.find((p) => p.tipo === "data")?.data ?? {}) as { hoy: string[]; conSistema: string[] };

describe("⛔ un lote no se corre el piso a sí mismo", () => {
  it("el caso de Elías: los cuatro borrados entran, y da igual el orden en que salgan", () => {
    /* Ascendente [4,5] era el que fallaba; descendente [5,4] pasaba. Un mismo pedido que depende
       de cómo ordene el modelo es un fallo intermitente, y los intermitentes son los que se
       discuten con hipótesis en vez de con el dato. */
    for (const orden of [
      [4, 5],
      [5, 4],
    ]) {
      const secs = seccion();
      const ops = orden.flatMap((p) => [borrar("hoy", p), borrar("conSistema", p)]);
      const prep = prepararOperacionesDeDocumento(secs, ops, TODO);
      expect(prep.rechazadas, `orden ${orden.join(",")}: se cayó alguna`).toEqual([]);

      const r = aplicarOperacionesDeDocumento(secs, prep.aceptadas, TODO);
      expect(r.rechazadas).toEqual([]);
      const d = dataDelPlan(r.plan);
      expect(d.hoy, `orden ${orden.join(",")}`).toEqual(HOY.slice(0, 4));
      expect(d.conSistema, `orden ${orden.join(",")}`).toEqual(CON.slice(0, 4));
    }
  });

  it("⛔ y por CITA pasa lo mismo — el prompt pide citar, no contar", () => {
    /* La cita se traduce a una posición absoluta ANTES del dry-run, así que el camino recomendado
       caía en el MISMO pozo. Si este caso se cae, el arreglo se apagó para el camino que la gente
       de verdad usa. */
    const secs = seccion();
    const ops = [
      { op: "seccion.item.borrar", key: "hoy_vs_sistema", cita: HOY[4] },
      { op: "seccion.item.borrar", key: "hoy_vs_sistema", cita: HOY[5] },
    ];
    const prep = prepararOperacionesDeDocumento(secs, ops, TODO);
    expect(prep.rechazadas).toEqual([]);
    const r = aplicarOperacionesDeDocumento(secs, prep.aceptadas, TODO);
    expect(dataDelPlan(r.plan).hoy).toEqual(HOY.slice(0, 4));
  });

  it("⚠ dos borrados SALTEADOS tampoco acusan un reordenamiento que nadie hizo", () => {
    /* El otro síntoma del mismo defecto, y más engañoso: borrar el 2.º y el 4.º corría el índice y
       el segundo se caía con «alguien reordenó la lista» — mandando a investigar a una persona
       que no tocó nada. */
    const secs = seccion();
    const prep = prepararOperacionesDeDocumento(secs, [borrar("hoy", 1), borrar("hoy", 3)], TODO);
    expect(prep.rechazadas.map((r) => r.motivo)).toEqual([]);
    const r = aplicarOperacionesDeDocumento(secs, prep.aceptadas, TODO);
    expect(dataDelPlan(r.plan).hoy).toEqual([HOY[0], HOY[2], HOY[4], HOY[5]]);
  });

  it("mover dos ítems de la misma lista tampoco se pisa", () => {
    const secs = seccion();
    const ops = [
      { op: "seccion.item.mover", key: "hoy_vs_sistema", lista: "hoy", posicion: 5, a: 0 },
      { op: "seccion.item.mover", key: "hoy_vs_sistema", lista: "hoy", posicion: 4, a: 1 },
    ];
    const prep = prepararOperacionesDeDocumento(secs, ops, TODO);
    expect(prep.rechazadas).toEqual([]);
    const d = dataDelPlan(aplicarOperacionesDeDocumento(secs, prep.aceptadas, TODO).plan);
    /* Los dos últimos suben al frente, cada uno siguiendo a SU ítem. */
    expect(d.hoy.slice(0, 2)).toEqual([HOY[5], HOY[4]]);
  });
});

describe("⛔ el ancla que ya viene NO se pisa", () => {
  it("un pendiente arrastrado conserva la identidad que la persona aprobó", () => {
    /* La app calcula el ancla cuando FALTA —el modelo no la emite—. Recalcularla sobre un
       pendiente la reemplazaba por «lo que hoy está en ese índice», y ahí el chequeo del ejecutor
       comparaba el ancla contra sí misma: pasaba siempre. Con la búsqueda por ancla es peor,
       porque seguiría al ítem equivocado con total convicción.
       La edición que la pone en rojo: sacar el `yaTieneAncla` de `prepararOperacionesDeDocumento`. */
    const secs = seccion();
    const pendiente = {
      op: "seccion.item.borrar" as const,
      key: "hoy_vs_sistema",
      lista: "hoy",
      posicion: 0,
      /* Se acordó quitar el QUINTO; desde entonces alguien reordenó y quedó en otro lugar. */
      ancla: HOY[4].slice(0, 24),
    };
    const prep = prepararOperacionesDeDocumento(secs, [pendiente], TODO);
    expect(prep.rechazadas).toEqual([]);
    expect((prep.aceptadas[0] as { ancla?: string }).ancla).toBe(HOY[4].slice(0, 24));

    const d = dataDelPlan(aplicarOperacionesDeDocumento(secs, prep.aceptadas, TODO).plan);
    /* Sigue al ítem aprobado, no al que quedó en la posición 0. */
    expect(d.hoy).not.toContain(HOY[4]);
    expect(d.hoy).toContain(HOY[0]);
  });
});

describe("⚠ la línea que aprueba una persona no corta palabras", () => {
  it("cita el texto VIVO del ítem, no el ancla de 24 caracteres", () => {
    /* En pantalla se leyó «Se quita «Aircall no sincroniza co» de la lista «Hoy»» — cortado a
       mitad de palabra y sin puntos suspensivos. En un borrado múltiple ese renglón es lo ÚNICO
       que separa «quitá estos dos» de «quitá los otros dos».
       La edición que la pone en rojo: volver `itemDicho` a interpolar `o.ancla`. */
    const secs = seccion();
    const prep = prepararOperacionesDeDocumento(secs, [borrar("hoy", 4)], TODO);
    const [linea] = describirOperacionesDeDocumento(secs, prep.aceptadas);

    expect(linea).not.toContain("sincroniza co»");
    expect(linea).toContain("Aircall no sincroniza correctamente");
    /* Y usa el rótulo humano de la lista, no su key. */
    expect(linea).toContain("«Hoy»");
  });

  it("un texto largo se recorta con «…», como todo el resto de las líneas", () => {
    const largo = "x".repeat(300);
    const secs = seccion();
    (secs[0].data as { hoy: string[] }).hoy = [largo, "otro"];
    const prep = prepararOperacionesDeDocumento(secs, [borrar("hoy", 0)], TODO);
    const [linea] = describirOperacionesDeDocumento(secs, prep.aceptadas);
    expect(linea).toContain("…");
    expect(linea.length).toBeLessThan(220);
  });

  it("⛔ ninguna línea puede decir «undefined», pase lo que pase", () => {
    const secs = seccion();
    const lineas = describirOperacionesDeDocumento(secs, [
      borrar("hoy", 99),
      { op: "seccion.item.borrar", key: "hoy_vs_sistema", lista: "noExiste", posicion: 0 },
      borrar("hoy", 0),
    ]);
    for (const l of lineas) expect(l, l).not.toContain("undefined");
  });
});

describe("⛔ la identidad de un ítem sale del ESQUEMA, no del primer string crudo", () => {
  /**
   * En pantalla se leyó, el 2026-08-23:
   *   «En «Sesiones y horarios», en «58dc6158-dfee-4ce8-a442-», label pasa a: «Martes 11:00 pm»»
   * — 24 caracteres de un UUID, que es justo el largo del ancla.
   *
   * ⭐ Y la ironía: el `schemaDelChat` de esas secciones ESCONDE el `id` a propósito, porque el
   * modelo no puede inventarlo. Una mitad decía «esta lista es {label}» y la otra leía el objeto
   * entero. Al equipo le pasaba igual: «quitá a Lidia» se leía «Se quita «cmk3f9…»».
   */
  const SCHEMA_HORARIOS = {
    type: "object",
    properties: {
      options: { type: "array", items: { type: "object", properties: { label: { type: "string" } } } },
    },
  };
  const horarios = (): SeccionActual[] => [
    {
      id: "h1",
      key: "horarios",
      label: "Sesiones y horarios",
      data: {
        options: [
          { id: "58dc6158-dfee-4ce8-a442-9f1c", label: "Martes 11:00 am" },
          { id: "a1d2ea3e-1b7e-486b-a638-77aa", label: "Jueves 11:00 am" },
        ],
      },
      schema: SCHEMA_HORARIOS,
      schemaDelAgente: {},
      oculta: false,
      esCreada: false,
      movible: true,
    },
  ];

  it("la línea del acuerdo dice la etiqueta, no el UUID", () => {
    /* La edición que la pone en rojo: sacarle el schema a `identidadDeItem`. */
    const secs = horarios();
    const prep = prepararOperacionesDeDocumento(
      secs,
      [{ op: "seccion.campo", key: "horarios", campo: "options.0.label", valor: "Martes 11:00 pm" }],
      TODO,
    );
    const [linea] = describirOperacionesDeDocumento(secs, prep.aceptadas);
    expect(linea, "el UUID volvió a la línea que aprueba una persona").not.toContain("58dc6158");
    expect(linea).toContain("Martes 11:00 am");
  });

  it("y el ANCLA también: es la llave de integridad, no puede ser un id", () => {
    const secs = horarios();
    const prep = prepararOperacionesDeDocumento(
      secs,
      [{ op: "seccion.item.borrar", key: "horarios", lista: "options", posicion: 1 }],
      TODO,
    );
    expect((prep.aceptadas[0] as { ancla?: string }).ancla).toBe("Jueves 11:00 am");
  });

  it("⛔ MIGRACIÓN: un pendiente con el ancla VIEJA (el UUID) se sigue aceptando", () => {
    /* El ancla viaja PERSISTIDA dentro de cada acuerdo del hilo. Sin esto, todos los hilos
       abiertos se caerían con «alguien reordenó la lista» sobre listas que nadie tocó.
       La edición que la pone en rojo: sacar el `||` de compatibilidad. */
    const secs = horarios();
    const prep = prepararOperacionesDeDocumento(
      secs,
      [
        {
          op: "seccion.item.borrar",
          key: "horarios",
          lista: "options",
          posicion: 0,
          ancla: "58dc6158-dfee-4ce8-a442-",
        },
      ],
      TODO,
    );
    const r = aplicarOperacionesDeDocumento(secs, prep.aceptadas, TODO);
    expect(r.rechazadas).toEqual([]);
  });

  it("⛔ MIGRACIÓN: y también cuando el ítem SE MOVIÓ desde que se acordó", () => {
    /* Este caso ejercita la BÚSQUEDA por ancla, no el chequeo: el pendiente dice `posicion: 0` y
       su ítem está en la 1. Sin el `||` en la búsqueda, no lo encuentra y borra el equivocado —
       o se cae. Escribirlo aparte fue lo que descubrió que el caso de arriba probaba otra línea. */
    const secs = horarios();
    const prep = prepararOperacionesDeDocumento(
      secs,
      [
        {
          op: "seccion.item.borrar",
          key: "horarios",
          lista: "options",
          posicion: 0,
          /* El ancla LEGACY del SEGUNDO ítem: se acordó cuando estaba primero. */
          ancla: "a1d2ea3e-1b7e-486b-a638-",
        },
      ],
      TODO,
    );
    const r = aplicarOperacionesDeDocumento(secs, prep.aceptadas, TODO);
    expect(r.rechazadas).toEqual([]);
    const data = (r.plan.find((x) => x.tipo === "data") as { data: { options: { label: string }[] } }).data;
    expect(data.options.map((o) => o.label), "siguió al ítem equivocado").toEqual(["Martes 11:00 am"]);
  });

  it("sin esquema declarado —una sección creada a mano— sigue como antes", () => {
    /* Ahí no hay forma declarada, y adivinar sería peor que el comportamiento conocido. */
    const secs: SeccionActual[] = [
      {
        id: "c1",
        key: "custom:tabla:x",
        label: "Creada",
        data: { filas: [{ a: "primero", b: "segundo" }] },
        schema: {},
        oculta: false,
        esCreada: true,
        movible: true,
      },
    ];
    const prep = prepararOperacionesDeDocumento(
      secs,
      [{ op: "seccion.item.borrar", key: "custom:tabla:x", lista: "filas", posicion: 0 }],
      TODO,
    );
    expect((prep.aceptadas[0] as { ancla?: string }).ancla).toBe("primero");
  });
});
