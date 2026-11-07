/**
 * lib/casos-de-uso/actividades-server.ts — los datos de las actividades de cada caso, leídos y validados una vez.
 * Solo servidor: el JSON pesa unos 750 kB y no tiene que llegar al navegador. Lo puro está en `actividades.ts`.
 */
import "server-only";
import datos from "./actividades-de-los-casos.json";
import {
  etiquetaDeHoras,
  leerActividades,
  type ActividadDeLaBiblioteca,
  type ActividadesDelCaso,
  type DatosDeActividades,
  type PreguntaDeLaBiblioteca,
} from "./actividades";

let leidos: DatosDeActividades | null = null;

function todo(): DatosDeActividades {
  leidos ??= leerActividades(datos);
  return leidos;
}

export function actividadesDelCaso(id: string): ActividadesDelCaso | null {
  return todo().casos.find((c) => c.id === id) ?? null;
}

export function bibliotecaDeActividades(): readonly ActividadDeLaBiblioteca[] {
  return todo().biblioteca;
}

/**
 * Las horas por defecto de cada caso, ya escritas («13,5 h + Dev por defecto»), para la lista del catálogo. Van como
 * texto para que la tarjeta, que es de cliente, no importe Zod ni los datos.
 */
export function horasDeCadaCaso(): Record<string, string> {
  return Object.fromEntries(todo().casos.map((c) => [c.id, etiquetaDeHoras(c)]));
}

/** En cuántos casos aparece cada actividad de la biblioteca (por su nombre). */
export function casosConCadaActividad(): Record<string, number> {
  const n: Record<string, number> = {};
  for (const c of todo().casos) for (const nombre of new Set(c.actividades.map((f) => f.actividad))) n[nombre] = (n[nombre] ?? 0) + 1;
  return n;
}

/** Las preguntas que quedan sobre la biblioteca. */
export function preguntasDeLaBiblioteca(): readonly PreguntaDeLaBiblioteca[] {
  return todo().preguntasDeLaBiblioteca;
}

export function versionDeLasActividades(): string {
  return todo().version;
}
