/**
 * lib/auth/salarios-por-persona.ts — abrir comisiones de vendedor y aguinaldo a UNA persona (2026-10-06).
 *
 * Pedido de Elías: Dinia (quien registra en Finanzas) tiene que ver y editar las comisiones de vendedor y ver el
 * aguinaldo. El aguinaldo de cada persona sale de lo que ganó en el año, así que verlo es ver su salario: Elías lo
 * decidió así («que Dinia también vea salarios»), lo que cambia la regla del rediseño («Dinia no ve salarios»).
 *
 * ── POR PERSONA, NUNCA POR ROL ──────────────────────────────────────────────────────
 * Las celdas `comisionesVendedor.*` y `aguinaldo.read` se dan SOLO con el override de cada persona en /team
 * (`TeamMember.permissionOverrides`). La plantilla del rol NO las abre: un clic en «Administrador» le daría salarios a
 * todo administrador presente y futuro. Por eso la matriz de roles ni las muestra (`soloPorPersona` en el registry).
 * Y por eso este chequeo no consulta la base: lee el override que ya viene con el usuario, y las pruebas de privacidad
 * (costos-privacy.test.ts, P2) siguen exigiendo cero consultas para quien no lo tiene.
 *
 * 2026-10-07: también la PLANILLA (calendario, historial y salarios), con el mismo mecanismo: Elías, «Dinia no tiene
 * ingreso a Planillas … que ella le corresponde». La caja neta, el resumen de Costos y las tarjetas siguen solo para
 * Super Admin.
 */
import { isCostosRole } from "./cobranza-roles";
import { parsePermissionMapLoose } from "./permissions/schema";

export type PermisoDeSalario =
  | { section: "planilla"; action: "read" | "write" }
  | { section: "comisionesVendedor"; action: "read" | "write" }
  | { section: "aguinaldo"; action: "read" };

/**
 * ¿Puede? Super Admin siempre; el resto, solo con la celda encendida en SU override. Quien puede editar, puede ver.
 */
export function puedePorPersona(
  role: string | null | undefined,
  tm: { permissionOverrides?: unknown } | null | undefined,
  p: PermisoDeSalario,
): boolean {
  if (isCostosRole(role)) return true;
  const celdas = parsePermissionMapLoose(tm?.permissionOverrides ?? null)?.sections[p.section];
  if (!celdas) return false;
  return celdas[p.action] === true || (p.action === "read" && celdas.write === true);
}
