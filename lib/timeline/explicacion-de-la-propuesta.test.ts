/**
 * lib/timeline/explicacion-de-la-propuesta.test.ts — L6: EL PORQUÉ DE LA PROPUESTA, con fuentes NUEVAS (spec §7).
 *
 * Correr: `npx vitest run lib/timeline/explicacion-de-la-propuesta.test.ts --project unit`.
 *
 * Con la propuesta grande anonimizada (__fixtures__/propuesta-grande.json, leída, nunca importada): sus instrucciones
 * de la generación anterior («antes») y de esta («ahora», que suma la línea «PRUEBA: «Fase K» dura 5 semanas…»).
 * Lo que cuida:
 *   1. las fuentes NUEVAS se miden contra lo que leyó la generación anterior (D8), nunca contra «lo de ahora»;
 *   2. una frase vale para una fase solo si alguna fuente citada la NOMBRA como palabras completas (D9);
 *   3. el validador descarta cifras, palabras de número, meses, comillas, voseo, largos y fuentes fuera de la lista;
 *   4. sin fuentes nuevas no se llama al modelo;
 *   5. la pantalla: la frase manda, sin frase no hay línea por fase (lo dice «Más», una vez) y la huella dice si es
 *      «de cuando se generó»;
 *   6. la ruta: la salida del paso 2 lleva lo que leyó, la fusión recibe esa misma salida, y la llamada va medida.
 * La llamada a Haiku se prueba con DOBLES: ningún test llama a la API. Cada `it` nombra la edición que lo pone en rojo.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bloqueDeInstruccionesDeDoc } from "@/lib/business-cases/section-briefs";
import { borradorDelFixture, FASE_NUEVA, FASE_QUE_SE_ALARGA, leerFixtureGrande, vivoDelFixture } from "./__fixtures__/propuesta-grande";
import {
  borradorVacio,
  claveDeTareaQueCambia,
  fotoDeTarea,
  leerBorrador,
  type Cambio,
  type CambioTareaNueva,
  type CambioTareaSeVa,
} from "./borrador";
import { MOTIVO_DEL_KICKOFF_QUE_FALTA, TAREA_DE_KICKOFF } from "./hitos";
import { POLITICA_DE_ATRASOS } from "./politica-de-atrasos";
import { conLaReprogramacion, reprogramarDesdeHoy } from "./reprogramar-desde-hoy";
import {
  anteriorDeLaCorrida,
  cambiosParaExplicar,
  CHIP_DE_LAS_INSTRUCCIONES,
  explicacionEnPantalla,
  explicacionGuardada,
  explicarLaPropuesta,
  fraseGeneral,
  fuentesDeLaGeneracion,
  fuentesNuevas,
  huellaDeLosCambios,
  leerExplicacion,
  lineaSinMaterial,
  mensajeParaExplicar,
  nombraLaFase,
  porqueDeLaFase,
  porQueSeDescarta,
  PROMPT_EXPLICACION,
  TEXTO_DE_CUANDO_SE_GENERO,
  textoDeLaFuente,
  type AnteriorDeLaGeneracion,
  type Explicacion,
  type FuentesDeLaGeneracion,
  type FuenteNueva,
} from "./explicacion-de-la-propuesta";

const FIXTURE = leerFixtureGrande();
const VIVO = vivoDelFixture(FIXTURE);
const BORRADOR = borradorDelFixture(FIXTURE);
const CAMBIOS = cambiosParaExplicar(VIVO, BORRADOR.cambios);
/** La generación anterior (aplicada el 25 sep) y esta (26 sep). */
const ANTES_EN = "2026-09-25T15:00:00.000Z";
const AHORA_EN = "2026-09-26T18:00:00.000Z";
const LEIDAS: FuentesDeLaGeneracion = { instrucciones: FIXTURE.instrucciones.ahora, sesiones: [], en: AHORA_EN };
const ANTERIOR: AnteriorDeLaGeneracion = { en: ANTES_EN, sesiones: [], instrucciones: FIXTURE.instrucciones.antes, deDonde: "corrida" };
const VOSEO = /(^|[^\p{L}\p{N}])(podés|querés|tenés|decime|decímelo|fijate|mirá|revisá|sabés|elegí|aplicá)(?=$|[^\p{L}\p{N}])/iu;
const LINEA_PRUEBA = FIXTURE.instrucciones.ahora.split("\n").find((l) => l.startsWith("PRUEBA"))!;

const reunion = (id: string, titulo: string, texto: string) => ({ id, titulo, fecha: "2026-09-20T15:00:00.000Z", texto });
/** Un doble del modelo: cuenta sus llamadas y devuelve lo que se le dé. */
function doble(respuesta: (c: typeof CAMBIOS) => unknown) {
  const llamadas: Array<{ sistema: string; mensaje: string }> = [];
  return {
    llamadas,
    llamar: async (sistema: string, mensaje: string) => {
      llamadas.push({ sistema, mensaje });
      return JSON.stringify(respuesta(CAMBIOS));
    },
  };
}
const FRASE = "Se ajusta porque tus instrucciones piden probar la integración antes de abrirla.";

describe("L6 · las fuentes NUEVAS, contra la generación anterior (D8)", () => {
  it("⭐ instrucciones «antes» → «ahora»: solo la línea nueva, como [I1]", () => {
    /* La edición que la pone en rojo: comparar contra «lo de ahora» (no queda ninguna) o no comparar (entran las
       dos líneas, y la vieja «Fase K depende del cliente» justificaría cambios que nadie pidió ahora). */
    const f = fuentesNuevas({ leidas: LEIDAS, anterior: ANTERIOR, reuniones: [], notas: [], handoff: null });
    expect(f).toEqual([{ id: "I1", tipo: "instrucciones", titulo: null, fecha: null, texto: LINEA_PRUEBA }]);
  });

  it("⭐ una reunión que la anterior ya leyó no es nueva; la otra, sí, como [R1]", () => {
    /* La edición que la pone en rojo: mirar las reuniones elegidas HOY en lugar de las que leyó la anterior. */
    const leidas = { ...LEIDAS, sesiones: ["s-vieja", "s-nueva"] };
    const f = fuentesNuevas({
      leidas,
      anterior: { ...ANTERIOR, sesiones: ["s-vieja"] },
      reuniones: [reunion("s-vieja", "Revisión de Fase A", "Se habló de Fase A."), reunion("s-nueva", "Seguimiento de Fase K", "Fase K se alarga.")],
      notas: [],
      handoff: null,
    });
    expect(f.filter((x) => x.tipo === "reunion")).toEqual([
      { id: "R1", tipo: "reunion", titulo: "Seguimiento de Fase K", fecha: "2026-09-20T15:00:00.000Z", texto: "Fase K se alarga." },
    ]);
  });

  it("⭐ notas y handoff: solo lo cargado después de la anterior (y antes de que esta leyera)", () => {
    const notas = [
      { titulo: "Nota vieja", fecha: "2026-09-24T12:00:00.000Z", texto: "Vieja" },
      { titulo: "Nota nueva", fecha: "2026-09-26T12:00:00.000Z", texto: "Nueva" },
      { titulo: "Nota de después", fecha: "2026-09-27T12:00:00.000Z", texto: "Después" },
    ];
    const f = fuentesNuevas({ leidas: LEIDAS, anterior: ANTERIOR, reuniones: [], notas, handoff: { fecha: "2026-09-24T00:00:00.000Z", texto: "Fases" } });
    expect(f.filter((x) => x.tipo === "nota").map((x) => x.titulo)).toEqual(["Nota nueva"]);
    expect(f.some((x) => x.tipo === "handoff"), "el handoff de antes de la anterior no es nuevo").toBe(false);
    const conHandoff = fuentesNuevas({ leidas: LEIDAS, anterior: ANTERIOR, reuniones: [], notas: [], handoff: { fecha: "2026-09-26T00:00:00.000Z", texto: "Fases" } });
    expect(conHandoff.find((x) => x.tipo === "handoff")?.id).toBe("H");
  });

  it("⭐ primera generación: todo cuenta como nuevo", () => {
    /* La edición que la pone en rojo: con `anterior` null, no devolver nada (la primera generación se quedaría sin
       porqué aunque las instrucciones lo pidan). */
    const f = fuentesNuevas({
      leidas: { ...LEIDAS, sesiones: ["s1"] },
      anterior: null,
      reuniones: [reunion("s1", "Kickoff", "Arranque")],
      notas: [{ titulo: null, fecha: "2026-01-01T00:00:00.000Z", texto: "Nota" }],
      handoff: { fecha: "2026-08-12T00:00:00.000Z", texto: "Fases" },
    });
    expect(f.map((x) => x.id)).toEqual(["I1", "I2", "R1", "N1", "H"]);
  });

  it("⭐ con `fuentesDeLaGeneracion` en la salida de la anterior, el `previousBrief` no se mira", () => {
    /* La edición que la pone en rojo: preferir el `previousBrief` (aproximado) a lo que la anterior dejó escrito que
       leyó. Acá el `previousBrief` es el texto de AHORA: si se mirara, la línea «PRUEBA…» dejaría de ser nueva. */
    const corrida = {
      output: JSON.stringify({ timelineDetail: { phases: [] }, fuentesDeLaGeneracion: { instrucciones: FIXTURE.instrucciones.antes, sesiones: ["s-vieja"], en: ANTES_EN } }),
      sourceSessionIds: ["otra"],
      createdAt: new Date("2026-09-25T14:00:00.000Z"),
    };
    const anterior = anteriorDeLaCorrida(corrida, FIXTURE.instrucciones.ahora);
    expect(anterior).toEqual({ en: ANTES_EN, sesiones: ["s-vieja"], instrucciones: FIXTURE.instrucciones.antes, deDonde: "corrida" });
    expect(fuentesNuevas({ leidas: LEIDAS, anterior, reuniones: [], notas: [], handoff: null }).map((x) => x.texto)).toEqual([LINEA_PRUEBA]);
    // Una corrida anterior a L6 (sin lo leído): el `previousBrief`, aproximado; sin él, todas las líneas.
    const vieja = { ...corrida, output: JSON.stringify({ timelineDetail: { phases: [] } }) };
    expect(anteriorDeLaCorrida(vieja, FIXTURE.instrucciones.antes)).toMatchObject({ deDonde: "previousBrief", sesiones: ["otra"], en: corrida.createdAt.toISOString() });
    expect(anteriorDeLaCorrida(vieja, null)).toMatchObject({ deDonde: "nada", instrucciones: null });
    expect(fuentesNuevas({ leidas: LEIDAS, anterior: anteriorDeLaCorrida(vieja, null), reuniones: [], notas: [], handoff: null })).toHaveLength(2);
    expect(anteriorDeLaCorrida(null, "x")).toBeNull();
  });

  it("⭐ lo leído se guarda SIN el rótulo del prompt (si no, el rótulo sería una «línea nueva»)", () => {
    const f = fuentesDeLaGeneracion({ bloqueDeInstrucciones: bloqueDeInstruccionesDeDoc(FIXTURE.instrucciones.ahora), sesiones: ["a", "a", "b"], en: new Date(AHORA_EN) });
    expect(f).toEqual({ instrucciones: FIXTURE.instrucciones.ahora, sesiones: ["a", "b"], en: AHORA_EN });
    expect(fuentesDeLaGeneracion({ bloqueDeInstrucciones: "", sesiones: [], en: new Date(AHORA_EN) }).instrucciones).toBe("");
  });
});

describe("L6 · la frase vale solo si una fuente NOMBRA la fase (D9)", () => {
  it("⭐ con un doble que cita I1 para todas las fases, solo quedan «Fase K» y «Fase L»; las otras 10, sin material", async () => {
    /* Las ediciones que la ponen en rojo: quitar la regla de mención (las 12 fases quedarían «explicadas» por una
       línea que nombra solo a dos), o comparar sin límites de palabra. */
    expect(CAMBIOS).toHaveLength(12);
    const fuentes = fuentesNuevas({ leidas: LEIDAS, anterior: ANTERIOR, reuniones: [], notas: [], handoff: null });
    const d = doble((c) => ({ general: null, fases: c.map((x) => ({ fase: x.id, frase: FRASE, fuentes: ["I1"] })) }));
    const e = await explicarLaPropuesta({ fuentes, cambios: CAMBIOS, desde: ANTES_EN, llamar: d.llamar });
    expect(d.llamadas).toHaveLength(1);
    expect(d.llamadas[0].sistema).toBe(PROMPT_EXPLICACION);
    expect(e.fases.map((x) => x.fase).sort()).toEqual([FASE_QUE_SE_ALARGA, FASE_NUEVA].sort());
    expect(e.fases.every((x) => x.fuentes.length === 1 && x.fuentes[0].tipo === "instrucciones")).toBe(true);
    expect(e.sinMaterial).toHaveLength(10);
    expect(e.sinMaterial).not.toContain(FASE_QUE_SE_ALARGA);
    expect(e.desde).toBe(ANTES_EN);
  });

  it("⭐ palabras completas: «CS» no calza en «CSV»; «Semana 0» sí, con comillas y todo", () => {
    expect(nombraLaFase("tareas de CSV", "CS")).toBe(false);
    expect(nombraLaFase("la fase «Semana 0» sigue", "Semana 0")).toBe(true);
    expect(nombraLaFase("Integración con Datos", "Datos")).toBe(true);
    expect(nombraLaFase("Integración con Datosfera", "Datos")).toBe(false);
    expect(nombraLaFase("Migracion de Salesforce", "Migración Salesforce"), "sin tildes, pero en orden y seguidas").toBe(false);
    expect(nombraLaFase("La migración salesforce", "Migración Salesforce")).toBe(true);
  });

  it("⭐ la IA lee ids cortos y la lista cerrada; nunca cuids ni otra cosa que citar", () => {
    const fuentes = fuentesNuevas({ leidas: LEIDAS, anterior: ANTERIOR, reuniones: [], notas: [], handoff: null });
    const m = mensajeParaExplicar(fuentes, CAMBIOS);
    expect(m).toContain(`[I1] Instrucciones adicionales, línea nueva: ${LINEA_PRUEBA}`);
    expect(m).toContain('[F1] "Fase K" (pendiente): duración (semanas): 3 → 5');
    expect(m).toContain('"Fase L" (nueva): fase nueva de 2 semanas');
    expect(m, "la fase terminada va con su estado").toContain('"Fase B" (terminada)');
    expect(CAMBIOS.every((c) => /^F\d+$/.test(c.id))).toBe(true);
  });
});

describe("L6 · el validador (nada de números, fechas ni voseo; solo fuentes de la lista)", () => {
  const fuentes: FuenteNueva[] = [{ id: "I1", tipo: "instrucciones", titulo: null, fecha: null, texto: LINEA_PRUEBA }];
  const K = CAMBIOS.find((c) => c.clave === FASE_QUE_SE_ALARGA)!;
  const leer = (frase: unknown, citadas: unknown = ["I1"], fase: string = K.id) =>
    leerExplicacion(JSON.stringify({ general: null, fases: [{ fase, frase, fuentes: citadas }] }), fuentes, CAMBIOS);

  it("⭐ se descartan: un id fuera de la lista, «tres semanas», «12 sep», «octubre», «podés», «», > 180 y sin fuentes", () => {
    /* La edición que la pone en rojo: aceptar sin fuentes (una frase que no se puede verificar), o dejar pasar un
       número escrito en palabras (los números los pone el código). */
    const malas: Array<[unknown, unknown, string?]> = [
      [FRASE, ["I9"]],
      ["Se alarga tres semanas porque tus instrucciones piden probar la integración.", ["I1"]],
      ["Se alarga desde el 12 sep porque tus instrucciones piden probar la integración.", ["I1"]],
      ["Se alarga hasta octubre porque tus instrucciones piden probar la integración.", ["I1"]],
      ["Se alarga porque podés probar la integración antes de abrirla al cliente.", ["I1"]],
      ["", ["I1"]],
      [`Se alarga porque ${"tus instrucciones lo piden y ".repeat(8)}así queda.`, ["I1"]],
      [FRASE, []],
      [FRASE, null],
      [FRASE, ["I1"], "F99"],
      ["Se alarga porque «tus instrucciones» piden probar la integración.", ["I1"]],
    ];
    for (const [frase, citadas, fase] of malas) {
      const l = leer(frase, citadas, fase);
      expect(l.fases, `pasó: ${String(frase).slice(0, 60)} ${JSON.stringify(citadas)}`).toEqual([]);
      expect(l.sinMaterial).toContain(FASE_QUE_SE_ALARGA);
      expect(l.descartes.length).toBeGreaterThan(0);
    }
    // La buena pasa, con su chip escrito por el código.
    const buena = leer(FRASE);
    expect(buena.fases).toEqual([{ fase: FASE_QUE_SE_ALARGA, frase: FRASE, fuentes: [{ tipo: "instrucciones", titulo: null, fecha: null }] }]);
    expect(buena.descartes).toEqual([]);
  });

  it("⭐ los motivos del descarte no llevan el texto (van al log)", () => {
    expect(porQueSeDescarta("Se alarga tres semanas porque tus instrucciones piden probar la integración.")).toBe("trae palabras de número");
    expect(porQueSeDescarta("Se alarga en mayo porque tus instrucciones piden probar la integración.")).toBe("trae meses");
    expect(porQueSeDescarta("Revisá la integración: tus instrucciones piden probarla antes.")).toBe("voseo");
    expect(porQueSeDescarta("Se suma una fase porque tus instrucciones piden probar la integración."), "«una» es artículo").toBeNull();
    expect(porQueSeDescarta("Mira la integración: tus instrucciones piden probarla antes."), "«mira» es tuteo").toBeNull();
    const l = leer("Se alarga en mayo porque tus instrucciones piden probar la integración.");
    expect(l.descartes.join(" ")).not.toContain("mayo");
  });

  it("⭐ la general, igual menos la mención; JSON tolerante (con cercos o texto alrededor)", () => {
    const general = { frase: "Tus instrucciones nuevas piden probar la integración antes de abrirla.", fuentes: ["I1"] };
    const l = leerExplicacion(`Aquí va:\n\`\`\`json\n${JSON.stringify({ general, fases: [] })}\n\`\`\``, fuentes, CAMBIOS);
    expect(l.general).toEqual({ frase: general.frase, fuentes: [{ tipo: "instrucciones", titulo: null, fecha: null }] });
    expect(leerExplicacion("no es JSON", fuentes, CAMBIOS)).toMatchObject({ general: null, fases: [], sinMaterial: CAMBIOS.map((c) => c.clave) });
    expect(leerExplicacion(JSON.stringify({ general: { ...general, fuentes: [] }, fases: [] }), fuentes, CAMBIOS).general).toBeNull();
  });
});

describe("L6 · sin fuentes nuevas no se llama al modelo", () => {
  it("⭐ el doble cuenta 0 llamadas y todas las fases van a «sin material»", async () => {
    /* La edición que la pone en rojo: llamar igual (se paga una frase que el validador tiraría entera). */
    const d = doble(() => ({ general: null, fases: [] }));
    const e = await explicarLaPropuesta({ fuentes: [], cambios: CAMBIOS, desde: ANTES_EN, llamar: d.llamar });
    expect(d.llamadas).toHaveLength(0);
    expect(e).toEqual({ general: null, fases: [], sinMaterial: CAMBIOS.map((c) => c.clave), desde: ANTES_EN });
    const sinCambios = await explicarLaPropuesta({ fuentes: [{ id: "I1", tipo: "instrucciones", titulo: null, fecha: null, texto: "x" }], cambios: [], desde: null, llamar: d.llamar });
    expect(d.llamadas).toHaveLength(0);
    expect(sinCambios.sinMaterial).toEqual([]);
  });

  it("⭐ lo que dictó el chat y las mudanzas sugeridas no se explican", () => {
    const viva = VIVO.fases.find((f) => f.id === "f06")!.tareas![0];
    const conChat: Cambio[] = [
      { tipo: "tarea-cambia", clave: claveDeTareaQueCambia(viva.id), tareaId: viva.id, faseId: "f06", desde: fotoDeTarea(viva), a: { weekIndex: 0 }, porChat: true },
    ];
    expect(cambiosParaExplicar(VIVO, conChat)).toEqual([]);
    const sugerida: Cambio[] = [{ ...(conChat[0] as Extract<Cambio, { tipo: "tarea-cambia" }>), porChat: undefined, a: { fase: "f02" }, sugerida: "otra-fase" }];
    expect(cambiosParaExplicar(VIVO, sugerida)).toEqual([]);
  });
});

describe("L6 · la pantalla: la frase manda, sin frase no hay línea por fase, y la huella dice si es vieja", () => {
  const EXPLICACION: Explicacion = {
    corrida: "r-paso2",
    version: 3,
    huellaDeCambios: huellaDeLosCambios(BORRADOR.cambios),
    general: { frase: "Tus instrucciones nuevas alargan la integración y suman un piloto.", fuentes: [{ tipo: "instrucciones", titulo: null, fecha: null }] },
    fases: [
      { fase: FASE_QUE_SE_ALARGA, frase: FRASE, fuentes: [{ tipo: "instrucciones", titulo: null, fecha: null }] },
      { fase: FASE_NUEVA, frase: "Se suma porque tus instrucciones nuevas piden un piloto después de la integración.", fuentes: [{ tipo: "instrucciones", titulo: null, fecha: null }] },
    ],
    sinMaterial: CAMBIOS.map((c) => c.clave).filter((c) => c !== FASE_QUE_SE_ALARGA && c !== FASE_NUEVA),
    desde: ANTES_EN,
  };
  const GUARDADO = { ...(FIXTURE.borrador as Record<string, unknown>), explicacion: EXPLICACION };
  const MOTIVO_K = BORRADOR.cambios.find((c) => c.tipo === "fase-cambia")!.motivo!;
  const F_INSTR = { instrucciones: true, reuniones: [], notas: [] };

  it("⭐ la prioridad: frase de L6 > motivo verificado > «Según la IA» (este, solo sin explicación)", () => {
    /* Las ediciones que la ponen en rojo: mostrar «Según la IA» con una explicación guardada (el motivo sin fuente
       vuelve a colarse como porqué), o preferir el motivo a la frase. */
    const e = explicacionEnPantalla(GUARDADO)!;
    expect(porqueDeLaFase(FASE_QUE_SE_ALARGA, [MOTIVO_K], e, F_INSTR)).toEqual({ tipo: "frase", frase: FRASE, fuentes: [CHIP_DE_LAS_INSTRUCCIONES], vieja: false });
    // Con explicación y sin frase: el motivo verificado, sí; el sin fuente, no hay línea.
    expect(porqueDeLaFase("f02", [MOTIVO_K], e, F_INSTR)).toMatchObject({ tipo: "motivos", motivos: [{ motivo: MOTIVO_K, fuente: { tipo: "instrucciones" } }] });
    expect(porqueDeLaFase("f02", ["La IA cree que conviene."], e, F_INSTR)).toBeNull();
    // Sin explicación guardada (antes de L6, o la llamada no llegó a tiempo): lo de L4.
    expect(porqueDeLaFase("f02", ["La IA cree que conviene."], null, F_INSTR)).toEqual({ tipo: "motivos", motivos: [{ motivo: "La IA cree que conviene.", fuente: null }] });
  });

  it("⭐ «Más», una vez, con la fecha de la generación anterior; ninguna línea por fase dice «que lo pida»", () => {
    /* La edición que la pone en rojo: repetir en cada fase una frase de «sin material» (diez líneas iguales en el
       Gantt), o afirmar que nada lo pide (el código solo verificó que ninguna fuente NUEVA la nombra). */
    const e = explicacionEnPantalla(GUARDADO)!;
    expect(lineaSinMaterial(e.explicacion)).toBe("10 fases cambian sin una reunión, nota o instrucción nueva que las nombre (desde la generación del 25 sep).");
    expect(lineaSinMaterial({ sinMaterial: ["f02"], desde: null })).toBe("1 fase cambia sin una reunión, nota o instrucción nueva que la nombre.");
    expect(lineaSinMaterial({ sinMaterial: [], desde: ANTES_EN })).toBeNull();
    for (const fase of e.explicacion.sinMaterial) expect(porqueDeLaFase(fase, [], e, F_INSTR), fase).toBeNull();
    const textos = [PROMPT_EXPLICACION, TEXTO_DE_CUANDO_SE_GENERO, CHIP_DE_LAS_INSTRUCCIONES, lineaSinMaterial(e.explicacion)!];
    for (const t of textos) {
      expect(t).not.toMatch(/que lo pida/i);
      expect(t, `voseo en «${t.slice(0, 40)}»`).not.toMatch(VOSEO);
    }
  });

  it("⭐ la huella: recién escrita (y con las claves reordenadas por la base) no es vieja; el chat la vuelve vieja", () => {
    /* Las ediciones que la ponen en rojo: una huella que depende del orden de las claves (la base, jsonb, las
       reordena: toda explicación saldría «de cuando se generó»), o no mirar los cambios de hoy. */
    const reordenar = (v: unknown): unknown =>
      Array.isArray(v) ? v.map(reordenar) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reordenar(x)])) : v;
    expect(explicacionEnPantalla(reordenar(JSON.parse(JSON.stringify(GUARDADO))))?.vieja).toBe(false);
    // Leído y vuelto a escribir por el lector de la pantalla, igual.
    expect(huellaDeLosCambios(leerBorrador(GUARDADO)!.cambios)).toBe(EXPLICACION.huellaDeCambios);
    const viva = VIVO.fases.find((f) => f.id === "f06")!.tareas![0];
    const conElChat = {
      ...GUARDADO,
      cambios: [
        ...BORRADOR.cambios,
        { tipo: "tarea-cambia", clave: claveDeTareaQueCambia(viva.id), tareaId: viva.id, faseId: "f06", desde: fotoDeTarea(viva), a: { weekIndex: 0 }, porChat: true },
      ],
    };
    const vieja = explicacionEnPantalla(conElChat)!;
    expect(vieja.vieja).toBe(true);
    expect(porqueDeLaFase(FASE_QUE_SE_ALARGA, [], vieja, null)).toMatchObject({ tipo: "frase", vieja: true });
    expect(fraseGeneral(vieja)?.frase).toBe(`${EXPLICACION.general!.frase} ${TEXTO_DE_CUANDO_SE_GENERO}`);
    expect(fraseGeneral(explicacionEnPantalla(GUARDADO))).toEqual({ frase: EXPLICACION.general!.frase, fuentes: [CHIP_DE_LAS_INSTRUCCIONES] });
  });

  it("⭐ lo guardado se valida: sin explicación, o con una forma que no se deja leer, no hay explicación", () => {
    expect(explicacionGuardada(FIXTURE.borrador)).toBeNull();
    expect(explicacionGuardada({ explicacion: { ...EXPLICACION, fases: [{ fase: "f02" }] } })).toBeNull();
    expect(explicacionGuardada({ explicacion: { ...EXPLICACION, general: "x" } })).toBeNull();
    expect(explicacionGuardada(GUARDADO)).toEqual(EXPLICACION);
  });

  it("⭐ los chips los escribe el código", () => {
    expect(textoDeLaFuente({ tipo: "instrucciones", titulo: null, fecha: null })).toBe("Instrucciones adicionales · línea nueva");
    expect(textoDeLaFuente({ tipo: "reunion", titulo: "Seguimiento de la integración con el cliente", fecha: "2026-09-12T15:00:00.000Z" })).toBe(
      "Reunión «Seguimiento de la integraci…» · 12 sep",
    );
    expect(textoDeLaFuente({ tipo: "nota", titulo: "Acta del piloto", fecha: "2026-09-12T15:00:00.000Z" })).toBe("Nota «Acta del piloto»");
    expect(textoDeLaFuente({ tipo: "handoff", titulo: null, fecha: "2026-08-12T15:00:00.000Z" })).toBe("Handoff · 12 ago");
  });
});

describe("L6 · la ruta del paso 2 (escaneo)", () => {
  const leerFuente = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
  const soloCodigo = (s: string) =>
    s
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/^\s*\/\/.*$/gm, "");
  const sinEspacios = (s: string) => s.replace(/\s+/g, "");
  const contiene = (src: string, esperado: string) => sinEspacios(src).includes(sinEspacios(esperado));
  const RUTA = soloCodigo(leerFuente("app/api/clients/[id]/analyze/route.ts"));
  const tramo = (src: string, desde: string, hasta: string) => {
    const i = src.indexOf(desde);
    const j = src.indexOf(hasta, i + 1);
    if (i < 0 || j < 0) throw new Error(`no encuentro el tramo «${desde}» → «${hasta}»`);
    return src.slice(i, j);
  };

  it("⭐ la salida del paso 2 lleva lo que LEYÓ, y la fusión recibe esa misma salida", () => {
    /* Las ediciones que la ponen en rojo: pasar `analysisJson` a la fusión (si se pierde, `avisarEnLaCorrida` pisa el
       `output` sin lo leído y la generación siguiente no sabe qué es nuevo), o guardar la salida sin las fuentes. */
    expect(contiene(RUTA, "fuentesDelPaso2 = fuentesDeLaGeneracion({ bloqueDeInstrucciones: contexto.instrucciones, sesiones: sesionesDelDetalle, en: new Date() });")).toBe(true);
    expect(contiene(RUTA, "const salidaDeLaCorrida = fuentesDelPaso2 ? { ...analysisJson, fuentesDeLaGeneracion: fuentesDelPaso2 } : analysisJson;")).toBe(true);
    const guardar = tramo(RUTA, "const run = existingRunId", "if (isHandoffAgent && bodyProjectId && handoffSourceSessionIds.length > 0)");
    expect(guardar.match(/JSON\.stringify\(salidaDeLaCorrida\)/g)?.length).toBe(2);
    expect(guardar).not.toContain("JSON.stringify(analysisJson)");
    const fusion = tramo(RUTA, "await fusionarDetalleEnElBorrador({", "return NextResponse.json({");
    expect(contiene(fusion, "analysisJson: salidaDeLaCorrida,")).toBe(true);
    expect(sinEspacios(fusion)).not.toMatch(/analysisJson,|analysisJson:analysisJson/);
  });

  it("⭐ `explicar` llama medido (su agente, su corrida), con Haiku, 1500 tokens, 15 s y sin reintentos", () => {
    /* La edición que la pone en rojo: llamar sin el contexto (el gasto quedaría sin dueño, cargado al paso 2), sin
       tope de tiempo o con reintentos (la fusión esperaría más de 15 s), o con otro modelo.
       ⚠ ACTUALIZADA en la revisión de L1–L7 (#13), con esta razón: miraba todo el tramo de la fusión, y L7 metió ahí la
       llamada de `ubicarHechas` con el mismo modelo, temperatura, opciones, contexto y corrida: esas cinco aserciones
       las cumplía la otra llamada aunque `explicar` no las tuviera. Ahora miran SOLO el bloque de `explicar` (`suya`),
       como hace la guarda de L7 con el suyo (hechas-fuera-de-lugar.test.ts). */
    const fusion = tramo(RUTA, "await fusionarDetalleEnElBorrador({", "return NextResponse.json({");
    const suya = tramo(fusion, "explicar: ({ vivo, cambios }) =>", "ubicarHechas: ({ vivo, tocadas }) =>");
    expect(contiene(suya, "explicarConLasFuentesNuevas({")).toBe(true);
    expect(contiene(suya, "conContextoDeIA(")).toBe(true);
    expect(contiene(suya, 'agentSlug: "explicacion-de-la-propuesta",')).toBe(true);
    expect(contiene(suya, "agentRunId: run.id,")).toBe(true);
    expect(contiene(suya, 'origen: "timeline/explicacion",')).toBe(true);
    expect(contiene(suya, 'model: "claude-haiku-4-5",')).toBe(true);
    expect(contiene(suya, "max_tokens: 1500,")).toBe(true);
    expect(contiene(suya, "temperature: 0,")).toBe(true);
    expect(contiene(suya, "{ timeout: 15_000, maxRetries: 0 }")).toBe(true);
    // Una sola llamada al modelo en el bloque: lo de arriba es de ESTA llamada.
    expect(suya.match(/anthropic\.messages\.create\(/g)?.length, "el bloque de `explicar` no es el de una sola llamada").toBe(1);
    // Sin `triggeredByEmail: undefined`: pisaría el de la corrida (el contexto anidado se SUMA al de afuera).
    expect(tramo(suya, "conContextoDeIA(", "anthropic.messages.create(")).not.toContain("triggeredByEmail");
  });

  it("⭐ ningún seed ni script nombra el agente (vive en código, no en la base)", () => {
    const archivos = [
      ...fs.readdirSync(path.join(process.cwd(), "prisma")).filter((f) => f.endsWith(".ts")).map((f) => `prisma/${f}`),
      ...fs.readdirSync(path.join(process.cwd(), "scripts")).filter((f) => f.endsWith(".ts")).map((f) => `scripts/${f}`),
    ];
    expect(archivos.length).toBeGreaterThan(20);
    for (const a of archivos) expect(leerFuente(a), a).not.toContain("explicacion-de-la-propuesta");
  });

  it("⭐ el canvas lee la explicación de la propuesta GUARDADA y se la pasa a la barra y al Gantt", () => {
    /* Las ediciones que la ponen en rojo: no pasarla (la frase no se ve en ningún lado), o leerla de otra cosa que la
       propuesta en pantalla (la huella se compara con SUS cambios). */
    const CANVAS = soloCodigo(leerFuente("components/canvas/CronogramaCanvas.tsx"));
    expect(contiene(CANVAS, "const explicacionDeLaPropuesta = useMemo(() => (hayBorrador ? explicacionEnPantalla(proposal) : null), [hayBorrador, proposal]);")).toBe(true);
    expect(contiene(CANVAS, "explicacion={explicacionDeLaPropuesta}")).toBe(true);
    expect(contiene(CANVAS, "explicacion: explicacionDeLaPropuesta,")).toBe(true);
    const GANTT = soloCodigo(leerFuente("components/canvas/TimelineGantt.tsx"));
    expect(contiene(GANTT, "explicacion={propuesta?.explicacion ?? null}")).toBe(true);
  });

  it("⭐ los módulos nuevos no importan de `lib/google` (ni la raíz de `googleapis`)", () => {
    for (const a of ["lib/timeline/explicacion-de-la-propuesta.ts", "lib/timeline/fuentes-de-la-explicacion.ts"]) {
      const src = leerFuente(a);
      expect(src, a).not.toMatch(/from\s+["']@\/lib\/google/);
      expect(src, a).not.toMatch(/from\s+["']googleapis["']/);
    }
    // Lo puro no arrastra Prisma (lo importa la pantalla).
    expect(leerFuente("lib/timeline/explicacion-de-la-propuesta.ts")).not.toMatch(/@\/lib\/db\/prisma|@prisma\/client/);
  });
});

describe("M2 P2e · lo que decide el sistema no pasa por la explicación (D9)", () => {
  it("⭐ el kickoff que sobra y el que faltaba dan 0 fases para explicar; en la propuesta grande, su fase no lo cuenta", () => {
    /* La edición que la pone en rojo: quitar el filtro de `delSistema` en `cambiosParaExplicar` (Haiku le buscaría una
       reunión a una regla, la fase contaría para el tope de 15 y «Más» la sumaría a «cambian sin material nuevo»). */
    const seVa = BORRADOR.cambios.find((c): c is CambioTareaSeVa => c.tipo === "tarea-se-va" && c.faseId === "f01")!;
    const sobrante: CambioTareaSeVa = { ...seVa, motivo: "Ya hay un kickoff hecho: «Tarea 001».", delSistema: "hito" };
    const kickoff: CambioTareaNueva = {
      tipo: "tarea-nueva",
      clave: "t:0f0f0f0f-0000-4000-a000-000000000001",
      fase: "f10",
      tarea: { ...TAREA_DE_KICKOFF, hito: ["kickoff"] },
      motivo: MOTIVO_DEL_KICKOFF_QUE_FALTA,
      delSistema: "hito",
    };
    expect(cambiosParaExplicar(VIVO, [sobrante, kickoff])).toEqual([]);
    // Sin la marca, las dos fases se explicarían: la guarda distingue.
    const sinMarca: Cambio[] = [{ ...sobrante, delSistema: undefined }, { ...kickoff, delSistema: undefined }];
    expect(cambiosParaExplicar(VIVO, sinMarca).map((c) => c.clave)).toEqual(["f01", "f10"]);
    // En la propuesta grande, «Semana 0» sigue (la IA también la cambia), pero sin la que quita el sistema.
    const antes = CAMBIOS.find((c) => c.clave === "f01")!;
    const despues = cambiosParaExplicar(VIVO, BORRADOR.cambios.map((c) => (c === seVa ? sobrante : c))).find((c) => c.clave === "f01")!;
    expect(antes.resumen).toContain(`"${seVa.desde.title}"`);
    expect(antes.resumen).toContain("5 se quitan");
    expect(despues.resumen).not.toContain(`"${seVa.desde.title}"`);
    expect(despues.resumen).toContain("4 se quitan");
  });
});

describe("M4 P4e · lo que reprogramó el sistema desde hoy no pasa por la explicación (D9)", () => {
  it("⭐ las casillas del sistema, el pin y las arrastradas (con un sobrante de hito) dan 0 fases para explicar", () => {
    /* La edición que la pone en rojo: quitar el filtro de `desdeHoy` en `cambiosParaExplicar` (Haiku le buscaría una
       reunión a «está atrasada», 8 fases contarían para el tope de 15 y «Más» las sumaría a «cambian sin material
       nuevo»). */
    const vacio = () => JSON.parse(JSON.stringify(borradorVacio({ pedido: "regenerar", corrida: "run-2" }))) as Record<string, unknown>;
    const r = reprogramarDesdeHoy({ vivo: VIVO, borrador: leerBorrador(vacio())!, hoy: new Date(FIXTURE.hoy), politica: POLITICA_DE_ATRASOS, conSemanaCero: true })!;
    const reprogramado = leerBorrador(JSON.parse(JSON.stringify(conLaReprogramacion(vacio(), r))))!;
    expect(reprogramado.cambios.filter((c) => (c.tipo === "fase-cambia" || c.tipo === "tarea-cambia") && c.desdeHoy)).toHaveLength(8 + 1 + 25);
    const seVa = BORRADOR.cambios.find((c): c is CambioTareaSeVa => c.tipo === "tarea-se-va" && c.faseId === "f01")!;
    const sobrante: CambioTareaSeVa = { ...seVa, motivo: "Ya hay un kickoff hecho: «Tarea 001».", delSistema: "hito" };
    expect(cambiosParaExplicar(VIVO, [...reprogramado.cambios, sobrante])).toEqual([]);
    // Con lo de la IA al lado, solo lo de la IA: «Fase K» (su duración) y la fase nueva, no las 8 del sistema.
    const conLaIA = [...reprogramado.cambios, ...BORRADOR.cambios.filter((c) => c.tipo === "fase-cambia" || c.tipo === "fase-nueva")];
    expect(cambiosParaExplicar(VIVO, conLaIA).map((c) => c.clave).sort()).toEqual([FASE_NUEVA, FASE_QUE_SE_ALARGA].sort());
  });
});
