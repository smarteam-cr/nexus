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

/**
 * Devuelve Sets de emails internos (en minúscula) por frente. Un miembro puede caer
 * en ambos si su área/rol matchea los dos (raro, pero se respeta).
 */
export function classifyTeamEmailsByArea(teamMembers: TeamMemberLite[]): {
  salesEmails: Set<string>;
  cseEmails: Set<string>;
} {
  const salesEmails = new Set<string>();
  const cseEmails = new Set<string>();
  for (const m of teamMembers) {
    const email = m.email.toLowerCase();
    if (isSalesMember(m)) salesEmails.add(email);
    if (isCseMember(m)) cseEmails.add(email);
  }
  return { salesEmails, cseEmails };
}
