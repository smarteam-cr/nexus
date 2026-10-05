import { describe, expect, it } from "vitest";
import { contenidoVacio, propuestaVacia, type EstadoDeExploracion, type ItemPropuesto } from "./contenido";
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

const SUGERIDA = { edicion: "banca", cierre: "con equipo" as const, despues: "continua" as const, por: "agente" as const };

/** El vendedor eligió otra edición a mano; la sugerida queda guardada para «Restablecer». */
function elegidaAMano(edicion: string): EstadoDeExploracion {
  return estado({
    edicion,
    perfilCierre: "con equipo",
    perfilDespues: "continua",
    contenido: { ...contenidoVacio(), edicionElegida: { por: "vendedor", sugerida: SUGERIDA } },
  });
}

/** Lo que propuso el agente: una casilla y la edición. */
function conSugeridas(e: EstadoDeExploracion): EstadoDeExploracion {
  const items: ItemPropuesto[] = [
    { id: "casilla:contexto:1", destino: { tipo: "casilla", clave: "contexto" }, valor: "Banco regional", fuentes: [], corridaId: null, en: "2026-10-05" },
    { id: "edicion:1", destino: { tipo: "edicion" }, valor: { slug: "banca" }, fuentes: [], corridaId: null, en: "2026-10-05" },
  ];
  return { ...e, propuesta: { ...e.propuesta, items } };
}

describe("sePuedeReintentar", () => {
  it("restablecer la escala sugerida se reintenta aunque el agente haya preparado entretanto", () => {
    // La eligió el vendedor: el agente ya no toca la edición ni la sugerida, solo el país (agente.ts).
    const antes = elegidaAMano("salud");
    const ahora = { ...antes, contenido: { ...antes.contenido, medicion: { pais: "Costa Rica" } } };
    expect(sePuedeReintentar([{ op: "restablecerEscala", sugerida: SUGERIDA }], antes, ahora)).toBe(true);
  });

  it("restablecer no se reintenta si la sugerida es otra o si alguien eligió otra edición entretanto", () => {
    const antes = elegidaAMano("salud");
    const op = { op: "restablecerEscala" as const, sugerida: SUGERIDA };
    const otraSugerida = { ...antes, contenido: { ...antes.contenido, edicionElegida: { por: "vendedor" as const, sugerida: { ...SUGERIDA, edicion: "salud" } } } };
    expect(sePuedeReintentar([op], antes, otraSugerida)).toBe(false);
    expect(sePuedeReintentar([op], antes, { ...antes, edicion: "ecommerce-retail" })).toBe(false);
  });

  it("elegir la edición no se reintenta si la edición o el perfil cambiaron: se recarga", () => {
    const antes = estado();
    const op = { op: "edicion" as const, edicion: "salud" };
    expect(sePuedeReintentar([op], antes, { ...antes, contenido: { ...antes.contenido, medicion: { pais: "Costa Rica" } } })).toBe(true);
    expect(sePuedeReintentar([op], antes, preparadoPorElAgente(antes))).toBe(false);
    expect(sePuedeReintentar([op], antes, { ...antes, perfilCierre: "mixta" })).toBe(false);
  });

  it("«usar» una sugerida no pisa lo que otra persona confirmó a mano en ese destino", () => {
    const antes = conSugeridas(estado());
    const usar = { op: "usar" as const, itemId: "casilla:contexto:1", valor: "Banco regional" };
    // Otra persona tocó otra cosa: se reintenta.
    expect(sePuedeReintentar([usar], antes, { ...antes, contenido: { ...antes.contenido, casillas: { presupuesto: "Unos 5 000 USD" } } })).toBe(true);
    // Otra persona escribió esa misma casilla: no.
    const aMano = { ...antes, contenido: { ...antes.contenido, casillas: { contexto: "Cooperativa de ahorro" } } };
    expect(sePuedeReintentar([usar], antes, aMano)).toBe(false);
    // Una sugerida de edición: si el agente eligió la industria entretanto, tampoco.
    expect(sePuedeReintentar([{ op: "usar", itemId: "edicion:1", valor: { slug: "banca" } }], antes, preparadoPorElAgente(antes))).toBe(false);
    // Una sugerida que no estaba en lo que se veía: no se sabe qué pisa.
    expect(sePuedeReintentar([{ op: "usar", itemId: "no-estaba" }], antes, antes)).toBe(false);
  });

  it("«usar todas» no se reintenta si UNA de las sugeridas cae en un destino que cambió", () => {
    const antes = conSugeridas(estado());
    const varias = { op: "usarVarias" as const, items: [{ itemId: "casilla:contexto:1" }, { itemId: "edicion:1" }] };
    expect(sePuedeReintentar([varias], antes, { ...antes, areas: ["1", "2"] })).toBe(true);
    expect(sePuedeReintentar([varias], antes, { ...antes, edicion: "salud" })).toBe(false);
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
