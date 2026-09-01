/**
 * lib/cobranza/ids-de-base.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/ids-de-base.test.ts --project unit`.
 *
 * ── EL DEFECTO QUE ESTA GUARDA EXISTE PARA QUE NO VUELVA ────────────────────────
 * Alexander no podía guardar un cambio de salario. El error que veía era la palabra
 * **"Invalid cuid"**, sin más contexto — un mensaje de Zod, en inglés, dentro de una app
 * en español.
 *
 * La causa: `teamMemberId: z.string().cuid()`. El schema de Prisma declara
 * `@default(cuid())`, pero eso solo rige para las filas que CREÓ la app. Las 14 personas más
 * viejas de `TeamMember` entraron por siembra con **UUID**, y `.cuid()` las rechazaba.
 *
 * ⚠ Por eso el bug parecía intermitente y sin patrón: **dependía de a QUIÉN se le editaba el
 * salario.** Con las 6 personas de id cuid la pantalla funcionaba perfecto. Con las otras 13
 * —incluidos el propio Alexander (CFO), Elías, y Alejandra Ortega— fallaba siempre.
 *
 * ⚠⚠ Y dejó rastro en los datos: el aumento de Alejandra del 31-ago tuvo que entrar con un
 * script (`script:corregir-nomina-2026-08`) porque la pantalla no podía. Cuando aparezca un
 * dato de producción escrito por un script en vez de por la app, vale la pena preguntarse si
 * la app podía.
 *
 * La lección que sostiene esta guarda: **validar la FORMA de un id no protege de nada.** Quien
 * lo recibe lo busca en la base, y esa búsqueda es la única validación que decide algo. Un
 * chequeo de formato solo puede producir falsos negativos sobre datos legítimos.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { idDeBase, costoPatchSchema, cuentaCreateSchema } from "./schema";

/** Ids REALES de producción. Son el caso de prueba, no ejemplos inventados. */
const UUID_DE_ELIAS = "58d8027e-d4c9-4c55-bbf0-ffa70341085d";
const UUID_DE_ALEJANDRA = "028d722e-235d-4110-92b9-dbad41963680";
const CUID_DE_UN_COSTO = "cmrhe8jxd0016m4ii354vkufa";

describe("idDeBase acepta los ids que de verdad hay en la base", () => {
  it("⚠ acepta UUID — las 14 personas sembradas antes del default cuid", () => {
    expect(idDeBase.safeParse(UUID_DE_ELIAS).success).toBe(true);
    expect(idDeBase.safeParse(UUID_DE_ALEJANDRA).success).toBe(true);
  });

  it("y sigue aceptando cuid — las filas que creó la app", () => {
    expect(idDeBase.safeParse(CUID_DE_UN_COSTO).success).toBe(true);
  });

  it("rechaza lo que no puede ser un id", () => {
    for (const basura of ["", "   ", "tiene espacios", "con/barra", "con'comilla", "a".repeat(65), "punto.punto"]) {
      expect(idDeBase.safeParse(basura).success, `deberia rechazar ${JSON.stringify(basura)}`).toBe(false);
    }
  });
});

describe("el PATCH de un salario, que es donde reventaba", () => {
  /** Exactamente lo que arma `components/cobranza/CostoForm.tsx` en su submit(). */
  const patchDeSalario = (teamMemberId: string) => ({
    categoria: "SALARIO" as const,
    nombre: "Elías González · RevOps Lead",
    monto: 1_600_000,
    moneda: "CRC" as const,
    frecuencia: "MENSUAL" as const,
    teamMemberId,
    montoBase: null,
    factorCargas: null,
    activo: true,
    notas: null,
  });

  it("⚠ valida con una persona de id UUID — antes fallaba con 'Invalid cuid'", () => {
    const r = costoPatchSchema.safeParse(patchDeSalario(UUID_DE_ELIAS));
    expect(r.success, r.success ? "" : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ")).toBe(true);
  });

  it("y sigue validando con una persona de id cuid — lo que sí funcionaba", () => {
    expect(costoPatchSchema.safeParse(patchDeSalario("cmg3k1q9k0000m4x8abcd1234")).success).toBe(true);
  });

  it("sigue rechazando un teamMemberId que no puede existir", () => {
    expect(costoPatchSchema.safeParse(patchDeSalario("no es un id")).success).toBe(false);
  });
});

describe("el resto de los ids del módulo, por el mismo motivo", () => {
  it("una cuenta se puede crear contra un clientId con cualquiera de las dos formas", () => {
    const base = { clientId: CUID_DE_UN_COSTO };
    expect(cuentaCreateSchema.safeParse(base).success).toBe(true);
    expect(cuentaCreateSchema.safeParse({ ...base, clientId: UUID_DE_ELIAS }).success).toBe(true);
  });

  it("⛔ NINGÚN campo del schema de cobranza vuelve a validar con `.cuid()`", () => {
    /* El daño de este defecto no fue que rompiera: fue que rompía SOLO para algunas filas, con
       un mensaje en inglés, en una pantalla que para otras andaba bien. Volver a poner un
       `.cuid()` en cualquier id reintroduce esa clase entera de bug, no un caso. */
    const fuente = readFileSync(join(__dirname, "schema.ts"), "utf8");
    const usos = fuente.split("\n").filter((l) => /z\.string\(\)\.cuid\(\)/.test(l));
    expect(usos, `volvió .cuid() a: ${usos.join(" // ")}`).toEqual([]);
  });
});
