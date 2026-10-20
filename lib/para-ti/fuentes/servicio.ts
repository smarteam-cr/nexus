/**
 * lib/para-ti/fuentes/servicio.ts — lo de las cuentas de Customer Success en «Para ti» (ficha D, 2026-10-17; los tres
 * bloques, 2026-10-19). SERVER-ONLY.
 *
 * Una sola medición por persona da las tres cosas que van arriba del inicio de Customer Success (lib/para-ti/foco.ts),
 * porque las tres salen de los mismos datos (las cuentas, sus tareas y el calendario):
 *   · las reuniones con sus cuentas de hoy y los próximos días hábiles, con «Preparar»;
 *   · las cuentas sin siguiente paso (ni tarea con fecha esta semana ni reunión en 8 días; la regla es
 *     lib/mi-dia/servicio.ts › siguientePasoDeLaCuenta), con «Agendar»;
 *   · las tareas vencidas de sus cuentas.
 *
 *   · `CUENTAS_SIN_ACCION` (personal): a quien LLEVA la cuenta (el encargado en HubSpot de un proyecto de Customer Success
 *     abierto; una cuenta que solo le compartieron no es suya para esto). No a la CSL que lidera la cartera: a ella le
 *     llega todo por la de abajo, agrupado por CSE.
 *   · `CARTERA_DEL_DIA` (frente «Liderar Customer Success»): lo mismo de toda la cartera, con el CSE que la lleva como
 *     grupo (`Pendiente.grupo`).
 *
 * «Agendar» lleva hora: la primera hora libre en horario laboral del calendario de quien la lleva, una por cuenta y sin
 * pisarse entre ellas. Así abre Google Calendar con la hora también desde la lista entera y desde el correo de la mañana.
 * Sin el calendario, abre sin hora.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { servicioDeLasCuentas, tareasVencidasDeLasCuentas, type ServicioDeLaCuenta } from "@/lib/mi-dia/servicio-server";
import { cuentasBase } from "@/lib/mi-dia/inicio-server";
import { pendienteDeCuentaSinPaso, pendienteDeReunion, pendienteDeTareasVencidas, reunionesDeLosProximosDias, SIN_CSE } from "@/lib/mi-dia/servicio";
import { calendarioDeLosProximosDias } from "@/lib/mi-dia/calendario-server";
import { primerHuecoLaboral, type EventoParaLaGrilla } from "@/lib/mi-dia/inicio";
import type { Alcance } from "../alcance-server";
import type { ContextoDeMedicion, Fuente } from "../fuente";
import type { Pendiente } from "../tipos";

export interface CuentaDeCs {
  clientId: string;
  empresa: string;
  /** Quién la lleva (su calendario dice si hay reunión). */
  llevaEmail: string | null;
  /** El CSE que la lleva, solo para quien lidera. undefined = no se agrupa. */
  grupo?: string | null;
}

/** ¿A esta persona le llega la cartera entera (y no solo lo suyo)? La CSL con el frente «Liderar Customer Success». */
export function veLaCarteraEntera(a: Pick<Alcance, "rol" | "frentes">): boolean {
  return a.rol === "CSL" && a.frentes.includes("LIDERAR_CS");
}

/** Las tres cosas de esas cuentas, como pendientes. */
async function loDeLasCuentas(cuentas: readonly CuentaDeCs[], a: Alcance, c: ContextoDeMedicion): Promise<Pendiente[]> {
  const quienMira = { email: a.email, esSuperAdmin: a.rol === "SUPER_ADMIN" };
  const [servicio, vencidas] = await Promise.all([
    servicioDeLasCuentas(cuentas, { ahora: c.ahora, hoyISO: c.hoyISO, quienMira }),
    tareasVencidasDeLasCuentas(
      cuentas.map((x) => x.clientId),
      { hoyISO: c.hoyISO, quienMira },
    ),
  ]);
  const deCuenta = new Map(cuentas.map((x) => [x.clientId, x]));
  const out: Pendiente[] = [];

  // Las horas para «Agendar»: del calendario de quien mira, solo para las cuentas que lleva (a quien lidera no se le
  // propone una hora en el calendario de otro).
  const sinPaso = [...servicio.values()].filter((s) => !s.paso);
  const propias = sinPaso.filter((s) => deCuenta.get(s.clientId)?.llevaEmail === a.email.toLowerCase());
  const cal = propias.length ? await calendarioDeLosProximosDias(a.email, c.ahora) : null;
  const ocupado: EventoParaLaGrilla[] = cal ? [...cal.ocupado] : [];

  for (const s of [...servicio.values()].sort((x, y) => x.empresa.localeCompare(y.empresa, "es"))) {
    const cuenta = deCuenta.get(s.clientId);
    if (!cuenta) continue;
    const grupo = cuenta.grupo;
    for (const r of reunionesDeLosProximosDias(s.proximas, c.hoyISO, c.ahora)) out.push(pendienteDeReunion(cuenta, r, c.hoyISO, grupo));
    out.push(...sinSiguientePaso(cuenta, s, a, c, cal && cuenta.llevaEmail === a.email.toLowerCase() ? ocupado : null));
  }
  for (const cuenta of cuentas) {
    const p = pendienteDeTareasVencidas(cuenta, vencidas.get(cuenta.clientId) ?? [], c.hoyISO, cuenta.grupo);
    if (p) out.push(p);
  }
  return out;
}

function sinSiguientePaso(cuenta: CuentaDeCs, s: ServicioDeLaCuenta, a: Alcance, c: ContextoDeMedicion, ocupado: EventoParaLaGrilla[] | null): Pendiente[] {
  if (s.paso) return [];
  let hueco: { inicio: string; fin: string } | null = null;
  if (ocupado) {
    hueco = primerHuecoLaboral(ocupado, c.ahora);
    ocupado.push({ id: `agendar:${s.clientId}`, inicio: hueco.inicio, fin: hueco.fin });
  }
  const p = pendienteDeCuentaSinPaso(cuenta, s, {
    ultimaReunion: s.ultimaReunion,
    invitados: s.invitados,
    hoyISO: c.hoyISO,
    correo: a.email,
    hueco,
    calendarioLeido: s.calendarioLeido,
    grupo: cuenta.grupo,
  });
  return p ? [p] : [];
}

export const CUENTAS_SIN_ACCION: Fuente = {
  // Literal y no la constante: el escaneo del registro cuenta las claves escritas (es la misma: FUENTE_CUENTA_SIN_ACCION).
  clave: "cuenta-sin-accion",
  frente: null,
  alDia: "Tus cuentas: sin reuniones en los próximos días, todas con siguiente paso y sin tareas vencidas",
  aplica: (a) => a.proyectos.some((p) => p.encargado) && !veLaCarteraEntera(a),
  async medir(a, c) {
    const cuentas = new Map<string, string>();
    for (const p of a.proyectos) if (p.encargado) cuentas.set(p.clientId, p.empresa);
    return loDeLasCuentas(
      [...cuentas].map(([clientId, empresa]) => ({ clientId, empresa, llevaEmail: a.email.toLowerCase() })),
      a,
      c,
    );
  },
};

/**
 * Las cuentas de la cartera con el CSE que la lleva como grupo (lo que ve quien lidera). Una persona que ya no está en el
 * equipo no es un grupo: sus cuentas van a «Sin CSE», que es lo que hay que repartir.
 */
export async function cuentasDeLaCarteraConSuCse(a: Alcance): Promise<CuentaDeCs[]> {
  const base = await cuentasBase("csl", a);
  if (base.length === 0) return [];
  const correos = [...new Set(base.flatMap((x) => (x.llevaEmail ? [x.llevaEmail.toLowerCase()] : [])))];
  const personas = correos.length
    ? await prisma.teamMember.findMany({ where: { email: { in: correos, mode: "insensitive" } }, select: { email: true, name: true, deactivatedAt: true } })
    : [];
  const nombre = new Map(personas.filter((p) => !p.deactivatedAt).map((p) => [p.email.toLowerCase(), p.name]));
  return base.map((x) => {
    const lleva = x.llevaEmail?.toLowerCase() ?? null;
    return { clientId: x.clientId, empresa: x.empresa, llevaEmail: lleva, grupo: (lleva && nombre.get(lleva)) || SIN_CSE };
  });
}

export const CARTERA_DEL_DIA: Fuente = {
  clave: "cs-cartera-del-dia",
  frente: "LIDERAR_CS",
  alDia: "La cartera: sin reuniones en los próximos días, todas con siguiente paso y sin tareas vencidas",
  aplica: veLaCarteraEntera,
  async medir(a, c) {
    const cuentas = await cuentasDeLaCarteraConSuCse(a);
    return cuentas.length ? loDeLasCuentas(cuentas, a, c) : [];
  },
};
