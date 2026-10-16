import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import { Client as ClienteDeNexus } from "./sdk";

/**
 * lib/hubspot/api-client-sin-raiz.test.ts — nadie vuelve a cargarle a tsc el SDK de HubSpot entero.
 *
 * ── EL INCIDENTE: EL BUILD DEL VPS SE QUEDÓ SIN MEMORIA OTRA VEZ (2026-10-16) ─────────
 * El type-check del build pedía 4,1 GB (el tope de fábrica del builder) y murió en «Running
 * TypeScript». 2.405 de los 8.799 archivos del programa eran de `@hubspot/api-client`: ~25 archivos
 * nombraban `Client` desde la raíz, y `lib/src/client.d.ts` importa las once discoveries del SDK
 * (crm, cms, marketing, automation…) con todo su código generado. Nexus usa `apiRequest` y cinco
 * APIs tipadas. Ahora el tipo es lib/hubspot/sdk.d.ts (solo eso, con las clases reales por ruta
 * profunda) y el valor sale de lib/hubspot/sdk.js, que reexporta el `Client` de siempre.
 * Mismo caso que googleapis el 2026-09-26: lib/google/googleapis-sin-raiz.test.ts.
 *
 * ── QUÉ MIRA ────────────────────────────────────────────────────────────────────────
 * 1. Todo lo que ve tsc (app/, lib/, scripts/, los tests…): ningún import, ni `import type`, puede
 *    llegar a `lib/src/client.d.ts`. Se mide siguiendo los imports DENTRO del SDK, no con una lista
 *    de rutas: así también caza las discoveries de grupo (`CrmDiscovery` sola son ~1.600 archivos).
 * 2. El SDK que ve tsc, sumando todos los imports, no pasa de TOPE archivos.
 * 3. sdk.d.ts no miente: TypeScript lo da por bueno contra el `Client` real (con skipLibCheck, el
 *    type-check del repo nunca revisa un .d.ts), y en tiempo de ejecución cada API declarada es la
 *    clase que el cliente real devuelve.
 */

const RAIZ = process.cwd();
const SDK = "@hubspot/api-client";
const SDK_DTS = path.join(RAIZ, "lib/hubspot/sdk.d.ts");
const rel = (p: string) => path.relative(RAIZ, p).replace(/\\/g, "/");
const delSdk = (p: string) => p.replace(/\\/g, "/").split(`/node_modules/${SDK}/`)[1];

/**
 * Hoy el SDK que ve tsc son 177 archivos (los de sdk.d.ts). Una API de un objeto (contacts,
 * deals…) suma ~55; la de objetos genéricos (`crm.objects`) ~620; el SDK entero son 2.405. Si
 * agregas una API a propósito y te pasas, mide el type-check (ver sdk.d.ts) antes de subir esto.
 */
const TOPE = 400;

/** Lo que ve tsc: el repo entero menos node_modules y las carpetas con punto (.next*, .git…). */
function archivosQueVeTsc(): string[] {
  const out: string[] = [];
  const recorrer = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (/\.(?:ts|tsx|mts|cts)$/.test(e.name)) out.push(p);
    }
  };
  recorrer(RAIZ);
  return out;
}

/** Los especificadores del SDK (la raíz o una subruta) que importa un archivo. */
function importsDelSdk(fuente: string): string[] {
  if (!fuente.includes(SDK)) return [];
  return ts
    .preProcessFile(fuente, true, true)
    .importedFiles.map((f) => f.fileName)
    .filter((s) => s === SDK || s.startsWith(`${SDK}/`));
}

const OPCIONES: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2017,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  noEmit: true,
  esModuleInterop: true,
  types: [],
};

const CACHE = ts.createModuleResolutionCache(RAIZ, (f) => f.toLowerCase(), OPCIONES);
const resolver = (spec: string, desde: string) =>
  ts.resolveModuleName(spec, desde, OPCIONES, ts.sys, CACHE).resolvedModule?.resolvedFileName;

/**
 * Los archivos del SDK que tsc carga por un import: resuelve el especificador como tsc y sigue
 * los imports y `/// <reference path>` de cada .d.ts mientras sigan dentro del SDK.
 */
const yaLeidos = new Map<string, (string | undefined)[]>();
function loQueImporta(f: string): (string | undefined)[] {
  let deps = yaLeidos.get(f);
  if (!deps) {
    const info = ts.preProcessFile(fs.readFileSync(f, "utf8"), true, true);
    deps = [
      ...info.importedFiles.map((i) => resolver(i.fileName, f)),
      ...info.referencedFiles.map((r) => resolver(path.resolve(path.dirname(f), r.fileName), f)),
    ];
    yaLeidos.set(f, deps);
  }
  return deps;
}

function archivosDelSdkQueCarga(spec: string, desde: string): Set<string> {
  const entrada = resolver(spec, desde);
  if (!entrada) throw new Error(`tsc no resuelve "${spec}" desde ${rel(desde)}`);
  const vistos = new Set<string>();
  const pendientes: string[] = [];
  const agregar = (f: string | undefined) => {
    if (f && delSdk(f) && !vistos.has(f)) {
      vistos.add(f);
      pendientes.push(f);
    }
  };
  agregar(entrada);
  while (pendientes.length > 0) loQueImporta(pendientes.pop()!).forEach(agregar);
  return vistos;
}

const CLIENT_DTS = "lib/src/client.d.ts";
const ARCHIVOS = archivosQueVeTsc();
const IMPORTS = ARCHIVOS.flatMap((f) =>
  importsDelSdk(fs.readFileSync(f, "utf8")).map((spec) => {
    const carga = archivosDelSdkQueCarga(spec, f);
    return { archivo: rel(f), spec, carga, todoElSdk: [...carga].some((c) => delSdk(c) === CLIENT_DTS) };
  }),
);

describe("@hubspot/api-client: tsc ve solo lo que Nexus usa, nunca el SDK entero (build sin memoria, 2026-10-16)", () => {
  it("la vara mide: la raíz del SDK carga client.d.ts y miles de archivos, y el escaneo ve el repo", () => {
    const raiz = archivosDelSdkQueCarga(SDK, SDK_DTS);
    expect(raiz.size, "seguir los imports del SDK no está encontrando archivos").toBeGreaterThan(2000);
    expect([...raiz].map(delSdk)).toContain(CLIENT_DTS);
    const crm = archivosDelSdkQueCarga(`${SDK}/lib/src/discovery/crm/CrmDiscovery`, SDK_DTS);
    expect(crm.size, "una discovery de grupo tiene que medir como lo que es: enorme").toBeGreaterThan(1000);

    expect(ARCHIVOS.length, "el escaneo no encontró los archivos del repo").toBeGreaterThan(1000);
    const conSdk = IMPORTS.map((i) => i.archivo);
    for (const f of ["lib/hubspot/sdk.d.ts", "lib/hubspot/companies.ts"]) {
      expect(conSdk, `el escaneo no ve el import del SDK de ${f}`).toContain(f);
    }
  }, 60_000);

  it("LA guarda: ningún archivo que ve tsc carga client.d.ts (ni la raíz ni un `import type`)", () => {
    /* La edición que la pone en rojo: volver a `import type { Client } from "@hubspot/api-client"`
       en cualquier archivo, o tipar algo como `import("@hubspot/api-client").Client`. */
    const culpables = IMPORTS.filter((i) => i.todoElSdk).map((i) => `${i.archivo} → "${i.spec}"`);
    expect(
      culpables,
      "Estos imports cargan los tipos del SDK de HubSpot ENTERO (~2.400 archivos) y dejan sin memoria el " +
        "type-check del build en el VPS (2026-10-16). El cliente se importa de lib/hubspot/sdk: " +
        '`import type { Client as HsClient } from "@/lib/hubspot/sdk"` (ahí se agregan las APIs tipadas).',
    ).toEqual([]);
  });

  it(`el SDK que ve tsc, sumando todos los imports, no pasa de ${TOPE} archivos`, () => {
    const total = new Set(IMPORTS.flatMap((i) => [...i.carga]));
    const porImport = IMPORTS.map((i) => `${i.archivo} → "${i.spec}": ${i.carga.size}`).join("\n");
    expect(
      total.size,
      `Algún import profundo arrastra un grupo entero del SDK (p. ej. CrmDiscovery). Por import:\n${porImport}`,
    ).toBeLessThanOrEqual(TOPE);
  });

  it("sdk.d.ts calza con el Client real: TypeScript lo da por bueno", () => {
    const VIRTUAL = path.join(RAIZ, "__calce-sdk-hubspot__.ts").replace(/\\/g, "/");
    const FUENTE = [
      `import type { Client as Real } from "${SDK}";`,
      `import type { Client as DeNexus } from "./lib/hubspot/sdk";`,
      // Un cliente real sirve donde Nexus espera el suyo: el tipo de Nexus es un pedazo del real.
      `declare const real: Real;`,
      `export const comoNexus: DeNexus = real;`,
      // Y los dos constructores reciben lo mismo.
      `declare const configReal: ConstructorParameters<typeof import("${SDK}").Client>;`,
      `declare const configNexus: ConstructorParameters<typeof import("./lib/hubspot/sdk").Client>;`,
      `export const ida: typeof configNexus = configReal;`,
      `export const vuelta: typeof configReal = configNexus;`,
    ].join("\n");
    const host = ts.createCompilerHost(OPCIONES);
    const esVirtual = (f: string) => f.replace(/\\/g, "/").toLowerCase() === VIRTUAL.toLowerCase();
    const { getSourceFile, fileExists, readFile } = host;
    host.getSourceFile = (f, ...resto) =>
      esVirtual(f) ? ts.createSourceFile(f, FUENTE, ts.ScriptTarget.ES2017) : getSourceFile.call(host, f, ...resto);
    host.fileExists = (f) => esVirtual(f) || fileExists.call(host, f);
    host.readFile = (f) => (esVirtual(f) ? FUENTE : readFile.call(host, f));
    // skipLibCheck apagado: sdk.d.ts es un .d.ts y, si no, nadie revisa sus imports ni sus tipos.
    const programa = ts.createProgram([VIRTUAL], { ...OPCIONES, skipLibCheck: false }, host);
    const errores = [VIRTUAL, SDK_DTS].flatMap((f) => {
      const sf = programa.getSourceFile(f);
      if (!sf) return [`tsc no cargó ${f}`];
      return [...programa.getSyntacticDiagnostics(sf), ...programa.getSemanticDiagnostics(sf)].map(
        (d) => `${rel(d.file?.fileName ?? f)}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`,
      );
    });
    expect(errores, "sdk.d.ts ya no calza con el Client del SDK (¿se actualizó @hubspot/api-client?)").toEqual([]);
  }, 60_000);

  it("en tiempo de ejecución es el mismo Client, y cada API de sdk.d.ts es la clase que devuelve el real", () => {
    const req = createRequire(path.join(RAIZ, "package.json"));
    const { Client } = req(SDK) as { Client: new (config: { accessToken: string }) => Record<string, unknown> };
    expect(ClienteDeNexus, "lib/hubspot/sdk.js tiene que reexportar el Client de la raíz, no otro").toBe(Client);

    // Lee de sdk.d.ts qué API declara cada grupo (`get crm(): CrmDeNexus` → `companies: CompaniesDiscovery`)
    // y de qué ruta profunda importa cada clase.
    const sf = ts.createSourceFile(SDK_DTS, fs.readFileSync(SDK_DTS, "utf8"), ts.ScriptTarget.ES2017, true);
    const rutaDe = new Map<string, string>();
    const interfaces = new Map<string, ts.InterfaceDeclaration>();
    const grupos: { grupo: string; tipo: string }[] = [];
    for (const n of sf.statements) {
      if (ts.isImportDeclaration(n) && n.importClause?.name && ts.isStringLiteral(n.moduleSpecifier)) {
        rutaDe.set(n.importClause.name.text, n.moduleSpecifier.text);
      } else if (ts.isInterfaceDeclaration(n)) {
        interfaces.set(n.name.text, n);
      } else if (ts.isClassDeclaration(n) && n.name?.text === "Client") {
        for (const m of n.members) {
          if (ts.isGetAccessorDeclaration(m) && m.type && ts.isTypeReferenceNode(m.type)) {
            grupos.push({ grupo: m.name.getText(sf), tipo: m.type.typeName.getText(sf) });
          }
        }
      }
    }
    const apis = grupos.flatMap(({ grupo, tipo }) => {
      const miembros: readonly ts.TypeElement[] = interfaces.get(tipo)?.members ?? [];
      return miembros.filter(ts.isPropertySignature).map((p) => {
        const clase = p.type && ts.isTypeReferenceNode(p.type) ? p.type.typeName.getText(sf) : "";
        return { grupo, api: p.name.getText(sf), clase, ruta: rutaDe.get(clase) };
      });
    });
    expect(apis.length, "no se leyeron las APIs de sdk.d.ts").toBeGreaterThanOrEqual(5);

    const real = new Client({ accessToken: "solo-para-el-test" });
    for (const { grupo, api, clase, ruta } of apis) {
      expect(ruta, `${grupo}.${api}: ${clase} no se importa por ruta profunda en sdk.d.ts`).toBeDefined();
      const Clase = (req(ruta!) as { default: new (...args: never[]) => unknown }).default;
      const instancia = (real[grupo] as Record<string, unknown>)[api];
      expect(instancia, `client.${grupo}.${api} no es un ${clase} de "${ruta}"`).toBeInstanceOf(Clase);
    }
  });
});
