/**
 * lib/auth/access.test.ts — SER OWNER DE UN PROYECTO HIJO NO ES SER DUEÑO DE LA CUENTA.
 *
 * Correr: `npx vitest run lib/auth/access.test.ts --project unit`.
 *
 * ── EL BUG QUE ESTO CIERRA ────────────────────────────────────────────────────────────────────
 * Elías, 2026-08-21: *"Los customer success del pipeline de implementación de hubspot son los
 * customer success de la cuenta... las cuentas tienen que estar en el ownership de las personas
 * del pipeline de hubspot."* Un proyecto "development" o "sitios-web" cuelga como hijo/hermano
 * de una implementación (`Project.hermanoCsProjectId`) solo para tener su propio cronograma
 * técnico — su `csl_encargado` puede ser un desarrollador, nunca el dueño de la cuenta.
 *
 * Antes de este archivo, `requireAccessToClient`/`accessibleClientWhere`/`ownsClient` miraban
 * el owner de CUALQUIER `Project` del cliente sin distinguir pipeline: un desarrollador dueño de
 * un proyecto hijo obtenía razón `"hubspot-owner"` sobre el CLIENTE ENTERO — cartera de CS
 * incluida, y con `requireHandoffAccess` (que llama a `ownsClient`) hasta permiso para editar el
 * handoff/cronograma. Es el caso real: kölbi, "Integración con InfoClic" (development,
 * csl_encargado = un desarrollador) vs "Kolbi | Marketing y ventas"/"Sales Hub" (customer-success,
 * csl_encargado = el CSE real).
 *
 * ── POR QUÉ SON GUARDAS DE FUENTE Y NO UN TEST DE INTEGRACIÓN ────────────────────────────────
 * Las tres funciones son 100% Prisma — no hay lógica pura que extraer sin una base de test. Lo
 * que SÍ se puede afirmar sin base es que ninguna vuelva a consultar `hubspotOwnerEmail` sin
 * `PROYECTO_DE_PIPELINE_CS_WHERE` al lado. `lib/projects/scope.test.ts` ya prueba, sin base,
 * que ese fragmento filtra igual en SQL que en memoria — acá solo falta que `access.ts` lo use.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "@/lib/ui/scan-source";

/** Blanquea comentarios: mencionar la regla en un docblock no es lo mismo que aplicarla. */
function soloCodigo(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "");
}

const FUENTE = soloCodigo(fs.readFileSync(path.join(RAIZ, "lib/auth/access.ts"), "utf8"));

/** Recorta el cuerpo de UNA función por sus anclas de inicio/fin — nunca `.includes()` a secas
 *  sobre el archivo entero: eso ya salió decorativo dos veces en esta misma tanda de trabajo. */
function cuerpoDe(inicio: string, fin: string): string {
  const i = FUENTE.indexOf(inicio);
  expect(i, `desapareció la función que empieza con "${inicio}"`).toBeGreaterThan(-1);
  const j = FUENTE.indexOf(fin, i);
  expect(j, `desapareció el ancla de cierre "${fin}"`).toBeGreaterThan(i);
  const cuerpo = FUENTE.slice(i, j);
  expect(cuerpo.length, "la guarda no está mirando nada").toBeGreaterThan(80);
  return cuerpo;
}

describe("⭐ ser owner de un proyecto development/web no es ser dueño de la cuenta", () => {
  it("el módulo importa el filtro de pipeline CS", () => {
    expect(
      FUENTE.includes('from "@/lib/projects/scope"'),
      "desapareció el import de scope.ts",
    ).toBe(true);
    expect(FUENTE).toContain("PROYECTO_DE_PIPELINE_CS_WHERE");
  });

  it("⛔ requireAccessToClient acota el owner de HubSpot al pipeline CS", () => {
    /* La edición que la pone en rojo: volver a `where: { clientId, hubspotOwnerEmail: tm.email }`
       sin el spread. */
    const cuerpo = cuerpoDe(
      "export async function requireAccessToClient",
      "export interface AccessibleClientOpts",
    );
    expect(cuerpo).toContain("hubspotOwnerEmail: tm.email");
    expect(
      cuerpo,
      "requireAccessToClient volvió a dar acceso de owner por CUALQUIER proyecto, sin " +
        "distinguir pipeline: un desarrollador del pipeline development vuelve a ver la cuenta entera",
    ).toContain("...PROYECTO_DE_PIPELINE_CS_WHERE");
  });

  it("⛔ accessibleClientWhere hace lo mismo para el filtro server-side de /clients", () => {
    const cuerpo = cuerpoDe(
      "export async function accessibleClientWhere",
      "export async function sharedClientIdsFor",
    );
    expect(cuerpo).toContain("hubspotOwnerEmail: tm.email");
    expect(
      cuerpo,
      "el filtro que decide qué CLIENTES llegan al servidor volvió a mezclar pipelines",
    ).toContain("...PROYECTO_DE_PIPELINE_CS_WHERE");
  });

  it("⛔ ownsClient también — y de ahí cuelga el permiso de editar handoff/cronograma", () => {
    /* requireHandoffAccess (más abajo en el archivo) llama a ownsClient como su segunda
       puerta: si esta guarda se rompe, un desarrollador con un proyecto hijo podría editar el
       handoff/cronograma de TODO el cliente, no solo de su pipeline técnico. */
    const cuerpo = cuerpoDe(
      "export async function ownsClient",
      "export async function requireHandoffAccess",
    );
    expect(cuerpo).toContain("hubspotOwnerEmail: email");
    expect(
      cuerpo,
      "ownsClient dejó de acotar por pipeline: requireHandoffAccess quedó abierto de más",
    ).toContain("...PROYECTO_DE_PIPELINE_CS_WHERE");
  });

  it("⚠ requireHandoffAccess sigue llamando a ownsClient (la cadena no se cortó)", () => {
    const cuerpo = cuerpoDe("export async function requireHandoffAccess", "throw new ForbiddenError");
    expect(
      cuerpo,
      "requireHandoffAccess dejó de llamar a ownsClient: el arreglo de arriba dejaría de aplicar acá",
    ).toContain("ownsClient(");
  });
});
