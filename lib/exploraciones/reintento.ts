/**
 * ¿Se puede volver a mandar un cambio que chocó (409) sobre la versión nueva, sin preguntarle a nadie?
 *
 * La versión sube con todo cambio de lo confirmado, también los que hace el agente solo (al preparar
 * guarda la industria sugerida, el país, las áreas del test). Un cambio del vendedor que no toca nada
 * de eso chocaba igual y el lienzo mostraba «La preventa cambió mientras la editabas», aunque no
 * hubiera nada que pisar (Elías, 2026-10-05, al restablecer la escala sugerida).
 *
 * Regla: se reintenta solo si lo que la operación lee o reemplaza está igual en lo que vio el
 * vendedor (`antes`) y en lo último del servidor (`ahora`). También «usar» lo propuesto: escribe el
 * valor de la sugerida sobre su destino, así que si otra persona confirmó ese destino a mano, un
 * «Usar» desde una pantalla vieja lo pisaría (auditoría 2026-10-05). Elegir la edición y volver a la
 * sugerida reemplazan la edición y el perfil: si cambiaron, tampoco. Solo descartar, archivar y «sin
 * portal» dicen la intención entera sin pisar nada confirmado: esas siempre se reintentan.
 */
import type { DestinoDePropuesta, EstadoDeExploracion, Operacion } from "./contenido";

/** JSON con las claves ordenadas: el mismo valor guardado en otro orden (jsonb) cuenta como igual. */
function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

const igual = (a: unknown, b: unknown) => canonico(a) === canonico(b);

const mismoPerfil = (antes: EstadoDeExploracion, ahora: EstadoDeExploracion) =>
  antes.perfilCierre === ahora.perfilCierre && antes.perfilDespues === ahora.perfilDespues;

/** ¿El destino de una sugerida está igual en lo que se veía y en lo último? Es lo que «usar» reemplaza. */
function destinoIgual(d: DestinoDePropuesta, antes: EstadoDeExploracion, ahora: EstadoDeExploracion): boolean {
  const ca = antes.contenido;
  const cb = ahora.contenido;
  switch (d.tipo) {
    case "casilla":
      return igual(ca.casillas[d.clave], cb.casillas[d.clave]);
    case "nivel":
      return igual(ca.chequeo[d.dimensionId], cb.chequeo[d.dimensionId]);
    case "falta":
      return igual(ca.falta[d.criterioId], cb.falta[d.criterioId]);
    case "aExplorar":
      return igual(ca.aExplorar[d.dimensionId], cb.aExplorar[d.dimensionId]);
    case "area":
      // Suma el área (si no estaba) y escribe su razón.
      return antes.areas.includes(d.areaId) === ahora.areas.includes(d.areaId) && igual(ca.razonesDeAreas[d.areaId], cb.razonesDeAreas[d.areaId]);
    case "edicion":
      // Con la edición va su perfil habitual (contenido.ts, destino «edicion»).
      return antes.edicion === ahora.edicion && mismoPerfil(antes, ahora);
    case "perfil":
      return mismoPerfil(antes, ahora);
    case "casoDeUso":
      return igual(ca.casosDeUso[d.useCaseId], cb.casosDeUso[d.useCaseId]);
  }
}

/** «Usar» se reintenta si la sugerida estaba en lo que se veía y su destino no cambió. */
function usoSeguro(itemId: string, antes: EstadoDeExploracion, ahora: EstadoDeExploracion): boolean {
  const item = antes.propuesta.items.find((x) => x.id === itemId);
  return !!item && destinoIgual(item.destino, antes, ahora);
}

function operacionSegura(op: Operacion, antes: EstadoDeExploracion, ahora: EstadoDeExploracion): boolean {
  const ca = antes.contenido;
  const cb = ahora.contenido;
  switch (op.op) {
    case "casilla":
      return destinoIgual({ tipo: "casilla", clave: op.clave }, antes, ahora);
    case "nivel":
      return destinoIgual({ tipo: "nivel", dimensionId: op.dimensionId }, antes, ahora);
    case "falta":
      return destinoIgual({ tipo: "falta", criterioId: op.criterioId }, antes, ahora);
    case "aExplorar":
      return destinoIgual({ tipo: "aExplorar", dimensionId: op.dimensionId }, antes, ahora);
    case "areas":
      // La lista entera se arma con lo que se veía: si cambió, se pisaría.
      return igual(antes.areas, ahora.areas) && igual(ca.razonesDeAreas, cb.razonesDeAreas);
    case "perfil":
      // Lleva las dos respuestas, y una salió de lo que se veía.
      return mismoPerfil(antes, ahora);
    case "nota":
      return igual(ca.notas[op.paso], cb.notas[op.paso]);
    case "sesiones":
      return igual(ca.sesiones, cb.sesiones);
    case "medicion":
      return Object.keys(op.medicion).every((k) => igual(ca.medicion[k as keyof typeof ca.medicion], cb.medicion[k as keyof typeof cb.medicion]));
    case "casoDeUso":
      return destinoIgual({ tipo: "casoDeUso", useCaseId: op.useCaseId }, antes, ahora);
    case "responsable":
      return antes.responsableEmail === ahora.responsableEmail;
    case "edicion":
      return destinoIgual({ tipo: "edicion" }, antes, ahora);
    case "restablecerEscala":
      /* Vuelve a la sugerida que se veía y reemplaza la edición y el perfil: si la sugerida es otra, o
         alguien eligió otra edición o perfil entretanto, se recarga en vez de pisarlo. */
      return igual(op.sugerida, cb.edicionElegida?.sugerida) && destinoIgual({ tipo: "edicion" }, antes, ahora);
    case "usar":
      return usoSeguro(op.itemId, antes, ahora);
    case "usarVarias":
      return op.items.every((x) => usoSeguro(x.itemId, antes, ahora));
    case "sinPortal":
    case "descartar":
    case "archivar":
      return true;
  }
}

export function sePuedeReintentar(ops: readonly Operacion[], antes: EstadoDeExploracion, ahora: EstadoDeExploracion): boolean {
  return ops.length > 0 && ops.every((op) => operacionSegura(op, antes, ahora));
}
