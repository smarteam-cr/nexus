/**
 * lib/smarteam/posicionamiento.test.ts — el position statement de Smarteam (K3, 2026-10-28): lo que acepta al guardar,
 * cómo se lee el Json y cómo se le cuenta a un agente.
 */
import { describe, expect, it } from "vitest";
import { claveDelFrente, frentePendiente, leerFrentes, textoDelPosicionamiento } from "./posicionamiento";
import { PosicionamientoEdicionSchema } from "./posicionamiento-esquema";

const ESTRUCTURA = {
  nombre: "Estructura",
  herramienta: "HubSpot",
  promesa: "Ordenar procesos, datos y equipos en un solo lugar",
  titulo: "HubSpot: ordenar la relación con cada cliente",
  queLogra: [{ titulo: "Un solo lugar por cliente", detalle: "toda su historia, visible para el equipo" }],
  cuandoCabe: ["La venta toma semanas o meses"],
  nota: "Ejemplo: “tenemos CRM, pero nadie lo ve”",
};

describe("lo que acepta al guardar", () => {
  it("recorta, deja null lo vacío y saca la clave del nombre", () => {
    const p = PosicionamientoEdicionSchema.parse({
      frase: "  Acompañamos a empresas que están creciendo.  ",
      frentes: [ESTRUCTURA, { nombre: "Acompañamiento", herramienta: " ", promesa: "Que lo implementado se use", titulo: "", queLogra: [], cuandoCabe: [], nota: null }],
    });
    expect(p.frase).toBe("Acompañamos a empresas que están creciendo.");
    expect(p.frentes.map((f) => f.clave)).toEqual(["estructura", "acompanamiento"]);
    expect(p.frentes[1]).toMatchObject({ herramienta: null, titulo: null });
  });

  it("no pasan: un frente sin nombre o sin promesa, una condición vacía, dos frentes con el mismo nombre, un campo de más", () => {
    const ok = { frase: null, frentes: [ESTRUCTURA] };
    expect(PosicionamientoEdicionSchema.safeParse(ok).success).toBe(true);
    expect(PosicionamientoEdicionSchema.safeParse({ ...ok, frentes: [{ ...ESTRUCTURA, nombre: " " }] }).success).toBe(false);
    expect(PosicionamientoEdicionSchema.safeParse({ ...ok, frentes: [{ ...ESTRUCTURA, promesa: "" }] }).success).toBe(false);
    expect(PosicionamientoEdicionSchema.safeParse({ ...ok, frentes: [{ ...ESTRUCTURA, cuandoCabe: [" "] }] }).success).toBe(false);
    expect(PosicionamientoEdicionSchema.safeParse({ ...ok, frentes: [ESTRUCTURA, { ...ESTRUCTURA, nombre: "estructura" }] }).success).toBe(false);
    expect(PosicionamientoEdicionSchema.safeParse({ ...ok, otro: 1 }).success).toBe(false);
  });
});

describe("la lectura y el texto para un agente", () => {
  it("salta lo que no tiene forma y marca el frente pendiente", () => {
    const frentes = leerFrentes([{ ...ESTRUCTURA, queLogra: [{ titulo: "A" }, { titulo: " " }, 3] }, { nombre: "Sin promesa" }, null, { nombre: "Acompañamiento", promesa: "Que se use" }]);
    expect(frentes.map((f) => f.clave)).toEqual(["estructura", "acompanamiento"]);
    expect(frentes[0].queLogra).toEqual([{ titulo: "A", detalle: null }]);
    expect(frentePendiente(frentes[0])).toBe(false);
    expect(frentePendiente(frentes[1])).toBe(true);
    expect(leerFrentes("nada")).toEqual([]);
  });

  it("la clave sin tildes ni signos", () => {
    expect(claveDelFrente("Activación · Insider One")).toBe("activacion-insider-one");
  });

  it("el texto lleva la frase, la promesa, qué logra, cuándo cabe y lo pendiente; sin nada, null", () => {
    const t = textoDelPosicionamiento({ frase: "Acompañamos.", frentes: leerFrentes([ESTRUCTURA, { nombre: "Acompañamiento", promesa: "Que se use" }]) })!;
    expect(t).toContain("Smarteam en una frase: Acompañamos.");
    expect(t).toContain("Frente Estructura · HubSpot: Ordenar procesos");
    expect(t).toContain("Cuándo cabe: La venta toma semanas o meses");
    expect(t).toContain("Frente Acompañamiento: Que se use\n  (Pendiente: todavía sin su detalle.)");
    expect(textoDelPosicionamiento({ frase: null, frentes: [] })).toBeNull();
  });
});
