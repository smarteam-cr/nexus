import { describe, expect, it } from "vitest";
import { contenidoVacio, propuestaVacia, type EstadoDeExploracion } from "./contenido";
import { sePuedeReintentar } from "./reintento";

function estado(cambios: Partial<EstadoDeExploracion> = {}): EstadoDeExploracion {
  return {
    contenido: contenidoVacio(),
    propuesta: propuestaVacia(),
    areas: ["1"],
    edicion: null,
    perfilCierre: null,
    perfilDespues: null,
    responsableEmail: null,
    archivada: false,
    ...cambios,
  };
}

/** Lo que hace el agente al preparar: la industria sugerida, el país y el tamaño. */
function preparadoPorElAgente(e: EstadoDeExploracion): EstadoDeExploracion {
  return {
    ...e,
    edicion: "banca",
    perfilCierre: "con equipo",
    perfilDespues: "continua",
    contenido: {
      ...e.contenido,
      medicion: { pais: "Costa Rica" },
      edicionElegida: { por: "agente", sugerida: { edicion: "banca", cierre: "con equipo", despues: "continua", por: "agente" } },
    },
  };
}

describe("sePuedeReintentar", () => {
  it("restablecer la escala sugerida se reintenta aunque el agente haya preparado entretanto", () => {
    const antes = estado();
    const ahora = preparadoPorElAgente(antes);
    const op = { op: "restablecerEscala" as const, sugerida: { edicion: "banca", cierre: "con equipo" as const, despues: "continua" as const, por: "agente" as const } };
    expect(sePuedeReintentar([op], antes, ahora)).toBe(true);
  });

  it("un nivel se reintenta si el agente cambió otra cosa, y no si cambió ese mismo nivel", () => {
    const antes = estado();
    const op = { op: "nivel" as const, dimensionId: "1.3", estimado: { nivel: "I" as const, fuente: "vendedor" as const } };
    expect(sePuedeReintentar([op], antes, preparadoPorElAgente(antes))).toBe(true);
    const otraPersona = estado({ contenido: { ...contenidoVacio(), chequeo: { "1.3": { nivel: "F", fuente: "vendedor" } } } });
    expect(sePuedeReintentar([op], antes, otraPersona)).toBe(false);
  });

  it("la lista de áreas no se reintenta si las áreas cambiaron: se pisaría lo que sumó otro", () => {
    const antes = estado();
    const op = { op: "areas" as const, areas: ["1", "2"] };
    expect(sePuedeReintentar([op], antes, preparadoPorElAgente(antes))).toBe(true);
    expect(sePuedeReintentar([op], antes, estado({ areas: ["1", "3"] }))).toBe(false);
  });

  it("el perfil lleva las dos respuestas: si el agente cambió el perfil, no se reintenta", () => {
    const antes = estado();
    const op = { op: "perfil" as const, cierre: "mixta" as const, despues: null };
    expect(sePuedeReintentar([op], antes, preparadoPorElAgente(antes))).toBe(false);
  });

  it("la medición se mira campo por campo: el país que puso el agente no frena el tamaño", () => {
    const antes = estado();
    const ahora = preparadoPorElAgente(antes);
    expect(sePuedeReintentar([{ op: "medicion", medicion: { personasEquipo: "6" } }], antes, ahora)).toBe(true);
    expect(sePuedeReintentar([{ op: "medicion", medicion: { pais: "Panamá" } }], antes, ahora)).toBe(false);
  });

  it("sin operaciones no hay nada que reintentar", () => {
    expect(sePuedeReintentar([], estado(), estado())).toBe(false);
  });
});
