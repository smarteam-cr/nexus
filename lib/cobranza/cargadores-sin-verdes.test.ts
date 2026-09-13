/**
 * lib/cobranza/cargadores-sin-verdes.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/cargadores-sin-verdes.test.ts --project unit`.
 *
 * Guarda de ARMADO (mismo molde que lib/cobranza/odoo/guardas.test.ts): no prueba qué carga un
 * script, prueba que ningún cargador pueda volver a poner un cobro en verde por su cuenta.
 *
 * ── EL DEFECTO QUE CIERRA ───────────────────────────────────────────────────────
 * `scripts/import-facturaciones-xlsx.ts` escribía `estado` y `confirmadoPor =
 * "import:facturaciones-2026"` según el COLOR de una celda del libro de Alex. Así entraron 83
 * verdes que ninguna persona confirmó, y al menos tres nunca se depositaron. INV3 miraba que
 * hubiera firma, y la había: la del archivo. Y como la carga hacía `upsert` con `update`, volver
 * a correrla pisaba lo que una persona confirmó o revirtió a mano desde entonces.
 *
 * ⚠ Todas las guardas leen el fuente SIN COMENTARIOS: el encabezado del script cuenta la historia
 * citando `confirmadoPor`, y una guarda que se cumple con su propia prosa no guarda nada.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(__dirname, "..", "..");
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const leer = (rel: string) => sinComentarios(readFileSync(join(RAIZ, rel), "utf8"));

/** Lo que cuenta como escribir en la base, por cualquier cliente (`prisma`, `tx`, `db`). */
const ESCRIBE_EN_BASE = /\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw/;
/** Escribir en la tabla Cobro, puntualmente. */
const ESCRIBE_COBRO = /\.cobro\.(create|createMany|update|updateMany|upsert)\(/;

function scripts(dir = "scripts"): string[] {
  const out: string[] = [];
  for (const nombre of readdirSync(join(RAIZ, dir))) {
    if (nombre === "node_modules" || nombre.startsWith(".")) continue;
    const rel = `${dir}/${nombre}`;
    if (statSync(join(RAIZ, rel)).isDirectory()) out.push(...scripts(rel));
    else if (nombre.endsWith(".ts")) out.push(rel);
  }
  return out;
}

describe("el importador del libro de facturación ya no escribe (etapa 1)", () => {
  const IMPORTADOR = "scripts/import-facturaciones-xlsx.ts";
  const src = leer(IMPORTADOR);

  it("⛔ no escribe en ninguna tabla", () => {
    expect(src, `${IMPORTADOR} volvió a escribir en la base`).not.toMatch(ESCRIBE_EN_BASE);
    expect(src).not.toMatch(/\$transaction\(/);
  });

  it("⛔ no firma confirmaciones ni facturas, ni pide permiso para escribir", () => {
    expect(src).not.toMatch(/confirmadoPor|facturadoPor/);
    expect(src).not.toMatch(/import:facturaciones/);
    /* Si vuelve a pedir el guard de escritura es porque alguien le devolvió la carga. */
    expect(src).not.toMatch(/resolverApply|assertProdWriteAllowed/);
  });

  it("y quien lo corre con la bandera de escribir se entera de que no pasó nada", () => {
    expect(src).toMatch(/const PIDE_ESCRITURA = flag\("apply"\)/);
    expect(src).toMatch(/if \(PIDE_ESCRITURA\) \{[\s\S]*?process\.exitCode = 1;/);
  });
});

describe("ningún script pone un cobro en verde por fuera del chokepoint", () => {
  /**
   * La única excepción: arma la base LOCAL de pruebas y su guard (`assertLocalWriteOnly`) aborta
   * contra cualquier host que no sea localhost. Pintar los cinco colores del semáforo es su razón
   * de ser.
   */
  const EXCEPCIONES = new Set(["scripts/seed-fixture.ts"]);

  it("⛔ un script que escribe en Cobro no nombra `confirmadoPor`", () => {
    /* Se busca la FIRMA y no la palabra COBRADO: los seeds de demo crean el cobro y lo pasan a
       verde por `cambiarEstadoCobro`, que es el camino correcto y también dice «COBRADO». Un
       COBRADO escrito a mano SIN firma ya lo caza INV3 en la base. */
    const culpables = scripts()
      .filter((f) => !EXCEPCIONES.has(f))
      .filter((f) => {
        const src = leer(f);
        return ESCRIBE_COBRO.test(src) && /confirmadoPor/.test(src);
      });
    expect(
      culpables,
      "Estos scripts escriben la confirmación de un cobro por su cuenta. COBRADO se escribe solo por " +
        "cambiarEstadoCobro, con el email de una persona (INV3).",
    ).toEqual([]);
  });

  it("la excepción sigue siendo solo-local (si pierde su guard, deja de ser excepción)", () => {
    for (const f of EXCEPCIONES) expect(leer(f), `${f} perdió assertLocalWriteOnly`).toMatch(/assertLocalWriteOnly\(/);
  });

  it("el escaneo encuentra scripts (si no, pasa por vacío)", () => {
    expect(scripts().length).toBeGreaterThan(50);
  });
});
