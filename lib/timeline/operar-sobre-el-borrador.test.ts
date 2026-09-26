/**
 * lib/timeline/operar-sobre-el-borrador.test.ts — lo que pide el chat, escrito en la PROPUESTA (E3 P2).
 *
 * Correr: `npx vitest run lib/timeline/operar-sobre-el-borrador.test.ts --project unit`.
 *
 * Lo que cuida (§3.2 de la especificación de E3):
 *   1. cada operación del vocabulario se traduce a cambios del borrador por clave, sobre la propuesta
 *      como se ve, y las casillas son lo desmarcado;
 *   2. los `desde` no se recalculan contra lo vivo: solo se re-ancla el campo que el chat escribe (D8);
 *   3. lo editado a mano después, en otro campo, gana (sale del cambio, con aviso);
 *   4. «déjalo como está hoy» quita lo del chat y deja fuera lo de la IA;
 *   5. quitar una fase conserva lo que SALE de ella; quitar una tarea reusa su clave (nunca dos cambios);
 *   6. quitar o insertar semanas deja `conCambio` (D17) y la forma ajustada (D9);
 *   7. todo o nada, y `fase.mover` da el orden pedido.
 * Cada `it` nombra la edición que lo pone en rojo.
 */
import { describe, expect, it } from "vitest";
import {
  claveDeTareaQueCambia,
  claveDeTareaQueSeVa,
  FORMATO_BORRADOR,
  fotoDeTarea,
  planDeAplicacion,
  proyectar,
  type Borrador,
  type Cambio,
  type CambioFaseCambia,
  type CambioFaseNueva,
  type CambioTareaCambia,
  type CambioTareaNueva,
  type CambioTareaSeVa,
  type ContenidoDeTareaNueva,
  type FaseViva,
  type TareaDelVivo,
  type Vivo,
} from "./borrador";
import { motivoDeTareaProtegida, type Operacion } from "./operaciones";
import {
  operarSobreElBorrador,
  RECHAZO_CLAVE_NO_ESTA,
  RECHAZO_FASE_NO_ESTA,
  RECHAZO_FASE_NUEVA_FUERA,
  RECHAZO_FASE_SE_QUITA,
  RECHAZO_TAREA_NUEVA_FUERA,
  RECHAZO_TAREA_REPETIDA,
  RECHAZO_TAREA_SE_QUITA,
  rechazoNombreRepetido,
  type OperacionSobreLaPropuesta,
} from "./operar-sobre-el-borrador";

// ── El cronograma de hoy: Kick-off (arrancó) · Diseño (2 sem) · Pruebas (3 sem) ─────────────────────

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
    fase("a", "Kick-off", 1, [A1], { status: "IN_PROGRESS" }),
    fase("b", "Diseño", 2, [B1, B2, B3]),
    fase("c", "Pruebas", 3, [C1, C2]),
  ],
};
const conFase = (id: string, cambio: Partial<FaseViva>, vivo: Vivo = VIVO): Vivo => ({
  ...vivo,
  fases: vivo.fases.map((f) => (f.id === id ? { ...f, ...cambio } : f)),
});
const conTarea = (id: string, cambio: Partial<TareaDelVivo>, vivo: Vivo = VIVO): Vivo => ({
  ...vivo,
  fases: vivo.fases.map((f) => ({ ...f, tareas: f.tareas?.map((t) => (t.id === id ? { ...t, ...cambio } : t)) })),
});

// ── La propuesta de la IA: «Pruebas» a 4 semanas, la fase nueva «Piloto» y tareas en tres fases ───────

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
const DUR_C: CambioFaseCambia = {
  tipo: "fase-cambia",
  clave: "fase:c:durationWeeks",
  faseId: "c",
  fase: "Pruebas",
  campo: "durationWeeks",
  desde: 3,
  a: 4,
  motivo: "En la reunión se pidió una semana más de pruebas.",
};
const PILOTO: CambioFaseNueva = {
  tipo: "fase-nueva",
  clave: "n:piloto",
  fase: { name: "Piloto", durationWeeks: 2, startWeek: null, sessionCount: null, notes: null, activityType: null },
  despuesDe: "c",
};
const SE_VA_B1: CambioTareaSeVa = { tipo: "tarea-se-va", clave: claveDeTareaQueSeVa("b1"), tareaId: "b1", faseId: "b", desde: fotoDeTarea(B1) };
const NUEVA_B: CambioTareaNueva = { tipo: "tarea-nueva", clave: "t:b-1", fase: "b", tarea: contenido("Mapear procesos de venta", 0) };
const NUEVA_C: CambioTareaNueva = {
  tipo: "tarea-nueva",
  clave: "t:c-1",
  fase: "c",
  tarea: contenido("Pruebas de aceptación", 3, {
    needsValidation: true,
    motivoPorValidar: "Sin fecha acordada",
    fuga: { campo: "titulo", motivo: "Nombra a alguien del equipo" },
  }),
};
const NUEVA_P: CambioTareaNueva = { tipo: "tarea-nueva", clave: "t:p-1", fase: "n:piloto", tarea: contenido("Piloto con 5 usuarios", 0) };
const BORRADOR: Borrador = {
  formato: FORMATO_BORRADOR,
  version: 3,
  origen: "contexto",
  observaciones: [],
  cambios: [DUR_C, PILOTO, SE_VA_B1, NUEVA_B, NUEVA_C, NUEVA_P],
  pedido: "regenerar",
  tareas: { corrida: "run-2", listas: true },
  tareasArmadasPara: {
    b: { nombre: "Diseño", semanas: 2 },
    c: { nombre: "Pruebas", semanas: 4 },
    "n:piloto": { nombre: "Piloto", semanas: 2 },
  },
};

let n = 0;
const nuevaClave = () => `k${String(++n).padStart(8, "0")}`;
const operar = (
  operaciones: OperacionSobreLaPropuesta[],
  o: { vivo?: Vivo; borrador?: Borrador; excluidos?: string[] } = {},
) =>
  operarSobreElBorrador({
    vivo: o.vivo ?? VIVO,
    borrador: o.borrador ?? BORRADOR,
    excluidos: o.excluidos ?? [],
    operaciones,
    nuevaClave,
  });
type Resultado = ReturnType<typeof operar>;
const cambioDe = (r: Resultado, clave: string): Cambio | undefined => r.borrador.cambios.find((c) => c.clave === clave);
const conClave = (r: Resultado, clave: string) => r.borrador.cambios.filter((c) => c.clave === clave);
const planDe = (r: Resultado, vivo: Vivo = VIVO) => planDeAplicacion(vivo, r.borrador, r.excluidos);
const estadoDe = (r: Resultado, clave: string, vivo: Vivo = VIVO) => planDe(r, vivo).items.find((it) => it.cambio.clave === clave);
const ordenDe = (r: Resultado, vivo: Vivo = VIVO) => proyectar(vivo, r.borrador, r.excluidos).fases.map((f) => f.clave);
const sinRechazos = (r: Resultado) => expect(r.rechazadas, JSON.stringify(r.rechazadas)).toEqual([]);

describe("1 · los campos de una fase: D8 (re-anclar solo lo que se escribe) y D9 (la forma ajustada)", () => {
  it("⭐ sobre un cambio de la IA: `a` nuevo, del chat, y la forma ajustada evita recalcular sus tareas", () => {
    /* La edición que la pone en rojo: crear un segundo cambio del mismo campo, no marcarlo del chat, o no
       ajustar la forma (sus tareas quedarían desfasadas esperando un recálculo). */
    const r = operar([{ op: "fase.duracion", phaseId: "c", semanas: 5 }]);
    sinRechazos(r);
    expect(conClave(r, DUR_C.clave)).toHaveLength(1);
    expect(cambioDe(r, DUR_C.clave)).toEqual({ ...DUR_C, motivo: undefined, a: 5, porChat: true });
    expect(r.borrador.ajustadasPorElChat).toEqual({ c: { nombre: "Pruebas", semanas: 5, sesiones: null } });
    const plan = planDe(r);
    expect(plan.desfasadas, "la fase quedó esperando un recálculo").toEqual([]);
    expect(estadoDe(r, NUEVA_C.clave)?.estado).toBe("aplica");
    expect(r.borrador.tareasArmadasPara, "pisó la forma armada").toEqual(BORRADOR.tareasArmadasPara);
    expect(r.cambio).toBe(true);
  });

  it("sin cambio previo nace uno del chat con el `desde` de lo vivo; en una fase nueva se edita su contenido", () => {
    const r = operar([
      { op: "fase.duracion", phaseId: "b", semanas: 3 },
      { op: "fase.renombrar", phaseId: "n:piloto", nombre: "Piloto controlado" },
    ]);
    sinRechazos(r);
    expect(cambioDe(r, "fase:b:durationWeeks")).toEqual({
      tipo: "fase-cambia",
      clave: "fase:b:durationWeeks",
      faseId: "b",
      fase: "Diseño",
      campo: "durationWeeks",
      desde: 2,
      a: 3,
      porChat: true,
    });
    expect((cambioDe(r, "n:piloto") as CambioFaseNueva).fase.name).toBe("Piloto controlado");
    expect(r.borrador.ajustadasPorElChat).toEqual({
      b: { nombre: "Diseño", semanas: 3, sesiones: null },
      "n:piloto": { nombre: "Piloto controlado", semanas: 2, sesiones: null },
    });
    expect(planDe(r).desfasadas).toEqual([]);
  });

  it("⛔ D8: un campo en choque o que ya estaba se re-ancla a lo vivo; SOLO ese campo", () => {
    /* La edición que la pone en rojo: dejar el `desde` viejo (el cambio seguiría chocando y el chat habría
       dicho que lo cambió) o recalcular el cambio entero contra lo vivo. */
    const aMano = conFase("c", { durationWeeks: 5 }); // la editaron a mano: choca
    expect(planDeAplicacion(aMano, BORRADOR).items.find((it) => it.cambio.clave === DUR_C.clave)?.estado).toBe("choque");
    const r = operar([{ op: "fase.duracion", phaseId: "c", semanas: 6 }], { vivo: aMano });
    sinRechazos(r);
    expect(cambioDe(r, DUR_C.clave)).toMatchObject({ desde: 5, a: 6, porChat: true });
    expect(estadoDe(r, DUR_C.clave, aMano)?.estado).toBe("aplica");

    const yaEsta = conFase("c", { durationWeeks: 4 });
    const r2 = operar([{ op: "fase.duracion", phaseId: "c", semanas: 6 }], { vivo: yaEsta });
    expect(cambioDe(r2, DUR_C.clave)).toMatchObject({ desde: 4, a: 6 });
    expect(estadoDe(r2, DUR_C.clave, yaEsta)?.estado).toBe("aplica");
  });

  it("⛔ «déjalo como está hoy»: lo de la IA queda fuera (se puede recuperar) y lo del chat se quita", () => {
    /* La edición que la pone en rojo: borrar el cambio de la IA (no se podría recuperar) o dejar el del
       chat con `a` igual a lo vivo (un cambio que no cambia nada). */
    const r = operar([{ op: "fase.duracion", phaseId: "c", semanas: 3 }]);
    sinRechazos(r);
    expect(cambioDe(r, DUR_C.clave), "borró el cambio de la IA").toEqual(DUR_C);
    expect(r.excluidos).toEqual([DUR_C.clave]);
    // Sus tareas se acomodan a las 3 semanas (D9), sin recalcular.
    expect(planDe(r).desfasadas).toEqual([]);

    const delChat = operar([
      { op: "fase.duracion", phaseId: "b", semanas: 3 },
      { op: "fase.duracion", phaseId: "b", semanas: 2 },
    ]);
    sinRechazos(delChat);
    expect(cambioDe(delChat, "fase:b:durationWeeks"), "quedó un cambio del chat que no cambia nada").toBeUndefined();
    expect(delChat.excluidos).toEqual([]);
    expect(delChat.borrador.ajustadasPorElChat, "la forma volvió a la armada").toBeUndefined();
    expect(delChat.cambio).toBe(false);
  });

  it("renombrar a un nombre que ya tiene otra fase se rechaza; el tipo y el arranque relativo se escriben", () => {
    expect(operar([{ op: "fase.renombrar", phaseId: "c", nombre: "piloto" }]).rechazadas).toEqual([
      { indice: 0, motivo: rechazoNombreRepetido("piloto") },
    ]);
    const r = operar([
      { op: "fase.tipo", phaseId: "c", tipo: "ADOPCION" },
      { op: "fase.arranque-relativo", phaseId: "c", semana: 2 },
    ]);
    sinRechazos(r);
    expect(cambioDe(r, "fase:c:activityType")).toMatchObject({ desde: null, a: "ADOPCION", porChat: true });
    expect(cambioDe(r, "fase:c:startWeek")).toMatchObject({ desde: null, a: 2, porChat: true });
  });
});

describe("1b · E4 P1: la nota de una fase (`fase.nota`) en la propuesta", () => {
  it("⭐ una viva: nace un cambio del chat con el `desde` de lo vivo, SIN tocar la forma; en una nueva, su contenido", () => {
    /* La edición que la pone en rojo: ajustar la forma (la nota no mueve tareas: `ajustadasPorElChat`
       no cambia) o validar distinto que el ejecutor del cronograma (una `nota` ausente se leería null). */
    const vivo = conFase("c", { notes: "Probamos los flujos contigo." });
    const r = operar(
      [
        { op: "fase.nota", phaseId: "c", nota: "  Probamos los flujos y ajustamos.  " },
        { op: "fase.nota", phaseId: "n:piloto", nota: "Con 5 usuarios." },
      ],
      { vivo },
    );
    sinRechazos(r);
    expect(cambioDe(r, "fase:c:notes")).toEqual({
      tipo: "fase-cambia",
      clave: "fase:c:notes",
      faseId: "c",
      fase: "Pruebas",
      campo: "notes",
      desde: "Probamos los flujos contigo.",
      a: "Probamos los flujos y ajustamos.",
      porChat: true,
    });
    expect((cambioDe(r, "n:piloto") as CambioFaseNueva).fase.notes).toBe("Con 5 usuarios.");
    expect(r.borrador.ajustadasPorElChat, "la nota tocó la forma de la fase").toBeUndefined();
    // Aunque la forma que se ve no sea la armada (la duración de la IA quedó fuera), la nota no la ajusta.
    const fuera = operar([{ op: "fase.nota", phaseId: "c", nota: "Otra." }], { vivo, excluidos: [DUR_C.clave] });
    sinRechazos(fuera);
    expect(fuera.borrador.ajustadasPorElChat, "la nota ajustó la forma de la fase").toBeUndefined();
    expect(operar([{ op: "fase.nota", phaseId: "c" } as unknown as Operacion], { vivo }).rechazadas).toEqual([
      { indice: 0, motivo: "falta `nota`: el texto completo, o null para quitarla" },
    ]);
  });

  it("sobre el `ref` de un `fase.crear` del lote; pedir la nota de hoy no deja cambio", () => {
    const r = operar([
      { op: "fase.crear", nombre: "Cierre", semanas: 1, ref: "cierre" },
      { op: "fase.nota", phaseId: "cierre", nota: "Entregamos y cerramos." },
    ]);
    sinRechazos(r);
    const nueva = r.borrador.cambios.find((c): c is CambioFaseNueva => c.tipo === "fase-nueva" && c.fase.name === "Cierre");
    expect(nueva?.fase.notes).toBe("Entregamos y cerramos.");
    const igual = operar([{ op: "fase.nota", phaseId: "b", nota: null }]);
    sinRechazos(igual);
    expect(igual.cambio).toBe(false);
  });
});

describe("2 · crear y mover fases", () => {
  it("`fase.crear` nace del chat en el lugar pedido, y su `ref` sirve en el mismo lote", () => {
    const r = operar([
      { op: "fase.crear", nombre: "Cierre", semanas: 1, posicion: 1, ref: "cierre" },
      { op: "tarea.crear", phaseId: "cierre", titulo: "Acta de cierre", semana: 0 },
    ]);
    sinRechazos(r);
    const nueva = r.borrador.cambios.find((c): c is CambioFaseNueva => c.tipo === "fase-nueva" && c.fase.name === "Cierre")!;
    expect(nueva).toMatchObject({ despuesDe: "a", porChat: true });
    expect(ordenDe(r)).toEqual(["a", nueva.clave, "b", "c", "n:piloto"]);
    const tareaNueva = r.borrador.cambios.find((c): c is CambioTareaNueva => c.tipo === "tarea-nueva" && c.tarea.title === "Acta de cierre")!;
    expect(tareaNueva).toMatchObject({ fase: nueva.clave, porChat: true, tarea: { needsValidation: false, fuga: null } });
    expect(estadoDe(r, tareaNueva.clave)?.estado).toBe("aplica");
    expect(operar([{ op: "fase.crear", nombre: "Diseño", semanas: 1 }]).rechazadas[0]?.motivo).toBe(rechazoNombreRepetido("Diseño"));
  });

  it("⭐ `fase.mover` deja la propuesta en el orden pedido, con las fases nuevas donde se ven", () => {
    /* La edición que la pone en rojo: no mover el `despuesDe` de las fases nuevas (la fase nueva quedaría
       pegada a la que movió) o no verificar el orden resultante con la proyección. */
    expect(ordenDe(operar([]))).toEqual(["a", "b", "c", "n:piloto"]);
    const r = operar([{ op: "fase.mover", phaseId: "c", posicion: 0 }]);
    sinRechazos(r);
    expect(ordenDe(r)).toEqual(["c", "a", "b", "n:piloto"]);
    expect(cambioDe(r, "orden")).toEqual({ tipo: "orden", clave: "orden", desde: ["a", "b", "c"], a: ["c", "a", "b"], porChat: true });
    expect((cambioDe(r, "n:piloto") as CambioFaseNueva).despuesDe).toBe("b");

    // La fase nueva al principio: el orden de las existentes no cambia, y no nace un cambio de orden.
    const alPrincipio = operar([{ op: "fase.mover", phaseId: "n:piloto", posicion: 0 }]);
    sinRechazos(alPrincipio);
    expect(ordenDe(alPrincipio)).toEqual(["n:piloto", "a", "b", "c"]);
    expect(cambioDe(alPrincipio, "orden")).toBeUndefined();

    // Y de vuelta: el orden de hoy no necesita cambio (el del chat se quita).
    const deVuelta = operar(
      [
        { op: "fase.mover", phaseId: "c", posicion: 0 },
        { op: "fase.mover", phaseId: "c", posicion: 2 },
      ],
    );
    sinRechazos(deVuelta);
    expect(ordenDe(deVuelta)).toEqual(["a", "b", "c", "n:piloto"]);
    expect(cambioDe(deVuelta, "orden")).toBeUndefined();
  });
});

describe("3 · quitar una fase", () => {
  it("⭐ una fase viva: nace su `fase-se-va` del chat; lo de la IA en ella queda fuera y lo que SALE se conserva", () => {
    /* La edición que la pone en rojo: quitar también la mudanza que sale de la fase (esa tarea se borraría
       con ella), o borrar del borrador lo de la IA (no se podría recuperar). */
    const SALE: CambioTareaCambia = {
      tipo: "tarea-cambia",
      clave: claveDeTareaQueCambia("c1"),
      tareaId: "c1",
      faseId: "c",
      desde: fotoDeTarea(C1),
      a: { fase: "b", weekIndex: 1 },
      porChat: true,
    };
    const ENTRA: CambioTareaCambia = {
      tipo: "tarea-cambia",
      clave: claveDeTareaQueCambia("b2"),
      tareaId: "b2",
      faseId: "b",
      desde: fotoDeTarea(B2),
      a: { fase: "c", weekIndex: 0, title: "Definir el pipeline de ventas" },
      porChat: true,
    };
    const borrador = { ...BORRADOR, cambios: [...BORRADOR.cambios, SALE, ENTRA] };
    const r = operar([{ op: "fase.borrar", phaseId: "c" }], { borrador });
    sinRechazos(r);
    expect(cambioDe(r, "fase:c:se-va")).toEqual({
      tipo: "fase-se-va",
      clave: "fase:c:se-va",
      faseId: "c",
      desde: {
        name: "Pruebas",
        durationWeeks: 3,
        startWeek: null,
        sessionCount: null,
        notes: null,
        activityType: null,
        status: "PENDING",
        tareas: [
          { id: "c1", foto: fotoDeTarea(C1) },
          { id: "c2", foto: fotoDeTarea(C2) },
        ],
      },
      porChat: true,
    });
    expect(cambioDe(r, SALE.clave), "se llevó la mudanza que SALE de la fase").toEqual(SALE);
    // La mudanza HACIA la fase deja la tarea en su origen (el renombre sigue).
    expect((cambioDe(r, ENTRA.clave) as CambioTareaCambia).a).toEqual({ title: "Definir el pipeline de ventas" });
    expect(r.excluidos, "lo de la IA en la fase no quedó fuera").toEqual([DUR_C.clave, NUEVA_C.clave]);
    expect(cambioDe(r, DUR_C.clave)).toEqual(DUR_C);
    expect(r.avisos.join(" ")).toContain("«Pruebas»");
    const plan = planDe(r);
    expect(plan.items.find((it) => it.cambio.clave === "fase:c:se-va")).toMatchObject({ estado: "aplica", rescate: [] });
    expect(plan.escrituras.fasesQueSeVan).toEqual([{ id: "c", borrar: ["c2"], queda: false }]);
    expect(plan.items.find((it) => it.cambio.clave === SALE.clave)?.estado).toBe("aplica");
  });

  it("⛔ una fase que ya arrancó no se registra (quedaría con ⚠ justo después de decir que se quitó)", () => {
    const r = operar([{ op: "fase.borrar", phaseId: "a" }]);
    expect(r.rechazadas).toEqual([{ indice: 0, motivo: "la fase ya arrancó: se queda" }]);
    expect(r.borrador).toBe(BORRADOR);
  });

  it("una fase nueva del chat se quita con lo que cuelga de ella; una de la IA queda fuera", () => {
    const r = operar([
      { op: "fase.crear", nombre: "Cierre", semanas: 1, ref: "cierre" },
      { op: "tarea.crear", phaseId: "cierre", titulo: "Acta de cierre", semana: 0 },
      { op: "fase.borrar", phaseId: "cierre" },
      { op: "fase.borrar", phaseId: "n:piloto" },
    ]);
    sinRechazos(r);
    expect(r.borrador.cambios.some((c) => c.tipo === "fase-nueva" && c.fase.name === "Cierre")).toBe(false);
    expect(r.borrador.cambios.some((c) => c.tipo === "tarea-nueva" && c.tarea.title === "Acta de cierre")).toBe(false);
    expect(cambioDe(r, "n:piloto")).toEqual(PILOTO);
    expect(r.excluidos).toEqual(["n:piloto"]);
    expect(estadoDe(r, NUEVA_P.clave)).toMatchObject({ estado: "excluido", dependeDe: "n:piloto" });
  });

  it("editar una fase que la propuesta quita, o una fase nueva que quedó fuera, se rechaza", () => {
    const seVa = operar([{ op: "fase.borrar", phaseId: "b" }]);
    sinRechazos(seVa);
    const sobreLaQueSeVa = operar([{ op: "fase.duracion", phaseId: "b", semanas: 4 }], { borrador: seVa.borrador, excluidos: seVa.excluidos });
    expect(sobreLaQueSeVa.rechazadas[0]?.motivo).toBe(RECHAZO_FASE_SE_QUITA);
    const fuera = operar([{ op: "fase.duracion", phaseId: "n:piloto", semanas: 4 }], { excluidos: ["n:piloto"] });
    expect(fuera.rechazadas[0]?.motivo).toBe(RECHAZO_FASE_NUEVA_FUERA);
    expect(operar([{ op: "fase.duracion", phaseId: "zzz", semanas: 4 }]).rechazadas[0]?.motivo).toBe(RECHAZO_FASE_NO_ESTA);
  });
});

describe("4 · las tareas vivas: una sola fila por tarea (D2), y los `desde` intactos (D8)", () => {
  const CAMBIA_C2: CambioTareaCambia = {
    tipo: "tarea-cambia",
    clave: claveDeTareaQueCambia("c2"),
    tareaId: "c2",
    faseId: "c",
    desde: fotoDeTarea(C2),
    a: { title: "Pruebas con usuarios finales" },
    porChat: true,
  };
  const conCambiaC2 = { ...BORRADOR, cambios: [...BORRADOR.cambios, CAMBIA_C2] };

  it("⭐ los `desde` quedan intactos: solo se re-ancla el campo que se escribe", () => {
    /* La edición que la pone en rojo: recalcular el `desde` entero contra lo vivo (una edición a mano en
       otro campo quedaría absorbida y aplicar la pisaría). */
    const conNota = conTarea("c2", { notes: "La escribió el CSE" });
    const r = operar([{ op: "tarea.mover-semana", taskId: "c2", semana: 0 }], { vivo: conNota, borrador: conCambiaC2 });
    sinRechazos(r);
    const c = cambioDe(r, CAMBIA_C2.clave) as CambioTareaCambia;
    expect(c.a).toEqual({ title: "Pruebas con usuarios finales", weekIndex: 0 });
    expect(c.desde, "se recalculó el `desde` contra lo vivo").toEqual(fotoDeTarea(C2));
    expect(conClave(r, CAMBIA_C2.clave)).toHaveLength(1);
  });

  it("⛔ D8: otro campo editado a mano sale del cambio, con aviso; el que se escribe se re-ancla", () => {
    /* La edición que la pone en rojo: conservar el título del chat encima de la edición a mano (aplicar la
       pisaría) o callarlo. */
    const aMano = conTarea("c2", { title: "Pruebas con el equipo del cliente" });
    const r = operar([{ op: "tarea.mover-semana", taskId: "c2", semana: 0 }], { vivo: aMano, borrador: conCambiaC2 });
    sinRechazos(r);
    expect((cambioDe(r, CAMBIA_C2.clave) as CambioTareaCambia).a).toEqual({ weekIndex: 0 });
    expect(r.avisos).toEqual(["Dejé lo que editaste a mano en «título» de «Pruebas con el equipo del cliente»."]);
    expect(estadoDe(r, CAMBIA_C2.clave, aMano)?.estado).toBe("aplica");

    // El mismo campo editado a mano (choque) que el chat vuelve a escribir: se re-ancla y aplica.
    const r2 = operar([{ op: "tarea.renombrar", taskId: "c2", titulo: "Pruebas guiadas" }], { vivo: aMano, borrador: conCambiaC2 });
    expect((cambioDe(r2, CAMBIA_C2.clave) as CambioTareaCambia).desde.title).toBe("Pruebas con el equipo del cliente");
    expect(estadoDe(r2, CAMBIA_C2.clave, aMano)?.estado).toBe("aplica");
  });

  it("⛔ «déjalo como está hoy» quita el campo; sin nada que cambiar, el cambio del chat se quita", () => {
    const r = operar([{ op: "tarea.renombrar", taskId: "c2", titulo: "Pruebas con usuarios" }], { borrador: conCambiaC2 });
    sinRechazos(r);
    expect(cambioDe(r, CAMBIA_C2.clave)).toBeUndefined();
  });

  it("mover de fase la MUDA (conserva su id); volver a su fase quita la mudanza; un destino que se va, no", () => {
    const r = operar([{ op: "tarea.mover-fase", taskId: "c2", phaseId: "b", semana: 0 }]);
    sinRechazos(r);
    expect(cambioDe(r, claveDeTareaQueCambia("c2"))).toMatchObject({ faseId: "c", a: { fase: "b", weekIndex: 0 }, porChat: true });
    const b = proyectar(VIVO, r.borrador, r.excluidos).fases.find((f) => f.clave === "b")!;
    expect(b.tareas.find((t) => t.id === "c2")).toMatchObject({ llega: true, weekIndex: 0 });
    // A la misma semana que tiene hoy, la semana no hace falta: una mudanza sin semana usa la viva.
    const mismaSemana = operar([{ op: "tarea.mover-fase", taskId: "c2", phaseId: "b", semana: 1 }]);
    expect((cambioDe(mismaSemana, claveDeTareaQueCambia("c2")) as CambioTareaCambia).a).toEqual({ fase: "b" });

    const vuelve = operar([
      { op: "tarea.mover-fase", taskId: "c2", phaseId: "b" },
      { op: "tarea.mover-fase", taskId: "c2", phaseId: "c" },
    ]);
    sinRechazos(vuelve);
    expect(cambioDe(vuelve, claveDeTareaQueCambia("c2"))).toBeUndefined();

    const destinoSeVa = operar([
      { op: "fase.borrar", phaseId: "b" },
      { op: "tarea.mover-fase", taskId: "c2", phaseId: "b" },
    ]);
    expect(destinoSeVa.rechazadas).toEqual([{ indice: 1, motivo: RECHAZO_FASE_SE_QUITA }]);
  });

  it("editar una tarea que la propuesta quita se rechaza: primero hay que dejarla como estaba", () => {
    expect(operar([{ op: "tarea.renombrar", taskId: "b1", titulo: "Otra" }]).rechazadas[0]?.motivo).toBe(RECHAZO_TAREA_SE_QUITA);
  });
});

describe("5 · quitar una tarea: una sola clave por tarea", () => {
  it("⭐ sobre una `tarea-se-va` de la IA fuera o en choque: la MISMA clave, incluida y del chat", () => {
    /* La edición que la pone en rojo: sumar otra `tarea-se-va` sin mirar la que ya estaba (dos cambios con
       la misma clave: la barra y aplicar leerían uno solo). */
    const fuera = operar([{ op: "tarea.borrar", taskId: "b1" }], { excluidos: [SE_VA_B1.clave] });
    sinRechazos(fuera);
    expect(conClave(fuera, SE_VA_B1.clave)).toHaveLength(1);
    expect(cambioDe(fuera, SE_VA_B1.clave)).toEqual({ ...SE_VA_B1, porChat: true });
    expect(fuera.excluidos).toEqual([]);

    const aMano = conTarea("b1", { title: "Mapear procesos (editada)" });
    expect(planDeAplicacion(aMano, BORRADOR).items.find((it) => it.cambio.clave === SE_VA_B1.clave)?.estado).toBe("choque");
    const choque = operar([{ op: "tarea.borrar", taskId: "b1" }], { vivo: aMano });
    sinRechazos(choque);
    expect(conClave(choque, SE_VA_B1.clave)).toHaveLength(1);
    expect(cambioDe(choque, SE_VA_B1.clave)).toMatchObject({ desde: { title: "Mapear procesos (editada)" }, porChat: true });
    expect(estadoDe(choque, SE_VA_B1.clave, aMano)?.estado).toBe("aplica");
  });

  it("una viva sin cambio nace del chat y se lleva su cambio; lo que tiene avance no se quita", () => {
    const CAMBIA: CambioTareaCambia = {
      tipo: "tarea-cambia",
      clave: claveDeTareaQueCambia("c2"),
      tareaId: "c2",
      faseId: "c",
      desde: fotoDeTarea(C2),
      a: { title: "Otra" },
      porChat: true,
    };
    const r = operar([{ op: "tarea.borrar", taskId: "c2" }], { borrador: { ...BORRADOR, cambios: [...BORRADOR.cambios, CAMBIA] } });
    sinRechazos(r);
    expect(cambioDe(r, claveDeTareaQueSeVa("c2"))).toEqual({
      tipo: "tarea-se-va",
      clave: claveDeTareaQueSeVa("c2"),
      tareaId: "c2",
      faseId: "c",
      desde: fotoDeTarea(C2),
      porChat: true,
    });
    expect(cambioDe(r, CAMBIA.clave)).toBeUndefined();
    expect(operar([{ op: "tarea.borrar", taskId: "b3" }]).rechazadas[0]?.motivo).toBe(motivoDeTareaProtegida(B3));
  });

  it("una nueva de la IA queda fuera; una del chat se quita", () => {
    const r = operar([
      { op: "tarea.crear", phaseId: "b", titulo: "Revisión conjunta", semana: 1 },
      { op: "tarea.borrar", taskId: "t:b-1" },
    ]);
    sinRechazos(r);
    const delChat = r.borrador.cambios.find((c): c is CambioTareaNueva => c.tipo === "tarea-nueva" && c.tarea.title === "Revisión conjunta")!;
    const quitada = operar([{ op: "tarea.borrar", taskId: delChat.clave }], { borrador: r.borrador, excluidos: r.excluidos });
    sinRechazos(quitada);
    expect(cambioDe(quitada, delChat.clave)).toBeUndefined();
    expect(quitada.excluidos).toEqual([NUEVA_B.clave]);
  });
});

describe("6 · las tareas nuevas, crear, y las semanas de una fase", () => {
  it("editar una nueva de la IA la deja `retocada`, validada y sin la fuga del título", () => {
    const r = operar([{ op: "tarea.renombrar", taskId: "t:c-1", titulo: "Pruebas de aceptación con el cliente" }]);
    sinRechazos(r);
    expect(cambioDe(r, NUEVA_C.clave)).toEqual({
      ...NUEVA_C,
      tarea: { ...NUEVA_C.tarea, title: "Pruebas de aceptación con el cliente", needsValidation: false, motivoPorValidar: null, fuga: null },
      retocada: true,
    });
    const fuera = operar([
      { op: "propuesta.dejar-como-estaba", claves: [NUEVA_B.clave] },
      { op: "tarea.renombrar", taskId: "t:b-1", titulo: "Otra" },
    ]);
    expect(fuera.rechazadas).toEqual([{ indice: 1, motivo: RECHAZO_TAREA_NUEVA_FUERA }]);
  });

  it("dueño y tipo: en una viva van a su cambio; en una nueva, a su contenido; un valor fuera del vocabulario se rechaza", () => {
    const r = operar([
      { op: "tarea.duenio", taskId: "c2", duenio: "CLIENTE" },
      { op: "tarea.tipo", taskId: "c2", tipo: "SESSION" },
      { op: "tarea.duenio", taskId: "t:p-1", duenio: "AMBOS" },
      { op: "fase.tipo", phaseId: "n:piloto", tipo: "ADOPCION" },
      { op: "fase.arranque-relativo", phaseId: "n:piloto", semana: null },
    ]);
    sinRechazos(r);
    expect(cambioDe(r, claveDeTareaQueCambia("c2"))).toMatchObject({ a: { party: "CLIENTE", type: "SESSION" }, desde: fotoDeTarea(C2) });
    expect(cambioDe(r, NUEVA_P.clave)).toMatchObject({ retocada: true, tarea: { party: "AMBOS" } });
    expect((cambioDe(r, "n:piloto") as CambioFaseNueva).fase).toMatchObject({ activityType: "ADOPCION", startWeek: null });
    expect(operar([{ op: "tarea.duenio", taskId: "c2", duenio: "NADIE" as never }]).rechazadas[0]?.motivo).toBe("«NADIE» no es un dueño válido");
  });

  it("`tarea.crear` nace del chat, validada; una igual que ya sobrevive en esa semana se rechaza", () => {
    const r = operar([{ op: "tarea.crear", phaseId: "b", titulo: "Revisión conjunta", semana: 5, duenio: "CLIENTE" }]);
    sinRechazos(r);
    const t = r.borrador.cambios.find((c): c is CambioTareaNueva => c.tipo === "tarea-nueva" && c.tarea.title === "Revisión conjunta")!;
    expect(t).toMatchObject({ fase: "b", porChat: true, tarea: { weekIndex: 1, party: "CLIENTE", needsValidation: false, fuga: null } });
    expect(operar([{ op: "tarea.crear", phaseId: "b", titulo: "definir  pipeline", semana: 1 }]).rechazadas[0]?.motivo).toBe(
      RECHAZO_TAREA_REPETIDA,
    );
  });

  it("⭐ quitar una semana: la duración, las vivas con `conCambio` (D17) y las nuevas retocadas", () => {
    /* La edición que la pone en rojo: no guardar `conCambio` (desmarcar el cambio de duración dejaría las
       tareas corridas a medias) o guardarlo al redistribuir, que no cambia la duración. */
    const r = operar([{ op: "fase.quitar-semana", phaseId: "b", semana: 0 }]);
    sinRechazos(r);
    expect(cambioDe(r, "fase:b:durationWeeks")).toMatchObject({ desde: 2, a: 1, porChat: true });
    expect(cambioDe(r, claveDeTareaQueCambia("b2"))).toMatchObject({ a: { weekIndex: 0 }, conCambio: "fase:b:durationWeeks" });
    expect(cambioDe(r, claveDeTareaQueCambia("b3"))).toMatchObject({ a: { weekIndex: 0 }, conCambio: "fase:b:durationWeeks" });
    expect(r.borrador.ajustadasPorElChat).toEqual({ b: { nombre: "Diseño", semanas: 1, sesiones: null } });
    // Desmarcar la duración deja fuera sus tareas corridas, con ella.
    const sin = planDeAplicacion(VIVO, r.borrador, [...r.excluidos, "fase:b:durationWeeks"]);
    expect(sin.items.find((it) => it.cambio.clave === claveDeTareaQueCambia("b2"))).toMatchObject({
      estado: "excluido",
      dependeDe: "fase:b:durationWeeks",
    });

    // Insertar una semana en «Pruebas» (la IA ya la llevaba a 4): pasa a 5, y la nueva de la IA se retoca.
    const ins = operar([{ op: "fase.insertar-semana", phaseId: "c", semana: 0 }]);
    sinRechazos(ins);
    expect(cambioDe(ins, DUR_C.clave)).toMatchObject({ a: 5, porChat: true });
    expect(cambioDe(ins, claveDeTareaQueCambia("c1"))).toMatchObject({ a: { weekIndex: 3 }, conCambio: DUR_C.clave });
    expect(cambioDe(ins, NUEVA_C.clave)).toMatchObject({ retocada: true, tarea: { weekIndex: 4 } });

    const red = operar([{ op: "fase.redistribuir", phaseId: "c" }]);
    sinRechazos(red);
    expect(red.borrador.cambios.filter((c) => c.tipo === "tarea-cambia").every((c) => (c as CambioTareaCambia).conCambio === undefined)).toBe(true);
  });
});

describe("7 · las casillas, el arranque y todo o nada", () => {
  it("dejar como estaba y recuperar son `excluidos`; una clave que no está se rechaza", () => {
    const r = operar([{ op: "propuesta.dejar-como-estaba", claves: [DUR_C.clave, NUEVA_B.clave] }]);
    sinRechazos(r);
    expect(r.excluidos).toEqual([DUR_C.clave, NUEVA_B.clave]);
    const vuelve = operar([{ op: "propuesta.recuperar", claves: [DUR_C.clave] }], { excluidos: r.excluidos });
    expect(vuelve.excluidos).toEqual([NUEVA_B.clave]);
    expect(operar([{ op: "propuesta.recuperar", claves: ["t:no-esta"] }]).rechazadas[0]?.motivo).toBe(RECHAZO_CLAVE_NO_ESTA);
  });

  it("el arranque nace del chat con el `desde` de hoy; pedir el de hoy no cambia nada", () => {
    const r = operar([{ op: "arranque", fecha: "2026-11-02" }]);
    expect(cambioDe(r, "ancla")).toEqual({ tipo: "ancla", clave: "ancla", desde: "2026-10-05", a: "2026-11-02", porChat: true });
    const igual = operar([{ op: "arranque", fecha: "2026-10-05" }]);
    expect(igual.cambio).toBe(false);
  });

  it("⛔ todo o nada: con una sola rechazada vuelve lo de entrada, con TODOS los motivos", () => {
    /* La edición que la pone en rojo: registrar las que pasaron (el chat diría «no registré 2» y habría
       escrito 1) o cortar en la primera rechazada (los demás motivos no se dirían). */
    const ops: Operacion[] = [
      { op: "fase.duracion", phaseId: "c", semanas: 5 },
      { op: "tarea.borrar", taskId: "b3" },
      { op: "fase.renombrar", phaseId: "zzz", nombre: "Otra" },
    ];
    const r = operar(ops, { excluidos: [NUEVA_B.clave] });
    expect(r.rechazadas.map((x) => x.indice)).toEqual([1, 2]);
    expect(r.borrador).toBe(BORRADOR);
    expect(r.excluidos).toEqual([NUEVA_B.clave]);
    expect(r.avisos).toEqual([]);
    expect(r.cambio).toBe(false);
  });
});
