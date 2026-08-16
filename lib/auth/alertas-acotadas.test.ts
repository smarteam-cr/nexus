import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * lib/auth/alertas-acotadas.test.ts — EL GATE VIEJO IMPLICABA UN FILTRO QUE EL NUEVO NO.
 *
 * ── LA REGRESIÓN QUE ESTE ARCHIVO EXISTE PARA IMPEDIR ────────────────────────
 * Hasta el 2026-08-16 las rutas de alertas de CS se gateaban con `seeAllClients`, que IMPLICABA
 * acceso row-level a todos los clientes — por eso nunca necesitaron filtrar. Al moverlas a la
 * celda `customerSuccess.read` (que tiene el CSE, acotado a SUS clientes) quedaron abiertas:
 *
 *  · GET devolvía las alertas de la cartera ENTERA. No es solo el título: el watchdog las redacta
 *    con un contexto que incluye MRR, UUS y licencias, así que el texto puede traer datos de
 *    partner de cuentas ajenas — los mismos que la página se cuida de no mostrar.
 *  · PATCH resolvía o descartaba CUALQUIER alerta por id. Una alerta descartada deja de
 *    aparecerle a quien sí tenía que actuar, y no queda rastro de que la apagó alguien de afuera.
 *
 * Lo encontró la auditoría adversarial del rango, no los tests: ninguno miraba el scope porque
 * hasta entonces el gate lo garantizaba. `lib/cs/load-panel.ts` ya dejaba escrito el riesgo —
 * «si mañana un rol acotado gana acceso, no puede ver alertas ni montos fuera de su scope» — y
 * estas dos rutas fueron el camino que se salteó esa previsión.
 */

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

/** Toda ruta del área de CS que lee o escribe filas por cliente. */
const RUTAS = [
  "app/api/cs/alerts/route.ts",
  "app/api/cs/alerts/[alertId]/route.ts",
  "app/api/cs/account-brief/[clientId]/route.ts",
];

describe("⭐ abrir el área no abre la cartera", () => {
  for (const rel of RUTAS) {
    it(`${rel} acota por cliente`, () => {
      /* La celda `customerSuccess.read` dice QUÉ pantalla se puede abrir, no SOBRE QUIÉN. El
         row-level vive aparte y hay que aplicarlo explícitamente en cada consulta. */
      expect(leer(rel), `${rel} no resuelve el where del usuario`).toContain(
        "accessibleClientWhere(",
      );
    });
  }

  it("⚠ el GET filtra las alertas, no solo calcula el where", () => {
    /* El error natural: resolver `clientWhere` y olvidarse de meterlo en la consulta. El import
       queda, el código «se ve» acotado, y la lista sigue saliendo entera. */
    const src = leer("app/api/cs/alerts/route.ts");
    expect(src, "el where del usuario no llega a la query de alertas").toMatch(
      /clientWhere\s*\?\s*\{\s*client:\s*clientWhere\s*\}/,
    );
  });

  it("⚠ el PATCH resuelve la alerta CON el filtro, no lo chequea después", () => {
    /* Un `findUnique` + comparación posterior deja una rama donde el id se leyó y el chequeo se
       saltea (un `return` temprano, un refactor). Con el filtro adentro del `findFirst`, la
       alerta ajena simplemente no existe. */
    const src = leer("app/api/cs/alerts/[alertId]/route.ts");
    expect(src, "el PATCH volvió a buscar la alerta sin el filtro").not.toMatch(
      /csAlert\.findUnique/,
    );
    expect(src).toMatch(/csAlert\.findFirst\(\{[\s\S]{0,200}client:\s*clientWhere/);
  });

  it("y responde 404, no 403", () => {
    /* Quien no tiene acceso tampoco tiene por qué enterarse de que esa alerta existe. */
    expect(leer("app/api/cs/alerts/[alertId]/route.ts")).toContain("Alerta no encontrada");
  });
});
