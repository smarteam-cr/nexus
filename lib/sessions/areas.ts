/**
 * lib/sessions/areas.ts
 *
 * Clasificación de participantes de sesiones por ÁREA funcional (eje de ANÁLISIS,
 * NO permisos): Ventas vs CSE. Fuente ÚNICA reusada por el GPS del proyecto
 * (app/api/projects/[projectId]/gps) y meeting-dates para que no diverjan.
 *
 * El match cruza FirefliesSession.participants (emails) contra los emails internos
 * del equipo. Externos/cliente (sin TeamMember) quedan fuera de ambos Sets, así la
 * clasificación se basa solo en los participantes INTERNOS presentes.
 */

export interface TeamMemberLite {
  email: string;
  /** Área funcional (eje de análisis): "Ventas"/"CSE"/… — puede venir null. */
  area?: string | null;
  /** Rol de permiso (TeamRole) — fallback para el match. */
  roleEnum?: string | null;
}

// Clasificación por ÁREA (eje de análisis), no por permiso: así Marco Salas
// (roleEnum=SUPER_ADMIN, area=Ventas) sigue contando como Ventas. El seed viejo
// usaba "Sales" en vez de "Ventas" — se contemplan ambos.
export function isSalesMember(m: TeamMemberLite): boolean {
  return m.area === "Ventas" || m.area === "Sales" || m.roleEnum === "VENTAS";
}

export function isCseMember(m: TeamMemberLite): boolean {
  return m.area === "CSE" || m.roleEnum === "CSE";
}

// Desarrollo/dev: el área es un set abierto (String?), así que contemplamos las
// variantes usuales (case-insensitive). Ajustar si el valor real en TeamMember difiere.
export function isDevMember(m: TeamMemberLite): boolean {
  const a = (m.area ?? "").trim().toLowerCase();
  return (
    a === "development" || a === "dev" || a === "desarrollo" || a === "developer" ||
    m.roleEnum === "DEV"
  );
}

/**
 * Devuelve Sets de emails internos (en minúscula) por frente. Un miembro puede caer
 * en varios si su área/rol matchea (raro, pero se respeta).
 * - `deliveryEmails`: entrega de servicio = CSE ∪ Desarrollo.
 * - `devEmails`: SOLO Desarrollo — ver abajo.
 * - `internalEmails`: TODOS los miembros del equipo (para detectar "cliente" =
 *   participante que NO es interno).
 *
 * ── POR QUÉ `devEmails` EXISTE APARTE DE `deliveryEmails` ────────────────────
 * `deliveryEmails` es la unión a propósito: una integración que lleva solo un dev ES una
 * sesión de entrega, y sin esa unión el widget de un proyecto de Customer Success mostraba
 * "Sin agendar" con la reunión ya agendada.
 *
 * Pero un proyecto del pipeline Development tiene su PROPIO frente rotulado "Desarrollo", y
 * ahí la unión miente: en un cliente con dos proyectos, las sesiones del CSE del hermano
 * ganan por fecha y el frente "Desarrollo" termina mostrando reuniones donde no hubo ningún
 * dev. Pasó en Wherex. Cada frente mira a su equipo; cuál le toca a cada uno lo declara
 * `lib/projects/kind.ts`.
 */
export function classifyTeamEmailsByArea(teamMembers: TeamMemberLite[]): {
  salesEmails: Set<string>;
  cseEmails: Set<string>;
  devEmails: Set<string>;
  deliveryEmails: Set<string>;
  internalEmails: Set<string>;
} {
  const salesEmails = new Set<string>();
  const cseEmails = new Set<string>();
  const devEmails = new Set<string>();
  const deliveryEmails = new Set<string>();
  const internalEmails = new Set<string>();
  for (const m of teamMembers) {
    const email = m.email.toLowerCase();
    internalEmails.add(email);
    if (isSalesMember(m)) salesEmails.add(email);
    if (isCseMember(m)) cseEmails.add(email);
    if (isDevMember(m)) devEmails.add(email);
    if (isCseMember(m) || isDevMember(m)) deliveryEmails.add(email);
  }
  return { salesEmails, cseEmails, devEmails, deliveryEmails, internalEmails };
}
