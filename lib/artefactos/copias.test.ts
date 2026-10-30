import { describe, expect, it } from "vitest";
import {
  esCopia,
  estadoDelArtefacto,
  nombreDelArtefacto,
  nombreGuardableDeUnaCopia,
  nombreParaUnaCopiaNueva,
  ordenarArtefactos,
  rotuloParaLosAgentes,
  tipoDelDocumento,
} from "./copias";

describe("tipoDelDocumento", () => {
  it("el documento de siempre es de su slug; una copia, de su tipoArtefacto", () => {
    expect(tipoDelDocumento({ slug: "planning", name: "Planificación" })).toBe("planning");
    expect(tipoDelDocumento({ slug: null, tipoArtefacto: "planning", name: "Planificación — Marketing" })).toBe("planning");
    expect(tipoDelDocumento({ slug: null, tipoArtefacto: "adoption-plan", name: "Líderes" })).toBe("adoption-plan");
  });

  it("⛔ una copia llamada «Planificación» NO se resuelve por su nombre (sigue siendo la copia)", () => {
    const copia = { slug: null, tipoArtefacto: "diagnosis", name: "Planificación" };
    expect(tipoDelDocumento(copia)).toBe("diagnosis");
    expect(esCopia(copia)).toBe(true);
  });

  it("una fila vieja sin slug se resuelve por su nombre histórico; un canvas suelto o de propuesta, por nada", () => {
    expect(tipoDelDocumento({ slug: null, name: "Kickoff" })).toBe("kickoff");
    expect(tipoDelDocumento({ slug: null, name: "Mis notas" })).toBeNull();
    expect(tipoDelDocumento({ slug: null, name: "Kickoff", businessCaseId: "bc1" })).toBeNull();
  });
});

describe("el nombre en pantalla", () => {
  it("el documento de siempre sin renombrar se ve como hoy: la etiqueta de su pieza", () => {
    expect(nombreDelArtefacto({ slug: "planning", name: "Planificación" })).toBe("Planificación");
    expect(nombreDelArtefacto({ slug: "tech-requirements", name: "Desarrollo" })).toBe("Integraciones");
  });

  it("con `titulo` (el nombre que puso una persona) gana el titulo, también en el de siempre", () => {
    expect(nombreDelArtefacto({ slug: "planning", name: "Planificación", titulo: "Planificación de Ventas" })).toBe("Planificación de Ventas");
    expect(nombreDelArtefacto({ slug: null, tipoArtefacto: "planning", name: "WhatsApp", titulo: "Marketing" })).toBe("Marketing");
  });

  it("sin titulo, el de siempre con un `name` viejo cualquiera se ve con la etiqueta de su pieza; una copia, con su name", () => {
    expect(nombreDelArtefacto({ slug: "planning", name: "Nombre viejo en la base" })).toBe("Planificación");
    expect(nombreDelArtefacto({ slug: null, tipoArtefacto: "planning", name: "WhatsApp" })).toBe("WhatsApp");
  });

  it("una copia nunca se guarda con un nombre que resuelve una pieza", () => {
    expect(nombreGuardableDeUnaCopia("Kickoff")).toBe("Kickoff · copia");
    expect(nombreGuardableDeUnaCopia("  Planificación   Marketing ")).toBe("Planificación Marketing");
    expect(nombreGuardableDeUnaCopia("   ")).toBe("");
    expect(nombreGuardableDeUnaCopia("x".repeat(300)).length).toBe(120);
  });

  it("una copia nueva sin nombre: el del tipo con su número, sin repetir", () => {
    expect(nombreParaUnaCopiaNueva("planning", ["Planificación"])).toBe("Planificación 2");
    expect(nombreParaUnaCopiaNueva("planning", ["Planificación", "Planificación 2"])).toBe("Planificación 3");
    expect(nombreParaUnaCopiaNueva("adoption-plan", [])).toBe("Plan de adopción 1");
  });
});

describe("estado, orden y rótulo para los agentes", () => {
  it("sin fecha está en construcción; con fecha, terminado", () => {
    expect(estadoDelArtefacto({ terminadoEn: null })).toBe("en_construccion");
    expect(estadoDelArtefacto({ terminadoEn: new Date() })).toBe("terminado");
  });

  it("ordena por el orden elegido y, a la par, el más viejo primero", () => {
    const l = ordenarArtefactos([
      { id: "c", order: 2, createdAt: "2026-10-01" },
      { id: "b", order: 1, createdAt: "2026-10-03" },
      { id: "a", order: 1, createdAt: "2026-10-02" },
    ]);
    expect(l.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("el rótulo dice el tipo, el nombre y el estado", () => {
    expect(rotuloParaLosAgentes({ slug: "planning", name: "Planificación", terminadoEn: new Date() })).toBe("Planificación (terminado)");
    expect(rotuloParaLosAgentes({ slug: null, tipoArtefacto: "planning", name: "Marketing", terminadoEn: null })).toBe(
      "Planificación — Marketing (en construcción)",
    );
  });
});
