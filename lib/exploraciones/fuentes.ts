/**
 * lib/exploraciones/fuentes.ts — lo que lee el agente de la exploración, cada cosa con su id. SERVIDOR.
 *
 * Cada fuente lleva un id corto que el modelo cita (E0 la empresa, W0 su sitio web, C0 los
 * contactos, D0 los negocios, T1 el test, H3 una actividad de HubSpot, S2 una reunión de Meet, M1
 * una sesión o un documento que el vendedor sumó a mano, N0 las notas del vendedor) y la frase que respalda lo que propone se busca LITERAL en el texto de su fuente.
 *
 * ⚠ Las reuniones salen por el chokepoint (`getClientSessions`, solo las que ya ocurrieron) y su
 * transcripción se lee ENTERA (no con `fetchTranscriptContent`, que antepone el resumen y corta a
 * 5.000 caracteres: las citas no se podrían verificar y se perdería el final de la reunión, donde
 * está la decisión). Las reuniones de HubSpot que todavía no pasaron son agenda: nunca van al modelo
 * como fuente. De la próxima solo va su título y su fecha, en la línea de «hoy» (agente-pedido.ts).
 * Una que ya pasó lleva lo que HubSpot dice que pasó con ella: se hizo, se canceló, se reagendó.
 *
 * Desde la etapa A (2026-10-09) solo se leen las reuniones de las SESIONES (`armarReuniones`): en un
 * prospecto, también las que entraron solas; en un cliente o un proyecto, las que alguien unió. Una
 * reunión con solo notas de Gemini se lee con sus notas y queda en `leidas.soloNotas` (se relee cuando
 * llegue la transcripción).
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { fetchCompanyDeals } from "@/lib/hubspot/deals";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { getClientSessions } from "@/lib/sessions/project-sources";
import { memoriaDeLaCuenta } from "@/lib/memoria";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";
import { esReunionDePuertasAdentro } from "@/lib/sessions/candidatas-internas";
import { etiquetaDeSala, prefijoDeSala } from "@/lib/sessions/etiqueta-de-sala";
import { salesPresenceEmails } from "@/lib/handoff/sales-presence";
import type { Letra } from "@/lib/escala/documento/tipos";
import type { PropuestaDeExploracion } from "./contenido";
import type { EscalaDelLienzo } from "./escala-del-lienzo";
import { diaConAnio, hoyEnCostaRica } from "./fechas";
import type { Fuente } from "./fuentes-tipos";
import {
  leerActividad,
  leerContactos,
  leerEmpresa,
  enlacesDeLosContactos,
  testsDeLosEnlaces,
  type ActividadDeLaEmpresa,
  type ContactoDeHubspot,
  type ResultadoDeReunion,
} from "./hubspot";
import { documentosParaLeer, listarDocumentos } from "./documentos";
import {
  claveDeReunion,
  LARGO_DE_UNA_TRANSCRIPCION_CORTA,
  pestanasDeSesiones,
  transcripcionCorta,
  type ReunionDeLaExploracion,
  type SesionPlaneada,
  type TextoDeLaReunion,
} from "./guia";
import type { ClaveDeCasilla } from "./casillas";
import { fuentesDelProyecto, sesionesDelProyecto } from "./fuentes-del-proyecto";
import { marcoDe } from "./marco";
import { esClaveDeInstrucciones, rotuloDeLaNota } from "./notas-de-sesion";
import { etiquetaDeLaFuente } from "./senales";
import {
  actividadQueSeLee,
  agendadasQueYaPasaron,
  candidataAutomatica,
  DIAS_ANTES_DEL_ALTA,
  SIN_CORTE,
  type CorteDeLaPreventa,
  reunionesDeHubspotQueYaPasaron,
  reunionesHechasDeHubspot,
  reunionesLeidasDeHubspot,
  textoDeLasNotasDeGemini,
  type ReunionSinLeer,
} from "./lectura";
import type { LoLeidoDeHubspot } from "./lo-leido";
import { REUNIONES } from "./sesion";
import { leerSitioWeb } from "./sitio-web";
import { hostDelSitio } from "./sitio-web-reglas";
import type { ResultadoDelTest } from "./test-de-marketing";

export type { Fuente } from "./fuentes-tipos";

export interface LoQueSeLeyo {
  fuentes: Fuente[];
  /** Los resultados del test, por área (hipótesis: escala anterior). */
  tests: { contacto: string; resultado: ResultadoDelTest }[];
  agenda: ActividadDeLaEmpresa["agenda"];
  /** Las reuniones que ya pasaron y no ocurrieron: la foto deja de avisarlas (lectura.ts › `agendaRenovada`). */
  noOcurrieron?: string[];
  correosSinPermiso: number;
  /**
   * Lo que LEYÓ esta corrida para no volver a leerlo: solo «leer» lo marca (ver abajo). Una reunión de
   * Meet leída solo con sus notas de Gemini va en `soloNotas`: cuando llegue la transcripción se relee.
   */
  leidas: { sesiones: string[]; hubspot: string[]; documentos: string[]; soloNotas?: string[] };
  /** Las reuniones de Meet que fueron al modelo (marcadas o no): las fuentes de la corrida. */
  sesionesUsadas: string[];
  /** Los datos de la empresa en HubSpot que la escala pide con toda medición (país, tamaño). */
  empresa: { pais: string | null; empleados: string | null } | null;
  /**
   * Las reuniones que leyó esta corrida, cada una con su fuente (S1, M1, H3) y su clave en
   * `propuesta.lecturas` (contenido.ts › `claveDeLaReunion`): el agente las resume una por una.
   */
  reunionesLeidas?: ReunionLeida[];
  /**
   * Cuántas reuniones de HubSpot que ya ocurrieron fueron como fuente (leídas o no): la primera
   * preparación sigue leyendo si encontró alguna (agente.ts › `leerLoQueYaHabia`).
   */
  reunionesDeHubspot?: number;
  /**
   * Las reuniones de HubSpot que ya pasaron y dejaron qué leer (lectura.ts › `reunionesHechasDeHubspot`):
   * la foto las guarda con la agenda, así se listan como reuniones aunque nunca hayan estado agendadas.
   */
  hechasEnHubspot?: { id: string; titulo: string; inicio: string }[];
}

/** Lo que se vuelve a leer, por id, aunque ya se haya leído: para resumir reuniones viejas (y nada más). */
export interface LoQueSeRelee {
  sesiones: readonly string[];
  hubspot: readonly string[];
  documentos: readonly string[];
}

export interface ReunionLeida {
  fuente: string;
  clave: string;
  etiqueta: string;
  id: string;
  origen: "meet" | "hubspot" | "documento";
  /** ISO. */
  fecha: string;
  titulo: string;
}

const fecha = diaConAnio;

const NOMBRE_DEL_TIPO: Record<string, string> = { NOTE: "Nota", CALL: "Llamada", MEETING: "Reunión en HubSpot", EMAIL: "Correo" };

/** Lo que pasó con una reunión de HubSpot, para que el modelo no lea una cancelada como hecha. */
const QUE_PASO: Record<ResultadoDeReunion, string> = {
  hecha: "se hizo",
  cancelada: "se canceló, no ocurrió",
  reagendada: "se reagendó, no ocurrió ese día",
  no_se_presento: "el cliente no se presentó",
};

function textoDeLaEmpresa(
  empresa: Awaited<ReturnType<typeof leerEmpresa>>,
  partner: { hubEditions: unknown; seats: unknown; nextRenewalAt: Date | null; activeProducts: string | null } | null,
): string {
  const lineas = [
    empresa?.nombre && `Nombre: ${empresa.nombre}`,
    empresa?.dominio && `Dominio: ${empresa.dominio}`,
    empresa?.industria && `Industria en HubSpot: ${empresa.industria}`,
    empresa?.pais && `País: ${empresa.pais}${empresa.ciudad ? ` (${empresa.ciudad})` : ""}`,
    empresa?.empleados && `Empleados: ${empresa.empleados}`,
    empresa?.sitio && `Sitio: ${empresa.sitio}`,
    empresa?.etapa && `Etapa del ciclo de vida: ${empresa.etapa}`,
    empresa?.descripcion && `Descripción: ${empresa.descripcion}`,
  ];
  if (partner) {
    lineas.push(
      partner.hubEditions ? `Ediciones de HubSpot que tiene: ${JSON.stringify(partner.hubEditions)}` : null,
      partner.seats ? `Asientos: ${JSON.stringify(partner.seats)}` : null,
      partner.activeProducts ? `Productos activos: ${partner.activeProducts}` : null,
      partner.nextRenewalAt ? `Próxima renovación: ${fecha(partner.nextRenewalAt)}` : null,
    );
  }
  return lineas.filter(Boolean).join("\n");
}

/** Cada contacto en una línea, con su rastro: de dónde llegó, su último formulario, sus visitas (para el «por qué ahora»). */
function textoDeLosContactos(contactos: readonly ContactoDeHubspot[]): string {
  return contactos
    .map((c) => {
      const r = c.rastro;
      const origen = etiquetaDeLaFuente(r.fuente);
      return [
        c.nombre,
        c.cargo,
        c.email,
        c.etapa && `etapa: ${c.etapa}`,
        c.estadoDelTest && `test: ${c.estadoDelTest}`,
        origen && `llegó por: ${origen}${r.fuenteDetalle ? ` (${r.fuenteDetalle})` : ""}`,
        r.ultimaConversion && `último formulario: ${r.ultimaConversion}${r.fechaUltimaConversion ? ` el ${fecha(r.fechaUltimaConversion)}` : ""}`,
        r.visitas && `${r.visitas} páginas vistas${r.ultimaVisita ? `, la última el ${fecha(r.ultimaVisita)}` : ""}`,
        r.agendo && `agendó una reunión el ${fecha(r.agendo)}`,
      ]
        .filter(Boolean)
        .join(" · ");
    })
    .join("\n");
}

function textoDelTest(r: ResultadoDelTest, contacto: string, escala: EscalaDelLienzo, nombreDeNivel: (l: Letra) => string): string {
  const area = escala.areas.find((a) => a.id === r.areaId);
  const lineas = r.respuestas.map((x) => {
    const d = area?.dimensiones.find((y) => y.id === x.dimensionId);
    return [
      `${x.dimensionId} ${d?.nombre ?? ""}: ${nombreDeNivel(x.nivel)}`,
      x.respuesta && `eligió «${x.respuesta}»`,
      x.matiz && `agregó «${x.matiz}»`,
    ]
      .filter(Boolean)
      .join(" — ");
  });
  return [`Contestó: ${contacto}${r.fecha ? `, el ${fecha(r.fecha)}` : ""}. Área: ${area?.nombre ?? r.areaId}.`, ...lineas].join("\n");
}

/**
 * Las notas del vendedor: las de cada sesión (pestaña «Durante») y las rápidas del guion viejo, cada
 * una con la sesión o el paso al que pertenece.
 */
function textoDeLasNotas(
  notas: Record<string, string>,
  sesiones: readonly SesionPlaneada[],
  preguntaDe: (sesionId: string, para: string) => string | null,
): string {
  const pasos = REUNIONES.flatMap((r) => r.pasos.map((p) => ({ id: p.id, titulo: `${r.titulo.split(" — ")[0]} · ${p.titulo}` })));
  const dePaso = (id: string) => pasos.find((p) => p.id === id)?.titulo ?? null;
  return Object.entries(notas)
    // Las instrucciones adicionales no son una nota sobre el cliente: van aparte (bloqueDeInstrucciones).
    .filter(([id, texto]) => !esClaveDeInstrucciones(id) && texto.trim())
    .map(([id, texto]) => `${rotuloDeLaNota(id, sesiones, dePaso, preguntaDe) ?? id}: ${texto}`)
    .join("\n\n");
}

// ── Qué reuniones son de la exploración (etapa A, 2026-10-09) ─────────────────

/**
 * Lo de la fila que decide qué reuniones son de la exploración: sus sesiones, lo que se sacó (`fuera`,
 * un prospecto) y las reuniones elegidas antes de la etapa A (`elegidas`, DEPRECATED: en un prospecto
 * cuentan como unidas; en un cliente van a «Fuera de la exploración»).
 */
export interface DeLaFila {
  sesiones?: readonly SesionPlaneada[];
  fuera?: readonly string[];
  elegidas?: readonly string[];
}

const HORA = 60 * 60 * 1000;

/** Los dominios de Smarteam (las categorías internas): para no hacer sesión una reunión de puertas adentro. */
async function dominiosInternos(): Promise<Set<string>> {
  const categorias = await prisma.sessionCategory.findMany({ select: { domains: true, kind: true } }).catch(() => []);
  return buildInternalDomainsSet(categorias);
}

/** El último instante de un día de Costa Rica (UTC-6, sin horario de verano). */
const finDelDia = (dia: string) => new Date(Date.parse(`${dia}T23:59:59.999-06:00`));

/**
 * Las reuniones de Meet que pueden ser las de las sesiones, por el chokepoint (una de otro cliente no
 * sale): la elegida (`reunion` de Meet); la fila `gmeet_<evento>` de su evento o, si todavía no está, las
 * de la empresa que empiezan a menos de dos horas (entre esas, `reunionDeLaSesion` prefiere la que tiene
 * ese `googleEventId`); sin evento, las del mismo día; y la gemela de Meet de una reunión de HubSpot elegida
 * (la que empieza a menos de dos horas de la hora que guardó el servidor). Las que se buscan por cercanía o
 * por fecha nunca son de puertas adentro (`internos`): lo dicho entre el equipo no se liga solo a una sesión.
 * Quién se queda con cuál lo decide después `pestanasDeSesiones` (guia.ts), que es la misma regla que usa la
 * pantalla: así la ligadura por fecha no se pierde aunque la reunión no esté entre las más recientes.
 */
export async function idsLigados(
  clientId: string,
  sesiones: readonly SesionPlaneada[],
  ahora = new Date(),
  internos: ReadonlySet<string> = new Set(),
): Promise<string[]> {
  const ids = new Set<string>();
  const deAfuera = (c: { participants: string[] }) => !esReunionDePuertasAdentro({ participants: c.participants }, internos);
  const elegidas = sesiones.flatMap((s) => (s.reunion?.origen === "meet" ? [s.reunion.id] : []));
  const conEvento = sesiones.filter((s) => !s.reunion && s.evento && Date.parse(s.evento.inicio) <= ahora.getTime());
  const porFecha = sesiones.filter((s) => !s.reunion && !s.evento && s.fecha && s.fecha <= hoyEnCostaRica(ahora));
  const gemelasDeHubspot = sesiones.filter((s) => s.reunion?.origen === "hubspot" && !!s.reunion.inicio && Date.parse(s.reunion.inicio) <= ahora.getTime());
  const [deLasElegidas, deLosEventos] = await Promise.all([
    elegidas.length ? getClientSessions(clientId, { ids: elegidas }) : Promise.resolve([]),
    conEvento.length ? getClientSessions(clientId, { ids: conEvento.map((s) => `gmeet_${s.evento!.id}`) }) : Promise.resolve([]),
  ]);
  for (const s of [...deLasElegidas, ...deLosEventos]) ids.add(s.id);
  const halladas = new Set(deLosEventos.map((s) => s.id));
  const cercanas = await Promise.all([
    ...conEvento
      .filter((s) => !halladas.has(`gmeet_${s.evento!.id}`))
      .map(async (s) => {
        const inicio = Date.parse(s.evento!.inicio);
        const antes = await getClientSessions(clientId, { before: new Date(inicio + 2 * HORA), take: 10 });
        return antes.filter((c) => Math.abs(c.date - inicio) < 2 * HORA && deAfuera(c)).map((c) => c.id);
      }),
    ...gemelasDeHubspot.map(async (s) => {
      const inicio = Date.parse(s.reunion!.inicio!);
      const antes = await getClientSessions(clientId, { before: new Date(inicio + 2 * HORA), take: 10 });
      return antes.filter((c) => Math.abs(c.date - inicio) < 2 * HORA && deAfuera(c)).map((c) => c.id);
    }),
    ...porFecha.map(async (s) => {
      const delDia = await getClientSessions(clientId, { before: finDelDia(s.fecha!), take: 10 });
      return delDia.filter((c) => hoyEnCostaRica(new Date(c.date)) === s.fecha && deAfuera(c)).map((c) => c.id);
    }),
  ]);
  for (const lista of cercanas) for (const id of lista) ids.add(id);
  return [...ids];
}

/** Una reunión de Meet con lo que la exploración necesita saber de ella. */
interface FilaDeMeet {
  id: string;
  title: string;
  date: Date;
  googleEventId: string | null;
  participants: string[];
  organizerEmail: string | null;
  transcripcion: boolean;
  resumen: boolean;
  corto: string | null;
}

/**
 * Lo que hace falta de cada reunión (ids que el chokepoint ya filtró por dueño y por fecha; el techo de
 * fecha se repite acá): su título, su evento, si tiene transcripción o notas, y el texto de las cortas
 * (para saber si casi no tuvo conversación). En SQL para no traer los textos al servidor.
 */
async function filasDeMeet(ids: readonly string[], ahora: Date): Promise<FilaDeMeet[]> {
  if (!ids.length) return [];
  return prisma.$queryRaw<FilaDeMeet[]>`
    SELECT s."id", s."title", s."date", s."googleEventId", s."participants", s."organizerEmail",
      coalesce(length(s."transcript"), 0) > 0 AS "transcripcion",
      s."summary" IS NOT NULL AS "resumen",
      CASE WHEN length(s."transcript") < ${LARGO_DE_UNA_TRANSCRIPCION_CORTA}::int THEN s."transcript" END AS "corto"
    FROM "FirefliesSession" s
    WHERE s."id" IN (${Prisma.join([...ids])}) AND s."date" <= ${ahora}`;
}

const textoDe = (f: Pick<FilaDeMeet, "transcripcion" | "resumen">): TextoDeLaReunion => (f.transcripcion ? "transcripcion" : f.resumen ? "notas" : "nada");

/** Lo que arma la lista de reuniones: todas las que se conocen, cuáles son de alguna sesión, y si entran solas. */
interface ReunionesArmadas {
  /** Las de la lista (lo que ve la pantalla): las de las sesiones, «Fuera de la exploración» y lo sumado a mano. */
  todas: ReunionDeLaExploracion[];
  /** Las claves (`origen:id`) de las reuniones que son de alguna sesión (en un prospecto, también las que entraron solas). */
  deSesiones: Set<string>;
  /** Las de Meet con transcripción o notas: contra estas se juntan las de HubSpot (la misma reunión cuenta una vez). */
  conTexto: { fecha: string }[];
  /** Un prospecto: cada reunión con la empresa entra sola como sesión. */
  automaticas: boolean;
  corte: CorteDeLaPreventa;
}

/**
 * Las reuniones de la exploración. Una reunión es de la exploración solo si es la de una de sus sesiones
 * (guia.ts). Siempre por el chokepoint.
 *   · Un PROSPECTO: las recientes de la empresa que entran solas (`candidataAutomatica`: no de puertas
 *     adentro, no de una serie, no sacadas), con transcripción o notas; las de las sesiones; las elegidas
 *     antes de la etapa A (cuentan como unidas); y las que se sacaron, para «Fuera de la exploración».
 *   · Un CLIENTE o un PROYECTO: solo las de las sesiones (cualquier texto: la sesión espera su
 *     transcripción) y lo leído o elegido antes que no es sesión (`legado`, para «Fuera»).
 * HubSpot: solo la preventa; en la preventa de un cliente, solo las de las sesiones (las leídas antes van
 * a «Fuera»). Lo sumado a mano va siempre (son las fuentes manuales; se liga a una sesión solo si alguien
 * lo une).
 */
async function armarReuniones(
  opts: {
    exploracionId: string;
    clientId: string;
    projectId?: string | null;
    creadaEn: Date;
    propuesta: PropuestaDeExploracion;
    leido?: LoLeidoDeHubspot;
  } & DeLaFila,
  take: number,
  ahora: Date,
): Promise<ReunionesArmadas> {
  const corte = await corteDeLaExploracion(opts);
  const automaticas = !opts.projectId && corte.esProspecto;
  const sesiones = opts.sesiones ?? [];
  const fuera = new Set(opts.fuera ?? []);
  const elegidas = (opts.elegidas ?? []).filter((id) => !fuera.has(`meet:${id}`));
  const legadoIds = automaticas
    ? []
    : [...new Set([...Object.keys(opts.propuesta.lecturas).filter((k) => k.startsWith("meet:")).map((k) => k.slice(5)), ...elegidas])];
  const fueraIds = automaticas ? [...fuera].filter((k) => k.startsWith("meet:")).map((k) => k.slice(5)).slice(-50) : [];

  const internos = await dominiosInternos();
  const [recientes, ligadosIds] = await Promise.all([
    automaticas ? getClientSessions(opts.clientId, { take }) : Promise.resolve([]),
    idsLigados(opts.clientId, sesiones, ahora, internos),
  ]);
  const deEstasIds = [...new Set([...ligadosIds, ...(automaticas ? elegidas : legadoIds), ...fueraIds])];
  const porIds = deEstasIds.length ? await getClientSessions(opts.clientId, { ids: deEstasIds }) : [];
  const solas = new Set(
    recientes
      .filter((s) => candidataAutomatica({ id: s.id, date: s.date, participants: s.participants }, { corte, internos, fuera }))
      .map((s) => s.id),
  );
  // Las que entran solas y las elegidas (en un prospecto) piden texto; las de las sesiones, no.
  const pidenTexto = new Set([...solas, ...(automaticas ? elegidas : []), ...fueraIds]);
  const ligados = new Set(ligadosIds);
  const legado = new Set(legadoIds);
  const ids = [...new Set([...solas, ...porIds.map((s) => s.id)])];
  const filas = await filasDeMeet(ids, ahora);

  const cortas = new Map<string, { minutos: number | null }>();
  for (const f of filas) {
    const c = f.corto ? transcripcionCorta(f.corto) : null;
    if (c) cortas.set(f.id, c);
  }
  const leidas = new Set(opts.propuesta.leidas.sesiones);
  const soloNotas = new Set(opts.propuesta.leidas.soloNotas ?? []);
  const deMeet: ReunionDeLaExploracion[] = filas.flatMap((f) => {
    const texto = textoDe(f);
    if (texto === "nada" && !ligados.has(f.id) && pidenTexto.has(f.id)) return [];
    return [
      {
        id: f.id,
        titulo: f.title,
        fecha: f.date.toISOString(),
        origen: "meet" as const,
        leida: leidas.has(f.id) || (texto === "notas" && soloNotas.has(f.id)),
        texto,
        ...(f.googleEventId ? { eventoId: f.googleEventId } : {}),
        ...(cortas.has(f.id) ? { corta: cortas.get(f.id)! } : {}),
        ...(legado.has(f.id) && !ligados.has(f.id) ? { legado: true as const } : {}),
        ...(esReunionDePuertasAdentro({ participants: f.participants ?? [], organizerEmail: f.organizerEmail }, internos) ? { puertasAdentro: true as const } : {}),
      },
    ];
  });
  const conTexto = deMeet.filter((r) => r.texto !== "nada");

  const docsLeidos = new Set(opts.propuesta.leidas.documentos);
  const aMano: ReunionDeLaExploracion[] = (await listarDocumentos(opts.exploracionId)).map((d) => ({
    id: d.id,
    titulo: d.titulo,
    fecha: d.fecha ?? d.creadoEn,
    origen: "documento",
    leida: docsLeidos.has(d.id),
  }));

  // HubSpot, solo la preventa: las agendadas que ya pasaron y las leídas sin agenda (lectura.ts).
  const leido = opts.leido;
  const deHubspot: ReunionDeLaExploracion[] =
    opts.projectId || !leido ? [] : reunionesDeHubspotQueYaPasaron(leido.agenda, opts.propuesta.leidas.hubspot, conTexto, ahora);
  const leidasDeHubspot: ReunionDeLaExploracion[] = opts.projectId
    ? []
    : reunionesLeidasDeHubspot(opts.propuesta.lecturas, deHubspot, conTexto, corte.desde).map((r) => ({ ...r, ...(automaticas ? {} : { legado: true as const }) }));

  const hoy = hoyEnCostaRica(ahora);
  const clavesDeLasPestanas = (lista: readonly ReunionDeLaExploracion[], o: { automaticas: boolean }) =>
    new Set(pestanasDeSesiones(sesiones, lista, hoy, { automaticas: o.automaticas, fuera }).flatMap((p) => (p.reunion ? [claveDeReunion(p.reunion)] : [])));
  const todasLasConocidas = [...deMeet, ...aMano, ...deHubspot, ...leidasDeHubspot].sort((a, b) => b.fecha.localeCompare(a.fecha));
  // Primero, qué reunión es la de cada sesión (con todo lo que se buscó para ligarlas).
  const deLasSesiones = clavesDeLasPestanas(todasLasConocidas, { automaticas: false });
  /* Lo que se buscó para ligar (las del mismo día, las cercanas a un evento) y no quedó en ninguna sesión
     no es de la exploración, ni siquiera en un prospecto: ahí entra solo lo que pasa `candidataAutomatica`. */
  const propias = new Set([...solas, ...(automaticas ? elegidas : []), ...fueraIds].map((id) => `meet:${id}`));
  const todas = todasLasConocidas
    .filter((r) => {
      const k = claveDeReunion(r);
      if (r.origen === "documento" || deLasSesiones.has(k) || r.legado) return true;
      return r.origen === "meet" ? propias.has(k) : automaticas;
    })
    // Lo que es de una sesión deja de ser «de antes».
    .map((r) => (r.legado && deLasSesiones.has(claveDeReunion(r)) ? sinLegado(r) : r));
  const deSesiones = automaticas ? clavesDeLasPestanas(todas, { automaticas: true }) : deLasSesiones;
  return { todas, deSesiones, conTexto, automaticas, corte };
}

function sinLegado(r: ReunionDeLaExploracion): ReunionDeLaExploracion {
  const { legado: _legado, ...resto } = r;
  void _legado;
  return resto;
}

/**
 * Desde cuándo cuentan las reuniones: en la preventa, desde un mes antes del alta (y, en un prospecto,
 * también las de antes con alguien de Ventas: `corteDeLaExploracion`); en un proyecto, todas las del
 * proyecto (el kickoff suele ser de antes de abrir la exploración).
 */
function desdeCuando(o: { creadaEn: Date; projectId?: string | null }): number {
  return o.projectId ? 0 : o.creadaEn.getTime() - DIAS_ANTES_DEL_ALTA * 24 * 60 * 60 * 1000;
}

/**
 * El corte de la preventa (lectura.ts › `CorteDeLaPreventa`): desde un mes antes del alta y, en un
 * prospecto, también las de antes con alguien de Ventas. En un proyecto, todas.
 */
export async function corteDeLaExploracion(o: { clientId: string; creadaEn: Date; projectId?: string | null }): Promise<CorteDeLaPreventa> {
  if (o.projectId) return SIN_CORTE;
  const [cliente, ventas] = await Promise.all([
    prisma.client.findUnique({ where: { id: o.clientId }, select: { kind: true } }),
    salesPresenceEmails().catch(() => new Set<string>()),
  ]);
  return { desde: desdeCuando(o), esProspecto: cliente?.kind === "PROSPECTO", ventas };
}

/** ¿La empresa ya no es prospecto (un cliente, una empresa con historia)? Si no se puede leer, no: sin memoria. */
async function yaNoEsProspecto(clientId: string): Promise<boolean> {
  try {
    const c = await prisma.client.findUnique({ where: { id: clientId }, select: { kind: true } });
    return !!c && c.kind !== "PROSPECTO";
  } catch {
    return false;
  }
}

export async function leerFuentes(opts: {
  exploracionId: string;
  clientId: string;
  /** La exploración de un proyecto: lee lo del proyecto en vez de HubSpot (fuentes-del-proyecto.ts). */
  projectId?: string | null;
  companyId: string | null;
  /** @deprecated Las reuniones elegidas a mano en el buscador (antes de la etapa A): en un prospecto cuentan como unidas. */
  elegidas?: readonly string[];
  /** `contenido.fuera`: lo que se sacó de la exploración de un prospecto (no se lee). */
  fuera?: readonly string[];
  /** La foto de HubSpot (`test`): sus reuniones que ya pasaron se ligan a las sesiones igual que las de Meet. */
  leido?: LoLeidoDeHubspot;
  /** Cuándo empezó la exploración: «leer» busca reuniones desde un mes antes (como «sin leer»). */
  creadaEn: Date;
  escala: EscalaDelLienzo;
  propuesta: PropuestaDeExploracion;
  notas: Record<string, string>;
  /** Las sesiones: deciden qué reuniones son de la exploración, y nombran las notas de cada una. */
  sesiones?: readonly SesionPlaneada[];
  modo: "preparar" | "leer";
  /** Para «leer»: una reunión elegida; si no, las que todavía no se leyeron. */
  sesionId?: string | null;
  /** Para «leer»: un documento que el vendedor acaba de sumar (solo ese, sin reuniones de Meet). */
  documentoId?: string | null;
  /**
   * Para «leer»: SOLO esto, aunque ya se haya leído, y sin las notas del vendedor. Lo usa el resumen de
   * las reuniones que el agente leyó antes de que resumiera cada una (agente.ts › `resumirLoYaLeido`).
   */
  releer?: LoQueSeRelee;
}): Promise<LoQueSeLeyo> {
  const nombreDeNivel = (l: Letra) => opts.escala.niveles.find((n) => n.letra === l)?.nombre ?? l;
  const fuentes: Fuente[] = [];
  const leidas = { sesiones: [] as string[], hubspot: [] as string[], documentos: [] as string[], soloNotas: [] as string[] };

  // ── HubSpot (solo la preventa: en un proyecto, lo vendido ya está en el handoff) ──
  const companyId = opts.projectId ? null : opts.companyId;
  const [empresa, contactos, partner] = await Promise.all([
    companyId ? leerEmpresa(companyId) : Promise.resolve(null),
    companyId ? leerContactos(companyId) : Promise.resolve([] as ContactoDeHubspot[]),
    opts.projectId
      ? Promise.resolve(null)
      : prisma.clientPartnerSnapshot.findUnique({
          where: { clientId: opts.clientId },
          select: { hubEditions: true, seats: true, nextRenewalAt: true, activeProducts: true },
        }),
  ]);
  const [actividad, negocios] = await Promise.all([
    // Al leer, la transcripción completa de las 3 reuniones grabadas más recientes; al preparar, el resumen alcanza.
    companyId
      ? leerActividad(companyId, contactos, new Date(), { transcripciones: opts.modo === "leer" ? 3 : 0 })
      : Promise.resolve<ActividadDeLaEmpresa>({ material: [], agenda: [], correosSinPermiso: 0 }),
    companyId
      ? getSystemHubspotClient()
          .then((hs) => fetchCompanyDeals(hs, companyId))
          .catch(() => [])
      : Promise.resolve([]),
  ]);

  const reunionesLeidas: ReunionLeida[] = [];
  const textoEmpresa = textoDeLaEmpresa(empresa, partner);
  if (textoEmpresa) fuentes.push({ id: "E0", etiqueta: "La empresa en HubSpot", texto: textoEmpresa });
  // En un proyecto: el handoff, los cuestionarios, el kickoff, la ficha y lo que estimó la preventa. Al LEER una reunión,
  // sin la memoria interna (F0): el resumen de esa lectura llega al correo de seguimiento, que lee el cliente.
  if (opts.projectId) fuentes.push(...(await fuentesDelProyecto(opts.projectId, opts.clientId, { conMemoria: opts.modo !== "leer" })));
  /* A0 (memoria de la cuenta, etapa 3): en la preventa de una empresa que ya NO es prospecto, lo que Nexus ya sabe de la
     cuenta (la ficha, los procesos, la historia, lo fuera de alcance, la auditoría; sin esta preventa ni lo que ella
     propuso a la ficha). `esFuenteDelCliente` no cuenta A0: no sostiene un nivel ni una casilla del marco, y la regla
     «sin una pista del cliente no hay diagnóstico» sigue en pie. Ni en un prospecto (de él Nexus no sabe nada propio)
     ni al releer una reunión. */
  else if (!(opts.modo === "leer" && opts.releer) && (await yaNoEsProspecto(opts.clientId))) {
    const memoria = await memoriaDeLaCuenta(opts.clientId, { lector: "preventa" }).catch(() => null);
    if (memoria?.texto) {
      fuentes.push({ id: "A0", etiqueta: "Lo que Nexus ya sabe de la cuenta (no lo dijo el cliente en esta preventa)", texto: memoria.texto });
    }
  }

  /* Al preparar, la portada del sitio de la empresa: qué dice de sí misma. Es DATO (el prompt lo
     dice); se lee con candados (sitio-web.ts) y, si falla, la preparación sigue sin él. */
  if (opts.modo === "preparar" && empresa) {
    const sitio = await leerSitioWeb(hostDelSitio(empresa.sitio, empresa.dominio));
    if (sitio) fuentes.push({ id: "W0", etiqueta: `Su sitio web (${new URL(sitio.url).hostname})`, texto: sitio.texto });
  }
  if (contactos.length) fuentes.push({ id: "C0", etiqueta: "Contactos en HubSpot", texto: textoDeLosContactos(contactos) });
  if (negocios.length) {
    fuentes.push({
      id: "D0",
      etiqueta: "Negocios en HubSpot",
      texto: negocios
        .slice(0, 10)
        .map((n) => [n.name, n.stage, n.amount && `monto ${n.amount}`, n.closedate && `cierre ${fecha(n.closedate)}`].filter(Boolean).join(" · "))
        .join("\n"),
    });
  }

  /* Solo el test de quien es de esta empresa: el de un contacto cuya empresa principal es otra no es de acá.
     Y el de las notas que dejó el test (ya filtradas por empresa en leerActividad): los tests de junio y
     julio de 2026 dejaron la nota pero no la dirección en el contacto. */
  const tests = testsDeLosEnlaces([
    ...enlacesDeLosContactos(contactos.filter((c) => !c.empresaId || c.empresaId === opts.companyId)),
    ...(actividad.enlacesDelTest ?? []),
  ]);
  tests.forEach((t, i) => {
    const area = opts.escala.areas.find((a) => a.id === t.resultado.areaId)?.nombre ?? t.resultado.areaId;
    fuentes.push({
      id: `T${i + 1}`,
      etiqueta: `Test de ${area}${t.resultado.fecha ? ` del ${fecha(t.resultado.fecha)}` : ""}`,
      texto: textoDelTest(t.resultado, t.contacto, opts.escala, nombreDeNivel),
    });
  });

  /* Lo leído lo marca solo «leer». «Preparar» mira todo con otra pregunta (qué hipótesis llevar) y
     recorta las reuniones: si las marcara, la primera «Leer la reunión» no tendría nada que leer y
     nadie sacaría de esa reunión los niveles, las metas ni lo que quedó sin explorar. */
  const marcar = opts.modo === "leer";

  /* La actividad de HubSpot: al preparar, toda la reciente; al leer, lo que no se leyó desde un mes antes
     del alta (lectura.ts › `actividadQueSeLee`), o lo que se relee. */
  const yaLeidas = new Set(opts.propuesta.leidas.hubspot);
  const corte = await corteDeLaExploracion(opts);
  const releer = opts.modo === "leer" ? opts.releer : undefined;
  const ahora = new Date();
  /* Qué reuniones son de la exploración (etapa A): las de sus sesiones (en un prospecto, también las que
     entraron solas). Sin `releer`, que lee solo lo que nombra. */
  const armadas = releer ? null : await armarReuniones({ ...opts, leido: opts.leido }, 30, ahora);
  const fuera = new Set(opts.fuera ?? []);
  /* Al leer, una reunión de HubSpot cuenta solo si es de la exploración: en la preventa de un cliente, la
     de una sesión; en un prospecto, la que nadie sacó. Las notas, llamadas y correos se leen como siempre. */
  const reunionDeLaExploracion = (a: { id: string; tipo?: string }) => {
    if (a.tipo !== "MEETING" || !armadas) return true;
    if (fuera.has(`hubspot:${a.id}`)) return false;
    return armadas.automaticas || armadas.deSesiones.has(`hubspot:${a.id}`);
  };
  const actividadQueVa = releer
    ? actividad.material.filter((a) => releer.hubspot.includes(a.id))
    : opts.modo === "leer"
      ? actividadQueSeLee(actividad.material, { yaLeidas, corte }).filter(reunionDeLaExploracion)
      : actividad.material;
  let reunionesDeHubspot = 0;
  actividadQueVa.slice(0, 25).forEach((a, i) => {
    const etiqueta = `${NOMBRE_DEL_TIPO[a.tipo]}${a.ts ? ` del ${fecha(a.ts)}` : ""}${a.resultado ? ` (${QUE_PASO[a.resultado]})` : ""}${a.titulo ? `: ${a.titulo}` : ""}`;
    fuentes.push({ id: `H${i + 1}`, etiqueta, texto: a.texto });
    if (a.tipo === "MEETING" && (!a.resultado || a.resultado === "hecha")) reunionesDeHubspot++;
    if (marcar) leidas.hubspot.push(a.id);
    // Una reunión de HubSpot que se hizo también se resume como reunión (las otras actividades no).
    if (marcar && a.tipo === "MEETING" && (!a.resultado || a.resultado === "hecha")) {
      reunionesLeidas.push({
        fuente: `H${i + 1}`,
        clave: `hubspot:${a.id}`,
        etiqueta,
        id: a.id,
        origen: "hubspot",
        fecha: new Date(a.ts || Date.now()).toISOString(),
        titulo: a.titulo || "Reunión",
      });
    }
  });

  /* ── Las reuniones de Meet: SOLO las de las sesiones (etapa A, 2026-10-09). En un prospecto, también las
     que entraron solas como sesión; en un cliente o un proyecto, las que alguien unió a una sesión. ── */
  const releerMeet = releer ? releer.sesiones : null;
  const deLaExploracion = (armadas?.todas ?? []).filter((r) => r.origen === "meet" && armadas?.deSesiones.has(claveDeReunion(r)));
  const conLoQueDejo = (r: ReunionDeLaExploracion) => r.texto !== "nada" && !r.corta;
  /* Qué se lee:
     · releer: SOLO eso (el resumen de lo ya leído), por el chokepoint;
     · leer una reunión elegida: esa, si es de una sesión;
     · leer sin elegir: las dos más recientes SIN LEER que dejaron transcripción o notas — las mismas que
       la pantalla avisa como «sin leer»;
     · preparar: las tres sesiones más recientes que dejaron qué leer. */
  const aLeer: string[] = releerMeet
    ? releerMeet.length
      ? (opts.projectId ? await sesionesDelProyecto(opts.projectId, opts.clientId, releerMeet) : await getClientSessions(opts.clientId, { ids: releerMeet })).map((s) => s.id)
      : []
    : opts.modo === "leer"
      ? opts.documentoId
        ? []
        : opts.sesionId
          ? deLaExploracion.filter((r) => r.id === opts.sesionId).map((r) => r.id)
          : deLaExploracion
              .filter((r) => conLoQueDejo(r) && !r.leida)
              .slice(0, 2)
              .map((r) => r.id)
      : deLaExploracion
          .filter(conLoQueDejo)
          .slice(0, 3)
          .map((r) => r.id);
  const conTexto = aLeer.length
    ? await prisma.firefliesSession.findMany({
        // Ids que el chokepoint ya filtró por dueño y por fecha; el techo de fecha se repite acá.
        where: { id: { in: aLeer }, date: { lte: ahora } },
        select: { id: true, title: true, date: true, transcript: true, summary: true, participants: true, organizerEmail: true },
        orderBy: { date: "desc" },
      })
    : [];
  /* Una reunión de puertas adentro (solo puede llegar acá si alguien la unió a mano a una sesión) va rotulada, como en
     el material de los documentos: lo dicho entre el equipo no es palabra del cliente. Las demás no cambian de
     etiqueta: con ella se juntan lo que sugirió el agente y la lectura de cada reunión. */
  const internosDeLaSala = conTexto.length ? await dominiosInternos() : new Set<string>();
  const MAX = opts.modo === "leer" ? 60_000 : 12_000;
  const sesionesUsadas: string[] = [];
  conTexto.forEach((s, i) => {
    const transcripcion = (s.transcript ?? "").trim();
    // Sin transcripción, las notas de Gemini (el resumen y sus secciones): una reunión con solo notas también se lee.
    const texto = transcripcion || textoDeLasNotasDeGemini(s.summary);
    if (!texto) return;
    const deLaSala = etiquetaDeSala({ participants: s.participants, organizerEmail: s.organizerEmail }, internosDeLaSala);
    const sala = deLaSala === "PUERTAS ADENTRO" ? prefijoDeSala(deLaSala) : "";
    const etiqueta = `${sala}Reunión del ${fecha(s.date)}${transcripcion ? "" : " (solo las notas de Gemini)"}: ${s.title}`;
    fuentes.push({ id: `S${i + 1}`, etiqueta, texto: texto.slice(0, MAX) });
    sesionesUsadas.push(s.id);
    if (marcar) reunionesLeidas.push({ fuente: `S${i + 1}`, clave: `meet:${s.id}`, etiqueta, id: s.id, origen: "meet", fecha: s.date.toISOString(), titulo: s.title });
    // Con solo las notas se marca aparte: cuando llegue la transcripción, se vuelve a leer.
    if (marcar) (transcripcion ? leidas.sesiones : leidas.soloNotas).push(s.id);
  });

  /* ── Lo que el vendedor sumó a mano: una sesión que no quedó grabada, el resumen del Smartflow,
     una minuta. Se lee como una transcripción (las citas se verifican igual). ── */
  const docs = releer
    ? releer.documentos.length
      ? (await documentosParaLeer(opts.exploracionId, { cuantos: 20 })).filter((d) => releer.documentos.includes(d.id))
      : []
    : await documentosParaLeer(
        opts.exploracionId,
        opts.modo === "leer"
          ? { soloEste: opts.documentoId, excepto: opts.propuesta.leidas.documentos, cuantos: opts.documentoId ? 1 : 3 }
          : { cuantos: 3 },
      );
  docs.forEach((d, i) => {
    const etiqueta = `Lo que sumó el vendedor${d.fecha ? ` (sesión del ${fecha(d.fecha)})` : ""}: ${d.titulo}`;
    fuentes.push({ id: `M${i + 1}`, etiqueta, texto: d.texto.slice(0, MAX) });
    if (marcar) {
      leidas.documentos.push(d.id);
      reunionesLeidas.push({
        fuente: `M${i + 1}`,
        clave: `documento:${d.id}`,
        etiqueta,
        id: d.id,
        origen: "documento",
        fecha: d.fecha ?? d.createdAt.toISOString(),
        titulo: d.titulo,
      });
    }
  });

  // ── Las notas del vendedor: lo que sabe o interpreta y no se dijo en una reunión ──
  // La pregunta de una nota por pregunta: la de la guía de esa sesión o, si no hay, la de base.
  const preguntaDe = (sesionId: string, para: string): string | null => {
    const guia = opts.propuesta.guias[sesionId] ?? opts.propuesta.guia;
    const delAgente = guia?.preguntas.find((p) => p.para === para)?.pregunta;
    if (delAgente) return delAgente;
    const vendido = guia?.loVendido?.find((v) => v.id === para);
    if (vendido) return `${vendido.tema}: ${vendido.pregunta}`;
    const base = marcoDe(opts.projectId ? "cs" : "venta").preguntaDeBase[para as ClaveDeCasilla];
    if (base) return base;
    return opts.escala.areas.flatMap((a) => a.dimensiones).find((d) => d.id === para)?.pregunta ?? null;
  };
  const notas = releer ? "" : textoDeLasNotas(opts.notas, opts.sesiones ?? [], preguntaDe);
  const quien = opts.projectId ? "del CSE" : "del vendedor";
  if (notas) fuentes.push({ id: "N0", etiqueta: `Notas ${quien} (su contexto y su interpretación, no palabras del cliente)`, texto: notas.slice(0, MAX) });

  return {
    fuentes,
    tests,
    agenda: actividad.agenda,
    noOcurrieron: actividad.noOcurrieron ?? [],
    correosSinPermiso: actividad.correosSinPermiso,
    leidas,
    sesionesUsadas,
    empresa: empresa ? { pais: empresa.pais, empleados: empresa.empleados } : null,
    reunionesLeidas,
    reunionesDeHubspot,
    ...(companyId
      ? { hechasEnHubspot: reunionesHechasDeHubspot(actividad.material, { corte, ahora: new Date() }).map(({ id, titulo, inicio }) => ({ id, titulo, inicio })) }
      : {}),
  };
}

/**
 * Las reuniones de la exploración, leídas o no: las de sus sesiones (en un prospecto, también las que
 * entraron solas), lo que alguna vez fue de la exploración y ya no es sesión («Fuera de la exploración»)
 * y lo sumado a mano. Es lo que se liga a cada sesión en Exploración (guia.ts › `pestanasDeSesiones`).
 * Cada una dice si el agente ya la leyó, qué texto dejó (las de Meet) y su evento del calendario.
 * Ver `armarReuniones`.
 */
export async function reunionesDeLaExploracion(
  opts: {
    exploracionId: string;
    clientId: string;
    projectId?: string | null;
    creadaEn: Date;
    propuesta: PropuestaDeExploracion;
    leido: LoLeidoDeHubspot;
  } & DeLaFila,
  ahora = new Date(),
): Promise<ReunionDeLaExploracion[]> {
  return (await armarReuniones(opts, 30, ahora)).todas;
}

/**
 * Las reuniones de las sesiones que el agente todavía no leyó (lib/exploraciones/lectura.ts): las de
 * Meet que dejaron transcripción o notas (una con solo notas ya leída no aparece; cuando llegue su
 * transcripción, sí), lo sumado a mano sin leer y las de HubSpot que ya pasaron. Una que casi no tuvo
 * conversación no: la sesión pregunta qué pasó. Lo que no es de una sesión tampoco. Solo lee la base.
 */
export async function reunionesSinLeer(
  opts: {
    exploracionId: string;
    clientId: string;
    projectId?: string | null;
    creadaEn: Date;
    propuesta: PropuestaDeExploracion;
    leido: LoLeidoDeHubspot;
  } & DeLaFila,
  ahora = new Date(),
): Promise<ReunionSinLeer[]> {
  const armadas = await armarReuniones(opts, 10, ahora);
  const deLaSesion = (r: { origen: string; id: string }) => armadas.deSesiones.has(claveDeReunion(r));
  const deMeetSinLeer: ReunionSinLeer[] = armadas.todas
    .filter((r) => r.origen === "meet" && deLaSesion(r) && !r.leida && r.texto !== "nada" && !r.corta)
    .map((r) => ({ id: r.id, titulo: r.titulo, fecha: r.fecha, origen: "meet" }));
  // Lo que el vendedor sumó a mano y el agente no leyó (la lectura se lanza sola al sumarlo; esto queda si falló).
  const docs = await documentosParaLeer(opts.exploracionId, { excepto: opts.propuesta.leidas.documentos, cuantos: 5 });
  const aMano: ReunionSinLeer[] = docs.map((d) => ({ id: d.id, titulo: d.titulo, fecha: d.fecha ?? d.createdAt.toISOString(), origen: "documento" }));
  /* La foto conserva las de HubSpot que ya pasaron (lectura.ts › `agendaRenovada`): si la misma reunión
     está en Meet con su texto, su copia de HubSpot no puede quedar «sin leer» para siempre. Por eso se
     compara con TODAS las de Meet que dejaron texto, no solo con las que faltan. En un cliente, solo las
     de una sesión. */
  const deMeet = armadas.conTexto;
  const deHubspot = opts.projectId ? [] : agendadasQueYaPasaron(opts.leido.agenda, opts.propuesta.leidas.hubspot, deMeet, ahora).filter(deLaSesion);
  return [...deMeetSinLeer, ...aMano, ...deHubspot];
}

/** Una reunión de la empresa para el selector de «Agregar sesión» (y el buscador viejo de «Contexto adicional»). */
export interface ReunionDeLaEmpresa {
  sessionId: string;
  title: string;
  date: string;
  participants: string[];
  organizerEmail: string | null;
  sinTranscripcion: boolean;
  /** Qué texto dejó: la transcripción, solo las notas de Gemini, o nada todavía. */
  texto: TextoDeLaReunion;
  /** Tiene minuta: se leyó al llegar. */
  conMinuta: boolean;
}

/**
 * Las reuniones de la empresa que se pueden agregar como sesión («Una que ya pasó», etapa A): las que ya
 * ocurrieron, de TODA la empresa (también en la exploración de un proyecto: la fase 2 puede estar en otro
 * proyecto), por el chokepoint, cada una con qué texto dejó y si tiene minuta. La pantalla saca las que
 * ya son sesión y filtra con lo que se escribe.
 */
export async function reunionesDeLaEmpresaParaElegir(clientId: string, ahora = new Date()): Promise<ReunionDeLaEmpresa[]> {
  const sesiones = await getClientSessions(clientId, { take: 100 });
  if (!sesiones.length) return [];
  const filas = await prisma.$queryRaw<{ id: string; transcripcion: boolean; resumen: boolean; minuta: boolean }[]>`
    SELECT s."id",
      coalesce(length(s."transcript"), 0) > 0 AS "transcripcion",
      s."summary" IS NOT NULL AS "resumen",
      EXISTS (SELECT 1 FROM "SessionMinute" m WHERE m."sessionId" = s."id") AS "minuta"
    FROM "FirefliesSession" s
    WHERE s."id" IN (${Prisma.join(sesiones.map((s) => s.id))}) AND s."date" <= ${ahora}`;
  const porId = new Map(filas.map((f) => [f.id, f]));
  return sesiones.map((s) => {
    const f = porId.get(s.id);
    const texto: TextoDeLaReunion = f ? textoDe(f) : "nada";
    return {
      sessionId: s.id,
      title: s.title,
      date: new Date(s.date).toISOString(),
      participants: s.participants,
      organizerEmail: null,
      sinTranscripcion: texto !== "transcripcion",
      texto,
      conMinuta: !!f?.minuta,
    };
  });
}
