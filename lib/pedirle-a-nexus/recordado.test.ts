/**
 * lib/pedirle-a-nexus/recordado.test.ts — el pedido de cada lugar queda recordado mientras la página esté abierta (23 nov):
 * cerrar el cajón y volver a abrirlo trae lo pedido, la propuesta, lo aplicado, lo descartado y el «Deshacer».
 */
import { describe, expect, it } from "vitest";
import type { PropuestaDeNexus } from "./contrato";
import { leerRecordado, loQueSeVeEnElHilo, recordar, SIN_PEDIDO } from "./recordado";

const PROPUESTA: PropuestaDeNexus = {
  pedido: "cambia el titular",
  cambios: [
    { clave: "t/a", nombre: "El titular", seccion: "Arriba", antes: "Viejo", despues: "Nuevo", aMano: false, agregar: false },
    { clave: "r/b", nombre: "Un punto", seccion: "Puntos clave", antes: null, despues: "Otro", aMano: false, agregar: true },
  ],
  descartados: [],
  nota: null,
  corrida: "run-1",
};

describe("el pedido recordado de un lugar", () => {
  it("sin nada pedido, está vacío", () => {
    expect(leerRecordado("escala:x:resumen")).toBe(SIN_PEDIDO);
  });

  it("lo aplicado, lo descartado y el «Deshacer» siguen ahí al volver a leerlo (como al reabrir el cajón)", () => {
    const clave = "escala:e1:resumen";
    recordar(clave, { pedido: "cambia el titular", pidiendo: true });
    recordar(clave, { pidiendo: false, propuesta: PROPUESTA, estados: {} });
    recordar(clave, (e) => ({ estados: { ...e.estados, "t/a": "aplicado" }, hecho: { aviso: "Listo.", deshacer: { versionId: "v1", firma: "f1" }, claves: ["t/a"] } }));
    recordar(clave, (e) => ({ estados: { ...e.estados, "r/b": "descartado" } }));
    const r = leerRecordado(clave);
    expect(r.pedido).toBe("cambia el titular");
    expect(r.propuesta?.cambios).toHaveLength(2);
    expect(r.estados).toEqual({ "t/a": "aplicado", "r/b": "descartado" });
    expect(r.hecho?.deshacer).toEqual({ versionId: "v1", firma: "f1" });
    // La misma referencia mientras no cambia (lo pide useSyncExternalStore).
    expect(leerRecordado(clave)).toBe(r);
  });

  it("cada lugar tiene el suyo: el Resumen y un área, o dos exploraciones, no se mezclan", () => {
    recordar("escala:e2:resumen", { pedido: "del Resumen" });
    recordar("escala:e2:area:1", { pedido: "de Ventas" });
    expect(leerRecordado("escala:e2:resumen").pedido).toBe("del Resumen");
    expect(leerRecordado("escala:e2:area:1").pedido).toBe("de Ventas");
    expect(leerRecordado("escala:e3:resumen")).toBe(SIN_PEDIDO);
  });
});

describe("⛔ lo que muestra el hilo del pedido (24 nov, el chat «Nexus» de todos)", () => {
  it("mientras Nexus piensa un pedido nuevo, se ve ESE pedido y la propuesta de antes se esconde", () => {
    expect(loQueSeVeEnElHilo({ enviado: "agrega un punto sobre WhatsApp", pidiendo: true, propuesta: PROPUESTA })).toEqual({
      pedido: "agrega un punto sobre WhatsApp",
      conPropuesta: false,
    });
  });

  it("si el pedido falla (enviado vuelve a null), la propuesta de antes vuelve con su pedido", () => {
    expect(loQueSeVeEnElHilo({ enviado: null, pidiendo: false, propuesta: PROPUESTA })).toEqual({ pedido: "cambia el titular", conPropuesta: true });
  });

  it("con la propuesta nueva en la mano, se ven el pedido y la propuesta", () => {
    expect(loQueSeVeEnElHilo({ enviado: "cambia el titular", pidiendo: false, propuesta: PROPUESTA })).toEqual({ pedido: "cambia el titular", conPropuesta: true });
  });

  it("sin nada pedido, nada", () => {
    expect(loQueSeVeEnElHilo(SIN_PEDIDO)).toEqual({ pedido: null, conPropuesta: false });
  });
});
