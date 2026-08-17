import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * lib/agents/pendiente-es-compromiso.test.ts — MENOS Y MÁS DUROS.
 *
 * ── LO QUE SE MIDIÓ (2026-08-16, contra producción) ─────────────────────────
 * 3.211 pendientes vivos · 26 cerrados (0,8 %) · 1 descartado. El 98,7 % los emite este agente,
 * ~35 por día, y los 3.185 sin hacer son TODOS de los últimos 90 días — o sea que no es un pasivo
 * histórico: es una canilla abierta. Los 2 que escribió una persona a mano cierran al 50 %.
 *
 * No falla la calidad del dato (3 de cada 4 tienen dueño) ni la superficie (se ven en el widget
 * del proyecto y en el vigilante, y el botón de cerrar existe). Falla el VOLUMEN: una lista de 340
 * en un solo cliente no se recorre, y una lista que no se recorre no se cierra.
 *
 * ── LA REGLA VIEJA NO ERA FLOJA: ERA BLANDA ─────────────────────────────────
 * Decía «máximo 8, prioriza calidad sobre cantidad, solo lo verdaderamente accionable». Eso es un
 * criterio que el modelo no puede verificar, así que emitía cerca del tope siempre. La regla nueva
 * es DURA y comprobable: las tres cosas juntas —qué, quién, para cuándo— o no se emite. Y dice
 * explícitamente que la lista vacía es un resultado correcto y frecuente, porque sin eso el modelo
 * fuerza uno para no devolver nada.
 *
 * Decisión de Elías (2026-08-16), sobre tres opciones: subir la vara del agente · que caduquen
 * solos · aceptar que son notas.
 */

const RAIZ = process.cwd();
const SEED = "scripts/seed-post-session-agent.ts";
const src = fs.readFileSync(path.join(RAIZ, SEED), "utf8");

describe("⛔ un pendiente es un COMPROMISO, no un tema", () => {
  it("exige las tres cosas juntas: qué, quién y para cuándo", () => {
    /* Sin la bandera `s` (que este target de TS no admite): `[\s\S]` hace lo mismo. */
    expect(src, "se perdió el criterio duro").toMatch(
      /QU[ÉE] va a hacer[\s\S]*QUI[ÉE]N[\s\S]*PARA CU[ÁA]NDO/,
    );
  });

  it("⚠ y NO deja emitirlo con dueño o fecha en null", () => {
    /* Es la diferencia entre la regla vieja y la nueva. Antes `ownerEmail`/`dueDate` podían venir
       null «si no está claro», lo que convertía cualquier tema conversado en una fila que alguien
       tiene que cerrar. Ahora la falta de esos campos es motivo de NO emitir. */
    expect(src).toMatch(/ownerEmail: OBLIGATORIO/);
    expect(src).toMatch(/dueDate: OBLIGATORIO/);
    expect(src, "volvió el «si no, null» que abría la puerta").not.toMatch(
      /ownerEmail solo si el responsable está claro\. Si no, null/,
    );
  });

  it("⭐ y dice que la lista VACÍA es correcta", () => {
    /* Sin esto el modelo fuerza uno para no devolver nada — el modo de falla clásico de una
       instrucción restrictiva sin permiso explícito de devolver cero. */
    expect(src, "se perdió el permiso de no emitir nada").toMatch(
      /lista VAC[ÍI]A es un resultado correcto/,
    );
  });

  it("y el tope bajó de 8 a 5", () => {
    expect(src).toMatch(/Tope: 5/);
    expect(src, "volvió el tope viejo").not.toMatch(/M[áa]ximo 8 actionItems/);
  });

  it("⚠ el porqué queda ESCRITO, con el número", () => {
    /* Una regla dura sin su motivo se ablanda en la primera revisión que la encuentre molesta. El
       0,8 % es el argumento, y tiene que viajar con la regla. */
    expect(src).toContain("0,8 %");
    expect(src).toContain("3.211");
  });
});

describe("⛔ el seed dejó de pisar el prompt vivo", () => {
  it("compara antes de escribir, y avisa", () => {
    /* El prompt vive en la base para calibrarlo desde /agents sin deploy. Un seed que lo
       sobreescribe borra esa calibración sin dejar rastro. Y no es hipotético: el 2026-08-16 el
       vivo (3.789 chars, tocado el 24-may) ya difería del archivo. */
    expect(src, "el seed volvió a escribir sin comparar").toMatch(
      /vivo\.systemPrompt !== POST_SESSION_SYSTEM_PROMPT/,
    );
    expect(src, "no hay salida temprana: compara y escribe igual").toMatch(
      /!force\s*\)\s*\{[\s\S]{0,700}return;/,
    );
  });

  it("y `--force` es la única forma de reemplazarlo", () => {
    expect(src).toMatch(/const force = process\.argv\.includes\("--force"\)/);
  });

  it("⚠ el aviso dice los DOS tamaños, para poder decidir", () => {
    /* «Difiere» no alcanza: sin ver de qué tamaño es la diferencia y de cuándo es la edición
       viva, la decisión de forzar se toma a ciegas. */
    expect(src).toContain("vivo.systemPrompt.length");
    expect(src).toContain("POST_SESSION_SYSTEM_PROMPT.length");
    expect(src).toContain("vivo.updatedAt");
  });
});
