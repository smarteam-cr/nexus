/**
 * lib/timeline/operaciones.test.ts — UNA OPERACIÓN TOCA LO QUE NOMBRA, Y NADA MÁS.
 *
 * Correr: `npx vitest run lib/timeline/operaciones.test.ts --project unit`.
 *
 * ── EL CASO REAL QUE ORIGINÓ ESTE MÓDULO (2026-08-20) ────────────────────────────────────────
 * Elías pidió BORRAR UNA FASE. Con el contrato de reescritura completa, la propuesta volvió con
 * «6 fases modificadas · se corrió la fecha de cierre 70 días»: al re-emitir todo, el modelo soltó
 * el `startWeek` de seis fases que corrían en PARALELO, y el proyecto pasó de 17 a 27 semanas.
 *
 * Ese daño colateral es lo que estos tests hacen imposible. La primera prueba de abajo es
 * literalmente ese caso.
 */
import { describe, it, expect } from "vitest";
import {
  aplicarOperaciones,
  describirOperaciones,
  OPERACIONES_VALIDAS,
  type Operacion,
} from "./operaciones";
import { validateTimelinePayload } from "./validate";
import type { FaseActual } from "./assist-items";

const tarea = (id: string, weekIndex: number, extra: Partial<FaseActual["tasks"][number]> = {}) => ({
  id,
  title: `tarea ${id}`,
  weekIndex,
  order: 0,
  notes: null,
  ...extra,
});

/** Un cronograma con fases en PARALELO — que es donde el contrato viejo hacía daño. */
const cronograma = (): FaseActual[] => [
  { id: "f1", name: "Semana 0", durationWeeks: 1, startWeek: null, tasks: [tarea("t1", 0)] },
  { id: "f2", name: "Sales Hub", durationWeeks: 4, startWeek: null, tasks: [tarea("t2", 0), tarea("t3", 3)] },
  { id: "f3", name: "Integraciones", durationWeeks: 6, startWeek: 2, tasks: [tarea("t4", 0), tarea("t5", 1)] },
  { id: "f4", name: "Reportería", durationWeeks: 4, startWeek: 9, tasks: [tarea("t6", 0)] },
];

describe("⭐ lo que no se nombra, no se toca", () => {
  it("⛔ acortar una fase NO le mueve el arranque relativo a las otras", () => {
    /* ES EL CASO DE LOS 70 DÍAS. Con el contrato viejo, tocar una fase soltaba el `startWeek` de
       las demás y el proyecto se estiraba 10 semanas. La edición que la pone en rojo: hacer que
       el payload emita `startWeek: null` para las fases intocadas. */
    const { payload } = aplicarOperaciones(cronograma(), "2026-05-19", [
      { op: "fase.duracion", phaseId: "f3", semanas: 2 },
    ]);
    const porId = new Map(payload.phases.map((p) => [p.id, p]));
    expect(porId.get("f3")!.durationWeeks).toBe(2);
    expect(porId.get("f3")!.startWeek, "la fase tocada conserva SU propio arranque").toBe(2);
    expect(porId.get("f4")!.startWeek, "una fase que nadie nombró perdió su arranque").toBe(9);
    expect(porId.get("f2")!.durationWeeks).toBe(4);
  });

  it("⛔ y una fase intocada sale SIN tareas — «no tocar» en el contrato del PUT", () => {
    /* Emitir el array siempre convertiría cada operación en un diff completo de esa fase, y el PUT
       borra por omisión. Es la misma regla que sostiene assist-items.ts. */
    const { payload } = aplicarOperaciones(cronograma(), null, [
      { op: "fase.duracion", phaseId: "f3", semanas: 2 },
    ]);
    const porId = new Map(payload.phases.map((p) => [p.id, p]));
    expect(porId.get("f3")!.tasks, "la fase tocada SÍ manda sus tareas").toBeDefined();
    expect(porId.get("f2")!.tasks, "una fase intocada mandó tareas: el PUT va a diffear").toBeUndefined();
    expect(porId.get("f4")!.tasks).toBeUndefined();
  });

  it("renombrar no toca las tareas de nadie", () => {
    const { payload } = aplicarOperaciones(cronograma(), null, [
      { op: "fase.renombrar", phaseId: "f2", nombre: "Sales" },
    ]);
    const f2 = payload.phases.find((p) => p.id === "f2")!;
    expect(f2.name).toBe("Sales");
    expect(f2.tasks, "renombrar no es motivo para reescribir sus tareas").toBeUndefined();
  });
});

describe("acortar acomoda lo que queda afuera, y lo dice", () => {
  it("⚠ la tarea de la semana 4 baja a la última que existe", () => {
    const { payload, avisos } = aplicarOperaciones(cronograma(), null, [
      { op: "fase.duracion", phaseId: "f2", semanas: 2 },
    ]);
    const f2 = payload.phases.find((p) => p.id === "f2")!;
    expect(f2.tasks!.find((t) => t.id === "t3")!.weekIndex).toBe(1);
    expect(avisos.join(" ")).toContain("Sales Hub");
  });

  it("y lo que ya entraba no se reporta: un aviso que siempre aparece se deja de leer", () => {
    const { avisos } = aplicarOperaciones(cronograma(), null, [
      { op: "fase.duracion", phaseId: "f2", semanas: 4 },
    ]);
    expect(avisos).toEqual([]);
  });
});

describe("borrar es una INTENCIÓN, no una omisión", () => {
  it("⭐ `fase.borrar` borra de verdad, con sus tareas", () => {
    /* La diferencia que solo las operaciones pueden expresar: el rescate del PUT repone lo que el
       modelo OMITIÓ (accidente), pero una fase nombrada por una persona que la leyó se borra.
       Es lo que deja que el chat pueda borrar lo que escribió un humano, previa confirmación. */
    const { payload, avisos } = aplicarOperaciones(cronograma(), null, [
      { op: "fase.borrar", phaseId: "f4" },
    ]);
    expect(payload.phases.map((p) => p.id)).toEqual(["f1", "f2", "f3"]);
    expect(avisos.join(" ")).toContain("Reportería");
  });

  it("`tarea.borrar` saca una sola y deja la fase marcada", () => {
    const { payload } = aplicarOperaciones(cronograma(), null, [
      { op: "tarea.borrar", taskId: "t3" },
    ]);
    const f2 = payload.phases.find((p) => p.id === "f2")!;
    expect(f2.tasks!.map((t) => t.id)).toEqual(["t2"]);
  });
});

describe("⛔ el borrado que se PROMETÍA y no ocurría", () => {
  /* Encontrado el 2026-08-21 auditando por qué el chat no podía hacer casi nada.
     `tarea.borrar` sacaba la tarea del array y daba el trabajo por hecho — pero el PUT protege
     lo que `isKept` marca (`rescate-progreso.ts:149-153`) y la fila sobrevivía, sin un solo
     aviso. La cajita azul ya había dicho «Se elimina «X»». Elías pidió literalmente
     *«borra la última base que tiene un nombre raro»*: una base cargada a mano o ya hecha
     habría quedado ahí, y él leyendo que se borró. */

  it("⛔ una tarea HECHA no se borra: se rechaza diciendo por qué", () => {
    const base = cronograma();
    base[1].tasks[1] = tarea("t3", 3, { status: "DONE" });
    const { payload, rechazadas } = aplicarOperaciones(base, null, [
      { op: "tarea.borrar", taskId: "t3" },
    ]);
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0].motivo).toContain("hecha");
    expect(rechazadas[0].motivo).toContain("tarea t3");
    const f2 = payload.phases.find((p) => p.id === "f2")!;
    expect(f2.tasks, "la fase no debería quedar marcada por una operación rechazada").toBeUndefined();
  });

  it("⛔ y una cargada a MANO tampoco, aunque esté pendiente", () => {
    const base = cronograma();
    base[1].tasks[1] = tarea("t3", 3, { status: "PENDING", source: "HUMAN" });
    const { rechazadas } = aplicarOperaciones(base, null, [{ op: "tarea.borrar", taskId: "t3" }]);
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0].motivo).toContain("la cargó una persona");
  });

  it("una PENDIENTE escrita por la IA sí se borra — lo de siempre no cambió", () => {
    const { payload, rechazadas } = aplicarOperaciones(cronograma(), null, [
      { op: "tarea.borrar", taskId: "t3" },
    ]);
    expect(rechazadas).toHaveLength(0);
    expect(payload.phases.find((p) => p.id === "f2")!.tasks!.map((t) => t.id)).toEqual(["t2"]);
  });
});

describe("⭐ el chat nombra una tarea por su HANDLE, o no la nombra", () => {
  /* El vocabulario tenía las tres operaciones de tarea desde el día uno y el chat no podía emitir
     ninguna: el contexto no le mandaba ni un id. Mandar el cuid entero no entraba en el techo del
     prefijo (medido: 7 de 51 cronogramas se pasaban), así que se nombra por los últimos
     caracteres. Ver `handle-de-tarea.ts` para la tabla de colisiones. */

  const conCuids = (): FaseActual[] => [
    {
      id: "f1",
      name: "Integraciones",
      durationWeeks: 3,
      startWeek: null,
      tasks: [
        tarea("cms6949pw00sj06rwrb4ttmef", 0, { title: "Sesión de cierre de auditoría" }),
        tarea("cms6949pw00sh06rw19je7u19", 0, { title: "Mapeo de brechas por módulo" }),
      ],
    },
  ];

  it("mover por handle mueve la tarea correcta", () => {
    const { payload, rechazadas } = aplicarOperaciones(conCuids(), null, [
      { op: "tarea.mover-semana", taskId: "ttmef", semana: 2 },
    ]);
    expect(rechazadas).toHaveLength(0);
    const t = payload.phases[0].tasks!.find((x) => x.id === "cms6949pw00sj06rwrb4ttmef")!;
    expect(t.weekIndex).toBe(2);
    expect(
      payload.phases[0].tasks!.find((x) => x.id === "cms6949pw00sh06rw19je7u19")!.weekIndex,
      "se movió la hermana: el handle apuntó mal",
    ).toBe(0);
  });

  it("⛔ un handle ambiguo NO se desempata: se rechaza con el conteo", () => {
    const base = conCuids();
    base[0].tasks = [tarea("aaaaaXXXXX", 0), tarea("bbbbbXXXXX", 0)];
    const { payload, rechazadas } = aplicarOperaciones(base, null, [
      { op: "tarea.borrar", taskId: "XXXXX" },
    ]);
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0].motivo).toContain("2 tareas");
    expect(payload.phases[0].tasks, "tocó la fase por una operación rechazada").toBeUndefined();
  });

  it("⚠ y la cajita azul dice el TÍTULO, nunca el handle", () => {
    /* Sin esto, el CSE aprueba una línea que dice «ttmef» — ilegible, y peor que la prosa que se
       retiró. La edición que la pone en rojo: que `tarea()` busque solo por id exacto. */
    const [linea] = describirOperaciones(conCuids(), [
      { op: "tarea.mover-semana", taskId: "ttmef", semana: 2 },
    ]);
    expect(linea).toContain("Sesión de cierre de auditoría");
    expect(linea, "imprimió el handle crudo: el CSE aprueba algo que no puede leer").not.toContain(
      "ttmef",
    );
  });
});

describe("⛔ lo que no existe se RECHAZA con motivo, nunca en silencio", () => {
  it("una fase inventada no se aproxima a la más parecida", () => {
    /* El modo de falla que este módulo existe para impedir: rápido, silencioso y equivocado. */
    const { payload, rechazadas } = aplicarOperaciones(cronograma(), null, [
      { op: "fase.duracion", phaseId: "no-existe", semanas: 2 },
    ]);
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0].motivo).toContain("no existe");
    expect(payload.phases, "el cronograma no se tocó").toHaveLength(4);
  });

  it("una tarea inventada también", () => {
    const { rechazadas } = aplicarOperaciones(cronograma(), null, [
      { op: "tarea.mover-semana", taskId: "fantasma", semana: 1 },
    ]);
    expect(rechazadas).toHaveLength(1);
  });

  it("y una operación que no está en el vocabulario", () => {
    const inventada = { op: "fase.pintar-de-azul", phaseId: "f1" } as unknown as Operacion;
    const { rechazadas } = aplicarOperaciones(cronograma(), null, [inventada]);
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0].motivo).toContain("no es una operación válida");
  });

  it("una duración de cero se rechaza en vez de producir una fase imposible", () => {
    const { rechazadas } = aplicarOperaciones(cronograma(), null, [
      { op: "fase.duracion", phaseId: "f2", semanas: 0 },
    ]);
    expect(rechazadas[0].motivo).toContain("al menos 1 semana");
  });
});

describe("mudar una tarea de fase la RECREA, y se avisa", () => {
  it("⚠ pierde su id, que es como pierde su estado", () => {
    /* Es la regla dura de siempre: el cronograma no sabe mudar una tarea, la borra de un lado y la
       crea del otro. Callarlo sería prometer algo que el sistema no hace. */
    const { payload, avisos } = aplicarOperaciones(cronograma(), null, [
      { op: "tarea.mover-fase", taskId: "t3", phaseId: "f4" },
    ]);
    const f4 = payload.phases.find((p) => p.id === "f4")!;
    const mudada = f4.tasks!.find((t) => t.title === "tarea t3")!;
    expect(mudada.id, "llegó con id: el PUT la trataría como la misma y no lo es").toBeUndefined();
    expect(avisos.join(" ")).toContain("pierde su estado");
    expect(payload.phases.find((p) => p.id === "f2")!.tasks!.map((t) => t.id)).toEqual(["t2"]);
  });
});

describe("redistribuir reparte parejo sin reordenar", () => {
  it("6 tareas en 2 semanas quedan 3 y 3, en el mismo orden", () => {
    const seis: FaseActual[] = [
      {
        id: "f1",
        name: "Apretada",
        durationWeeks: 2,
        startWeek: null,
        tasks: [0, 0, 0, 0, 0, 0].map((_, i) => tarea(`t${i}`, 0)),
      },
    ];
    const { payload } = aplicarOperaciones(seis, null, [{ op: "fase.redistribuir", phaseId: "f1" }]);
    const semanas = payload.phases[0].tasks!.map((t) => t.weekIndex);
    expect(semanas.filter((w) => w === 0)).toHaveLength(3);
    expect(semanas.filter((w) => w === 1)).toHaveLength(3);
  });
});

describe("⛔ NaN — lo que la auditoría del 2026-08-21 encontró y casi se aplica", () => {
  /* El `input_schema` de la tool solo exige `op`, y en el mismo bolsón plano conviven `semana` y
     `semanas`: un cambio de UNA letra. `Math.floor(undefined)` es NaN, y NaN atraviesa cualquier
     comparación — `NaN < 0` es false y `NaN >= duración` también. O sea que la guarda de rango,
     escrita justamente para rechazar una semana que no existe, dejaba pasar la operación entera.

     Lo medido antes del arreglo, sobre una fase de 4 semanas con 4 tareas en la última:
       cajita azul: «Se quita la semana NaN de «Sales Hub» (queda en 3 semanas) — estaba vacía»
       resultado:   la fase se acortaba, las 4 tareas quedaban APILADAS, y el validador decía OK.
     Se aplicaba. Sin error, sin aviso, y con una línea que afirmaba lo contrario. */

  const conCola = (): FaseActual[] => [
    {
      id: "f1",
      name: "Sales Hub",
      durationWeeks: 4,
      startWeek: null,
      tasks: [tarea("t1", 0), tarea("t2", 3), tarea("t3", 3), tarea("t4", 3)],
    },
  ];

  it("⛔ un parámetro que llega con otro nombre se RECHAZA, no se ejecuta a medias", () => {
    /* La edición que lo pone en rojo: sacar el chequeo de `entero(...)` en fase.quitar-semana. */
    const { payload, rechazadas } = aplicarOperaciones(conCola(), null, [
      { op: "fase.quitar-semana", phaseId: "f1", semanas: 1 } as unknown as Operacion,
    ]);
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0].motivo).toContain("qué semana");
    expect(payload.phases[0].durationWeeks, "la fase se acortó igual").toBe(4);
    expect(payload.phases[0].tasks, "tocó la fase por una operación rechazada").toBeUndefined();
  });

  it("y lo mismo insertando, moviendo, creando y mudando", () => {
    const casos: Operacion[] = [
      { op: "fase.insertar-semana", phaseId: "f1" } as unknown as Operacion,
      { op: "fase.mover", phaseId: "f1" } as unknown as Operacion,
      { op: "tarea.mover-semana", taskId: "t1" } as unknown as Operacion,
      { op: "tarea.crear", phaseId: "f1", titulo: "QA" } as unknown as Operacion,
    ];
    for (const op of casos) {
      const { rechazadas } = aplicarOperaciones(conCola(), null, [op]);
      expect(rechazadas, `${op.op} dejó pasar un número ausente`).toHaveLength(1);
    }
  });

  it("⚠ y `normalizar` nunca escribe NaN en una semana, pase lo que pase", () => {
    /* El cinturón: un NaN que llegue por cualquier otra vía sale acotado, no al payload — donde
       el PUT devolvería un 400 sobre una tarea que nadie tocó. */
    const roto = conCola();
    (roto[0].tasks[1] as { weekIndex: number }).weekIndex = NaN;
    const { payload } = aplicarOperaciones(roto, null, [
      { op: "fase.duracion", phaseId: "f1", semanas: 2 },
    ]);
    for (const t of payload.phases[0].tasks!) {
      expect(Number.isFinite(t.weekIndex), `weekIndex NaN en «${t.title}»`).toBe(true);
    }
  });

  it("⛔ una operación sin su parámetro no revienta la CAJITA con un TypeError", () => {
    /* Un throw acá tumba el turno entero en el servidor: el CSE no ve ni el acuerdo ni el motivo.
       La edición que lo pone en rojo: volver a `o.tipo.toLowerCase()`. */
    const lineas = describirOperaciones(conCola(), [
      { op: "fase.tipo", phaseId: "f1" } as unknown as Operacion,
      { op: "tarea.duenio", taskId: "t1" } as unknown as Operacion,
    ]);
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toContain("sin especificar");
  });
});

describe("⛔ tocar UNA tarea no puede producir un 400 sobre otra", () => {
  /* Encontrado por dos lentes distintas de la auditoría del 2026-08-21, y la asimetría era real:
     de las once operaciones que marcan la fase como `tocada`, ocho llamaban a `normalizar` y tres
     —renombrar, dueño y tipo— no. Y `tocada` hace que el payload emita el array COMPLETO de esa
     fase, así que cualquier tarea que ya estuviera fuera de rango salía tal cual.

     El caso llega desde el estado LOCAL del canvas, no desde la base: bajar la duración de una
     fase no acota sus tareas en memoria. El CSE lee «tarea X pasa a llamarse Y», aprieta Aplicar,
     y recibe «phases[0].tasks[1].weekIndex debe ser entero en [0, durationWeeks)» sobre una tarea
     que no tocó. */

  const desalineada = (): FaseActual[] => [
    {
      id: "f1",
      name: "Multiquimica setup",
      durationWeeks: 1,
      startWeek: null,
      tasks: [tarea("cmaaaaa11", 0), tarea("cmbbbbb22", 3)],
    },
  ];

  it("renombrar, dueño y tipo dejan el payload APLICABLE, igual que las otras ocho", () => {
    /* La edición que lo pone en rojo: sacar el `normalizar(hit.fase)` de cualquiera de las tres. */
    const casos: Operacion[] = [
      { op: "tarea.renombrar", taskId: "aaa11", titulo: "Kickoff con el cliente" },
      { op: "tarea.duenio", taskId: "aaa11", duenio: "CLIENTE" },
      { op: "tarea.tipo", taskId: "aaa11", tipo: "SESSION" },
    ];
    for (const op of casos) {
      const { payload, avisos } = aplicarOperaciones(desalineada(), null, [op]);
      const errores = validateTimelinePayload(payload as never);
      expect(
        Array.isArray(errores) ? errores : [],
        `«${op.op}» produjo un payload que el PUT rechaza`,
      ).toEqual([]);
      expect(avisos.join(" "), "se corrió una tarea y no se avisó").toContain("fuera de");
    }
  });
});

describe("⛔ lo que se LEE tiene que coincidir con lo que se ejecuta, también en los bordes", () => {
  it("⭐ borrar una fase dice cuántas tareas tienen trabajo hecho encima", () => {
    /* `fase.borrar` es la ÚNICA operación que destruye trabajo protegido: el borrado de fases del
       PUT no consulta `isKept`, a diferencia de `tarea.borrar`, que directamente rechaza. La
       doble confirmación del prompt depende de que el modelo mire el contexto; esta línea lo dice
       donde la persona lo lee igual, aunque el modelo se haya olvidado.
       La edición que lo pone en rojo: sacar el conteo de protegidas. */
    const conHechas: FaseActual[] = [
      {
        id: "f1",
        name: "Service Hub",
        durationWeeks: 2,
        startWeek: null,
        tasks: [
          tarea("t1", 0, { status: "DONE" }),
          tarea("t2", 0, { status: "DONE" }),
          tarea("t3", 1),
        ],
      },
    ];
    const [linea] = describirOperaciones(conHechas, [{ op: "fase.borrar", phaseId: "f1" }]);
    expect(linea).toContain("3 tareas");
    expect(linea).toContain("2 tienen trabajo hecho encima y se pierden");
  });

  it("mover a una semana que no existe dice la semana REAL, no la pedida", () => {
    /* El ejecutor acota a la última semana de la fase. Prometer la 9 y ejecutar la 3 es
       exactamente lo que esta traducción existe para impedir. */
    const [linea] = describirOperaciones(cronograma(), [
      { op: "tarea.mover-semana", taskId: "t3", semana: 8 },
    ]);
    expect(linea).toContain("semana 4");
    expect(linea).not.toContain("semana 9");
  });

  it("⛔ y una fase recién creada no se la come un fase.borrar sin destino", () => {
    /* `fase.borrar` y `fase.mover` usaban un `findIndex` crudo: con el phaseId ausente enganchaban
       la fase que `fase.crear` acababa de meter — la única del array sin id. */
    const { payload, rechazadas } = aplicarOperaciones(cronograma(), null, [
      { op: "fase.crear", nombre: "QA", semanas: 1 },
      { op: "fase.borrar", phaseId: undefined as unknown as string },
    ]);
    expect(rechazadas).toHaveLength(1);
    expect(payload.phases.some((p) => p.name === "QA"), "se comió la fase nueva").toBe(true);
  });
});

describe("⭐ la semana del MEDIO — el pedido que el prompt usaba como ejemplo de lo imposible", () => {
  /* Medido el 2026-08-21: 314 semanas vacías repartidas en 29 de los 46 cronogramas activos.
     Elías lo pidió textual dos veces: «en la fase integraciones hay semanas sin tareas, quítalas».
     Hasta hoy la respuesta correcta del chat era «no puedo: lo más cercano es acortar, que saca
     la ÚLTIMA» — y estaba escrito así en el propio prompt, como el ejemplo canónico del
     vocabulario cerrado. */

  const conHueco = (): FaseActual[] => [
    {
      id: "f1",
      name: "Marketing Hub",
      durationWeeks: 4,
      startWeek: null,
      tasks: [tarea("t1", 0), tarea("t2", 2), tarea("t3", 3)],
    },
    { id: "f2", name: "Cierre", durationWeeks: 2, startWeek: null, tasks: [tarea("t4", 0)] },
  ];

  it("quitar la semana VACÍA acorta la fase y NO mueve a nadie de más", () => {
    const { payload, rechazadas } = aplicarOperaciones(conHueco(), null, [
      { op: "fase.quitar-semana", phaseId: "f1", semana: 1 },
    ]);
    expect(rechazadas).toHaveLength(0);
    const f1 = payload.phases.find((p) => p.id === "f1")!;
    expect(f1.durationWeeks).toBe(3);
    const porId = new Map(f1.tasks!.map((t) => [t.id, t.weekIndex]));
    expect(porId.get("t1"), "la de arriba del hueco no se movía").toBe(0);
    expect(porId.get("t2"), "las de abajo suben una").toBe(1);
    expect(porId.get("t3")).toBe(2);
    expect(payload.phases.find((p) => p.id === "f2")!.tasks, "tocó una fase que nadie nombró")
      .toBeUndefined();
  });

  it("⚠ quitar una semana CON tareas las baja a la anterior — y la línea lo DICE con el número", () => {
    /* Sin el número, «quitá la semana 3» se lee como una operación inocua sobre algo vacío. */
    const [linea] = describirOperaciones(conHueco(), [
      { op: "fase.quitar-semana", phaseId: "f1", semana: 2 },
    ]);
    expect(linea).toContain("1 tarea pasa a la semana 2");
    expect(linea).toContain("queda en 3 semanas");

    const { payload } = aplicarOperaciones(conHueco(), null, [
      { op: "fase.quitar-semana", phaseId: "f1", semana: 2 },
    ]);
    const f1 = payload.phases.find((p) => p.id === "f1")!;
    expect(f1.tasks!.find((t) => t.id === "t2")!.weekIndex).toBe(1);
  });

  it("y la línea de la semana vacía lo dice también, para que no parezca que arrastró algo", () => {
    const [linea] = describirOperaciones(conHueco(), [
      { op: "fase.quitar-semana", phaseId: "f1", semana: 1 },
    ]);
    expect(linea).toContain("estaba vacía");
  });

  it("⛔ no se puede dejar una fase en cero semanas", () => {
    /* Se prueba sobre una fase que YA dura una: si se encadenaran dos quitadas sobre una de dos,
       la segunda se rechazaría por «esa semana no existe» — otro rechazo correcto, pero no éste,
       y el test estaría midiendo el carril de al lado. */
    const unaSola: FaseActual[] = [
      { id: "f9", name: "Cierre", durationWeeks: 1, startWeek: null, tasks: [tarea("t9", 0)] },
    ];
    const { rechazadas } = aplicarOperaciones(unaSola, null, [
      { op: "fase.quitar-semana", phaseId: "f9", semana: 0 },
    ]);
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0].motivo).toContain("una sola semana");
  });

  it("insertar abre un hueco en el medio y corre lo de abajo", () => {
    const { payload } = aplicarOperaciones(conHueco(), null, [
      { op: "fase.insertar-semana", phaseId: "f1", semana: 1 },
    ]);
    const f1 = payload.phases.find((p) => p.id === "f1")!;
    expect(f1.durationWeeks).toBe(5);
    const porId = new Map(f1.tasks!.map((t) => [t.id, t.weekIndex]));
    expect(porId.get("t1")).toBe(0);
    expect(porId.get("t2")).toBe(3);
  });
});

describe("crear: fases y tareas nuevas nacen SIN id, que es como el PUT las crea", () => {
  it("una fase nueva entra en su posición y sale sin id", () => {
    const { payload } = aplicarOperaciones(cronograma(), null, [
      { op: "fase.crear", nombre: "QA y pruebas", semanas: 2, posicion: 1 },
    ]);
    expect(payload.phases.map((p) => p.name)[1]).toBe("QA y pruebas");
    expect(payload.phases[1].id, "llegó con id: el PUT la buscaría y no existe").toBeUndefined();
    expect(payload.phases[1].tasks, "una fase nueva nace vacía, no sin declarar").toEqual([]);
    expect(payload.phases.map((p) => p.order)).toEqual([0, 1, 2, 3, 4]);
  });

  it("⛔ y una fase sin id NO se engancha con un phaseId AUSENTE", () => {
    /* LA TRAMPA, y casi se me escapa: `find((f) => f.id === phaseId)` con los DOS en `undefined`
       da verdadero, y una operación sin destino caería en la fase recién creada — que es la única
       del array sin id. No es hipotético: el `input_schema` de la tool solo exige `op`
       (`turno.ts`), así que un modelo que se olvida el `phaseId` produce exactamente este valor.

       ⚠ La primera versión de este test usaba `""` y pasaba SIN la protección: `undefined === ""`
       es falso, así que no reproducía nada. El valor que importa es el ausente. */
    const { rechazadas, payload } = aplicarOperaciones(cronograma(), null, [
      { op: "fase.crear", nombre: "Nueva", semanas: 1 },
      { op: "fase.duracion", phaseId: undefined as unknown as string, semanas: 9 },
    ]);
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0].motivo).toContain("no existe");
    const nueva = payload.phases.find((p) => p.name === "Nueva")!;
    expect(nueva.durationWeeks, "la operación huérfana aterrizó en la fase nueva").toBe(1);
  });

  it("una tarea nueva sale sin id, en su semana, y marca la fase", () => {
    const { payload } = aplicarOperaciones(cronograma(), null, [
      {
        op: "tarea.crear",
        phaseId: "f2",
        titulo: "Revisión de HubSpot Academy",
        semana: 2,
        duenio: "CLIENTE",
      },
    ]);
    const f2 = payload.phases.find((p) => p.id === "f2")!;
    const nueva = f2.tasks!.find((t) => t.title === "Revisión de HubSpot Academy")!;
    expect(nueva.id).toBeUndefined();
    expect(nueva.weekIndex).toBe(2);
    expect(nueva.party).toBe("CLIENTE");
    expect(f2.tasks!.map((t) => t.id)).toContain("t2");
  });

  it("una tarea sin título se rechaza en vez de nacer anónima", () => {
    const { rechazadas } = aplicarOperaciones(cronograma(), null, [
      { op: "tarea.crear", phaseId: "f2", titulo: "   ", semana: 0 },
    ]);
    expect(rechazadas).toHaveLength(1);
  });
});

describe("⛔ los dos vocabularios de «tipo» no se mezclan", () => {
  /* El riesgo que trajo crecer: la tool tiene UN campo `tipo` que sirve a dos operaciones con
     valores distintos (SESSION|TASK para tareas, los cinco de actividad para fases). Si el
     ejecutor no los separara, «hacé que esa fase sea una sesión» escribiría basura en una columna
     con enum, y el PUT devolvería un 400 críptico DESPUÉS de que el CSE aprobó. */

  it("una fase no puede ser SESSION", () => {
    const { rechazadas } = aplicarOperaciones(cronograma(), null, [
      { op: "fase.tipo", phaseId: "f2", tipo: "SESSION" as never },
    ]);
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0].motivo).toContain("no es un tipo de actividad");
  });

  it("y una tarea no puede ser ADOPCION", () => {
    const { rechazadas } = aplicarOperaciones(cronograma(), null, [
      { op: "tarea.tipo", taskId: "t3", tipo: "ADOPCION" as never },
    ]);
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0].motivo).toContain("no es un tipo de tarea");
  });

  it("un dueño inventado tampoco pasa", () => {
    const { rechazadas } = aplicarOperaciones(cronograma(), null, [
      { op: "tarea.duenio", taskId: "t3", duenio: "PROVEEDOR" as never },
    ]);
    expect(rechazadas).toHaveLength(1);
  });
});

describe("renombrar y mudar dicen el ANTES, no solo el después", () => {
  it("renombrar una tarea nombra el título viejo", () => {
    const [linea] = describirOperaciones(cronograma(), [
      { op: "tarea.renombrar", taskId: "t3", titulo: "Cierre de auditoría" },
    ]);
    expect(linea).toContain("tarea t3");
    expect(linea).toContain("Cierre de auditoría");
  });

  it("mudar de fase a una semana concreta aterriza ahí, no en la primera", () => {
    /* Antes el clon caía siempre en la semana 1 y no había forma de corregirlo: al recrearse
       pierde el id, así que un `tarea.mover-semana` posterior se rechaza y tumba el lote. */
    const { payload } = aplicarOperaciones(cronograma(), null, [
      { op: "tarea.mover-fase", taskId: "t3", phaseId: "f4", semana: 2 },
    ]);
    const f4 = payload.phases.find((p) => p.id === "f4")!;
    expect(f4.tasks!.find((t) => t.title === "tarea t3")!.weekIndex).toBe(2);
  });
});

describe("el resultado es aplicable tal cual por el PUT", () => {
  it("⭐ pasa el MISMO validador que usa el endpoint de escritura", () => {
    /* Es la prueba que cierra el círculo: si el payload no valida, las operaciones no sirven por
       más rápidas que sean. La edición que la pone en rojo: dejar de reasignar `order`. */
    const ops: Operacion[] = [
      { op: "fase.duracion", phaseId: "f2", semanas: 2 },
      { op: "fase.redistribuir", phaseId: "f2" },
      { op: "fase.borrar", phaseId: "f4" },
      { op: "arranque", fecha: "2026-06-01" },
    ];
    const { payload, rechazadas } = aplicarOperaciones(cronograma(), "2026-05-19", ops);
    expect(rechazadas).toEqual([]);
    const v = validateTimelinePayload(payload);
    expect(v.errors ?? [], "el payload de las operaciones no es aplicable").toEqual([]);
    expect(v.valid).toBe(true);
    expect(payload.anchorStartDate).toBe("2026-06-01");
  });

  it("sin operaciones, el cronograma sale idéntico y sin tocar ninguna tarea", () => {
    const { payload, avisos, rechazadas } = aplicarOperaciones(cronograma(), "2026-05-19", []);
    expect(avisos).toEqual([]);
    expect(rechazadas).toEqual([]);
    expect(payload.phases.every((p) => p.tasks === undefined)).toBe(true);
    expect(payload.phases.map((p) => p.startWeek)).toEqual([null, null, 2, 9]);
  });
});

describe("⭐ lo que se LEE es lo que se EJECUTA", () => {
  /* La cajita azul se renderiza desde las OPERACIONES, no desde la prosa del modelo. Es lo que
     disuelve el riesgo del vocabulario cerrado: si la operación no es la que el CSE quería, lo ve
     ANTES de que pase nada. Idea de Elías el 2026-08-20. */

  it("acortar se lee con las dos duraciones Y con las tareas que arrastra", () => {
    /* «pasa a 3 semanas» no deja evaluar nada; «pasa de 4 a 3» sí.
       ⚠ Y desde el 2026-08-21 dice además cuántas tareas se corren: el prompt manda a esta
       operación el pedido más común («dejala en 3»), y sin el número «pasa de 6 a 3» se lee como
       una fase que se encoge sola, cuando en realidad está apilando tareas en la última semana.
       En este cronograma, «Sales Hub» tiene una tarea en la semana 4 (índice 3). */
    const [linea] = describirOperaciones(cronograma(), [
      { op: "fase.duracion", phaseId: "f2", semanas: 3 },
    ]);
    expect(linea).toBe("«Sales Hub» pasa de 4 a 3 semanas — 1 tarea se corre a la semana 3");
  });

  it("…y si no se cae ninguna, no inventa el aviso", () => {
    const [linea] = describirOperaciones(cronograma(), [
      { op: "fase.duracion", phaseId: "f2", semanas: 8 },
    ]);
    expect(linea).toBe("«Sales Hub» pasa de 4 a 8 semanas");
  });

  it("⛔ borrar dice CUÁNTAS tareas se lleva puestas", () => {
    /* Sin ese número, «se elimina la fase» se lee como si estuviera vacía. */
    const [linea] = describirOperaciones(cronograma(), [
      { op: "fase.borrar", phaseId: "f2" },
    ]);
    expect(linea).toContain("2 tareas");
  });

  it("⚠ mudar una tarea dice la CONSECUENCIA, no solo el acto", () => {
    /* El cronograma no sabe mudar: la recrea, y con eso pierde su estado. Callarlo sería
       prometer algo que el sistema no hace. */
    const [linea] = describirOperaciones(cronograma(), [
      { op: "tarea.mover-fase", taskId: "t3", phaseId: "f4" },
    ]);
    expect(linea).toContain("pierde su estado");
  });

  it("y las semanas se cuentan desde 1, como en la pantalla", () => {
    /* `weekIndex` es 0-indexed adentro; nadie habla así. */
    const [linea] = describirOperaciones(cronograma(), [
      { op: "tarea.mover-semana", taskId: "t3", semana: 0 },
    ]);
    expect(linea).toContain("semana 1");
  });

  it("⛔ hay una línea por operación: ninguna se aplica sin decirse", () => {
    /* La edición que la pone en rojo: filtrar las «obvias» para que la cajita se vea más corta.
       Una operación que se ejecuta sin figurar es exactamente lo que la cajita existe para
       impedir. */
    const ops: Operacion[] = [
      { op: "fase.duracion", phaseId: "f2", semanas: 2 },
      { op: "fase.redistribuir", phaseId: "f2" },
      { op: "fase.borrar", phaseId: "f4" },
    ];
    expect(describirOperaciones(cronograma(), ops)).toHaveLength(ops.length);
  });

  it("⭐ CENSO: toda operación del vocabulario tiene su línea en castellano", () => {
    /* ⚠ Esto es lo que sostiene la promesa cuando el vocabulario CRECE. El 2026-08-21 pasó de 10
       a 18 operaciones; una que no tenga rama cae al `default` y la cajita azul imprime
       «Operación desconocida: fase.tipo» — y el CSE aprueba eso, porque el botón sigue estando.
       Un ejemplo por operación, y ninguno puede salir desconocido.

       La edición que la pone en rojo: sumar una operación al vocabulario sin su línea. */
    const EJEMPLOS: Record<(typeof OPERACIONES_VALIDAS)[number], Operacion> = {
      "fase.duracion": { op: "fase.duracion", phaseId: "f2", semanas: 2 },
      "fase.renombrar": { op: "fase.renombrar", phaseId: "f2", nombre: "Otra" },
      "fase.borrar": { op: "fase.borrar", phaseId: "f4" },
      "fase.redistribuir": { op: "fase.redistribuir", phaseId: "f2" },
      "fase.mover": { op: "fase.mover", phaseId: "f2", posicion: 0 },
      "fase.arranque-relativo": { op: "fase.arranque-relativo", phaseId: "f2", semana: 1 },
      "fase.crear": { op: "fase.crear", nombre: "Nueva", semanas: 2 },
      "fase.quitar-semana": { op: "fase.quitar-semana", phaseId: "f2", semana: 1 },
      "fase.insertar-semana": { op: "fase.insertar-semana", phaseId: "f2", semana: 1 },
      "fase.tipo": { op: "fase.tipo", phaseId: "f2", tipo: "ADOPCION" },
      "tarea.mover-semana": { op: "tarea.mover-semana", taskId: "t3", semana: 1 },
      "tarea.mover-fase": { op: "tarea.mover-fase", taskId: "t3", phaseId: "f4" },
      "tarea.borrar": { op: "tarea.borrar", taskId: "t3" },
      "tarea.crear": { op: "tarea.crear", phaseId: "f2", titulo: "QA", semana: 0 },
      "tarea.renombrar": { op: "tarea.renombrar", taskId: "t3", titulo: "Otro" },
      "tarea.duenio": { op: "tarea.duenio", taskId: "t3", duenio: "CLIENTE" },
      "tarea.tipo": { op: "tarea.tipo", taskId: "t3", tipo: "SESSION" },
      arranque: { op: "arranque", fecha: "2026-09-01" },
    };
    const todas = OPERACIONES_VALIDAS.map((k) => EJEMPLOS[k]);
    const lineas = describirOperaciones(cronograma(), todas);
    expect(lineas).toHaveLength(OPERACIONES_VALIDAS.length);
    const mudas = lineas.filter((l) => l.includes("Operación desconocida"));
    expect(mudas, "hay operaciones sin línea propia: la cajita azul las muestra como basura").toEqual(
      [],
    );
    /* Y ninguna puede salir vacía o con un id crudo donde va un nombre. */
    for (const l of lineas) expect(l.length).toBeGreaterThan(15);
  });
});
