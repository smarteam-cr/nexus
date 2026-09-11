import "server-only";

/**
 * lib/external/accesos-del-navegador.ts — qué proyectos tiene abiertos ESTE navegador.
 *
 * Lee las dos cookies (la lista nueva y, mientras viva, la vieja de una sola credencial) y las
 * resuelve con los mismos checks de siempre (lib/external/access.ts). Es el único lugar de
 * /external que lee esas cookies: las páginas, su título, la acción del kickoff y la página que
 * elige proyecto pasan por acá. Elegir cuál nombra la dirección es puro y vive en
 * selector-de-proyectos.ts (`elegirAcceso`), que es lo que se prueba.
 *
 * `cache()`: la página y su `generateMetadata` lo piden en el MISMO request; una sola consulta.
 * Fuera de un render de React corre la función normal (mismo criterio que requireUser, C-07).
 *
 * Server-only: `next/headers` + Prisma.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { resolverAccesosDelNavegador, type AccesoDelNavegador } from "./access";
import { COOKIE_DE_ACCESOS, COOKIE_HEREDADA, credencialesDelNavegador, leerListaDeAccesos } from "./lista-de-accesos";

/** Los proyectos que este navegador tiene abiertos, ya chequeados. Sin credenciales, no toca la base. */
export const accesosDelNavegador = cache(async (): Promise<AccesoDelNavegador[]> => {
  const store = await cookies();
  const credenciales = credencialesDelNavegador(
    leerListaDeAccesos(store.get(COOKIE_DE_ACCESOS)?.value, Date.now()),
    store.get(COOKIE_HEREDADA)?.value,
  );
  return credenciales.length > 0 ? resolverAccesosDelNavegador(credenciales) : [];
});
