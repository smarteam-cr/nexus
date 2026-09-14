/**
 * lib/documentacion/equipo.ts — el directorio del equipo que pinta el bloque vivo «equipo». PURO.
 *
 * Nexus ya sabe quién está en el equipo, en qué área y con qué rol: el directorio sale de ahí y no
 * se escribe a mano, así no se queda viejo cuando alguien entra o sale.
 *
 * ⚠ PRIVACIDAD: la base de conocimiento la lee todo el equipo. Del directorio se muestra el nombre,
 * el área, el rol, el correo y la foto — nada de permisos ni de costos. La consulta vive en
 * `vivos.ts` y la vigila `lib/manual/manual.test.ts`.
 */

/** Lo que llega de la base, ya acotado. */
export interface FilaDeEquipo {
  name: string;
  email: string | null;
  area: string | null;
  roleEnum: string | null;
  photoUrl: string | null;
}

export interface PersonaDelEquipo {
  nombre: string;
  correo: string | null;
  rol: string;
  foto: string | null;
}

export interface AreaDelEquipo {
  area: string;
  personas: PersonaDelEquipo[];
}

/** El área de Nexus dicha como el departamento que es. Un área que no está acá se muestra tal cual. */
export const NOMBRE_DE_AREA: Record<string, string> = {
  CSE: "Customer Success",
  // El área de un CSL a veces se carga con el rol en vez de con el departamento.
  CSL: "Customer Success",
  Ventas: "Ventas",
  Admin: "Finanzas y Administración",
  Development: "Desarrollo",
  Marketing: "Marketing",
  RevOps: "Revenue Operations",
  PM: "Gestión de proyectos",
};

/** El rol de Nexus dicho para una persona. `SUPER_ADMIN` es la dirección de la empresa. */
export const NOMBRE_DE_ROL: Record<string, string> = {
  CSE: "Customer Success Executive",
  CSL: "Customer Success Lead",
  VENTAS: "Ventas",
  DEV: "Desarrollo",
  MARKETING: "Marketing",
  ADMIN: "Asistente administrativo",
  SUPER_ADMIN: "Dirección",
};

/** El orden de las áreas: el mismo que la sección «Departamentos». */
const ORDEN_DE_AREAS = [
  "Customer Success",
  "Ventas",
  "Finanzas y Administración",
  "Desarrollo",
  "Marketing",
  "Revenue Operations",
  "Gestión de proyectos",
];

/**
 * Una cuenta de PRUEBA no es una persona del equipo. Existe al menos una en producción
 * («Test CSE (vista Heiver)», para mirar Nexus con los ojos de un CSE) y en el directorio de la
 * empresa se leería como una persona más.
 */
export function esCuentaDePrueba(nombre: string): boolean {
  return /\btest\b/i.test(nombre);
}

/** Las personas activas, agrupadas por área y ordenadas. */
export function armarEquipo(filas: readonly FilaDeEquipo[]): AreaDelEquipo[] {
  const porArea = new Map<string, PersonaDelEquipo[]>();
  for (const f of filas) {
    const nombre = f.name.trim();
    if (!nombre || esCuentaDePrueba(nombre)) continue;
    const area = f.area ? (NOMBRE_DE_AREA[f.area] ?? f.area) : "Sin área";
    const persona: PersonaDelEquipo = {
      nombre,
      correo: f.email,
      rol: f.roleEnum ? (NOMBRE_DE_ROL[f.roleEnum] ?? f.roleEnum) : "",
      foto: f.photoUrl,
    };
    porArea.set(area, [...(porArea.get(area) ?? []), persona]);
  }

  const posicion = (area: string) => {
    const i = ORDEN_DE_AREAS.indexOf(area);
    return i === -1 ? ORDEN_DE_AREAS.length : i;
  };
  return [...porArea.entries()]
    .sort(([x], [y]) => posicion(x) - posicion(y) || x.localeCompare(y, "es"))
    .map(([area, personas]) => ({
      area,
      personas: personas.sort((x, y) => x.nombre.localeCompare(y.nombre, "es")),
    }));
}

/** Las iniciales, para quien no tiene foto. */
export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
