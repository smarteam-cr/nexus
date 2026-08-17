/**
 * lib/sessions/duenio-manual.test.ts — NADIE ESCRIBE EL DUEÑO SIN DECIR DE DÓNDE SALIÓ.
 *
 * ── EL INCIDENTE ─────────────────────────────────────────────────────────────
 * En un demo, una reunión se agregó a un proyecto interno desde el modal. Ese gesto estampa
 * `manualClientId` (la ADOPCIÓN). Después se borró el proyecto —que no lo deshace, porque el sello
 * vive en la sesión y no en el vínculo— y más tarde el cliente, con lo cual el sello quedó
 * apuntando a un id muerto. La reunión desapareció del buscador y no volvió nunca.
 *
 * Para rescatarla no faltaba código: faltaba EL DATO. `manualClientId` lo escriben dos gestos que
 * en la base se ven idénticos —una persona eligiendo, y la adopción automática— y un «deshacer»
 * sin saber cuál fue estaría adivinando.
 *
 * ── POR QUÉ ESTA GUARDA, Y NO UN TEST DE COMPORTAMIENTO ──────────────────────
 * El modo de falla no es que el chokepoint calcule mal: es que alguien escriba `manualClientId`
 * POR SU CUENTA y se olvide de la procedencia. Esa fila queda indistinguible de una histórica, el
 * rescate vuelve a ser imposible para ella, y **nada falla** — ni tsc, ni ningún test de
 * comportamiento. Solo un escaneo del fuente lo caza.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { esDeshacibleAutomaticamente } from "./duenio-manual";

const RAIZ = path.resolve(__dirname, "..", "..");

/**
 * El fuente SIN comentarios (se blanquean, no se borran).
 *
 * ⚠ Sin esto, el propio docblock que EXPLICA por qué nadie debe escribir `manualClientId` hace
 * fallar a la guarda que lo prohíbe. Mencionar no es usar. Es el cuarto lugar del repo con el
 * mismo blanqueo.
 */
function soloCodigo(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

/** Recorre lib/, app/ y scripts/ buscando escrituras de `manualClientId`. */
function archivosDeCodigo(): string[] {
  const out: string[] = [];
  const anda = (rel: string) => {
    const abs = path.join(RAIZ, rel);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = path.join(rel, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next") continue;
        anda(r);
      } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
        out.push(r);
      }
    }
  };
  anda("lib");
  anda("app");
  anda("scripts");
  return out;
}

describe("⛔ el sello y su procedencia se escriben JUNTOS o no se escriben", () => {
  /**
   * Quiénes pueden escribir `manualClientId` fuera del chokepoint, y por qué.
   * Solo puede encoger.
   */
  const EXENTOS: Record<string, string> = {
    "lib/sessions/duenio-manual.ts": "es el chokepoint: acá vive la única escritura",
    "scripts/merge-duplicate-clients.ts":
      "re-apunta el sello existente a otro Client al fusionar duplicados; NO cambia la procedencia, que sigue siendo la que ya estaba",
    "scripts/corregir-sesiones-cruzadas.ts":
      "script de corrección puntual, corrido a mano contra un incidente y con dry-run",
    "scripts/reassign-cross-client-to-project-client.ts":
      "reasignación masiva puntual, mismo criterio que el anterior",
    "app/api/clients/[id]/route.ts":
      "NULEA el sello antes de borrar el cliente, dentro de la misma transacción — es lo contrario de asignar, y otra guarda (punteros-al-borrar) EXIGE que esa escritura exista",
  };

  /**
   * ¿Este bloque `data: {…}` escribe la columna, o solo la menciona?
   *
   * ⚠ La primera versión buscaba el nombre en cualquier parte del bloque y marcó a `meet-sync.ts`,
   * que solo lo LEE y lo pasa como argumento a `resolveSessionClientId({ …, manualClientId })`
   * dentro de un `data:`. Una guarda que grita de más termina llena de excepciones generales, y
   * ahí deja de proteger. Se exige que sea una CLAVE: al principio de su línea, o la primera de
   * un objeto en línea.
   */
  function escribeLaColumna(bloque: string): boolean {
    return /^\s*manualClientId\s*:/m.test(bloque) || /\{\s*manualClientId\s*:/.test(bloque);
  }

  it("nadie fuera del chokepoint escribe manualClientId", () => {
    const intrusos: string[] = [];
    for (const rel of archivosDeCodigo()) {
      if (rel.split(path.sep).join("/") in EXENTOS) continue;
      const src = soloCodigo(fs.readFileSync(path.join(RAIZ, rel), "utf8"));
      const bloques = src.match(/data\s*:\s*\{[^}]*\}/g) ?? [];
      if (bloques.some(escribeLaColumna)) {
        intrusos.push(rel.split(path.sep).join("/"));
      }
    }
    expect(
      intrusos,
      `Estos archivos escriben manualClientId sin pasar por asignarDuenioManual:\n` +
        `${intrusos.join("\n")}\n\n` +
        `Una fila con sello y sin procedencia es indistinguible de una histórica: el rescate se ` +
        `vuelve imposible para esa sesión y nada falla. Usá lib/sessions/duenio-manual.ts.`,
    ).toEqual([]);
  });

  it("los dos caminos de producción pasan por el chokepoint, con su origen", () => {
    const patch = fs.readFileSync(path.join(RAIZ, "app/api/sessions/[id]/route.ts"), "utf8");
    expect(patch, "el PATCH dejó de usar el chokepoint").toContain("asignarDuenioManual(");
    expect(patch, "el PATCH no declara que es una decisión humana").toContain('origen: "humano"');

    const adopcion = fs.readFileSync(path.join(RAIZ, "lib/sessions/project-sources.ts"), "utf8");
    expect(adopcion, "la adopción dejó de usar el chokepoint").toContain("asignarDuenioManual(");
    expect(adopcion, "la adopción no se declara como tal").toContain('origen: "adopcion"');
  });

  it("⚠ el PATCH sabe QUIÉN lo hizo", () => {
    /* `withAuth` verifica que haya sesión pero descarta al usuario. Sin volver a pedirlo, el
       autor queda en null y la procedencia sirve para saber que fue humano pero no a quién
       preguntarle cuando una reunión aparece en el cliente equivocado. */
    const patch = fs.readFileSync(path.join(RAIZ, "app/api/sessions/[id]/route.ts"), "utf8");
    expect(patch).toContain("guardInternalUser()");
    expect(patch).toContain("actorEmail:");
  });
});

describe("qué se puede deshacer solo", () => {
  it("solo lo adoptado", () => {
    expect(esDeshacibleAutomaticamente("adopcion")).toBe(true);
  });

  it("⛔ una decisión humana NO", () => {
    expect(esDeshacibleAutomaticamente("humano")).toBe(false);
  });

  it("⛔ una fila histórica tampoco: no se puede distinguir de una humana", () => {
    /* Suponer «adopción» para poder limpiarlas es exactamente el error que este módulo existe
       para no cometer: pisaría decisiones deliberadas que nadie puede recuperar. */
    expect(esDeshacibleAutomaticamente(null)).toBe(false);
    expect(esDeshacibleAutomaticamente(undefined)).toBe(false);
  });
});
