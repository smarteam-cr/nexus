/**
 * lib/clients/cse-encargado.test.ts — REASIGNAR EL CSE DE UNA CUENTA NO PUEDE TOCAR LOS HIJOS.
 *
 * Correr: `npx vitest run lib/clients/cse-encargado.test.ts --project unit`.
 *
 * ── QUÉ PROTEGE ───────────────────────────────────────────────────────────────────────────────
 * El select de la columna "CSE encargado" de `/clients` escribe `csl_encargado` en TODOS los
 * proyectos del cliente que están en el pipeline de Implementación de HubSpot — porque el
 * encargado es de la CUENTA, no de un proyecto (Elías, 2026-08-21).
 *
 * Tres formas de que eso salga mal, las tres silenciosas:
 *   1. Que toque también los "development"/"sitios-web" → le saca a un desarrollador el acceso
 *      a SU pipeline técnico, y de paso rompe la regla que se acaba de arreglar en `access.ts`.
 *   2. Que intente escribir un proyecto sin `hubspotServiceId` (el contenedor "Información del
 *      cliente", o un alta a medio hacer) → PATCH contra un id vacío.
 *   3. Que el permiso caiga en el rol equivocado → un CSE podría quitarse una cuenta de encima,
 *      y como `csl_encargado` gobierna la visibilidad, quitarse el acceso solo.
 *
 * Son guardas de FUENTE porque el endpoint es 100% Prisma + HubSpot: no hay lógica pura que
 * extraer sin una base de test. El fragmento que usa (`PROYECTO_DE_PIPELINE_CS_WHERE`) ya está
 * probado aparte, SQL vs memoria, en `lib/projects/scope.test.ts`.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "@/lib/ui/scan-source";
import { PERMISSION_SECTIONS } from "@/lib/auth/permissions/registry";
import { DEFAULT_MATRIX } from "@/lib/auth/permissions/defaults";

function soloCodigo(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "");
}

const RUTA = soloCodigo(
  fs.readFileSync(path.join(RAIZ, "app/api/clients/[id]/cse-encargado/route.ts"), "utf8"),
);
const SELECT = soloCodigo(
  fs.readFileSync(path.join(RAIZ, "components/clients/CseEncargadoSelect.tsx"), "utf8"),
);

describe("⭐ el endpoint que reasigna el CSE de una cuenta", () => {
  it("⛔ solo escribe proyectos del pipeline de CS — nunca los hijos de Desarrollo", () => {
    /* La edición que la pone en rojo: sacar el spread de `PROYECTO_DE_PIPELINE_CS_WHERE` del
       `findMany`. Sin él, reasignar una cuenta le pisa el encargado al desarrollador del
       proyecto hijo — y le saca el acceso a su propio pipeline. */
    const i = RUTA.indexOf("prisma.project.findMany");
    expect(i, "desapareció la consulta de los proyectos a reasignar").toBeGreaterThan(-1);
    const bloque = RUTA.slice(i, RUTA.indexOf("});", i));
    expect(bloque.length, "la guarda no está mirando nada").toBeGreaterThan(60);
    expect(
      bloque.includes("...PROYECTO_DE_PIPELINE_CS_WHERE"),
      "el endpoint dejó de acotar por pipeline: reasignar la cuenta pisa a los desarrolladores " +
        "de los proyectos hijos",
    ).toBe(true);
  });

  it("⛔ y excluye los que no tienen record en HubSpot, aparte del pipeline", () => {
    /* `PROYECTO_DE_PIPELINE_CS_WHERE` mira SOLO el pipeline — deja pasar el contenedor
       "Información del cliente" y las altas a medio hacer, que no tienen `hubspotServiceId`.
       Sin este filtro extra, el loop haría un PATCH contra `/objects/projects/` sin id. */
    const i = RUTA.indexOf("prisma.project.findMany");
    const bloque = RUTA.slice(i, RUTA.indexOf("});", i));
    expect(
      bloque.includes("hubspotServiceId: { not: null }"),
      "volvió a poder intentar un PATCH contra un proyecto sin record en HubSpot",
    ).toBe(true);
  });

  it("⛔ exige el permiso de liderazgo, no solo acceso al cliente", () => {
    expect(RUTA).toContain('guardPermission("proyectos", "reasignarEncargado")');
    expect(
      RUTA,
      "el endpoint dejó de verificar el acceso al cliente: se podría reasignar una cuenta ajena",
    ).toContain("guardAccessToClient(clientId)");
  });

  it("⚠ y solo acepta a alguien del equipo ACTIVO", () => {
    /* Sin esto se podría escribir en HubSpot el owner de alguien que se fue —o un email
       cualquiera— y el error aparecería recién al sincronizar. */
    expect(RUTA).toContain("prisma.teamMember.findUnique");
    expect(RUTA).toContain("deactivatedAt");
  });

  it("⭐ un fallo a mitad de camino DICE cuántos entraron", () => {
    /* Son N PATCH independientes contra HubSpot y no hay rollback en ninguna parte de esta
       base: si el tercero de cinco falla, los dos primeros YA quedaron escritos. Un "falló" a
       secas mandaría a reintentar creyendo que no se escribió nada.
       La edición que la pone en rojo: reemplazar el mensaje por uno genérico. */
    /* ⚠ NO alcanza con buscar "escritos.length" en el archivo: aparece 3 veces (el push, el
       contador del body, el mensaje) — cambiar SOLO la frase del error dejaba la guarda en
       verde. Se afirma sobre el texto que de verdad lee la persona. */
    const i = RUTA.indexOf("} catch (e) {");
    expect(i, "desapareció el catch del loop de PATCH").toBeGreaterThan(-1);
    const bloqueError = RUTA.slice(i, RUTA.indexOf("status: 502", i));
    expect(bloqueError.length, "la guarda no está mirando nada").toBeGreaterThan(80);
    expect(
      bloqueError.includes("${escritos.length} de ${proyectos.length}"),
      "el error dejó de decir cuántos proyectos alcanzaron a reasignarse antes de fallar: " +
        "manda a reintentar creyendo que no se escribió nada",
    ).toBe(true);
    expect(
      bloqueError.includes("YA quedaron"),
      "el error dejó de aclarar que lo ya escrito NO se revierte (no hay rollback en HubSpot)",
    ).toBe(true);
  });

  it("⚠ un solo sync por cliente, no uno por proyecto", () => {
    /* El espejo trae TODOS los proyectos de la empresa en la misma corrida: llamarlo dentro del
       loop pagaría lo mismo N veces. */
    const despuesDelLoop = RUTA.slice(RUTA.indexOf("const escritos"));
    expect((despuesDelLoop.match(/syncProjectsForClient/g) ?? []).length).toBe(1);
  });
});

describe("⭐ la celda de permiso vive del lado del liderazgo", () => {
  it("está declarada en el registro", () => {
    const proyectos = PERMISSION_SECTIONS.find((s) => s.key === "proyectos");
    expect(proyectos, "desapareció la sección `proyectos`").toBeDefined();
    expect(
      proyectos!.actions.map((a) => a.key),
      "desapareció la celda `reasignarEncargado`: el endpoint gatearía contra algo que no existe",
    ).toContain("reasignarEncargado");
  });

  it("⛔ el CSE NO la tiene por default — y ese es todo el punto", () => {
    /* Decisión de Elías (2026-08-21): mover cartera es de liderazgo. Y como `csl_encargado`
       decide QUIÉN VE el cliente (`lib/auth/access.ts`), un CSE que pudiera reasignar podría
       quitarse —o quitarle a otro— el acceso a una cuenta entera sin que nadie lo apruebe.
       La edición que la pone en rojo: agregar "reasignarEncargado" al bloque `proyectos` de CSE. */
    /* ⚠ `grant()` devuelve un MAPA sección→acción→bool, no un array de acciones: buscar con
       `.toContain()` daba `[]` y pasaba en verde con el permiso mal puesto. Se cazó rompiéndola. */
    expect(
      DEFAULT_MATRIX.CSE.sections.proyectos.reasignarEncargado,
      "el CSE puede reasignar cartera: puede quitarse a sí mismo el acceso a un cliente",
    ).toBe(false);
  });

  it("⭐ pero el liderazgo de CS sí, o la funcionalidad no existe para nadie salvo el admin", () => {
    expect(
      DEFAULT_MATRIX.CSL.sections.proyectos.reasignarEncargado,
      "el liderazgo de CS perdió el permiso: la columna queda de solo lectura para todos salvo el admin",
    ).toBe(true);
  });
});

describe("⭐ el select de la columna", () => {
  it("⛔ no pinta desplegable sin permiso — ni uno deshabilitado", () => {
    /* Un desplegable que se abre para descubrir que no se puede es peor que texto plano.
       La edición que la pone en rojo: sacar la rama de `!puedeEditar`. */
    expect(SELECT).toContain("if (!puedeEditar || opciones.length === 0)");
  });

  it("⛔ el clic no navega a la ficha del cliente", () => {
    /* La fila entera es un link: sin `stopPropagation`, elegir un encargado te saca de la
       lista en el mismo clic y no llegás a ver si funcionó. */
    /* ⚠ Hay DOS `stopPropagation` en el archivo (el del botón y el del panel abierto):
       buscarlo suelto pasaba en verde con el del botón borrado. Se afirma sobre el handler
       exacto del botón, que es el que evita que elegir un encargado te saque de la lista. */
    const i = SELECT.indexOf("onClick={(e) => {");
    expect(i, "desapareció el onClick del botón que abre el desplegable").toBeGreaterThan(-1);
    const handler = SELECT.slice(i, SELECT.indexOf("}}", i));
    expect(handler.length, "la guarda no está mirando nada").toBeGreaterThan(20);
    expect(
      handler.includes("e.stopPropagation()"),
      "el clic del desplegable volvió a burbujear: elegir un encargado te saca de la lista a la ficha",
    ).toBe(true);
  });

  it("⚠ NO es optimista: repinta con lo que volvió del servidor", () => {
    /* La escritura va a HubSpot y vuelve por el espejo — puede tardar y puede quedar a medias.
       Pintar el nombre nuevo antes de tiempo mostraría como hecho algo que quizá no lo está,
       justo en la columna que se mira para saber de quién es la cuenta. */
    expect(SELECT).toContain("router.refresh()");
    expect(
      SELECT.includes("setNombreOptimista") || SELECT.includes("optimistic"),
      "el select empezó a pintar el valor antes de que el servidor lo confirme",
    ).toBe(false);
  });
});
