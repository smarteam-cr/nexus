/**
 * lib/cuestionario/persona.ts — los datos de una persona del cliente al agregarla (2026-10-11, puro).
 *
 * El cargo lo establece el equipo de Smarteam, no la persona del cliente (decisión de Elías). Al
 * agregarla con correo, Nexus busca el contacto en HubSpot: lo que escribió el CSE manda; lo que
 * falta lo completa HubSpot. Si HubSpot no trae el cargo, se agrega sin cargo y la pantalla lo dice:
 * el CSE lo escribe en la fila de la persona («Agregar cargo»).
 */

/** Lo que trajo HubSpot del contacto. */
export interface ContactoDeHubspot {
  nombre: string | null;
  cargo: string | null;
}

/**
 * Cómo le fue a la búsqueda en HubSpot (misma forma que `BusquedaPorCorreo` de lib/hubspot, sin
 * importarla: este archivo es puro). «no-existe» es solo HubSpot contestando que no lo tiene.
 */
export interface BusquedaEnHubspot {
  estado: "encontrado" | "no-existe" | "no-se-pudo" | "correo-invalido";
  contacto: ContactoDeHubspot | null;
}

export interface DatosDeLaPersona {
  nombre: string;
  cargo: string | null;
  email: string | null;
  /** Una línea para la pantalla cuando HubSpot no completó lo que faltaba; null si no hace falta decir nada. */
  aviso: string | null;
}

export function textoLimpio(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** ¿Hace falta preguntarle a HubSpot? Solo con correo y si falta el nombre o el cargo. */
export function hayQueBuscarEnHubspot(datos: { nombre?: unknown; cargo?: unknown; email?: unknown }): boolean {
  const email = textoLimpio(datos.email, 200);
  if (!email) return false;
  return !textoLimpio(datos.nombre, 120) || !textoLimpio(datos.cargo, 120);
}

/**
 * Arma la persona: el nombre y el cargo escritos ganan sobre los de HubSpot. Sin nombre escrito ni
 * en HubSpot devuelve null (la persona necesita un nombre; `errorSinNombre` dice qué contestar).
 * `busqueda` es null cuando no se le preguntó nada a HubSpot.
 */
export function armarPersona(
  datos: { nombre?: unknown; cargo?: unknown; email?: unknown },
  busqueda: BusquedaEnHubspot | null,
): DatosDeLaPersona | null {
  const contacto = busqueda?.estado === "encontrado" ? busqueda.contacto : null;
  const email = textoLimpio(datos.email, 200) || null;
  const nombre = textoLimpio(datos.nombre, 120) || textoLimpio(contacto?.nombre, 120);
  if (!nombre) return null;
  const cargoEscrito = textoLimpio(datos.cargo, 120);
  const cargo = cargoEscrito || textoLimpio(contacto?.cargo, 120) || null;
  const aviso = cargo || !email || !busqueda ? null : avisoSinCargo(busqueda, nombre);
  return { nombre, cargo, email, aviso };
}

function avisoSinCargo(busqueda: BusquedaEnHubspot, nombre: string): string {
  switch (busqueda.estado) {
    case "encontrado":
      return `HubSpot no tiene el cargo de ${nombre}: agrégalo en su fila.`;
    case "no-existe":
      return `No encontramos a ${nombre} en HubSpot con ese correo: agrega su cargo en su fila.`;
    case "correo-invalido":
      return `Ese correo no parece válido, así que no lo buscamos en HubSpot: revísalo y agrega el cargo de ${nombre} en su fila.`;
    case "no-se-pudo":
      return `No se pudo consultar HubSpot: agrega el cargo de ${nombre} en su fila.`;
  }
}

/** Qué contestar cuando no hay nombre escrito y HubSpot no lo completó. */
export function errorSinNombre(busqueda: BusquedaEnHubspot | null): string {
  switch (busqueda?.estado) {
    case "encontrado":
      return "HubSpot no tiene el nombre de ese contacto: escribe el nombre de la persona.";
    case "no-existe":
      return "No encontramos ese correo en HubSpot: escribe el nombre de la persona.";
    case "correo-invalido":
      return "Ese correo no parece válido: revísalo o escribe el nombre de la persona.";
    default:
      return "No se pudo consultar HubSpot: escribe el nombre de la persona.";
  }
}
