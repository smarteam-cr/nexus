/**
 * lib/clients/empresa-de-hubspot-modulo.test.ts — la regla «una empresa de HubSpot, una ficha» vive en UN módulo
 * (lib/clients/empresa-de-hubspot.ts) y los que crean o asignan la empresa pasan por él (R7b, revisión de la juntura del
 * 2026-10-24). Antes la copia de proyectos y la de Partner la repetían a mano, y al romper esas copias ninguna prueba se
 * quejaba. Escaneo del texto: que llamen al módulo y no vuelvan a escribir la empresa por su cuenta.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("el módulo único de la empresa de HubSpot", () => {
  it("la copia de proyectos guarda la empresa por el módulo, y no por su cuenta", () => {
    const src = sinComentarios(leer("lib/hubspot/sync-projects.ts"));
    expect(src).toContain("asignarEmpresaDeHubspot(clientId, companyId)");
    // Ni un `client.update` que escriba la empresa, ni el P2002 a mano.
    expect(src).not.toMatch(/client\.update\(\{[^}]*data:\s*\{\s*hubspotCompanyId/);
    expect(src).not.toContain("esUnicoViolado");
  });

  it("la copia de Partner crea la ficha por el módulo cuando tiene empresa", () => {
    const src = sinComentarios(leer("lib/cs/partner-sync.ts"));
    expect(src).toContain("crearOReusarFicha(draft.hubspotCompanyId, crear)");
    expect(src).not.toContain("esUnicoViolado");
  });

  it("el módulo no depende de la sesión (lo usan scripts); el aviso para una persona, sí, y va aparte", () => {
    const modulo = leer("lib/clients/empresa-de-hubspot.ts");
    expect(modulo).not.toMatch(/import\s+"server-only"/);
    expect(modulo).not.toMatch(/from\s+"@\/lib\/auth\//);
    const aviso = leer("lib/clients/empresa-de-hubspot-aviso.ts");
    expect(aviso).toMatch(/import\s+"server-only"/);
    expect(aviso).toContain("requireAccessToClient(ficha.id)");
  });
});
