/**
 * lib/sessions/separar-en-unidades.ts — SEPARAR UNA EMPRESA EN UNIDADES: qué va a cada una y por qué. PURO.
 *
 * Etapa U1 del plan (docs/empresas-con-dominio-compartido-plan.md, parte 2; DECISIONS «Una empresa con varias
 * unidades»). Generaliza lo que hacían a mano, con nombres fijos del TEC, `scripts/separar-tec.ts` (las fichas y el
 * proyecto de AE) y `scripts/reubicar-reuniones-compartidas.ts` (cada reunión a su entidad): ahora un solo flujo
 * recibe la ficha principal y las unidades (nombre, siglas, dominios propios) y propone, para cada reunión, proyecto,
 * propuesta, preventa, tarea y hecho, a qué unidad va y POR QUÉ. Lo escribe `scripts/separar-en-unidades.ts`.
 *
 * Reglas, en este orden:
 *  · Las reuniones las decide el resolver único (`categorize.ts`) con las fichas como quedarán: título → gente o
 *    dominio → por decidir. Este módulo no decide ninguna reunión por su cuenta; solo lee el porqué.
 *  · Un proyecto va a la unidad que nombra su título; si no nombra a ninguna, a la de la gente de sus reuniones
 *    (todas de la misma), y si no hay pista se queda donde está. Lo que no decidió el título ni una persona lleva
 *    «confirmar»: el `--apply` no lo MUEVE hasta que una persona lo ponga en `aMano`.
 *  · Una propuesta: a mano, su título, el proyecto de su preventa, la gente de sus reuniones, o se queda. Su preventa
 *    va con ella; una preventa sin propuesta, con su proyecto.
 *  · Lo que cuelga con `clientId` (tareas, hechos, alertas, handoff, telemetría…) va con la reunión de la que salió
 *    (la reunión manda), y si no salió de una reunión, con su proyecto, su preventa o su propuesta. Lo que es de la
 *    cuenta entera (sin nada de eso) se queda en su ficha.
 */
import { decidirEntreEntidades, effectiveDomainsForClient, normalize, type CategorizeContext, type DecisionEntreEntidades } from "./categorize";
import { planDeFilas, type ProyectoDelGrupo } from "./reubicar-entre-entidades";

// ── Lo que recibe ──────────────────────────────────────────────────────────────

export interface UnidadAPartir {
  /** La llave de la unidad en la tabla y en `aMano`: «AE», «EC». */
  clave: string;
  /** La ficha que ya existe («TEC- AE»). Sin id, la ficha nace en el `--apply`. */
  id?: string;
  nombre: string;
  /** Su llave en los títulos: «AE |», «Cemaco EC |». */
  siglas: string[];
  /** Dominios propios (Ecuador: sukasa.com, comohogar.com). Sin dominios, vive en el de la principal. */
  dominios?: string[];
  /** Suelta su empresa de HubSpot, con el porqué (la de AE está fusionada en la del ITCR y responde con sus datos). */
  soltarEmpresaDeHubspot?: string;
}

export interface SeparacionEnUnidades {
  /** Cómo se llama la empresa entera, para la tabla: «TEC», «CEMACO». */
  empresa: string;
  /** La ficha que tiene el dominio y la empresa de HubSpot. Se queda con lo que nadie reclama. */
  principal: { clave: string; id: string; nombre: string; siglas: string[]; esperaDominio: string };
  unidades: UnidadAPartir[];
  /** Lo que decidió una persona: id → clave de la unidad. Lo único que el `--apply` mueve sin título que lo diga. */
  aMano?: {
    proyectos?: Record<string, string>;
    propuestas?: Record<string, string>;
    preventas?: Record<string, string>;
    reuniones?: Record<string, string>;
  };
}

/** Una ficha como está hoy en la base. */
export interface FichaActual {
  id: string;
  name: string;
  company: string | null;
  emailDomains: string[];
  siglas: string[];
  hubspotCompanyId: string | null;
  comparteDominioConId: string | null;
}

/** El id con que una unidad nueva aparece en el simulacro; el `--apply` lo cambia por el de la ficha creada. */
export const idDeUnidadNueva = (clave: string) => `unidad-nueva:${clave}`;

export const conSigla = (siglas: readonly string[], nuevas: readonly string[]): string[] => {
  const out = [...siglas];
  for (const s of nuevas) if (!out.some((x) => x.toUpperCase() === s.toUpperCase())) out.push(s);
  return out;
};

// ── Las fichas ─────────────────────────────────────────────────────────────────

/**
 * Las unidades nuevas que un `--apply` anterior ya creó: la ficha que cuelga de la principal con el mismo nombre o con
 * alguno de sus dominios. Sin esto, correr de nuevo (para verificar, o para mover lo que una persona confirmó después)
 * propondría crear otra. Devuelve la separación con esos ids y cuáles encontró.
 */
export function conLasUnidadesYaCreadas(
  sep: SeparacionEnUnidades,
  actuales: ReadonlyMap<string, FichaActual>,
  colgadas: ReadonlyMap<string, readonly string[]>,
): { sep: SeparacionEnUnidades; encontradas: { clave: string; id: string }[] } {
  const encontradas: { clave: string; id: string }[] = [];
  const yaUsadas = new Set(sep.unidades.flatMap((u) => (u.id ? [u.id] : [])));
  const unidades = sep.unidades.map((u) => {
    if (u.id) return u;
    const dominios = new Set((u.dominios ?? []).map((d) => d.trim().toLowerCase()));
    const iguales = (colgadas.get(sep.principal.id) ?? [])
      .filter((id) => !yaUsadas.has(id))
      .map((id) => actuales.get(id))
      .filter((f): f is FichaActual => !!f)
      .filter((f) => normalize(f.name) === normalize(u.nombre) || (f.emailDomains ?? []).some((d) => dominios.has(d.toLowerCase())));
    if (iguales.length !== 1) return u;
    encontradas.push({ clave: u.clave, id: iguales[0]!.id });
    yaUsadas.add(iguales[0]!.id);
    return { ...u, id: iguales[0]!.id };
  });
  return { sep: { ...sep, unidades }, encontradas };
}

export interface FichaDespues {
  clave: string;
  id: string;
  esPrincipal: boolean;
  /** Null: la ficha nace en el `--apply`. */
  antes: FichaActual | null;
  despues: Omit<FichaActual, "id">;
}

/**
 * Las fichas como quedarán, o los motivos para no seguir. `dominioDeOtra(d)`: el nombre de la ficha de AFUERA del grupo
 * que ya tiene ese dominio (INV37: dos fichas con el mismo dominio se reparten las reuniones al azar), o null.
 */
export function fichasDespues(
  sep: SeparacionEnUnidades,
  actuales: ReadonlyMap<string, FichaActual>,
  /** Las fichas que hoy comparten el dominio de cada una (id → ids que le cuelgan). */
  colgadas: ReadonlyMap<string, readonly string[]>,
  dominioDeOtra: (dominio: string) => string | null,
): { fichas: FichaDespues[]; errores: string[] } {
  const errores: string[] = [];
  const p = actuales.get(sep.principal.id);
  const claves = [sep.principal.clave, ...sep.unidades.map((u) => u.clave)];
  if (new Set(claves.map((c) => c.toUpperCase())).size !== claves.length) errores.push(`Hay claves repetidas: ${claves.join(", ")}.`);
  const siglas = [sep.principal.siglas, ...sep.unidades.map((u) => u.siglas)].flat().map((s) => s.toUpperCase());
  if (new Set(siglas).size !== siglas.length) errores.push(`Dos unidades tienen la misma sigla: ${siglas.join(", ")}.`);
  if (!p) return { fichas: [], errores: [...errores, `No existe la ficha principal ${sep.principal.id}.`] };
  const dominiosP = (p.emailDomains ?? []).map((d) => d.toLowerCase());
  if (!dominiosP.includes(sep.principal.esperaDominio.toLowerCase())) {
    errores.push(`«${p.name}» ya no tiene el dominio ${sep.principal.esperaDominio}: no es la ficha que esperaba.`);
  }
  if (p.comparteDominioConId) errores.push(`«${p.name}» comparte el dominio de otra ficha: la principal no puede ser unidad.`);
  const idsDelGrupo = new Set([p.id, ...sep.unidades.flatMap((u) => (u.id ? [u.id] : []))]);
  const ajenasColgadas = (colgadas.get(p.id) ?? []).filter((id) => !idsDelGrupo.has(id));
  if (ajenasColgadas.length) errores.push(`«${p.name}» ya tiene unidades que no están en esta separación (${ajenasColgadas.join(", ")}).`);

  const fichas: FichaDespues[] = [
    {
      clave: sep.principal.clave,
      id: p.id,
      esPrincipal: true,
      antes: p,
      despues: { ...sinId(p), name: sep.principal.nombre, siglas: conSigla(p.siglas ?? [], sep.principal.siglas) },
    },
  ];
  for (const u of sep.unidades) {
    const dominios = (u.dominios ?? []).map((d) => d.trim().toLowerCase()).filter(Boolean);
    for (const d of dominios) {
      if (dominiosP.includes(d)) errores.push(`El dominio ${d} de «${u.nombre}» es de la principal: una unidad con dominio propio no comparte el suyo.`);
      const otra = dominioDeOtra(d);
      if (otra) errores.push(`El dominio ${d} de «${u.nombre}» ya es de «${otra}» (INV37).`);
    }
    if (!u.id) {
      fichas.push({
        clave: u.clave,
        id: idDeUnidadNueva(u.clave),
        esPrincipal: false,
        antes: null,
        despues: { name: u.nombre, company: null, emailDomains: dominios, siglas: [...u.siglas], hubspotCompanyId: null, comparteDominioConId: p.id },
      });
      continue;
    }
    const a = actuales.get(u.id);
    if (!a) {
      errores.push(`No existe la ficha de «${u.nombre}» (${u.id}).`);
      continue;
    }
    if (a.comparteDominioConId && a.comparteDominioConId !== p.id) errores.push(`«${a.name}» ya comparte el dominio de otra ficha.`);
    if ((colgadas.get(a.id) ?? []).length > 0) errores.push(`Hay fichas que comparten el dominio de «${a.name}»: no puede ser unidad.`);
    /* Los dominios propios como los ve el resolver: los de correo y el de `company` si parece un dominio. */
    const propios = effectiveDomainsForClient(a);
    const nuevos = [...new Set([...(a.emailDomains ?? []).map((d) => d.toLowerCase()), ...dominios])];
    const sinDeclarar = propios.filter((d) => !dominios.includes(d));
    if (sinDeclarar.length) {
      errores.push(`«${a.name}» tiene dominios propios (${sinDeclarar.join(", ")}) que la separación no declara: decláralos en la unidad.`);
    }
    fichas.push({
      clave: u.clave,
      id: a.id,
      esPrincipal: false,
      antes: a,
      despues: {
        ...sinId(a),
        name: u.nombre,
        siglas: conSigla(a.siglas ?? [], u.siglas),
        emailDomains: nuevos,
        comparteDominioConId: p.id,
        hubspotCompanyId: u.soltarEmpresaDeHubspot ? null : a.hubspotCompanyId,
      },
    });
  }
  return { fichas, errores };
}

const sinId = (f: FichaActual): Omit<FichaActual, "id"> => ({
  name: f.name,
  company: f.company,
  emailDomains: f.emailDomains ?? [],
  siglas: f.siglas ?? [],
  hubspotCompanyId: f.hubspotCompanyId,
  comparteDominioConId: f.comparteDominioConId,
});

/** ¿Cambia algo de la ficha? (para no reescribir lo que ya está). */
export function fichaCambia(f: FichaDespues): boolean {
  if (!f.antes) return true;
  const a = f.antes;
  const d = f.despues;
  const igual = (x: readonly string[] | null, y: readonly string[] | null) => JSON.stringify(x ?? []) === JSON.stringify(y ?? []);
  return a.name !== d.name || !igual(a.siglas, d.siglas) || !igual(a.emailDomains, d.emailDomains) ||
    a.comparteDominioConId !== d.comparteDominioConId || a.hubspotCompanyId !== d.hubspotCompanyId;
}

/**
 * Los clientes del resolver con las fichas como quedarán: las que existen, cambiadas en su lugar (el orden de creación
 * es el que decide el paso del dominio); las nuevas, al final (son las más nuevas).
 */
export function clientesDespues<C extends { id: string }>(
  clientes: readonly C[],
  fichas: readonly FichaDespues[],
): (C & Omit<FichaActual, "id">)[] {
  const porId = new Map(fichas.map((f) => [f.id, f]));
  const out = clientes.map((c) => {
    const f = porId.get(c.id);
    return (f ? { ...c, ...f.despues } : c) as C & Omit<FichaActual, "id">;
  });
  for (const f of fichas) if (!f.antes) out.push({ id: f.id, ...f.despues } as unknown as C & Omit<FichaActual, "id">);
  return out;
}

// ── El porqué ──────────────────────────────────────────────────────────────────

export type PorQue =
  | "a-mano"
  | "nombre"
  | "gente"
  | "dominio"
  | "reuniones"
  | "de-la-cuenta"
  | "preventa"
  | "propuesta"
  | "proyecto"
  | "dos-nombres"
  | "gente-de-varias"
  | "reuniones-de-varias"
  | "sin-pista";

export const POR_QUE: Record<PorQue, string> = {
  "a-mano": "a mano",
  nombre: "por el título",
  gente: "por la gente",
  dominio: "por el dominio",
  reuniones: "por la gente de sus reuniones",
  "de-la-cuenta": "es de la cuenta: cada ficha tiene la suya",
  preventa: "va con su preventa",
  propuesta: "va con su propuesta",
  proyecto: "va con su proyecto",
  "dos-nombres": "el título nombra a dos",
  "gente-de-varias": "hay gente de dos unidades",
  "reuniones-de-varias": "sus reuniones son de dos unidades",
  "sin-pista": "sin pista",
};

/** Lo que decidió una persona o el título: lo único que el `--apply` mueve sin pedir confirmación. */
const SEGURO = new Set<PorQue>(["a-mano", "nombre", "de-la-cuenta", "preventa", "propuesta", "proyecto"]);

export interface Destino {
  id: string;
  nombre: string;
  de: string;
  a: string;
  por: PorQue;
  /** Lo propuso Nexus sin que lo diga el título ni una persona: se mueve solo si alguien lo pone en `aMano`. */
  confirmar: boolean;
  detalle?: string;
  /** Cuántas de sus reuniones van a cada ficha («» = por decidir), cuando la decisión salió de ellas. */
  reuniones?: Record<string, number>;
}

const destino = (x: Omit<Destino, "confirmar">, porQueSeguro = SEGURO.has(x.por)): Destino => ({ ...x, confirmar: !porQueSeguro });

/** ¿El `--apply` puede mover esto? Lo que se queda donde está nunca bloquea. */
export const bloquea = (d: Destino) => d.confirmar && d.a !== d.de;

/**
 * Adónde va de verdad en el `--apply`: lo que espera confirmación se queda donde está, y todo lo que cuelga de ello
 * (tareas, hechos, el handoff…) también. Es la ÚNICA regla que usa el script para decidir qué escribe.
 */
export const destinoEfectivo = (d: Destino): string => (bloquea(d) ? d.de : d.a);

/** ¿El `--apply` lo muda? */
export const seMueve = (d: Destino): boolean => destinoEfectivo(d) !== d.de;

/** La unidad que nombra un título (de un proyecto o una propuesta), con las siglas y los nombres del grupo. */
function porElTitulo(titulo: string, grupo: CategorizeContext["clients"], ctx: CategorizeContext): DecisionEntreEntidades {
  return decidirEntreEntidades({ title: titulo, participants: [], manualClientId: null }, grupo, ctx);
}

/** De las fichas a las que van las reuniones de algo: la única, o null si son de dos o no hay ninguna. */
function unaSola(duenos: readonly (string | null)[]): { id: string | null; varias: boolean; reuniones: Record<string, number> } {
  const reuniones: Record<string, number> = {};
  for (const d of duenos) reuniones[d ?? ""] = (reuniones[d ?? ""] ?? 0) + 1;
  const ids = new Set(duenos.filter((d): d is string => !!d));
  return { id: ids.size === 1 ? [...ids][0]! : null, varias: ids.size > 1, reuniones };
}

// ── Proyectos ──────────────────────────────────────────────────────────────────

export interface ProyectoParaSeparar {
  id: string;
  name: string;
  clientId: string;
  /** «Información del cliente»: cada ficha tiene la suya y no se mueve. */
  esDeLaCuenta: boolean;
}

/**
 * A qué unidad va cada proyecto. `reunionesDe`: la ficha a la que va cada reunión vinculada como principal al proyecto
 * (null si queda por decidir). `aMano`: proyecto → id de la ficha.
 */
export function destinosDeProyectos(
  proyectos: readonly ProyectoParaSeparar[],
  grupo: CategorizeContext["clients"],
  ctx: CategorizeContext,
  aMano: ReadonlyMap<string, string>,
  reunionesDe: ReadonlyMap<string, readonly (string | null)[]>,
): Destino[] {
  return proyectos.map((p) => {
    const base = { id: p.id, nombre: p.name, de: p.clientId };
    if (p.esDeLaCuenta) return destino({ ...base, a: p.clientId, por: "de-la-cuenta" });
    const mano = aMano.get(p.id);
    if (mano) return destino({ ...base, a: mano, por: "a-mano" });
    const t = porElTitulo(p.name, grupo, ctx);
    if (t.clientId) return destino({ ...base, a: t.clientId, por: "nombre" });
    if (t.por === "dos-nombres") return destino({ ...base, a: p.clientId, por: "dos-nombres" });
    const r = unaSola(reunionesDe.get(p.id) ?? []);
    if (r.id) return destino({ ...base, a: r.id, por: "reuniones", reuniones: r.reuniones });
    if (r.varias) return destino({ ...base, a: p.clientId, por: "reuniones-de-varias", reuniones: r.reuniones });
    return destino({ ...base, a: p.clientId, por: "sin-pista" });
  });
}

// ── Propuestas y preventas ─────────────────────────────────────────────────────

export interface PropuestaParaSeparar {
  id: string;
  name: string;
  clientId: string;
  /** El proyecto de su preventa, si tiene. */
  proyectoDeLaPreventa: string | null;
  /** La ficha a la que va cada reunión elegida para la propuesta. */
  reuniones: readonly (string | null)[];
}

export function destinosDePropuestas(
  propuestas: readonly PropuestaParaSeparar[],
  grupo: CategorizeContext["clients"],
  ctx: CategorizeContext,
  aMano: ReadonlyMap<string, string>,
  proyectoA: ReadonlyMap<string, Destino>,
): Destino[] {
  return propuestas.map((bc) => {
    const base = { id: bc.id, nombre: bc.name, de: bc.clientId };
    const mano = aMano.get(bc.id);
    if (mano) return destino({ ...base, a: mano, por: "a-mano" });
    const t = porElTitulo(bc.name, grupo, ctx);
    if (t.clientId) return destino({ ...base, a: t.clientId, por: "nombre" });
    const proyecto = bc.proyectoDeLaPreventa ? proyectoA.get(bc.proyectoDeLaPreventa) : undefined;
    if (proyecto) return destino({ ...base, a: proyecto.a, por: "proyecto", detalle: proyecto.nombre }, !proyecto.confirmar);
    if (t.por === "dos-nombres") return destino({ ...base, a: bc.clientId, por: "dos-nombres" });
    const r = unaSola(bc.reuniones);
    if (r.id) return destino({ ...base, a: r.id, por: "reuniones", reuniones: r.reuniones });
    if (r.varias) return destino({ ...base, a: bc.clientId, por: "reuniones-de-varias", reuniones: r.reuniones });
    return destino({ ...base, a: bc.clientId, por: "sin-pista" });
  });
}

export interface PreventaParaSeparar {
  id: string;
  /** Cómo se la reconoce en la tabla: el nombre de su propuesta o de su proyecto. */
  nombre: string;
  clientId: string;
  projectId: string | null;
  /** La propuesta que cuelga de ella (`BusinessCase.exploracionId`). */
  propuestaId: string | null;
}

export function destinosDePreventas(
  preventas: readonly PreventaParaSeparar[],
  aMano: ReadonlyMap<string, string>,
  propuestaA: ReadonlyMap<string, Destino>,
  proyectoA: ReadonlyMap<string, Destino>,
): Destino[] {
  return preventas.map((e) => {
    const base = { id: e.id, nombre: e.nombre, de: e.clientId };
    const mano = aMano.get(e.id);
    if (mano) return destino({ ...base, a: mano, por: "a-mano" });
    const propuesta = e.propuestaId ? propuestaA.get(e.propuestaId) : undefined;
    if (propuesta) return destino({ ...base, a: propuesta.a, por: "propuesta", detalle: propuesta.nombre }, !propuesta.confirmar);
    const proyecto = e.projectId ? proyectoA.get(e.projectId) : undefined;
    if (proyecto) return destino({ ...base, a: proyecto.a, por: "proyecto", detalle: proyecto.nombre }, !proyecto.confirmar);
    return destino({ ...base, a: e.clientId, por: "sin-pista" });
  });
}

// ── Lo que cuelga con `clientId` ───────────────────────────────────────────────

export interface FilaParaSeparar {
  id: string;
  clientId: string;
  projectId?: string | null;
  sessionId?: string | null;
  exploracionId?: string | null;
  businessCaseId?: string | null;
}

export type PlanDeFilaSeparada =
  | { id: string; accion: "mover"; clientId: string; projectId: string | null; por: "reunion" | "proyecto" | "preventa" | "propuesta" }
  | { id: string; accion: "queda"; motivo: "por-decidir" | "sin-equivalente" };

/**
 * Las filas de una tabla con `clientId` de las fichas del grupo. La reunión manda: una fila que salió de una reunión va
 * a la ficha de la reunión (y al proyecto equivalente, `planDeFilas`), aunque su proyecto sea de la otra. La que no
 * salió de una reunión va con su proyecto, su preventa o su propuesta. Lo que ya está bien no aparece.
 * `proyectos`: los del grupo con la ficha que tendrán.
 */
export function destinosDeFilas(
  filas: readonly FilaParaSeparar[],
  o: {
    fichasDelGrupo: ReadonlySet<string>;
    proyectoA: ReadonlyMap<string, string>;
    preventaA: ReadonlyMap<string, string>;
    propuestaA: ReadonlyMap<string, string>;
    dueno: ReadonlyMap<string, string | null>;
    proyectos: readonly ProyectoDelGrupo[];
    projectIdObligatorio: boolean;
  },
): PlanDeFilaSeparada[] {
  const plan: PlanDeFilaSeparada[] = [];
  for (const f of filas) {
    if (!o.fichasDelGrupo.has(f.clientId)) continue;
    const projectId = f.projectId ?? null;
    let base = f.clientId;
    let por: "proyecto" | "preventa" | "propuesta" | null = null;
    if (projectId && o.proyectoA.has(projectId)) [base, por] = [o.proyectoA.get(projectId)!, "proyecto"];
    else if (f.exploracionId && o.preventaA.has(f.exploracionId)) [base, por] = [o.preventaA.get(f.exploracionId)!, "preventa"];
    else if (f.businessCaseId && o.propuestaA.has(f.businessCaseId)) [base, por] = [o.propuestaA.get(f.businessCaseId)!, "propuesta"];

    if (f.sessionId && o.dueno.has(f.sessionId)) {
      const [p] = planDeFilas(
        [{ id: f.id, clientId: base, projectId, sessionId: f.sessionId }],
        o.dueno,
        o.proyectos,
        o.projectIdObligatorio,
        o.fichasDelGrupo,
      );
      if (p?.accion === "mover") {
        if (p.clientId !== f.clientId || p.projectId !== projectId) plan.push({ ...p, por: "reunion" });
        continue;
      }
      if (p?.accion === "queda") {
        plan.push(base !== f.clientId ? { id: f.id, accion: "mover", clientId: base, projectId, por: por! } : p);
        continue;
      }
    }
    if (base !== f.clientId) plan.push({ id: f.id, accion: "mover", clientId: base, projectId, por: por! });
  }
  return plan;
}

// ── Lo que una persona ya decidió y la separación no puede tirar ───────────────

export interface VinculoParaSeparar {
  sessionId: string;
  projectId: string;
  /** Lo puso, lo revisó o lo excluyó una persona (`isLockedLink`). */
  conCandado: boolean;
  /** Una persona EXCLUYÓ ese proyecto para la reunión (`included = false`): frena, pero no sugiere esa unidad. */
  excluido: boolean;
}

/**
 * Las reuniones que quedarían POR DECIDIR y tienen un vínculo que tocó una persona con un proyecto de la empresa. Soltar
 * ese vínculo tiraría su decisión («Sales & Service Handoff | CEMACO», vinculado a mano a «Cemaco Internacional - CRM»),
 * así que el `--apply` no sigue hasta que una persona las asigne en `aMano.reuniones`. `sugerida`: la unidad de esos
 * proyectos, si es una sola. `proyectos`: los del grupo con la ficha que tendrán.
 */
export function porDecidirConVinculoDeUnaPersona(
  dueno: ReadonlyMap<string, string | null>,
  vinculos: readonly VinculoParaSeparar[],
  proyectos: readonly { id: string; clientId: string }[],
): { sessionId: string; sugerida: string | null; proyectos: string[] }[] {
  const clienteDe = new Map(proyectos.map((p) => [p.id, p.clientId]));
  const porReunion = new Map<string, VinculoParaSeparar[]>();
  for (const v of vinculos) {
    if (!v.conCandado || !clienteDe.has(v.projectId) || !dueno.has(v.sessionId) || dueno.get(v.sessionId) !== null) continue;
    porReunion.set(v.sessionId, [...(porReunion.get(v.sessionId) ?? []), v]);
  }
  return [...porReunion].map(([sessionId, vs]) => {
    const unidades = new Set(vs.filter((v) => !v.excluido).map((v) => clienteDe.get(v.projectId)!));
    return { sessionId, sugerida: unidades.size === 1 ? [...unidades][0]! : null, proyectos: vs.map((v) => v.projectId) };
  });
}
