/**
 * lib/cs/sin-cse.ts — las cuentas con proyectos activos sin CSE, y a quién propone Nexus (etapa 4a del roadmap de
 * «Para ti», 2026-10-15). Puro.
 *
 * Medido el 2026-10-15: 11 proyectos activos de clientes no tenían CSE encargado y 9 estaban a nombre de gente que ya
 * no está. «Para ti» del CSE sale de su cartera, así que una cuenta sin CSE no le aparece a nadie. Nexus propone, la CSL
 * confirma (el pase de cuenta, que escribe en HubSpot) y nada se asigna solo.
 *
 * A quién propone, en orden:
 *   1. al CSE que ya lleva otros proyectos activos de esa cuenta (el encargado es de la cuenta, no del proyecto);
 *   2. si no hay, al CSE (rol CSE) que estuvo en más reuniones con el cliente en los últimos 90 días;
 *   3. si no, a nadie: lo elige la CSL.
 */
import { cseDeLaCuenta, type CuentaDeCartera } from "./cartera-reglas";

/** Cuántos días de reuniones se miran para proponer. */
export const DIAS_DE_REUNIONES_PARA_PROPONER = 90;

export interface PropuestaDeCse {
  email: string;
  nombre: string;
  /** Por qué, en una línea. */
  motivo: string;
}

export interface CuentaSinCse {
  clientId: string;
  nombre: string;
  /** Los proyectos activos sin CSE. */
  proyectos: string[];
  /** A nombre de quién estaban, si era alguien que ya no está. */
  deBaja: string[];
  propuesta: PropuestaDeCse | null;
}

/** Alguien del equipo activo, sin las cuentas de prueba. `esCse` = tiene el rol CSE (solo ellos se proponen por reuniones). */
export interface CseDelEquipo {
  email: string;
  nombre: string;
  esCse: boolean;
}

/**
 * Las cuentas con algún proyecto activo sin CSE y la propuesta para cada una. `reunionesPorCuenta`: por cuenta, los
 * participantes (en minúsculas) de cada reunión con el cliente de los últimos 90 días.
 */
export function cuentasSinCse(
  cuentas: readonly Pick<CuentaDeCartera, "clientId" | "nombre" | "proyectos">[],
  equipo: readonly CseDelEquipo[],
  reunionesPorCuenta: ReadonlyMap<string, readonly (readonly string[])[]>,
): CuentaSinCse[] {
  const porEmail = new Map(equipo.map((c) => [c.email.toLowerCase(), c]));
  const out: CuentaSinCse[] = [];
  for (const c of cuentas) {
    const sin = c.proyectos.filter((p) => p.activo && !p.cseNombre);
    if (!sin.length) continue;
    out.push({
      clientId: c.clientId,
      nombre: c.nombre,
      proyectos: sin.map((p) => p.nombre),
      deBaja: [...new Set(sin.map((p) => p.cseDeBaja).filter((x): x is string => !!x))],
      propuesta: proponerCse(c, porEmail, reunionesPorCuenta.get(c.clientId) ?? []),
    });
  }
  return out.sort((a, b) => b.proyectos.length - a.proyectos.length || a.nombre.localeCompare(b.nombre));
}

function proponerCse(
  c: Pick<CuentaDeCartera, "proyectos">,
  porEmail: ReadonlyMap<string, CseDelEquipo>,
  reuniones: readonly (readonly string[])[],
): PropuestaDeCse | null {
  const deLaCuenta = cseDeLaCuenta(c);
  if (deLaCuenta?.email) {
    const cse = porEmail.get(deLaCuenta.email.toLowerCase());
    if (cse) return { email: cse.email, nombre: cse.nombre, motivo: "Ya lleva otros proyectos de esta cuenta." };
  }
  const veces = new Map<string, number>();
  for (const participantes of reuniones) {
    for (const p of new Set(participantes.map((x) => x.toLowerCase()))) {
      if (porEmail.get(p)?.esCse) veces.set(p, (veces.get(p) ?? 0) + 1);
    }
  }
  const [mejor] = [...veces.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!mejor) return null;
  const cse = porEmail.get(mejor[0])!;
  const n = mejor[1];
  return { email: cse.email, nombre: cse.nombre, motivo: `Estuvo en ${n} ${n === 1 ? "reunión" : "reuniones"} con el cliente en los últimos ${DIAS_DE_REUNIONES_PARA_PROPONER} días.` };
}
