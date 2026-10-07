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
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { fetchCompanyDeals } from "@/lib/hubspot/deals";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { getClientSessions } from "@/lib/sessions/project-sources";
import type { Letra } from "@/lib/escala/documento/tipos";
import type { PropuestaDeExploracion } from "./contenido";
import type { EscalaDelLienzo } from "./escala-del-lienzo";
import { diaConAnio } from "./fechas";
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
import type { ReunionDeLaExploracion, SesionPlaneada } from "./guia";
import { CLAVE_DE_INSTRUCCIONES, rotuloDeLaNota } from "./notas-de-sesion";
import { etiquetaDeLaFuente } from "./senales";
import { agendadasQueYaPasaron, DIAS_ANTES_DEL_ALTA, reunionesDeHubspotQueYaPasaron, type ReunionSinLeer } from "./lectura";
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
  /** Lo que LEYÓ esta corrida para no volver a leerlo: solo «leer» lo marca (ver abajo). */
  leidas: { sesiones: string[]; hubspot: string[]; documentos: string[] };
  /** Las reuniones de Meet que fueron al modelo (marcadas o no): las fuentes de la corrida. */
  sesionesUsadas: string[];
  /** Los datos de la empresa en HubSpot que la escala pide con toda medición (país, tamaño). */
  empresa: { pais: string | null; empleados: string | null } | null;
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
function textoDeLasNotas(notas: Record<string, string>, sesiones: readonly SesionPlaneada[]): string {
  const pasos = REUNIONES.flatMap((r) => r.pasos.map((p) => ({ id: p.id, titulo: `${r.titulo.split(" — ")[0]} · ${p.titulo}` })));
  const dePaso = (id: string) => pasos.find((p) => p.id === id)?.titulo ?? null;
  return Object.entries(notas)
    // Las instrucciones adicionales no son una nota sobre el cliente: van aparte (bloqueDeInstrucciones).
    .filter(([id, texto]) => id !== CLAVE_DE_INSTRUCCIONES && texto.trim())
    .map(([id, texto]) => `${rotuloDeLaNota(id, sesiones, dePaso) ?? id}: ${texto}`)
    .join("\n\n");
}

export async function leerFuentes(opts: {
  exploracionId: string;
  clientId: string;
  companyId: string | null;
  /** Cuándo empezó la exploración: «leer» busca reuniones desde un mes antes (como «sin leer»). */
  creadaEn: Date;
  escala: EscalaDelLienzo;
  propuesta: PropuestaDeExploracion;
  notas: Record<string, string>;
  /** Para nombrar las notas de cada sesión con su número, su fecha y su tema. */
  sesiones?: readonly SesionPlaneada[];
  modo: "preparar" | "leer";
  /** Para «leer»: una reunión elegida; si no, las que todavía no se leyeron. */
  sesionId?: string | null;
  /** Para «leer»: un documento que el vendedor acaba de sumar (solo ese, sin reuniones de Meet). */
  documentoId?: string | null;
}): Promise<LoQueSeLeyo> {
  const nombreDeNivel = (l: Letra) => opts.escala.niveles.find((n) => n.letra === l)?.nombre ?? l;
  const fuentes: Fuente[] = [];
  const leidas = { sesiones: [] as string[], hubspot: [] as string[], documentos: [] as string[] };

  // ── HubSpot ──
  const [empresa, contactos, partner] = await Promise.all([
    opts.companyId ? leerEmpresa(opts.companyId) : Promise.resolve(null),
    opts.companyId ? leerContactos(opts.companyId) : Promise.resolve([] as ContactoDeHubspot[]),
    prisma.clientPartnerSnapshot.findUnique({
      where: { clientId: opts.clientId },
      select: { hubEditions: true, seats: true, nextRenewalAt: true, activeProducts: true },
    }),
  ]);
  const [actividad, negocios] = await Promise.all([
    opts.companyId ? leerActividad(opts.companyId, contactos) : Promise.resolve<ActividadDeLaEmpresa>({ material: [], agenda: [], correosSinPermiso: 0 }),
    opts.companyId
      ? getSystemHubspotClient()
          .then((hs) => fetchCompanyDeals(hs, opts.companyId as string))
          .catch(() => [])
      : Promise.resolve([]),
  ]);

  const textoEmpresa = textoDeLaEmpresa(empresa, partner);
  if (textoEmpresa) fuentes.push({ id: "E0", etiqueta: "La empresa en HubSpot", texto: textoEmpresa });

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

  // La actividad de HubSpot: al preparar, toda la reciente; al leer, solo lo que no se leyó.
  const yaLeidas = new Set(opts.propuesta.leidas.hubspot);
  const actividadQueVa = opts.modo === "leer" ? actividad.material.filter((a) => !yaLeidas.has(a.id)) : actividad.material;
  actividadQueVa.slice(0, 25).forEach((a, i) => {
    fuentes.push({
      id: `H${i + 1}`,
      etiqueta: `${NOMBRE_DEL_TIPO[a.tipo]}${a.ts ? ` del ${fecha(a.ts)}` : ""}${a.resultado ? ` (${QUE_PASO[a.resultado]})` : ""}${a.titulo ? `: ${a.titulo}` : ""}`,
      texto: a.texto,
    });
    if (marcar) leidas.hubspot.push(a.id);
  });

  // ── Las reuniones de Meet (solo las que ya ocurrieron) ──
  const sesiones = await getClientSessions(opts.clientId, { take: 30 });
  const yaLeidasS = new Set(opts.propuesta.leidas.sesiones);
  const ahora = new Date();
  /* Al leer sin una reunión elegida: las dos más recientes SIN LEER y CON transcripción, desde un mes
     antes del alta — las mismas que la pantalla avisa como «sin leer». Sin el filtro, el botón podía
     elegir dos reuniones sin grabar, no leer nada y dejar sin leer para siempre la que se avisa. */
  const desde = opts.creadaEn.getTime() - DIAS_ANTES_DEL_ALTA * 24 * 60 * 60 * 1000;
  const sinLeerConTranscripcion = async () => {
    const candidatas = sesiones.filter((s) => !yaLeidasS.has(s.id) && s.date >= desde).map((s) => s.id);
    if (candidatas.length === 0) return [];
    const filas = await prisma.firefliesSession.findMany({
      where: { id: { in: candidatas }, AND: [{ transcript: { not: null } }, { transcript: { not: "" } }], date: { lte: ahora } },
      select: { id: true },
      orderBy: { date: "desc" },
      take: 2,
    });
    return sesiones.filter((s) => filas.some((f) => f.id === s.id));
  };
  const elegidas =
    opts.modo === "leer"
      ? opts.documentoId
        ? []
        : opts.sesionId
        ? sesiones.filter((s) => s.id === opts.sesionId)
        : await sinLeerConTranscripcion()
      : sesiones.slice(0, 3);
  const conTexto = elegidas.length
    ? await prisma.firefliesSession.findMany({
        // Ids que el chokepoint ya filtró por dueño y por fecha; el techo de fecha se repite acá.
        where: { id: { in: elegidas.map((s) => s.id) }, date: { lte: ahora } },
        select: { id: true, title: true, date: true, transcript: true, summary: true },
        orderBy: { date: "desc" },
      })
    : [];
  const MAX = opts.modo === "leer" ? 60_000 : 12_000;
  const sesionesUsadas: string[] = [];
  conTexto.forEach((s, i) => {
    const resumen =
      s.summary && typeof s.summary === "object" && typeof (s.summary as { overview?: unknown }).overview === "string"
        ? ((s.summary as { overview: string }).overview as string)
        : "";
    const texto = (s.transcript ?? "").trim() || resumen;
    if (!texto) return;
    fuentes.push({ id: `S${i + 1}`, etiqueta: `Reunión del ${fecha(s.date)}: ${s.title}`, texto: texto.slice(0, MAX) });
    sesionesUsadas.push(s.id);
    // Sin transcripción (solo el resumen) no se marca: se vuelve a leer cuando llegue.
    if (marcar && s.transcript) leidas.sesiones.push(s.id);
  });

  /* ── Lo que el vendedor sumó a mano: una sesión que no quedó grabada, el resumen del Smartflow,
     una minuta. Se lee como una transcripción (las citas se verifican igual). ── */
  const docs = await documentosParaLeer(
    opts.exploracionId,
    opts.modo === "leer"
      ? { soloEste: opts.documentoId, excepto: opts.propuesta.leidas.documentos, cuantos: opts.documentoId ? 1 : 3 }
      : { cuantos: 3 },
  );
  docs.forEach((d, i) => {
    fuentes.push({
      id: `M${i + 1}`,
      etiqueta: `Lo que sumó el vendedor${d.fecha ? ` (sesión del ${fecha(d.fecha)})` : ""}: ${d.titulo}`,
      texto: d.texto.slice(0, MAX),
    });
    if (marcar) leidas.documentos.push(d.id);
  });

  // ── Las notas del vendedor: lo que sabe o interpreta y no se dijo en una reunión ──
  const notas = textoDeLasNotas(opts.notas, opts.sesiones ?? []);
  if (notas) fuentes.push({ id: "N0", etiqueta: "Notas del vendedor (su contexto y su interpretación, no palabras del cliente)", texto: notas.slice(0, MAX) });

  return {
    fuentes,
    tests,
    agenda: actividad.agenda,
    noOcurrieron: actividad.noOcurrieron ?? [],
    correosSinPermiso: actividad.correosSinPermiso,
    leidas,
    sesionesUsadas,
    empresa: empresa ? { pais: empresa.pais, empleados: empresa.empleados } : null,
  };
}

/**
 * Todas las reuniones de la exploración, leídas o no: las de Meet con transcripción desde un mes antes
 * del alta, lo que el vendedor sumó a mano y las agendadas en HubSpot que ya pasaron, cada una con si
 * el agente ya la leyó (Elías, 2026-10-05: antes las de HubSpot leídas no se listaban nunca). Es lo
 * que se liga a cada sesión en Exploración (una pestaña por sesión, Elías 2026-10-03).
 */
export async function reunionesDeLaExploracion(
  opts: { exploracionId: string; clientId: string; creadaEn: Date; propuesta: PropuestaDeExploracion; leido: LoLeidoDeHubspot },
  ahora = new Date(),
): Promise<ReunionDeLaExploracion[]> {
  const desde = opts.creadaEn.getTime() - DIAS_ANTES_DEL_ALTA * 24 * 60 * 60 * 1000;
  const leidas = new Set(opts.propuesta.leidas.sesiones);
  const candidatas = (await getClientSessions(opts.clientId, { take: 30 })).filter((s) => s.date >= desde);
  const conTranscripcion = candidatas.length
    ? await prisma.firefliesSession.findMany({
        where: {
          id: { in: candidatas.map((s) => s.id) },
          AND: [{ transcript: { not: null } }, { transcript: { not: "" } }],
          date: { lte: ahora },
        },
        select: { id: true, title: true, date: true },
        orderBy: { date: "desc" },
      })
    : [];
  const deMeet: ReunionDeLaExploracion[] = conTranscripcion.map((s) => ({ id: s.id, titulo: s.title, fecha: s.date.toISOString(), origen: "meet", leida: leidas.has(s.id) }));
  const docsLeidos = new Set(opts.propuesta.leidas.documentos);
  const aMano: ReunionDeLaExploracion[] = (await listarDocumentos(opts.exploracionId)).map((d) => ({
    id: d.id,
    titulo: d.titulo,
    fecha: d.fecha ?? d.creadoEn,
    origen: "documento",
    leida: docsLeidos.has(d.id),
  }));
  const deHubspot: ReunionDeLaExploracion[] = reunionesDeHubspotQueYaPasaron(opts.leido.agenda, opts.propuesta.leidas.hubspot, deMeet, ahora);
  return [...deMeet, ...aMano, ...deHubspot].sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/**
 * Las reuniones que el agente todavía no leyó (lib/exploraciones/lectura.ts): las de Meet CON
 * transcripción desde un mes antes del alta, y las de HubSpot que estaban agendadas y ya pasaron.
 * Solo lee la base (nada de HubSpot): se pide al abrir el lienzo.
 */
export async function reunionesSinLeer(
  opts: { exploracionId: string; clientId: string; creadaEn: Date; propuesta: PropuestaDeExploracion; leido: LoLeidoDeHubspot },
  ahora = new Date(),
): Promise<ReunionSinLeer[]> {
  const desde = opts.creadaEn.getTime() - DIAS_ANTES_DEL_ALTA * 24 * 60 * 60 * 1000;
  const leidas = new Set(opts.propuesta.leidas.sesiones);
  // Leídas o no: la de HubSpot que también está en Meet se cuenta una vez (abajo), aunque la de Meet ya se haya leído.
  const candidatas = (await getClientSessions(opts.clientId, { take: 10 })).filter((s) => s.date >= desde);
  const conTranscripcion = candidatas.length
    ? await prisma.firefliesSession.findMany({
        where: {
          id: { in: candidatas.map((s) => s.id) },
          AND: [{ transcript: { not: null } }, { transcript: { not: "" } }],
          date: { lte: ahora },
        },
        select: { id: true, title: true, date: true },
        orderBy: { date: "desc" },
      })
    : [];
  const deMeet: ReunionSinLeer[] = conTranscripcion.map((s) => ({ id: s.id, titulo: s.title, fecha: s.date.toISOString(), origen: "meet" }));
  const deMeetSinLeer = deMeet.filter((s) => !leidas.has(s.id));
  // Lo que el vendedor sumó a mano y el agente no leyó (la lectura se lanza sola al sumarlo; esto queda si falló).
  const docs = await documentosParaLeer(opts.exploracionId, { excepto: opts.propuesta.leidas.documentos, cuantos: 5 });
  const aMano: ReunionSinLeer[] = docs.map((d) => ({ id: d.id, titulo: d.titulo, fecha: (d.fecha ?? d.createdAt.toISOString()), origen: "documento" }));
  /* La foto conserva las de HubSpot que ya pasaron (lectura.ts › `agendaRenovada`): si la misma reunión
     está en Meet y ya se leyó, su copia de HubSpot no puede quedar «sin leer» para siempre. Por eso se
     compara con TODAS las de Meet, no solo con las que faltan. */
  return [...deMeetSinLeer, ...aMano, ...agendadasQueYaPasaron(opts.leido.agenda, opts.propuesta.leidas.hubspot, deMeet, ahora)];
}
