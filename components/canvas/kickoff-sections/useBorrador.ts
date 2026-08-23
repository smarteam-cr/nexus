"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { claveDeContenido, debeResembrar } from "@/lib/ui/borrador-sincronizado";

/**
 * Un borrador local que SE ENTERA cuando el documento cambia por afuera.
 *
 * La decisión vive en `lib/ui/borrador-sincronizado.ts`, con el porqué entero escrito ahí. Acá solo
 * queda el ajuste de estado durante el render — el idioma oficial de React para esto, y el mismo
 * que ya usan `PopInput` y `MdTextarea` en este repo.
 *
 * ⛔ Nunca con `useEffect`: dispara `set-state-in-effect` y pinta un frame con el valor viejo.
 *
 * Devuelve `[borrador, setBorrador]` con la MISMA firma que `useState` —incluida la forma
 * funcional—, así que los tres editores curados del kickoff cambian una línea y nada más.
 *
 * ⚠ La clave sembrada sigue a la PROP, no al borrador: el borrador puede alejarse todo lo que
 * quiera mientras alguien edita (eso es el punto), y solo vuelve a alinearse cuando el documento
 * cambia por afuera.
 */
export function useBorrador<T>(valorDeLaProp: T): [T, Dispatch<SetStateAction<T>>] {
  const clave = claveDeContenido(valorDeLaProp);
  const [borrador, setBorrador] = useState<T>(valorDeLaProp);
  const [claveSembrada, setClaveSembrada] = useState(clave);

  if (debeResembrar(claveSembrada, clave)) {
    setClaveSembrada(clave);
    setBorrador(valorDeLaProp);
  }

  return [borrador, setBorrador];
}
