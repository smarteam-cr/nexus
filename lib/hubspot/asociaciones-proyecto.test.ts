import { describe, it, expect } from "vitest";
import {
  ASOCIACIONES_DE_PROYECTO,
  bloqueDeAsociaciones,
  OBJETO_PROYECTOS,
  type DestinoDeAsociacion,
} from "./asociaciones-proyecto";

/**
 * La tabla de asociaciones, TRANSCRITA — no derivada.
 *
 * Estos tres números vienen del portal (`scripts/inspect-project-associations.ts`, 2026-07-31)
 * y no se pueden calcular desde el repo. Escribirlos acá a mano es el punto: si alguien "los
 * actualiza" en el módulo, este archivo falla y obliga a volver a correr el script contra el
 * portal en vez de confiar en una corazonada.
 *
 * POR QUÉ IMPORTA TANTO UN NÚMERO: un typeId equivocado no revienta. HubSpot crea la
 * asociación bajo otra etiqueta y el desarrollo queda sin colgar de su implementación → entra
 * a Cobranza por su cuenta. Es plata, en silencio.
 */
const CONGELADA: Record<DestinoDeAsociacion, { hacia: string; typeId: number }> = {
  empresa: { hacia: "companies", typeId: 1236 },
  trato: { hacia: "deals", typeId: 1238 },
  hermano: { hacia: "0-970", typeId: 1254 },
};

describe("las tres asociaciones del alta, transcritas del portal", () => {
  it("son exactamente tres, y ninguna de más", () => {
    expect(Object.keys(ASOCIACIONES_DE_PROYECTO).sort()).toEqual(["empresa", "hermano", "trato"]);
  });

  for (const [destino, esperada] of Object.entries(CONGELADA) as Array<
    [DestinoDeAsociacion, { hacia: string; typeId: number }]
  >) {
    it(`${destino}: typeId ${esperada.typeId} hacia ${esperada.hacia}`, () => {
      const real = ASOCIACIONES_DE_PROYECTO[destino];
      expect(real.typeId).toBe(esperada.typeId);
      expect(real.hacia).toBe(esperada.hacia);
      // Solo sirven las que define HubSpot: una etiqueta creada a mano en el portal se puede
      // borrar desde la UI y dejaría el alta rota sin aviso.
      expect(real.category).toBe("HUBSPOT_DEFINED");
    });
  }

  it("cada una dice qué se rompe si falta", () => {
    for (const [destino, def] of Object.entries(ASOCIACIONES_DE_PROYECTO)) {
      expect(def.paraQue.length, destino).toBeGreaterThan(40);
    }
  });

  /**
   * El casi-error, escrito para que no vuelva.
   *
   * Hacia `deals` el portal devuelve DOS asociaciones definidas por HubSpot: 1383 "Deal Plan"
   * y 1238 sin etiqueta. La de por defecto es la SIN etiqueta. Y el orden en que el portal las
   * devuelve cambió entre dos corridas del mismo script con 40 segundos de diferencia, así que
   * "tomar la primera definida" ni siquiera fallaba siempre igual.
   */
  it("el trato NO es 1383 ('Deal Plan'): la de por defecto es la que no tiene etiqueta", () => {
    expect(ASOCIACIONES_DE_PROYECTO.trato.typeId).not.toBe(1383);
  });

  it("el hermano apunta al MISMO objeto que se está creando", () => {
    expect(ASOCIACIONES_DE_PROYECTO.hermano.hacia).toBe(OBJETO_PROYECTOS);
  });
});

describe("el bloque de asociaciones del POST", () => {
  it("arma las tres cuando están los tres ids", () => {
    const b = bloqueDeAsociaciones({ empresa: "1", trato: "2", hermano: "3" });
    expect(b).toEqual([
      { to: { id: "1" }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 1236 }] },
      { to: { id: "2" }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 1238 }] },
      { to: { id: "3" }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 1254 }] },
    ]);
  });

  /**
   * Un proyecto interno no tiene trato y uno que va solo no tiene hermano. Mandar la entrada
   * con el id vacío hace que HubSpot rechace el POST entero — o sea que el alta fallaría para
   * el caso NORMAL de un desarrollo independiente.
   */
  it("omite los que no tienen id, en vez de mandarlos vacíos", () => {
    expect(bloqueDeAsociaciones({ empresa: "1" })).toHaveLength(1);
    expect(bloqueDeAsociaciones({ empresa: "1", trato: null, hermano: undefined })).toHaveLength(1);
    expect(bloqueDeAsociaciones({})).toEqual([]);
  });

  it("un id en blanco cuenta como ausente, no como id", () => {
    expect(bloqueDeAsociaciones({ empresa: "1", trato: "   " })).toHaveLength(1);
  });

  it("no inventa un orden distinto en cada llamada", () => {
    const a = bloqueDeAsociaciones({ empresa: "1", trato: "2", hermano: "3" });
    const b = bloqueDeAsociaciones({ empresa: "1", trato: "2", hermano: "3" });
    expect(a).toEqual(b);
  });
});
