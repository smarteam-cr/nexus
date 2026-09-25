/**
 * lib/timeline/borrador-tareas.test.ts — el núcleo puro del borrador con TAREAS (E2a, P1).
 *
 * Correr: `npx vitest run lib/timeline/borrador-tareas.test.ts --project unit`.
 *
 * borrador.test.ts cuida la estructura (E1); acá se cuida lo que suma E2a:
 *   1. el formato v1 con `tarea-nueva` / `tarea-se-va`: se lee igual, y un tipo futuro bloquea;
 *   2. la regla de la tarea que se va (avance, edición a mano, fechas fijadas, mudanza, reorden);
 *   3. «ya está» por huella del título + semana, contando cuántas hay;
 *   4. el CIERRE por `tareasArmadasPara` (la fase como quedaría, no el estado del padre);
 *   5. la huella, el bloqueo, el descarte automático y la propuesta que el handoff no pisa;
 *   6. el estado de las tareas deducido de la corrida;
 *   7. proyectar, resumir y los textos de la barra.
 * Cada `it` nombra la edición que lo pone en rojo.
 */
import { describe, expect, it } from "vitest";
import {
  BLOQUEO_TAREAS_EN_CURSO,
  BLOQUEO_VERSION_NUEVA,
  borradorBase,
  borradorVacio,
  claveDeRevision,
  claveDeTareaQueSeVa,
  debeDescartarseSolo,
  esBorradorV1,
  esVacioEsperandoTareas,
  estadoDeLasTareas,
  estructuraHipotetica,
  FORMATO_BORRADOR,
  fotoDeTarea,
  leerBorrador,
  pedidoDelCronograma,
  pideConfirmacion,
  planDeAplicacion,
  propuestaPorDecidir,
  proyectar,
  resumenDeLaConfirmacion,
  resumir,
  textoDeLaConfirmacion,
  textoDeLaLineaDeTareas,
  textoDeLaOfertaDeTareas,
  tituloDeLaBarra,
  traeCambiosDeTareas,
  versionDelBorrador,
  type Borrador,
  type Cambio,
  type CambioFaseCambia,
  type CambioFaseNueva,
  type CambioTareaNueva,
  type CambioTareaSeVa,
  type ContenidoDeTareaNueva,
  type FaseViva,
  type TareaDelVivo,
  type Vivo,
} from "./borrador";
import { MS_SIN_LATIDO_PARA_COLGADA } from "@/lib/agents/run-colgada";
import type { ProposalLike } from "./proposal-deltas";

const tarea = (id: string, title: string, weekIndex: number, extra: Partial<TareaDelVivo> = {}): TareaDelVivo => ({
  id,
  title,
  weekIndex,
  notes: null,
  party: "SMARTEAM",
  type: "TASK",
  status: "PENDING",
  source: "AGENT",
  inicioFijado: null,
  finFijado: null,
  ...extra,
});
const fase = (id: string, name: string, durationWeeks: number, tareas: TareaDelVivo[], extra: Partial<FaseViva> = {}): FaseViva => ({
  id,
  name,
  durationWeeks,
  startWeek: null,
  sessionCount: null,
  notes: null,
  activityType: null,
  tareas,
  ...extra,
});

const A1 = tarea("a1", "Reunión de arranque", 0, { type: "SESSION", source: "HUMAN" });
const B1 = tarea("b1", "Mapear procesos", 0);
const B2 = tarea("b2", "Definir pipeline", 1);
const B3 = tarea("b3", "Validar con el cliente", 1, { status: "DONE" });
const C1 = tarea("c1", "Probar flujos", 2);
const VIVO: Vivo = {
  ancla: "2026-10-05",
  fases: [fase("a", "Kick-off", 1, [A1]), fase("b", "Diseño", 2, [B1, B2, B3]), fase("c", "Pruebas", 3, [C1])],
};
/** El mismo cronograma con una fase cambiada. */
const conFase = (id: string, cambio: (f: FaseViva) => FaseViva, vivo: Vivo = VIVO): Vivo => ({
  ...vivo,
  fases: vivo.fases.map((f) => (f.id === id ? cambio(f) : f)),
});
/** El cronograma como lo lee el handoff: sin tareas. */
const sinLasTareas = (vivo: Vivo): Vivo => ({
  ...vivo,
  fases: vivo.fases.map((f) => {
    const sin: FaseViva = { ...f };
    delete sin.tareas;
    return sin;
  }),
});
/** El mismo cronograma con una tarea cambiada (en su fase). */
const conTarea = (id: string, cambio: Partial<TareaDelVivo>, vivo: Vivo = VIVO): Vivo => ({
  ...vivo,
  fases: vivo.fases.map((f) => ({ ...f, tareas: f.tareas?.map((t) => (t.id === id ? { ...t, ...cambio } : t)) })),
});

const DUR_C: CambioFaseCambia = {
  tipo: "fase-cambia",
  clave: "fase:c:durationWeeks",
  faseId: "c",
  fase: "Pruebas",
  campo: "durationWeeks",
  desde: 3,
  a: 4,
};
const PILOTO: CambioFaseNueva = {
  tipo: "fase-nueva",
  clave: "n:0000abcd",
  fase: { name: "Piloto", durationWeeks: 2, startWeek: null, sessionCount: null, notes: null, activityType: null },
  despuesDe: "c",
};
const ARMADAS: Borrador["tareasArmadasPara"] = {
  a: { nombre: "Kick-off", semanas: 1 },
  b: { nombre: "Diseño", semanas: 2 },
  c: { nombre: "Pruebas", semanas: 4 },
  [PILOTO.clave]: { nombre: "Piloto", semanas: 2 },
};

const contenido = (title: string, weekIndex: number, extra: Partial<ContenidoDeTareaNueva> = {}): ContenidoDeTareaNueva => ({
  title,
  weekIndex,
  notes: null,
  party: "SMARTEAM",
  type: "TASK",
  needsValidation: false,
  motivoPorValidar: null,
  fuga: null,
  ...extra,
});
const nueva = (clave: string, faseClave: string, title: string, weekIndex: number, extra: Partial<ContenidoDeTareaNueva> = {}): CambioTareaNueva => ({
  tipo: "tarea-nueva",
  clave,
  fase: faseClave,
  tarea: contenido(title, weekIndex, extra),
});
const seVa = (t: TareaDelVivo, faseId: string): CambioTareaSeVa => ({
  tipo: "tarea-se-va",
  clave: claveDeTareaQueSeVa(t.id),
  tareaId: t.id,
  faseId,
  desde: fotoDeTarea(t),
});
const v1 = (cambios: Cambio[], extra: Partial<Borrador> = {}): Borrador => ({
  formato: FORMATO_BORRADOR,
  version: 2,
  origen: "contexto",
  observaciones: [],
  cambios,
  pedido: "regenerar",
  tareas: { corrida: "run-2", listas: true },
  tareasArmadasPara: ARMADAS,
  ...extra,
});

/** Lo típico de «Regenerar todo»: una fase más larga, una fase nueva, y las tareas de tres fases. */
const BORRADOR = v1([
  DUR_C,
  PILOTO,
  seVa(B1, "b"),
  seVa(B2, "b"),
  nueva("t:b-1", "b", "Mapear procesos de venta", 0),
  seVa(C1, "c"),
  nueva("t:c-1", "c", "Pruebas de aceptación", 3),
  nueva("t:p-1", PILOTO.clave, "Piloto con un equipo", 0),
  nueva("t:p-2", PILOTO.clave, "Medir el piloto", 1),
]);

const estadoDe = (plan: ReturnType<typeof planDeAplicacion>, clave: string) => plan.items.find((it) => it.cambio.clave === clave)!;

describe("1 · el formato v1 con tareas: se lee igual, y lo que no se conoce bloquea", () => {
  it("⭐ ida y vuelta con los dos tipos: se lee igual y da la misma huella", () => {
    /* La edición que la pone en rojo: un `case` de `leerCambio` que pierde un campo (el motivo, la
       fuga de la nota, el «por validar», una fecha fijada del `desde`): el borrador guardado deja de
       ser el que se armó y la huella de la pantalla no es la del servidor. */
    const conFechas = tarea("b2", "Definir pipeline", 1, { notes: "con ventas", inicioFijado: "2026-10-12", finFijado: "2026-10-16" });
    const b = v1(
      [
        DUR_C,
        PILOTO,
        { ...seVa(conFechas, "b"), motivo: "La reunión la dejó sin sentido." },
        {
          ...nueva("t:1", "b", "Mapear procesos de venta", 0, {
            notes: "con el equipo comercial",
            party: "AMBOS",
            type: "SESSION",
            needsValidation: true,
            motivoPorValidar: "El proyecto no dice si es implementación.",
            fuga: { campo: "titulo", motivo: "trae una fecha", motivoDeLaNota: "trae un monto" },
          }),
          motivo: "Salió de la reunión del martes.",
        },
        nueva("t:2", PILOTO.clave, "Piloto con un equipo", 1, { party: null, type: null }),
      ],
      { tareas: { corrida: "run-7", listas: true } },
    );
    const guardado: unknown = JSON.parse(JSON.stringify(b));
    const leido = leerBorrador(guardado, { ancla: null, fases: [] })!;
    expect(leido).toEqual(b);
    expect(leido.desconocidos, "nada quedó como desconocido").toBeUndefined();
    const vivo = conTarea("b2", { notes: "con ventas", inicioFijado: "2026-10-12", finFijado: "2026-10-16" });
    expect(planDeAplicacion(vivo, leido).huella).toBe(planDeAplicacion(vivo, b).huella);
    expect(esBorradorV1(guardado)).toBe(true);
    expect(versionDelBorrador(guardado)).toBe(2);
    expect(traeCambiosDeTareas(guardado)).toBe(true);
    expect(traeCambiosDeTareas(JSON.parse(JSON.stringify(v1([DUR_C]))))).toBe(false);
  });

  it("⛔ un v1 BIEN FORMADO con un tipo futuro (`tarea-se-muda`) se lee, pero bloquea", () => {
    /* Vuelta atrás desde E3: el borrador puede traer mudanzas. La edición que la pone en rojo:
       ignorar el cambio desconocido y aplicar el resto como si fuera todo. */
    const guardado = JSON.parse(
      JSON.stringify({
        ...v1([DUR_C, seVa(B1, "b")]),
        cambios: [
          DUR_C,
          seVa(B1, "b"),
          { tipo: "tarea-se-muda", clave: "tarea:b2:se-muda", tareaId: "b2", faseId: "b", a: "c", desde: fotoDeTarea(B2) },
          // Y un `tarea-nueva` malformado (sin su contenido): tampoco se aplica a medias.
          { tipo: "tarea-nueva", clave: "t:roto", fase: "b" },
        ],
      }),
    );
    const b = leerBorrador(guardado, VIVO)!;
    expect(b.cambios.map((c) => c.clave)).toEqual(["fase:c:durationWeeks", "tarea:b1:se-va"]);
    expect(b.desconocidos).toBe(2);
    const plan = planDeAplicacion(VIVO, b, [], { tareas: "listas" });
    expect(plan.bloqueo).toBe(BLOQUEO_VERSION_NUEVA);
    expect(debeDescartarseSolo(plan)).toBe(false);
    // El permiso cuenta el tipo crudo: ante la duda, toca tareas.
    expect(traeCambiosDeTareas({ formato: FORMATO_BORRADOR, cambios: [{ tipo: "tarea-se-muda" }] })).toBe(true);
  });

  it("el formato viejo y el handoff no esperan tareas; el pedido sale de las tareas que hay", () => {
    const viejo = leerBorrador({ anchorStartDate: null, phases: [{ id: "a", name: "Kick-off", durationWeeks: 1 }] }, VIVO)!;
    expect([viejo.pedido, viejo.tareas, viejo.tareasArmadasPara]).toEqual([null, null, {}]);
    expect(pedidoDelCronograma([{ source: "HUMAN" }, { source: "AGENT" }])).toBe("regenerar");
    expect(pedidoDelCronograma([{ source: "MODIFIED" }])).toBe("regenerar");
    expect(pedidoDelCronograma([{ source: "HUMAN" }, { source: null }])).toBe("primera");
    expect(pedidoDelCronograma([])).toBe("primera");
    const vacio = borradorVacio({ pedido: "primera", corrida: "run-9" });
    expect(vacio).toMatchObject({ cambios: [], version: 0, tareas: { corrida: "run-9", listas: false }, pedido: "primera" });
  });

  it("borradorBase: las fases nuevas toman claves `n:…` (nunca de posiciones), únicas, y el `despuesDe` las sigue", () => {
    const propuesta: ProposalLike = {
      anchorStartDate: null,
      origen: "contexto",
      phases: [
        { id: "a", name: "Kick-off", durationWeeks: 1 },
        { name: "Uno", durationWeeks: 1, startWeek: null, sessionCount: null, notes: null },
        { name: "Dos", durationWeeks: 1, startWeek: null, sessionCount: null, notes: null },
        { id: "b", name: "Diseño", durationWeeks: 2 },
        { id: "c", name: "Pruebas", durationWeeks: 3 },
      ],
    };
    // Un generador que repite: la segunda clave se vuelve a pedir.
    const ids = ["aaaaaaaa-1111", "aaaaaaaa-2222", "bbbbbbbb-3333"];
    const b = borradorBase({ propuesta, vivo: VIVO, pedido: "regenerar", nuevaClave: () => ids.shift()! });
    const nuevas = b.cambios.filter((c): c is CambioFaseNueva => c.tipo === "fase-nueva");
    expect(nuevas.map((c) => [c.clave, c.despuesDe])).toEqual([
      ["n:aaaaaaaa", "a"],
      ["n:bbbbbbbb", "n:aaaaaaaa"],
    ]);
    expect(b).toMatchObject({ origen: "contexto", version: 0, pedido: "regenerar", tareas: { corrida: null, listas: false } });
    expect(b.tareasArmadasPara).toEqual({});
    expect(JSON.stringify(b)).not.toContain("nueva:");
  });
});

describe("2 · la tarea que se va: nunca lo que tiene avance ni lo que alguien editó", () => {
  const b = v1([seVa(B1, "b"), nueva("t:1", "b", "Otra", 0)]);

  it("⭐ sobre una tarea que pasó a DONE, IN_PROGRESS o SUSPENDED, o que es HUMAN: choca", () => {
    /* La edición que la pone en rojo: sacar `isKept` de la regla (se borraría trabajo con avance). */
    expect(estadoDe(planDeAplicacion(VIVO, b), "tarea:b1:se-va").estado).toBe("aplica");
    for (const cambio of [{ status: "DONE" }, { status: "IN_PROGRESS" }, { status: "SUSPENDED" }, { source: "HUMAN" }]) {
      const it = estadoDe(planDeAplicacion(conTarea("b1", cambio), b), "tarea:b1:se-va");
      expect(it.estado, JSON.stringify(cambio)).toBe("choque");
      expect(it.choque).toContain("ya tiene avance");
    }
  });

  it("⭐ editada a mano (título, semana, notas, dueño, tipo) o con una fecha fijada después: choca", () => {
    /* La edición que la pone en rojo: ignorar las fechas fijadas (`startDateOverride` /
       `dueDateOverride`) — aplicar borraba una tarea que el CSE acababa de agendar. */
    for (const cambio of [
      { title: "Mapear procesos (con ventas)" },
      { weekIndex: 1 },
      { notes: "nota del CSE" },
      { party: "CLIENTE" as const },
      { type: "SESSION" as const },
      { inicioFijado: "2026-10-12" },
      { finFijado: "2026-10-16T00:00:00.000Z" },
    ]) {
      const it = estadoDe(planDeAplicacion(conTarea("b1", cambio), b), "tarea:b1:se-va");
      expect(it.estado, JSON.stringify(cambio)).toBe("choque");
      expect(it.choque).toContain("La editaste a mano");
    }
  });

  it("⭐ reordenada (otro `order`, otro lugar en la lista, mismo contenido): se aplica igual", () => {
    /* Reordenar no es editar. La edición que la pone en rojo: comparar el `order` (o la foto entera
       de la fila): arrastrar una tarea dentro de su semana la volvía intocable. Las filas del
       servidor traen `order` (el select de tareas lo lee): acá también. */
    const conOrden = (t: TareaDelVivo, order: number) => ({ ...t, order }) as TareaDelVivo;
    const antes = conOrden(tarea("x1", "Configurar ventas", 0), 0);
    const otra = conOrden(tarea("x2", "Configurar marketing", 0), 1);
    const vivoAntes: Vivo = { ancla: null, fases: [fase("x", "Setup", 1, [antes, otra])] };
    const borrador = v1([seVa(antes, "x"), nueva("t:x", "x", "Configurar todo", 0)], {
      tareasArmadasPara: { x: { nombre: "Setup", semanas: 1 } },
    });
    const reordenado: Vivo = { ancla: null, fases: [fase("x", "Setup", 1, [conOrden(otra, 0), conOrden(antes, 1)])] };
    expect(estadoDe(planDeAplicacion(vivoAntes, borrador), "tarea:x1:se-va").estado).toBe("aplica");
    expect(estadoDe(planDeAplicacion(reordenado, borrador), "tarea:x1:se-va").estado).toBe("aplica");
    expect(planDeAplicacion(reordenado, borrador).escrituras.tareas.seVan).toEqual(["x1"]);
    expect(planDeAplicacion(reordenado, borrador).huella, "reordenar no es otra lista").toBe(planDeAplicacion(vivoAntes, borrador).huella);
  });

  it("borrada (ya no está) → ya está; movida a otra fase → choca; vivo sin tareas → choca", () => {
    const sinB1: Vivo = conFase("b", (f) => ({ ...f, tareas: [B2, B3] }));
    expect(estadoDe(planDeAplicacion(sinB1, b), "tarea:b1:se-va").estado).toBe("ya-esta");
    const mudada: Vivo = {
      ...VIVO,
      fases: VIVO.fases.map((f) =>
        f.id === "b" ? { ...f, tareas: [B2, B3] } : f.id === "c" ? { ...f, tareas: [C1, B1] } : f,
      ),
    };
    const it = estadoDe(planDeAplicacion(mudada, b), "tarea:b1:se-va");
    expect(it.estado).toBe("choque");
    expect(it.choque).toContain("La moviste a otra fase");
    // El vivo del handoff no lee tareas: la dirección segura es el choque (no «ya está»).
    const sinTareas = sinLasTareas(VIVO);
    expect(estadoDe(planDeAplicacion(sinTareas, b), "tarea:b1:se-va").estado).toBe("choque");
  });
});

describe("3 · la tarea nueva que ya está: huella del título + semana, contando cuántas hay", () => {
  it("⭐ con el título y la semana de una que sobrevive → ya está; con los de una que se va → aplica", () => {
    /* La edición que la pone en rojo: decidir por el título solo (sin la semana), o no restar las
       que se van de las que sobreviven. */
    const igualAB2 = nueva("t:1", "b", "  definir PIPELINE ", 1);
    const igualAB1 = nueva("t:2", "b", "Mapear procesos", 0);
    const b = v1([seVa(B1, "b"), igualAB2, igualAB1]);
    const plan = planDeAplicacion(VIVO, b);
    expect(estadoDe(plan, "t:1").estado).toBe("ya-esta");
    expect(estadoDe(plan, "t:2").estado, "la que se va no cuenta como que ya está").toBe("aplica");
    // Si el CSE desmarca la que se va, se queda: la nueva igual pasa a «ya está».
    expect(estadoDe(planDeAplicacion(VIVO, b, ["tarea:b1:se-va"]), "t:2").estado).toBe("ya-esta");
    // La misma, en otra semana, es otra tarea.
    expect(estadoDe(planDeAplicacion(VIVO, v1([nueva("t:3", "b", "Definir pipeline", 0)])), "t:3").estado).toBe("aplica");
  });

  it("⭐ una viva y tres nuevas iguales en otras semanas → aplican las tres; en la misma semana, se cuentan", () => {
    const tres = v1([
      nueva("t:1", "c", "Probar flujos", 0),
      nueva("t:2", "c", "Probar flujos", 1),
      nueva("t:3", "c", "Probar flujos", 3),
      DUR_C,
    ]);
    expect(planDeAplicacion(VIVO, tres).items.slice(0, 3).map((it) => it.estado)).toEqual(["aplica", "aplica", "aplica"]);
    // Dos iguales en la semana de la viva: la primera la consume, la segunda aplica.
    const dos = v1([nueva("t:1", "c", "Probar flujos", 2), nueva("t:2", "c", "Probar flujos", 2)], {
      tareasArmadasPara: { ...ARMADAS, c: { nombre: "Pruebas", semanas: 3 } },
    });
    expect(planDeAplicacion(VIVO, dos).items.map((it) => it.estado)).toEqual(["ya-esta", "aplica"]);
  });

  it("⭐ al ACORTAR la fase, una que sobrevive se cuenta en la semana donde va a quedar (la última)", () => {
    /* Revisión de E2a: la sobreviviente se contaba en su semana de hoy (la 3) y la nueva igual (armada
       sobre la fase ya acortada, en la 2) aplicaba; al aplicar, el servidor mueve la sobreviviente a la
       semana 2 y crea la nueva ahí: dos iguales en la misma semana. La edición que la pone en rojo:
       contar la sobreviviente con su semana viva, sin acotarla a la duración final de su fase. */
    const conAvance = tarea("c9", "Capacitación", 2, { status: "IN_PROGRESS" });
    const vivo = conFase("c", (f) => ({ ...f, tareas: [...(f.tareas ?? []), conAvance] }));
    const acorta: CambioFaseCambia = { ...DUR_C, desde: 3, a: 2 };
    const b = v1([acorta, nueva("t:1", "c", "Capacitación", 1)], {
      tareasArmadasPara: { ...ARMADAS, c: { nombre: "Pruebas", semanas: 2 } },
    });
    const plan = planDeAplicacion(vivo, b);
    expect(estadoDe(plan, "fase:c:durationWeeks").estado).toBe("aplica");
    expect(estadoDe(plan, "t:1").estado, "se crea un duplicado en la última semana").toBe("ya-esta");
    expect(plan.escrituras.tareas.nuevas).toEqual([]);
    // Lo que muestra «Ver la propuesta»: una sola «Capacitación», en la última semana.
    const pruebas = proyectar(vivo, b).fases.find((f) => f.id === "c")!;
    expect(pruebas.tareas.filter((t) => t.title === "Capacitación").map((t) => t.weekIndex)).toEqual([1]);
    // Sin acortar (el CSE desmarca el cambio de semanas), la sobreviviente sigue en su semana: no es la misma.
    expect(estadoDe(planDeAplicacion(vivo, b, ["fase:c:durationWeeks"]), "t:1").estado).not.toBe("ya-esta");
  });

  it("una nueva cuya fase ya no está choca; una en una fase nueva del borrador, no", () => {
    const b = v1([PILOTO, nueva("t:1", "zz", "Algo", 0), nueva("t:2", PILOTO.clave, "Algo", 0)], {
      tareasArmadasPara: { ...ARMADAS, zz: { nombre: "Borrada", semanas: 1 } },
    });
    const plan = planDeAplicacion(VIVO, b);
    expect(estadoDe(plan, "t:1").estado).toBe("choque");
    expect(estadoDe(plan, "t:1").choque).toContain("ya no está");
    expect(estadoDe(plan, "t:2").estado).toBe("aplica");
    expect(plan.escrituras.tareas.nuevas.map((n) => n.fase)).toEqual([{ tipo: "nueva", clave: PILOTO.clave }]);
  });
});

describe("4 · el CIERRE: las tareas valen si su fase conserva el nombre y las semanas con que se armaron", () => {
  const tareasDeC = (plan: ReturnType<typeof planDeAplicacion>) =>
    ["tarea:c1:se-va", "t:c-1"].map((k) => {
      const it = estadoDe(plan, k);
      return [it.estado, it.dependeDe ?? null];
    });

  it("⭐ excluir el cambio de semanas → sus tareas quedan fuera CON él; volver a marcarlo → vuelven", () => {
    expect(tareasDeC(planDeAplicacion(VIVO, BORRADOR))).toEqual([
      ["aplica", null],
      ["aplica", null],
    ]);
    const sinPadre = planDeAplicacion(VIVO, BORRADOR, ["fase:c:durationWeeks"]);
    expect(tareasDeC(sinPadre)).toEqual([
      ["excluido", "fase:c:durationWeeks"],
      ["excluido", "fase:c:durationWeeks"],
    ]);
    // Heredadas: no se escriben, pero se pueden marcar (cuentan en «Aplicar todo»).
    expect(sinPadre.escrituras.tareas.seVan).toEqual(["b1", "b2"]);
    expect(sinPadre.aplicables).toBe(planDeAplicacion(VIVO, BORRADOR).aplicables);
    // Desmarcar la hija y marcar al padre: la hija queda fuera por ella, no por el padre.
    expect(estadoDe(planDeAplicacion(VIVO, BORRADOR, ["t:c-1"]), "t:c-1")).toMatchObject({ estado: "excluido" });
    expect(estadoDe(planDeAplicacion(VIVO, BORRADOR, ["t:c-1"]), "t:c-1").dependeDe).toBeUndefined();
  });

  it("⭐ un padre en choque → sus tareas chocan; la fase acortada a mano SIN padre → chocan", () => {
    /* La edición que la pone en rojo: cerrar por el ESTADO del padre (sin padre, o con el padre
       aplicando, las tareas aplican) en vez de por la fase como quedaría. */
    const conCinco = conFase("c", (f) => ({ ...f, durationWeeks: 5 }));
    expect(estadoDe(planDeAplicacion(conCinco, BORRADOR), "fase:c:durationWeeks").estado).toBe("choque");
    expect(tareasDeC(planDeAplicacion(conCinco, BORRADOR))).toEqual([
      ["choque", null],
      ["choque", null],
    ]);
    // «Diseño» no tiene ningún cambio de fase: el CSE la acortó a mano después de la propuesta.
    const acortada = conFase("b", (f) => ({ ...f, durationWeeks: 1 }));
    const plan = planDeAplicacion(acortada, BORRADOR);
    for (const k of ["tarea:b1:se-va", "tarea:b2:se-va", "t:b-1"]) {
      expect(estadoDe(plan, k).estado, k).toBe("choque");
      expect(estadoDe(plan, k).choque).toContain("Su fase cambió");
    }
    // Y renombrarla a mano, igual.
    expect(estadoDe(planDeAplicacion(conFase("b", (f) => ({ ...f, name: "Diseño técnico" })), BORRADOR), "t:b-1").estado).toBe("choque");
    // Cambiar solo mayúsculas o espacios no es otra fase.
    expect(estadoDe(planDeAplicacion(conFase("b", (f) => ({ ...f, name: " diseño " })), BORRADOR), "t:b-1").estado).toBe("aplica");
  });

  it("⭐ un cambio de semanas que YA chocaba al fusionar → las tareas (armadas sobre lo vivo) aplican", () => {
    /* El CSE puso 5 semanas antes de que corriera el paso 2: el cambio 3 → 4 choca, el agente vio 5
       y armó para 5. Cerrar por el padre las tiraría. */
    const conCinco = conFase("c", (f) => ({ ...f, durationWeeks: 5 }));
    const b = { ...BORRADOR, tareasArmadasPara: { ...ARMADAS, c: { nombre: "Pruebas", semanas: 5 } } };
    expect(estadoDe(planDeAplicacion(conCinco, b), "fase:c:durationWeeks").estado).toBe("choque");
    expect(tareasDeC(planDeAplicacion(conCinco, b))).toEqual([
      ["aplica", null],
      ["aplica", null],
    ]);
  });

  it("las de una fase nueva: van con ella (excluida → heredadas; con otra del mismo nombre → chocan); sin `armada` → chocan", () => {
    const sinPiloto = planDeAplicacion(VIVO, BORRADOR, [PILOTO.clave]);
    expect(estadoDe(sinPiloto, "t:p-1")).toMatchObject({ estado: "excluido", dependeDe: PILOTO.clave });
    const conPiloto: Vivo = { ...VIVO, fases: [...VIVO.fases, fase("p", "piloto", 1, [])] };
    expect(estadoDe(planDeAplicacion(conPiloto, BORRADOR), "t:p-1").estado).toBe("choque");
    const sinArmada = { ...BORRADOR, tareasArmadasPara: Object.fromEntries(Object.entries(ARMADAS).filter(([k]) => k !== "b")) };
    expect(estadoDe(planDeAplicacion(VIVO, sinArmada), "t:b-1").estado).toBe("choque");
  });
});

describe("5 · la huella, el bloqueo, el descarte automático y la propuesta que el handoff no pisa", () => {
  it("⭐ la huella es estable ante una edición que ningún cambio mira, y cambia al excluir o al cambiar una tarea", () => {
    const h = planDeAplicacion(VIVO, BORRADOR).huella;
    expect(planDeAplicacion(conTarea("a1", { notes: "otra nota" }), BORRADOR).huella).toBe(h);
    expect(planDeAplicacion(conTarea("b3", { title: "Validar con todos" }), BORRADOR).huella).toBe(h);
    expect(planDeAplicacion(VIVO, BORRADOR, ["t:p-2"]).huella, "desmarcar una tarea").not.toBe(h);
    expect(planDeAplicacion(conTarea("b1", { notes: "x" }), BORRADOR).huella, "un choque nuevo").not.toBe(h);
    /* `destinoDe` exhaustivo: el contenido de una nueva y el id de la que se va entran en la huella.
       La edición que la pone en rojo: un tipo sin su `case` (mete `undefined` en la huella). */
    const otroContenido = (cambio: (c: CambioTareaNueva) => CambioTareaNueva) =>
      planDeAplicacion(VIVO, { ...BORRADOR, cambios: BORRADOR.cambios.map((c) => (c.clave === "t:p-1" ? cambio(c as CambioTareaNueva) : c)) }).huella;
    expect(otroContenido((c) => ({ ...c, tarea: { ...c.tarea, title: "Piloto con dos equipos" } }))).not.toBe(h);
    expect(otroContenido((c) => ({ ...c, tarea: { ...c.tarea, notes: "nota" } }))).not.toBe(h);
    expect(otroContenido((c) => ({ ...c, tarea: { ...c.tarea, needsValidation: true } }))).not.toBe(h);
    expect(otroContenido((c) => ({ ...c, tarea: { ...c.tarea, party: "CLIENTE" } }))).not.toBe(h);
  });

  it("⭐ se bloquea SOLO mientras las tareas se arman", () => {
    expect(planDeAplicacion(VIVO, BORRADOR, [], { tareas: "armando" }).bloqueo).toBe(BLOQUEO_TAREAS_EN_CURSO);
    for (const tareas of ["listas", "faltan", "fallo", null] as const) {
      expect(planDeAplicacion(VIVO, BORRADOR, [], { tareas }).bloqueo, String(tareas)).toBeNull();
    }
    expect(planDeAplicacion(VIVO, BORRADOR, [], { tareas: "fallo" }).estadoDeTareas).toBe("fallo");
  });

  it("⭐ el descarte automático: nunca uno que espera tareas; sí uno vacío cuya corrida falló", () => {
    /* La edición que la pone en rojo: descartar solo el v1 vacío en «faltan» (el paso 1 no propuso
       cambios de fases y el paso 2 todavía no llegó): la corrida pagada se perdería. */
    const vacio = borradorVacio({ pedido: "regenerar", corrida: "run-3" });
    for (const tareas of ["faltan", "armando"] as const) {
      expect(debeDescartarseSolo(planDeAplicacion(VIVO, vacio, [], { tareas })), tareas).toBe(false);
      expect(debeDescartarseSolo(resumir(VIVO, vacio, [], { tareas })), `${tareas} (resumen)`).toBe(false);
    }
    expect(debeDescartarseSolo(planDeAplicacion(VIVO, vacio, [], { tareas: "fallo" }))).toBe(true);
    expect(debeDescartarseSolo(resumir(VIVO, vacio, [], { tareas: "fallo" }))).toBe(true);
    // Con tareas que aplicar, el resumen (que las lista en `grupos`) no se descarta.
    const soloTareas = v1([nueva("t:1", "b", "Algo nuevo", 0)]);
    expect(debeDescartarseSolo(resumir(VIVO, soloTareas, [], { tareas: "listas" }))).toBe(false);
    expect(debeDescartarseSolo(planDeAplicacion(VIVO, soloTareas, [], { tareas: "listas" }))).toBe(false);
  });

  it("⭐ el handoff no pisa un v1 que espera tareas (aunque todavía no tenga cambios)", () => {
    /* La edición que la pone en rojo: decidir solo por el plan (vacío = nada que decidir): el handoff
       reemplazaría el borrador a mitad del paso 2. */
    const esperando = borradorBase({ propuesta: { anchorStartDate: null, phases: [] }, vivo: VIVO, pedido: "regenerar" });
    expect(esperando.cambios).toEqual([]);
    expect(propuestaPorDecidir(JSON.parse(JSON.stringify(esperando)), VIVO)).toBe(true);
    const listoYHecho = v1([], { tareas: { corrida: "run-1", listas: true } });
    expect(propuestaPorDecidir(JSON.parse(JSON.stringify(listoYHecho)), VIVO)).toBe(false);
    // El vivo del handoff no trae tareas: una que se va es algo por decidir.
    const sinTareas = sinLasTareas(VIVO);
    expect(propuestaPorDecidir(JSON.parse(JSON.stringify(v1([seVa(B1, "b")]))), sinTareas)).toBe(true);
  });

  it("⭐ el borrador vacío que espera tareas no es «una propuesta por decidir» (y guarda lo que notó el paso 1)", () => {
    /* Revisión de E2a: el chat, «Qué hacer acá» y el cartel lo trataban como una propuesta que decidir
       en una barra que no existe. La edición que la pone en rojo: contar como vacío uno con cambios, o
       uno con las tareas ya listas. */
    const vacio = JSON.parse(JSON.stringify(borradorVacio({ pedido: "regenerar", corrida: "run-3" })));
    expect(esVacioEsperandoTareas(vacio)).toBe(true);
    expect(esVacioEsperandoTareas(JSON.parse(JSON.stringify(v1([DUR_C], { tareas: { corrida: "run-3", listas: false } }))))).toBe(false);
    expect(esVacioEsperandoTareas(JSON.parse(JSON.stringify(v1([], { tareas: { corrida: "run-3", listas: true } }))))).toBe(false);
    expect(esVacioEsperandoTareas({ anchorStartDate: null, phases: [] }), "el formato viejo").toBe(false);
    expect(esVacioEsperandoTareas(null)).toBe(false);
    // Lo que notó el paso 1 viaja en el borrador vacío (así lo muestra la barra y sobrevive a recargar).
    const conNotas = borradorVacio({ pedido: "primera", corrida: "run-4", observaciones: ["Pruebas pasa a 3 semanas: no se pudo proponer."] });
    expect(leerBorrador(JSON.parse(JSON.stringify(conNotas)), VIVO)?.observaciones).toEqual(["Pruebas pasa a 3 semanas: no se pudo proponer."]);
  });

  it("⭐ claveDeRevision de un v1: el mismo token con otra versión es la misma revisión (lo desmarcado sobrevive)", () => {
    /* La edición que la pone en rojo: identificar un v1 por su contenido: al llegar las tareas (la
       versión sube) se perdía lo desmarcado y la pantalla arrancaba de cero. */
    const antes = JSON.parse(JSON.stringify(v1([DUR_C], { version: 1, tareas: { corrida: "run-2", listas: false } })));
    const despues = JSON.parse(JSON.stringify(v1([DUR_C, seVa(B1, "b")], { version: 2 })));
    expect(claveDeRevision(antes, "run-1")).toBe("run-1|v1");
    expect(claveDeRevision(despues, "run-1")).toBe(claveDeRevision(antes, "run-1"));
    expect(claveDeRevision(despues, "run-9"), "otro token es otra propuesta").not.toBe(claveDeRevision(antes, "run-1"));
  });
});

describe("6 · el estado de las tareas se DEDUCE de la corrida", () => {
  const ahora = new Date("2026-09-25T12:00:00.000Z");
  const hace = (ms: number) => new Date(ahora.getTime() - ms);
  const pendientes = { corrida: "run-1", listas: false };

  it("⭐ los seis casos, con el umbral único de corrida colgada (30 min sin latido)", () => {
    /* La edición que la pone en rojo: no mirar `estaColgada` (una corrida muerta bloquea «Aplicar»
       para siempre) o inventar otro umbral. */
    expect(estadoDeLasTareas(null, null, ahora)).toBeNull();
    expect(estadoDeLasTareas({ corrida: "run-1", listas: true }, null, ahora)).toBe("listas");
    expect(estadoDeLasTareas({ corrida: null, listas: false }, null, ahora)).toBe("faltan");
    expect(estadoDeLasTareas(pendientes, null, ahora), "no hay fila de la corrida").toBe("fallo");
    expect(estadoDeLasTareas(pendientes, { status: "RUNNING", updatedAt: hace(60_000) }, ahora)).toBe("armando");
    expect(estadoDeLasTareas(pendientes, { status: "PENDING", updatedAt: hace(MS_SIN_LATIDO_PARA_COLGADA) }, ahora)).toBe("armando");
    expect(estadoDeLasTareas(pendientes, { status: "RUNNING", updatedAt: hace(MS_SIN_LATIDO_PARA_COLGADA + 1) }, ahora)).toBe("fallo");
    for (const status of ["ERROR", "DONE", "ARCHIVED"]) {
      expect(estadoDeLasTareas(pendientes, { status, updatedAt: hace(1000) }, ahora), status).toBe("fallo");
    }
    expect(MS_SIN_LATIDO_PARA_COLGADA).toBe(30 * 60 * 1000);
  });
});

describe("7 · proyectar, la estructura que ve el paso 2, resumir y los textos", () => {
  it("proyectar: las vivas que sobreviven más las nuevas marcadas, acotadas, con «+N tareas» / «−N tareas»", () => {
    const p = proyectar(VIVO, BORRADOR, []);
    const de = (clave: string) => p.fases.find((f) => f.clave === clave)!;
    expect(de("b").tareas.map((t) => [t.clave, t.weekIndex, t.status])).toEqual([
      ["b3", 1, "DONE"],
      ["t:b-1", 0, "PENDING"],
    ]);
    expect(de("b").marca).toEqual({ tono: "cambia", etiquetas: ["+1 tarea", "−2 tareas"] });
    expect(de("c").durationWeeks).toBe(4);
    expect(de("c").tareas.map((t) => [t.id, t.clave, t.weekIndex])).toEqual([[null, "t:c-1", 3]]);
    expect(de("c").marca).toEqual({ tono: "cambia", etiquetas: ["+1 semana", "+1 tarea", "−1 tarea"] });
    expect(de(PILOTO.clave).marca).toEqual({ tono: "nueva", etiquetas: ["nueva", "+2 tareas"] });
    expect(de("a").marca, "lo que no cambia no se marca").toBeNull();
    // Una fase que se acorta: sus tareas caen en la última semana (donde las deja el servidor).
    const acorta = v1([{ ...DUR_C, clave: "fase:b:durationWeeks", faseId: "b", fase: "Diseño", desde: 2, a: 1 }]);
    expect(proyectar(VIVO, acorta, []).fases.find((f) => f.id === "b")!.tareas.map((t) => t.weekIndex)).toEqual([0, 0, 0]);
  });

  it("estructuraHipotetica: lo que no choca, sin mirar lo desmarcado, con las vivas y las fases nuevas vacías", () => {
    const conCincoEnB = conFase("b", (f) => ({ ...f, durationWeeks: 5 }));
    const choca: CambioFaseCambia = { ...DUR_C, clave: "fase:b:durationWeeks", faseId: "b", fase: "Diseño", desde: 2, a: 3 };
    const e = estructuraHipotetica(conCincoEnB, v1([DUR_C, PILOTO, choca, seVa(B1, "b")]));
    expect(e.fases.map((f) => [f.id, f.durationWeeks, f.existente, f.tareas.length])).toEqual([
      ["a", 1, true, 1],
      ["b", 5, true, 3],
      ["c", 4, true, 1],
      [PILOTO.clave, 2, false, 0],
    ]);
    expect(e.ancla).toBe("2026-10-05");
  });

  it("resumir: la estructura se numera 1..k y las tareas van en grupos por fase (k+1…), con su estado", () => {
    const r = resumir(VIVO, BORRADOR, [], { tareas: "listas" });
    expect(r.items.map((it) => [it.numero, it.clave])).toEqual([
      [1, "fase:c:durationWeeks"],
      [2, PILOTO.clave],
    ]);
    expect(r.grupos.map((g) => [g.numero, g.fase, g.nombre, g.nuevas, g.seVan, g.estado])).toEqual([
      [3, "b", "Diseño", 1, 2, "aplica"],
      [4, "c", "Pruebas", 1, 1, "aplica"],
      [5, PILOTO.clave, "Piloto", 2, 0, "aplica"],
    ]);
    expect(r.grupos[0].tareas.map((t) => [t.signo, t.semana, t.titulo])).toEqual([
      ["−", 1, "Mapear procesos"],
      ["−", 2, "Definir pipeline"],
      ["+", 1, "Mapear procesos de venta"],
    ]);
    expect(r.tareas).toEqual({ nuevas: 4, seVan: 3 });
    expect(r.borraAlgo).toBe(true);
    expect(r.fasesNuevasConTareas).toBe(true);
    expect(r.proyeccion.fases.map((f) => f.clave)).toEqual(proyectar(VIVO, BORRADOR, []).fases.map((f) => f.clave));
    expect(r.huella, "la huella usa la posición interna").toBe(planDeAplicacion(VIVO, BORRADOR).huella);

    // Desmarcar el cambio de semanas: el grupo de «Pruebas» va con él y no se marca solo.
    const sinPadre = resumir(VIVO, BORRADOR, ["fase:c:durationWeeks"], { tareas: "listas" });
    const c = sinPadre.grupos.find((g) => g.fase === "c")!;
    expect([c.estado, c.dependeDe, c.aviso]).toEqual(["excluido", 1, "Va con el cambio 1: si lo marcas, vuelven sus tareas."]);
    expect(c.tareas.every((t) => !t.seMarca)).toBe(true);
    // Desmarcar una sola tarea: el grupo queda a medias.
    expect(resumir(VIVO, BORRADOR, ["tarea:b1:se-va"]).grupos[0].estado).toBe("parcial");
  });

  it("resumir: «por validar», la fuga y la repetida en otra fase se dicen en cada tarea", () => {
    const b = v1([
      nueva("t:1", "b", "Probar flujos", 0, { needsValidation: true }),
      nueva("t:2", "b", "Algo", 1, { fuga: { campo: "nota", motivo: "trae un monto" } }),
    ]);
    const [t1, t2] = resumir(VIVO, b).grupos[0].tareas;
    expect(t1.porValidar).toContain("no la sacó del handoff");
    expect(t1.repetida).toMatchObject({ fase: "Pruebas", status: "PENDING" });
    expect(t2.fuga).toEqual({ campo: "nota", motivo: "trae un monto" });
    expect(t2.porValidar).toBeUndefined();
  });

  it("⭐ pideConfirmacion: con UNA sola tarea que se va marcada, o con las tareas faltantes", () => {
    /* La edición que la pone en rojo: confirmar solo «otro cronograma» — aplicar borraba tareas (o
       aplicaba sin ellas) con un clic. */
    const unaSeVa = v1([seVa(B1, "b")]);
    expect(pideConfirmacion(resumir(VIVO, unaSeVa, [], { tareas: "listas" }))).toBe(true);
    expect(pideConfirmacion(resumir(VIVO, unaSeVa, ["tarea:b1:se-va"], { tareas: "listas" })), "nada marcado").toBe(false);
    const soloFases = v1([DUR_C], { tareas: { corrida: null, listas: false } });
    expect(pideConfirmacion(resumir(VIVO, soloFases, [], { tareas: "faltan" }))).toBe(true);
    expect(pideConfirmacion(resumir(VIVO, soloFases, [], { tareas: "fallo" }))).toBe(true);
    expect(pideConfirmacion(resumir(VIVO, v1([DUR_C]), [], { tareas: "listas" })), "un ajuste chico").toBe(false);
    expect(pideConfirmacion(resumir(VIVO, v1([nueva("t:1", "b", "Algo", 0)]), [], { tareas: "listas" })), "solo suma").toBe(false);
  });

  it("los textos: el título de la barra, la confirmación y la línea de las tareas", () => {
    expect(tituloDeLaBarra(resumir(VIVO, BORRADOR))).toBe("La IA propone 2 cambios de fases y 7 de tareas");
    expect(tituloDeLaBarra(resumir(VIVO, v1([seVa(B1, "b")])))).toBe("La IA propone 1 cambio de tareas");
    expect(tituloDeLaBarra(resumir(VIVO, v1([DUR_C])))).toBe("La IA propone 1 cambio");

    expect(textoDeLaConfirmacion(resumir(VIVO, BORRADOR))).toBe(
      "Se quitan 3 tareas pendientes de la IA; lo que tiene avance o escribiste a mano no se toca. Después puedes seguir editando el cronograma a mano.",
    );
    expect(textoDeLaConfirmacion(resumir(VIVO, v1([seVa(B1, "b")])))).toMatch(/^Se quita 1 tarea pendiente de la IA;/);
    expect(textoDeLaConfirmacion(resumir(VIVO, v1([DUR_C]), [], { tareas: "faltan" }))).toBe(
      "Se aplican solo los cambios de fases: las tareas de esta propuesta no llegaron.",
    );
    expect(textoDeLaConfirmacion(resumir(VIVO, v1([PILOTO, nueva("t:1", PILOTO.clave, "Algo", 0)])))).toContain(
      "las fases nuevas nacen con sus tareas",
    );
    expect(textoDeLaConfirmacion(resumir(VIVO, v1([PILOTO])))).toContain("las fases nuevas nacen vacías");

    expect(textoDeLaLineaDeTareas("paso-1", null, null, true)?.texto).toMatch(/^Paso 1 de 2 · /);
    expect(textoDeLaLineaDeTareas("paso-1", null, null, false)?.texto).toBe("Preparando la propuesta del cronograma…");
    expect(textoDeLaLineaDeTareas("armando", null, null, true)).toEqual({
      texto: "Armando las tareas… · suele tardar uno o dos minutos",
      accion: null,
    });
    expect(textoDeLaLineaDeTareas("armando", "Leyendo las reuniones", null, true)?.texto).toBe("Armando las tareas… · Leyendo las reuniones");
    expect(textoDeLaLineaDeTareas("faltan", null, null, true)?.accion).toBe("Armar las tareas");
    expect(textoDeLaLineaDeTareas("fallo", null, "El modelo no respondió.", true)).toEqual({
      texto: "No se pudieron armar las tareas: El modelo no respondió. Si aplicas ahora, solo se aplican los cambios de fases.",
      accion: "Volver a intentar",
    });
    expect(textoDeLaLineaDeTareas("listas", null, null, true)).toBeNull();
  });

  it("⭐ la primera oración de la confirmación cuenta fases y tareas por separado, y nunca queda «: .»", () => {
    /* Revisión de E2a: se armaba solo con las frases de fases, así que una propuesta solo de tareas
       decía «Se aplican los 2 cambios marcados de una sola vez: .» y las tareas que se crean no se
       nombraban en ningún lado. La edición que la pone en rojo: volver a armarla solo con
       `redactarResumenDeCambios`, o dejar los dos puntos sin frase. */
    const soloSeVan = resumenDeLaConfirmacion(resumir(VIVO, v1([seVa(B1, "b"), seVa(B2, "b")])));
    expect(soloSeVan).toBe("Se aplican los 2 cambios marcados de una sola vez: se quitan 2 tareas.");
    expect(resumenDeLaConfirmacion(resumir(VIVO, v1([seVa(B1, "b")])))).toBe(
      "Se aplica el cambio marcado de una sola vez: se quita 1 tarea.",
    );
    expect(resumenDeLaConfirmacion(resumir(VIVO, BORRADOR))).toBe(
      "Se aplican los 9 cambios marcados de una sola vez: 1 fase cambia de duración, se suma 1 fase nueva, se crean 4 tareas y se quitan 3.",
    );
    // Un cambio que ninguna frase nombra (las notas de una fase): la oración cierra sin los dos puntos.
    const notas: CambioFaseCambia = { tipo: "fase-cambia", clave: "fase:b:notes", faseId: "b", fase: "Diseño", campo: "notes", desde: null, a: "Con ventas" };
    expect(resumenDeLaConfirmacion(resumir(VIVO, v1([notas])))).toBe("Se aplica el cambio marcado de una sola vez.");
    for (const b of [v1([seVa(B1, "b")]), v1([notas]), BORRADOR]) {
      expect(resumenDeLaConfirmacion(resumir(VIVO, b))).not.toMatch(/:\s*\./);
    }
  });

  it("⭐ sin cambios de fases, la línea no promete aplicar «solo los cambios de fases» y la oferta no dice que se decidieron", () => {
    /* Revisión de E2a: el borrador que nace vacío (el paso 1 no propuso nada) decía «Si aplicas ahora,
       solo se aplican los cambios de fases» sin ninguno que aplicar, y tras su fallo se ofrecía «Las
       fases quedaron decididas» sin que se hubiera propuesto ninguna. La edición que la pone en rojo:
       ignorar `conCambiosDeFases`, o volver a la frase fija de la oferta. */
    const fallo = textoDeLaLineaDeTareas("fallo", null, "la IA está sobrecargada", false, false);
    expect(fallo).toEqual({ texto: "No se pudieron armar las tareas: la IA está sobrecargada.", accion: "Volver a intentar" });
    expect(textoDeLaLineaDeTareas("faltan", null, null, false, false)?.texto).toBe("Faltan las tareas de esta propuesta.");
    for (const estado of ["faltan", "fallo"] as const) {
      expect(textoDeLaLineaDeTareas(estado, null, null, false, false)?.texto, estado).not.toContain("cambios de fases");
      expect(textoDeLaLineaDeTareas(estado, null, null, false)?.texto, `${estado} (con fases)`).toContain(
        "solo se aplican los cambios de fases",
      );
    }
    expect(textoDeLaOfertaDeTareas(true).titulo).toBe("Las fases quedaron decididas.");
    const sinFases = textoDeLaOfertaDeTareas(false);
    expect(`${sinFases.titulo} ${sinFases.detalle}`).not.toMatch(/fases/);
    expect(sinFases.titulo).toBe("No se pudieron armar las tareas.");
  });
});
