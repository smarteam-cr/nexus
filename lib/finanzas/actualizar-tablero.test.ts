/**
 * lib/finanzas/actualizar-tablero.test.ts
 *
 * Correr: `npx vitest run lib/finanzas/actualizar-tablero.test.ts --project unit`.
 *
 * «Actualizar» del punto de equilibrio (revisión con Alex, 2026-09-29): qué se le dice a quien lo aprieta, y que una
 * fuente caída no se esconda ni tape a la otra.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SyncVentasResult } from "@/lib/ventas/sync-ganadas";
import { avisoDeActualizacion, resumenDeVentas, ventasSinActualizar } from "./actualizar-tablero";

const corrida = (p: Partial<SyncVentasResult> = {}): SyncVentasResult => ({
  traidas: 94,
  altas: 0,
  actualizadas: 0,
  sinCambio: 94,
  cambios: 0,
  sinMonto: 0,
  reclasificadas: 0,
  errores: [],
  ...p,
});

describe("lo que dice «Actualizar» de las ventas de HubSpot", () => {
  it("sin novedades lo dice: el tablero no cambió porque no había nada nuevo, no porque falló", () => {
    expect(resumenDeVentas(corrida(), 2026)).toEqual({
      fuente: "HUBSPOT",
      ok: true,
      texto: "Ventas de HubSpot: 94 tratos ganados en 2026, sin cambios.",
    });
  });

  it("dice cuántos tratos entraron, cuántos cambiaron y cuántos dejaron de estar ganados", () => {
    const r = resumenDeVentas(corrida({ traidas: 96, altas: 2, actualizadas: 1, reclasificadas: 1 }), 2026);
    expect(r.ok).toBe(true);
    expect(r.texto).toBe("Ventas de HubSpot: 96 tratos ganados en 2026, 2 nuevos · 1 con cambios · 1 que ya no está ganado.");
  });

  it("otra corrida en curso no es un fallo: se muestra lo que había", () => {
    const r = resumenDeVentas({ ...corrida({ traidas: 0, sinCambio: 0 }), locked: true }, 2026);
    expect(r.ok).toBe(true);
    expect(r.texto).toContain("ya se estaban actualizando");
  });

  it("⚠ una lectura a medias se dice como fallo, con su motivo: no cambió nada", () => {
    const r = resumenDeVentas(corrida({ traidas: 10, parcial: true, errores: ["La búsqueda trajo 10 tratos contra 94 conocidos (menos del 50%): no se reclasifica nada."] }), 2026);
    expect(r.ok).toBe(false);
    expect(r.texto).toContain("no se cambió nada");
    expect(r.texto).toContain("10 tratos contra 94");
  });

  it("un trato que no se pudo leer no tumba la corrida, pero se avisa", () => {
    const r = resumenDeVentas(corrida({ errores: ["AMVAC | WEB: sin fecha de cierre legible — no se espeja."] }), 2026);
    expect(r.ok).toBe(true);
    expect(r.texto).toContain("⚠ Un trato no se pudo leer");
  });

  it("HubSpot caído: fallo con el motivo", () => {
    expect(ventasSinActualizar(new Error("HubSpot 401: token vencido"))).toEqual({
      fuente: "HUBSPOT",
      ok: false,
      texto: "No se pudieron actualizar las ventas de HubSpot: HubSpot 401: token vencido",
    });
  });
});

describe("el aviso junta las dos fuentes y no esconde la que falló", () => {
  const ventasBien = resumenDeVentas(corrida(), 2026);
  const odooBien = { fuente: "ODOO" as const, ok: true, texto: "Listo: Nexus leyó las 378 facturas de Odoo ahora y no cambió nada desde la copia anterior." };
  const odooMal = { fuente: "ODOO" as const, ok: false, texto: "No se pudo leer Odoo: No se pudo llegar al servidor de Odoo. Lo que ves es la copia anterior." };

  it("las dos bien: todo bien, con las dos frases", () => {
    const a = avisoDeActualizacion([ventasBien, odooBien]);
    expect(a.todoBien).toBe(true);
    expect(a.texto).toBe(`${ventasBien.texto} ${odooBien.texto}`);
  });

  it("⚠ con una caída deja de ser «todo bien», y la frase de la otra sigue ahí", () => {
    const a = avisoDeActualizacion([ventasBien, odooMal]);
    expect(a.todoBien).toBe(false);
    expect(a.texto).toContain("Ventas de HubSpot: 94 tratos");
    expect(a.texto).toContain("No se pudo leer Odoo");
  });
});

describe("⚠ el botón del tablero: privacidad y robustez", () => {
  const leer = (rel: string) => readFileSync(join(__dirname, "..", "..", rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("la ruta pide el guard de costos antes que nada: devuelve el reporte con planilla y estructura de costos", () => {
    const ruta = leer("app/api/cobranza/costos/equilibrio/actualizar/route.ts");
    const cuerpo = ruta.slice(ruta.indexOf("export async function POST"));
    expect(cuerpo.indexOf("guardCostosAccess()")).toBeGreaterThan(0);
    expect(cuerpo.indexOf("guardCostosAccess()")).toBeLessThan(cuerpo.indexOf("actualizarFuentesDelTablero("));
    expect(cuerpo.indexOf("actualizarFuentesDelTablero("), "el reporte se arma DESPUÉS de traer lo último").toBeLessThan(cuerpo.indexOf("loadReporteAnual("));
  });

  it("⛔ una fuente caída no tumba a las otras ni impide recargar: cada una ataja su propio fallo", () => {
    /* La edición que lo pone en rojo: sacarle el `.catch` a una de las tres. Con HubSpot caído, el botón daría error
       y el tablero no se recargaría, en plena reunión. Desde el rediseño de Finanzas (2026-10-03) son tres fuentes:
       HubSpot, Odoo y Mercury, y Conciliación pide solo las dos últimas. */
    const src = leer("lib/finanzas/actualizar-tablero-server.ts");
    expect(src.match(/\.catch\(/g)?.length).toBe(3);
    expect(src).toMatch(/Promise\.all\(\[ventas, odoo, mercury\]\)/);
    expect(src).toMatch(/Promise\.all\(\[odoo, mercury\]\)/);
  });
});
