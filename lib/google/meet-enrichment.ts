/**
 * lib/google/meet-enrichment.ts
 *
 * Enriquecimiento de sesiones Google Meet en dos fases:
 *
 * FASE 1 — Doc adjunto (googleDocId en el evento del calendario):
 *   Lee el Google Doc (Gemini Notes). La POLÍTICA de parseo vive en doc-parse.ts (pura).
 *
 * FASE 2 — Búsqueda en Drive (sesiones sin doc adjunto):
 *   Busca en Drive del impersonado los archivos creados ±3 días del meet y lee SOLO los que son de
 *   esta reunión: mismo título y misma fecha (lib/google/drive-candidatos.ts). Hasta el 2026-10-05
 *   leía el más nuevo que tuviera las dos primeras palabras de 4+ letras del título, y así 156 de 169
 *   reuniones se quedaron con un texto que no era el suyo (CAV con la de Honda, ICB con la de Cayalá).
 *
 * Cuando el texto de una reunión ya leída CAMBIA, la lectura no se queda con el texto viejo: lo decide
 * lib/sessions/reanalizar.ts (rehacer lo que nadie tocó, o avisar).
 *
 * ── CUÁNDO SE LEE (2026-10-17, «que no falte ninguna reunión») ────────────────
 * Después del FIN de la reunión más 20 minutos (`listaParaLeer`), no una hora después del inicio. Y
 * «no había nada» en una reunión que terminó hace menos de 48 horas no sella: vuelve en 2, 4, 8 y 16
 * horas (`datosDeEscritura` con `esperarMaterial`). Si una cuenta del equipo no tiene acceso al
 * documento (403/404) o, buscando en Drive, no tiene nada, se prueba con otro invitado del equipo.
 *
 * ── LAS TRES REGLAS QUE ESTE ARCHIVO APRENDIÓ A GOLPES (2026-08-08) ──────────
 * 1. **Un fallo de lectura NUNCA sella.** Antes, un 429 de la API se tragaba en un catch
 *    mudo y la fila quedaba `enrichedAt` para siempre: así se quemaron las corridas del
 *    17-may (528/1100 docs ilegibles) y del 7-jul (47/73). Ahora el resultado es
 *    DISCRIMINADO (`LecturaDoc`) y la escritura la decide `datosDeEscritura` (pura):
 *    fallo → attempts+1 con el error persistido, sin sellar; lo drena el job
 *    `google-enrich-retry` con espera exponencial; al 5º fallo se sella CON procedencia.
 * 2. **Se impersona a quien se PUEDE impersonar.** Antes siempre al organizador; si era el
 *    cliente o una sala, la lectura era imposible por diseño (~267 reuniones al 7%).
 *    `elegirImpersonado` (puro) cae al primer participante interno.
 * 3. **No se enriquece lo que no ocurrió.** Antes las pasadas tomaban sesiones futuras y
 *    las sellaban vacías (88/171 de Desarrollo selladas ANTES de la reunión). Ahora el
 *    where exige `date < ahora - 1h` y, desde el 2026-10-17, que haya TERMINADO hace 20
 *    minutos (`listaParaLeer`, con la duración del evento).
 */

// Import profundo a propósito, nunca la raíz "googleapis": la raíz carga los tipos de ~400 APIs y
// dejó sin memoria el build del VPS (2026-09-26). Ver lib/google/googleapis-sin-raiz.test.ts.
import { drive as apiDrive } from "googleapis/build/src/apis/drive";
import { prisma } from "@/lib/db/prisma";
import { getImpersonatedAuth } from "@/lib/google/auth";
import { summarizeTranscript } from "@/lib/ai/summarize-session";
import { DIAS_DE_FRESCURA, colaTomaSoloNotas, seguimientoPrendido } from "@/lib/lecturas/reglas";
import { SE_LEE_SI_CANCELADA_TIENE_SU_DOC } from "@/lib/sessions/canceladas";
import { claseDeTexto } from "@/lib/sessions/tiene-texto";
import { parseDocTabs, parseDocBody, MAX_TRANSCRIPT_CHARS, MIN_TRANSCRIPT_CHARS, type DocTab } from "./doc-parse";
import { candidatosImpersonables } from "./elegir-impersonado";
import { consultaDeDrive, elegirArchivosDeLaReunion, VENTANA_DRIVE_MS, type ArchivoDeDrive } from "./drive-candidatos";
import { huellaDeTexto, textoCambio } from "@/lib/sessions/analisis-ajeno";
import { procedenciaDelTexto } from "@/lib/sessions/texto-de-otra-reunion";
import {
  datosDeEscritura,
  debeEsperarMaterial,
  esReintentable,
  esperaBackoffMs,
  esErrorDeCuota,
  listaParaLeer,
  MAX_ENRICH_ATTEMPTS,
  probarOtraCuenta,
  type LecturaDoc,
} from "./enrich-retry";

// ── Constantes ────────────────────────────────────────────────────────────────

/* 10 → 3 (2026-08-08): con 10 en paralelo y sin backoff, una API que ya devolvía cuota
   recibía 10 pedidos más por batch — es la mecánica exacta de la quema del 17-may. */
const DOC_BATCH = 3;
const DRIVE_BATCH = 3;
/**
 * Prefiltro de la consulta: ninguna reunión se lee antes de una hora de su inicio. El filtro de verdad es `listaParaLeer`
 * (el FIN de la reunión más 20 minutos), que se aplica sobre lo que trae la consulta.
 */
const GRACIA_MS = 3_600_000;
/* Una serie con el mismo título (la diaria, la semanal): las reuniones de alrededor dicen de cuál es cada archivo de
   Drive. Dos ventanas, para cubrir también los archivos de los extremos. */
const VENTANA_DE_LA_SERIE_MS = 2 * VENTANA_DRIVE_MS;
/* Cuántos archivos se le piden a Drive: el filtro de verdad es `elegirArchivosDeLaReunion`, así que conviene traer de
   más (con 5, una palabra común dejaba afuera el archivo correcto). */
const ARCHIVOS_POR_BUSQUEDA = 25;
/* Tope POR PASADA (auditoría 2026-08-08): sin `take`, el primer auto-sync después del
   rescate procesaría las ~2.300 filas reseteadas de UNA — el «50 por corrida» del script
   era ilusorio. Con tope, el drenaje se auto-regula con el cooldown de 20 min. */
const TOPE_PASADA = 120;
/* La lectura de la reunión (minuta + compromisos + propuesta de avance) es para reuniones FRESCAS: correrla sobre lo
   rescatado de hace meses llenaría los tableros de propuestas viejas y propondría avances «as of» sesiones de mayo.
   El transcript y el summary quedan igual; las minutas viejas se piden a demanda desde la sesión. La frescura vive en
   lib/lecturas/reglas.ts (`DIAS_DE_FRESCURA`): es la misma regla que usan la cola, el job e INV44. */

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type EnrichResult = {
  enriched: number;
  skipped: number;
  errors: number;
};

/** Lo mínimo de una fila para procesarla. */
interface SesionAEnriquecer {
  id: string;
  title: string;
  date: Date;
  /** Minutos (del evento del calendario): con el inicio, dice cuándo terminó. */
  duration: number;
  googleDocId: string | null;
  organizerEmail: string | null;
  participants: string[];
  enrichAttempts: number;
  /** El sello AL MOMENTO DEL SNAPSHOT — el candado de frescura lo compara contra la base. */
  enrichedAt: Date | null;
}

const SELECT_ENRIQUECER = {
  id: true,
  title: true,
  date: true,
  duration: true,
  googleDocId: true,
  organizerEmail: true,
  participants: true,
  enrichAttempts: true,
  enrichedAt: true,
} as const;

/** El status HTTP de un error de googleapis, si lo trae. */
function statusDe(err: unknown): number | null {
  const e = err as { response?: { status?: number }; status?: number; code?: number | string };
  const s = e?.response?.status ?? e?.status ?? (typeof e?.code === "number" ? e.code : null);
  return typeof s === "number" ? s : null;
}

function mensajeDe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LECTURA DE GOOGLE DOCS ────────────────────────────────────────────────────
// La POLÍTICA de parseo (qué pestaña es el transcript, cuándo se promueve otra por
// contenido, qué cuenta como plantilla vacía) vive en lib/google/doc-parse.ts — pura y
// testeada como tabla. Acá queda SOLO el fetch.
// ─────────────────────────────────────────────────────────────────────────────

/** Lee un Google Doc por ID e intenta extraer transcript + resumen. */
async function fetchDocContent(userEmail: string, docId: string): Promise<LecturaDoc> {
  try {
    const auth = getImpersonatedAuth(userEmail);

    // Usamos auth.request() en vez del cliente docs.documents.get() para garantizar
    // que el parámetro includeTabsContent=true llega al servidor.
    // El cliente googleapis puede filtrar silenciosamente parámetros que no están
    // en sus tipos generados, pero auth.request() construye la URL directamente.
    const res = await auth.request<{
      tabs?: DocTab[];
      body?: {
        content?: Array<{
          paragraph?: { elements?: Array<{ textRun?: { content?: string | null } }> };
        }>;
      };
    }>({
      url: `https://docs.googleapis.com/v1/documents/${encodeURIComponent(docId)}?includeTabsContent=true`,
      method: "GET",
    });
    const doc = res.data;

    const rawTabs = (doc as unknown as { tabs?: DocTab[] }).tabs;

    if (rawTabs && rawTabs.length > 0) {
      const parsed = parseDocTabs(rawTabs);
      console.log(
        `[google/enrich] Doc ${docId}: tabs [${parsed.diagnostico.tabsVistos.join(", ")}] → ` +
          `${parsed.diagnostico.motivo} (transcript ${parsed.transcript?.length ?? 0} chars)`,
      );
      return { ok: true, transcript: parsed.transcript, summary: parsed.summary, diagnostico: parsed.diagnostico };
    }

    // Sin tabs: leer body completo (fallback para docs sin tabs o si la API no devolvió tabs)
    const bodyText = (doc.body?.content ?? [])
      .flatMap((b) => b.paragraph?.elements ?? [])
      .map((el) => el.textRun?.content ?? "")
      .join("")
      .trim();
    const parsed = parseDocBody(bodyText);
    console.log(`[google/enrich] Doc ${docId}: sin tabs → ${parsed.diagnostico.motivo}`);
    return { ok: true, transcript: parsed.transcript, summary: parsed.summary, diagnostico: parsed.diagnostico };
  } catch (err) {
    /* ⚠ EL FALLO SE PROPAGA, NO SE DISFRAZA DE "SIN CONTENIDO". Este catch devolvía
       {transcript:null, summary:null} y el escritor sellaba la fila: un 429 pasajero quedaba
       grabado como «esta reunión no tiene nada» para siempre. */
    return { ok: false, error: mensajeDe(err), status: statusDe(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ── BÚSQUEDA EN GOOGLE DRIVE ──────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lee el contenido de un archivo de Drive.
 * Soporta: Google Docs (via Docs API, con su resumen si lo trae) y VTT / texto plano (via export).
 */
async function readDriveFile(userEmail: string, fileId: string, mimeType: string): Promise<LecturaDoc> {
  try {
    if (mimeType === "application/vnd.google-apps.document") return await fetchDocContent(userEmail, fileId);

    // VTT, texto plano u otros → exportar como texto
    const drive = apiDrive({ version: "v3", auth: getImpersonatedAuth(userEmail) });
    const res = await drive.files.export(
      { fileId, mimeType: "text/plain" },
      { responseType: "text" },
    );
    const text = (res.data as string).trim().slice(0, MAX_TRANSCRIPT_CHARS);
    return { ok: true, transcript: text || null, summary: null, diagnostico: null };
  } catch (err) {
    return { ok: false, error: mensajeDe(err), status: statusDe(err) };
  }
}

/**
 * Busca en el Drive del impersonado el material de ESTA reunión. Solo se leen los archivos que
 * `elegirArchivosDeLaReunion` reconoce como suyos (mismo título, misma fecha, no de otra reunión de
 * la serie); si ninguno sirve, la reunión queda sin texto: nunca se cae a un archivo de otra.
 */
async function searchDriveForTranscript(userEmail: string, s: SesionAEnriquecer, otrasFechas: Date[]): Promise<LecturaDoc> {
  const sinResultados = (motivo: string): LecturaDoc => ({
    ok: true,
    transcript: null,
    summary: null,
    diagnostico: { tabsVistos: [], motivo },
  });
  try {
    const query = consultaDeDrive(s.title, s.date);
    if (!query) return sinResultados("drive_sin_keywords");

    const drive = apiDrive({ version: "v3", auth: getImpersonatedAuth(userEmail) });
    const res = await drive.files.list({
      q: query,
      fields: "files(id, name, mimeType, createdTime)",
      pageSize: ARCHIVOS_POR_BUSQUEDA,
      orderBy: "createdTime desc",
    });
    const archivos: ArchivoDeDrive[] = (res.data.files ?? [])
      .filter((f) => f.id && f.name && f.mimeType)
      .map((f) => ({ id: f.id!, name: f.name!, mimeType: f.mimeType!, createdTime: f.createdTime ?? null }));

    const { elegidos, descartados } = elegirArchivosDeLaReunion({ titulo: s.title, fecha: s.date, otrasFechas }, archivos);
    if (descartados.length > 0) {
      console.log(
        `[google/enrich] Drive: «${s.title}» descarta ${descartados.length}: ` +
          descartados.slice(0, 5).map((d) => `«${d.nombre}» (${d.motivo})`).join(", "),
      );
    }
    if (elegidos.length === 0) return sinResultados(archivos.length === 0 ? "drive_sin_resultados" : "drive_sin_archivo_de_la_reunion");

    let fallo: { error: string; status: number | null } | null = null;
    for (const { archivo } of elegidos) {
      const leido = await readDriveFile(userEmail, archivo.id, archivo.mimeType);
      if (!leido.ok) {
        // Un archivo ilegible no corta la búsqueda, pero si NINGUNO se pudo leer, el
        // resultado es un FALLO (reintentable), no un «sin contenido» definitivo.
        fallo = leido;
        continue;
      }
      /* ⚠ Este umbral tiene que ser EL MISMO que el del post-proceso (auditoría 2026-08-11).
         Era `> 100` contra un `MIN_TRANSCRIPT_CHARS = 200`: un archivo de entre 101 y 199 chars
         se aceptaba y se guardaba como transcript, pero INV16(c) —"ningún transcript no-nulo por
         debajo del mínimo"— lo cuenta como basura y el rescate lo vuelve a encolar. La fila
         entraba en un ciclo que no converge nunca: se re-lee, se re-acepta, se re-marca. */
      if (leido.transcript && leido.transcript.trim().length >= MIN_TRANSCRIPT_CHARS) {
        console.log(`[google/enrich] Drive: leyendo «${archivo.name}» para «${s.title}»`);
        return { ok: true, transcript: leido.transcript, summary: leido.summary, diagnostico: null };
      }
    }

    if (fallo) return { ok: false, ...fallo };
    return sinResultados("drive_sin_contenido_util");
  } catch (err) {
    return { ok: false, error: mensajeDe(err), status: statusDe(err) };
  }
}

/** Las otras reuniones con el mismo título alrededor de esta (su serie): deciden de cuál es cada archivo. */
async function fechasDeLaSerie(s: SesionAEnriquecer): Promise<Date[]> {
  const otras = await prisma.firefliesSession.findMany({
    where: {
      id: { not: s.id },
      title: s.title,
      date: { gte: new Date(s.date.getTime() - VENTANA_DE_LA_SERIE_MS), lte: new Date(s.date.getTime() + VENTANA_DE_LA_SERIE_MS) },
    },
    select: { date: true },
  });
  return otras.map((o) => o.date);
}

// ─────────────────────────────────────────────────────────────────────────────
// ── EL NÚCLEO: leer una sesión y escribir el resultado ───────────────────────
// Un solo camino para las dos pasadas, el reintento y el re-enrich individual —
// tener TRES escritores fue lo que dejó divergir el sellado en primer lugar.
// ─────────────────────────────────────────────────────────────────────────────

async function leerSesion(s: SesionAEnriquecer): Promise<LecturaDoc> {
  const candidatos = candidatosImpersonables(s.organizerEmail, s.participants);
  if (candidatos.length === 0) {
    // Reunión 100% externa: no hay cuenta nuestra con la que leer. Fallo DEFINITIVO con
    // procedencia (datosDeEscritura lo sella al primer intento), no un «sin contenido».
    return { ok: false, error: "sin_interno_para_impersonar", status: null };
  }
  /* Se itera ante un fallo de CUENTA (auditoría 2026-08-08): un ex-empleado sigue pasando
     el check de dominio, y clavarse en él sellaba la fila por tope aunque otro invitado
     interno ACTIVO podía leer el mismo doc. Desde el 2026-10-17 también ante un documento sin
     acceso para esa cuenta (403/404) y, en Drive, ante una cuenta sin nada (las notas que tomó
     otro invitado quedan en SU Drive): `probarOtraCuenta`. Tope de 3 cuentas. */
  const buscandoEnDrive = !s.googleDocId;
  const serie = buscandoEnDrive ? await fechasDeLaSerie(s) : [];
  let ultimo: LecturaDoc = { ok: false, error: "sin_candidatos", status: null };
  for (const impersonado of candidatos.slice(0, 3)) {
    ultimo = s.googleDocId
      ? await fetchDocContent(impersonado, s.googleDocId)
      : await searchDriveForTranscript(impersonado, s, serie);
    if (!probarOtraCuenta(ultimo, buscandoEnDrive)) return ultimo;
    console.log(`[google/enrich] «${s.title}»: la cuenta ${impersonado} no la pudo leer — probando la siguiente`);
  }
  return ultimo;
}

type EstadoProceso = { estado: "enriched" | "skipped" | "error"; status: number | null };

/* El mutex de pasada serializa PASADAS; esto serializa SESIONES (ciclo 2 de revisión,
   2026-08-08): el botón por-sesión llama `procesarSesion` sin pasar por aquel mutex, y si
   la sesión estaba en el snapshot de una pasada en vuelo (hasta 240 filas, minutos de
   duración) se duplicaba la lectura a Google, el resumen de IA y el post-proceso — los
   ActionItems no tienen unique en la base y su dedupe pierde esa carrera. */
const sesionesEnVuelo = new Set<string>();

async function procesarSesion(s: SesionAEnriquecer): Promise<EstadoProceso> {
  if (sesionesEnVuelo.has(s.id)) {
    console.log(`[google/enrich] sesión ${s.id} ya en vuelo — skip (mutex por sesión)`);
    return { estado: "skipped", status: null };
  }
  sesionesEnVuelo.add(s.id);
  try {
    /* Candado de FRESCURA (ciclo 3 de revisión): el snapshot de una pasada tiene minutos de
       vida — si OTRO corredor selló la fila desde entonces (el botón la enriqueció mientras
       estaba EN COLA del snapshot), reprocesarla duplica lectura a Google, resumen de IA y
       post-proceso. Regla: sello en la base ≠ sello del snapshot ⇒ otro ya la trabajó, skip.
       El «re-enriquecer» deliberado del botón NO se ve afectado: su fetch es fresco, así que
       base == snapshot y corre. */
    const fresca = await prisma.firefliesSession.findUnique({
      where: { id: s.id },
      select: { enrichedAt: true },
    });
    if (!fresca) return { estado: "skipped", status: null };
    if ((fresca.enrichedAt?.getTime() ?? null) !== (s.enrichedAt?.getTime() ?? null)) {
      console.log(`[google/enrich] sesión ${s.id} sellada por otro corredor desde el snapshot — skip`);
      return { estado: "skipped", status: null };
    }
    return await procesarSesionSinMutex(s);
  } finally {
    sesionesEnVuelo.delete(s.id);
  }
}

async function procesarSesionSinMutex(s: SesionAEnriquecer): Promise<EstadoProceso> {
  const lectura = await leerSesion(s);

  if (!lectura.ok) {
    await prisma.firefliesSession.update({
      where: { id: s.id },
      data: datosDeEscritura(lectura, null, s.enrichAttempts, new Date()),
      // Sin select, Prisma devuelve la fila entera (transcripción incluida) para tirarla (2026-09-21).
      select: { id: true },
    });
    console.log(
      `[google/enrich] ✗ "${s.title}": ${lectura.error} (status ${lectura.status ?? "—"}, intento ${s.enrichAttempts + 1}/${MAX_ENRICH_ATTEMPTS})`,
    );
    return { estado: "error", status: lectura.status };
  }

  // Si hay transcript pero no resumen del doc, generarlo con AI. Si la AI falla, el
  // transcript NO se pierde: se escribe igual y el resumen queda para otra corrida.
  let finalSummary = lectura.summary;
  if (lectura.transcript && !finalSummary) {
    try {
      finalSummary = (await summarizeTranscript(s.title, lectura.transcript)) as typeof finalSummary;
    } catch (err) {
      console.log(`[google/enrich] resumen AI falló para "${s.title}":`, mensajeDe(err));
    }
  }

  // ¿El texto nuevo reemplaza a OTRO? Se compara la huella de lo guardado (md5 en la base: la transcripción vieja no
  // viaja) contra la del texto leído. Volver a leer lo mismo no es un cambio.
  const huellaAntes = lectura.transcript ? await huellaDeLoGuardado(s.id) : null;
  const cambioElTexto = textoCambio(huellaAntes, lectura.transcript);
  // El documento del EVENTO (el correcto) trae solo notas de Gemini y la transcripción guardada es de OTRA reunión (la
  // búsqueda vieja en Drive): se vacía y la lectura se rehace con lo que hay. Una transcripción de esta misma reunión
  // (la de Meet, en otro archivo) no se toca: lo decide su primera línea (lib/sessions/texto-de-otra-reunion.ts).
  const vaciarTranscripcion = !!s.googleDocId && !lectura.transcript && !!lectura.summary && (await transcripcionGuardadaAjena(s));

  const ahora = new Date();
  const datos = datosDeEscritura(lectura, finalSummary ?? null, s.enrichAttempts, ahora, {
    esperarMaterial: debeEsperarMaterial(s, ahora),
    vaciarTranscripcion,
  });
  await prisma.firefliesSession.update({
    where: { id: s.id },
    data: datos,
    // ⚠ Sin select, el UPDATE devuelve la transcripción y el resumen que acaba de escribir: el doble
    // de memoria por sesión, para tirarlo (incidente 2026-09-21).
    select: { id: true },
  });
  if (!datos.enrichedAt) {
    // Todavía no había nada y la reunión terminó hace poco: vuelve con el job de reintentos (2, 4, 8 y 16 horas).
    console.log(`[google/enrich] … «${s.title}»: todavía sin material — se vuelve a mirar (intento ${datos.enrichAttempts}/${MAX_ENRICH_ATTEMPTS})`);
    return { estado: "skipped", status: null };
  }

  /* La lectura de la reunión (memoria de la cuenta, etapa 2): el enriquecimiento SOLO ENCOLA. La lee el job
     `seguimiento-reuniones` (lib/lecturas), con toma atómica, reintentos y presupuesto; la cola decide si corresponde
     (de un cliente o un prospecto, de 14 días o menos, con transcripción). Antes se disparaba el post-proceso sin
     esperarlo, y si fallaba nadie lo reintentaba. Encolar es barato y nunca lanza.
     Con `SEGUIMIENTO_REUNIONES_ENABLED=0` o sin las columnas del SQL, el camino viejo: dispara y olvida.
     Una reunión con SOLO notas de Gemini también se encola (T2, lib/sessions/tiene-texto.ts): la lectura la lee entera,
     o con `SEGUIMIENTO_SOLO_NOTAS=0` deja solo sus hechos (con `SEGUIMIENTO_HECHOS`). El camino viejo no la toca. */
  const esReciente = Date.now() - s.date.getTime() <= DIAS_DE_FRESCURA * 86_400_000;
  const conTranscripcion = !!lectura.transcript && lectura.transcript.trim().length >= MIN_TRANSCRIPT_CHARS;
  const soloNotas = !conTranscripcion && colaTomaSoloNotas(process.env) && claseDeTexto({ summary: finalSummary }) === "solo_notas";
  if (datos.transcript === null) {
    // Se vació la transcripción ajena: lo que dejó la lectura salió de ella. Rehacer o avisar (lib/sessions/reanalizar.ts,
    // que mira si es reciente y si alguien ya trabajó algo).
    console.log(`[google/enrich] «${s.title}»: el documento del evento trae solo notas — se vació la transcripción de otra reunión`);
    const { seguimientoDisponible } = await import("@/lib/lecturas/cola");
    if (seguimientoPrendido(process.env) && (await seguimientoDisponible())) {
      const { alCambiarElTexto } = await import("@/lib/sessions/reanalizar");
      await alCambiarElTexto(s.id, huellaDeTexto(""));
    }
  } else if (esReciente && (conTranscripcion || soloNotas)) {
    const { encolarSeguimiento, seguimientoDisponible } = await import("@/lib/lecturas/cola");
    if (seguimientoPrendido(process.env) && (await seguimientoDisponible())) {
      if (cambioElTexto && lectura.transcript) {
        // El texto cambió y la reunión quizás ya se leyó con el viejo: rehacer o avisar (lib/sessions/reanalizar.ts).
        const { alCambiarElTexto } = await import("@/lib/sessions/reanalizar");
        await alCambiarElTexto(s.id, huellaDeTexto(lectura.transcript));
      } else {
        await encolarSeguimiento(s.id);
      }
    } else if (conTranscripcion) {
      const { postProcessSessionViejo } = await import("@/lib/sessions/post-process-viejo");
      const { conLaReunion } = await import("@/lib/ai/contexto-de-corrida");
      conLaReunion(s.id, () => postProcessSessionViejo(s.id)).catch((err) => {
        console.log(`[google/enrich] post-process falló para ${s.id}:`, mensajeDe(err));
      });
    }
  }

  if (lectura.transcript || finalSummary) {
    console.log(`[google/enrich] ✓ "${s.title}" (${lectura.transcript ? "transcript" : "solo resumen"})`);
    return { estado: "enriched", status: null };
  }
  return { estado: "skipped", status: null };
}

/** La huella (md5) de la transcripción guardada, calculada en la base; null si no hay. */
async function huellaDeLoGuardado(sessionId: string): Promise<string | null> {
  const filas = await prisma.$queryRaw<Array<{ h: string | null }>>`
    SELECT md5(transcript) AS h FROM "FirefliesSession" WHERE id = ${sessionId}`;
  return filas[0]?.h ?? null;
}

/** ¿La transcripción guardada es de OTRA reunión (o no es de una reunión)? Por su primera línea; false si no hay. */
async function transcripcionGuardadaAjena(s: SesionAEnriquecer): Promise<boolean> {
  const filas = await prisma.$queryRaw<Array<{ l1: string | null }>>`
    SELECT left(transcript, 400) AS l1 FROM "FirefliesSession" WHERE id = ${s.id}`;
  const l1 = filas[0]?.l1;
  if (!l1?.trim()) return false;
  return procedenciaDelTexto(s.title, l1).tipo !== "propia";
}

/** Corre un lote con backoff: tras un batch con 429/5xx, duerme antes del siguiente. */
async function correrLote(sesiones: SesionAEnriquecer[], batchSize: number, resultado: EnrichResult) {
  let fallosDeCuota = 0;
  for (let i = 0; i < sesiones.length; i += batchSize) {
    const batch = sesiones.slice(i, i + batchSize);
    const estados = await Promise.all(
      batch.map(async (s) => {
        try {
          return await procesarSesion(s);
        } catch (err) {
          // Red de seguridad: una excepción fuera de la lectura (p.ej. la base) no
          // toca la fila — queda pendiente para la próxima pasada.
          console.log(`[google/enrich] Error sesión ${s.id}:`, mensajeDe(err));
          return { estado: "error", status: null } as EstadoProceso;
        }
      }),
    );
    for (const e of estados) {
      if (e.estado === "enriched") resultado.enriched++;
      else if (e.estado === "skipped") resultado.skipped++;
      else resultado.errors++;
    }
    if (estados.some((e) => esErrorDeCuota(e.status))) {
      fallosDeCuota++;
      const espera = esperaBackoffMs(fallosDeCuota);
      console.log(`[google/enrich] cuota/5xx en el batch — backoff ${espera}ms`);
      await new Promise((r) => setTimeout(r, espera));
    } else {
      fallosDeCuota = 0;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ── FUNCIÓN PRINCIPAL ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enriquece sesiones de Google Meet en dos pasadas:
 *
 * Pasada 1: sesiones con googleDocId adjunto (Gemini Notes del evento de Calendar).
 * Pasada 2: sesiones sin googleDocId — busca en Google Drive del impersonado.
 *
 * Solo toma filas SANAS (`enrichAttempts: 0`) y de reuniones que YA ocurrieron. Lo
 * fallido lo drena `drenarReintentos` con espera exponencial.
 */
/* Mutex de proceso (auditoría 2026-08-08): el botón «Enriquecer» llama esta función DIRECTO,
   sin el claim del auto-sync — dos pasadas concurrentes leen el MISMO snapshot de filas y
   duplican lecturas a Google, resúmenes de IA y post-procesos (ActionItems duplicados: el
   dedupe pierde la carrera). Nexus corre en UN contenedor, así que el flag de módulo alcanza
   para serializar las PASADAS entre sí. El botón POR-SESIÓN no pasa por acá a propósito
   (no debe esperar a una pasada entera): su carrera la cubre `sesionesEnVuelo`. */
let pasadaEnVuelo = false;

export async function enrichGoogleMeetSessions(): Promise<EnrichResult> {
  const resultado: EnrichResult = { enriched: 0, skipped: 0, errors: 0 };
  if (pasadaEnVuelo) {
    console.log("[google/enrich] pasada ya en vuelo — skip (mutex de proceso)");
    return resultado;
  }
  pasadaEnVuelo = true;
  try {
    return await correrPasadas(resultado);
  } finally {
    pasadaEnVuelo = false;
  }
}

async function correrPasadas(resultado: EnrichResult): Promise<EnrichResult> {
  const yaOcurrio = new Date(Date.now() - GRACIA_MS);

  // ── PASADA 1: Sesiones con Google Doc adjunto ────────────────────────────────
  const withDoc = await prisma.firefliesSession.findMany({
    where: {
      source: "google_meet",
      enrichedAt: null,
      enrichAttempts: 0,
      googleDocId: { not: null },
      date: { lt: yaOcurrio },
    },
    select: SELECT_ENRIQUECER,
    orderBy: { date: "desc" },
    take: TOPE_PASADA,
  });

  // La consulta trae lo que empezó hace más de una hora; se lee solo lo que ya terminó (`listaParaLeer`).
  const conDoc = withDoc.filter((s) => listaParaLeer(s, new Date()));
  console.log(
    `[google/enrich] Pasada 1: ${conDoc.length} sesiones con doc adjunto (${withDoc.length - conDoc.length} todavía no terminaron; ` +
      `tope ${TOPE_PASADA}, batches de ${DOC_BATCH})`,
  );
  await correrLote(conDoc, DOC_BATCH, resultado);

  // ── PASADA 2: Sesiones sin doc adjunto → buscar en Drive ─────────────────────
  const withoutDoc = await prisma.firefliesSession.findMany({
    where: {
      source: "google_meet",
      enrichedAt: null,
      enrichAttempts: 0,
      googleDocId: null,
      date: { lt: yaOcurrio },
      // U1: a una cancelada no se le busca el Doc por el título: trae el de otra reunión (KNOWN-ERRORS, primera entrada).
      // La que tiene su Doc adjunto sí se lee (pasada 1): es el de ESE evento, y pudo ocurrir y borrarse después.
      ...SE_LEE_SI_CANCELADA_TIENE_SU_DOC,
    },
    select: SELECT_ENRIQUECER,
    orderBy: { date: "desc" },
    take: TOPE_PASADA,
  });

  const sinDoc = withoutDoc.filter((s) => listaParaLeer(s, new Date()));
  console.log(`[google/enrich] Pasada 2: ${sinDoc.length} sesiones sin doc — buscando en Drive`);
  await correrLote(sinDoc, DRIVE_BATCH, resultado);

  console.log(
    `[google/enrich] Completado: ${resultado.enriched} con contenido, ${resultado.skipped} sin contenido, ${resultado.errors} errores`,
  );
  return resultado;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── EL DRENAJE DE LO FALLIDO ─────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reintenta sesiones FALLIDAS (attempts 1..4) cuya espera exponencial ya venció.
 * Lo llama el job `google-enrich-retry`. Con tope por tick para no competir con las
 * pasadas normales; al 5º fallo `datosDeEscritura` sella con procedencia.
 */
export async function drenarReintentos(limit = 20): Promise<EnrichResult> {
  const resultado: EnrichResult = { enriched: 0, skipped: 0, errors: 0 };
  const ahora = new Date();

  /* TODAS las candidatas, sin ventana (auditoría 2026-08-08): con `take: limit*3` por fecha
     de reunión, las filas en backoff OCUPABAN la ventana y las más viejas ya LISTAS quedaban
     invisibles detrás — el job ocioso con trabajo pendiente.
     Orden por FECHA DE REUNIÓN, no por updatedAt (ciclo 2 de revisión): `updatedAt` parecía
     «la que nadie toca hace más tiempo», pero el sync hace un update INCONDICIONAL sobre
     cada fila existente cada ~20 min — ese orden era en realidad el orden de iteración del
     sync. `date` no lo pisa nadie: la reunión más vieja primero, siempre.
     Y este select va LIVIANO (sin participants ni títulos): tras el rescate las candidatas
     pueden ser miles; lo pesado se trae solo para las `limit` elegidas. */
  const candidatas = await prisma.firefliesSession.findMany({
    where: {
      source: "google_meet",
      enrichedAt: null,
      enrichAttempts: { gte: 1, lt: MAX_ENRICH_ATTEMPTS },
      date: { lt: new Date(ahora.getTime() - GRACIA_MS) },
      // U1: la cancelada sin Doc adjunto sale de la cola (ver la pasada 2); con su Doc, se reintenta como cualquiera.
      ...SE_LEE_SI_CANCELADA_TIENE_SU_DOC,
    },
    select: { id: true, enrichAttempts: true, enrichError: true },
    orderBy: { date: "asc" },
  });

  const idsListos = candidatas
    .filter((c) => esReintentable(c.enrichAttempts, c.enrichError, ahora))
    .slice(0, limit)
    .map((c) => c.id);
  if (idsListos.length === 0) return resultado;

  const listas = await prisma.firefliesSession.findMany({
    where: { id: { in: idsListos } },
    select: SELECT_ENRIQUECER,
    orderBy: { date: "asc" },
  });

  console.log(`[google/enrich] Reintentos: ${listas.length} de ${candidatas.length} candidatas`);
  await correrLote(listas, DOC_BATCH, resultado);
  return resultado;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── ENRIQUECIMIENTO DE SESIÓN INDIVIDUAL ─────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Re-enriquece una sola sesión por ID (el botón manual). Vuelve a leer el material con
 * el MISMO núcleo que las pasadas — un fallo tampoco sella acá: queda con su error y
 * su intento anotados, visible en `enrichError`.
 * Retorna true si se encontró contenido.
 */
export async function enrichSingleSession(sessionId: string): Promise<boolean> {
  const session = await prisma.firefliesSession.findUnique({
    where: { id: sessionId },
    select: SELECT_ENRIQUECER,
  });
  if (!session) return false;
  if (!listaParaLeer(session, new Date(), 0)) {
    // El botón manual tampoco enriquece lo que no ocurrió: sellaría una reunión futura
    // (INV16(a)) y el material ni siquiera existe todavía.
    console.log(`[google/enrich] "${session.title}" todavía no ocurrió — skip`);
    return false;
  }

  // El pedido manual arranca de cero: es la persona diciendo «intentá de nuevo YA».
  const r = await procesarSesion({ ...session, enrichAttempts: 0 });
  const found = r.estado === "enriched";
  console.log(`[google/enrich] Sesión individual "${session.title}": ${found ? "✓ contenido encontrado" : r.estado === "error" ? "✗ fallo la lectura" : "sin contenido"}`);
  return found;
}
