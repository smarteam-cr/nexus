import { describe, expect, it } from "vitest";
import { cifrasPermitidas } from "../cifras";
import { fotoDePrueba, HOY } from "../__fixtures__/foto";
import { armarHechos } from "./hechos";

/**
 * lib/auditoria-portal/analisis/hechos.test.ts — LO ÚNICO QUE VE EL MODELO. Cada hecho con su clave;
 * «no se pudo leer» nunca se escribe como cero.
 */

const texto = (h: ReturnType<typeof armarHechos>, clave: string) => h.hechos.find((x) => x.clave === clave)?.texto ?? null;

describe("armarHechos", () => {
  const h = armarHechos(fotoDePrueba(), HOY);

  it("claves únicas, cada una con su sección y su rótulo", () => {
    const claves = h.hechos.map((x) => x.clave);
    expect(new Set(claves).size).toBe(claves.length);
    for (const x of h.hechos) expect(x.etiqueta.length).toBeGreaterThan(2);
  });

  it("totales, etapas con porcentaje y lo que quedó sin etapa", () => {
    expect(texto(h, "portal.totales")).toBe("Contactos: 1.000 · Empresas: 200 · Negocios: 120 · Tickets: 40");
    expect(texto(h, "ciclo.contactos")).toContain("MQL 5 (0,5 %)");
    expect(texto(h, "ciclo.contactos")).toContain("sin etapa: 55 (5,5 %)");
  });

  it("los cruces de la configuración: choques, gente que se fue y dominios", () => {
    expect(texto(h, "workflows.misma_propiedad")).toContain("hs_lead_status (2)");
    expect(texto(h, "workflows.sin_detalle")).toContain("1");
    expect(texto(h, "propiedades.creadores")).toContain("creadas por personas que ya no tienen usuario: 2");
    expect(texto(h, "usuarios.dominios")).toContain("cliente.test 1 (Super Admin 1)");
    expect(texto(h, "usuarios.equipos")).toBe("Equipos: no se pudo leer");
  });

  it("el detalle nombra los workflows y lo que creó quien ya no está, sin correos", () => {
    expect(h.detalle).toContain("Califica leads");
    expect(h.detalle).toContain("Origen feria | contactos | Persona que se fue (agencia.test)");
    expect(h.detalle).not.toMatch(/@/);
  });

  it("una lectura fallida se dice, no se escribe como cero", () => {
    const f = armarHechos(
      fotoDePrueba({ lecturas: { version: 1, intentos: 67, fallidas: [{ bloque: "etapas_del_portal", que: "Las etapas del ciclo de vida", motivo: "red" }] } }),
      HOY,
    );
    expect(texto(f, "ciclo.contactos")).toContain("no se pudo leer");
    expect(texto(f, "lecturas.fallidas")).toContain("Las etapas del ciclo de vida");
  });

  it("cada pipeline es un hecho: etapas en orden, dónde se acumula y lo que no se mueve", () => {
    const p1 = texto(h, "pipeline.p1")!;
    expect(p1).toContain("abiertos 110");
    expect(p1).toContain("sin actividad registrada (nota, llamada, correo o reunión) en 90 días 40 (36,4 %)");
    expect(p1).toContain("Nuevo 30 (probabilidad 10 %) · Propuesta 80 (probabilidad 60 %) · Ganado 8 [cierra]");
    expect(p1).toContain("donde se acumulan los abiertos: «Propuesta» 80 (72,7 %)");
    expect(p1).toContain("ningún workflow encendido corre por sus etapas ni las pone");
  });

  it("sin cliente no hay hechos del cliente; con cliente, su texto viaja aparte y la Planificación se compara", () => {
    expect(h.cliente).toBe("");
    expect(texto(h, "cliente.fuentes")).toBeNull();
    const c = armarHechos(
      fotoDePrueba({
        contextoDelCliente: {
          fuentes: [{ documento: "Planificación", proyecto: "Implementación" }],
          pipelinesPlaneados: [{ nombre: "Ventas", tipo: "ventas", etapas: ["Nuevo", "Propuesta", "Negociación"] }],
          texto: "[Planificación · Implementación] El proceso de venta tiene 3 etapas.",
        },
      }),
      HOY,
    );
    expect(c.cliente).toContain("El proceso de venta tiene 3 etapas.");
    expect(texto(c, "cliente.fuentes")).toContain("Planificación (Implementación)");
    expect(texto(c, "pipelines.planificacion")).toContain("faltan en el portal Negociación");
  });

  it("las cifras de los hechos son las que el análisis puede citar", () => {
    const permitidas = cifrasPermitidas(h.hechos.map((x) => x.texto));
    expect(permitidas).toEqual(expect.arrayContaining([1000, 200, 0.5, 55, 450]));
  });
});
