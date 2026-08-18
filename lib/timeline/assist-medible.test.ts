import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * lib/timeline/assist-medible.test.ts — EL MODIFICADOR DE CRONOGRAMA SE PUEDE MEDIR.
 *
 * ── EL MODO DE FALLA QUE ESTO CAZA ───────────────────────────────────────────
 * No es que alguien rompa la medición: es que se desarme sin que nada falle. Hasta el 2026-08-18
 * este camino llamaba a Claude SIN crear corrida y SIN envolver el contexto de gasto, así que sus
 * filas de `LlmCall` salían con `agentSlug`, `clientId` y `triggeredByEmail` en null. El
 * modificador funcionaba perfecto y era invisible: imposible responder «¿cuántas veces se usa?» y
 * «¿qué proporción se aplica?».
 *
 * Esas dos preguntas son las que deciden si al modificador le hace falta un chat encima o
 * simplemente más contexto. Un plan de tres tramos cuelga de que este número exista.
 *
 * ⚠ Sacar `conContextoDeIA` no rompe NADA visible: la propuesta sale igual, el CSE no nota
 * diferencia, ningún test de negocio falla. Solo se apaga el instrumento. Por eso la guarda es
 * estructural y mira el fuente.
 */

const RAIZ = process.cwd();
const ASSIST = "app/api/projects/[projectId]/timeline/assist/route.ts";
const PUT = "app/api/projects/[projectId]/timeline/route.ts";
const CANVAS = "components/canvas/CronogramaCanvas.tsx";

const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

describe("⭐ la propuesta del modificador deja rastro", () => {
  const src = leer(ASSIST);

  it("crea una corrida ANTES de llamar al modelo", () => {
    /* Antes y no después: si Claude falla, tiene que quedar el registro de que se intentó —
       una racha de errores es parte de la medición, no ruido a filtrar. */
    const iRun = src.indexOf("prisma.agentRun.create");
    const iClaude = src.indexOf("anthropic.messages.create");
    expect(iRun, "el assist dejó de crear AgentRun").toBeGreaterThan(-1);
    expect(iClaude, "no se encontró la llamada a Claude").toBeGreaterThan(-1);
    expect(iRun, "la corrida se crea DESPUÉS de llamar al modelo: un fallo no dejaría rastro").toBeLessThan(iClaude);
  });

  it("⛔ la llamada a Claude va envuelta en `conContextoDeIA`", () => {
    /* Sin el wrap la llamada se mide igual —el chokepoint no depende de esto— pero la fila sale
       sin agente, sin cliente y sin quién apretó el botón. Y peor: `claseDeGasto` la toma como
       AUTOMÁTICA, así que cuando el tope se encienda, el modificador va a ser lo primero que
       muera, a mitad de trabajo de una persona. */
    const i = src.indexOf("anthropic.messages.create");
    const tramo = src.slice(Math.max(0, i - 400), i);
    expect(tramo.length, "la guarda no está mirando nada").toBeGreaterThan(100);
    expect(tramo, "la llamada a Claude salió del contexto de gasto").toContain("conContextoDeIA(");
  });

  it("la respuesta devuelve el `assistRunId`", () => {
    expect(src, "sin devolverlo, el desenlace no se puede cerrar del otro lado").toContain("assistRunId: run.id");
  });
});

describe("⭐ el desenlace se cierra donde la escritura ocurre", () => {
  it("el PUT lee `assistRunId` y marca la corrida", () => {
    /* Se marca en el PUT y no en el front porque el PUT es donde la escritura REALMENTE pasó.
       Marcarlo desde el navegador contaría como aplicada una propuesta que falló al guardar. */
    const src = leer(PUT);
    expect(src, "el PUT dejó de leer assistRunId").toContain("rawObj.assistRunId");
    expect(src, "el PUT no marca el desenlace").toContain('desenlace: "aplicada"');
  });

  it("⛔ el canvas lleva el runId desde la propuesta hasta el «Aplicar»", () => {
    /* El eslabón que más fácil se corta: son dos puntos distintos del mismo archivo, y perder
       cualquiera de los dos deja el número en cero sin ningún síntoma. */
    const src = leer(CANVAS);
    expect(src, "el canvas dejó de guardar el runId de la propuesta").toContain("runId: data.assistRunId");
    expect(src, "el canvas no manda el runId al aplicar").toContain("assistRunId: proposalMeta.current.runId");
  });
});
