/**
 * lib/clients/empresa.test.ts — LA EMPRESA ARRIBA DE SUS UNIDADES NO TIENE TRABAJO (2026-11-26).
 *
 * Correr: `npx vitest run lib/clients/empresa.test.ts --project unit`.
 *
 * DECISIONS «La empresa arriba de sus unidades»: una ficha de tipo EMPRESA nunca tiene proyectos, preventas, propuestas,
 * handoffs ni cuenta de cobro. La regla es pura; el escaneo vigila que cada camino que CREA ese trabajo la consulte, y
 * que todo cargador de fichas para el resolver pida el tipo (sin él, la empresa se volvería dueña de reuniones).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { esEmpresa, rechazarSiEsEmpresa } from "./empresa";

const RAIZ = process.cwd();
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

describe("la regla", () => {
  it("solo el tipo EMPRESA es una empresa", () => {
    expect(esEmpresa({ kind: "EMPRESA" })).toBe(true);
    for (const kind of ["CLIENTE", "PROSPECTO", "ALIADO", "INTERNO", null, undefined]) expect(esEmpresa({ kind })).toBe(false);
    expect(esEmpresa(null)).toBe(false);
  });

  it("a una empresa no se le crea trabajo: 409 con el texto para la pantalla", () => {
    expect(rechazarSiEsEmpresa({ kind: "EMPRESA" })).toMatchObject({ status: 409 });
    expect(rechazarSiEsEmpresa({ kind: "CLIENTE" })).toBeNull();
  });
});

describe("⛔ los que crean trabajo preguntan antes", () => {
  /* Cada uno crea en una ficha algo que es de una unidad. Si se suma otro camino, va aquí. */
  const CREAN = [
    "app/api/projects/route.ts",
    "app/api/handoffs/route.ts",
    "app/api/clients/[id]/business-cases/route.ts",
    "app/api/clients/traer-de-hubspot/route.ts",
    "lib/exploraciones/crear.ts",
    "lib/exploraciones/del-proyecto.ts",
    "lib/cobranza/mutations.ts",
    "lib/clients/cliente-de-la-empresa-de-ventas.ts",
  ];
  it.each(CREAN)("%s consulta rechazoSiLaFichaEsEmpresa", (rel) => {
    expect(leer(rel)).toMatch(/rechazoSiLaFichaEsEmpresa\(/);
  });

  /* Una reunión nunca queda a nombre de la empresa: el escritor único lo frena, y las puertas lo dicen antes con un 409. */
  it.each([
    ["lib/sessions/duenio-manual.ts", /exigirQueNoSeaEmpresa\(clientId\)/],
    ["lib/sessions/reunion-a-mano-server.ts", /rechazarSiEsEmpresa\(cliente\)/],
    ["lib/sessions/empresa-de-la-reunion-server.ts", /rechazarSiEsEmpresa\(empresa\)/],
    ["app/api/sessions/[id]/route.ts", /rechazarSiEsEmpresa\(existe\)/],
  ])("%s frena a la empresa como dueña", (rel, patron) => {
    expect(leer(rel)).toMatch(patron);
  });

  /* Las rutas que cambian la ficha: la empresa, solo quien abre todas sus unidades. */
  it.each([
    "app/api/clients/[id]/route.ts",
    "app/api/clients/[id]/classification/route.ts",
    "app/api/clients/[id]/hubspot-company/route.ts",
    "app/api/clients/[id]/cse-encargado/route.ts",
    "app/api/clients/[id]/datos/route.ts",
    "app/api/clients/[id]/ficha/route.ts",
    "app/api/clients/[id]/logo/route.ts",
  ])("%s pide abrir todas las unidades para cambiar la empresa", (rel) => {
    expect(leer(rel)).toMatch(/rechazoDeEscrituraEnLaEmpresa\(/);
  });

  it("la categoría de una empresa no se cambia a mano, y su ficha no se borra a mano", () => {
    expect(leer("app/api/clients/[id]/classification/route.ts")).toMatch(/actual\?\.kind === "EMPRESA"/);
    expect(leer("app/api/clients/[id]/route.ts")).toMatch(/aBorrar\?\.kind === "EMPRESA"/);
  });

  it("las tareas de HubSpot nunca quedan en la empresa, ni con un proyecto que espera unidad", () => {
    const t = leer("lib/tareas-hubspot/sync-server.ts");
    expect(t).toMatch(/const clientId = enLaEmpresa \? null : encontrado;/);
    expect(t).toMatch(/projectId: proyectoDeLaTarea\?\.id \?\? null/);
  });

  it("la copia de proyectos de HubSpot reparte los nuevos de una empresa por sus siglas", () => {
    expect(leer("lib/hubspot/sync-projects.ts")).toMatch(/clientId: fichaDelProyectoNuevo\(projectName\)/);
  });
});

describe("⛔ todo cargador de fichas con la llave de la empresa pide también el tipo", () => {
  /* El resolver distingue la empresa por `kind`. Una lista con `comparteDominioConId` y sin `kind` trataría a la empresa
     como una ficha más: le daría reuniones (invariante 1). */
  function archivos(dir: string): string[] {
    const out: string[] = [];
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) {
        if (n === "node_modules" || n === "archive" || n.startsWith(".")) continue;
        out.push(...archivos(p));
      } else if (/\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p);
    }
    return out;
  }
  it("cada `select` con comparteDominioConId: true trae kind: true", () => {
    const ofensores: string[] = [];
    for (const p of ["app", "lib", "scripts"].flatMap((d) => archivos(join(RAIZ, d)))) {
      const texto = readFileSync(p, "utf8").replace(/\r/g, "");
      for (const m of texto.matchAll(/comparteDominioConId: true/g)) {
        const cerca = texto.slice(Math.max(0, m.index! - 400), m.index! + 200);
        if (!/kind: true/.test(cerca)) ofensores.push(`${p.slice(RAIZ.length + 1)}:${texto.slice(0, m.index!).split("\n").length}`);
      }
    }
    expect(ofensores).toEqual([]);
  }, 30_000);
});
