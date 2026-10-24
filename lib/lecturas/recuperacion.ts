/**
 * lib/lecturas/recuperacion.ts — EL MODO DE RECUPERACIÓN de la lectura de reuniones (T2, 2026-10-24). SERVIDOR.
 *
 * Lo atrasado: las reuniones de más de 14 días (`DIAS_DE_FRESCURA`) con texto —transcripción o solo notas de Gemini— que
 * nunca se leyeron (sin minuta). Medido el 2026-10-23: 301 con solo notas en 90 días, 285 de ellas de las empresas
 * activas. La cola de siempre no las toma (las corta por viejas, y con razón: propondría tareas de agosto).
 *
 * Cómo se leen (docs/reuniones-pieza-angular-plan.md › «Cómo se trae lo que ya existe»):
 *   · minuta y temas, SIN propuestas de Tarea, pedidos fuera de alcance ni lo que sigue (lib/sessions/post-process.ts,
 *     `pedidoDeRecuperacion` y `aplicarRecuperacion`);
 *   · por la API de lotes (lib/ai/lotes-server.ts, tipo `lectura-recuperacion`), a mitad de precio, FUERA del
 *     presupuesto automático diario: las encola una persona, con su tope por corrida, y su gasto
 *     se anota a nombre de quien la corre y cuenta en el presupuesto HUMANO del día (el que comparte todo el equipo, US$20);
 *   · por empresas activas (con un proyecto de cartera o una preventa viva) salvo que se pidan todas: las demás se leen
 *     cuando alguien las abre o les llega una reunión nueva;
 *   · `LECTURA_DE_RECUPERACION=0` es la vuelta atrás (no encola, y lo que espera en el lote no se manda); lo leído queda.
 *
 * Los hechos de estas reuniones NO se leen acá: el enrutador de los hechos no distingue una reunión vieja, y mandaría
 * avance, etapa, alertas y novedades de hace meses como si fueran de hoy. Queda declarado en «Para el roadmap».
 *
 * Lo corre `scripts/encolar-lecturas-pendientes.ts --recuperacion` (en seco primero, con el costo estimado del lote).
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { encolarEnLote } from "@/lib/ai/lotes-server";
import { ESTADOS_VIVOS } from "@/lib/ai/lotes";
import type { ManejadorDeLote } from "@/lib/ai/lotes-manejadores";
import { costoDeLlamada } from "@/lib/ai/precios";
import { proyectoDeCarteraWhere } from "@/lib/projects/scope";
import { esReunionDePuertasAdentro } from "@/lib/sessions/candidatas-internas";
import { dominiosDeLaCasa } from "@/lib/sessions/reuniones-para-seguimiento";
import { sqlClaseDeTexto, type ClaseDeTexto } from "@/lib/sessions/tiene-texto";
import { TOPE_DE_LA_TRANSCRIPCION } from "@/lib/sessions/lectura-salida";
import { aplicarRecuperacion, pedidoDeRecuperacion, type ContextoDeLaRecuperacion } from "@/lib/sessions/post-process";
import { DIAS_DE_FRESCURA, TOPE_DE_LA_RECUPERACION, recuperacionPrendida, soloNotasPrendido } from "./reglas";

const DIA_MS = 86_400_000;

/** El modelo de la lectura y lo que se estima que escribe (la minuta sola: medido, la lectura entera promedia ~2.000). */
const MODELO = "claude-sonnet-4-6";
const SALIDA_ESTIMADA = 1_500;
/** Caracteres por token del español con los títulos de la lectura (estimación: el costo real sale del medidor). */
const CARACTERES_POR_TOKEN = 3.5;

export interface CandidataDeRecuperacion {
  sessionId: string;
  titulo: string;
  fecha: Date;
  clientId: string;
  empresa: string;
  clase: Exclude<ClaseDeTexto, "nada">;
  /** El largo del texto que se mandaría (transcripción o notas). */
  caracteres: number;
}

export interface OpcionesDeLaRecuperacion {
  /** Desde qué fecha (inclusive). */
  desde: Date;
  /** Cuántas como mucho (nunca más que `TOPE_DE_LA_RECUPERACION`). */
  limite: number;
  /** false = todas las empresas; por defecto, solo las activas. */
  soloActivas?: boolean;
  ahora?: Date;
}

/** Lo que no entra, con su cuenta (para el simulacro). */
export interface FueraDeLaRecuperacion {
  puertasAdentro: number;
  copias: number;
  enCurso: number;
  noActivas: number;
  /** Ya se intentó `MAX_INTENTOS_DE_RECUPERACION` veces sin que quedara la minuta: no se vuelve a pagar sola. */
  agotadas: number;
}

/**
 * Cuántas veces se manda como mucho la recuperación de una reunión. Un pedido que vuelve sin minuta (la respuesta se
 * cortó, el lote venció, la reunión cambió de dueño, la recuperación se apagó mientras esperaba) se puede volver a mandar
 * en otra corrida, con otro número de intento en su clave; a la tercera, no.
 */
export const MAX_INTENTOS_DE_RECUPERACION = 3;

/**
 * Las reuniones que la recuperación leería, las más nuevas primero: de más de 14 días y desde `desde`, de un cliente o
 * un prospecto, con texto, sin minuta, sin una lectura en curso ni un pedido vivo en el lote, sin tres intentos fallidos,
 * no de puertas adentro, y sin otra fila con el mismo texto que ya tenga minuta o un pedido en camino (la misma reunión
 * en dos series del calendario se lee una vez, también entre dos corridas seguidas).
 */
export async function candidatasDeRecuperacion(o: OpcionesDeLaRecuperacion): Promise<{
  candidatas: CandidataDeRecuperacion[];
  fuera: FueraDeLaRecuperacion;
  total: number;
  /** Todas las que entran en el periodo (no solo las del límite), para estimar el costo de traer todo. */
  todas: Pick<CandidataDeRecuperacion, "clase" | "caracteres">[];
}> {
  const ahora = o.ahora ?? new Date();
  const hasta = new Date(+ahora - DIAS_DE_FRESCURA * DIA_MS);
  const limite = Math.max(1, Math.min(o.limite, TOPE_DE_LA_RECUPERACION));
  const clases = soloNotasPrendido(process.env) ? ["transcripcion", "solo_notas"] : ["transcripcion"];
  const filas = await prisma.$queryRaw<
    { id: string; title: string; date: Date; participants: string[]; organizerEmail: string | null; dueno: string; empresa: string; clase: ClaseDeTexto; caracteres: number; huella: string | null; copiaLeida: boolean; enCurso: boolean; intentos: number }[]
  >`
    SELECT x.* FROM (
      SELECT s."id", s."title", s."date", s."participants", s."organizerEmail",
        coalesce(s."resolvedClientId", s."manualClientId") AS "dueno",
        c."name" AS "empresa",
        ${sqlClaseDeTexto("s")} AS "clase",
        greatest(length(btrim(coalesce(s."transcript", ''))), length(btrim(coalesce(s."summary"->>'overview', ''))))::int AS "caracteres",
        ${huellaSql("s")} AS "huella",
        EXISTS (
          SELECT 1 FROM "FirefliesSession" o
          WHERE o."id" <> s."id" AND ${huellaSql("o")} = ${huellaSql("s")}
            AND (
              EXISTS (SELECT 1 FROM "SessionMinute" om WHERE om."sessionId" = o."id")
              OR EXISTS (
                SELECT 1 FROM "PedidoEnLote" op
                WHERE op."tipo" = ${TIPO} AND op."contexto"->>'sessionId' = o."id" AND op."estado" IN (${Prisma.join([...ESTADOS_VIVOS])})
              )
            )
        ) AS "copiaLeida",
        EXISTS (
          SELECT 1 FROM "LecturaDeReunion" l WHERE l."sessionId" = s."id" AND l."seguimientoEstado" IN ('en_espera', 'leyendo')
        ) OR EXISTS (
          SELECT 1 FROM "PedidoEnLote" p WHERE p."tipo" = ${TIPO} AND p."contexto"->>'sessionId' = s."id" AND p."estado" IN (${Prisma.join([...ESTADOS_VIVOS])})
        ) AS "enCurso",
        (SELECT count(*) FROM "PedidoEnLote" p WHERE p."tipo" = ${TIPO} AND p."contexto"->>'sessionId' = s."id")::int AS "intentos"
      FROM "FirefliesSession" s
      JOIN "Client" c ON c."id" = coalesce(s."resolvedClientId", s."manualClientId")
      WHERE s."date" >= ${o.desde} AND s."date" < ${hasta}
        AND s."enrichedAt" IS NOT NULL
        AND c."kind" IN ('CLIENTE', 'PROSPECTO')
        AND NOT EXISTS (SELECT 1 FROM "SessionMinute" m WHERE m."sessionId" = s."id")
    ) x
    WHERE x."clase" IN (${Prisma.join(clases)})
    ORDER BY x."date" DESC`;

  const activas = o.soloActivas === false ? null : await empresasActivas();
  const dominios = await dominiosDeLaCasa();
  const fuera: FueraDeLaRecuperacion = { puertasAdentro: 0, copias: 0, enCurso: 0, noActivas: 0, agotadas: 0 };
  const huellas = new Set<string>();
  const candidatas: CandidataDeRecuperacion[] = [];
  const todas: Pick<CandidataDeRecuperacion, "clase" | "caracteres">[] = [];
  for (const f of filas) {
    if (activas && !activas.has(f.dueno)) {
      fuera.noActivas++;
      continue;
    }
    if (f.enCurso) {
      fuera.enCurso++;
      continue;
    }
    if (f.intentos >= MAX_INTENTOS_DE_RECUPERACION) {
      fuera.agotadas++;
      continue;
    }
    if (esReunionDePuertasAdentro({ participants: f.participants, organizerEmail: f.organizerEmail }, dominios)) {
      fuera.puertasAdentro++;
      continue;
    }
    const clave = f.huella;
    if (f.copiaLeida || (clave && huellas.has(clave))) {
      fuera.copias++;
      continue;
    }
    if (clave) huellas.add(clave);
    const clase = f.clase === "solo_notas" ? "solo_notas" : "transcripcion";
    todas.push({ clase, caracteres: f.caracteres });
    if (candidatas.length < limite) {
      candidatas.push({ sessionId: f.id, titulo: f.title, fecha: f.date, clientId: f.dueno, empresa: f.empresa, clase, caracteres: f.caracteres });
    }
  }
  return { candidatas, fuera, total: todas.length, todas };
}

/** Las empresas activas: con un proyecto de cartera (activo, de HubSpot, no de prueba) o una preventa viva. */
export async function empresasActivas(): Promise<Set<string>> {
  const filas = await prisma.client.findMany({
    where: {
      kind: { in: ["CLIENTE", "PROSPECTO"] },
      OR: [{ projects: { some: proyectoDeCarteraWhere() } }, { exploracionesDeVenta: { some: { projectId: null, archivadaEn: null } } }],
    },
    select: { id: true },
  });
  return new Set(filas.map((f) => f.id));
}

/** El costo estimado de leer una reunión por lote (USD), desde el largo del pedido. */
export function costoEstimadoPorLote(caracteresDelPedido: number): number {
  return costoDeLlamada(MODELO, { inputTokens: Math.ceil(caracteresDelPedido / CARACTERES_POR_TOKEN), outputTokens: SALIDA_ESTIMADA }, { lote: true }) ?? 0;
}

/**
 * El largo de un pedido sin armarlo (para el simulacro): el prompt del agente, la cabecera de la lectura (~2.500 con el
 * equipo) y el texto, con el tope de la lectura.
 */
export function caracteresEstimados(c: Pick<CandidataDeRecuperacion, "caracteres">, largoDelPrompt: number): number {
  return largoDelPrompt + 2_500 + Math.min(c.caracteres, TOPE_DE_LA_TRANSCRIPCION);
}

const TIPO = "lectura-recuperacion";
const CLAVE_PREFIJO = `${TIPO}:`;

/**
 * La huella del texto en SQL, propia de la recuperación: la transcripción, o si no las notas, sin mayúsculas y con los
 * espacios juntados, en md5. Iguala la misma reunión en dos series del calendario, o en dos fichas de la empresa, sin
 * importar el dueño. ⚠ NO es la de la cola (`huella`, lib/sessions/reuniones-para-tareas.ts → `LecturaDeReunion.huellaTexto`):
 * se calcula distinto y para la misma reunión da otro valor. Solo se comparan huellas de esta función entre sí; cruzarla
 * con la columna de la cola no reconocería la reunión y la leería dos veces.
 */
/** Los espacios, con la clase POSIX: sin barras que se pierdan entre la plantilla y Postgres. */
const ESPACIOS = "[[:space:]]+";
function huellaSql(alias: "s" | "o"): Prisma.Sql {
  const t = Prisma.raw(`"${alias}"`);
  return Prisma.sql`md5(lower(btrim(regexp_replace(coalesce(nullif(btrim(${t}."transcript"), ''), ${t}."summary"->>'overview', ''), ${ESPACIOS}, ' ', 'g'))))`;
}

/** La clave del pedido: la reunión y el número de intento (`lectura-recuperacion:<id>:<n>`). */
export const claveDelIntento = (sessionId: string, intento: number) => `${CLAVE_PREFIJO}${sessionId}:${intento}`;

export type ResultadoDeEncolarRecuperacion = { sessionId: string; estado: "encolada" | "ya_estaba" | "sin_tabla" | "apagada" | string; costoEstimado?: number };

/**
 * Encola en el lote la lectura de recuperación de cada reunión (arma el pedido con lo que hay hoy). `quien` es la persona
 * que corre la recuperación: su gasto se anota a su nombre (presupuesto HUMANO del día, el que comparte todo el equipo).
 * NUNCA lanza por una reunión: dice por qué no entró.
 */
export async function encolarRecuperacion(sessionIds: readonly string[], quien: string | null): Promise<ResultadoDeEncolarRecuperacion[]> {
  if (!recuperacionPrendida(process.env)) return sessionIds.map((sessionId) => ({ sessionId, estado: "apagada" }));
  const salida: ResultadoDeEncolarRecuperacion[] = [];
  for (const sessionId of sessionIds.slice(0, TOPE_DE_LA_RECUPERACION)) {
    try {
      // Los intentos anteriores: uno vivo no se duplica; tres sin minuta, no se vuelven a pagar.
      const anteriores = await prisma.pedidoEnLote.findMany({
        where: { tipo: TIPO, contexto: { path: ["sessionId"], equals: sessionId } },
        select: { estado: true },
      });
      if (anteriores.some((a) => (ESTADOS_VIVOS as readonly string[]).includes(a.estado))) {
        salida.push({ sessionId, estado: "ya_estaba" });
        continue;
      }
      if (anteriores.length >= MAX_INTENTOS_DE_RECUPERACION) {
        salida.push({ sessionId, estado: "agotada" });
        continue;
      }
      const p = await pedidoDeRecuperacion(sessionId, quien);
      if (!p.ok) {
        salida.push({ sessionId, estado: p.motivo });
        continue;
      }
      const r = await encolarEnLote({
        tipo: TIPO,
        claveUnica: claveDelIntento(sessionId, anteriores.length + 1),
        pedido: p.pedido,
        contexto: p.contexto,
        agentSlug: "agent-post-session",
        clientId: p.contexto.clientId,
        projectId: p.contexto.projectId,
      });
      salida.push({ sessionId, estado: r === "encolado" ? "encolada" : r, costoEstimado: costoEstimadoPorLote(p.caracteres) });
    } catch (e) {
      salida.push({ sessionId, estado: `error: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return salida;
}

/** Lo que hace el job «ia-lotes» con la respuesta de una lectura de recuperación (lib/ai/lotes-manejadores.ts). */
export const manejadorDeLaRecuperacion: ManejadorDeLote = {
  quienPidio: (contexto) => (contexto as Partial<ContextoDeLaRecuperacion> | null)?.quien ?? null,
  async aplicar({ contexto, mensaje }) {
    const c = contexto as ContextoDeLaRecuperacion;
    // Apagada mientras el lote esperaba: lo que volvió no se escribe (la llamada igual se anota: se pagó).
    if (!recuperacionPrendida(process.env)) {
      console.log(`[lecturas] recuperación apagada: no se escribe la lectura de ${c.sessionId}`);
      return { agentRunId: null };
    }
    const r = await aplicarRecuperacion(c, mensaje);
    if (r.motivo) console.log(`[lecturas] la recuperación de ${c.sessionId} no escribió nada: ${r.motivo}`);
    return { agentRunId: r.agentRunId };
  },
};
