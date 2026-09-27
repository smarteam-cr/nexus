/**
 * lib/timeline/hechas-fuera-de-lugar.test.ts — L7: HECHAS EN LA FASE EQUIVOCADA (spec §8.3, §8.5).
 *
 * Correr: `npx vitest run lib/timeline/hechas-fuera-de-lugar.test.ts --project unit`.
 *
 * Sobre la propuesta grande anonimizada (__fixtures__/propuesta-grande.json, leída con `leerFixtureGrande`, nunca
 * importada): 46 hechas, 5 de ellas en «Fase A» que la IA quiere mudar a «Fase B». El modelo es SIEMPRE un doble (ningún
 * test llama a la API): lo que devuelve es lo que se valida. Lo que cuida:
 *   1. solo se sugiere mudar una HECHA hoy, desde la fase en que se le mostró, a OTRA fase que existe; nunca quitar;
 *      hasta 30; una que ya toca otro cambio (del chat o de la IA) no; un id inventado, nada;
 *   2. la IA ve ids cortos, nunca un id de la base, y solo las hechas;
 *   3. sin hechas que mirar no se llama al modelo;
 *   4. el mensaje de arriba dice las que se mudan («…conservan su estado; 1 se muda de fase.») y «Más», las sugeridas;
 *   5. la ruta la llama medida (su agente, su corrida), con Haiku, 600 tokens, 15 s y sin reintentos.
 * Que nazcan desmarcadas y la huella de la explicación con ellas las prueba la fusión (borrador-del-detalle.test.ts).
 * Cada `it` nombra la edición de producción que lo pone en rojo.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { borradorDelFixture, FASE_TERMINADA, leerFixtureGrande, vivoDelFixture } from "./__fixtures__/propuesta-grande";
import { claveDeTareaQueCambia, planDeAplicacion, resumir, type Borrador, type Vivo } from "./borrador";
import {
  mensajeParaUbicar,
  PROMPT_UBICAR_HECHAS,
  sugerenciasDeMudanza,
  sugeridasQueEntran,
  tareasTocadas,
  TOPE_DE_SUGERIDAS,
  ubicarHechas,
} from "./hechas-fuera-de-lugar";
import { mensajeDeLaPropuesta, textoDeLasSugeridas } from "./mensaje-de-la-propuesta";

const FIXTURE = leerFixtureGrande();
const VIVO = vivoDelFixture(FIXTURE);
const BORRADOR = borradorDelFixture(FIXTURE);
const HOY = new Date("2026-09-26T12:00:00-06:00");
const LISTAS = { tareas: "listas" as const };
const FASE_A = "f02";
const HECHAS_DE_A = ["t019", "t020", "t024", "t025", "t026"];
const VOSEO = /\b(podés|querés|tenés|decime|decímelo|fijate|mirá|revisá|sabés|elegí|aplicá)\b/i;

const MENSAJE = mensajeParaUbicar(VIVO);
/** El id corto que la IA vio para una tarea o una fase de la base. */
const corto = (mapa: Map<string, string | { id: string }>, id: string): string => {
  for (const [k, v] of mapa) if ((typeof v === "string" ? v : v.id) === id) return k;
  throw new Error(`«${id}» no está en el mensaje`);
};
const T = (id: string) => corto(MENSAJE.tareas, id);
const F = (id: string) => corto(MENSAJE.fases, id);
const respuesta = (mover: Array<{ tarea: string; fase: string }>) => JSON.stringify({ mover });
const todas = (vivo: Vivo) => vivo.fases.flatMap((f) => (f.tareas ?? []).map((t) => ({ t, fase: f.id })));

describe("L7 · qué se sugiere (fixture)", () => {
  it("⭐ solo HECHAS, a un destino que existe y es otro: nunca quitar, nunca una pendiente, nunca un id inventado", () => {
    /* Las ediciones que la ponen en rojo: aceptar una pendiente (la IA movería trabajo sin empezar como si fuera lo
       hecho), aceptar un destino inexistente o la misma fase, o un id que no estaba en la lista. */
    const pendiente = todas(VIVO).find((x) => x.fase === FASE_A && x.t.status !== "DONE")!.t;
    const crudo = [
      "```json",
      respuesta([
        ...HECHAS_DE_A.map((id) => ({ tarea: T(id), fase: F(FASE_TERMINADA) })),
        { tarea: pendiente.id, fase: F(FASE_TERMINADA) }, // un id de la base: nunca se le mostró
        { tarea: "T999", fase: F(FASE_TERMINADA) }, // inventado
        { tarea: T("t019"), fase: F(FASE_TERMINADA) }, // repetida
        { tarea: T(HECHAS_DE_A[1]), fase: "F99" }, // destino inventado
        { tarea: T(HECHAS_DE_A[2]), fase: F(FASE_A) }, // la misma fase
      ]),
      "```",
    ].join("\n");
    const s = sugerenciasDeMudanza(crudo, VIVO, MENSAJE, new Set());
    expect(s.map((c) => c.tareaId)).toEqual(HECHAS_DE_A);
    for (const c of s) {
      expect(c).toEqual({
        tipo: "tarea-cambia",
        clave: claveDeTareaQueCambia(c.tareaId),
        tareaId: c.tareaId,
        faseId: FASE_A,
        desde: expect.objectContaining({ title: expect.any(String) }),
        a: { fase: FASE_TERMINADA },
        motivo: "Parece de «Fase B»",
        sugerida: "otra-fase",
      });
      expect(c.porChat, "una sugerencia de la IA escrita como de una persona").toBeUndefined();
    }
    // Una pendiente con su id corto: tampoco (solo se le muestran hechas, pero si el vivo cambió entre el mensaje y la
    // respuesta, la validación mira el estado de HOY).
    const reabierta: Vivo = {
      ...VIVO,
      fases: VIVO.fases.map((f) => ({ ...f, tareas: f.tareas?.map((t) => (t.id === "t019" ? { ...t, status: "PENDING" } : t)) })),
    };
    expect(sugerenciasDeMudanza(respuesta([{ tarea: T("t019"), fase: F(FASE_TERMINADA) }]), reabierta, MENSAJE, new Set())).toEqual([]);
    // Movida a otra fase entre el mensaje y la respuesta: tampoco.
    const movida: Vivo = {
      ...VIVO,
      fases: VIVO.fases.map((f) =>
        f.id === FASE_A
          ? { ...f, tareas: f.tareas?.filter((t) => t.id !== "t019") }
          : f.id === "f04"
            ? { ...f, tareas: [...(f.tareas ?? []), VIVO.fases.find((x) => x.id === FASE_A)!.tareas!.find((t) => t.id === "t019")!] }
            : f,
      ),
    };
    expect(sugerenciasDeMudanza(respuesta([{ tarea: T("t019"), fase: F(FASE_TERMINADA) }]), movida, MENSAJE, new Set())).toEqual([]);
    // Nada legible: nada, sin tirar.
    for (const basura of ["", "no sé", "{", "{\"mover\": 3}", null, 42]) expect(sugerenciasDeMudanza(basura, VIVO, MENSAJE, new Set())).toEqual([]);
  });

  it("⭐ una tarea que ya toca otro cambio (el chat, o la IA que la quita o la cambia) no se sugiere; hasta 30", () => {
    /* Las ediciones que la ponen en rojo: ignorar `tocadas` (dos cambios de la misma tarea: la sugerida pisaría lo que
       el chat pidió), o aceptar más de 30. */
    const tocadas = new Set(["t020"]);
    const s = sugerenciasDeMudanza(
      respuesta(HECHAS_DE_A.map((id) => ({ tarea: T(id), fase: F(FASE_TERMINADA) }))),
      VIVO,
      MENSAJE,
      tocadas,
    );
    expect(s.map((c) => c.tareaId)).toEqual(HECHAS_DE_A.filter((id) => id !== "t020"));
    // Todas las hechas del fixture a otra fase: entran 30.
    const muchas = [...MENSAJE.tareas.entries()].map(([t, x]) => ({ tarea: t, fase: F(x.fase === FASE_A ? FASE_TERMINADA : FASE_A) }));
    expect(muchas.length).toBeGreaterThan(TOPE_DE_SUGERIDAS);
    expect(sugerenciasDeMudanza(respuesta(muchas), VIVO, MENSAJE, new Set())).toHaveLength(TOPE_DE_SUGERIDAS);
    // `tareasTocadas` = las que la propuesta ya quita o cambia; `sugeridasQueEntran` no deja pasar dos de la misma.
    const tocadasDelBorrador = tareasTocadas(BORRADOR.cambios);
    expect(tocadasDelBorrador.size).toBeGreaterThan(0);
    for (const c of BORRADOR.cambios) if (c.tipo === "tarea-se-va") expect(tocadasDelBorrador.has(c.tareaId)).toBe(true);
    const cinco = sugerenciasDeMudanza(respuesta(HECHAS_DE_A.map((id) => ({ tarea: T(id), fase: F(FASE_TERMINADA) }))), VIVO, MENSAJE, new Set());
    expect(sugeridasQueEntran(BORRADOR.cambios, [...cinco, ...cinco])).toEqual(cinco);
    expect(sugeridasQueEntran([...BORRADOR.cambios, cinco[0]], cinco)).toEqual(cinco.slice(1));
  });

  it("⭐ la IA ve ids cortos y solo las hechas: ningún id de la base en el mensaje", () => {
    /* La edición que la pone en rojo: poner el id de la base en el mensaje (la IA podría devolver un id que el código no
       sabe validar, o citar cuids al CSE) o listar las pendientes. */
    const hechas = todas(VIVO).filter((x) => x.t.status === "DONE");
    expect(MENSAJE.tareas.size).toBe(hechas.length);
    expect(MENSAJE.tareas.size).toBe(46);
    expect(MENSAJE.fases.size).toBe(VIVO.fases.length);
    for (const { t } of todas(VIVO)) expect(MENSAJE.texto, t.id).not.toContain(t.id);
    for (const f of VIVO.fases) expect(MENSAJE.texto, f.id).not.toContain(`[${f.id}]`);
    expect(MENSAJE.texto).toContain(`[${F(FASE_A)}] «Fase A» (en curso)`);
    expect(MENSAJE.texto).toContain(`[${F(FASE_TERMINADA)}] «Fase B» (terminada)`);
    const pendientesDeA = todas(VIVO).filter((x) => x.fase === FASE_A && x.t.status !== "DONE");
    const bloqueDeA = MENSAJE.texto.slice(MENSAJE.texto.indexOf(`[${F(FASE_A)}]`), MENSAJE.texto.indexOf(`[${F(FASE_TERMINADA)}]`));
    expect(bloqueDeA.split("\n").filter((l) => /^ {3}\[T\d+\] /.test(l))).toHaveLength(5);
    for (const { t } of pendientesDeA) expect(bloqueDeA.split("\n").some((l) => l.endsWith(`] ${t.title}`) && !HECHAS_DE_A.includes(t.id))).toBe(false);
  });

  it("⭐ sin hechas que mirar no se llama al modelo; con hechas, una sola llamada con el prompt y el mensaje", async () => {
    /* Las ediciones que la ponen en rojo: llamar igual (se paga una llamada que no puede sugerir nada), o pasar otro
       prompt que el de código. */
    let llamadas = 0;
    const pedidos: Array<[string, string]> = [];
    const doble = (texto: string) => async (sistema: string, mensaje: string) => {
      llamadas++;
      pedidos.push([sistema, mensaje]);
      return texto;
    };
    const s = await ubicarHechas({
      vivo: VIVO,
      tocadas: new Set(),
      llamar: doble(respuesta(HECHAS_DE_A.map((id) => ({ tarea: T(id), fase: F(FASE_TERMINADA) })))),
    });
    expect(llamadas).toBe(1);
    expect(pedidos).toEqual([[PROMPT_UBICAR_HECHAS, MENSAJE.texto]]);
    expect(s.map((c) => c.tareaId)).toEqual(HECHAS_DE_A);
    // Todas tocadas: no se llama.
    const todasLasHechas = new Set([...MENSAJE.tareas.values()].map((x) => x.id));
    expect(await ubicarHechas({ vivo: VIVO, tocadas: todasLasHechas, llamar: doble("{}") })).toEqual([]);
    // Sin hechas, o con una sola fase: tampoco.
    const sinHechas: Vivo = { ...VIVO, fases: VIVO.fases.map((f) => ({ ...f, tareas: f.tareas?.filter((t) => t.status !== "DONE") })) };
    expect(await ubicarHechas({ vivo: sinHechas, tocadas: new Set(), llamar: doble("{}") })).toEqual([]);
    const unaFase: Vivo = { ...VIVO, fases: [VIVO.fases[1]] };
    expect(await ubicarHechas({ vivo: unaFase, tocadas: new Set(), llamar: doble("{}") })).toEqual([]);
    expect(llamadas, "se llamó al modelo sin nada que sugerir").toBe(1);
  });
});

describe("L7 · el mensaje de arriba con las sugeridas", () => {
  const cinco = sugerenciasDeMudanza(respuesta(HECHAS_DE_A.map((id) => ({ tarea: T(id), fase: F(FASE_TERMINADA) }))), VIVO, MENSAJE, new Set());
  const CON: Borrador = { ...BORRADOR, cambios: [...BORRADOR.cambios, ...cinco] };
  const claves = cinco.map((c) => c.clave);
  const mensaje = (sin: string[]) =>
    mensajeDeLaPropuesta({
      vivo: VIVO,
      borrador: CON,
      r: resumir(VIVO, CON, sin, LISTAS),
      entera: resumir(VIVO, CON, [], LISTAS),
      referencias: null,
      atrasos: [],
      cierreFijado: null,
      hoy: HOY,
    });

  it("⭐ nacen desmarcadas: el plan las da «excluido» con sus claves; la línea de las tareas no dice «Con lo marcado»", () => {
    /* La edición que la pone en rojo: contarlas como algo que el CSE desmarcó (la línea arrancaba «Con lo marcado, …»
       en una propuesta recién abierta) o como tareas que se ajustan. */
    const plan = planDeAplicacion(VIVO, CON, claves, LISTAS);
    for (const k of claves) expect(plan.items.find((it) => it.cambio.clave === k)?.estado, k).toBe("excluido");
    expect(plan.sugeridasSinMarcar).toBe(5);
    const m = mensaje(claves);
    const tareas = m.lineas.find((l) => l.includes("hechas conservan su estado"))!;
    expect(tareas, "sin ninguna marcada, no hay nada que se mude").not.toMatch(/se mud/);
    expect(tareas.startsWith("Con lo marcado"), "las sugeridas sin marcar no son algo que el CSE desmarcó").toBe(false);
    expect(m.detalle).toContain("La IA sugiere mudar 5 tareas hechas a otra fase: vienen sin marcar.");
  });

  it("⭐ marcada una: «…las 46 hechas conservan su estado; 1 se muda de fase.», sin sumarla a las que se ajustan", () => {
    /* La edición que la pone en rojo: contarla en «ajusta N» (no rehace ninguna pendiente) o callarla. */
    const m = mensaje(claves.slice(1));
    const tareas = m.lineas.find((l) => l.includes("hechas conservan su estado"))!;
    expect(tareas).toMatch(/las 46 hechas conservan su estado; 1 se muda de fase\.$/);
    expect(tareas).not.toMatch(/ajusta/);
    // Todo lo que no es sugerida sigue marcado: es la propuesta entera más una mudanza, no «lo marcado».
    expect(tareas.startsWith("Con lo marcado")).toBe(false);
    expect(tareas.length).toBeLessThanOrEqual(140);
    const dos = mensaje(claves.slice(2)).lineas.find((l) => l.includes("hechas conservan su estado"))!;
    expect(dos).toMatch(/; 2 se mudan de fase\.$/);
  });

  it("los textos, en tuteo y cortos", () => {
    for (const t of [PROMPT_UBICAR_HECHAS, textoDeLasSugeridas(1), textoDeLasSugeridas(5), MENSAJE.texto.split("\n")[0]]) {
      expect(t).not.toMatch(VOSEO);
    }
    expect(textoDeLasSugeridas(1)).toBe("La IA sugiere mudar 1 tarea hecha a otra fase: viene sin marcar.");
    expect(PROMPT_UBICAR_HECHAS).toContain('{"mover":[{"tarea":"T3","fase":"F2"}]}');
    expect(PROMPT_UBICAR_HECHAS).toContain("Máximo treinta");
  });
});

describe("L7 · la ruta del paso 2 (escaneo)", () => {
  const leerFuente = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
  const soloCodigo = (s: string) =>
    s
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/^\s*\/\/.*$/gm, "");
  const sinEspacios = (s: string) => s.replace(/\s+/g, "");
  const contiene = (src: string, esperado: string) => sinEspacios(src).includes(sinEspacios(esperado));
  const tramo = (src: string, desde: string, hasta: string) => {
    const i = src.indexOf(desde);
    const j = src.indexOf(hasta, i + 1);
    if (i < 0 || j < 0) throw new Error(`no encuentro el tramo «${desde}» → «${hasta}»`);
    return src.slice(i, j);
  };
  const RUTA = soloCodigo(leerFuente("app/api/clients/[id]/analyze/route.ts"));

  it("⭐ `ubicarHechas` llama medido (su agente, su corrida), con Haiku, 600 tokens, 15 s y sin reintentos", () => {
    /* La edición que la pone en rojo: llamar sin el contexto (el gasto quedaría sin dueño, cargado al paso 2), sin tope
       de tiempo o con reintentos (la fusión esperaría más de 15 s). */
    const fusion = tramo(RUTA, "await fusionarDetalleEnElBorrador({", "return NextResponse.json({");
    const suya = tramo(fusion, "ubicarHechas: ({ vivo, tocadas }) =>", "}),");
    expect(contiene(suya, "ubicarHechas({")).toBe(true);
    expect(contiene(suya, "conContextoDeIA(")).toBe(true);
    expect(contiene(suya, 'agentSlug: "hechas-fuera-de-lugar",')).toBe(true);
    expect(contiene(suya, "agentRunId: run.id,")).toBe(true);
    expect(contiene(suya, 'origen: "timeline/hechas",')).toBe(true);
    expect(contiene(suya, 'model: "claude-haiku-4-5",')).toBe(true);
    expect(contiene(suya, "max_tokens: 600,")).toBe(true);
    expect(contiene(suya, "temperature: 0,")).toBe(true);
    expect(contiene(suya, "{ timeout: 15_000, maxRetries: 0 }")).toBe(true);
    expect(tramo(suya, "conContextoDeIA(", "anthropic.messages.create(")).not.toContain("triggeredByEmail");
  });

  it("⭐ ningún seed ni script nombra el agente (vive en código, no en la base)", () => {
    const archivos = [
      ...fs.readdirSync(path.join(process.cwd(), "prisma")).filter((f) => f.endsWith(".ts")).map((f) => `prisma/${f}`),
      ...fs.readdirSync(path.join(process.cwd(), "scripts")).filter((f) => f.endsWith(".ts")).map((f) => `scripts/${f}`),
    ];
    expect(archivos.length).toBeGreaterThan(20);
    for (const a of archivos) expect(leerFuente(a), a).not.toContain("hechas-fuera-de-lugar");
  });

  it("⭐ lo puro no importa de `lib/google`, de `googleapis` ni de Prisma", () => {
    const src = leerFuente("lib/timeline/hechas-fuera-de-lugar.ts");
    expect(src).not.toMatch(/from\s+["']@\/lib\/google/);
    expect(src).not.toMatch(/from\s+["']googleapis["']/);
    expect(src).not.toMatch(/@\/lib\/db\/prisma|@prisma\/client/);
  });
});
