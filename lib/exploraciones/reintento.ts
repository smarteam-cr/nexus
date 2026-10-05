/**
 * ¿Se puede volver a mandar un cambio que chocó (409) sobre la versión nueva, sin preguntarle a nadie?
 *
 * La versión sube con todo cambio de lo confirmado, también los que hace el agente solo (al preparar
 * guarda la industria sugerida, el país, las áreas del test). Un cambio del vendedor que no toca nada
 * de eso chocaba igual y el lienzo mostraba «La preventa cambió mientras la editabas», aunque no
 * hubiera nada que pisar (Elías, 2026-10-05, al restablecer la escala sugerida).
 *
 * Regla: se reintenta solo si lo que la operación lee o reemplaza está igual en lo que vio el
 * vendedor (`antes`) y en lo último del servidor (`ahora`). Las operaciones que dicen la intención
 * entera (elegir una edición, volver a la sugerida, usar o descartar algo propuesto, archivar) se
 * aplican sobre lo último y siempre se pueden reintentar: el servidor las vuelve a validar.
 */
import type { EstadoDeExploracion, Operacion } from "./contenido";

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function operacionSegura(op: Operacion, antes: EstadoDeExploracion, ahora: EstadoDeExploracion): boolean {
  const ca = antes.contenido;
  const cb = ahora.contenido;
  switch (op.op) {
    case "casilla":
      return igual(ca.casillas[op.clave], cb.casillas[op.clave]);
    case "nivel":
      return igual(ca.chequeo[op.dimensionId], cb.chequeo[op.dimensionId]);
    case "falta":
      return igual(ca.falta[op.criterioId], cb.falta[op.criterioId]);
    case "aExplorar":
      return igual(ca.aExplorar[op.dimensionId], cb.aExplorar[op.dimensionId]);
    case "areas":
      // La lista entera se arma con lo que se veía: si cambió, se pisaría.
      return igual(antes.areas, ahora.areas) && igual(ca.razonesDeAreas, cb.razonesDeAreas);
    case "perfil":
      // Lleva las dos respuestas, y una salió de lo que se veía.
      return antes.perfilCierre === ahora.perfilCierre && antes.perfilDespues === ahora.perfilDespues;
    case "nota":
      return igual(ca.notas[op.paso], cb.notas[op.paso]);
    case "sesiones":
      return igual(ca.sesiones, cb.sesiones);
    case "medicion":
      return Object.keys(op.medicion).every((k) => igual(ca.medicion[k as keyof typeof ca.medicion], cb.medicion[k as keyof typeof cb.medicion]));
    case "casoDeUso":
      return igual(ca.casosDeUso[op.useCaseId], cb.casosDeUso[op.useCaseId]);
    case "responsable":
      return antes.responsableEmail === ahora.responsableEmail;
    case "edicion":
    case "restablecerEscala":
    case "sinPortal":
    case "usar":
    case "usarVarias":
    case "descartar":
    case "archivar":
      return true;
  }
}

export function sePuedeReintentar(ops: readonly Operacion[], antes: EstadoDeExploracion, ahora: EstadoDeExploracion): boolean {
  return ops.length > 0 && ops.every((op) => operacionSegura(op, antes, ahora));
}
