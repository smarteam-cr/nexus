/**
 * D-08 (2026-09-04) · Porcentaje de reuniones con transcripción, POR CSE y POR CLIENTE.
 *
 * El dato ya existía en /sessions (el aviso de cobertura: «N% de las reuniones de los últimos
 * 3 meses no dejó transcripción», partido en con-el-cliente / puertas-adentro) pero nadie podía
 * responder «¿de QUIÉN son las que no se graban?». Este módulo agrupa POR PERSONA DE CUSTOMER
 * SUCCESS sobre las mismas filas que la página ya carga: cero consultas nuevas. Una reunión con
 * dos CSE en la sala cuenta para los dos — cada uno es responsable de pedir que se grabe.
 *
 * Reglas, las mismas que el aviso global (lib/sessions/cargar-sesiones-categorizadas.ts):
 *  - Solo lo que YA OCURRIÓ: una reunión agendada no dejó transcripción todavía, y meterla al
 *    denominador haría que el número empeore solo por agendar (lección de nexus-reuniones-futuras).
 *  - Ventana de 90 días: la cobertura es una conducta de hoy, no un promedio histórico.
 *  - «Con transcripción» lo decide quien llama (`tieneTranscript`), con el criterio ÚNICO del repo:
 *    no nula y no vacía — `""` no es un transcript (lección de C-10).
 *
 * ⛔ Client-safe: lo importan `SessionsClient.tsx` y `ProjectGPS.tsx` ("use client"), así que solo
 * puede importar módulos igual de puros. `lib/sessions/areas.ts` lo es (cero imports); prisma o
 * zod no (lib/auth/client-safe.test.ts).
 */
import { isCseMember } from "./areas";

export interface SesionParaCobertura {
  id: string;
  date: Date | string;
  participants: string[];
}

export interface MiembroParaCobertura {
  name: string;
  email: string;
  /** Área funcional — el eje de ANÁLISIS. Es lo que dice quién hace Customer Success. */
  area?: string | null;
  /** Rol de permisos (`TeamRole`). Solo como respaldo del área, vía `isCseMember`. */
  roleEnum?: string | null;
}

export interface FilaDeCoberturaPorCse {
  nombre: string;
  email: string;
  /** Reuniones pasadas de la ventana en las que estuvo. */
  total: number;
  /** De ésas, las que no dejaron transcripción. */
  sinTranscript: number;
}

export const VENTANA_DE_COBERTURA_DIAS = 90;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Agrupa las reuniones pasadas de la ventana por persona de Customer Success presente.
 * Devuelve solo a quienes estuvieron en al menos una, ordenados por peor cobertura primero
 * (mayor proporción sin transcripción; a igual proporción, más reuniones primero).
 */
export function coberturaPorCse(
  sesiones: ReadonlyArray<SesionParaCobertura>,
  equipo: ReadonlyArray<MiembroParaCobertura>,
  tieneTranscript: (sessionId: string) => boolean,
  ahora: Date,
  ventanaDias: number = VENTANA_DE_COBERTURA_DIAS,
): FilaDeCoberturaPorCse[] {
  /* Quién hace Customer Success lo decide el ÁREA, no la celda de permisos, y lo decide el dueño
     único del repo (`isCseMember`). Con el rol solo, un CSE real con `roleEnum: SUPER_ADMIN`
     —el caso que el propio schema documenta con nombre y apellido— desaparecía del desglose sin
     que nada avisara: la línea salía corta y parecía que esa persona graba todo.

     ⚠ `isCseMember` es `area === "CSE" || roleEnum === "CSE"`, así que alguien cuya área se
     escriba distinto («CSL», «Customer Success») queda afuera. Verificado contra el roster real
     (scripts/assign-team-roles.ts): el único CSL del equipo tiene `area: "CSE"`, así que hoy no se
     pierde nadie. Si mañana falta alguien en el desglose, el arreglo es su ÁREA en /team —no un
     criterio nuevo acá, que es exactamente la divergencia de la que se acaba de salir. */
  const cse = new Map<string, MiembroParaCobertura>();
  for (const m of equipo) {
    if (isCseMember(m)) cse.set(m.email.toLowerCase(), m);
  }
  if (cse.size === 0) return [];

  const desde = ahora.getTime() - ventanaDias * MS_POR_DIA;
  const acumulado = new Map<string, FilaDeCoberturaPorCse>();
  for (const s of sesiones) {
    const t = typeof s.date === "string" ? new Date(s.date).getTime() : s.date.getTime();
    // ⚠ `>= ahora` excluye lo agendado: una reunión que no ocurrió no puede «no haberse grabado».
    if (!Number.isFinite(t) || t >= ahora.getTime() || t < desde) continue;
    const sinTranscript = !tieneTranscript(s.id);
    const vistos = new Set<string>();
    for (const email of s.participants) {
      const clave = email.toLowerCase();
      const m = cse.get(clave);
      if (!m || vistos.has(clave)) continue;
      vistos.add(clave);
      const fila = acumulado.get(clave) ?? { nombre: m.name, email: m.email, total: 0, sinTranscript: 0 };
      fila.total += 1;
      if (sinTranscript) fila.sinTranscript += 1;
      acumulado.set(clave, fila);
    }
  }

  return [...acumulado.values()].sort((a, b) => {
    const pa = a.sinTranscript / a.total;
    const pb = b.sinTranscript / b.total;
    if (pb !== pa) return pb - pa;
    if (b.total !== a.total) return b.total - a.total;
    return a.nombre.localeCompare(b.nombre);
  });
}

/**
 * La misma pregunta, para UN cliente: lo que la ficha del cliente muestra. Lo calcula el GPS del
 * proyecto con dos COUNT sobre el índice (nunca trae filas); acá solo vive la forma y el %.
 */
export interface CoberturaDelCliente {
  /** Reuniones del cliente que ya ocurrieron dentro de la ventana. */
  pasadas: number;
  /** De ésas, las que dejaron transcripción (no nula y no vacía). */
  conTranscript: number;
  ventanaDias: number;
}

/** Porcentaje CON transcripción, redondeado. Sin reuniones pasadas devuelve null: no hay qué medir. */
export function pctConTranscript(c: CoberturaDelCliente): number | null {
  if (c.pasadas <= 0) return null;
  return Math.round((c.conTranscript / c.pasadas) * 100);
}
