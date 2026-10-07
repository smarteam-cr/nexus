import { notFound } from "next/navigation";

/**
 * app/(shell)/[...ruta]/page.tsx — toda dirección interna que no existe (2026-10-06).
 *
 * Sin esta ruta, Next pinta su 404 de la raíz: en inglés, sin menú y sin nada que hacer. Atrapándola
 * acá, la dirección cae en app/(shell)/not-found.tsx, que se pinta dentro del shell.
 *
 * Es la ruta menos específica del grupo: cualquier página que exista le gana. `/external/…` tiene la
 * suya (app/external/[...ruta]) para que un cliente nunca termine en el shell interno.
 */
export default function DireccionQueNoExiste(): never {
  notFound();
}
