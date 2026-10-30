/**
 * lib/clients/cse-columna.test.ts — LA COLUMNA "CSE" DE /clients SOLO MIRA EL PIPELINE DE CS.
 *
 * Correr: `npx vitest run lib/clients/cse-columna.test.ts --project unit`.
 *
 * ⚠ El archivo que escanea (`app/(shell)/clients/ClientsTable.tsx`) vive FUERA de `lib/`, así
 * que el project `unit` de vitest no lo correría directo — por eso esta guarda vive acá y lo lee
 * como texto, mismo patrón que `lib/asistente/panel.test.ts` con `ChatDelAsistente.tsx`.
 *
 * ── EL BUG ────────────────────────────────────────────────────────────────────────────────────
 * Elías, 2026-08-21: *"Los customer success del pipeline de implementación de hubspot son los
 * customer success de la cuenta... las cuentas tienen que estar en el ownership de las personas
 * del pipeline de hubspot."* La columna CSE juntaba el `hubspotOwnerName` de TODOS los proyectos
 * del cliente, sin filtrar pipeline — kölbi mostraba "Breiner Salas Salas +1": el desarrollador
 * de su integración de Desarrollo, antepuesto al CSE real de la cuenta.
 *
 * ⚠ `esProyectoDePipelineCS` YA está probado (SQL vs memoria, sobre >500 filas sintéticas) en
 * `lib/projects/scope.test.ts` — esta guarda no repite esa prueba, solo confirma que
 * `ClientsTable.tsx` de verdad lo usa antes de armar `cseNames`/`cseEmails`.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "@/lib/ui/scan-source";

function soloCodigo(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "");
}

const FUENTE = soloCodigo(
  fs.readFileSync(path.join(RAIZ, "app/(shell)/clients/ClientsTable.tsx"), "utf8"),
);

describe("⭐ la columna CSE de /clients no mezcla pipelines", () => {
  it("importa el filtro de pipeline CS desde scope.ts", () => {
    expect(FUENTE).toContain('from "@/lib/projects/scope"');
    expect(FUENTE).toContain("esProyectoDePipelineCS");
  });

  it("⛔ cseNames/cseEmails salen de proyectos YA filtrados, no de c.projects crudo", () => {
    /* La edición que la pone en rojo: volver `const proyectosDeCS = c.projects;` (sin `.filter`), o armar `cseNames`
       directo desde `c.projects` otra vez. `tsc` NO cazaría ese cambio. Desde el 2026-10-19 los dos arrays salen de la
       regla única (lib/cuentas/encargado.ts) aplicada a esa lista ya filtrada. */
    const f = FUENTE.indexOf("const deCS = c.projects.filter(esProyectoDePipelineCS);");
    expect(f, "desapareció el filtro por pipeline antes de armar los arrays").toBeGreaterThan(-1);
    const i = FUENTE.indexOf("const proyectosDeCS = activosDeCS.length > 0 ? activosDeCS :", f);
    expect(i, "proyectosDeCS tiene que salir de la lista ya filtrada por pipeline, primero los activos").toBeGreaterThan(-1);
    const bloque = FUENTE.slice(i, FUENTE.indexOf("const cseEmail = ", i) + 200);
    expect(bloque).toContain("const lleva = proyectosDeCS.map(proyectoQueLleva);");
    expect(bloque).toContain("encargadoDeLaCuenta(lleva");
    expect(bloque).toContain("quienesLlevanLaCuenta(lleva");
    expect(bloque, "cseNames/cseEmails volvieron a leer de c.projects crudo").not.toContain("c.projects");
  });
});

describe("⭐ el encargado se ve con su foto (2026-10-30)", () => {
  const texto = (ruta: string) => soloCodigo(fs.readFileSync(path.join(RAIZ, ruta), "utf8"));

  it("la columna de Clientes usa el avatar con la foto de Nexus", () => {
    const grid = texto("app/(shell)/clients/ClientsGrid.tsx");
    expect(grid).toMatch(/<Avatar[^>]*src=\{c\.cseFoto \?\? undefined\}/);
    // La foto sale de la regla del encargado, y el equipo la trae de la base: si no, la columna quedaría en iniciales.
    expect(FUENTE).toMatch(/cseFoto: cseEmail \? \(fotoEnNexus\.get\(cseEmail\)/);
    expect(texto("lib/cuentas/encargado-server.ts")).toMatch(/photoUrl: true/);
  });

  it("el riel pinta la foto de cada proyecto, con el nombre al pasar el mouse", () => {
    expect(texto("components/clients/RielDelCliente.tsx")).toMatch(/<Avatar name=\{p\.encargado\.nombre\} src=\{p\.encargado\.foto \?\? undefined\}[^>]*title=\{p\.encargado\.nombre\}/);
    expect(texto("app/(shell)/clients/[id]/page.tsx")).toContain("encargado: personaDelProyecto(p, equipo)");
    expect(texto("app/(shell)/clients/[id]/WorkspaceClient.tsx")).toContain("encargado: p.encargado");
  });

  it("⛔ el riel no filtra por quién mira: Customer Success ve los proyectos de Desarrollo", () => {
    const pagina = texto("app/(shell)/clients/[id]/page.tsx");
    expect(pagina).toContain(".filter((p) => esProyectoNavegable(p, paraFiltro))");
    expect(pagina).not.toMatch(/esProyectoDePipelineCS|esPipelineIdDeCs/);
  });
});

describe("⛔ el pase de cuenta nunca escribe a alguien técnico en un proyecto de CS (2026-10-30)", () => {
  const texto = (ruta: string) => soloCodigo(fs.readFileSync(path.join(RAIZ, ruta), "utf8"));

  it("la ruta lo rechaza antes de tocar HubSpot", () => {
    const ruta = texto("app/api/clients/[id]/cse-encargado/route.ts");
    const candado = ruta.indexOf("if (esDelEquipoTecnico(destino.roleEnum))");
    expect(candado).toBeGreaterThan(-1);
    expect(candado).toBeLessThan(ruta.indexOf("getSystemHubspotClient()"));
  });

  it.each(["app/(shell)/clients/ClientsTable.tsx", "lib/cs/load-account.ts", "lib/mi-dia/cartera-cs-server.ts"])("%s no lo ofrece", (ruta) => {
    expect(texto(ruta)).toContain("!esDelEquipoTecnico(m.roleEnum)");
  });

  it("Éxito del cliente no lo ofrece en la celda ni lo propone en «Cuentas sin CSE»", () => {
    const cartera = texto("lib/cs/cartera.ts");
    expect(cartera).toMatch(/equipoParaPase: delEquipo\.filter\([^\n]*!esDelEquipoTecnico\(m\.roleEnum\)/);
    expect(cartera).toMatch(/proponerCseParaLasCuentas\(\s*cuentas,\s*delEquipo\.filter\([^\n]*!esDelEquipoTecnico\(m\.roleEnum\)/);
  });

  it("el pase por consola lo rechaza antes de mover nada", () => {
    const script = texto("scripts/pase-de-cuenta.ts");
    const candado = script.indexOf("if (esDelEquipoTecnico(destino.roleEnum)) throw");
    expect(candado).toBeGreaterThan(-1);
    expect(candado).toBeLessThan(script.indexOf("pasarLoDeLaCuenta(", candado));
  });

  it("en un pipeline sin declarar el pase no pisa al propietario: no se sabe de quién es", () => {
    expect(texto("app/api/clients/[id]/cse-encargado/route.ts")).toContain("{ propietario: !!resolvePipeline(p.hubspotPipelineId) }");
  });
});
