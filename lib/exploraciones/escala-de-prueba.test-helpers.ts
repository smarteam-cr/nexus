/**
 * lib/exploraciones/escala-de-prueba.test-helpers.ts — una escala chica y un estado de exploración para las pruebas de
 * la ficha B (la foto, qué explorar, el siguiente paso). Solo lo importan pruebas.
 */
import type { ClaveDeCapa, Letra } from "@/lib/escala/documento/tipos";
import { contenidoVacio, idDelItem, NIVELES, propuestaVacia, type EstadoDeExploracion, type EstimadoGuardado, type ItemPropuesto } from "./contenido";
import type { DimensionDelLienzo, EscalaDelLienzo } from "./escala-del-lienzo";

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

export const ESCALA_DE_PRUEBA: EscalaDelLienzo = {
  version: "8.8.0",
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

export function estadoDePrueba(chequeo: EstadoDeExploracion["contenido"]["chequeo"] = {}, parcial: Partial<EstadoDeExploracion> = {}): EstadoDeExploracion {
  return {
    contenido: { ...contenidoVacio(), chequeo },
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

export function propuestoDePrueba(dimensionId: string, valor: EstimadoGuardado): ItemPropuesto {
  const destino = { tipo: "nivel" as const, dimensionId };
  return { id: idDelItem(destino, valor), destino, valor, fuentes: [{ id: "S1", etiqueta: "Reunión", cita: "lo dijo en la reunión" }], corridaId: "r", en: "2026-10-01T00:00:00.000Z" };
}

/** Las ocho dimensiones en el mismo nivel, con evidencia de una reunión. */
export function todasEn(nivel: Letra, fuente: EstimadoGuardado["fuente"] = "reunion"): EstadoDeExploracion["contenido"]["chequeo"] {
  return Object.fromEntries(DIMS.map((d) => [d.id, { nivel, fuente, evidencia: `Cita de ${d.id}` }]));
}
