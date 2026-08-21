/**
 * lib/asistente/acuerdo-vivo.test.ts — LO ACORDADO Y NO APLICADO NO SE PIERDE.
 *
 * Correr: `npx vitest run lib/asistente/acuerdo-vivo.test.ts --project unit`.
 *
 * ── EL BUG QUE ESTAS GUARDAS CONGELAN (producción, 2026-08-21) ───────────────────────────────
 * El asistente preguntó una cosa y propuso otra (acuerdo de 2 operaciones). El CSE contestó la
 * pregunta. El asistente propuso de nuevo (acuerdo de 1). Las 2 primeras se perdieron en silencio
 * y nunca se aplicaron. Contestar una pregunta costó la mitad del pedido.
 *
 * Cada `it` de acá es un pedazo de ese hilo, reducido a datos.
 */
import { describe, it, expect } from "vitest";
import type { Operacion } from "@/lib/timeline/operaciones";
import type { FaseActual } from "@/lib/timeline/assist-items";
import { marcaDeAcuerdo, marcaDeDesenlace } from "./acuerdo";
import {
  bloqueDePendientes,
  estadosDeAcuerdo,
  esTurnoDeDesenlace,
  fusionarPendientes,
  pendientesDelHilo,
  podarIrresolubles,
  type TurnoDelLibro,
} from "./acuerdo-vivo";

const OP_A: Operacion = { op: "fase.duracion", phaseId: "fMkt", semanas: 3 };
const OP_B: Operacion = { op: "tarea.crear", phaseId: "fMkt", titulo: "Revisar todo muy bien", semana: 2 };
const OP_C: Operacion = { op: "tarea.mover-fase", taskId: "ywlga", phaseId: "fCierre" };

const SHA = "a1b2c3d4e5f60718";

/** Un turno del asistente CON acuerdo, tal como lo persiste `correrTurno`. */
const conAcuerdo = (ops: Operacion[], texto = "Listo."): TurnoDelLibro => ({
  rol: "ASISTENTE",
  contenido: `${texto}\n\n${marcaDeAcuerdo({
    resumen: texto,
    operaciones: ops,
    lineas: ops.map((_, i) => `linea ${i + 1}`),
  })}`,
  shaDeContexto: SHA,
});

/** Un acuerdo emitido junto con una pregunta que la persona todavía no contestó. */
const preguntando = (ops: Operacion[]): TurnoDelLibro => ({
  rol: "ASISTENTE",
  contenido: `¿A qué fase te refieres?\n\n${marcaDeAcuerdo({
    resumen: "queda una duda",
    operaciones: ops,
    lineas: ops.map((_, i) => `linea ${i + 1}`),
    enEspera: true,
  })}`,
  shaDeContexto: SHA,
});

const delCse = (texto: string): TurnoDelLibro => ({ rol: "CSE", contenido: texto, shaDeContexto: SHA });

/** El desenlace: lo escribe la RUTA, y su marca es no pasar huella de contexto. */
const desenlace = (ok: boolean, conMarca = true): TurnoDelLibro => ({
  rol: "ASISTENTE",
  contenido: ok ? `✅ Listo.${conMarca ? `\n\n${marcaDeDesenlace({ ok })}` : ""}` : `⛔ No se pudo aplicar.${conMarca ? `\n\n${marcaDeDesenlace({ ok })}` : ""}`,
  shaDeContexto: null,
});

describe("⭐ qué turno es un desenlace", () => {
  it("es el único turno del ASISTENTE sin huella de contexto", () => {
    /* ⭐ El discriminador es RETROACTIVO: `agregarTurno` es el único escritor de mensajes,
       `correrTurno` siempre pasa la huella y la rama del desenlace nunca lo hace. O sea que ya
       está escrito en cada fila de producción, cosa que un marcador nuevo no podría lograr.
       La edición que la pone en rojo: pasarle `shaDeContexto` a la rama del desenlace. */
    expect(esTurnoDeDesenlace(desenlace(true))).toBe(true);
    expect(esTurnoDeDesenlace(conAcuerdo([OP_A]))).toBe(false);
  });

  it("⛔ y un turno del CSE NUNCA lo es, aunque no traiga huella", () => {
    /* ⚠ El turno optimista que pinta la pantalla mientras el modelo piensa se construye sin el
       campo. Sin mirar el rol, ese turno se leería como desenlace y apagaría el botón de la nada.
       La edición que la pone en rojo: sacar el chequeo de `rol` de `esTurnoDeDesenlace`. */
    expect(esTurnoDeDesenlace({ rol: "CSE", contenido: "Cierre y entrega", shaDeContexto: null })).toBe(false);
  });
});

describe("⭐ el libro de pendientes", () => {
  it("un acuerdo recién emitido está pendiente", () => {
    expect(pendientesDelHilo([delCse("cambiá esto"), conAcuerdo([OP_A, OP_B])])).toEqual([OP_A, OP_B]);
  });

  it("⭐ EL BUG: contestar una pregunta NO vacía el libro", () => {
    /* Es el hilo del 2026-08-21, exacto. Antes de este módulo, el acuerdo de 2 operaciones dejaba
       de ser el último turno y perdía su botón para siempre.
       La edición que la pone en rojo: que el walker corte en cualquier turno en vez de en un
       desenlace. */
    const hilo = [delCse("dos cosas"), conAcuerdo([OP_A, OP_B]), delCse("Cierre y entrega")];
    expect(
      pendientesDelHilo(hilo),
      "un turno del CSE borró lo que ya se había acordado: es el bug de producción",
    ).toEqual([OP_A, OP_B]);
  });

  it("⛔ un desenlace OK sí lo vacía", () => {
    /* Se aplicó: resucitar esas operaciones DUPLICARÍA las tareas — el vocabulario no es
       idempotente. La edición que la pone en rojo: ignorar el desenlace al caminar. */
    expect(pendientesDelHilo([conAcuerdo([OP_A]), desenlace(true)])).toEqual([]);
  });

  it("⚠ pero un desenlace que FALLÓ no: nada entró, así que todo sigue pendiente", () => {
    expect(pendientesDelHilo([conAcuerdo([OP_A, OP_B]), desenlace(false)])).toEqual([OP_A, OP_B]);
  });

  it("⛔ un desenlace VIEJO, sin marcador, se lee como OK", () => {
    /* Los hilos anteriores a este cambio tienen desenlaces sin marca. Leerlos como «falló»
       ofrecería re-aplicar lo que ya está escrito. Errar hacia «no ofrecer» es barato; errar hacia
       «ofrecer de nuevo» escribe dos veces. */
    expect(pendientesDelHilo([conAcuerdo([OP_A]), desenlace(true, false)])).toEqual([]);
  });

  it("⛔ y NO acumula hacia atrás más allá del último acuerdo", () => {
    /* Los hilos viejos no acumulaban, así que un acuerdo anterior puede estar aplicado sin que
       nada lo diga. Tomar solo el último es la única lectura segura para la historia — y para los
       hilos nuevos da lo mismo, porque el último ya los contiene a todos. */
    const hilo = [conAcuerdo([OP_A]), delCse("no, mejor"), conAcuerdo([OP_C])];
    expect(pendientesDelHilo(hilo)).toEqual([OP_C]);
  });

  it("un hilo sin ningún acuerdo no tiene nada pendiente", () => {
    expect(pendientesDelHilo([delCse("hola"), { rol: "ASISTENTE", contenido: "¿qué querés cambiar?", shaDeContexto: SHA }])).toEqual([]);
  });
});

describe("⭐ la fusión", () => {
  it("sin nada nuevo, lo pendiente sobrevive entero", () => {
    /* Es el turno que SOLO pregunta: el modelo no llama la herramienta y la app sintetiza el
       acuerdo con el libro tal cual. Sin esto, el botón desaparece justo en el turno del bug. */
    const f = fusionarPendientes([OP_A, OP_B], []);
    expect(f.operaciones).toEqual([OP_A, OP_B]);
    expect(f.arrastradas).toEqual([0, 1]);
  });

  it("⭐ lo pendiente va PRIMERO y lo nuevo después", () => {
    /* Se ejecutan en orden, así que ante un conflicto residual manda la propuesta nueva. Y las
       líneas se traducen en ese mismo orden, o dirían dónde no caen las cosas. */
    const f = fusionarPendientes([OP_A], [OP_C]);
    expect(f.operaciones).toEqual([OP_A, OP_C]);
    expect(f.arrastradas, "se perdió de vista cuáles venían de antes").toEqual([0]);
  });

  it("⭐ es IDEMPOTENTE sobre su propia salida", () => {
    /* La propiedad que hace que acumular CONVERJA. Sin ella, un libro que se re-emite en cada
       turno duplicaría operaciones no idempotentes turno a turno.
       La edición que la pone en rojo: sacar el dedup exacto. */
    const una = fusionarPendientes([OP_A], [OP_B]);
    /* ⚠ Se le vuelven a pasar como NUEVAS, no un array vacío: con `nuevas` vacío el dedup ni se
       ejecuta y la guarda quedaría verde con el dedup borrado — decorativa. Es el turno real en
       que el modelo desobedece el prompt y re-emite lo que ya estaba pendiente. */
    const dos = fusionarPendientes(una.operaciones, una.operaciones);
    expect(dos.operaciones, "el libro creció al re-emitirlo: acumular no converge").toEqual(
      una.operaciones,
    );
  });

  it("⛔ y el dedup no depende del ORDEN de las claves del JSON", () => {
    /* El modelo emite el objeto de la tool: nada garantiza el orden de las claves. Comparando el
       `JSON.stringify` crudo, `{op,phaseId,semanas}` y `{semanas,phaseId,op}` serían distintos y
       la misma operación se ejecutaría dos veces. */
    const alReves = { semanas: 3, phaseId: "fMkt", op: "fase.duracion" } as unknown as Operacion;
    expect(fusionarPendientes([OP_A], [alReves]).operaciones).toHaveLength(1);
  });

  it("descartar por etiqueta saca lo pedido, y nada más", () => {
    const f = fusionarPendientes([OP_A, OP_C], [], ["P1"]);
    expect(f.operaciones).toEqual([OP_C]);
    expect(f.descartadas).toEqual([0]);
  });

  it("⛔ una etiqueta que no se entiende se IGNORA: la operación sigue pendiente", () => {
    /* La asimetría del módulo entero: fallar en descartar es visible (aparece en la lista y se
       desmarca con un clic); fallar en conservar es invisible. */
    for (const basura of ["P9", "hola", "", null, undefined, "P0"]) {
      expect(fusionarPendientes([OP_A], [], [basura]).operaciones, `«${basura}» tiró una operación`).toEqual([OP_A]);
    }
  });

  it("⛔ descartar una fase que se crea SE LLEVA sus tareas", () => {
    /* Dejar la tarea huérfana produce un `phaseId` inexistente: el ejecutor la rechaza y **el
       rechazo tumba el lote entero**. La persona descarta una cosa y no se aplica ninguna.
       La edición que la pone en rojo: filtrar por índice suelto en vez de usar la cascada. */
    const crear: Operacion = { op: "fase.crear", nombre: "Cierre con junta", semanas: 1, ref: "cierreJD" };
    const tarea: Operacion = { op: "tarea.crear", phaseId: "cierreJD", titulo: "Revisión conjunta", semana: 0 };
    const f = fusionarPendientes([crear, tarea], [], ["P1"]);
    expect(f.operaciones, "quedó una tarea apuntando a una fase que ya no se crea").toEqual([]);
  });

  it("⛔ dos `fase.crear` con el mismo `ref` no pueden convivir", () => {
    /* El ejecutor rechaza el `ref` duplicado y muere el lote entero. Se renombra la vieja y se
       reapunta a sus dependientes. La edición que la pone en rojo: sacar `reetiquetarRefs`. */
    const vieja: Operacion = { op: "fase.crear", nombre: "Cierre", semanas: 1, ref: "nueva1" };
    const suTarea: Operacion = { op: "tarea.crear", phaseId: "nueva1", titulo: "Repaso", semana: 0 };
    const nueva: Operacion = { op: "fase.crear", nombre: "Piloto", semanas: 2, ref: "nueva1" };
    const f = fusionarPendientes([vieja, suTarea], [nueva]);

    const refs = f.operaciones.filter((o) => o.op === "fase.crear").map((o) => (o as { ref?: string }).ref);
    expect(new Set(refs).size, "dos fases nuevas comparten `ref`: el ejecutor rechaza y muere el lote").toBe(2);
    const tareaFusionada = f.operaciones.find((o) => o.op === "tarea.crear") as { phaseId: string };
    expect(refs, "la tarea quedó apuntando a un `ref` que ya no existe").toContain(tareaFusionada.phaseId);
  });

  it("⚠ y renombrar el `ref` NO toca la operación original", () => {
    /* Mutar la operación pendiente en el lugar corrompería el acuerdo guardado del turno anterior. */
    const vieja: Operacion = { op: "fase.crear", nombre: "Cierre", semanas: 1, ref: "nueva1" };
    const nueva: Operacion = { op: "fase.crear", nombre: "Piloto", semanas: 2, ref: "nueva1" };
    fusionarPendientes([vieja], [nueva]);
    expect((vieja as { ref?: string }).ref).toBe("nueva1");
  });
});

describe("⭐ la poda: lo que se arrastra se revalida contra el cronograma de HOY", () => {
  const FASES: FaseActual[] = [
    {
      id: "fMkt",
      name: "Configuración Marketing Hub",
      durationWeeks: 2,
      tasks: [{ id: "cmxxx0000ywlga", title: "Revisión conjunta", weekIndex: 0 }],
    },
  ];

  it("lo que resuelve sobrevive", () => {
    const { vivas, caidas } = podarIrresolubles([OP_A], FASES);
    expect(vivas).toEqual([OP_A]);
    expect(caidas).toEqual([]);
  });

  it("⛔ una fase que alguien borró a mano se cae CON SU MOTIVO", () => {
    /* Sin esto, un pendiente inválido dejaría fallando TODOS los applies siguientes: el ejecutor
       lo rechaza y un rechazo tumba el lote entero. Y tiene que decirse: un arrastre que
       desaparece callado es el mismo defecto que este módulo vino a matar, del otro lado. */
    const huerfana: Operacion = { op: "fase.duracion", phaseId: "fBorrada", semanas: 3 };
    const { vivas, caidas } = podarIrresolubles([huerfana], FASES);
    expect(vivas).toEqual([]);
    expect(caidas).toHaveLength(1);
    expect(caidas[0].motivo, "se cayó sin decir por qué").toContain("fase");
  });

  it("⚠ una fase que se CREA en el mismo lote no se poda", () => {
    /* Todavía no existe en el cronograma: se nombra por su `ref`. Podarla rompería el caso más
       normal del vocabulario — crear una fase con sus tareas en un solo acuerdo. */
    const crear: Operacion = { op: "fase.crear", nombre: "Nueva", semanas: 1, ref: "n1" };
    const tarea: Operacion = { op: "tarea.crear", phaseId: "n1", titulo: "X", semana: 0 };
    expect(podarIrresolubles([crear, tarea], FASES).vivas).toHaveLength(2);
  });

  it("⛔ una tarea que ya no está se cae, y el handle se resuelve como en el ejecutor", () => {
    expect(podarIrresolubles([OP_C], FASES).vivas, "el handle de 5 dejó de resolver").toEqual([]);
    const viva: Operacion = { op: "tarea.borrar", taskId: "ywlga" };
    expect(podarIrresolubles([viva], FASES).vivas).toEqual([viva]);
  });
});

describe("el bloque que lee el modelo", () => {
  it("sin pendientes no existe", () => {
    /* Un bloque vacío en `messages` es ruido que el modelo puede citar como si fuera contenido. */
    expect(bloqueDePendientes([])).toBe("");
  });

  it("⭐ numera con P1..Pn y dice cómo se descarta", () => {
    /* Las etiquetas son el contrato con `fusionarPendientes`: si el bloque numerara distinto de
       como se parsea, el modelo descartaría la operación equivocada. */
    const b = bloqueDePendientes(["«Sales Hub» pasa de 4 a 2 semanas", "Se agrega «Repaso»"]);
    expect(b).toContain("P1. «Sales Hub» pasa de 4 a 2 semanas");
    expect(b).toContain("P2. Se agrega «Repaso»");
    expect(b).toContain("descartar");
    expect(b, "el bloque no le dice al modelo que NO repita lo pendiente").toContain("NO los repitas");
  });
});

describe("⭐ en qué quedó cada caja", () => {
  it("el último acuerdo sin nada después está VIVO", () => {
    expect(estadosDeAcuerdo([delCse("x"), conAcuerdo([OP_A])])).toEqual([null, "vivo"]);
  });

  it("con su desenlace OK queda APLICADO", () => {
    expect(estadosDeAcuerdo([conAcuerdo([OP_A]), desenlace(true)])).toEqual(["aplicado", null]);
  });

  it("⭐ EL BUG: un turno del CSE en el medio NO lo apaga", () => {
    /* Es el 18:22:30 del hilo real. Antes el acuerdo dejaba de ser el último y perdía su botón
       sin que nadie hubiera aplicado nada.
       La edición que la pone en rojo: volver a decidir por posición en el array. */
    expect(
      estadosDeAcuerdo([conAcuerdo([OP_A]), delCse("Cierre y entrega")]),
      "un turno del CSE apagó un acuerdo que nadie aplicó: es el bug de producción",
    ).toEqual(["vivo", null]);
  });

  it("⚠ un desenlace que FALLÓ tampoco: no entró nada", () => {
    /* La prosa del fallo dice que los cambios siguen pendientes. Si además se apagara el botón,
       diría una cosa y haría otra. */
    expect(estadosDeAcuerdo([conAcuerdo([OP_A]), desenlace(false)])).toEqual(["vivo", null]);
  });

  it("un acuerdo que otro más nuevo se llevó queda RETOMADO", () => {
    /* Sus operaciones viajan adentro del nuevo: mostrarlo con casillas propias sería ofrecer
       aplicar dos veces lo mismo. */
    expect(estadosDeAcuerdo([conAcuerdo([OP_A]), conAcuerdo([OP_A, OP_C])])).toEqual([
      "retomado",
      "vivo",
    ]);
  });

  it("⛔ COMO MUCHO UNO ESTÁ VIVO, pase lo que pase", () => {
    /* ⛔ Dos botones vivos son dos lotes que se solapan aplicados en el orden en que la persona
       clickee, sobre un vocabulario que no es idempotente: `tarea.crear` dos veces son dos tareas.
       El caso peligroso es el del medio — acuerdo, apply fallido, acuerdo nuevo — donde el primero
       sigue sin aplicarse Y el segundo ya lo contiene.
       La edición que la pone en rojo: cortar el bucle en el desenlace fallido en vez de seguir. */
    const hilos: TurnoDelLibro[][] = [
      [conAcuerdo([OP_A]), desenlace(false), conAcuerdo([OP_A, OP_C])],
      [conAcuerdo([OP_A]), delCse("y otra cosa"), conAcuerdo([OP_A, OP_C])],
      [conAcuerdo([OP_A]), desenlace(true), conAcuerdo([OP_C])],
      [conAcuerdo([OP_A]), conAcuerdo([OP_C]), desenlace(false), conAcuerdo([OP_B])],
    ];
    for (const hilo of hilos) {
      const vivos = estadosDeAcuerdo(hilo).filter((e) => e === "vivo").length;
      /* Y un acuerdo en espera tampoco puede convivir con uno vivo: sería el mismo botón doble. */
      expect(vivos, "hay más de un acuerdo vivo: se puede aplicar dos veces lo mismo").toBeLessThanOrEqual(1);
    }
  });

  it("⭐ con una pregunta abierta queda EN ESPERA, no vivo", () => {
    /* ⭐ La corrección de Elías sobre la primera prueba: acumular Y dejar aplicar parte el pedido
       en dos escrituras. Los cambios se registran igual; lo que espera es el botón.
       La edición que la pone en rojo: ignorar `enEspera` al derivar el estado. */
    expect(estadosDeAcuerdo([preguntando([OP_A, OP_B])])).toEqual(["en-espera"]);
  });

  it("⛔ pero SIGUE PENDIENTE: se acumula con lo que venga después", () => {
    /* Es la diferencia entre «no se puede aplicar todavía» y «se perdió». Si el libro lo soltara,
       contestar la pregunta volvería a costar la otra mitad del pedido — el bug original. */
    expect(
      pendientesDelHilo([preguntando([OP_A, OP_B]), delCse("Cierre y entrega")]),
      "un acuerdo en espera se soltó del libro: vuelve la pérdida silenciosa",
    ).toEqual([OP_A, OP_B]);
  });

  it("⭐ y al contestar, TODO se aplica junto en una sola caja", () => {
    /* El resultado que Elías pidió: una sola aplicación por pedido. */
    const hilo = [preguntando([OP_A, OP_B]), delCse("Cierre y entrega"), conAcuerdo([OP_A, OP_B, OP_C])];
    expect(estadosDeAcuerdo(hilo)).toEqual(["retomado", null, "vivo"]);
  });

  it("⭐ y el que está VIVO es el que tiene lo pendiente", () => {
    /* Las dos funciones caminan el hilo con la misma regla. Si divergieran, la pantalla ofrecería
       aplicar un conjunto y el turno siguiente arrastraría otro — la peor contradicción posible,
       porque las dos serían internamente coherentes. */
    const hilos: TurnoDelLibro[][] = [
      [conAcuerdo([OP_A, OP_B])],
      [conAcuerdo([OP_A]), delCse("otra cosa")],
      [conAcuerdo([OP_A]), desenlace(false)],
      [conAcuerdo([OP_A]), desenlace(true)],
      [conAcuerdo([OP_A]), conAcuerdo([OP_C])],
    ];
    /* ⚠ «vivo» O «en-espera»: los dos significan que hay algo sin aplicar. Se separaron cuando
       Elías pidió que con una pregunta abierta no se ofreciera aplicar — el acuerdo sigue
       pendiente, lo que espera es el botón. La guarda mide lo mismo de antes: que el libro y la
       pantalla no puedan discrepar sobre si queda algo. */
    for (const hilo of [...hilos, [preguntando([OP_A])]]) {
      const estados = estadosDeAcuerdo(hilo);
      const haySinAplicar = estados.includes("vivo") || estados.includes("en-espera");
      expect(
        pendientesDelHilo(hilo).length > 0,
        "el libro y la pantalla no coinciden sobre si queda algo sin aplicar",
      ).toBe(haySinAplicar);
    }
  });
});
