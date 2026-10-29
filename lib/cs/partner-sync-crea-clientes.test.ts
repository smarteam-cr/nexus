/**
 * lib/cs/partner-sync-crea-clientes.test.ts — la copia de HubSpot Partner no crea clientes si nadie lo pide.
 *
 * Crear fichas es una decisión: el botón del panel y `scripts/run-partner-sync.ts --apply` la piden explícita; el job
 * diario, solo con `CS_PARTNER_CREA_CLIENTES` (lib/jobs/requisitos.ts). Hasta la revisión de la juntura (2026-10-24) el
 * default de `syncPartnerClients` era crear, así que borrar el argumento en el job, o atarlo de nuevo al vigía, volvía a
 * fabricar clientes cada mañana sin que ninguna prueba se pusiera en rojo. Escaneo del texto: el default y las llamadas.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

describe("la copia de Partner y la creación de clientes", () => {
  it("por defecto no crea clientes", () => {
    expect(leer("lib/cs/partner-sync.ts")).toMatch(/const createClients = options\.createClients \?\? false;/);
  });

  it("el job diario pide crear SOLO con la bandera propia", () => {
    const defs = leer("lib/jobs/defs.ts");
    const llamadas = [...defs.matchAll(/syncPartnerClients\((\{[^}]*\})\)/g)].map((m) => m[1].trim());
    expect(llamadas).toEqual(["{ createClients: partnerCreaClientes(process.env) }"]);
  });

  it("el botón del panel y el script lo piden explícito", () => {
    expect(leer("app/api/cs/partner/refresh/route.ts")).toMatch(/syncPartnerClients\(\{ createClients \}\)/);
    expect(leer("scripts/run-partner-sync.ts")).toMatch(/syncPartnerClients\(\{ createClients: apply(, cambiarRegistros: apply)? \}\)/);
  });
});
