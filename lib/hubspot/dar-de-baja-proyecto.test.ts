import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * lib/hubspot/dar-de-baja-proyecto.test.ts — LOS DOS CAMINOS POR LOS QUE UN PROYECTO SE VA.
 *
 * Uno automático (la reconciliación del sync lo detecta muerto en HubSpot y lo pasa a inactive)
 * y uno a mano (la Zona de peligro lo borra). Los dos estaban rotos de la misma forma: **no
 * fallaban, no hacían nada**, y eso no deja rastro en ningún log.
 *
 *  · El automático devolvía "alive" SIEMPRE, porque preguntaba por un slug para el que la app no
 *    tiene permiso y trataba ese 403 como duda. Dos proyectos archivados en HubSpot el
 *    2026-07-29 seguían activos —y en cobranza— después de varios syncs.
 *  · El manual hacía la supresión del re-sync y el borrado como dos escrituras sueltas. Si la
 *    segunda fallaba, quedaba un proyecto vivo que el sync saltea para siempre.
 */

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const SYNC = "lib/hubspot/sync-projects.ts";
const RUTA_DELETE = "app/api/clients/[id]/projects/[projectId]/route.ts";

/** El cuerpo de una función, con llaves balanceadas. Escribir, no leer. */
function cuerpoDeFuncion(src: string, nombre: string): string {
  const i = src.indexOf(nombre);
  if (i < 0) return "";
  const abre = src.indexOf("{", i);
  if (abre < 0) return "";
  let nivel = 1;
  let j = abre + 1;
  while (j < src.length && nivel > 0) {
    if (src[j] === "{") nivel++;
    else if (src[j] === "}") nivel--;
    j++;
  }
  return src.slice(abre, j);
}

describe("verificar si un proyecto murió: el 403 no es una duda", () => {
  const src = leer(SYNC);
  const cuerpo = cuerpoDeFuncion(src, "async function verifyProjectInHubspot");

  it("la función existe y se encontró su cuerpo", () => {
    // Si esto falla, TODAS las guardas de abajo estaban mirando un string vacío y pasaban solas.
    expect(cuerpo.length, "no se pudo aislar el cuerpo; las guardas de abajo no valen").toBeGreaterThan(400);
  });

  it("LA guarda: 401/403 se tratan aparte, NO como ambigüedad", () => {
    /* El bug entero era una línea: `if (!res.ok) { ambiguous = true; }` se comía el 403 del slug
       sin scope, y con `ambiguous` en true el return final —`confirmedNotFound && !ambiguous`—
       daba false SIEMPRE. La reconciliación quedaba inerte para todos los clientes, sin un solo
       error en ningún lado. */
    expect(cuerpo, "el 401/403 volvió a caer en el `!res.ok` genérico").toMatch(
      /res\.status === 401 \|\| res\.status === 403/,
    );
    const iPermiso = cuerpo.indexOf("res.status === 401");
    const iOk = cuerpo.indexOf("if (!res.ok)");
    expect(iPermiso, "el chequeo de permiso quedó DESPUÉS del `!res.ok`, que lo atrapa primero")
      .toBeLessThan(iOk);
  });

  it("un slug sin permiso no cuenta como 404 tampoco", () => {
    /* La dirección contraria es peor: si un 403 marcara `confirmedNotFound`, perder un scope
       daría de baja proyectos VIVOS —los saca de cobranza y de la cartera— por un problema de
       permisos. Se descarta el slug y punto. */
    const linea = cuerpo.split("\n").find((l) => l.includes("res.status === 401")) ?? "";
    expect(linea, "el 403 marca el proyecto como inexistente").not.toContain("confirmedNotFound");
    expect(linea).toContain("sinPermiso");
  });

  it("si NO se pudo preguntar por ningún lado, se conserva vivo", () => {
    // El return conservador no cambió: sigue exigiendo un 404 real y cero ambigüedad.
    expect(cuerpo).toContain("confirmedNotFound && !ambiguous");
  });

  it("queda ruido en el log cuando falta un permiso", () => {
    /* Sin esto el modo de falla vuelve a ser invisible: la app simplemente deja de dar de baja
       proyectos y nadie se entera hasta que alguien audita cobranza. */
    expect(cuerpo, "el aviso de scope faltante desapareció").toMatch(/console\.(warn|error)/);
  });
});

describe("verificar NO usa los slugs peligrosos", () => {
  const src = leer(SYNC);

  it("existe una lista propia para verificar", () => {
    expect(src, "VERIFY_SLUGS desapareció y volvió a compartir lista con las lecturas").toContain(
      "const VERIFY_SLUGS",
    );
  });

  it("LA guarda: sin 0-18 ni 0-49, y CON el tipo canónico", () => {
    /* El propio archivo declara arriba que los fallbacks numéricos son peligrosos porque pueden
       matchear OTRO objeto —en este portal `0-49` devuelve 28 records que no son proyectos—.
       Preguntarle por nuestro id a otro objeto no informa: el 404 es ruido, y un 200 sería
       catastrófico, porque la función leería `hs_status` de un record ajeno y decidiría con eso
       si NUESTRO proyecto sigue vivo. */
    const linea = src.split("\n").find((l) => l.includes("const VERIFY_SLUGS")) ?? "";
    expect(linea, "volvieron los fallbacks numéricos a la verificación").not.toMatch(/0-18|0-49/);
    expect(linea, "falta el tipo canónico del objeto Proyectos").toContain("OBJETO_PROYECTOS");
  });

  it("la verificación recorre VERIFY_SLUGS, no READ_SLUGS", () => {
    const cuerpo = cuerpoDeFuncion(src, "async function verifyProjectInHubspot");
    expect(cuerpo).toContain("of VERIFY_SLUGS");
    expect(cuerpo, "volvió a recorrer la lista con los fallbacks").not.toContain("of READ_SLUGS");
  });

  it("el id canónico no se escribe a mano acá", () => {
    // Es el mismo criterio que ya rige para el creador: un solo lugar declara "0-970".
    const linea = src.split("\n").find((l) => l.includes("const VERIFY_SLUGS")) ?? "";
    expect(linea).not.toContain('"0-970"');
  });
});

describe("borrar un proyecto: las dos escrituras, o ninguna", () => {
  const src = leer(RUTA_DELETE);

  it("LA guarda: el borrado va en una transacción", () => {
    /* La supresión del re-sync tiene que ir ANTES del delete (el flag no puede vivir en el
       Project que se elimina). Sueltas, un fallo en el medio deja un proyecto VIVO que el sync
       saltea para siempre: se abre, se ve normal, sigue en cobranza, y nunca más se actualiza
       desde HubSpot. Y el reintento no lo arregla, porque el push es idempotente. */
    expect(src, "el borrado volvió a ser dos escrituras sueltas").toContain("prisma.$transaction");
  });

  it("las dos escrituras usan el cliente de la transacción, no el global", () => {
    /* Un `prisma.` adentro del `$transaction` sale por fuera de la transacción y el arreglo es
       decorativo: compila, corre, y no garantiza nada. */
    const tx = cuerpoDeFuncion(src, "prisma.$transaction");
    expect(tx.length, "no se pudo aislar el bloque de la transacción").toBeGreaterThan(150);
    expect(tx, "hay una escritura con el prisma global adentro de la transacción").not.toMatch(
      /\bprisma\.(client|project)\./,
    );
    expect(tx).toContain("tx.project.delete");
  });

  it("la supresión sigue yendo ANTES del delete", () => {
    const tx = cuerpoDeFuncion(src, "prisma.$transaction");
    const iSupresion = tx.indexOf("ignoredHubspotServiceIds");
    const iDelete = tx.indexOf("tx.project.delete");
    expect(iSupresion).toBeGreaterThan(-1);
    expect(iSupresion, "el delete quedó antes de la supresión").toBeLessThan(iDelete);
  });

  it("sigue exigiendo el permiso de borrar", () => {
    expect(src).toContain('guardCapability("deleteClients")');
  });
});
