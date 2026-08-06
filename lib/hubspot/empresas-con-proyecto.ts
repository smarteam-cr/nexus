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
import { resolvePipeline, decidirCierre, estadoCrudoDeHubspot } from "@/lib/projects/kind";

/** Un proyecto de HubSpot que Nexus todavía no tiene. */
export interface ProyectoFaltante {
  hubspotServiceId: string;
  nombre: string;
  /**
   * El id de pipeline que dijo HubSpot. Lo consume el alta para sellar `altaPipelineElegido`.
   *
   * ⚠ SE EXPONE A PROPÓSITO, y su ausencia costó dos proyectos en cuarentena permanente. Este
   * módulo YA leía el pipeline —para armar `tipo`— y lo TIRABA. El alta que nacía por acá
   * quedaba con `altaPipelineElegido = null`, y la confirmación del motor («el tipo que volvió
   * tiene que ser el que se eligió», alta-runner.ts) comparaba el pipeline real contra null:
   * insatisfacible PARA SIEMPRE. Los proyectos quedaban sin cobrar, sin cartera, sin handoff y
   * sin poder publicarse, con un botón «Reintentar» que no podía ganar nunca.
   *
   * Lo deriva el SERVIDOR —no viaja en el cuerpo del pedido—, así que sigue siendo el mismo
   * candado que el `companyId`.
   */
  pipelineId: string | null;
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
  /** …de ésas, cuántas ya son Client de Nexus. Es el numerador que el panel PINTA. */
  yaEnNexus: number;
  /** …y cuántas quedaron fuera porque TODOS sus proyectos ya están traídos bajo otra ficha. */
  yaTraidoBajoOtraFicha: number;
  /** Proyectos de HubSpot sin ninguna empresa asociada: invisibles para este camino. */
  sinEmpresaAsociada: number;
  /** Proyectos cuyas asociaciones HubSpot no contestó. NO se ofrecen. */
  ilegibles: number;
  /**
   * ── LOS TRES DESCARTES, DICHOS EN VOZ ALTA ──────────────────────────────────
   * Los tres sacan proyectos de la lista, y ninguno puede hacerlo en silencio: una lista que se
   * acorta sin decirlo se lee como «no hay nada más», que es la peor frase del sistema.
   */
  /** En etapa terminal en HubSpot. */
  cerrados: number;
  /** Borrados a propósito desde Nexus (lista de supresión). No vuelven solos. */
  suprimidos: number;
  /** En un pipeline que Nexus no tiene declarado. Se bloquea en la puerta, igual que el alta. */
  tipoDesconocido: number;
}

const VACIO: UniversoTraible = {
  traibles: [],
  totalConProyecto: 0,
  yaEnNexus: 0,
  yaTraidoBajoOtraFicha: 0,
  sinEmpresaAsociada: 0,
  ilegibles: 0,
  cerrados: 0,
  suprimidos: 0,
  tipoDesconocido: 0,
};

interface RecordProyecto {
  id: string;
  nombre: string;
  pipelineId: string | null;
  /** Los dos que consume `decidirCierre`: un proyecto terminado no se ofrece. */
  stageId: string | null;
  rawStatus: string | null;
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
      /* Las tres últimas son para `decidirCierre`. Viajan GRATIS en la llamada que igual se
         paga —mismo criterio que `hs_merged_object_ids` en el paso 4— y sin ellas la lista
         ofrece proyectos terminados, que es el caso que deja el alta sin salida. */
      properties:
        "hs_name,hs_pipeline,hubspot_owner_id,csl_encargado," +
        "hs_pipeline_stage,hs_status,estatus_del_proyecto",
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
        stageId: (r.properties.hs_pipeline_stage ?? "").trim() || null,
        /* ⚠ Por el HELPER y no a mano: son dos propiedades que dicen lo mismo y el ORDEN entre
           ellas decide. Esta línea nació invertida y podía ofrecer un proyecto que el espejo
           —mirando el mismo record— iba a cerrar. Ver `estadoCrudoDeHubspot`. */
        rawStatus: estadoCrudoDeHubspot(r.properties),
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
      select: {
        id: true, name: true, company: true, emailDomains: true, hubspotCompanyId: true,
        // La lista de supresión: proyectos que alguien BORRÓ a propósito desde la Zona de
        // peligro. Sin esto el botón los vuelve a ofrecer y reaparecen solos.
        ignoredHubspotServiceIds: true,
      },
    }),
  ]);
  const idsDeNexus = new Set(
    proyectosDeNexus.map((p) => p.hubspotServiceId).filter((x): x is string => !!x),
  );
  const empresasDeNexus = new Set(
    clientesDeNexus.map((c) => c.hubspotCompanyId).filter((x): x is string => !!x),
  );

  /**
   * La lista de supresión, UNIDA sobre todos los clientes.
   *
   * Es a propósito que no se mire cliente por cliente: la empresa candidata todavía NO es un
   * `Client`, así que no hay ficha de la cual leer su propia lista. Y el caso real que esto
   * atrapa —el proyecto se borró desde el cliente A y reaparece bajo la empresa duplicada de
   * HubSpot— es justamente el que un chequeo por-cliente no vería.
   */
  const suprimidosDeNexus = new Set(clientesDeNexus.flatMap((c) => c.ignoredHubspotServiceIds));

  // Los proyectos que le faltan a Nexus, agrupados por empresa.
  const faltantesPorEmpresa = new Map<string, RecordProyecto[]>();
  const empresasConProyecto = new Set<string>();
  /**
   * ── LOS TRES DESCARTES ──────────────────────────────────────────────────────
   * Se cuentan por PROYECTO y con `Set`, no con `n++`: un proyecto asociado a dos empresas pasa
   * dos veces por este bucle y un contador ingenuo lo contaría doble.
   *
   * Los tres están porque traer uno de ésos NO produce un proyecto usable:
   *
   *  · cerrado — el espejo dirigido lo pone en `inactive` y hace `continue` ANTES de escribir
   *    el pipeline. Por el camino de adjuntar eso deja el alta trabada en una fila que ya no se
   *    puede abrir (NAVEGABLE exige ACTIVO), o sea con el cartel «Reintentar» inalcanzable.
   *  · suprimido — el espejo lo saltea por diseño. Reaparecería solo lo que alguien borró aposta.
   *  · tipo desconocido — el alta única YA bloquea este caso en la puerta
   *    (`NuevoProyectoStepper.tsx`), con el motivo escrito: dejarlo crear con un aviso sería
   *    fabricar a sabiendas un proyecto que cae en la fila por defecto y COBRA.
   */
  const cerrados = new Set<string>();
  const suprimidos = new Set<string>();
  const tipoDesconocido = new Set<string>();
  /** Todos los proyectos legibles de cada empresa — el denominador de `traidoBajoOtraFicha`. */
  const empresasDeOtroProyecto = new Map<string, string[]>();
  for (const p of proyectos) {
    if (ilegibles.has(p.id)) continue;
    const empresas = empresasDe.get(p.id);
    if (!empresas) continue;
    for (const empresa of empresas) {
      empresasConProyecto.add(empresa);
      empresasDeOtroProyecto.set(empresa, [...(empresasDeOtroProyecto.get(empresa) ?? []), p.id]);
      /**
       * ⚠ LOS DESCARTES SE CUENTAN SOLO SOBRE EMPRESAS QUE PODRÍAN SER CANDIDATAS.
       *
       * Sin esta línea los tres Set se llenan ANTES de saber si la empresa ya es cliente, y
       * como el espejo nunca crea un proyecto cerrado ni uno suprimido, sus ids no entran nunca
       * a `idsDeNexus`: se cuentan para siempre, aunque su empresa sea cliente desde hace un
       * año. Con 57 de 61 empresas ya en Nexus, el panel terminaba diciendo «12 proyectos ya
       * finalizados» sobre una lista de 2 filas — un número que no explica nada de lo que la
       * persona está mirando y que no baja nunca.
       */
      if (empresasDeNexus.has(empresa)) continue;
      if (idsDeNexus.has(p.id)) continue;
      if (suprimidosDeNexus.has(p.id)) {
        suprimidos.add(p.id);
        continue;
      }
      const cierre = decidirCierre({
        hubspotPipelineId: p.pipelineId,
        stageId: p.stageId,
        rawStatus: p.rawStatus,
      });
      if (cierre === "cerrado") {
        cerrados.add(p.id);
        continue;
      }
      if (!resolvePipeline(p.pipelineId)) {
        tipoDesconocido.add(p.id);
        continue;
      }
      const acc = faltantesPorEmpresa.get(empresa) ?? [];
      acc.push(p);
      faltantesPorEmpresa.set(empresa, acc);
    }
  }

  const candidatas = [...faltantesPorEmpresa.keys()].filter((id) => !empresasDeNexus.has(id));
  const yaEnNexus = [...empresasConProyecto].filter((id) => empresasDeNexus.has(id)).length;
  /**
   * Empresas que NO están en Nexus y a las que igual no les falta nada: TODOS sus proyectos ya
   * vinieron bajo otra ficha.
   *
   * ⚠ Se cuenta, no se resta. La versión por resta —`total - yaEnNexus - candidatas`— absorbía
   * en silencio todo lo que este módulo poda por otros motivos (los tres descartes, las fichas
   * que HubSpot no devolvió, las absorbidas por una fusión), así que su nombre afirmaba una
   * causa que en general era falsa.
   */
  const traidoBajoOtraFicha = new Set<string>();
  for (const [empresa, ps] of empresasDeOtroProyecto) {
    if (empresasDeNexus.has(empresa)) continue;
    if (faltantesPorEmpresa.has(empresa)) continue;
    if (ps.every((id) => idsDeNexus.has(id))) traidoBajoOtraFicha.add(empresa);
  }
  const base = {
    totalConProyecto: empresasConProyecto.size,
    yaEnNexus,
    // Empresas que NO están en Nexus y a las que igual no les falta nada: su proyecto ya vino
    // bajo otra ficha. Son falsos positivos del criterio ingenuo, y se descuentan gratis.
    yaTraidoBajoOtraFicha: traidoBajoOtraFicha.size,
    sinEmpresaAsociada,
    ilegibles: ilegibles.size,
    cerrados: cerrados.size,
    suprimidos: suprimidos.size,
    tipoDesconocido: tipoDesconocido.size,
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
          pipelineId: p.pipelineId,
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

  return { ...base, traibles };
}
