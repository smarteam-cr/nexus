/**
 * lib/exploraciones/mapa.test.ts — lo que dibuja el mapa de la escala del lienzo, y lo que le llega al
 * agente de los casos de uso. Correr: `npx vitest run lib/exploraciones/mapa.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import type { ClaveDeCapa, Letra } from "@/lib/escala/documento/tipos";
import { exploracionParaLosCasos } from "./casos-de-uso";
import { contenidoVacio, idDelItem, NIVELES, propuestaVacia, type EstadoDeExploracion, type EstimadoGuardado, type ItemPropuesto } from "./contenido";
import type { DimensionDelLienzo, EscalaDelLienzo } from "./escala-del-lienzo";
import { chequeoDelMapa, cuentaDelArea, loQueLaFrena, posicionesDelMapa } from "./mapa";

function dim(id: string, capa: ClaveDeCapa): DimensionDelLienzo {
  return {
    id,
    nombre: `Dimensión ${id}`,
    nombreGeneral: null,
    capa,
    pregunta: `¿Cómo va ${id}?`,
    descripcion: null,
    costoDeQuedarse: "Cuesta",
    aplica: true,
    niveles: NIVELES.map((l: Letra) => ({ letra: l, descripcion: `Nivel ${l}`, resultado: null })),
    funcional: [{ id: `${id}.F1`, texto: `Lo que pide ${id}`, verificacion: "declarado", habito: false }],
    riesgos: [],
  };
}

const DIMS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => dim(`1.${n}`, n <= 4 ? "base" : "produccion"));
const ESCALA: EscalaDelLienzo = {
  version: "8.6.0",
  niveles: NIVELES.map((l) => ({ letra: l, nombre: `N${l}` })),
  capas: [
    { clave: "base", nombre: "Base operativa" },
    { clave: "produccion", nombre: "Producción" },
  ],
  ediciones: [],
  edicion: null,
  perfil: { cierre: null, despues: null },
  areas: [
    {
      id: "1",
      nombre: "Ventas",
      nombreGeneral: null,
      dimensiones: DIMS,
      paraChequeo: { id: "1", nombre: "Ventas", dimensiones: DIMS.map((d) => ({ id: d.id, nombre: d.nombre, capa: d.capa, aplica: true })), orden: { base: null, produccion: null } },
    },
  ],
};

function estado(parcial: Partial<EstadoDeExploracion> = {}): EstadoDeExploracion {
  return {
    contenido: contenidoVacio(),
    propuesta: propuestaVacia(),
    areas: ["1"],
    edicion: null,
    perfilCierre: "con equipo",
    perfilDespues: "continua",
    responsableEmail: null,
    archivada: false,
    ...parcial,
  };
}

const nivel = (dimensionId: string, valor: EstimadoGuardado, razon?: string): ItemPropuesto => {
  const destino = { tipo: "nivel" as const, dimensionId };
  return { id: idDelItem(destino, valor), destino, valor, razon, fuentes: [{ id: "S1", etiqueta: "Reunión", cita: "nadie sabe en qué etapa va" }], corridaId: "r", en: "2026-10-01T00:00:00.000Z" };
};

describe("lo que dibuja el mapa", () => {
  it("lo confirmado primero; si no hay, lo que propone el agente, con su clase y su porqué", () => {
    const e = estado({ contenido: { ...contenidoVacio(), chequeo: { "1.1": { nivel: "F", fuente: "reunion", evidencia: "Lo tenemos escrito", porQue: "Tiene su proceso escrito." } } } });
    const pendientes = [nivel("1.2", { nivel: "I", fuente: "hipotesis", porQue: "Las notas dicen Excel." }), nivel("1.3", { nivel: "D", fuente: "reunion", evidencia: "nadie sabe" }, "Lo dijo.")];
    const p = posicionesDelMapa(e, pendientes);
    expect(p["1.1"]).toMatchObject({ nivel: "F", clase: "evidencia", origen: "confirmado", porQue: "Tiene su proceso escrito.", porRevisar: false });
    expect(p["1.1"].citas).toEqual([{ id: "reunion", etiqueta: "Reunión", cita: "Lo tenemos escrito" }]);
    expect(p["1.2"]).toMatchObject({ nivel: "I", clase: "hipotesis", origen: "propuesto", porQue: "Las notas dicen Excel.", porRevisar: false });
    // Lo que el agente sacó de una reunión y nadie usó todavía: se dibuja y se avisa.
    expect(p["1.3"]).toMatchObject({ nivel: "D", clase: "evidencia", origen: "propuesto", porQue: "Lo dijo.", porRevisar: true });
    expect(p["1.4"]).toBeUndefined();
  });

  it("con lo confirmado del cliente, una hipótesis vieja pendiente no dice nada; algo nuevo de una reunión, sí", () => {
    const e = estado({ contenido: { ...contenidoVacio(), chequeo: { "1.1": { nivel: "F", fuente: "vendedor" } } } });
    expect(posicionesDelMapa(e, [nivel("1.1", { nivel: "I", fuente: "hipotesis" })])["1.1"]).toMatchObject({ nivel: "F", pendiente: null, porRevisar: false });
    expect(posicionesDelMapa(e, [nivel("1.1", { nivel: "I", fuente: "reunion", evidencia: "x" })])["1.1"]).toMatchObject({ nivel: "F", porRevisar: true });
  });

  it("el área sale como en el chequeo, con lo que la deja ahí y la cuenta de evidencia e hipótesis", () => {
    const letras: Letra[] = ["F", "I", "F", "F", "E", "E", "F", "F"];
    const pendientes = letras.map((l, i) => nivel(`1.${i + 1}`, { nivel: l, fuente: i < 3 ? "reunion" : "hipotesis", ...(i < 3 ? { evidencia: "x" } : {}) }));
    const posiciones = posicionesDelMapa(estado(), pendientes);
    const area = chequeoDelMapa(ESCALA, ["1"], posiciones).areas[0];
    expect(area.nivel).toBe("I");
    expect(loQueLaFrena(area)).toEqual({ capa: "base", nivel: "I", dimensiones: ["1.2"] });
    expect(cuentaDelArea(area, posiciones)).toEqual({ conEvidencia: 3, hipotesis: 5, sinDato: 0 });
  });
});

describe("lo que lee el agente de los casos de uso", () => {
  it("dónde parece estar cada dimensión y lo que el cliente puede ver; nunca lo interno", () => {
    const e = estado({
      contenido: {
        ...contenidoVacio(),
        falta: { "1.2.F1": { estado: "no_tiene" } },
        casillas: {
          metas: [{ que: "Cerrar más", actual: "2 de 10", objetivo: "4 de 10" }],
          hipotesis: ["Creemos que HIPOTESIS_INTERNA"],
          presupuesto: "PRESUPUESTO_INTERNO",
          autoridad: [{ nombre: "Ana", rol: "firma", nota: "NOTA_INTERNA" }],
          noExplorado: ["NO_EXPLORADO_INTERNO"],
        },
      },
    });
    const texto = exploracionParaLosCasos(e, ESCALA, [nivel("1.2", { nivel: "I", fuente: "hipotesis", porQue: "Usan Excel." })]);
    expect(texto).toContain("- Dimensión 1.2: NI (hipótesis) — Usan Excel.");
    expect(texto).toContain("- Dimensión 1.1: sin dato");
    expect(texto).toContain("- Dimensión 1.2 (Ventas): Lo que pide 1.2");
    expect(texto).toContain("- Cerrar más de 2 de 10 a 4 de 10");
    for (const interno of ["HIPOTESIS_INTERNA", "PRESUPUESTO_INTERNO", "NOTA_INTERNA", "NO_EXPLORADO_INTERNO", "Ana"]) expect(texto).not.toContain(interno);
  });
});
