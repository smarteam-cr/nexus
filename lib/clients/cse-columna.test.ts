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
    /* La edición que la pone en rojo: volver `const proyectosDeCS = c.projects;` (sin `.filter`),
       o mapear `cseNames` directo desde `c.projects` otra vez. `tsc` NO cazaría ese cambio —
       sigue siendo TypeScript válido, solo cambia el comportamiento en producción. */
    const i = FUENTE.indexOf("const proyectosDeCS = c.projects.filter(esProyectoDePipelineCS);");
    expect(i, "desapareció el filtro por pipeline antes de armar los arrays").toBeGreaterThan(-1);
    const bloque = FUENTE.slice(i, FUENTE.indexOf("const cseEmails = [", i) + 400);
    expect(bloque.length, "la guarda no está mirando nada").toBeGreaterThan(200);
    /* ⚠ NO se busca ".map((p) => p.hubspotOwnerName)" como string contiguo: el formato real
       parte la llamada en dos líneas (`proyectosDeCS\n  .map(...)`). Y NO alcanza con que
       ".map((p) => p.hubspotOwnerName)" exista en algún lado — eso también sería cierto si
       alguien volviera a mapear directo `c.projects`. Lo que hace falta es que el RECEPTOR de
       los dos `.map()` sea `proyectosDeCS`: se cuenta cuántas veces aparece el nombre en el
       bloque — 1 por la definición, 1 por cada `.map()` que lo usa. */
    const usos = (bloque.match(/proyectosDeCS/g) ?? []).length;
    expect(
      usos,
      "cseNames/cseEmails dejaron de leer de `proyectosDeCS` (la lista ya filtrada por " +
        "pipeline): vuelve a mezclar el CSE real con desarrolladores de proyectos hijos",
    ).toBe(3);
    expect(bloque).toContain(".map((p) => p.hubspotOwnerName)");
    expect(bloque).toContain(".map((p) => p.hubspotOwnerEmail)");
  });
});
