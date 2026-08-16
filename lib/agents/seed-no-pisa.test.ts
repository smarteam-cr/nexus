import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * lib/agents/seed-no-pisa.test.ts — UN SEED QUE PISA UN PROMPT CALIBRADO BORRA TRABAJO HUMANO.
 *
 * ── EL DAÑO, QUE YA OCURRIÓ ──────────────────────────────────────────────────
 * Los prompts viven en la base para poder calibrarlos desde `/agents` sin deploy. Un script de
 * seed que hace `upsert` escribiendo `systemPrompt` incondicionalmente **borra esa calibración**
 * y no deja rastro: la corrida siguiente sale peor y nadie relaciona una cosa con la otra. Es
 * irrecuperable salvo que alguien se acuerde de qué había escrito.
 *
 * El molde correcto existe desde hace tiempo (`create-cs-watchdog-agent.ts`): leer el prompt vivo,
 * compararlo, y AVISAR en vez de pisar salvo `--force`.
 *
 * ── POR QUÉ UN TRINQUETE Y NO UNA PROHIBICIÓN ────────────────────────────────
 * Medido el 2026-08-16: **23 de 29** seeds que escriben prompts NO comparan. Exigirlos a todos
 * dejaría este archivo en rojo desde el día uno, y una guarda que nace roja se borra por molesta
 * antes de arreglar nada.
 *
 * Así que el número solo puede BAJAR. Eso alcanza para lo que importa: un script NUEVO no puede
 * nacer pisando, y cada vez que alguien arregla uno viejo el trinquete se ajusta solo. Si el
 * número sube, el test dice exactamente cuál lo subió.
 */

const RAIZ = process.cwd();
const SCRIPTS = path.join(RAIZ, "scripts");

/**
 * Cuántos seeds escriben `systemPrompt` sin comparar contra lo que hay en la base.
 *
 * ⚠ SOLO PUEDE BAJAR. Si arreglás uno, bajá este número. Si sube, algo nuevo nació pisando.
 */
const TOPE_QUE_PISAN = 23;

/** Scripts que escriben un prompt de agente vía `agent.upsert` / `agent.update`. */
function seedsDePrompt(): string[] {
  return fs
    .readdirSync(SCRIPTS)
    .filter((f) => f.endsWith(".ts"))
    .filter((f) => {
      const s = fs.readFileSync(path.join(SCRIPTS, f), "utf8");
      return /prisma\.agent\.(upsert|update)\b/.test(s) && s.includes("systemPrompt");
    });
}

/** Compara el prompt vivo antes de escribirlo (el molde de `create-cs-watchdog-agent.ts`). */
function compara(archivo: string): boolean {
  const s = fs.readFileSync(path.join(SCRIPTS, archivo), "utf8");
  return /systemPrompt\s*!==/.test(s);
}

describe("⭐ el trinquete de los seeds que pisan", () => {
  const seeds = seedsDePrompt();

  it("hay seeds que censar (el escaneo no se quedó vacío)", () => {
    /* Si `scripts/` se moviera o el patrón cambiara, la lista daría [] y el trinquete pasaría en
       verde sin mirar nada — la forma clásica en que un censo se vuelve decorativo. */
    expect(seeds.length).toBeGreaterThan(10);
  });

  it("el número de los que PISAN no subió", () => {
    const pisan = seeds.filter((f) => !compara(f));
    expect(
      pisan.length,
      `Hay ${pisan.length} seeds que escriben systemPrompt sin comparar (el tope declarado es ` +
        `${TOPE_QUE_PISAN}). Un seed que pisa borra la calibración humana sin dejar rastro. ` +
        `Copiá el molde de create-cs-watchdog-agent.ts:\n${pisan.join("\n")}`,
    ).toBeLessThanOrEqual(TOPE_QUE_PISAN);
  });

  it("y si BAJÓ, hay que ajustar el tope", () => {
    /* Sin esto el trinquete se afloja solo: alguien arregla cinco scripts, el tope queda en 23,
       y cinco nuevos pueden nacer pisando sin que nada se ponga rojo. */
    const pisan = seeds.filter((f) => !compara(f));
    expect(
      pisan.length,
      `Bajaron a ${pisan.length}: actualizá TOPE_QUE_PISAN para que el trinquete no se afloje.`,
    ).toBe(TOPE_QUE_PISAN);
  });
});

describe("los seeds de los briefs citados NO pisan", () => {
  /* Son los dos que redactan afirmaciones sobre un cliente, y su prompt es lo que sostiene la
     regla de procedencia. Perder una calibración acá no degrada el estilo: degrada qué se
     considera una afirmación válida. */
  for (const f of ["create-cs-account-brief-agent.ts", "create-project-brief-agent.ts"]) {
    it(f, () => {
      expect(fs.existsSync(path.join(SCRIPTS, f)), `${f} no existe`).toBe(true);
      expect(compara(f), `${f} pisa el prompt sin comparar`).toBe(true);
      expect(
        fs.readFileSync(path.join(SCRIPTS, f), "utf8"),
        `${f} no ofrece la salida --force`,
      ).toContain("--force");
    });
  }
});
