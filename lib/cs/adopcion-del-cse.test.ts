import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * El CSE de la cuenta ve solo la pestaña Adopción, sin montos (2026-10-07). Lo que llega a la pantalla viaja
 * entero al navegador: `soloLaAdopcion` tiene que VACIAR la plata, no esconderla.
 */
describe("lo que ve el CSE en Éxito del cliente", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "lib/cs/adopcion-del-cse.ts"), "utf8");
  const pagina = fs.readFileSync(path.join(process.cwd(), "app/(shell)/customer-success/[clientId]/page.tsx"), "utf8");

  it("vacía cada campo con plata de la cuenta", () => {
    for (const campo of ["mrrTotal: null", "mrrGestionado: null", "mrrManaged: null", "mrrUpForRenewal: null", "montoMensual: null", "comision: null", "facturacion: null", "licenciasManuales: []", "cambioAlRenovar: null"]) {
      expect(src, campo).toContain(campo);
    }
  });

  it("la página le pasa al CSE la cuenta vaciada y solo la adopción", () => {
    expect(pagina).toContain("soloLaAdopcion(data)");
    expect(pagina).toContain("soloAdopcion");
    expect(pagina).toContain("esLiderDeCs(ctx.role)");
  });
});
