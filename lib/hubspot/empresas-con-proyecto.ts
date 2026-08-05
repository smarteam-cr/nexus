/**
 * lib/hubspot/empresas-con-proyecto.ts — QUÉ EMPRESAS DE HUBSPOT LE FALTAN A NEXUS.
 *
 * El universo del botón «Traer de HubSpot» del índice de clientes. La pregunta que contesta es
 * la del usuario, afinada con una precisión que cambia el resultado:
 *
 *   NO  «la empresa tiene un proyecto en HubSpot»            → 61 empresas, 57 ya están
 *   SÍ  «la empresa tiene un proyecto que Nexus NO tiene»    → deja fuera 2 falsos positivos
 *                                                              sin una sola llamada extra
 *
 * ── POR QUÉ NO ES LA CASILLA «Nexus» ────────────────────────────────────────
 * `/integrations` tiene otro botón que trae las empresas con la propiedad `nexus = true`. Ese
 * criterio depende de que una persona se acuerde de marcar una casilla en HubSpot; éste se
 * deriva de un hecho que ya ocurrió — alguien creó el proyecto. Se corrige solo.
 *
 * ── MEDIDO CONTRA PRODUCCIÓN (2026-08-05) ───────────────────────────────────
 * 79 proyectos · 61 empresas distintas · 57 ya en Nexus · 5 llamadas · 3,2 s. El universo es un
 * GOTEO y se agota: por eso el botón que lo consume desaparece cuando llega a cero, y por eso
 * no hay paginación ni caché del panel.
 *
 * ⚠ Se lista con `GET /crm/v3/objects/{obj}` y NO con `search`. El search es un índice
 * eventualmente consistente, y el caso que importa es exactamente el que se le escapa: el CSE
 * que acaba de crear el proyecto en HubSpot hace dos minutos. Verificado que los dos caminos
 * devuelven los mismos 79 records.
 */
import { getSystemHubspotClient } from "./client";
import { OBJETO_PROYECTOS } from "./asociaciones-proyecto";
import { prisma } from "@/lib/db/prisma";
import { detectarGemelas, type ClienteComparable, type Gemela } from "@/lib/clients/gemelas";
import { resolvePipeline } from "@/lib/projects/kind";

/** Un proyecto de HubSpot que Nexus todavía no tiene. */
export interface ProyectoFaltante {
  hubspotServiceId: string;
  nombre: string;
  /** Rótulo del pipeline, o `null` si HubSpot no lo declaró (no se degrada al legacy). */
  tipo: string | null;
  encargadoEmail: string | null;
  encargadoNombre: string | null;
}

export interface EmpresaTraible {
  companyId: string;
  /** `name` de HubSpot, y si viene vacío el dominio. Nunca «(sin nombre)». */
  rotulo: string;
  dominio: string | null;
  proyectos: ProyectoFaltante[];
  /** Fichas de Nexus que podrían ser esta misma empresa. Aviso, no candado. */
  gemelas: Gemela[];
}

export interface UniversoTraible {
  traibles: EmpresaTraible[];
  /** Empresas de HubSpot con al menos un proyecto. El denominador honesto. */
  totalConProyecto: number;
  /** …de ésas, cuántas ya son Client de Nexus. */
  yaEnNexus: number;
  /** …y cuántas quedaron fuera porque su proyecto YA está traído bajo otra ficha. */
  yaTraidoBajoOtraFicha: number;
  /** Proyectos de HubSpot sin ninguna empresa asociada: invisibles para este camino. */
  sinEmpresaAsociada: number;
  /** Proyectos cuyas asociaciones HubSpot no contestó. NO se ofrecen. */
  ilegibles: number;
}

const VACIO: UniversoTraible = {
  traibles: [],
  totalConProyecto: 0,
  yaEnNexus: 0,
  yaTraidoBajoOtraFicha: 0,
  sinEmpresaAsociada: 0,
  ilegibles: 0,
};

interface RecordProyecto {
  id: string;
  nombre: string;
  pipelineId: string | null;
  ownerId: string | null;
  cslEncargado: string | null;
}

/**
 * El universo, en 5 llamadas.
 *
 * Devuelve `null` cuando HubSpot no contestó — que NO es lo mismo que «no hay empresas nuevas»,
 * y la pantalla tiene que poder distinguirlo. Un catch que devolviera el universo vacío haría
 * desaparecer el botón cada vez que la API tose.
 */
export async function listarEmpresasTraibles(): Promise<UniversoTraible | null> {
  let hs: Awaited<ReturnType<typeof getSystemHubspotClient>>;
  try {
    hs = await getSystemHubspotClient();
  } catch {
    return null;
  }

  // ── 1 · Los proyectos del portal ───────────────────────────────────────────
  const proyectos: RecordProyecto[] = [];
  let after: string | undefined;
  for (let pagina = 0; pagina < 10; pagina++) {
    const qs = new URLSearchParams({
      limit: "100",
      properties: "hs_name,hs_pipeline,hubspot_owner_id,csl_encargado",
      ...(after ? { after } : {}),
    });
    const res = await hs.apiRequest({
      method: "GET",
      path: `/crm/v3/objects/${OBJETO_PROYECTOS}?${qs.toString()}`,
    });
    if (res.status !== 200) return null;
    const body = (await res.json()) as {
      results?: Array<{ id: string; properties: Record<string, string | null> }>;
      paging?: { next?: { after?: string } };
    };
    for (const r of body.results ?? []) {
      proyectos.push({
        id: r.id,
        nombre: (r.properties.hs_name ?? "").trim() || `Proyecto ${r.id}`,
        pipelineId: r.properties.hs_pipeline ?? null,
        ownerId: r.properties.hubspot_owner_id ?? null,
        cslEncargado: r.properties.csl_encargado ?? null,
      });
    }
    after = body.paging?.next?.after;
    if (!after) break;
  }
  if (proyectos.length === 0) return VACIO;

  // ── 2 · De qué empresa es cada proyecto ────────────────────────────────────
  /* Un proyecto puede estar asociado a MÁS de una empresa, y todas cuentan: el denominador que
     se le muestra a la persona («HubSpot tiene N empresas con proyecto») tiene que ser el real.
     Quedarse con la primera daba 53 donde la medición contó 61 — un número más chico que la
     verdad, dicho con la misma seguridad. */
  const empresasDe = new Map<string, string[]>();
  const ilegibles = new Set<string>();
  for (let i = 0; i < proyectos.length; i += 100) {
    const lote = proyectos.slice(i, i + 100);
    let ok = false;
    try {
      const res = await hs.apiRequest({
        method: "POST",
        path: `/crm/v4/associations/${OBJETO_PROYECTOS}/companies/batch/read`,
        body: { inputs: lote.map((p) => ({ id: p.id })) },
      });
      if (res.status === 200 || res.status === 207) {
        ok = true;
        const body = (await res.json()) as {
          results?: Array<{ from: { id: string }; to: Array<{ toObjectId: number | string }> }>;
        };
        for (const fila of body.results ?? []) {
          const ids = (fila.to ?? []).map((t) => String(t.toObjectId));
          if (ids.length > 0) empresasDe.set(fila.from.id, ids);
        }
      }
    } catch {
      /* ok queda en false */
    }
    /* ⚠ Un lote que no contestó se marca ILEGIBLE, no «sin empresa». Degradar a un array vacío
       es lo que uno escribe sin pensar, y con un 429 transitorio convertiría a TODAS las
       empresas del lote en candidatas: el botón ofrecería traer decenas de fichas que ya
       existen. El precedente está escrito en partner-clients.ts:265-270. */
    if (!ok) for (const p of lote) ilegibles.add(p.id);
  }

  const sinEmpresaAsociada = proyectos.filter(
    (p) => !ilegibles.has(p.id) && !empresasDe.has(p.id),
  ).length;

  // ── 3 · Qué tiene Nexus ya. Cero llamadas, y acá caen los falsos positivos ──
  const [proyectosDeNexus, clientesDeNexus] = await Promise.all([
    prisma.project.findMany({
      where: { hubspotServiceId: { not: null } },
      select: { hubspotServiceId: true },
    }),
    prisma.client.findMany({
      select: { id: true, name: true, company: true, emailDomains: true, hubspotCompanyId: true },
    }),
  ]);
  const idsDeNexus = new Set(
    proyectosDeNexus.map((p) => p.hubspotServiceId).filter((x): x is string => !!x),
  );
  const empresasDeNexus = new Set(
    clientesDeNexus.map((c) => c.hubspotCompanyId).filter((x): x is string => !!x),
  );

  // Los proyectos que le faltan a Nexus, agrupados por empresa.
  const faltantesPorEmpresa = new Map<string, RecordProyecto[]>();
  const empresasConProyecto = new Set<string>();
  for (const p of proyectos) {
    if (ilegibles.has(p.id)) continue;
    const empresas = empresasDe.get(p.id);
    if (!empresas) continue;
    for (const empresa of empresas) {
      empresasConProyecto.add(empresa);
      if (idsDeNexus.has(p.id)) continue;
      const acc = faltantesPorEmpresa.get(empresa) ?? [];
      acc.push(p);
      faltantesPorEmpresa.set(empresa, acc);
    }
  }

  const candidatas = [...faltantesPorEmpresa.keys()].filter((id) => !empresasDeNexus.has(id));
  const yaEnNexus = [...empresasConProyecto].filter((id) => empresasDeNexus.has(id)).length;
  const base = {
    totalConProyecto: empresasConProyecto.size,
    yaEnNexus,
    // Empresas que NO están en Nexus y a las que igual no les falta nada: su proyecto ya vino
    // bajo otra ficha. Son falsos positivos del criterio ingenuo, y se descuentan gratis.
    yaTraidoBajoOtraFicha:
      empresasConProyecto.size - yaEnNexus - candidatas.length,
    sinEmpresaAsociada,
    ilegibles: ilegibles.size,
  };
  if (candidatas.length === 0) return { ...VACIO, ...base };

  // ── 4 · Nombre, dominio y LÁPIDAS de fusión de las candidatas ──────────────
  // `hs_merged_object_ids` viaja gratis en la llamada que igual se paga: es lo que evita
  // ofrecer una empresa que Nexus ya tiene guardada con un id que después se fusionó.
  const fichas = new Map<string, { name: string | null; domain: string | null; absorbidos: string[] }>();
  for (let i = 0; i < candidatas.length; i += 100) {
    const lote = candidatas.slice(i, i + 100);
    const res = await hs.apiRequest({
      method: "POST",
      path: "/crm/v3/objects/companies/batch/read",
      body: {
        properties: ["name", "domain", "hs_merged_object_ids"],
        inputs: lote.map((id) => ({ id })),
      },
    });
    if (res.status !== 200 && res.status !== 207) return null;
    const body = (await res.json()) as {
      results?: Array<{ id: string; properties: Record<string, string | null> }>;
    };
    for (const r of body.results ?? []) {
      fichas.set(r.id, {
        name: (r.properties.name ?? "").trim() || null,
        domain: (r.properties.domain ?? "").trim() || null,
        absorbidos: (r.properties.hs_merged_object_ids ?? "")
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean),
      });
    }
  }

  // ── 5 · Quién es el encargado ──────────────────────────────────────────────
  const duenios = new Map<string, { email: string | null; nombre: string | null }>();
  try {
    const res = await hs.apiRequest({ method: "GET", path: "/crm/v3/owners?limit=200" });
    if (res.status === 200) {
      const body = (await res.json()) as {
        results?: Array<{ id: string; email?: string; firstName?: string; lastName?: string }>;
      };
      for (const o of body.results ?? []) {
        duenios.set(String(o.id), {
          email: o.email?.toLowerCase() ?? null,
          nombre: [o.firstName, o.lastName].filter(Boolean).join(" ") || null,
        });
      }
    }
  } catch {
    /* Sin dueños la lista sirve igual; lo único que se pierde es poder decir de quién va a ser. */
  }

  const comparables: ClienteComparable[] = clientesDeNexus.map((c) => ({
    id: c.id,
    name: c.name,
    company: c.company,
    emailDomains: c.emailDomains,
  }));

  const traibles: EmpresaTraible[] = [];
  for (const companyId of candidatas) {
    const ficha = fichas.get(companyId);
    if (!ficha) continue; // HubSpot no la devolvió: no se ofrece algo que no se pudo leer
    // Si Nexus ya guardó un id que ESTA empresa absorbió, la empresa ya está: es la misma ficha
    // con otro número. Sin esto se ofrece un duplicado que ningún cruce por id detecta.
    if (ficha.absorbidos.some((viejo) => empresasDeNexus.has(viejo))) continue;

    const faltantes = faltantesPorEmpresa.get(companyId) ?? [];
    traibles.push({
      companyId,
      // ⚠ Cae a dominio: 1 de cada 4 candidatas medidas NO tiene `name`, y una fila en blanco
      // no se puede elegir.
      rotulo: ficha.name ?? ficha.domain ?? `Empresa ${companyId}`,
      dominio: ficha.domain,
      proyectos: faltantes.map((p) => {
        const idDuenio = p.cslEncargado ?? p.ownerId;
        const d = idDuenio ? duenios.get(idDuenio) : undefined;
        return {
          hubspotServiceId: p.id,
          nombre: p.nombre,
          tipo: resolvePipeline(p.pipelineId)?.label ?? null,
          encargadoEmail: d?.email ?? null,
          encargadoNombre: d?.nombre ?? null,
        };
      }),
      gemelas: detectarGemelas({ nombre: ficha.name, dominio: ficha.domain }, comparables),
    });
  }

  // Orden estable: se pinta, y una lista que se reordena sola ya nos hizo colgar un proyecto
  // del hermano equivocado (C11).
  traibles.sort((a, b) => a.rotulo.localeCompare(b.rotulo, "es"));

  return { ...base, traibles, yaTraidoBajoOtraFicha: base.yaTraidoBajoOtraFicha };
}
