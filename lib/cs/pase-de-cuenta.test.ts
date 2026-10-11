/**
 * lib/cs/pase-de-cuenta.test.ts — lo esencial de la memoria interna en el aviso del pase de cuenta (memoria de la
 * cuenta, etapa 3, 2026-10-10).
 * Correr: `npx vitest run --project unit lib/cs/pase-de-cuenta.test.ts`.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { textoDeAviso } from "@/lib/para-ti/avisos";
import type { CuentaDeCartera } from "./cartera-reglas";
import { leerPartner } from "./lectura-partner";
import { lineaDeLoEsencial, resumenDelPase } from "./pase-de-cuenta";

describe("lo esencial en una línea", () => {
  it("cuenta los datos confirmados, nombra a las personas (sin su postura) y cuenta compromisos y pedidos", () => {
    const linea = lineaDeLoEsencial([
      { clave: "ficha", lineas: ["A qué se dedica: Fundación", "Herramientas actuales: Excel"] },
      { clave: "personas", lineas: ["Ana — directora — sponsor — SECRETO escéptica", "Luis — TI — usuario", "Marta — finanzas — aprueba", "Pedro — ventas — usuario"] },
      { clave: "compromisos", lineas: ["Enviar la base (vence 2026-10-15) · lo prometió el cliente"] },
      { clave: "pedidos", lineas: ["[Confirmada] Un portal de egresados", "[Por revisar] Otra integración"] },
    ]);
    expect(linea).toBe(
      "Lo que ya se sabe: 2 datos confirmados de la ficha · personas: Ana, Luis, Marta y 1 más · 1 compromiso abierto · 2 pedidos fuera de alcance abiertos.",
    );
    expect(linea).not.toMatch(/SECRETO/);
  });

  it("sin nada, ninguna línea", () => {
    expect(lineaDeLoEsencial([])).toBeNull();
  });
});

describe("⭐ el pase lee lo esencial de la memoria interna, por su lector", () => {
  const ruta = fs
    .readFileSync(path.join(process.cwd(), "app/api/clients/[id]/cse-encargado/route.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

  it("la ruta llama a loEsencialDeLaCuenta con «pase-de-cuenta» y se lo pasa al resumen", () => {
    expect(ruta).toContain('loEsencialDeLaCuenta(clientId, { lector: "pase-de-cuenta" })');
    expect(ruta).toContain("resumenDelPase(cuenta, hoy, esencial)");
  });

});

describe("el aviso del pase se corta a 280 caracteres: lo que no puede faltar va primero", () => {
  const HOY = "2026-10-09";
  const cuenta: CuentaDeCartera = {
    clientId: "c1",
    nombre: "Librería Internacional",
    partner: {
      ...leerPartner({ hs_is_active: "true", hs_is_managed: "true", hs_unified_usage_score: "35", hs_last_4_weeks_usage_score_trend: "-0.2" })!,
      proximaRenovacion: "2026-11-20",
    },
    proyectos: [
      {
        id: "p1",
        nombre: "Refresh HubSpot",
        etapa: "Configuración",
        cseNombre: "Andrea",
        cseEmail: "andrea@smarteamcr.com",
        activo: true,
        bloqueado: true,
        motivoBloqueo: "Atraso por Smarteam",
        detalleBloqueo: "Falta la integración con el ERP y el cliente ya preguntó dos veces por la fecha",
        atraso: null,
        cierre: { prometido: null, proyectado: null, corrimientoDias: null },
        avance: 0.4,
        salud: "EN_RIESGO",
        cerradoEn: null,
      },
    ],
    ultimoContacto: "2026-09-01T15:00:00Z",
    ticketsAbiertos: 3,
    alertas: [0, 1, 2].map((i) => ({
      id: `a${i}`,
      severidad: "HIGH" as const,
      categoria: "CHURN_RISK",
      titulo: "Riesgo",
      razon: "x",
      accion: null,
      proyecto: null,
      estado: "OPEN" as const,
      delAgente: true,
      detectadaEn: "2026-10-01T15:00:00Z",
    })),
    facturacion: null,
    licenciasManuales: [],
  };
  const esencial = [
    { clave: "ficha" as const, lineas: ["A qué se dedica: Librería", "Herramientas actuales: Excel", "Retos estratégicos: crecer en línea"] },
    { clave: "personas" as const, lineas: ["Ana Pérez Rodríguez — directora", "Luis Fernández — TI", "Marta Solís — finanzas", "Pedro Mora — ventas"] },
    { clave: "compromisos" as const, lineas: ["a", "b", "c"] },
    { clave: "pedidos" as const, lineas: ["x", "y"] },
  ];

  it("con una cuenta llena, el color, la renovación y las alertas entran en los 280", () => {
    const visto = textoDeAviso(resumenDelPase(cuenta, HOY, esencial), 280);
    expect(visto).toMatch(/^Riesgo alto: /);
    expect(visto).toContain("Renueva el");
    expect(visto).toContain("3 alertas abiertas");
    // Lo esencial va después: puede quedar cortado, nunca empujar lo de arriba.
    const resumen = resumenDelPase(cuenta, HOY, esencial);
    expect(resumen.indexOf("alertas abiertas")).toBeLessThan(resumen.indexOf("Lo que ya se sabe"));
  });
});
