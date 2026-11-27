/**
 * lib/clients/crear-empresa.ts — EL PLAN PARA PONER LA EMPRESA ARRIBA DE SUS UNIDADES (2026-11-26). PURO.
 *
 * Lo usa scripts/crear-empresa-de-unidades.ts (simulacro y `--apply`). Crea la ficha de tipo EMPRESA con lo que comparten
 * las unidades (el dominio compartido y la empresa de HubSpot compartida), se lo quita a la vieja principal y cuelga a
 * todas las unidades de ella, iguales. Lo que es de una sola unidad se queda en ella. DECISIONS «La empresa arriba de sus
 * unidades».
 */
import { effectiveDomainsForClient } from "@/lib/sessions/categorize";

/** Una empresa a crear (las tres reales están en scripts/lib/empresas-arriba.ts). */
export interface EmpresaArriba {
  clave: string;
  /** El nombre de la ficha de la empresa («TEC», «Cemaco», «Grupo Teamnet»). */
  nombre: string;
  /** Las fichas que quedan debajo, todas iguales (ids). */
  unidades: readonly string[];
  /** La ficha de la que sale lo compartido (la vieja principal), si hay algo que mover. */
  desde?: string;
  /** Los dominios que comparten las unidades: pasan de `desde` a la empresa. */
  dominiosCompartidos?: readonly string[];
  /** La empresa de HubSpot que comparten: pasa de `desde` a la empresa. */
  empresaDeHubspot?: string;
  /** Empresas de HubSpot PROPIAS de una unidad que se ligan al crear (unidad → empresa de HubSpot). */
  propiasDeHubspot?: Readonly<Record<string, string>>;
  /** Si el `--apply` espera un OK explícito (Cemaco: lo usa el cliente, Elías da el OK). */
  esperaOk?: string;
  /** Si el `--apply` solo corre cuando el simulacro no cambia ninguna reunión (Grupo Teamnet, Elías 26 nov). */
  soloSinMoverReuniones?: boolean;
}

/** Lo que el plan lee de cada ficha. */
export interface FichaParaLaEmpresa {
  id: string;
  name: string;
  kind: string;
  company: string | null;
  emailDomains: string[];
  hubspotCompanyId: string | null;
  comparteDominioConId: string | null;
}

/** Lo que se escribe. `crear`: la ficha de la empresa; `cambios`: por ficha, los campos nuevos. */
export interface PlanDeLaEmpresa {
  crear: { name: string; kind: "EMPRESA"; company: string | null; emailDomains: string[]; hubspotCompanyId: string | null; source: "manual" };
  cambios: { id: string; antes: Partial<FichaParaLaEmpresa>; data: Partial<FichaParaLaEmpresa> }[];
  /** La empresa ya existe (se corrió antes): no hay nada que escribir. */
  yaEsta: { id: string } | null;
}

export type ResultadoDelPlan = { ok: true; plan: PlanDeLaEmpresa } | { ok: false; errores: string[] };

/** El id con que la empresa aparece en el simulacro, antes de existir. */
export const ID_DE_LA_EMPRESA_NUEVA = "empresa-nueva";

const norm = (d: string) => d.trim().toLowerCase();

export function planDeLaEmpresa(cfg: EmpresaArriba, fichas: readonly FichaParaLaEmpresa[]): ResultadoDelPlan {
  const porId = new Map(fichas.map((f) => [f.id, f]));
  const errores: string[] = [];
  const unidades = cfg.unidades.map((id) => porId.get(id));
  cfg.unidades.forEach((id, i) => {
    if (!unidades[i]) errores.push(`La unidad ${id} no existe.`);
  });
  if (cfg.unidades.length < 2) errores.push("Una empresa arriba tiene al menos dos unidades: con una, sigue siendo una ficha.");
  if (errores.length) return { ok: false, errores };

  /* ¿Ya se corrió? Todas cuelgan de la misma ficha de tipo Empresa, con ese nombre. */
  const cabezas = new Set(unidades.map((u) => u!.comparteDominioConId));
  const [cabeza] = cabezas;
  const yaEmpresa = cabezas.size === 1 && cabeza ? porId.get(cabeza) : undefined;
  if (yaEmpresa?.kind === "EMPRESA") {
    return { ok: true, plan: { crear: { name: yaEmpresa.name, kind: "EMPRESA", company: yaEmpresa.company, emailDomains: yaEmpresa.emailDomains, hubspotCompanyId: yaEmpresa.hubspotCompanyId, source: "manual" }, cambios: [], yaEsta: { id: yaEmpresa.id } } };
  }

  for (const u of unidades) {
    if (u!.kind === "EMPRESA") errores.push(`${u!.name} ya es una empresa: no puede ser unidad.`);
    if (u!.comparteDominioConId && !cfg.unidades.includes(u!.comparteDominioConId)) errores.push(`${u!.name} ya cuelga de otra ficha que no es de esta empresa.`);
  }
  if (fichas.some((f) => f.kind === "EMPRESA" && f.name.trim().toLowerCase() === cfg.nombre.trim().toLowerCase())) {
    errores.push(`Ya hay una empresa que se llama «${cfg.nombre}».`);
  }

  const desde = cfg.desde ? porId.get(cfg.desde) : undefined;
  if (cfg.desde && !desde) errores.push(`La ficha ${cfg.desde} no existe.`);
  if (desde && !cfg.unidades.includes(desde.id)) errores.push(`${desde.name} tiene que ser una de las unidades.`);
  const dominios = [...new Set((cfg.dominiosCompartidos ?? []).map(norm))];
  if (dominios.length && !desde) errores.push("Los dominios compartidos salen de una ficha: falta `desde`.");
  const deDesde = desde ? new Set(effectiveDomainsForClient(desde).map(norm)) : new Set<string>();
  for (const d of dominios) if (!deDesde.has(d)) errores.push(`${d} no es un dominio de ${desde?.name ?? "la ficha de origen"}.`);
  if (cfg.empresaDeHubspot && desde?.hubspotCompanyId !== cfg.empresaDeHubspot) {
    errores.push(`La empresa de HubSpot ${cfg.empresaDeHubspot} no es la de ${desde?.name ?? "la ficha de origen"} (tiene ${desde?.hubspotCompanyId ?? "ninguna"}).`);
  }
  for (const [unidad, hs] of Object.entries(cfg.propiasDeHubspot ?? {})) {
    if (!cfg.unidades.includes(unidad)) errores.push(`${unidad} no es una de las unidades.`);
    const otra = fichas.find((f) => f.hubspotCompanyId === hs && f.id !== unidad);
    if (otra) errores.push(`La empresa de HubSpot ${hs} ya es de «${otra.name}» (una empresa es de una sola ficha, R7b).`);
  }
  if (errores.length) return { ok: false, errores };

  const cambios: PlanDeLaEmpresa["cambios"] = [];
  for (const u of unidades as FichaParaLaEmpresa[]) {
    const data: Partial<FichaParaLaEmpresa> = { comparteDominioConId: ID_DE_LA_EMPRESA_NUEVA };
    const antes: Partial<FichaParaLaEmpresa> = { comparteDominioConId: u.comparteDominioConId };
    if (desde && u.id === desde.id) {
      if (dominios.length) {
        data.emailDomains = u.emailDomains.filter((d) => !dominios.includes(norm(d)));
        antes.emailDomains = u.emailDomains;
        /* El `company` que parece un dominio también cuenta como dominio (effectiveDomainsForClient): se va con ellos. */
        if (u.company && dominios.includes(norm(u.company))) {
          data.company = null;
          antes.company = u.company;
        }
      }
      if (cfg.empresaDeHubspot) {
        data.hubspotCompanyId = null;
        antes.hubspotCompanyId = u.hubspotCompanyId;
      }
    }
    const propia = cfg.propiasDeHubspot?.[u.id];
    if (propia) {
      data.hubspotCompanyId = propia;
      antes.hubspotCompanyId = u.hubspotCompanyId;
    }
    cambios.push({ id: u.id, antes, data });
  }
  const companyDesde = desde?.company && dominios.includes(norm(desde.company)) ? desde.company : null;
  return {
    ok: true,
    plan: {
      crear: { name: cfg.nombre, kind: "EMPRESA", company: companyDesde, emailDomains: dominios, hubspotCompanyId: cfg.empresaDeHubspot ?? null, source: "manual" },
      cambios,
      yaEsta: null,
    },
  };
}

/**
 * El plan aplicado en memoria a las fichas del contexto del resolver (el simulacro): la empresa nueva al final (es la más
 * nueva en el orden de atribuir) y las unidades con sus campos nuevos. Devuelve las mismas filas, con esos cambios.
 */
export function fichasConLaEmpresa<T extends { id: string; emailDomains: string[] }>(plan: PlanDeLaEmpresa, clients: readonly T[]): T[] {
  if (plan.yaEsta) return [...clients];
  const porId = new Map(plan.cambios.map((c) => [c.id, c.data]));
  const cambiadas = clients.map((c) => (porId.has(c.id) ? ({ ...c, ...porId.get(c.id) } as T) : c));
  const empresa = { id: ID_DE_LA_EMPRESA_NUEVA, siglas: [], ...plan.crear } as unknown as T;
  return [...cambiadas, empresa];
}
