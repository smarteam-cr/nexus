import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { belongsToClient, whereBelongsToClient } from "./project-sources";

/**
 * lib/sessions/pertenencia-unica.test.ts — «¿DE QUIÉN ES ESTA SESIÓN?» SE PREGUNTA DE UNA SOLA FORMA.
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * El `OR` de pertenencia se escribía a mano en ocho consultas, y una —el widget del GPS— lo
 * escribía DISTINTO: «el override manda» (`manualClientId === c` O `manualClientId === null` Y
 * `resolvedClientId === c`). Suena más correcto y es una trampa: esa forma solo funciona si
 * `manualClientId` apunta siempre a un cliente vivo, y **eso no lo garantiza nadie** — no es clave
 * foránea, así que borrar un cliente lo deja colgando.
 *
 * Con un override colgado, la sesión falla las DOS ramas: el widget dice «Sin agendar» con la
 * reunión agendada. Es el síntoma del incidente del 2026-08-04 y estaba en producción, sin tirar
 * un solo error.
 */

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

/** Los que preguntan pertenencia en SQL. Si aparece uno nuevo, va acá. */
const CONSUMIDORES = [
  "app/api/projects/[projectId]/gps/route.ts",
  "app/api/projects/[projectId]/project-sessions/route.ts",
  "app/api/projects/[projectId]/session-candidates/route.ts",
  "app/api/sessions/analyze/route.ts",
  "lib/cs/load-account.ts",
  "lib/hubspot/cs-signals.ts",
  "lib/projects/analyze-participants.ts",
  "lib/sessions/reclassify.ts",
  "lib/sessions/project-sources.ts",
];

describe("las dos caras de la regla dicen lo mismo", () => {
  const C = "cli-1";

  it("resuelto al cliente → pertenece", () => {
    expect(belongsToClient({ resolvedClientId: C, manualClientId: null }, C)).toBe(true);
  });

  it("override al cliente → pertenece", () => {
    expect(belongsToClient({ resolvedClientId: null, manualClientId: C }, C)).toBe(true);
  });

  it("LA guarda del criterio: un override a OTRO cliente NO tapa la resolución", () => {
    /* Éste es el caso del incidente. Con la forma «el override manda», esta sesión no pertenece a
       nadie: el override apunta a un cliente borrado y la rama automática exige que el override
       sea null. Con el OR, la resolución sigue valiendo y la sesión sigue encontrándose. */
    expect(belongsToClient({ resolvedClientId: C, manualClientId: "cliente-borrado" }, C)).toBe(true);
  });

  it("de otro cliente → no pertenece", () => {
    expect(belongsToClient({ resolvedClientId: "otro", manualClientId: null }, C)).toBe(false);
  });

  it("el `where` es la misma regla, no una variante", () => {
    expect(whereBelongsToClient(C)).toEqual({
      OR: [{ resolvedClientId: C }, { manualClientId: C }],
    });
  });
});

describe("nadie escribe la regla a mano", () => {
  it("LA guarda: ningún consumidor arma el OR por su cuenta", () => {
    /* Nueve consultas con la misma regla copiada es nueve oportunidades de que una divergiera —y
       una divergió—. Escribirla una vez y llamarla nueve veces vuelve imposible tener dos
       criterios de pertenencia. Es el mismo motivo por el que `componerCon` existe en scope.ts. */
    for (const f of CONSUMIDORES) {
      let src = leer(f);
      /* En el chokepoint se saltea la DEFINICIÓN del helper: es el único lugar donde el OR tiene
         que estar escrito, y sin esta exención la guarda se cae con el código correcto — la clase
         de guarda que después alguien borra por molesta. */
      if (f === "lib/sessions/project-sources.ts") {
        const i = src.indexOf("export function whereBelongsToClient");
        expect(i, "desapareció el helper: el resto de la guarda no significa nada").toBeGreaterThan(0);
        src = src.slice(0, i) + src.slice(src.indexOf("}", src.indexOf("return", i)) + 1);
      }
      /* Se mira el CÓDIGO, no los comentarios: el archivo del GPS explica en prosa la forma vieja
         para que nadie la reintroduzca, y un escaneo crudo se caería con el código correcto. */
      const codigo = src
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
        .join("\n");
      expect(
        codigo,
        `${f} volvió a escribir el OR de pertenencia a mano en vez de usar whereBelongsToClient`,
      ).not.toMatch(/OR:\s*\[\s*\{\s*resolvedClientId:/);
    }
  });

  it("LA guarda del GPS: no vuelve la forma «el override manda»", () => {
    /* Es la que estaba rota, y la que más tienta: parece la lectura estricta de "override". Su
       firma es un `manualClientId: null` usado como FILTRO, no como valor a escribir. */
    const src = leer("app/api/projects/[projectId]/gps/route.ts");
    const codigo = src
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
      .join("\n");
    expect(codigo, "volvió la forma de precedencia, que falla con un override colgado").not.toMatch(
      /manualClientId:\s*null\s*,\s*resolvedClientId:/,
    );
    expect(codigo, "el GPS dejó de preguntar como el resto del repo").toContain(
      "whereBelongsToClient(clientId)",
    );
  });

  it("el helper vive pegado a su gemelo, para que se lean juntos", () => {
    const src = leer("lib/sessions/project-sources.ts");
    const a = src.indexOf("export function belongsToClient");
    const b = src.indexOf("export function whereBelongsToClient");
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(b - a, "se separaron: son una sola regla y hay que poder leerlas juntas").toBeLessThan(2000);
  });
});
