/**
 * lib/kickoff/completadores.ts — LO QUE EL CHAT NO PUEDE ESCRIBIR, LO TERMINA LA APP.
 *
 * PURO. Sin Prisma, sin fetch, sin React.
 *
 * ── POR QUÉ HACE FALTA ────────────────────────────────────────────────────────────────────────
 * Elías pidió (2026-08-22) agregar y quitar personas del equipo del kickoff **por el nombre**, y
 * crear franjas y sesiones. Las tres cosas chocan con lo mismo: el ítem que hay que escribir lleva
 * un identificador que el modelo no puede saber.
 *
 *  · Un miembro del equipo lleva `teamMemberId` —un cuid del directorio— y su foto. El modelo
 *    conoce «María López», no `cmk3f9...`.
 *  · Una franja y una sesión llevan un `id` generado. ⚠ Y no es cosmético: `normalizeHorarios`
 *    FILTRA los ítems sin id, así que un agregado sin id se evapora al pintar mientras el chat
 *    dice «aplicado» — el modo de falla más caro de este carril.
 *
 * La salida barata habría sido declararle esos campos al esquema del chat. Es peor: el modelo los
 * INVENTA, y un `teamMemberId` inventado apunta a una persona que no existe. Así que el esquema
 * declara solo lo que el modelo sí sabe (el nombre, la etiqueta) y la app termina el ítem acá.
 *
 * ⛔ Un nombre que no resuelve NO se adivina: se rechaza con la lista de quiénes hay. Elegir «el
 * más parecido» produce un kickoff con la persona equivocada, que es exactamente la clase de error
 * plausible y silencioso que este vocabulario existe para no cometer.
 */

/** Lo mínimo del directorio que hace falta para resolver un nombre. */
export interface PersonaDelDirectorio {
  id: string;
  name: string;
  area?: string | null;
  roleEnum?: string | null;
  photoUrl?: string | null;
}

/** Termina un ítem de una lista, o explica por qué no se puede. */
export type CompletadorDeItem = (
  lista: string,
  item: Record<string, unknown>,
  dataActual: unknown,
) => { ok: Record<string, unknown> } | { error: string };

/** Sin tildes y en minúsculas, para que «María» y «maria» sean la misma persona. */
function plano(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * El equipo: resuelve el nombre contra el directorio y copia la identidad y la foto.
 *
 * ⚠ Guarda una FOTO del miembro (nombre, rol, imagen), no una referencia viva — es lo que ya hace
 * el selector de la sección. El kickoff dice quién estuvo en ese proyecto; que alguien cambie de
 * área después no reescribe un documento ya entregado.
 */
export function completadorDeEquipo(
  directorio: readonly PersonaDelDirectorio[],
  rotuloDeRol: (p: PersonaDelDirectorio) => string = (p) =>
    p.area || p.roleEnum || "Equipo Smarteam",
): CompletadorDeItem {
  return (lista, item, dataActual) => {
    if (lista !== "members") return { ok: item };
    const pedido = typeof item.name === "string" ? item.name.trim() : "";
    if (!pedido) return { error: "hace falta el nombre de la persona" };

    const buscado = plano(pedido);
    const exactos = directorio.filter((p) => plano(p.name) === buscado);
    /* Primero el nombre completo, y solo si no hay ninguno se prueba por parte del nombre: al
       revés, «Ana» encontraría a «Ana Pérez» y a «Ana Gómez» y habría que desempatar algo que ya
       estaba resuelto. */
    const candidatos = exactos.length
      ? exactos
      : directorio.filter((p) => plano(p.name).includes(buscado));

    if (candidatos.length === 0) {
      return {
        error: `no hay nadie llamado «${pedido}» en el equipo. Están: ${directorio
          .map((p) => p.name)
          .join(", ")}`,
      };
    }
    if (candidatos.length > 1) {
      return {
        error: `«${pedido}» puede ser ${candidatos.map((p) => p.name).join(" o ")}: dime cuál`,
      };
    }

    const persona = candidatos[0];
    const yaEstan = (dataActual as { members?: { teamMemberId?: string }[] } | null)?.members ?? [];
    if (yaEstan.some((m) => m?.teamMemberId === persona.id)) {
      return { error: `${persona.name} ya está en el equipo de este kickoff` };
    }

    return {
      ok: {
        teamMemberId: persona.id,
        name: persona.name,
        /* El rol de cara al cliente: el que dijo el chat, o el del directorio. */
        role: typeof item.role === "string" && item.role.trim() ? item.role.trim() : rotuloDeRol(persona),
        photoUrl: persona.photoUrl ?? null,
      },
    };
  };
}

/**
 * Horarios: le pone el id que el motor exige.
 *
 * ⛔ Una sesión nace SIN franja (`optionId: null`) y el chat no puede asignarla: la asignación no
 * vive en este bloque sino en `Project.kickoffHorarioAssignments`, superpuesta al pintar. Escribir
 * `optionId` acá sería escribir donde nadie lee — el hilo diría «aplicado» y la sesión seguiría
 * suelta. Se asigna arrastrando, y el chat lo dice.
 */
export function completadorDeHorarios(nuevoId: () => string): CompletadorDeItem {
  return (lista, item) => {
    if (lista !== "options" && lista !== "sessions") return { ok: item };
    const label = typeof item.label === "string" ? item.label.trim() : "";
    if (!label) {
      return {
        error:
          lista === "options"
            ? "una franja necesita su horario, por ejemplo «Martes 11:00»"
            : "una sesión necesita su nombre",
      };
    }
    return {
      ok:
        lista === "options"
          ? { id: nuevoId(), label }
          : { id: nuevoId(), label, optionId: null },
    };
  };
}
