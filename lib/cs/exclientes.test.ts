/**
 * lib/cs/exclientes.test.ts — un excliente confirmado sale de todo lo que pide atención (2026-10-17).
 *
 * La regla pura y un escaneo estructural: los lectores que la tienen que aplicar la importan. Si alguien saca la
 * exclusión de uno, la cuenta vuelve a aparecer en su lista y nada avisa: este test sí.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXCLIENTE, esExcliente, sinExclientes } from "./exclientes";

describe("la regla", () => {
  it("solo lo CONFIRMADO cuenta", () => {
    expect(esExcliente({ relacion: EXCLIENTE })).toBe(true);
    expect(esExcliente({ relacion: "proyecto" })).toBe(false);
    expect(esExcliente({ relacion: null })).toBe(false);
    expect(esExcliente(null)).toBe(false);
  });

  it("saca de una lista lo de los exclientes y deja lo que no es de una cuenta", () => {
    const xs = [{ c: "a" }, { c: "wherex" }, { c: null }];
    expect(sinExclientes(xs, new Set(["wherex"]), (x) => x.c)).toEqual([{ c: "a" }, { c: null }]);
    expect(sinExclientes(xs, new Set(), (x) => x.c)).toEqual(xs);
  });
});

const RAIZ = join(__dirname, "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

/** Cada lugar del que un excliente tiene que salir, y lo que tiene que nombrar para hacerlo. */
const LECTORES: Array<[string, RegExp]> = [
  // La cartera (A quién llamar, las lecturas, la pestaña Cartera) y sus alertas.
  ["lib/cs/cartera.ts", /cuentasExcliente/],
  // Las alertas: no se crean.
  ["lib/cs/watchdog.ts", /esCuentaExcliente[\s\S]*CLIENTE_NO_EXCLIENTE_WHERE|CLIENTE_NO_EXCLIENTE_WHERE[\s\S]*esCuentaExcliente/],
  ["lib/cs/vigia-por-cliente.ts", /CLIENTE_NO_EXCLIENTE_WHERE/],
  ["lib/cs/avisos-de-renovacion.ts", /CLIENTE_NO_EXCLIENTE_WHERE/],
  ["lib/cs/alertas-de-la-lectura-server.ts", /esCuentaExcliente/],
  // Las alertas: no se muestran.
  ["app/api/cs/alerts/route.ts", /CLIENTE_NO_EXCLIENTE_WHERE/],
  ["lib/cs/load-panel.ts", /CLIENTE_NO_EXCLIENTE_WHERE/],
  ["lib/cs/load-account.ts", /CLIENTE_NO_EXCLIENTE_WHERE/],
  ["lib/mi-dia/resumen-server.ts", /CLIENTE_NO_EXCLIENTE_WHERE/],
  ["lib/seguimiento/tarjeta-server.ts", /CLIENTE_NO_EXCLIENTE_WHERE/],
  // «Para ti»: lo tuyo (todas las fuentes personales), lo de quien lidera y la cartera de la CSL.
  ["lib/para-ti/alcance-server.ts", /cuentasExcliente/],
  ["lib/para-ti/fuentes/cs.ts", /cuentasExcliente/],
  ["lib/para-ti/fuentes/cartera-de-la-csl.ts", /cuentasExcliente/],
  ["lib/mi-dia/cartera-cs-server.ts", /CLIENTE_DE_CS_SIN_EXCLIENTES_WHERE/],
  ["lib/mi-dia/inicio-server.ts", /CLIENTE_NO_EXCLIENTE_WHERE/],
  // Los recordatorios de adopción.
  ["lib/cs/recordatorios-de-adopcion-server.ts", /CLIENTE_NO_EXCLIENTE_WHERE/],
  // Lo que sigue activo se pide cerrar.
  ["lib/limpieza/lista-server.ts", /cuentasExcliente/],
];

describe("⭐ un excliente sale de todos lados", () => {
  it.each(LECTORES)("%s aplica la exclusión", (rel, patron) => {
    expect(leer(rel)).toMatch(patron);
  });
});

function archivos(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(join(RAIZ, dir))) {
    if (n === "node_modules" || n.startsWith(".")) continue;
    const rel = join(dir, n);
    const st = statSync(join(RAIZ, rel));
    if (st.isDirectory()) out.push(...archivos(rel));
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.ts$/.test(n)) out.push(rel.split("\\").join("/"));
  }
  return out;
}

describe("un solo punto", () => {
  it("nadie escribe `relacion: \"excliente\"` en una consulta: se usa lib/cs/exclientes", () => {
    const ofensores = [...archivos("lib"), ...archivos("app"), ...archivos("scripts")].filter(
      (rel) => !rel.startsWith("lib/cs/exclientes") && /relacion:\s*["']excliente["']/.test(leer(rel)),
    );
    expect(ofensores).toEqual([]);
  }, 30_000);
});
