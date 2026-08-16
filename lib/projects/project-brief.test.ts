import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * lib/projects/project-brief.test.ts — EL RUNNER NO PUEDE INVENTARSE SU PROPIA HONESTIDAD.
 *
 * ── QUÉ PROTEGE ──────────────────────────────────────────────────────────────
 * El brief por proyecto y el de cuenta comparten TRES piezas: la validación de citas, el armado
 * del contexto y la llamada al modelo con su reintento por truncado. Compartirlas fue la decisión
 * de fondo, y el modo de falla es que alguien las re-implemente «para no acoplar»:
 *
 *  · Re-implementar la validación → una copia se relaja para tolerar un caso raro y ese documento
 *    empieza a dejar pasar afirmaciones sin fuente, mientras el otro sigue estricto. Nada avisa.
 *  · Re-implementar el armado → el texto y el mapa se pueden desincronizar de nuevo, y las citas
 *    empiezan a descartarse en silencio.
 *  · Re-implementar la llamada → alguien sube el tope de tokens de un lado y el otro sigue
 *    truncándose, con el mismo mensaje genérico y ninguna pista de por qué solo pasa en uno.
 *
 * Es un escaneo y no un test de comportamiento porque el runner toca base y red: lo que se puede
 * afirmar sin montar ninguna de las dos es DE DÓNDE saca cada garantía.
 */

const RAIZ = process.cwd();
const RUNNER = "lib/projects/project-brief.ts";
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (rel: string) =>
  leer(rel)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

describe("⭐ las tres garantías se IMPORTAN, no se copian", () => {
  it("la validación de citas viene del módulo compartido", () => {
    expect(leer(RUNNER)).toContain('from "@/lib/cs/brief-citas"');
    expect(leer(RUNNER)).toContain("parsearBriefCitado(");
  });

  it("el armado del contexto también", () => {
    expect(leer(RUNNER)).toContain("armarContextoDeBrief(");
  });

  it("y la llamada al modelo con su reintento", () => {
    expect(leer(RUNNER)).toContain("generarTextoDeBrief(");
  });

  it("⚠ el runner NO habla con el modelo por su cuenta", () => {
    /* La forma en que esto se rompe no es borrando el import: es agregando una llamada directa
       «para este caso puntual», que nace sin el reintento por truncado. */
    expect(sinComentarios(RUNNER), "el runner llama a la API directo").not.toMatch(
      /anthropic\.messages\.create/,
    );
  });
});

describe("⛔ la corrida nace ANTES de leer el contexto", () => {
  it("el `agentRun.create` va antes del cargador", () => {
    /* Es la garantía que hace que una falla al armar el contexto quede con su causa en
       `AgentRun.output` en vez de desaparecer. Invertir el orden se ve más eficiente —no crear la
       corrida si no hay datos— y convierte todo error temprano en un fallo mudo. */
    const src = sinComentarios(RUNNER);
    const iRun = src.indexOf("agentRun.create");
    const iCarga = src.indexOf("cargarDatos(projectId)");
    expect(iRun).toBeGreaterThan(-1);
    expect(iCarga).toBeGreaterThan(-1);
    expect(iRun, "la corrida se crea DESPUÉS de leer: un fallo temprano quedaría mudo").toBeLessThan(
      iCarga,
    );
  });

  it("todo camino de salida deja la causa escrita", () => {
    // Un `return` temprano sin marcar dejaría la corrida en RUNNING para siempre.
    const src = leer(RUNNER);
    expect(src).toContain("marcarError(");
    expect(src, "el catch no registra la causa").toMatch(/catch \(e\)[\s\S]{0,200}marcarError\(/);
  });
});

describe("sin material NO se llama al modelo", () => {
  it("se corta antes, con un mensaje que dice el hueco real", () => {
    /* Llamarlo para que descarte todo y lance sería tirar plata, y el error que saldría
       —«ningún statement con fuente válida»— mandaría a investigar el prompt en vez del hueco
       verdadero: que no hay de dónde sacar nada. */
    const src = sinComentarios(RUNNER);
    expect(src).toContain("ctx.sources.size === 0");
    const iCorte = src.indexOf("ctx.sources.size === 0");
    const iLlamada = src.indexOf("generarTextoDeBrief(");
    expect(iCorte, "el corte por falta de material quedó DESPUÉS de la llamada").toBeLessThan(
      iLlamada,
    );
  });
});

describe("⚠ una marca de vencido puesta DURANTE la generación sobrevive", () => {
  it("solo se limpia lo anterior a la lectura del contexto", () => {
    /* Con dos PCs sobre la misma base, algo puede marcar el brief como vencido mientras el modelo
       escribe. Limpiar `staleAt` a secas borraría un aviso sobre algo que este resumen NO vio, y
       el resultado sería un resumen que se dice fresco sin serlo — el fallo exacto que
       `brief-vencido.ts` existe para evitar. */
    const src = sinComentarios(RUNNER);
    expect(src).toContain("staleAt: { lt: leidoEn }");
    expect(src, "la marca temporal se toma después de leer").toMatch(
      /const leidoEn = new Date\(\);[\s\S]{0,200}cargarDatos\(/,
    );
  });
});

describe("el agente sin sembrar no es un error", () => {
  it("devuelve `skipped`, no `error`", () => {
    /* Es un estado de configuración. Tratarlo como falla llenaría el feed de corridas rojas que
       no son culpa de nadie, y ahí el rojo deja de significar algo. */
    expect(leer(RUNNER)).toMatch(/if \(!agent\) return \{ status: "skipped", reason: "agent_not_seeded" \}/);
  });
});
