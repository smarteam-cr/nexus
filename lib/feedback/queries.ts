/**
 * lib/feedback/queries.ts — las lecturas del feedback. SERVIDOR.
 *
 * Lo que sale de acá es serializable (fechas en ISO) y ya trae lo que la pantalla necesita leer: el
 * nombre de cada persona, el estado que ve quien reportó y la sugerencia de tema de cada reporte.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { modeloDisponible } from "@/lib/db/esquema";
import { getSignedUrl } from "@/lib/storage/client";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { temaMasParecido } from "./parecidos";
import {
  COLUMNA,
  DIAS_DE_LISTO_A_LA_VISTA,
  esColumna,
  estadoParaElAutor,
  fechaCorta,
  TIPO,
  esTipoDeFeedback,
  type Columna,
  type EstadoVisible,
  type TipoDeFeedback,
} from "./reglas";

/** ¿Están las cuatro tablas y el cliente de Prisma que las conoce? */
export function feedbackDisponible(): boolean {
  return (
    modeloDisponible(prisma.feedbackReporte) &&
    modeloDisponible(prisma.feedbackMensaje) &&
    modeloDisponible(prisma.feedbackTema) &&
    modeloDisponible(prisma.feedbackPedido)
  );
}

// ── Personas ────────────────────────────────────────────────────────────────

export interface Persona {
  email: string;
  nombre: string;
  rol: string;
  iniciales: string;
}

export function iniciales(nombre: string): string {
  const partes = nombre.split(/\s+/).filter(Boolean);
  return (partes.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?").slice(0, 2);
}

function etiquetaDeRol(rol: string | null | undefined): string {
  if (!rol) return "Miembro";
  return (ROLE_LABEL as Record<string, string>)[rol] ?? rol;
}

/** Nombre y rol de cada correo (del equipo). Lo que no está en el equipo sale con su correo. */
export async function personasPorEmail(emails: readonly string[]): Promise<Map<string, Persona>> {
  const unicos = [...new Set(emails.map((e) => e.toLowerCase()))];
  const mapa = new Map<string, Persona>();
  if (unicos.length === 0) return mapa;
  const miembros = await prisma.teamMember.findMany({
    where: { email: { in: unicos, mode: "insensitive" } },
    select: { email: true, name: true, roleEnum: true },
  });
  for (const m of miembros) {
    const nombre = m.name || m.email;
    mapa.set(m.email.toLowerCase(), { email: m.email.toLowerCase(), nombre, rol: etiquetaDeRol(m.roleEnum), iniciales: iniciales(nombre) });
  }
  for (const e of unicos) {
    if (!mapa.has(e)) mapa.set(e, { email: e, nombre: e, rol: "Miembro", iniciales: iniciales(e) });
  }
  return mapa;
}

// ── Lo que ve quien reportó ─────────────────────────────────────────────────

export interface ReporteDeLista {
  id: string;
  numero: number;
  tipo: TipoDeFeedback;
  cuerpo: string;
  pantalla: string;
  creado: string;
  estado: EstadoVisible;
  /** El revisor escribió algo que la persona todavía no leyó. */
  nuevo: boolean;
}

function tipoSeguro(t: string): TipoDeFeedback {
  return esTipoDeFeedback(t) ? t : "mejora";
}

/** «Mis reportes»: lo de una persona, lo más nuevo primero. */
export async function misReportes(email: string): Promise<ReporteDeLista[]> {
  const filas = await prisma.feedbackReporte.findMany({
    where: { autorEmail: { equals: email, mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: {
      id: true,
      numero: true,
      tipo: true,
      cuerpo: true,
      pantalla: true,
      createdAt: true,
      estado: true,
      autorLeyoAt: true,
      decididoAt: true,
      tema: { select: { columna: true, movidoAt: true } },
      mensajes: { orderBy: { createdAt: "desc" }, take: 1, select: { autorEmail: true, createdAt: true } },
    },
  });
  return filas.map((r) => {
    const ultimo = r.mensajes[0];
    const delRevisor = ultimo && ultimo.autorEmail.toLowerCase() !== email.toLowerCase();
    const leido = r.autorLeyoAt?.getTime() ?? 0;
    const cambio = Math.max(r.decididoAt?.getTime() ?? 0, r.tema?.movidoAt?.getTime() ?? 0);
    return {
      id: r.id,
      numero: r.numero,
      tipo: tipoSeguro(r.tipo),
      cuerpo: r.cuerpo,
      pantalla: r.pantalla,
      creado: r.createdAt.toISOString(),
      estado: estadoParaElAutor(r),
      nuevo: (!!delRevisor && ultimo.createdAt.getTime() > leido) || cambio > leido,
    };
  });
}

/** Cuántas mejoras mandó alguien en 30 días (la línea del festejo). */
export async function ideasEn30Dias(email: string): Promise<number> {
  return prisma.feedbackReporte.count({
    where: {
      autorEmail: { equals: email, mode: "insensitive" },
      tipo: "mejora",
      createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
    },
  });
}

// ── El detalle de un reporte (para quien reportó y para quien revisa) ───────

export interface MensajeVisible {
  id: string;
  autor: Persona;
  deQuienReporto: boolean;
  cuerpo: string;
  creado: string;
}

export interface ReporteDetalle {
  id: string;
  numero: number;
  tipo: TipoDeFeedback;
  cuerpo: string;
  meFrena: boolean;
  pantalla: string;
  ruta: string;
  rol: string | null;
  navegador: string | null;
  ventana: string | null;
  version: string | null;
  errores: { mensaje: string; hace: string }[];
  marcas: { n: number; descripcion: string }[];
  capturaUrl: string | null;
  estado: string;
  estadoVisible: EstadoVisible;
  motivoCierre: string | null;
  decididoAt: string | null;
  tema: { id: string; titulo: string; columna: Columna } | null;
  autor: Persona;
  creado: string;
  mensajes: MensajeVisible[];
}

function comoLista<T>(json: unknown, valido: (x: unknown) => x is T): T[] {
  return Array.isArray(json) ? json.filter(valido) : [];
}

const esError = (x: unknown): x is { mensaje: string; hace: string } =>
  !!x && typeof (x as { mensaje?: unknown }).mensaje === "string" && typeof (x as { hace?: unknown }).hace === "string";
const esMarca = (x: unknown): x is { n: number; descripcion: string } =>
  !!x && typeof (x as { n?: unknown }).n === "number" && typeof (x as { descripcion?: unknown }).descripcion === "string";

/**
 * El reporte entero, si quien lo pide puede verlo: quien lo escribió o quien revisa. Si no, null
 * (la ruta contesta 404: confirmar que un reporte existe ya es información).
 */
export async function reporteParaVer(id: string, quien: { email: string; esRevisor: boolean }): Promise<ReporteDetalle | null> {
  const r = await prisma.feedbackReporte.findUnique({
    where: { id },
    include: {
      tema: { select: { id: true, titulo: true, columna: true } },
      mensajes: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!r) return null;
  const esAutor = r.autorEmail.toLowerCase() === quien.email.toLowerCase();
  if (!esAutor && !quien.esRevisor) return null;

  const gente = await personasPorEmail([r.autorEmail, ...r.mensajes.map((m) => m.autorEmail)]);
  const capturaUrl = r.capturaPath ? await getSignedUrl(r.capturaPath, 3600) : null;
  return {
    id: r.id,
    numero: r.numero,
    tipo: tipoSeguro(r.tipo),
    cuerpo: r.cuerpo,
    meFrena: r.meFrena,
    pantalla: r.pantalla,
    ruta: r.ruta,
    rol: r.rol,
    navegador: r.navegador,
    ventana: r.ventana,
    version: r.version,
    errores: comoLista(r.errores, esError),
    marcas: comoLista(r.marcas, esMarca),
    capturaUrl,
    estado: r.estado,
    estadoVisible: estadoParaElAutor(r),
    motivoCierre: r.motivoCierre,
    decididoAt: r.decididoAt?.toISOString() ?? null,
    tema: r.tema && esColumna(r.tema.columna) ? { id: r.tema.id, titulo: r.tema.titulo, columna: r.tema.columna } : null,
    autor: gente.get(r.autorEmail.toLowerCase())!,
    creado: r.createdAt.toISOString(),
    mensajes: r.mensajes.map((m) => ({
      id: m.id,
      autor: gente.get(m.autorEmail.toLowerCase())!,
      deQuienReporto: m.autorEmail.toLowerCase() === r.autorEmail.toLowerCase(),
      cuerpo: m.cuerpo,
      creado: m.createdAt.toISOString(),
    })),
  };
}

// ── La bandeja (dirección) ──────────────────────────────────────────────────

export interface TemaResumen {
  id: string;
  titulo: string;
  columna: Columna;
  personas: number;
  reportes: number;
}

export interface ReporteDeBandeja {
  id: string;
  numero: number;
  tipo: TipoDeFeedback;
  cuerpo: string;
  meFrena: boolean;
  pantalla: string;
  creado: string;
  autor: Persona;
  estado: string;
  temaId: string | null;
  tieneCaptura: boolean;
  /** Nunca lo abrió quien revisa. */
  sinAbrir: boolean;
  /** Quien reportó contestó algo que quien revisa no leyó. */
  respondio: boolean;
  sugerencia: { temaId: string; enComun: string[] } | null;
}

export interface DatosDeBandeja {
  reportes: ReporteDeBandeja[];
  temas: TemaResumen[];
  sinRevisar: number;
  /** Cuántos reportes mandó cada persona (para «De Marco · 6 reportes»). */
  porPersona: Record<string, number>;
  /** Cuántos reportes tiene cada pantalla en 30 días. */
  porPantalla: Record<string, number>;
}

export async function datosDeBandeja(): Promise<DatosDeBandeja> {
  const desde30 = new Date(Date.now() - 30 * 86400000);
  const [filas, temas, conteoPersona, conteoPantalla] = await Promise.all([
    prisma.feedbackReporte.findMany({
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true,
        numero: true,
        tipo: true,
        cuerpo: true,
        meFrena: true,
        pantalla: true,
        createdAt: true,
        autorEmail: true,
        estado: true,
        temaId: true,
        capturaPath: true,
        revisorLeyoAt: true,
        mensajes: { orderBy: { createdAt: "desc" }, take: 1, select: { autorEmail: true, createdAt: true } },
      },
    }),
    prisma.feedbackTema.findMany({
      where: { columna: { not: "listo" } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        titulo: true,
        detalle: true,
        columna: true,
        reportes: { select: { autorEmail: true, cuerpo: true } },
      },
    }),
    prisma.feedbackReporte.groupBy({ by: ["autorEmail"], _count: { _all: true } }),
    prisma.feedbackReporte.groupBy({ by: ["pantalla"], where: { createdAt: { gte: desde30 } }, _count: { _all: true } }),
  ]);
  const gente = await personasPorEmail(filas.map((f) => f.autorEmail));
  const comparables = temas.map((t) => ({ id: t.id, titulo: t.titulo, detalle: t.detalle, textos: t.reportes.map((r) => r.cuerpo) }));
  return {
    reportes: filas.map((r) => {
      const ultimo = r.mensajes[0];
      const delAutor = ultimo && ultimo.autorEmail.toLowerCase() === r.autorEmail.toLowerCase();
      const sinDecidir = r.estado === "sin_revisar";
      return {
        id: r.id,
        numero: r.numero,
        tipo: tipoSeguro(r.tipo),
        cuerpo: r.cuerpo,
        meFrena: r.meFrena,
        pantalla: r.pantalla,
        creado: r.createdAt.toISOString(),
        autor: gente.get(r.autorEmail.toLowerCase())!,
        estado: r.estado,
        temaId: r.temaId,
        tieneCaptura: !!r.capturaPath,
        sinAbrir: !r.revisorLeyoAt,
        respondio: !!delAutor && ultimo.createdAt.getTime() > (r.revisorLeyoAt?.getTime() ?? 0),
        sugerencia: sinDecidir ? temaMasParecido(r.cuerpo, comparables) : null,
      };
    }),
    temas: temas
      .filter((t) => esColumna(t.columna))
      .map((t) => ({
        id: t.id,
        titulo: t.titulo,
        columna: t.columna as Columna,
        personas: new Set(t.reportes.map((r) => r.autorEmail.toLowerCase())).size,
        reportes: t.reportes.length,
      })),
    sinRevisar: filas.filter((r) => r.estado === "sin_revisar").length,
    porPersona: Object.fromEntries(conteoPersona.map((c) => [c.autorEmail.toLowerCase(), c._count._all])),
    porPantalla: Object.fromEntries(conteoPantalla.map((c) => [c.pantalla, c._count._all])),
  };
}

// ── La hoja de ruta (dirección) ─────────────────────────────────────────────

export interface TemaDeHoja {
  id: string;
  titulo: string;
  detalle: string | null;
  pantalla: string | null;
  columna: Columna;
  origenTexto: string;
  origen: string;
  personas: Persona[];
  reportes: number;
  frena: number;
  pie: string | null;
}

function textoDeOrigen(
  t: { origen: string; aNombreDe: string | null; createdAt: Date },
  delReporte: { autor: string; fecha: Date } | null,
): string {
  if (t.origen === "reporte" && delReporte) return `Desde un reporte de ${delReporte.autor} · ${fechaCorta(delReporte.fecha)}`;
  if (t.origen === "sugerencia") return `Sugerido en la bandeja · lo creaste el ${fechaCorta(t.createdAt)}`;
  if (t.aNombreDe) return `A mano · a nombre de ${t.aNombreDe} · ${fechaCorta(t.createdAt)}`;
  return `A mano · ${fechaCorta(t.createdAt)}`;
}

export async function temasDeLaHoja(): Promise<TemaDeHoja[]> {
  const desdeListo = new Date(Date.now() - DIAS_DE_LISTO_A_LA_VISTA * 86400000);
  const temas = await prisma.feedbackTema.findMany({
    where: { OR: [{ columna: { not: "listo" } }, { listoAt: { gte: desdeListo } }] },
    orderBy: { createdAt: "desc" },
    include: { reportes: { select: { autorEmail: true, meFrena: true, tipo: true } } },
  });
  const origenIds = temas.map((t) => t.origenReporteId).filter((x): x is string => !!x);
  const origenes = origenIds.length
    ? await prisma.feedbackReporte.findMany({ where: { id: { in: origenIds } }, select: { id: true, autorEmail: true, createdAt: true } })
    : [];
  const gente = await personasPorEmail([...temas.flatMap((t) => t.reportes.map((r) => r.autorEmail)), ...origenes.map((o) => o.autorEmail)]);
  const origenPorId = new Map(origenes.map((o) => [o.id, o]));

  return temas
    .filter((t) => esColumna(t.columna))
    .map((t) => {
      const emails = [...new Set(t.reportes.map((r) => r.autorEmail.toLowerCase()))];
      const o = t.origenReporteId ? origenPorId.get(t.origenReporteId) : undefined;
      const columna = t.columna as Columna;
      const pie =
        columna === "listo" && t.listoAt
          ? `Listo el ${fechaCorta(t.listoAt)} · se avisó a ${emails.length} ${emails.length === 1 ? "persona" : "personas"}`
          : columna === "curso" && t.movidoAt
            ? `En curso desde el ${fechaCorta(t.movidoAt)}`
            : null;
      return {
        id: t.id,
        titulo: t.titulo,
        detalle: t.detalle,
        pantalla: t.pantalla,
        columna,
        origen: t.origen,
        origenTexto: textoDeOrigen(t, o ? { autor: gente.get(o.autorEmail.toLowerCase())!.nombre, fecha: o.createdAt } : null),
        personas: emails.map((e) => gente.get(e)!),
        reportes: t.reportes.length,
        frena: t.reportes.filter((r) => r.tipo === "falla" && r.meFrena).length,
        pie,
      };
    })
    .sort((a, b) => b.personas.length - a.personas.length || b.frena - a.frena);
}

// ── Personas (dirección) ────────────────────────────────────────────────────

export interface FilaDePersona {
  persona: Persona;
  total: number;
  falla: number;
  mejora: number;
  duda: number;
  ultimo: string;
  resueltos: number;
}

export interface PedidoVisible {
  id: string;
  para: Persona;
  pantalla: string;
  pregunta: string;
  estado: string;
  hasta: string | null;
  vistoVeces: number;
  respondidoAt: string | null;
  creado: string;
}

export interface DatosDePersonas {
  dias: number | null;
  total: number;
  personasQueReportaron: number;
  tamanoDelEquipo: number;
  sinRevisar: number;
  masViejoSinRevisar: string | null;
  primeraRespuestaDias: number | null;
  resueltos: number;
  filas: FilaDePersona[];
  callados: (Persona & { ultimo: string | null })[];
  pantallas: { nombre: string; total: number; detalle: string }[];
  pedidos: PedidoVisible[];
}

const RESUELTO = (r: { estado: string; tema: { columna: string } | null }) =>
  r.estado === "respondido" || (r.estado === "en_hoja" && r.tema?.columna === "listo");

export async function datosDePersonas(dias: number | null): Promise<DatosDePersonas> {
  const desde = dias ? new Date(Date.now() - dias * 86400000) : null;
  const [reportes, equipo, sinRevisar, pedidos, ultimos] = await Promise.all([
    prisma.feedbackReporte.findMany({
      where: desde ? { createdAt: { gte: desde } } : {},
      select: {
        autorEmail: true,
        tipo: true,
        pantalla: true,
        createdAt: true,
        estado: true,
        decididoAt: true,
        tema: { select: { columna: true } },
        mensajes: { orderBy: { createdAt: "asc" }, select: { autorEmail: true, createdAt: true } },
      },
    }),
    prisma.teamMember.findMany({
      where: { deactivatedAt: null, appUser: { kind: "INTERNAL" } },
      select: { email: true, name: true, roleEnum: true },
    }),
    prisma.feedbackReporte.findMany({ where: { estado: "sin_revisar" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.feedbackPedido.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.feedbackReporte.groupBy({ by: ["autorEmail"], _max: { createdAt: true } }),
  ]);

  const porPersona = new Map<string, FilaDePersona>();
  const gente = await personasPorEmail([...reportes.map((r) => r.autorEmail), ...pedidos.map((p) => p.paraEmail)]);
  for (const r of reportes) {
    const e = r.autorEmail.toLowerCase();
    const fila =
      porPersona.get(e) ?? { persona: gente.get(e)!, total: 0, falla: 0, mejora: 0, duda: 0, ultimo: r.createdAt.toISOString(), resueltos: 0 };
    fila.total++;
    if (r.tipo === "falla") fila.falla++;
    else if (r.tipo === "duda") fila.duda++;
    else fila.mejora++;
    if (RESUELTO(r)) fila.resueltos++;
    if (r.createdAt.toISOString() > fila.ultimo) fila.ultimo = r.createdAt.toISOString();
    porPersona.set(e, fila);
  }

  // La primera respuesta: el primer mensaje de quien revisa o la decisión, lo que llegue antes.
  const esperas: number[] = [];
  for (const r of reportes) {
    const primerMensaje = r.mensajes.find((m) => m.autorEmail.toLowerCase() !== r.autorEmail.toLowerCase())?.createdAt;
    const candidatos = [primerMensaje, r.decididoAt].filter((d): d is Date => !!d).map((d) => d.getTime());
    if (candidatos.length) esperas.push((Math.min(...candidatos) - r.createdAt.getTime()) / 86400000);
  }

  const ultimoPorEmail = new Map(ultimos.map((u) => [u.autorEmail.toLowerCase(), u._max.createdAt]));
  const callados = equipo
    .filter((m) => m.roleEnum !== "SUPER_ADMIN" && !porPersona.has(m.email.toLowerCase()))
    .map((m) => {
      const nombre = m.name || m.email;
      const u = ultimoPorEmail.get(m.email.toLowerCase());
      return { email: m.email.toLowerCase(), nombre, rol: etiquetaDeRol(m.roleEnum), iniciales: iniciales(nombre), ultimo: u ? u.toISOString() : null };
    })
    .sort((a, b) => (a.ultimo ?? "").localeCompare(b.ultimo ?? ""));

  const porPantalla = new Map<string, { total: number; falla: number; mejora: number; duda: number }>();
  for (const r of reportes) {
    const p = porPantalla.get(r.pantalla) ?? { total: 0, falla: 0, mejora: 0, duda: 0 };
    p.total++;
    if (r.tipo === "falla") p.falla++;
    else if (r.tipo === "duda") p.duda++;
    else p.mejora++;
    porPantalla.set(r.pantalla, p);
  }
  const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

  return {
    dias,
    total: reportes.length,
    personasQueReportaron: porPersona.size,
    tamanoDelEquipo: equipo.filter((m) => m.roleEnum !== "SUPER_ADMIN").length,
    sinRevisar: sinRevisar.length,
    masViejoSinRevisar: sinRevisar[0]?.createdAt.toISOString() ?? null,
    primeraRespuestaDias: esperas.length ? Math.round((esperas.reduce((a, b) => a + b, 0) / esperas.length) * 10) / 10 : null,
    resueltos: reportes.filter(RESUELTO).length,
    filas: [...porPersona.values()].sort((a, b) => b.total - a.total || b.ultimo.localeCompare(a.ultimo)),
    callados,
    pantallas: [...porPantalla.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 8)
      .map(([nombre, p]) => ({
        nombre,
        total: p.total,
        detalle: [
          p.falla ? plural(p.falla, "falla", "fallas") : "",
          p.mejora ? plural(p.mejora, "mejora", "mejoras") : "",
          p.duda ? plural(p.duda, "duda", "dudas") : "",
        ]
          .filter(Boolean)
          .join(" · "),
      })),
    pedidos: pedidos.map((p) => ({
      id: p.id,
      para: gente.get(p.paraEmail.toLowerCase())!,
      pantalla: p.pantalla,
      pregunta: p.pregunta,
      estado: p.estado,
      hasta: p.hasta?.toISOString() ?? null,
      vistoVeces: p.vistoVeces,
      respondidoAt: p.respondidoAt?.toISOString() ?? null,
      creado: p.createdAt.toISOString(),
    })),
  };
}

// ── Pedidos de opinión (quien los recibe) ───────────────────────────────────

export interface PedidoParaMi {
  id: string;
  pantalla: string;
  ruta: string;
  pregunta: string;
  hasta: string | null;
  deQuien: string;
}

export async function pedidosAbiertosDe(email: string): Promise<PedidoParaMi[]> {
  const filas = await prisma.feedbackPedido.findMany({
    where: { paraEmail: { equals: email, mode: "insensitive" }, estado: "abierto" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const gente = await personasPorEmail(filas.map((f) => f.creadoPorEmail));
  return filas.map((p) => ({
    id: p.id,
    pantalla: p.pantalla,
    ruta: p.ruta,
    pregunta: p.pregunta,
    hasta: p.hasta?.toISOString() ?? null,
    deQuien: gente.get(p.creadoPorEmail.toLowerCase())!.nombre.split(" ")[0] ?? "Dirección",
  }));
}

/** Las pantallas que se pueden elegir al pedir una opinión (lo que ya se reportó + las secciones). */
export const NOMBRE_DE_COLUMNA = Object.fromEntries(Object.entries(COLUMNA).map(([k, v]) => [k, v.nombre])) as Record<Columna, string>;
export const NOMBRE_DE_TIPO = Object.fromEntries(Object.entries(TIPO).map(([k, v]) => [k, v.nombre])) as Record<TipoDeFeedback, string>;
