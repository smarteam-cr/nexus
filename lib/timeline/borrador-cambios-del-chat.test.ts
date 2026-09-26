/**
 * lib/timeline/borrador-cambios-del-chat.test.ts — el núcleo del borrador con lo que dicta el chat (E3 P1).
 *
 * Correr: `npx vitest run lib/timeline/borrador-cambios-del-chat.test.ts --project unit`.
 *
 * Nadie produce todavía estos cambios (los produce el chat en P2); acá se congela lo que el núcleo
 * hace con ellos, en el mismo orden que el plan (§2.3 de la especificación de E3):
 *   1. el formato: `tarea-cambia`, `fase-se-va`, `porChat`, `retocada`, `conCambio`, `excluidos` y
 *      `ajustadasPorElChat` sobreviven a guardarse y leerse; lo mal formado bloquea;
 *   2. la tarea que cambia, campo por campo, con su destino y el cambio con el que va;
 *   3. dos cambios de la misma tarea: gana el que la quita;
 *   4. el rescate de la fase que se va, y la mudanza que sale de ella;
 *   5. el cierre de E2c no mira lo del chat, y la forma que le dio el chat evita el desfase;
 *   6. la huella de todo lo anterior no cambia;
 *   7. las escrituras, la proyección, la lista de la barra y la confirmación;
 *   8. el permiso (`necesitaPermisoDeIa`, `traeCambiosDeTareas`).
 * Cada `it` nombra la edición que lo pone en rojo.
 */
import { describe, expect, it } from "vitest";
import {
  claveDeFaseQueSeVa,
  claveDeTareaQueCambia,
  claveDeTareaQueSeVa,
  convertirPropuestaDeFases,
  FORMATO_BORRADOR,
  fotoDeTarea,
  leerBorrador,
  necesitaPermisoDeIa,
  pideConfirmacion,
  planDeAplicacion,
  proyectar,
  resumenDeLaConfirmacion,
  resumir,
  textoDeLaConfirmacion,
  tituloDeLaBarra,
  traeCambiosDeTareas,
  type Borrador,
  type Cambio,
  type CambioFaseCambia,
  type CambioFaseNueva,
  type CambioFaseSeVa,
  type CambioTareaCambia,
  type CambioTareaNueva,
  type CambioTareaSeVa,
  type ContenidoDeTareaNueva,
  type FaseViva,
  type TareaDelVivo,
  type Vivo,
} from "./borrador";

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
  status: "PENDING",
  ...extra,
});

const A1 = tarea("a1", "Reunión de arranque", 0, { type: "SESSION", source: "HUMAN", status: "DONE" });
const B1 = tarea("b1", "Mapear procesos", 0);
const B2 = tarea("b2", "Definir pipeline", 1);
const B3 = tarea("b3", "Validar con el cliente", 1, { status: "DONE" });
const C1 = tarea("c1", "Probar flujos", 2);
const C2 = tarea("c2", "Pruebas con usuarios", 1);
const VIVO: Vivo = {
  ancla: "2026-10-05",
  fases: [
    fase("a", "Kick-off", 1, [A1], { status: "DONE" }),
    fase("b", "Diseño", 2, [B1, B2, B3]),
    fase("c", "Pruebas", 3, [C1, C2]),
  ],
};
const conFase = (id: string, cambio: (f: FaseViva) => FaseViva, vivo: Vivo = VIVO): Vivo => ({
  ...vivo,
  fases: vivo.fases.map((f) => (f.id === id ? cambio(f) : f)),
});
const conTarea = (id: string, cambio: Partial<TareaDelVivo>, vivo: Vivo = VIVO): Vivo => ({
  ...vivo,
  fases: vivo.fases.map((f) => ({ ...f, tareas: f.tareas?.map((t) => (t.id === id ? { ...t, ...cambio } : t)) })),
});
/** La tarea `id` mudada a mano a la fase `a`. */
const mudadaAMano = (id: string, a: string, vivo: Vivo = VIVO): Vivo => {
  const t = vivo.fases.flatMap((f) => f.tareas ?? []).find((x) => x.id === id)!;
  return {
    ...vivo,
    fases: vivo.fases.map((f) => ({
      ...f,
      tareas: f.id === a ? [...(f.tareas ?? []), t] : f.tareas?.filter((x) => x.id !== id),
    })),
  };
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
const nueva = (clave: string, faseClave: string, title: string, weekIndex: number, extra: Partial<CambioTareaNueva> = {}): CambioTareaNueva => ({
  tipo: "tarea-nueva",
  clave,
  fase: faseClave,
  tarea: contenido(title, weekIndex),
  ...extra,
});
const seVa = (t: TareaDelVivo, faseId: string, extra: Partial<CambioTareaSeVa> = {}): CambioTareaSeVa => ({
  tipo: "tarea-se-va",
  clave: claveDeTareaQueSeVa(t.id),
  tareaId: t.id,
  faseId,
  desde: fotoDeTarea(t),
  ...extra,
});
const cambia = (t: TareaDelVivo, faseId: string, a: CambioTareaCambia["a"], extra: Partial<CambioTareaCambia> = {}): CambioTareaCambia => ({
  tipo: "tarea-cambia",
  clave: claveDeTareaQueCambia(t.id),
  tareaId: t.id,
  faseId,
  desde: fotoDeTarea(t),
  a,
  porChat: true,
  ...extra,
});
/** Una fase que se va, como la produce el chat: la foto de la fase y de cada una de sus tareas vivas. */
const seVaLaFase = (id: string, vivo: Vivo = VIVO, extra: Partial<CambioFaseSeVa> = {}): CambioFaseSeVa => {
  const f = vivo.fases.find((x) => x.id === id)!;
  return {
    tipo: "fase-se-va",
    clave: claveDeFaseQueSeVa(id),
    faseId: id,
    desde: {
      name: f.name,
      durationWeeks: f.durationWeeks,
      startWeek: f.startWeek,
      sessionCount: f.sessionCount,
      notes: f.notes,
      activityType: f.activityType,
      status: f.status!,
      tareas: (f.tareas ?? []).map((t) => ({ id: t.id, foto: fotoDeTarea(t) })),
    },
    porChat: true,
    ...extra,
  };
};

const DUR_C: CambioFaseCambia = { tipo: "fase-cambia", clave: "fase:c:durationWeeks", faseId: "c", fase: "Pruebas", campo: "durationWeeks", desde: 3, a: 4 };
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
const itemDe = (plan: ReturnType<typeof planDeAplicacion>, clave: string) => plan.items.find((it) => it.cambio.clave === clave)!;
const ida = (b: Borrador): unknown => JSON.parse(JSON.stringify(b));

describe("1 · el formato: lo del chat sobrevive a guardarse, y lo mal formado bloquea", () => {
  it("⭐ la ida y vuelta conserva porChat, retocada, conCambio, excluidos y ajustadasPorElChat", () => {
    /* Si un `case` de `leerCambio` los pierde, una fusión que reescribe `cambios` desde el borrador
       leído (borrador-del-detalle.ts) los borra: lo del chat pasaría a pedir la vara de la IA y a
       entrar al cierre. La edición que la pone en rojo: un `case` que no copia `porChat`, `retocada` o
       `conCambio`, o no leer `excluidos` / `ajustadasPorElChat`. */
    const b = v1(
      [
        { tipo: "ancla", clave: "ancla", desde: "2026-10-05", a: "2026-10-12", porChat: true },
        { tipo: "orden", clave: "orden", desde: ["a", "b", "c"], a: ["a", "c", "b"], porChat: true },
        { ...DUR_C, porChat: true, motivo: "Lo pidió el CSE." },
        { ...PILOTO, porChat: true },
        seVaLaFase("b", VIVO, { motivo: "Ya no va." }),
        nueva("t:chat", "c", "Pruebas de carga", 1, { porChat: true }),
        nueva("t:retocada", "c", "Pruebas de regresión", 2, { retocada: true }),
        // Revisión de E3 (#1): la de la IA que el chat mudó de fase; sin su marca, volvería al cierre.
        nueva("t:mudada", "b", "Pruebas de humo", 0, { retocada: true, mudadaPorElChat: true }),
        seVa(C1, "c", { porChat: true }),
        cambia(C2, "c", { title: "Pruebas con usuarios clave", weekIndex: 2, party: null, type: "SESSION", fase: PILOTO.clave }, { conCambio: DUR_C.clave }),
      ],
      { excluidos: ["tarea:c1:se-va", "t:ya-no-esta"], ajustadasPorElChat: { c: { nombre: "Pruebas", semanas: 4, sesiones: null, semanaCero: false } } },
    );
    const leido = leerBorrador(ida(b))!;
    expect(leido).toEqual(b);
    expect(leido.desconocidos, "nada quedó como desconocido").toBeUndefined();
    expect(planDeAplicacion(VIVO, leido).huella).toBe(planDeAplicacion(VIVO, b).huella);
  });

  it("⛔ una `tarea-cambia` o una `fase-se-va` mal formada es desconocida y bloquea; unas casillas mal guardadas no", () => {
    /* Estricto: sin `a`, con un campo inválido, sin el estado de la fase o con una foto a medias, el
       cambio no se aplica a medias. `excluidos` roto queda ausente y NO cuenta (aplicar lee el `sin`
       del cuerpo, no las casillas guardadas). La edición que la pone en rojo: aceptar `a` vacío o una
       foto de fase sin `status`, o contar las casillas rotas como un cambio desconocido. */
    const crudo = ida(v1([DUR_C])) as Record<string, unknown>;
    const malos = [
      { ...cambia(C2, "c", { title: "X" }), a: {} },
      { ...cambia(C2, "c", { title: "X" }), a: { weekIndex: -1 } },
      { ...cambia(C2, "c", { title: "X" }), a: { title: "X", party: "NADIE" } },
      { ...cambia(C2, "c", { title: "X" }), conCambio: "" },
      { ...seVaLaFase("c"), desde: { ...seVaLaFase("c").desde, status: undefined } },
      { ...seVaLaFase("c"), desde: { ...seVaLaFase("c").desde, tareas: [{ id: "c1" }] } },
    ];
    for (const malo of malos) {
      const b = leerBorrador({ ...crudo, cambios: [DUR_C, JSON.parse(JSON.stringify(malo))] })!;
      expect(b.desconocidos, JSON.stringify(malo).slice(0, 80)).toBe(1);
      expect(planDeAplicacion(VIVO, b).bloqueo).not.toBeNull();
    }
    const conCasillasRotas = leerBorrador({ ...crudo, excluidos: ["ok", 3] })!;
    expect(conCasillasRotas.excluidos).toBeUndefined();
    expect(conCasillasRotas.desconocidos).toBeUndefined();
  });
});

describe("2 · la tarea que cambia: campo por campo, su destino y el cambio con el que va", () => {
  it("⭐ la tabla de `evaluarCambia`", () => {
    /* La edición que la pone en rojo: comparar la foto ENTERA (una edición de un campo que nadie pidió
       cambiar haría chocar), no chocar por un campo editado a mano, o recrear la mudanza como una
       tarea nueva. */
    const casos: Array<[string, Vivo, CambioTareaCambia, { estado: string; choque?: RegExp }]> = [
      ["pendiente", VIVO, cambia(C2, "c", { title: "Pruebas clave" }), { estado: "aplica" }],
      ["ausente", { ...VIVO, fases: VIVO.fases.map((f) => ({ ...f, tareas: f.tareas?.filter((t) => t.id !== "c2") })) }, cambia(C2, "c", { title: "Pruebas clave" }), { estado: "choque", choque: /Ya no está en el cronograma/ }],
      ["mudada a mano", mudadaAMano("c2", "b"), cambia(C2, "c", { title: "Pruebas clave" }), { estado: "choque", choque: /La moviste a otra fase/ }],
      ["título editado a mano", conTarea("c2", { title: "Otro título" }), cambia(C2, "c", { title: "Pruebas clave" }), { estado: "choque", choque: /Se editó a mano/ }],
      ["semana editada a mano", conTarea("c2", { weekIndex: 0 }), cambia(C2, "c", { weekIndex: 2 }), { estado: "choque", choque: /Se editó a mano/ }],
      ["otro campo editado (no se pidió)", conTarea("c2", { party: "CLIENTE", notes: "algo" }), cambia(C2, "c", { title: "Pruebas clave" }), { estado: "aplica" }],
      ["ya está (a mano)", conTarea("c2", { title: "Pruebas clave" }), cambia(C2, "c", { title: "Pruebas clave" }), { estado: "ya-esta" }],
      ["ya está (mudada a mano a su destino)", mudadaAMano("c2", "b"), cambia(C2, "c", { fase: "b" }), { estado: "ya-esta" }],
      ["con avance: la mudanza no frena", conTarea("c2", { status: "DONE" }), cambia({ ...C2, status: "DONE" }, "c", { fase: "b" }), { estado: "aplica" }],
      ["destino borrado", VIVO, cambia(C2, "c", { fase: "zz" }), { estado: "choque", choque: /La fase ya no está en el cronograma/ }],
    ];
    for (const [nombre, vivo, c, esperado] of casos) {
      const it = itemDe(planDeAplicacion(vivo, v1([c])), c.clave);
      expect(it.estado, nombre).toBe(esperado.estado);
      if (esperado.choque) expect(it.choque, nombre).toMatch(esperado.choque);
    }
  });

  it("⭐ el destino: una fase nueva desmarcada se la lleva (heredada), en choque la deja fuera; una que se va, choca", () => {
    /* La edición que la pone en rojo: mudar a una fase nueva que no se crea (TareasQueNoCuadran → 409
       para siempre), o a una fase que se quita en la misma aplicación. */
    const aPiloto = cambia(C2, "c", { fase: PILOTO.clave });
    const excluida = planDeAplicacion(VIVO, v1([PILOTO, aPiloto]), [PILOTO.clave]);
    expect(itemDe(excluida, aPiloto.clave)).toMatchObject({ estado: "excluido", dependeDe: PILOTO.clave });
    const repetida: CambioFaseNueva = { ...PILOTO, fase: { ...PILOTO.fase, name: "Diseño" } };
    expect(itemDe(planDeAplicacion(VIVO, v1([repetida, aPiloto])), aPiloto.clave)).toMatchObject({
      estado: "choque",
      choque: "Su fase de destino queda fuera.",
    });
    const aDiseno = cambia(C2, "c", { fase: "b" });
    expect(itemDe(planDeAplicacion(VIVO, v1([seVaLaFase("b"), aDiseno])), aDiseno.clave)).toMatchObject({
      estado: "choque",
      choque: "La fase de destino se quita con el cambio 1.",
    });
    // Con la fase nueva marcada, se muda.
    expect(itemDe(planDeAplicacion(VIVO, v1([PILOTO, aPiloto])), aPiloto.clave).estado).toBe("aplica");
  });

  it("⭐ D17 · con el cambio con el que va desmarcado, queda heredada; en choque, choca", () => {
    /* Quitar o insertar una semana corre tareas: sin su duración, esas semanas no existen. La edición
       que la pone en rojo: evaluar la tarea sin mirar `conCambio`. */
    const semana = cambia(C1, "c", { weekIndex: 3 }, { conCambio: DUR_C.clave });
    const conDuracion = { ...DUR_C, porChat: true as const };
    expect(itemDe(planDeAplicacion(VIVO, v1([conDuracion, semana])), semana.clave).estado).toBe("aplica");
    expect(itemDe(planDeAplicacion(VIVO, v1([conDuracion, semana]), [DUR_C.clave]), semana.clave)).toMatchObject({
      estado: "excluido",
      dependeDe: DUR_C.clave,
    });
    const duracionEditada = conFase("c", (f) => ({ ...f, durationWeeks: 5 }));
    expect(itemDe(planDeAplicacion(duracionEditada, v1([conDuracion, semana])), semana.clave)).toMatchObject({
      estado: "choque",
      choque: "Va con el cambio 1, que queda fuera.",
    });
  });
});

describe("3 · dos cambios de la misma tarea", () => {
  it("⛔ se va y cambia a la vez: gana la que la quita, y la que cambia choca", () => {
    /* La edición que la pone en rojo: aplicar las dos (se actualizaría una tarea borrada: 409 para siempre). */
    const c = cambia(C1, "c", { title: "Probar flujos de venta" });
    const quitar = seVa(C1, "c", { porChat: true });
    const plan = planDeAplicacion(VIVO, v1([quitar, c]));
    expect(itemDe(plan, quitar.clave).estado).toBe("aplica");
    expect(itemDe(plan, c.clave)).toMatchObject({ estado: "choque", choque: "La tarea se quita con el cambio 1." });
    // Desmarcada la que se va, la que cambia vuelve.
    expect(itemDe(planDeAplicacion(VIVO, v1([quitar, c]), [quitar.clave]), c.clave).estado).toBe("aplica");
  });
});

describe("4 · la fase que se va: el rescate", () => {
  it("⭐ se queda lo protegido, lo creado después y lo EDITADO después (su foto), y la fase con ello", () => {
    /* La edición que la pone en rojo: rescatar solo `isKept` (se borraría una tarea que el CSE editó
       después de pedir que se quite la fase, o una que creó en el medio). */
    const cambio = seVaLaFase("b");
    const creadaDespues = tarea("b4", "Tarea creada después", 0);
    const vivo = conFase("b", (f) => ({ ...f, tareas: [...f.tareas!.map((t) => (t.id === "b2" ? { ...t, title: "Definir pipeline de ventas" } : t)), creadaDespues] }));
    const plan = planDeAplicacion(vivo, v1([cambio]));
    const it = itemDe(plan, cambio.clave);
    expect(it.estado).toBe("aplica");
    expect(it.rescate).toEqual(["b2", "b3", "b4"]);
    expect(plan.escrituras.fasesQueSeVan).toEqual([{ id: "b", borrar: ["b1"], queda: true }]);
    // La fase se queda: sigue en el orden.
    expect(plan.escrituras.orden.map((l) => (l.tipo === "existente" ? l.id : l.clave))).toEqual(["a", "b", "c"]);
  });

  it("⛔ la fase editada a mano después, o que ya arrancó, choca entera", () => {
    const cambio = seVaLaFase("b");
    expect(itemDe(planDeAplicacion(conFase("b", (f) => ({ ...f, notes: "nota a mano" })), v1([cambio])), cambio.clave)).toMatchObject({
      estado: "choque",
      choque: "La cambiaste a mano después de la propuesta: la fase se queda.",
    });
    expect(itemDe(planDeAplicacion(conFase("b", (f) => ({ ...f, status: "IN_PROGRESS" })), v1([cambio])), cambio.clave)).toMatchObject({
      estado: "choque",
      choque: "La fase ya arrancó: se queda.",
    });
    // Sin el estado de la fase leído (una pantalla de antes), no se sabe: choca.
    const sinEstado = conFase("b", (f) => {
      const g = { ...f };
      delete g.status;
      return g;
    });
    expect(itemDe(planDeAplicacion(sinEstado, v1([cambio])), cambio.clave).estado).toBe("choque");
  });

  it("⛔ con TODO protegido, quitarla no haría nada: choca; vacía o toda pendiente, se va entera", () => {
    const soloProtegidas = conFase("b", (f) => ({ ...f, tareas: [B3] }));
    expect(itemDe(planDeAplicacion(soloProtegidas, v1([seVaLaFase("b", soloProtegidas)])), claveDeFaseQueSeVa("b"))).toMatchObject({
      estado: "choque",
      choque: "Todas sus tareas tienen avance o las escribiste a mano: la fase se queda.",
    });
    const plan = planDeAplicacion(VIVO, v1([seVaLaFase("c")]));
    expect(plan.escrituras.fasesQueSeVan).toEqual([{ id: "c", borrar: ["c1", "c2"], queda: false }]);
    expect(plan.escrituras.orden.map((l) => (l.tipo === "existente" ? l.id : l.clave))).toEqual(["a", "b"]);
  });

  it("⭐ una mudanza que sale de la fase con su destino desmarcado: la tarea se queda en la fase, la fase se queda y no hay 409", () => {
    /* Si el rescate se calculara antes de cerrar la mudanza (dándola por hecha), la tarea no se borraría
       ni se mudaría, la fase se borraría con ella adentro y el `none` daría 409 para siempre. La
       edición que la pone en rojo: calcular lo que sale con TODAS las mudanzas, marcadas o no. */
    const sale = cambia(B1, "b", { fase: PILOTO.clave });
    const plan = planDeAplicacion(VIVO, v1([PILOTO, sale, seVaLaFase("b")]), [PILOTO.clave]);
    expect(itemDe(plan, sale.clave)).toMatchObject({ estado: "excluido", dependeDe: PILOTO.clave });
    const it = itemDe(plan, claveDeFaseQueSeVa("b"));
    expect(it.estado).toBe("aplica");
    expect(it.rescate, "la tarea que no se mudó se borraría con su fase").toContain("b1");
    expect(plan.escrituras.fasesQueSeVan).toEqual([{ id: "b", borrar: ["b2"], queda: true }]);
    expect(plan.escrituras.tareas.cambian).toEqual([]);
  });

  it("⭐ el defensivo ahoga lo que es de la fase que se va, pero no una mudanza que SALE de ella", () => {
    /* La edición que la pone en rojo: ahogar toda mudanza de una tarea de la fase (la que sale se
       borraría con la fase en vez de mudarse), o dejar un cambio de un campo de la fase que se quita. */
    const sale = cambia(B1, "b", { fase: "c", weekIndex: 0 });
    const renombre = cambia(B2, "b", { title: "Definir pipeline de ventas" });
    const campo: CambioFaseCambia = { tipo: "fase-cambia", clave: "fase:b:name", faseId: "b", fase: "Diseño", campo: "name", desde: "Diseño", a: "Diseño funcional" };
    const cambios = [seVaLaFase("b"), campo, sale, renombre, nueva("t:en-b", "b", "Otra", 0, { porChat: true })];
    const plan = planDeAplicacion(VIVO, v1(cambios));
    expect(itemDe(plan, sale.clave).estado).toBe("aplica");
    for (const clave of [campo.clave, renombre.clave, "t:en-b"]) {
      expect(itemDe(plan, clave), clave).toMatchObject({ estado: "choque", choque: "Su fase se quita con el cambio 1." });
    }
    expect(plan.escrituras.fasesQueSeVan).toEqual([{ id: "b", borrar: ["b2"], queda: true }]);
    expect(plan.escrituras.tareas.cambian).toEqual([{ id: "b1", desdeFase: "b", campos: { weekIndex: 0 }, aFase: { tipo: "existente", id: "c" } }]);
  });
});

describe("5 · el cierre de E2c no mira lo del chat", () => {
  it("⭐ lo del chat no entra al cierre: con la fase desfasada, las de la IA esperan y las del chat se aplican", () => {
    /* D4. La edición que la pone en rojo: pasar lo `porChat` por el cierre (no se armó para ninguna
       forma: quedaría esperando un recálculo que nunca lo trae). */
    const b = v1([DUR_C, nueva("t:ia", "c", "Pruebas de aceptación", 3), nueva("t:chat", "c", "Pruebas de carga", 0, { porChat: true })]);
    const plan = planDeAplicacion(VIVO, b, [DUR_C.clave]);
    expect(itemDe(plan, "t:ia")).toMatchObject({ estado: "excluido", recalcula: true });
    expect(itemDe(plan, "t:chat").estado).toBe("aplica");
    expect(plan.desfasadas.map((d) => d.fase)).toEqual(["c"]);
  });

  it("⭐ D9 · la forma que le dio el chat evita el desfase, y desmarcar su cambio vuelve a la armada sin recalcular", () => {
    /* Las tareas de «Pruebas» se armaron para 3 semanas; el chat la llevó a 4 (su cambio) y ajustó la
       forma aparte. Marcado o desmarcado, sus tareas valen. La edición que la pone en rojo: pisar la
       armada (desmarcar el cambio del chat la dejaría desfasada) o no mirar la ajustada. */
    const delChat = { ...DUR_C, porChat: true as const };
    const b = v1([delChat, nueva("t:ia", "c", "Pruebas de aceptación", 3)], {
      tareasArmadasPara: { ...ARMADAS, c: { nombre: "Pruebas", semanas: 3, sesiones: null, semanaCero: false } },
      ajustadasPorElChat: { c: { nombre: "Pruebas", semanas: 4, sesiones: null, semanaCero: false } },
    });
    const marcado = planDeAplicacion(VIVO, b);
    expect(itemDe(marcado, "t:ia").estado).toBe("aplica");
    expect(marcado.desfasadas).toEqual([]);
    const desmarcado = planDeAplicacion(VIVO, b, [delChat.clave]);
    expect(itemDe(desmarcado, "t:ia").estado).toBe("aplica");
    expect(desmarcado.desfasadas).toEqual([]);
    // Sin la ajustada, marcarlo la desfasa (la armada dice 3): la prueba de que la ajustada decide.
    const sinAjustada = planDeAplicacion(VIVO, { ...b, ajustadasPorElChat: undefined });
    expect(itemDe(sinAjustada, "t:ia")).toMatchObject({ estado: "excluido", recalcula: true });
  });

  it("una nueva del chat en una fase nueva sigue a esa fase: desmarcada, heredada; en choque, choca", () => {
    const enPiloto = nueva("t:chat", PILOTO.clave, "Medir el piloto", 0, { porChat: true });
    expect(itemDe(planDeAplicacion(VIVO, v1([PILOTO, enPiloto]), [PILOTO.clave]), "t:chat")).toMatchObject({
      estado: "excluido",
      dependeDe: PILOTO.clave,
    });
    const repetida: CambioFaseNueva = { ...PILOTO, fase: { ...PILOTO.fase, name: "Pruebas" } };
    expect(itemDe(planDeAplicacion(VIVO, v1([repetida, enPiloto])), "t:chat").estado).toBe("choque");
  });
});

describe("6 · la huella de lo de antes no cambia", () => {
  it("⛔ los fixtures de E2a/E2c dan la MISMA huella que antes de E3 (una pestaña abierta durante el deploy sigue aplicando)", () => {
    /* Los valores se tomaron con el código de E2c (antes de E3 P1). La edición que la pone en rojo:
       meter en la tupla de la huella algo nuevo para TODOS los cambios (el rescate vacío, `porChat`)
       en vez de solo cuando existe. */
    const B = v1([
      DUR_C,
      PILOTO,
      seVa(B1, "b"),
      seVa(B2, "b"),
      nueva("t:b-1", "b", "Mapear procesos de venta", 0),
      seVa(tarea("c1", "Probar flujos", 2), "c"),
      nueva("t:c-1", "c", "Pruebas de aceptación", 3),
      nueva("t:p-1", PILOTO.clave, "Piloto con un equipo", 0),
      nueva("t:p-2", PILOTO.clave, "Medir el piloto", 1),
    ]);
    // El vivo de E2a (sin «Pruebas con usuarios», con el arranque humano pendiente).
    const deAntes: Vivo = {
      ancla: "2026-10-05",
      fases: [
        fase("a", "Kick-off", 1, [tarea("a1", "Reunión de arranque", 0, { type: "SESSION", source: "HUMAN" })]),
        fase("b", "Diseño", 2, [B1, B2, B3]),
        fase("c", "Pruebas", 3, [tarea("c1", "Probar flujos", 2)]),
      ],
    };
    const huella = (sin: string[]) => planDeAplicacion(deAntes, B, sin, { tareas: "listas" }).huella;
    expect(huella([])).toBe("0a07a866a23796");
    expect(huella([DUR_C.clave])).toBe("17069a204d3e48");
    expect(huella([PILOTO.clave])).toBe("0ca6d159b04e38");
    expect(huella(["tarea:b1:se-va"])).toBe("1f1b2fdff7c62b");
    const vieja = {
      anchorStartDate: "2026-10-05T00:00:00.000Z",
      phases: [
        { id: "a", name: "Kick-off", durationWeeks: 1 },
        { id: "b", name: "Diseño funcional", durationWeeks: 2 },
        { id: "c", name: "Pruebas", durationWeeks: 4 },
        { name: "Piloto", durationWeeks: 2 },
      ],
    };
    /* ⚠ REESCRITA en E4 (2026-09), con esta razón: leía el formato viejo guardado (el lector lo convertía
       contra una foto). Desde E4 no se lee; la misma conversión la hacen los productores antes de guardar,
       y tiene que seguir dando la misma huella. */
    expect(planDeAplicacion(deAntes, convertirPropuestaDeFases(vieja, deAntes), [], { tareas: "listas" }).huella).toBe("038d4cba1aac5c");
  });

  it("el rescate SÍ entra a la huella: otra tarea protegida en el medio es otra lista", () => {
    const b = v1([seVaLaFase("b")]);
    const conOtraHecha = conTarea("b1", { status: "DONE" });
    expect(planDeAplicacion(conOtraHecha, b).huella).not.toBe(planDeAplicacion(VIVO, b).huella);
  });
});

describe("7 · lo que se escribe, lo que se ve y lo que se confirma", () => {
  it("⭐ las escrituras: una que cambia lleva solo lo que difiere de lo vivo; una mudanza, siempre su semana", () => {
    /* La edición que la pone en rojo: escribir todo el `a` (pisaría con lo mismo y marcaría MODIFIED
       sin razón), o mudar sin semana (el escritor no sabría dónde ponerla). */
    const b = v1([
      PILOTO,
      cambia(C2, "c", { title: "Pruebas con usuarios", weekIndex: 2 }),
      cambia(B2, "b", { fase: PILOTO.clave }),
      cambia(C1, "c", { party: "CLIENTE", type: "SESSION" }),
    ]);
    const plan = planDeAplicacion(VIVO, b);
    expect(plan.escrituras.tareas.cambian).toEqual([
      { id: "b2", desdeFase: "b", campos: { weekIndex: 1 }, aFase: { tipo: "nueva", clave: PILOTO.clave } },
      { id: "c1", desdeFase: "c", campos: { party: "CLIENTE", type: "SESSION" }, aFase: null },
      { id: "c2", desdeFase: "c", campos: { weekIndex: 2 }, aFase: null },
    ]);
    const nuevas = planDeAplicacion(VIVO, v1([PILOTO, { ...PILOTO, clave: "n:chat", porChat: true, fase: { ...PILOTO.fase, name: "Soporte" } }]));
    expect(nuevas.escrituras.nuevas.map((n) => [n.clave, n.porChat ?? false])).toEqual([
      [PILOTO.clave, false],
      ["n:chat", true],
    ]);
  });

  it("⭐ la proyección: la mudada sale de su fase y entra al destino detrás de las vivas; la que cambia se ve cambiada", () => {
    const b = v1([
      PILOTO,
      nueva("t:p", PILOTO.clave, "Medir el piloto", 1, { porChat: true }),
      cambia(B2, "b", { fase: PILOTO.clave, weekIndex: 0 }),
      cambia(C2, "c", { title: "Pruebas clave" }),
      seVaLaFase("a", conFase("a", (f) => f)),
    ]);
    const p = proyectar(VIVO, b);
    const porClave = new Map(p.fases.map((f) => [f.clave, f]));
    expect(porClave.get("b")!.tareas.map((t) => t.id)).toEqual(["b1", "b3"]);
    expect(porClave.get(PILOTO.clave)!.tareas.map((t) => [t.clave, t.llega ?? false, t.cambia ?? false])).toEqual([
      ["b2", true, true],
      ["t:p", false, false],
    ]);
    expect(porClave.get("c")!.tareas.find((t) => t.id === "c2")).toMatchObject({ title: "Pruebas clave", cambia: true });
    expect(porClave.get("c")!.marca?.etiquetas).toContain("1 tarea cambia");
    expect(porClave.get("b")!.marca?.etiquetas).toContain("1 tarea cambia");
    // «Kick-off» se iba, pero su única tarea está hecha: todo protegido, choca y se queda como está.
    expect(porClave.get("a")!.tareas.map((t) => t.id)).toEqual(["a1"]);
  });

  it("⭐ la proyección de la fase que se va: desaparece, o se queda solo con lo rescatado y lo dice", () => {
    const entera = proyectar(VIVO, v1([seVaLaFase("c")]));
    expect(entera.fases.map((f) => f.clave)).toEqual(["a", "b"]);
    const conResto = proyectar(VIVO, v1([seVaLaFase("b")]));
    const b = conResto.fases.find((f) => f.clave === "b")!;
    expect(b.tareas.map((t) => t.id)).toEqual(["b3"]);
    expect(b.marca?.etiquetas).toContain("se queda con 1 tarea");
  });

  it("⭐ la barra: «~» cambia en su fase, «→» llega al grupo del DESTINO, con `ref` y lo que le cambia", () => {
    /* La edición que la pone en rojo: agrupar la mudanza en su fase de origen (el CSE la buscaría donde
       ya no va a estar), o perder el `ref` con que el chat la nombra. */
    const b = v1([
      PILOTO,
      cambia(B2, "b", { fase: PILOTO.clave }),
      cambia(C2, "c", { title: "Pruebas clave", party: "CLIENTE" }),
      nueva("t:p", PILOTO.clave, "Medir el piloto", 1, { porChat: true }),
    ]);
    const r = resumir(VIVO, b);
    expect(r.grupos.map((g) => [g.numero, g.fase, g.cambian, g.nuevas])).toEqual([
      [2, PILOTO.clave, 1, 1],
      [3, "c", 1, 0],
    ]);
    const [llega, masPiloto] = r.grupos[0].tareas;
    /* ⚠ ACTUALIZADA en la revisión de E3 (#22), con esta razón: en el grupo de su destino, «pasa a «Piloto», S2»
       repetía el nombre del grupo y la semana del renglón, y no decía de qué fase venía. Ahora dice el origen. */
    expect([llega.signo, llega.ref, llega.titulo, llega.semana, llega.cambio]).toEqual(["→", "b2", "Definir pipeline", 2, "viene de «Diseño»"]);
    expect([masPiloto.signo, masPiloto.ref]).toEqual(["+", "t:p"]);
    const renombrada = r.grupos[1].tareas[0];
    expect([renombrada.signo, renombrada.ref, renombrada.cambio]).toEqual(["~", "c2", "renombrada a «Pruebas clave» · la hace el cliente"]);
    expect(tituloDeLaBarra(r)).toBe("La IA propone 1 cambio de fases y 3 de tareas");
  });

  it("⛔ revisión de E3 (#22) · la mudanza en el grupo de su destino dice DE DÓNDE viene, y la semana solo si cambia", () => {
    /* Las ediciones que la ponen en rojo: volver a «pasa a «Pruebas», S2» en el grupo de «Pruebas» (repite el
       grupo y la semana del renglón, y el origen no aparece en ningún lado), o decir la semana aunque no cambie. */
    const r = resumir(
      VIVO,
      v1([cambia(B2, "b", { fase: "c", weekIndex: 1 }), cambia(B1, "b", { fase: "c", weekIndex: 2 })]),
    );
    const enPruebas = r.grupos.find((g) => g.fase === "c")!;
    expect(enPruebas.tareas.map((t) => [t.signo, t.titulo, t.semana, t.cambio])).toEqual([
      ["→", "Definir pipeline", 2, "viene de «Diseño»"],
      ["→", "Mapear procesos", 3, "viene de «Diseño» · pasa a S3"],
    ]);
    for (const t of enPruebas.tareas) expect(t.cambio, "el renglón repite su grupo").not.toContain("«Pruebas»");
    // Lo demás que le cambia sigue después («renombrada», el dueño).
    const conMas = resumir(VIVO, v1([cambia(B2, "b", { fase: "c", title: "Pipeline", party: "CLIENTE" })]));
    expect(conMas.grupos[0].tareas[0].cambio).toBe("viene de «Diseño» · renombrada a «Pipeline» · la hace el cliente");
  });

  it("⭐ la fase que se va en la barra: su título y la nota de lo que se queda", () => {
    const r = resumir(VIVO, v1([seVaLaFase("b")]));
    expect(r.items).toEqual([
      expect.objectContaining({ numero: 1, titulo: "Se quita la fase «Diseño»", nota: "Se queda con 1 tarea con avance, cargada o editada a mano." }),
    ]);
    expect(resumir(VIVO, v1([seVaLaFase("c")])).items[0].nota).toBeUndefined();
  });

  it("⭐ la confirmación con fases que se van y las tareas que se van con ellas, sin decir «de la IA»", () => {
    /* La edición que la pone en rojo: no contar las que se van con su fase (se confirmaría sin decir que
       se borran), o decir «pendientes de la IA» de lo que dictó el chat. */
    const entera = resumir(VIVO, v1([seVaLaFase("c")]));
    expect(entera.borraAlgo).toBe(true);
    expect(entera.tareas).toMatchObject({ fasesSeVan: [{ nombre: "Pruebas", borradas: 2, queda: false }], conLaFase: 2 });
    expect(pideConfirmacion(entera)).toBe(true);
    expect(resumenDeLaConfirmacion(entera)).toBe("Se aplica el cambio marcado de una sola vez: se quita la fase «Pruebas» con sus 2 tareas pendientes.");
    expect(textoDeLaConfirmacion(entera)).toBe(
      "Solo se quitan tareas pendientes: lo que tiene avance o se cargó a mano no se toca. Después puedes seguir editando el cronograma a mano.",
    );
    const conResto = resumir(VIVO, v1([seVaLaFase("b"), seVaLaFase("c")]));
    expect(resumenDeLaConfirmacion(conResto)).toBe(
      "Se aplican los 2 cambios marcados de una sola vez: se quita la fase «Pruebas» con sus 2 tareas pendientes y de «Diseño» se quitan 2 tareas pendientes.",
    );
    const dosEnteras = resumir(conFase("b", (f) => ({ ...f, tareas: [B1] })), v1([seVaLaFase("b", conFase("b", (f) => ({ ...f, tareas: [B1] }))), seVaLaFase("c")]));
    expect(resumenDeLaConfirmacion(dosEnteras)).toContain("se quitan 2 fases con 3 tareas pendientes");
    // Una del chat que se va: tampoco es «de la IA». Y las que cambian se cuentan.
    const delChat = resumir(VIVO, v1([seVa(C1, "c", { porChat: true }), cambia(C2, "c", { weekIndex: 0 })]));
    expect(textoDeLaConfirmacion(delChat)).toMatch(/^Solo se quitan tareas pendientes: /);
    expect(resumenDeLaConfirmacion(delChat)).toContain("cambia 1 tarea");
    // Lo de la IA sigue diciendo lo de siempre.
    expect(textoDeLaConfirmacion(resumir(VIVO, v1([DUR_C, seVa(C1, "c")])))).toMatch(/^Solo se quitan tareas pendientes de la IA:/);
  });
});

describe("8 · el permiso", () => {
  it("⭐ `necesitaPermisoDeIa`: las tareas y las fases que se van de la IA sí; lo del chat y la estructura, no", () => {
    /* D4. La edición que la pone en rojo: pedirle la vara de la IA a lo que dictó el chat (el CSE no
       podría aplicar lo que hoy el chat escribe directo), o no pedírsela a una retocada. */
    expect(necesitaPermisoDeIa(nueva("t:1", "c", "X", 0))).toBe(true);
    expect(necesitaPermisoDeIa(nueva("t:1", "c", "X", 0, { retocada: true }))).toBe(true);
    expect(necesitaPermisoDeIa(seVa(C1, "c"))).toBe(true);
    expect(necesitaPermisoDeIa({ ...seVaLaFase("c"), porChat: undefined })).toBe(true);
    expect(necesitaPermisoDeIa(nueva("t:1", "c", "X", 0, { porChat: true }))).toBe(false);
    expect(necesitaPermisoDeIa(seVa(C1, "c", { porChat: true }))).toBe(false);
    expect(necesitaPermisoDeIa(cambia(C2, "c", { title: "X" }))).toBe(false);
    expect(necesitaPermisoDeIa(seVaLaFase("c"))).toBe(false);
    expect(necesitaPermisoDeIa(DUR_C)).toBe(false);
  });

  it("⛔ `traeCambiosDeTareas` (el permiso de la ruta) cuenta el crudo sin `porChat`; un `tarea-*` desconocido cuenta siempre", () => {
    const crudo = (cambios: unknown[]) => ({ formato: FORMATO_BORRADOR, cambios });
    expect(traeCambiosDeTareas(crudo([{ tipo: "tarea-nueva" }]))).toBe(true);
    expect(traeCambiosDeTareas(crudo([{ tipo: "fase-se-va" }]))).toBe(true);
    expect(traeCambiosDeTareas(crudo([{ tipo: "tarea-cambia", porChat: true }, { tipo: "fase-se-va", porChat: true }]))).toBe(false);
    expect(traeCambiosDeTareas(crudo([{ tipo: "tarea-se-muda", porChat: true }])), "un tipo que no conoce").toBe(true);
    expect(traeCambiosDeTareas(crudo([{ tipo: "fase-cambia" }]))).toBe(false);
  });
});
