/**
 * lib/agents/timeline-assist.test.ts
 *
 * Correr: `npx vitest run lib/agents/timeline-assist.test.ts --project unit`.
 *
 * ── LO QUE ESTE ARCHIVO CUIDA ────────────────────────────────────────────────────────────────
 * El 2026-08-18 el prompt del modificador del cronograma se mudó de un `const` dentro de la ruta
 * a la tabla `Agent`. La mudanza compra calibración sin deploy y abre DOS agujeros que ningún
 * test de comportamiento ve, porque en los dos el sistema sigue respondiendo 200:
 *
 *   1. ⛔ EL AGENTE PASA A SER DESPACHABLE DESDE `/analyze`. Antes no tenía fila, así que no
 *      existía para nadie más que su propia ruta. Ahora la tiene — y `resolveArtifactGate`
 *      despacha por `agentGroup`: un grupo que su `switch` no declara cae al `default`, devuelve
 *      `null`, y el agente CORRE SIN CELDA DE PERMISO, en silencio. Es el incidente exacto que
 *      ya ocurrió con una variante del detalle de cronograma (auditoría 2026-08-08).
 *   2. El texto del prompt podría quedar en DOS copias (la del seed y la del respaldo de la
 *      ruta). Dos copias divergen calladas y después nadie sabe cuál corrió.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ID_ASSIST_CRONOGRAMA,
  GRUPO_ASSIST_CRONOGRAMA,
  PROMPT_ASSIST_CRONOGRAMA,
} from "./timeline-assist";
import { PARTY_VALUES, TASK_TYPE_VALUES } from "@/lib/timeline/validate";

const RAIZ = process.cwd();

/** El fuente sin comentarios: la prosa que explica el bug nombra los mismos símbolos vigilados. */
function fuente(rel: string): string {
  return fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
    .join("\n");
}

const RUTA_ASSIST = "app/api/projects/[projectId]/timeline/assist/route.ts";
const GATE = "lib/auth/permissions/artifact-gate.ts";
const SEED = "scripts/seed-timeline-assist-agent.ts";
const MODULO = "lib/agents/timeline-assist.ts";

describe("la celda de permiso del modificador", () => {
  it("LA GUARDA: el case del cronograma nombra al modificador", () => {
    /* La edición que la pone en rojo: sacar `ID_ASSIST_CRONOGRAMA` de la condición del
       `case "cronograma"`. Con eso, un POST a /api/clients/[id]/analyze con este agentId
       resuelve gate `null` y corre sin pedirle ninguna celda a nadie — 200, sin log, sin rastro. */
    const gate = fuente(GATE);
    const i = gate.indexOf('case "cronograma"');
    expect(i, "cambió el case del cronograma; revisar esta guarda").toBeGreaterThan(-1);
    const tramo = gate.slice(i, i + 900);
    expect(tramo.length, "la guarda no está mirando nada").toBeGreaterThan(300);
    expect(
      tramo,
      "el modificador del cronograma cayó fuera del gate: correría SIN celda de permiso",
    ).toContain("ID_ASSIST_CRONOGRAMA");
    // Y el símbolo tiene que estar realmente importado, no ser una palabra suelta en prosa.
    expect(gate, "el gate no importa el id del modificador").toContain(
      'from "@/lib/agents/timeline-assist"',
    );
  });

  it("el grupo es uno que el switch declara (no uno nuevo)", () => {
    /* Un `agentGroup` inventado cae al `default` — que solo conoce a agent-mapeo-inicial — y
       devuelve null. Además rompería la biyección grupo↔pieza de lib/pieces/registry.ts. */
    expect(fuente(GATE)).toContain(`case "${GRUPO_ASSIST_CRONOGRAMA}"`);
  });

  it("el seed siembra ESE grupo, no otro", () => {
    // Si el seed escribiera un grupo distinto del que el gate declara, la fila nacería fuera
    // del gate aunque el `case` esté perfecto.
    expect(fuente(SEED)).toContain("GRUPO_ASSIST_CRONOGRAMA");
  });
});

describe("una sola copia del prompt", () => {
  it("la ruta lo lee de la tabla y cae al módulo compartido", () => {
    const src = fuente(RUTA_ASSIST);
    expect(src, "la ruta dejó de leer la fila de Agent").toContain("prisma.agent");
    expect(src, "la ruta dejó de importar el prompt compartido").toContain(
      'from "@/lib/agents/timeline-assist"',
    );
    // El texto NO puede volver a vivir en la ruta: sería la segunda copia.
    expect(
      src.includes("REGLAS DURAS:"),
      "el prompt volvió a estar transcrito dentro de la ruta — dos copias divergen calladas",
    ).toBe(false);
  });

  it("solo la fila ACTIVE gana; una en DRAFT cae al respaldo", () => {
    /* Un agente en DRAFT con prompt a medio escribir no puede correr sobre un cronograma real.
       La edición que la pone en rojo: sacar el chequeo de status del resolver de la ruta. */
    const src = fuente(RUTA_ASSIST);
    const i = src.indexOf("async function resolverAgenteDelAssist");
    expect(i, "desapareció el resolver del prompt").toBeGreaterThan(-1);
    const cuerpo = src.slice(i, i + 700);
    expect(cuerpo, "el resolver dejó de exigir ACTIVE").toContain('"ACTIVE"');
    expect(cuerpo, "el resolver dejó de tener respaldo").toContain("PROMPT_ASSIST_CRONOGRAMA");
  });

  it("el seed compara antes de pisar", () => {
    /* `seed-handoff-agent.ts` escribe incondicionalmente y ya costó calibraciones hechas a mano.
       El molde correcto es el de handoff-por-tipo: avisa y saltea salvo --force. */
    const seed = fuente(SEED);
    expect(seed).toContain("--force");
    expect(seed, "el seed pisa el prompt vivo sin compararlo").toContain(
      "existing.systemPrompt !== PROMPT_ASSIST_CRONOGRAMA",
    );
  });
});

describe("el formato de salida gana dueño y tipo", () => {
  it("nombra los valores válidos, y salen del validador (no transcritos)", () => {
    /* Es lo que arregla el síntoma: hasta hoy toda tarea que el modificador creaba nacía con
       `party` y `type` en null, así que el Gantt no podía decir de quién era ni si era reunión.
       Derivados del validador y no transcritos: el día que entre un quinto dueño al enum, el
       prompt lo nombra solo. Transcritos, el modelo seguiría emitiendo los cuatro viejos.
       La edición que la pone en rojo: reemplazar la interpolación por la lista escrita a mano. */
    for (const v of PARTY_VALUES) {
      expect(PROMPT_ASSIST_CRONOGRAMA, `el prompt no nombra party=${v}`).toContain(v);
    }
    for (const v of TASK_TYPE_VALUES) {
      expect(PROMPT_ASSIST_CRONOGRAMA, `el prompt no nombra type=${v}`).toContain(v);
    }
    const modulo = fs.readFileSync(path.join(RAIZ, MODULO), "utf8");
    expect(
      modulo,
      "los valores volvieron a estar transcritos: un valor nuevo del enum no llegaría al prompt",
    ).toContain("PARTY_VALUES.join(");
    expect(modulo).toContain("TASK_TYPE_VALUES.join(");
  });

  it("el ejemplo de la respuesta trae los dos campos", () => {
    // El modelo copia el ejemplo. Sin ellos ahí, las reglas de arriba se ignoran en la práctica.
    const ejemplo = PROMPT_ASSIST_CRONOGRAMA.slice(
      PROMPT_ASSIST_CRONOGRAMA.indexOf("FORMATO DE RESPUESTA"),
    );
    expect(ejemplo).toContain('"party"');
    expect(ejemplo).toContain('"type"');
  });

  it("prohíbe explícitamente limpiar a null lo que puso una persona", () => {
    // `party` lo edita el CSE a mano en el Gantt. Un `null` del modelo lo borraría por omisión
    // deliberada — y el PUT lo escribiría sin chistar (null !== undefined en su contrato).
    expect(PROMPT_ASSIST_CRONOGRAMA).toContain("NUNCA los pongas en null");
  });

  it("el id del agente es el mismo slug con el que se mide el gasto", () => {
    const src = fuente(RUTA_ASSIST);
    expect(src).toContain("SLUG_ASSIST_CRONOGRAMA = ID_ASSIST_CRONOGRAMA");
    expect(ID_ASSIST_CRONOGRAMA).toBe("agent-timeline-assist");
  });
});
