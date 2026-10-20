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
