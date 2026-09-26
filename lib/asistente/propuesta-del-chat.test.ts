/**
 * lib/asistente/propuesta-del-chat.test.ts — CON UNA PROPUESTA ABIERTA, EL CHAT LA EDITA (E3 P5).
 *
 * Correr: `npx vitest run lib/asistente/propuesta-del-chat.test.ts --project unit`.
 *
 * Qué se congela acá:
 *   1. la TRADUCCIÓN: los números de la barra (una fase o un grupo) y las tareas sueltas (por su
 *      identificador o su título) a claves; un heredado vuelve con su padre; lo que espera un recálculo
 *      cuenta como marcado; fuera de rango, ya fuera, choca;
 *   2. «aplícala» sola, sin nada pendiente, sin pregunta abierta, sin bloqueo, con la versión y la huella
 *      de ESTE turno; «descártala» suelta lo pendiente;
 *   3. el descarte con la P: «3» es un número de la barra, no el tercer pendiente;
 *   4. lo que no pasa en seco no se registra y se dice (sin reintento);
 *   5. `correrTurno` con la propuesta: la caída por la propuesta se dice UNA vez (el acuerdo de cierre),
 *      en solo lectura lo acordado queda congelado y no se registra nada nuevo, y el bloque del modelo
 *      y la cajita del CSE leen las mismas líneas.
 * Cada `it` nombra la edición que lo pone en rojo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Lo que `correrTurno` lee y escribe, falso (hoisted): el modelo, el hilo y el contexto ──
const falsos = vi.hoisted(() => ({
  crear: vi.fn(),
  turnos: [] as Array<{ rol: string; contenido: string; shaDeContexto?: string | null }>,
  ctx: null as unknown,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/anthropic", () => ({ anthropic: { messages: { create: falsos.crear } } }));
vi.mock("./hilo", () => ({
  agregarTurno: vi.fn(async (_id: string, t: { rol: string; contenido: string; shaDeContexto?: string | null }) => {
    falsos.turnos.push(t);
  }),
  huellaDeContexto: () => "sha-del-turno",
}));
vi.mock("./contexto", () => ({
  contextoDeCronograma: vi.fn(async () => falsos.ctx),
  materialDelCronograma: vi.fn(async () => ({ texto: "", lectura: null, interno: [] })),
  contextoDeDocumento: vi.fn(),
  contextoDeRol: vi.fn(),
  TOPE_POR_SECCION_CHARS: 1000,
}));

import {
  acuerdoSobreLaPropuesta,
  avisoDeSoloLectura,
  describirSobreLaPropuesta,
  libroSobreLaPropuesta,
  motivoDeCaidaPorToken,
  traducirOperaciones,
  type PropuestaEnElTurno,
} from "./propuesta-del-chat";
import { armarContextoConPropuesta } from "./contexto-del-cronograma";
import { correrTurno } from "./turno";
import { leerAcuerdo, marcaDeAcuerdo, type CambioAcordado } from "./acuerdo";
import { estadosDeAcuerdo } from "./acuerdo-vivo";
import { propuestaParaElChat } from "@/lib/timeline/propuesta-para-el-chat";
import {
  claveDeTareaQueSeVa,
  FORMATO_BORRADOR,
  fotoDeTarea,
  resumenDeLaConfirmacion,
  type Borrador,
  type FaseViva,
  type TareaDelVivo,
  type Vivo,
} from "@/lib/timeline/borrador";
import type { HiloConTurnos } from "./hilo";

// ─────────────────────────────────────────────────────────────────────────────
// ── Los fixtures ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

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

const TB1 = tarea("tb1", "Mapear procesos", 0);
const VIVO: Vivo = {
  ancla: "2026-10-05T00:00:00.000Z",
  fases: [
    fase("fa", "Kickoff", 1, [tarea("ta1", "Reunión de arranque", 0, { status: "DONE", source: "HUMAN" })], { status: "DONE" }),
    fase("fb", "Diseño", 2, [TB1, tarea("tb2", "Definir pipeline", 1)]),
    fase("fc", "Pruebas", 2, [tarea("tc1", "Probar flujos", 1)]),
  ],
};
const T_PILOTO = "t:11111111-2222-4333-a444-555555555555";
const T_REVISAR = "t:22222222-3333-4444-a555-666666666666";
const N_PILOTO = "n:0000abcd";
const nueva = (clave: string, faseDe: string, title: string, weekIndex: number) => ({
  tipo: "tarea-nueva" as const,
  clave,
  fase: faseDe,
  tarea: { title, weekIndex, notes: null, party: "SMARTEAM" as const, type: "TASK" as const, needsValidation: false, motivoPorValidar: null, fuga: null },
});
const BORRADOR: Borrador = {
  formato: FORMATO_BORRADOR,
  version: 4,
  origen: "contexto",
  observaciones: [],
  cambios: [
    { tipo: "fase-cambia", clave: "fase:fc:durationWeeks", faseId: "fc", fase: "Pruebas", campo: "durationWeeks", desde: 2, a: 3 },
    {
      tipo: "fase-nueva",
      clave: N_PILOTO,
      fase: { name: "Piloto", durationWeeks: 2, startWeek: null, sessionCount: null, notes: null, activityType: null },
      despuesDe: "fc",
    },
    { tipo: "tarea-se-va", clave: claveDeTareaQueSeVa("tb1"), tareaId: "tb1", faseId: "fb", desde: fotoDeTarea(TB1) },
    nueva(T_PILOTO, N_PILOTO, "Piloto con el equipo comercial", 0),
    nueva(T_REVISAR, "fb", "Revisar el diseño con el cliente", 1),
  ],
  pedido: "regenerar",
  tareas: { corrida: "run-4", listas: true },
  tareasArmadasPara: { fb: { nombre: "Diseño", semanas: 2 }, [N_PILOTO]: { nombre: "Piloto", semanas: 2 } },
};
const LISTAS = { estado: "listas" as const, fase: null, motivo: null };

/** La propuesta como la tiene el turno: la MISMA lectura que producción, con los identificadores del contexto. */
function enElTurno(o: { borrador?: Borrador; vivo?: Vivo; excluidos?: string[] } = {}): PropuestaEnElTurno {
  const guardado = JSON.parse(JSON.stringify({ ...(o.borrador ?? BORRADOR), ...(o.excluidos ? { excluidos: o.excluidos } : {}) }));
  const p = propuestaParaElChat({ guardado, token: "run-4", vivo: o.vivo ?? VIVO, tareas: LISTAS });
  if (!p.resumen) throw new Error("la propuesta de prueba no se leyó");
  const armado = armarContextoConPropuesta(
    { proyecto: "P", cliente: "C", propuesta: { ...p, resumen: p.resumen }, cierreFijado: null, paraRehacerTodo: "", puedeEditar: true },
    { techo: 100_000 },
  );
  return { ...p, handles: armado.handles, cierreFijado: null };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("⭐ la traducción: lo que nombra el modelo → las claves de la barra", () => {
  const P = enElTurno();
  const numeroDe = (clave: string) =>
    P.resumen!.items.find((it) => it.clave === clave)?.numero ?? P.resumen!.grupos.find((g) => g.tareas.some((t) => t.clave === clave))!.numero;

  it("un número de estructura es su clave; un número de grupo, las claves de sus tareas", () => {
    /* La edición que la pone en rojo: leer «3» como «P3», o tomar un grupo como un solo cambio. */
    const nPiloto = numeroDe(N_PILOTO);
    const nDiseno = numeroDe(T_REVISAR);
    const r = traducirOperaciones(
      [
        { op: "propuesta.dejar-como-estaba", cambios: [String(nPiloto)] },
        { op: "propuesta.dejar-como-estaba", cambios: [`${nDiseno}.`] },
      ],
      P,
    );
    expect(r.rechazadas).toEqual([]);
    expect(r.canonicas.map((c) => c.op)).toEqual([
      { op: "propuesta.dejar-como-estaba", claves: [N_PILOTO] },
      { op: "propuesta.dejar-como-estaba", claves: [claveDeTareaQueSeVa("tb1"), T_REVISAR] },
    ]);
  });

  it("una tarea suelta: por su identificador, por su id, o por su título exacto si es único", () => {
    /* La edición que la pone en rojo: no mirar los identificadores (el modelo nombra lo que vio) o elegir
       entre dos títulos iguales. */
    const handle = P.handles.get(T_PILOTO)!;
    expect(handle.length, "la guarda no está mirando un identificador corto").toBeLessThan(T_PILOTO.length);
    for (const nombrada of [handle, T_PILOTO, "piloto con el equipo COMERCIAL"]) {
      const r = traducirOperaciones([{ op: "propuesta.dejar-como-estaba", tareas: [nombrada] }], P);
      expect(r.rechazadas, nombrada).toEqual([]);
      expect(r.canonicas[0].op).toEqual({ op: "propuesta.dejar-como-estaba", claves: [T_PILOTO] });
    }
    const porId = traducirOperaciones([{ op: "propuesta.dejar-como-estaba", tareas: ["tb1"] }], P);
    expect(porId.canonicas[0].op).toEqual({ op: "propuesta.dejar-como-estaba", claves: [claveDeTareaQueSeVa("tb1")] });
    const ninguna = traducirOperaciones([{ op: "propuesta.dejar-como-estaba", tareas: ["una que no está"] }], P);
    expect(ninguna.canonicas).toEqual([]);
    expect(ninguna.rechazadas[0].motivo).toContain("No encontré «una que no está»");
  });

  it("⭐ un heredado vuelve con su padre (y la línea lo dice)", () => {
    /* La tarea de una fase nueva que se dejó fuera no se marca sola: vuelve con su fase. La edición que
       la pone en rojo: recuperar solo la tarea (quedaría fuera igual) o no nombrar al padre. */
    const p = enElTurno({ excluidos: [N_PILOTO] });
    const n = p.resumen!.grupos.find((g) => g.tareas.some((t) => t.clave === T_PILOTO))!.numero;
    const r = traducirOperaciones([{ op: "propuesta.recuperar", cambios: [String(n)] }], p);
    expect(r.rechazadas).toEqual([]);
    expect(r.canonicas[0].op).toEqual({ op: "propuesta.recuperar", claves: [N_PILOTO, T_PILOTO] });
    const [linea] = describirSobreLaPropuesta(p)([r.canonicas[0].op]);
    const nPadre = p.resumen!.items.find((it) => it.clave === N_PILOTO)!.numero;
    expect(linea).toContain(`(con el cambio ${nPadre})`);
    expect(linea.startsWith("Vuelve a la propuesta:")).toBe(true);
  });

  it("⭐ lo que espera un recálculo cuenta como MARCADO (D6)", () => {
    /* La barra lo pinta marcado: «deja el 2 como estaba» tiene que tomarlo. La edición que la pone en rojo:
       mirar solo `estado === "aplica"` (el grupo diría «ya está fuera» con la casilla marcada). */
    const b: Borrador = {
      ...BORRADOR,
      cambios: [
        { tipo: "fase-cambia", clave: "fase:fb:durationWeeks", faseId: "fb", fase: "Diseño", campo: "durationWeeks", desde: 2, a: 3 },
        nueva(T_REVISAR, "fb", "Revisar el diseño con el cliente", 2),
      ],
      tareasArmadasPara: { fb: { nombre: "Diseño", semanas: 3 } },
    };
    const p = enElTurno({ borrador: b, excluidos: ["fase:fb:durationWeeks"] });
    const g = p.resumen!.grupos[0];
    expect(g.tareas[0].enEspera, "la guarda no está mirando una tarea que espera el recálculo").toBe(true);
    const r = traducirOperaciones([{ op: "propuesta.dejar-como-estaba", cambios: [String(g.numero)] }], p);
    expect(r.rechazadas).toEqual([]);
    expect(r.canonicas[0].op).toEqual({ op: "propuesta.dejar-como-estaba", claves: [T_REVISAR] });
  });

  it("fuera de rango, ya fuera, choca: se rechaza con el porqué (y lo demás del pedido va)", () => {
    const ultimo = Math.max(...P.resumen!.items.map((i) => i.numero), ...P.resumen!.grupos.map((g) => g.numero));
    const r = traducirOperaciones([{ op: "propuesta.dejar-como-estaba", cambios: ["1", "12", "P3"] }], P);
    expect(r.canonicas[0].op).toEqual({ op: "propuesta.dejar-como-estaba", claves: ["fase:fc:durationWeeks"] });
    expect(r.rechazadas.map((x) => x.motivo)).toEqual([
      `No hay un cambio 12: la lista llega hasta el ${ultimo}.`,
      `No hay un cambio P3: la lista llega hasta el ${ultimo}.`,
    ]);
    const fuera = enElTurno({ excluidos: [N_PILOTO] });
    const n = fuera.resumen!.items.find((it) => it.clave === N_PILOTO)!.numero;
    expect(traducirOperaciones([{ op: "propuesta.dejar-como-estaba", cambios: [String(n)] }], fuera).rechazadas[0].motivo).toBe(
      `El ${n} ya está fuera.`,
    );
    // Pruebas se editó a mano después (4 semanas): su cambio choca.
    const editada: Vivo = { ...VIVO, fases: VIVO.fases.map((f) => (f.id === "fc" ? { ...f, durationWeeks: 4 } : f)) };
    const choca = enElTurno({ vivo: editada });
    expect(traducirOperaciones([{ op: "propuesta.dejar-como-estaba", cambios: ["1"] }], choca).rechazadas[0].motivo).toBe(
      "El 1 no se aplica igual: choca con lo que editaste a mano.",
    );
    expect(traducirOperaciones([{ op: "propuesta.dejar-como-estaba" }], P).rechazadas[0].motivo).toContain("Falta decir qué cambio");
  });

  it("⭐ una tarea del vocabulario de siempre se nombra por su ref COMPLETA; aplicar lleva la versión y la huella de este turno", () => {
    /* Entre el turno y el clic puede aparecer otra tarea que termine igual: la ref completa no se confunde.
       La edición que la pone en rojo: registrar el identificador corto, o aplicar sin fijar la lista. */
    const r = traducirOperaciones(
      [
        { op: "tarea.renombrar", taskId: P.handles.get(T_REVISAR), titulo: "Revisar con el cliente", cambios: ["1"] },
        { op: "propuesta.aplicar" },
      ],
      P,
    );
    expect(r.canonicas[0].op).toEqual({ op: "tarea.renombrar", taskId: T_REVISAR, titulo: "Revisar con el cliente" });
    expect(r.canonicas[1].op).toEqual({ op: "propuesta.aplicar", version: 4, huella: P.resumen!.huella });
  });
});

describe("⭐ aplicar y descartar la propuesta entera: SOLAS", () => {
  const P = enElTurno();
  const dejar = { op: "propuesta.dejar-como-estaba" as const, claves: [N_PILOTO] };
  const acordar = (i: Partial<Parameters<typeof acuerdoSobreLaPropuesta>[0]>) =>
    acuerdoSobreLaPropuesta({ propuesta: P, vivas: [], opsNuevas: [], descartar: [], preguntaAbierta: false, ...i });

  it("⭐ «aplícala» sin nada pendiente: sola, con la versión y la huella de este turno", () => {
    const r = acordar({ opsNuevas: [{ op: "propuesta.aplicar" }] });
    expect(r.operaciones).toEqual([{ op: "propuesta.aplicar", version: 4, huella: P.resumen!.huella }]);
    expect(r.avisos).toEqual([]);
  });

  it("⛔ con algo pendiente, una pregunta abierta, mezclada o sin nada marcado, no se registra y se dice", () => {
    /* Las ediciones que la ponen en rojo: aplicar con lo pendiente sin pasar (se aplicaría otra lista que la
       que se leyó), con una pregunta abierta, o mezclada con otros cambios. */
    const conPendiente = acordar({ vivas: [dejar], opsNuevas: [{ op: "propuesta.aplicar" }] });
    expect(conPendiente.operaciones, "lo pendiente sigue, sin aplicar").toEqual([dejar]);
    expect(conPendiente.arrastradas).toEqual([0]);
    expect(conPendiente.avisos[0]).toBe("⚠ No registré «aplicar la propuesta»: primero hay que pasar a la propuesta lo que quedó pendiente.");
    // Con lo pendiente descartado a pedido (con la P), sí.
    expect(acordar({ vivas: [dejar], opsNuevas: [{ op: "propuesta.aplicar" }], descartar: ["P1"] }).operaciones[0].op).toBe("propuesta.aplicar");
    expect(acordar({ opsNuevas: [{ op: "propuesta.aplicar" }], preguntaAbierta: true }).avisos[0]).toContain("hay una pregunta sin contestar");
    const mezclada = acordar({ opsNuevas: [{ op: "propuesta.aplicar" }, { op: "propuesta.dejar-como-estaba", cambios: ["1"] }] });
    expect(mezclada.operaciones).toEqual([{ op: "propuesta.dejar-como-estaba", claves: ["fase:fc:durationWeeks"] }]);
    expect(mezclada.avisos).toEqual(["⚠ No registré «aplicar la propuesta»: va sola, en un pedido aparte."]);
    const nada = enElTurno({ excluidos: BORRADOR.cambios.map((c) => c.clave) });
    expect(acuerdoSobreLaPropuesta({ propuesta: nada, vivas: [], opsNuevas: [{ op: "propuesta.aplicar" }], descartar: [], preguntaAbierta: false }).avisos[0]).toContain(
      "no queda nada marcado",
    );
  });

  it("⛔ con un bloqueo (tareas por recalcular) tampoco", () => {
    const b: Borrador = {
      ...BORRADOR,
      cambios: [
        { tipo: "fase-cambia", clave: "fase:fb:durationWeeks", faseId: "fb", fase: "Diseño", campo: "durationWeeks", desde: 2, a: 3 },
        nueva(T_REVISAR, "fb", "Revisar el diseño con el cliente", 2),
      ],
      tareasArmadasPara: { fb: { nombre: "Diseño", semanas: 3 } },
    };
    const p = enElTurno({ borrador: b, excluidos: ["fase:fb:durationWeeks"] });
    expect(p.resumen!.bloqueo, "la guarda no está mirando un bloqueo").toBeTruthy();
    const r = acuerdoSobreLaPropuesta({ propuesta: p, vivas: [], opsNuevas: [{ op: "propuesta.aplicar" }], descartar: [], preguntaAbierta: false });
    expect(r.operaciones).toEqual([]);
    expect(r.avisos[0]).toBe(`⚠ No registré «aplicar la propuesta»: ${p.resumen!.bloqueo}`);
  });

  it("«descártala»: sola, y lo pendiente cae con ella (se dice)", () => {
    const r = acordar({ vivas: [dejar], opsNuevas: [{ op: "propuesta.descartar-entera" }] });
    expect(r.operaciones).toEqual([{ op: "propuesta.descartar-entera" }]);
    expect(r.caidas).toEqual([{ operacion: dejar, motivo: "se descarta la propuesta entera" }]);
  });

  it("⛔ el descarte se pide CON LA P: «1» es un número de la barra, no el primer pendiente", () => {
    /* La edición que la pone en rojo: fusionar sin `exigirP` (el modelo soltaría un pendiente al nombrar
       el cambio 1 de la barra en «descartar»). */
    expect(acordar({ vivas: [dejar], descartar: ["1"] }).operaciones).toEqual([dejar]);
    expect(acordar({ vivas: [dejar], descartar: ["P1"] }).operaciones).toEqual([]);
  });

  it("⛔ lo que no pasa en seco no se registra y se dice, sin reintento (D13)", () => {
    /* La edición que la pone en rojo: registrar lo emitido sin validarlo contra la propuesta. */
    const r = acordar({
      opsNuevas: [
        { op: "tarea.renombrar", taskId: "no-existe", titulo: "X" },
        { op: "propuesta.dejar-como-estaba", cambios: ["1"] },
      ],
    });
    expect(r.operaciones).toEqual([{ op: "propuesta.dejar-como-estaba", claves: ["fase:fc:durationWeeks"] }]);
    expect(r.avisos).toEqual([
      "⚠ No registré 1 de los cambios: esa tarea no está en la propuesta. Pídemelo de otra forma si lo quieres igual.",
    ]);
  });
});

describe("el libro: lo pendiente se revalida contra la propuesta de ahora", () => {
  it("lo que ya no pasa cae con su motivo; un «aplicar» de otra versión, también", () => {
    const P = enElTurno();
    const aplicarViejo = { op: "propuesta.aplicar", version: 3, huella: "otra" };
    const aplicarVigente = { op: "propuesta.aplicar", version: 4, huella: P.resumen!.huella };
    const r = libroSobreLaPropuesta(P, [{ op: "fase.duracion", phaseId: "fase-borrada", semanas: 2 }, aplicarViejo, aplicarVigente]);
    expect(r.vivas).toEqual([aplicarVigente]);
    expect(r.caidas.map((c) => c.motivo)).toEqual(["esa fase no está en la propuesta", "la propuesta cambió desde que se acordó"]);
  });

  it("⭐ la línea de aplicar ES la confirmación de la barra", () => {
    const P = enElTurno();
    const [linea] = describirSobreLaPropuesta(P)([{ op: "propuesta.aplicar", version: 4, huella: P.resumen!.huella }]);
    expect(linea.startsWith("Aplicar la propuesta al cronograma: ")).toBe(true);
    expect(linea).toContain(resumenDeLaConfirmacion(P.resumen!));
  });

  it("los motivos de la caída por la propuesta, en tuteo", () => {
    expect(motivoDeCaidaPorToken(null, "run-4")).toContain("apareció una propuesta del cronograma");
    expect(motivoDeCaidaPorToken("run-4", null)).toBe("la propuesta ya se aplicó o se descartó");
    expect(motivoDeCaidaPorToken("run-3", "run-4")).toBe("llegó otra propuesta del cronograma");
    expect(avisoDeSoloLectura("tareas-armando")).toBe(
      "⚠ Ahora no registré cambios: la IA está armando las tareas de la propuesta. Pídemelo cuando termine.",
    );
    // E4: lo que no es un v1 no se lee (antes «formato-viejo», que se resolvía en su barra): se descarta.
    expect(avisoDeSoloLectura("ilegible")).toBe(
      "⚠ Ahora no registré cambios: la propuesta guardada no se puede leer; se descarta arriba del Gantt. Pídemelo cuando se resuelva.",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ── correrTurno con la propuesta (el modelo, el hilo y el contexto falsos) ────
// ─────────────────────────────────────────────────────────────────────────────

describe("⭐ correrTurno con una propuesta abierta", () => {
  const FASES_DE_HOY = VIVO.fases.map((f) => ({
    id: f.id,
    name: f.name,
    durationWeeks: f.durationWeeks,
    tareas: (f.tareas ?? []).length,
    items: (f.tareas ?? []).map((t) => ({ id: t.id, title: t.title, weekIndex: t.weekIndex, status: t.status, source: t.source })),
  }));
  const contexto = (p: PropuestaEnElTurno | null) => ({
    texto: "CONTEXTO",
    cierreActual: null,
    fases: FASES_DE_HOY,
    ...(p ? { tokenDeLaPropuesta: p.token, propuesta: p } : {}),
  });
  const turno = (rol: string, contenido: string, i: number) => ({
    id: `t${i}`,
    rol,
    contenido,
    shaDeContexto: rol === "CSE" || rol === "ASISTENTE" ? "sha" : null,
    createdAt: new Date(),
  });
  const hiloCon = (turnos: Array<{ rol: string; contenido: string }>): HiloConTurnos =>
    ({
      id: "h1",
      projectId: "p1",
      businessCaseId: null,
      roleId: null,
      pieza: "timeline",
      usuarioEmail: "cse@smarteam.test",
      modelo: "claude-sonnet-5",
      ultimoRunId: null,
      turnos: turnos.map((t, i) => turno(t.rol, t.contenido, i)),
    }) as unknown as HiloConTurnos;
  const contesta = (texto: string, input?: Record<string, unknown>) =>
    falsos.crear.mockResolvedValueOnce({
      content: [{ type: "text", text: texto }, ...(input ? [{ type: "tool_use", id: "tu1", name: "registrar_cambio_acordado", input }] : [])],
      stop_reason: input ? "tool_use" : "end_turn",
    });
  const loQueSeGuardo = () => {
    const asistente = falsos.turnos.find((t) => t.rol === "ASISTENTE")!;
    return { ...leerAcuerdo(asistente.contenido), contenido: asistente.contenido };
  };
  beforeEach(() => {
    falsos.turnos.length = 0;
  });
  afterEach(() => vi.clearAllMocks());

  it("⭐ lo acordado para el cronograma de hoy cae al aparecer una propuesta: UNA vez, con su motivo", async () => {
    /* La edición que la pone en rojo: repetir la caída en el turno siguiente (sin el acuerdo de cierre, el
       libro volvería a encontrar el acuerdo viejo), o soltarlo en silencio. */
    const viejo: CambioAcordado = {
      resumen: "Dos cambios",
      operaciones: [
        { op: "fase.duracion", phaseId: "fb", semanas: 3 },
        { op: "fase.renombrar", phaseId: "fc", nombre: "QA" },
      ],
      lineas: ["«Diseño» pasa de 2 a 3 semanas", "«Pruebas» pasa a llamarse «QA»"],
    };
    const antes = [
      { rol: "CSE", contenido: "alarga diseño" },
      { rol: "ASISTENTE", contenido: `Listo.\n\n${marcaDeAcuerdo(viejo)}` },
    ];
    falsos.ctx = contexto(enElTurno());
    contesta("Ahora hay una propuesta abierta.");
    const r = await correrTurno(hiloCon(antes), "¿y ahora?");
    expect(r.acuerdo, "no se escribió el acuerdo de cierre").not.toBeNull();
    expect(r.acuerdo!.operaciones).toEqual([]);
    expect(r.acuerdo!.borrador).toBe("run-4");
    expect(r.acuerdo!.descartadas).toEqual([
      "Lo acordado antes (2 cambios) ya no va: apareció una propuesta del cronograma y esto se había acordado para el cronograma de hoy",
    ]);
    expect(r.respuesta).toContain("⚠ Lo que habíamos acordado ya no va: apareció una propuesta del cronograma");
    const guardado = loQueSeGuardo();
    expect(guardado.acuerdo?.operaciones, "el cierre no se lee al recargar").toEqual([]);
    // El acuerdo viejo queda «ya no va» y el cierre no lleva botón.
    const conCierre = [...antes, { rol: "CSE", contenido: "¿y ahora?" }, { rol: "ASISTENTE", contenido: guardado.contenido }];
    expect(estadosDeAcuerdo(hiloCon(conCierre).turnos)).toEqual([null, "soltado", null, null]);
    // Y en el turno siguiente NO se repite.
    falsos.turnos.length = 0;
    contesta("Sigo acá.");
    const otra = await correrTurno(hiloCon(conCierre), "gracias");
    expect(otra.acuerdo, "la caída se repitió en el turno siguiente").toBeNull();
    expect(otra.respuesta).not.toContain("ya no va");
  });

  it("⛔ en solo lectura lo acordado queda CONGELADO y no se registra nada nuevo", async () => {
    /* Mientras la IA arma las tareas, la propuesta no se puede leer como para validar: lo pendiente se le
       cuenta al modelo con sus líneas GUARDADAS, sin podar. La edición que la pone en rojo: podar contra el
       cronograma de hoy (la tarea en la fase nueva `n:` caería como «esa fase ya no está»), o registrar. */
    const pendiente: CambioAcordado = {
      resumen: "Una tarea en el piloto",
      operaciones: [{ op: "tarea.crear", phaseId: N_PILOTO, titulo: "Demo", semana: 0 }],
      lineas: ["Se agrega «Demo» a «Piloto», en la semana 1"],
      borrador: "run-4",
    };
    const p = enElTurno();
    falsos.ctx = contexto({ ...p, modo: "solo-lectura", porQue: "tareas-armando" });
    contesta("Te lo dejo.", { resumen: "otra", operaciones: [{ op: "propuesta.dejar-como-estaba", cambios: ["1"] }] });
    const r = await correrTurno(
      hiloCon([
        { rol: "CSE", contenido: "agrega demo" },
        { rol: "ASISTENTE", contenido: `Listo.\n\n${marcaDeAcuerdo(pendiente)}` },
      ]),
      "y deja el 1",
    );
    expect(r.acuerdo, "se registró algo en solo lectura (o se escribió un cierre)").toBeNull();
    expect(r.respuesta).toContain("⚠ Ahora no registré cambios: la IA está armando las tareas de la propuesta.");
    const alModelo = JSON.stringify(falsos.crear.mock.calls[0][0].messages);
    expect(alModelo, "lo pendiente dejó de contársele al modelo").toContain("P1. Se agrega «Demo» a «Piloto», en la semana 1");
    expect(alModelo).not.toContain("ya no se puede aplicar");
  });

  it("⛔ en solo lectura, aunque lo pendiente caiga por la propuesta, lo nuevo NO se registra: solo el cierre", async () => {
    /* La edición que la pone en rojo: registrar lo nuevo cuando lo pendiente cayó (el libro vacío no hace
       editable a una propuesta que la IA está armando). */
    const p = enElTurno();
    falsos.ctx = contexto({ ...p, modo: "solo-lectura", porQue: "tareas-armando" });
    contesta("Te lo dejo.", { resumen: "otra", operaciones: [{ op: "fase.duracion", phaseId: "fb", semanas: 4 }] });
    const deHoy: CambioAcordado = {
      resumen: "Una",
      operaciones: [{ op: "fase.duracion", phaseId: "fb", semanas: 3 }],
      lineas: ["«Diseño» pasa de 2 a 3 semanas"],
    };
    const r = await correrTurno(
      hiloCon([
        { rol: "CSE", contenido: "alarga" },
        { rol: "ASISTENTE", contenido: `Listo.\n\n${marcaDeAcuerdo(deHoy)}` },
      ]),
      "y a 4",
    );
    expect(r.acuerdo?.operaciones, "se registró algo en solo lectura").toEqual([]);
    expect(r.acuerdo?.descartadas?.[0]).toContain("Lo acordado antes (1 cambio) ya no va");
    expect(r.respuesta).toContain("⚠ Ahora no registré cambios");
    expect(r.respuesta).toContain("⚠ Lo que habíamos acordado ya no va");
  });

  it("⭐ editable: lo acordado va a la propuesta, sellado, y el bloque del modelo y la cajita leen las mismas líneas", async () => {
    /* Las ediciones que la ponen en rojo: no sellar el token (la pantalla lo aplicaría al cronograma de
       hoy), o describir lo pendiente con otro traductor que la cajita. */
    const P = enElTurno();
    const pendiente: CambioAcordado = {
      resumen: "Dejar la fase nueva",
      operaciones: [{ op: "propuesta.dejar-como-estaba", claves: [N_PILOTO] }],
      lineas: ["(la línea vieja)"],
      borrador: "run-4",
    };
    falsos.ctx = contexto(P);
    contesta("Hecho.", { resumen: "y el 1", operaciones: [{ op: "propuesta.dejar-como-estaba", cambios: ["1"] }] });
    const r = await correrTurno(
      hiloCon([
        { rol: "CSE", contenido: "deja el piloto" },
        { rol: "ASISTENTE", contenido: `Listo.\n\n${marcaDeAcuerdo(pendiente)}` },
      ]),
      "y el 1 también",
    );
    expect(r.acuerdo?.borrador).toBe("run-4");
    expect(r.acuerdo?.operaciones).toEqual([
      { op: "propuesta.dejar-como-estaba", claves: [N_PILOTO] },
      { op: "propuesta.dejar-como-estaba", claves: ["fase:fc:durationWeeks"] },
    ]);
    expect(r.acuerdo?.arrastradas).toEqual([0]);
    const lineas = r.acuerdo!.lineas!;
    // Con el número y el título de la barra (el traductor de la propuesta), no con la clave cruda.
    expect(lineas[0], "la línea no nombra el cambio como la barra").toMatch(/^Queda como está hoy: \d+\. «/);
    const alModelo = JSON.stringify(falsos.crear.mock.calls[0][0].messages);
    expect(alModelo, "el bloque del modelo y la cajita leen líneas distintas").toContain(JSON.stringify(`P1. ${lineas[0]}`).slice(1, -1));
  });
});
