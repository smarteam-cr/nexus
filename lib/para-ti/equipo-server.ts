/**
 * lib/para-ti/equipo-server.ts — «Del equipo»: cuánto tiene cada persona, contado igual que su «Lo mío». SERVER-ONLY.
 *
 * La transparencia se queda, pero «Del equipo» no da permisos nuevos:
 * · Quien puede abrir toda la cartera ve qué es lo que más espera de cada uno, con el nombre de la cuenta.
 * · Quien no (un CSE) ve solo cuántas cosas tiene cada persona: nombrar una cuenta que no puede abrir sería mostrarle
 *   lo que su acceso no le muestra.
 * · Dirección (o un Super Admin) lo ve por ÁREA; el resto, las personas de su área.
 * · Lo que no tiene dueño (proyectos sin encargado) sale en su propia fila, para que alguien lo tome.
 *
 * Mide a cada persona con `medirConCache`: la misma medición que alimenta su número del menú, y como mucho cuatro a la
 * vez para no ocupar el pool de conexiones.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { alcanceDe, SELECT_MIEMBRO_PARA_ALCANCE, type Alcance, type MiembroParaAlcance } from "./alcance-server";
import { haceCuanto, loQueMasEspera, plural } from "./armar";
import { SIN_ENCARGADO } from "./fuentes/cs";
import { medirConCache } from "./medir-server";
import type { DelEquipo, FilaDelEquipo, ParaTi } from "./tipos";

export type { DelEquipo, FilaDelEquipo };

export type AreaDelEquipo = "Customer Success" | "Ventas" | "Finanzas" | "Marketing" | "Desarrollo" | "Dirección";

export function areaDe(m: { roleEnum: string }, frentes: readonly string[]): AreaDelEquipo {
  switch (m.roleEnum) {
    case "CSE":
    case "CSL":
      return "Customer Success";
    case "VENTAS":
      return "Ventas";
    case "ADMIN":
      return "Finanzas";
    case "MARKETING":
      return "Marketing";
    case "DEV":
      return "Desarrollo";
    default:
      return frentes.includes("FINANZAS_SUPERVISAR") ? "Finanzas" : "Dirección";
  }
}

async function enTandas<T, R>(items: readonly T[], n: number, f: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) out.push(...(await Promise.all(items.slice(i, i + n).map(f))));
  return out;
}

function cuenta(p: ParaTi) {
  return { hoy: p.agente.length + p.hoy.length, semana: p.semana.length + p.luego.length };
}

export async function medirEquipo(viewer: Alcance, ahora = new Date()): Promise<DelEquipo> {
  const porArea = viewer.rol === "SUPER_ADMIN" || viewer.frentes.includes("DIRECCION");
  const soloNumeros = !viewer.veTodaLaCartera;
  const miembros: MiembroParaAlcance[] = await prisma.teamMember.findMany({
    where: { deactivatedAt: null, appUser: { isNot: null } },
    select: SELECT_MIEMBRO_PARA_ALCANCE,
    orderBy: { name: "asc" },
  });
  const alcances = await enTandas(miembros, 4, (m) => alcanceDe(m));
  const miArea = areaDe({ roleEnum: viewer.rol }, viewer.frentes);
  const elegidos = porArea ? alcances : alcances.filter((a) => areaDe({ roleEnum: a.rol }, a.frentes) === miArea);
  const medidos = await enTandas(elegidos, 4, async (a) => ({ a, p: await medirConCache(a, ahora) }));

  const esperaDe = (p: ParaTi): string | null => {
    const e = loQueMasEspera(p);
    if (!e) return null;
    const hace = haceCuanto(e.desde, ahora);
    return hace && hace !== "hoy" ? `${e.titulo} · ${hace}` : e.titulo;
  };

  let filas: FilaDelEquipo[];
  if (porArea) {
    const grupos = new Map<AreaDelEquipo, typeof medidos>();
    for (const x of medidos) {
      const area = areaDe({ roleEnum: x.a.rol }, x.a.frentes);
      grupos.set(area, [...(grupos.get(area) ?? []), x]);
    }
    filas = [...grupos].map(([area, xs]) => {
      const total = xs.reduce((s, x) => ({ hoy: s.hoy + cuenta(x.p).hoy, semana: s.semana + cuenta(x.p).semana }), { hoy: 0, semana: 0 });
      // Lo más viejo del área: el pendiente con la fecha más antigua de todas sus personas.
      const todos = xs.flatMap((x) => [...x.p.agente, ...x.p.hoy].map((it) => ({ it, quien: x.a.nombre })));
      todos.sort((u, v) => (Date.parse(u.it.desde ?? "") || Infinity) - (Date.parse(v.it.desde ?? "") || Infinity));
      const primero = todos[0];
      const hace = primero ? haceCuanto(primero.it.desde, ahora) : null;
      return {
        clave: `area:${area}`,
        quien: area,
        sub: plural(xs.length, "persona", "personas"),
        ...total,
        espera: soloNumeros ? null : primero ? `${primero.it.titulo} (${primero.quien})${hace && hace !== "hoy" ? ` · ${hace}` : ""}` : null,
      };
    });
  } else {
    filas = medidos.map(({ a, p }) => ({
      clave: `persona:${a.email}`,
      quien: a.nombre,
      sub: a.proyectos.length ? plural(a.proyectos.length, "proyecto", "proyectos") : areaDe({ roleEnum: a.rol }, a.frentes),
      ...cuenta(p),
      espera: soloNumeros && a.email !== viewer.email ? null : esperaDe(p),
      esTu: a.email === viewer.email,
    }));
  }

  if (viewer.veTodaLaCartera) {
    const sin = await SIN_ENCARGADO.medir(viewer, { ahora, hoyISO: "" }).catch(() => []);
    if (sin.length) {
      filas.push({
        clave: "sin-dueno",
        quien: "Sin encargado",
        sub: "Nadie lo tiene en HubSpot",
        hoy: 0,
        semana: sin.length,
        espera: sin[0].titulo,
        sinDueno: true,
        href: sin[0].href,
      });
    }
  }
  return { porArea, soloNumeros, filas };
}

/** Cuántas cosas suma «Del equipo» (para la píldora del segmentado). */
export function totalDelEquipo(d: DelEquipo): number {
  return d.filas.reduce((s, f) => s + f.hoy + f.semana, 0);
}
