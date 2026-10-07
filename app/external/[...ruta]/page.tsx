import { notFound } from "next/navigation";

/**
 * app/external/[...ruta]/page.tsx — todo enlace externo que no existe (2026-10-06).
 *
 * Sin esta ruta, `/external/lo-que-sea` caería en el atrapa-todo del shell interno
 * (app/(shell)/[...ruta]), que pide sesión: el cliente terminaría en el login de Nexus. Acá cae en
 * app/external/not-found.tsx, con el estilo y el marco del cliente.
 */
export default function EnlaceExternoQueNoExiste(): never {
  notFound();
}
