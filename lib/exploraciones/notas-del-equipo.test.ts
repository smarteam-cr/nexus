/**
 * Lo que sabe el equipo pesa en el Resumen de La escala (21 nov, ./notas-del-equipo.ts): la nota se guarda con quién y
 * cuándo, entra al agente como una fuente N1 de más peso que las reuniones, su cita se verifica con la regla de siempre y
 * adentro dice «lo dijo <persona> del equipo». Y los hitos de la escala solo se escriben en un lugar, sin update ni delete.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { aplicarOperaciones, contenidoVacio, propuestaVacia, type EstadoDeExploracion, type Validez } from "./contenido";
import { leerContenido, VALIDADOR_ESTRICTO } from "./esquemas";
import type Anthropic from "@anthropic-ai/sdk";
import type { Letra } from "@/lib/escala/documento/tipos";
import { areaDeLaCita, leerLaRespuesta, pedidoDePosicionar, REGLA_DE_LAS_NOTAS_EN_UBICAR, type ContextoDelPedido } from "./agente-pedido";
import { prefijoDeLaRespuesta } from "./completar-el-diagnostico";
import { esFuenteDelCliente, esHipotesisDeNivel, fusionarPropuestas, idDelItem, propuestaVigente, type ItemPropuesto } from "./contenido";
import { ESCALA_DE_PRUEBA, estadoDePrueba } from "./escala-de-prueba.test-helpers";
import { leerPropuesta } from "./esquemas";
import { diaConAnio, diaCorto } from "./fechas";
import type { Fuente } from "./fuentes-tipos";
import { LARGO_ENTERO } from "./lo-que-sabes";
import {
  bloqueDeLasNotas,
  esNotaEnUbicar,
  GANA_LA_NOTA,
  MAX_NOTAS_EN_UBICAR,
  nivelesDeUnaNota,
  nivelesSugeridosEnPalabras,
  notasComoFuentes,
  notasParaUbicar,
  notasQueLeeUbicar,
  quienLaEscribio,
  reunionesDeVerdad,
  ROTULO_DE_LA_NOTA,
} from "./notas-del-equipo";
import { citaVerificada, pedidoDelResumen, type ContextoDelResumen, type ReunionParaElResumen } from "./resumen-de-la-escala";
import { piezasDeLaPagina, textoDeLasPiezas } from "./impacto-en-la-escala";

const VALIDEZ: Validez = { dimensiones: new Set(["1.1"]), criterios: new Set(), areas: new Set(["1"]), ediciones: new Set(), escalaVersion: "9.3.0" };
const estado = (): EstadoDeExploracion => ({
  contenido: contenidoVacio(),
  propuesta: propuestaVacia(),
  areas: ["1"],
  edicion: null,
  perfilCierre: "con equipo",
  perfilDespues: "continua",
  responsableEmail: null,
  archivada: false,
});

describe("la nota se guarda con quién y cuándo", () => {
  it("una de «Lo que sabes» deja su autor; editarla lo actualiza; quitarla lo borra", () => {
    const a = aplicarOperaciones(estado(), [{ op: "nota", paso: "sabido:mi0abcde123", texto: "Pierden 40 mil al mes" }], VALIDEZ, VALIDADOR_ESTRICTO, { por: "liz@smarteamcr.com", en: "2026-11-21T10:00:00Z" });
    if (!a.ok) throw new Error(a.error);
    expect(a.estado.contenido.autoresDeLasNotas).toEqual({ "sabido:mi0abcde123": { por: "liz@smarteamcr.com", en: "2026-11-21T10:00:00Z" } });
    // Guardar el mismo texto no cambia el autor.
    const b = aplicarOperaciones(a.estado, [{ op: "nota", paso: "sabido:mi0abcde123", texto: "Pierden 40 mil al mes" }], VALIDEZ, VALIDADOR_ESTRICTO, { por: "marco@smarteamcr.com", en: "2026-11-22T10:00:00Z" });
    if (!b.ok) throw new Error(b.error);
    expect(b.estado.contenido.autoresDeLasNotas?.["sabido:mi0abcde123"].por).toBe("liz@smarteamcr.com");
    const c = aplicarOperaciones(b.estado, [{ op: "nota", paso: "sabido:mi0abcde123", texto: "" }], VALIDEZ, VALIDADOR_ESTRICTO, { por: "liz@smarteamcr.com", en: "2026-11-23T10:00:00Z" });
    if (!c.ok) throw new Error(c.error);
    expect(c.estado.contenido.autoresDeLasNotas).toEqual({});
  });

  it("una nota que no es del equipo (las de sesión) no deja autor", () => {
    const a = aplicarOperaciones(estado(), [{ op: "nota", paso: "sesion:s-1", texto: "x" }], VALIDEZ, VALIDADOR_ESTRICTO, { por: "liz@smarteamcr.com", en: "2026-11-21T10:00:00Z" });
    if (!a.ok) throw new Error(a.error);
    expect(a.estado.contenido.autoresDeLasNotas).toBeUndefined();
  });

  it("se lee del Json, solo de las notas que siguen", () => {
    const c = leerContenido({
      notas: { "sabido:mi0abcde123": "Pierden 40 mil" },
      autoresDeLasNotas: { "sabido:mi0abcde123": { por: "liz@smarteamcr.com", en: "2026-11-21T10:00:00Z" }, "sabido:otra": { por: "x", en: "y" }, mal: 3 },
    });
    expect(Object.keys(c.autoresDeLasNotas ?? {})).toEqual(["sabido:mi0abcde123"]);
  });
});

const nombreDe = (c: string) => (c === "liz@smarteamcr.com" ? "Liz Flores" : null);

describe("la nota como fuente del Resumen", () => {
  const notas = notasComoFuentes(
    { "sabido:mi0abcde123": "El gerente nos confirmó que pierden 40 mil dólares al mes en cartera vencida.\nNo usan Excel para cobrar.", "r1-test": "no es del equipo" },
    { "sabido:mi0abcde123": { por: "liz@smarteamcr.com", en: "2026-11-21T10:00:00Z" } },
    nombreDe,
  );

  it("una fuente N1 por nota del equipo, un turno por renglón, con quién la escribió", () => {
    expect(notas).toHaveLength(1);
    expect(notas[0]).toMatchObject({ clave: "N1", id: "nota:sabido:mi0abcde123", areaId: null, delCliente: ["Liz Flores"], delEquipo: { nombre: "Liz Flores", en: "2026-11-21T10:00:00Z" } });
    expect(notas[0].turnos.map((t) => t.n)).toEqual([1, 2]);
    expect(quienLaEscribio(undefined, nombreDe)).toBe("Alguien del equipo");
  });

  it("su cita se verifica palabra por palabra y lleva el rótulo del equipo", () => {
    const c = citaVerificada({ reunion: "N1", turno: 1, texto: "pierden 40 mil dólares al mes en cartera vencida" }, notas);
    expect(c).toMatchObject({ reunion: "nota:sabido:mi0abcde123", delEquipo: { nombre: "Liz Flores" } });
    // Lo que la nota no dice no pasa.
    expect(citaVerificada({ reunion: "N1", turno: 1, texto: "pierden 90 mil dólares al mes en cartera" }, notas)).toBeNull();
  });

  it("el pedido pone las notas aparte, antes de las reuniones, y dice que pesan más", () => {
    const reunion: ReunionParaElResumen = { id: "s1", clave: "R1", fecha: "2026-11-10T15:00:00Z", equipo: "Ventas", areaId: "1", turnos: [{ n: 1, hablante: "Ana", texto: "Vendemos a crédito a 800 clientes" }], delCliente: ["Ana"] };
    const ctx: ContextoDelResumen = { empresa: "Cemaco", areas: [], reuniones: [reunion, ...notas], instrucciones: "" };
    const p = pedidoDelResumen(ctx);
    const texto = String((p.messages[0] as { content: string }).content);
    const enNotas = texto.indexOf("Lo que CONFIRMÓ el equipo");
    const enReuniones = texto.indexOf("Las reuniones de diagnóstico");
    expect(enNotas).toBeGreaterThan(-1);
    expect(enNotas).toBeLessThan(enReuniones);
    expect(texto).toContain("### N1 · 2026-11-21 · nota del equipo (la escribió Liz Flores)");
    // La nota no aparece entre las reuniones.
    expect(texto.slice(enReuniones)).not.toContain("### N1");
    expect(String(p.system)).toContain("PESAN MÁS que las reuniones");
  });
});

describe("una nota no es una sesión", () => {
  it("no va a las reuniones de la corrida, y sola no alcanza para armar el Resumen", () => {
    const notas = notasComoFuentes({ "sabido:mi0abcde123": "Pierden 40 mil al mes en cartera" }, undefined, () => null);
    const reunion = { id: "s1", delEquipo: undefined };
    expect(reunionesDeVerdad([reunion, ...notas]).map((r) => r.id)).toEqual(["s1"]);
    expect(reunionesDeVerdad(notas)).toEqual([]);
  });
  it("el servidor del Resumen usa esa regla para las dos cosas", () => {
    const s = readFileSync("lib/exploraciones/resumen-de-la-escala-server.ts", "utf8");
    expect(s).toMatch(/if \(!reunionesDeVerdad\(le\.ctx\.reuniones\)\.length\) return/);
    expect(s).toMatch(/sourceSessionIds: reunionesDeVerdad\(le\.ctx\.reuniones\)\.map/);
  });
});

describe("las piezas de la página que lee el agente de impacto", () => {
  it("sin Resumen armado, ninguna", () => {
    expect(piezasDeLaPagina(null)).toEqual([]);
  });
  it("el texto de lo que se vio respeta su tope", () => {
    const piezas = Array.from({ length: 200 }, (_, i) => ({ parte: "Ventas", texto: `Reto ${i} con un texto de largo medio para llenar` }));
    expect(textoDeLasPiezas(piezas).length).toBeLessThanOrEqual(4000);
  });
});

describe("los hitos de la escala se escriben en un solo lugar y nunca se reescriben", () => {
  const archivos = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      if (n === "node_modules" || n.startsWith(".")) return [];
      return statSync(p).isDirectory() ? archivos(p) : /\.(ts|tsx)$/.test(n) && !/\.test\.ts$/.test(n) ? [p] : [];
    });
  it("solo hitos-de-la-escala-server.ts escribe, y sin update ni delete", () => {
    const quienEscribe = [...archivos("lib"), ...archivos("app"), ...archivos("scripts")].filter((f) => /hitoDeLaEscala\.(create|update|upsert|delete)/.test(readFileSync(f, "utf8")));
    expect(quienEscribe.map((f) => f.replace(/\\/g, "/"))).toEqual(["lib/exploraciones/hitos-de-la-escala-server.ts"]);
    const s = readFileSync("lib/exploraciones/hitos-de-la-escala-server.ts", "utf8");
    expect(s).not.toMatch(/hitoDeLaEscala\.(update|upsert|delete)/);
  });
});

// ── «Ubicar» lee las notas del equipo, y una nota puede fijar un nivel (25 nov, Elías: «Puede fijar el nivel») ─────

/** Lo que devolvería Claude: un solo bloque con la herramienta. */
function respuesta(input: Record<string, unknown>): Anthropic.Messages.Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    content: [{ type: "tool_use", id: "tu_1", name: "proponer", input }],
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as Anthropic.Messages.Message;
}

describe("las notas como fuentes de «Ubicar»", () => {
  const nombreDe = (c: string) => (c === "liz@smarteamcr.com" ? "Liz Flores" : null);
  const RESPUESTA = "Sobre Ventas · Datos (cómo registran hoy los contactos): Cada vendedor anota sus contactos en su propio Excel y nadie los sube al CRM.";

  it("cada nota de «Lo que sabes» es una fuente N1, N2…, con su texto y «Nota del equipo · <persona>, <día>»", () => {
    const r = notasParaUbicar(
      { "sabido:mi0abcde123": RESPUESTA, "sabido:mi0abcdf999": "Pierden 40 mil al mes en cartera", "r1-test": "una nota de sesión no entra", "instrucciones:exploracion": "tampoco" },
      { "sabido:mi0abcde123": { por: "liz@smarteamcr.com", en: "2026-11-25T15:00:00Z" } },
      nombreDe,
    );
    expect(r.fuentes.map((f) => f.id)).toEqual(["N1", "N2"]);
    expect(r.fuentes[0]).toEqual({
      id: "N1",
      etiqueta: `${ROTULO_DE_LA_NOTA} · Liz Flores, ${diaCorto("2026-11-25T15:00:00Z")}`,
      // Para la IA, sin el nombre (revisión del 25 nov) y con el año, como las reuniones.
      paraElAgente: `${ROTULO_DE_LA_NOTA}, ${diaConAnio("2026-11-25T15:00:00Z")}`,
      texto: RESPUESTA,
    });
    // Sin autor: «Alguien del equipo», con el día de su clave.
    expect(r.fuentes[1].etiqueta).toMatch(/^Nota del equipo · Alguien del equipo, \d+ \S+/);
    expect(r.claves).toEqual(["sabido:mi0abcde123", "sabido:mi0abcdf999"]);
    // Son de quien sabe, no del cliente, pero pueden respaldar un nivel (esFuenteDelCliente).
    expect(r.fuentes.every((f) => esFuenteDelCliente(f.id) && esNotaEnUbicar(f.id))).toBe(true);
    // La N0 de las notas de las sesiones (al leer una reunión) no es una nota de «Ubicar».
    expect(esNotaEnUbicar("N0")).toBe(false);
  });

  it("lee las 12 más nuevas, cada una hasta su largo", () => {
    const notas = Object.fromEntries(
      Array.from({ length: 15 }, (_, i) => [`sabido:mi0a${String(i).padStart(4, "0")}xyz`, `Nota ${i} ${"x".repeat(i === 14 ? LARGO_ENTERO + 50 : 5)}`]),
    );
    const r = notasParaUbicar(notas, undefined, () => null);
    expect(r.fuentes).toHaveLength(MAX_NOTAS_EN_UBICAR);
    expect(r.claves[0]).toBe("sabido:mi0a0003xyz");
    expect(r.fuentes.at(-1)!.texto).toHaveLength(LARGO_ENTERO);
    expect(notasQueLeeUbicar(notas).map((n) => n.clave)).toEqual(r.claves);
  });

  describe("el pedido", () => {
    const nota = notasParaUbicar({ "sabido:mi0abcde123": RESPUESTA }, { "sabido:mi0abcde123": { por: "liz@smarteamcr.com", en: "2026-11-25T15:00:00Z" } }, nombreDe).fuentes;
    const ctx = (fuentes: Fuente[]): ContextoDelPedido & { objetivo: string } => ({
      modo: "leer",
      marco: "venta",
      empresa: "TEC · AE",
      industria: null,
      escala: ESCALA_DE_PRUEBA,
      areas: [],
      conHipotesis: true,
      perfil: null,
      contenido: estadoDePrueba().contenido,
      fuentes,
      hoy: "2026-11-25T18:00:00.000Z",
      objetivo: "la preventa",
    });
    const REUNION = { id: "S1", etiqueta: "Reunión del 22 oct 2026: Reportes", texto: "La cliente contó que arman los reportes de matrícula a mano cada semana en Excel." };

    it("con una nota, dice qué es, que puede fijar un nivel y que pesa como en el Resumen", () => {
      const p = pedidoDePosicionar(ctx([...nota, REUNION]));
      expect(String(p.system)).toContain(REGLA_DE_LAS_NOTAS_EN_UBICAR.trim());
      expect(String(p.system)).toContain("una nota puede fijar un nivel igual que lo que dijo el cliente en una reunión");
      // La misma regla de peso que el Resumen (una sola frase en el código).
      expect(String(p.system)).toContain(GANA_LA_NOTA);
      expect(bloqueDeLasNotas(notasComoFuentes({ "sabido:mi0abcde123": RESPUESTA }, undefined, () => null))).toContain(GANA_LA_NOTA);
      // Las formas que describe salen del código: el rótulo y la de una respuesta del chat.
      expect(String(p.system)).toContain(`«${ROTULO_DE_LA_NOTA}, <día>»`);
      expect(String(p.system)).toContain(prefijoDeLaRespuesta({ equipo: "<equipo>", dimension: "<parte>", pregunta: "<la pregunta>" }));
      const cuerpo = String((p.messages[0] as { content: string }).content);
      expect(cuerpo).toContain(`=== FUENTE N1: ${ROTULO_DE_LA_NOTA}, ${diaConAnio("2026-11-25T15:00:00Z")} ===`);
      // Va primero y aparte de las reuniones.
      expect(cuerpo.indexOf("=== FUENTE N1")).toBeLessThan(cuerpo.indexOf("=== FUENTE S1"));
    });

    it("⛔ la IA no recibe el nombre de quien escribió la nota: no lo puede escribir en un porqué ni en una tarjeta", () => {
      const p = pedidoDePosicionar(ctx([...nota, REUNION]));
      expect(JSON.stringify(p)).not.toContain("Liz Flores");
      // Adentro sí: el rótulo de la fuente lo lleva, y es el que guarda la sugerencia.
      expect(nota[0].etiqueta).toContain("Liz Flores");
    });

    it("⛔ una respuesta sobre un equipo no fija el nivel de otra área; decide el renglón de la frase citada", () => {
      const escala = {
        ...ESCALA_DE_PRUEBA,
        areas: [
          ESCALA_DE_PRUEBA.areas[0],
          { ...ESCALA_DE_PRUEBA.areas[0], id: "2", nombre: "Marketing", dimensiones: ESCALA_DE_PRUEBA.areas[0].dimensiones.map((d) => ({ ...d, id: d.id.replace(/^1\./, "2.") })) },
        ],
      };
      const leer = (texto: string, cita: string) => {
        const fuentes = notasParaUbicar({ "sabido:mi0abcde123": texto }, undefined, () => null).fuentes;
        const citada = [{ id: "N1", cita }];
        return leerLaRespuesta(
          respuesta({ niveles: [{ dimensionId: "1.3", nivel: "D", porQue: "x", fuentes: citada }, { dimensionId: "2.3", nivel: "D", porQue: "x", fuentes: citada }], hipotesis: [], tarjetas: [] }),
          { ...ctx(fuentes), escala },
          "run_1",
        ).items.map((it) => (it.destino as { dimensionId: string }).dimensionId);
      };
      const EXCEL = "Cada vendedor anota sus contactos en su propio Excel y nadie los sube al CRM";
      const MAILCHIMP = "Marketing no usa HubSpot para sus correos, todo va por Mailchimp desde hace dos años";
      // La respuesta de Ventas fija Ventas, no Marketing.
      expect(leer(RESPUESTA, EXCEL)).toEqual(["1.3"]);
      expect(areaDeLaCita(RESPUESTA, EXCEL, escala)).toBe("1");
      // Una nota suelta (no responde una pregunta) puede hablar de cualquier área.
      expect(leer(`${EXCEL}.`, EXCEL)).toEqual(["1.3", "2.3"]);
      // Caso A (revisión): un renglón suelto de Marketing junto a una respuesta de Ventas no queda como de Ventas.
      const mezcla = `${MAILCHIMP}.\n${RESPUESTA}`;
      expect(leer(mezcla, MAILCHIMP)).toEqual(["1.3", "2.3"]);
      // Caso B (revisión): una respuesta de Ventas y otra de Marketing en la misma nota; la de Ventas sigue siendo de Ventas.
      const dos = `${RESPUESTA}\nSobre Marketing · Datos (de dónde vienen los contactos): ${MAILCHIMP}.`;
      expect(leer(dos, EXCEL)).toEqual(["1.3"]);
      expect(leer(dos, MAILCHIMP)).toEqual(["2.3"]);
      // Un equipo que no es un área, o una frase que no está, no se sabe: no se descarta.
      expect(areaDeLaCita(`Sobre Dirección · Datos: ${EXCEL}`, EXCEL, escala)).toBeNull();
      expect(areaDeLaCita(RESPUESTA, "algo que la nota no dice en ninguna parte", escala)).toBeNull();
    });

    it("sin notas, el pedido es el de siempre", () => {
      const p = pedidoDePosicionar(ctx([REUNION]));
      expect(String(p.system)).not.toContain("notas del equipo (N1");
      const tool = p.tools![0] as { input_schema: { properties: { niveles: { description: string } } } };
      expect(tool.input_schema.properties.niveles.description).toContain("SOLO con una frase del cliente");
    });

    it("⛔ un nivel puede salir de una nota: su evidencia dice que es una nota del equipo, no una reunión", () => {
      // La misma lectura que «Ubicar» (agente.ts › leerLaRespuestaDeUbicar: esta, solo con los niveles).
      const r = leerLaRespuesta(
        respuesta({
          niveles: [
            {
              dimensionId: "1.1",
              nivel: "D",
              evidencia: "x",
              porQue: "Según una nota del equipo, cada vendedor lleva sus contactos en su Excel.",
              fuentes: [{ id: "N1", cita: "Cada vendedor anota sus contactos en su propio Excel y nadie los sube al CRM" }],
            },
            // Lo que la nota no dice no pasa.
            { dimensionId: "1.2", nivel: "F", evidencia: "x", porQue: "x", fuentes: [{ id: "N1", cita: "tienen un proceso documentado y medido" }] },
          ],
          hipotesis: [],
          tarjetas: [],
        }),
        ctx([...nota, REUNION]),
        "run_1",
      );
      expect(r.items).toHaveLength(1);
      const [it1] = r.items;
      expect(it1.valor).toMatchObject({ nivel: "D", fuente: "vendedor", evidencia: "Cada vendedor anota sus contactos en su propio Excel y nadie los sube al CRM" });
      // Es evidencia (no una hipótesis por explorar) y de dónde sale dice quién y cuándo, como nota del equipo.
      expect(esHipotesisDeNivel(it1)).toBe(false);
      expect(it1.fuentes[0].etiqueta).toBe(`${ROTULO_DE_LA_NOTA} · Liz Flores, ${diaCorto("2026-11-25T15:00:00Z")}`);
      expect(it1.fuentes[0].etiqueta).not.toMatch(/^Reunión/);
      expect(r.descartadas).toBe(1);
    });
  });

  it("la franja de sugerencias no dice «lo que dijo el cliente» de un nivel que sale de una nota", () => {
    const nivel = (id: string, cita: boolean) => ({ destino: { tipo: "nivel" as const, dimensionId: "1.1" }, fuentes: [{ id, etiqueta: "x", ...(cita ? { cita: "frase" } : {}) }] });
    expect(nivelesDeUnaNota([nivel("N1", true), nivel("S1", true), nivel("N2", false), nivel("N0", true)])).toBe(1);
    expect(nivelesSugeridosEnPalabras(2, 0)).toBe("2 niveles con lo que dijo el cliente");
    expect(nivelesSugeridosEnPalabras(3, 1)).toBe("3 niveles con evidencia (1 de una nota del equipo)");
    expect(nivelesSugeridosEnPalabras(1, 1)).toBe("1 nivel con evidencia (de una nota del equipo)");
    expect(nivelesSugeridosEnPalabras(2, 2)).toBe("2 niveles con evidencia (todos de una nota del equipo)");
    expect(nivelesSugeridosEnPalabras(0, 0)).toBe("");
  });

  describe("⛔ lo confirmado no se pisa y lo descartado no vuelve", () => {
    const deUnaNota = (nivel: Letra): ItemPropuesto => {
      const destino = { tipo: "nivel" as const, dimensionId: "1.1" };
      const valor = { nivel, fuente: "vendedor" as const, evidencia: "Cada vendedor anota sus contactos en su propio Excel" };
      return {
        id: idDelItem(destino, valor),
        destino,
        valor,
        fuentes: [{ id: "N1", etiqueta: "Nota del equipo · Liz Flores, 25 nov", cita: valor.evidencia }],
        corridaId: "r",
        en: "2026-11-25T18:00:00Z",
      };
    };

    it("el mismo nivel que el confirmado no se propone; otro distinto queda como sugerencia y lo confirmado sigue igual", () => {
      const confirmado = { "1.1": { nivel: "I" as Letra, fuente: "reunion" as const, evidencia: "Lo dijo en la sesión" } };
      const e = estadoDePrueba(confirmado);
      expect(propuestaVigente({ ...e, propuesta: fusionarPropuestas(e, [deUnaNota("I")]) })).toEqual([]);
      const conOtro = { ...e, propuesta: fusionarPropuestas(e, [deUnaNota("D")]) };
      expect(propuestaVigente(conOtro).map((it) => (it.valor as { nivel: string }).nivel)).toEqual(["D"]);
      expect(conOtro.contenido.chequeo).toEqual(confirmado);
    });

    it("uno que alguien descartó no vuelve por una nota", () => {
      const it1 = deUnaNota("D");
      const e = estadoDePrueba({}, { contenido: { ...estadoDePrueba().contenido, descartadas: [it1.id] } });
      expect(propuestaVigente({ ...e, propuesta: fusionarPropuestas(e, [it1]) })).toEqual([]);
    });
  });

  it("el servidor de «Ubicar» las suma y la corrida guarda cuáles leyó", () => {
    const agente = readFileSync("lib/exploraciones/agente.ts", "utf8");
    expect(agente).toMatch(/notas: \{ notas: estado\.contenido\.notas, autores: estado\.contenido\.autoresDeLasNotas, exploracionId \}/);
    expect(agente).toMatch(/notas: leido\.notasLeidas/);
    const fuentes = readFileSync("lib/exploraciones/posicionar-fuentes.ts", "utf8");
    expect(fuentes).toMatch(/const fuentes: Fuente\[\] = \[\.\.\.notas\.fuentes,/);
    // Una nota no es una reunión: no va a las reuniones de la corrida.
    expect(fuentes).toMatch(/return \{ fuentes, sesionesUsadas: reuniones\.sesiones, notasLeidas: notas\.claves \}/);
  });

  it("lo que leyó cada corrida se lee del Json; sin el campo, no leyó ninguna", () => {
    const corrida = { id: "r1", modo: "posicionar", en: "2026-11-25T18:00:00Z", propuestos: 1, leyo: [], alimento: [], automatica: false };
    const leida = leerPropuesta({ corridas: [{ ...corrida, notas: ["sabido:mi0abcde123", 7], notasEn: "2026-11-25T17:58:00Z" }] }).corridas[0];
    expect(leida.notas).toEqual(["sabido:mi0abcde123"]);
    expect(leida.notasEn).toBe("2026-11-25T17:58:00Z");
    expect(leerPropuesta({ corridas: [{ ...corrida, notas: [], notasEn: "no es una fecha" }] }).corridas[0].notasEn).toBeUndefined();
    expect(leerPropuesta({ corridas: [corrida] }).corridas[0].notas).toBeUndefined();
  });
});
