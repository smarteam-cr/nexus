"use client";

/**
 * useDirectorioDelEquipo — quiénes somos, para resolver un nombre.
 *
 * El chat puede agregar a alguien al equipo del kickoff **por su nombre**, pero el ítem que hay que
 * escribir lleva el id de esa persona en el directorio y su foto. Este hook trae la lista para que
 * `completadorDeEquipo` resuelva el nombre contra ella.
 *
 * ⚠ Vive en el NAVEGADOR y no en el servidor a propósito: la resolución tiene que pasar por el
 * mismo lugar donde después se escribe. Con el completador del lado del servidor, el dry-run
 * aceptaría un nombre que el editor rechaza al aplicar — o al revés.
 *
 * ⚠ Se pide UNA vez por montaje. Es la misma llamada que ya hace el selector de la sección; que
 * las dos existan es aceptable (son ~20 filas) y unificar el caché de `/api/team` es tanda propia.
 */
import { useEffect, useState } from "react";
import type { PersonaDelDirectorio } from "@/lib/kickoff/completadores";

export function useDirectorioDelEquipo(): PersonaDelDirectorio[] {
  const [gente, setGente] = useState<PersonaDelDirectorio[]>([]);

  useEffect(() => {
    let vivo = true;
    fetch("/api/team")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo) setGente(d?.members ?? []);
      })
      /* Sin directorio, el completador rechaza con «no hay nadie llamado X»: es un mensaje pobre
         pero honesto, y mejor que agregar una persona sin identidad. */
      .catch(() => {
        if (vivo) setGente([]);
      });
    return () => {
      vivo = false;
    };
  }, []);

  return gente;
}
