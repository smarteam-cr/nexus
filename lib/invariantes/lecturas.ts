/**
 * lib/invariantes/lecturas.ts — los invariantes de la LECTURA DE SEGUIMIENTO de cada reunión (memoria de la cuenta,
 * etapa 2; DECISIONS «La lectura de cada reunión es durable…»).
 *
 * El post-proceso viejo se disparaba sin esperar resultado y, si fallaba, nadie lo reintentaba: una reunión podía
 * quedarse sin minuta ni compromisos sin que nada lo dijera. Con la cola, toda reunión fresca de un cliente o un
 * prospecto termina en un estado de la lectura; INV44 vigila que ninguna se quede afuera. INV46 vigila lo que dejó: un
 * pedido fuera de alcance no puede quedar en un cliente que no es el dueño de su reunión (el gemelo de INV42 para las
 * tareas). INV45, el de los hechos de la etapa 6, vive en lib/invariantes/hechos.ts.
 */
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { DIAS_DE_FRESCURA, ESTADOS_QUE_CUENTAN, SQL_DEL_SEGUIMIENTO, colaTomaSoloNotas } from "@/lib/lecturas/reglas";
import { DONDE_PUEDE_TENER_TEXTO, claseDeTexto } from "@/lib/sessions/tiene-texto";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";
import { esReunionDePuertasAdentro } from "@/lib/sessions/candidatas-internas";
import { cumple, viola, type Invariante } from "./contrato";

const DIA_MS = 86_400_000;
const HORAS_PARA_LEERLA = 24;
const KINDS_QUE_SE_LEEN = new Set(["CLIENTE", "PROSPECTO"]);
const lista = (xs: string[], max = 8) => xs.slice(0, max).map((x) => `    · ${x}`).join("\n") + (xs.length > max ? `\n    · y ${xs.length - max} más` : "");
const dia = (d: Date) => new Date(d).toISOString().slice(0, 10);

/** Qué hacer cuando INV44 se pone en rojo (lo dicen el invariante y el RUNBOOK). */
export const REMEDIO_DE_INV44 =
  "Remedio: mirar el job «La lectura de cada reunión» (seguimiento-reuniones) en Integraciones; una por una, «Leer esta reunión» en su página (/sessions/<id>); varias a la vez, scripts/encolar-lecturas-pendientes.ts (en seco primero).";

/**
 * INV44 · Toda reunión con un CLIENTE o un PROSPECTO, de 14 días o menos, enriquecida hace más de 24 h y con
 * texto (transcripción o, si la cola las toma, solo notas de Gemini: lib/sessions/tiene-texto.ts), que NO es de puertas adentro (todos los que estuvieron son de la casa: esa no la lee el seguimiento),
 * tiene su lectura de seguimiento (lista, sin texto, copia o error) O su minuta. La minuta cubre la transición y la
 * bandera apagada (el post-proceso viejo deja minuta y no toca la cola). Una en `error` cuenta: la señal es el job, que
 * se pone en rojo el tick en que llega ahí.
 */
export const INV44: Invariante = {
  id: "44",
  nombre: "cada reunión reciente de un cliente o un prospecto tiene su lectura",
  async correr(db, ahora) {
    const desde = new Date(+ahora - DIAS_DE_FRESCURA * DIA_MS);
    const enriquecidaAntesDe = new Date(+ahora - HORAS_PARA_LEERLA * 3_600_000);
    const candidatas = (
      await db.firefliesSession.findMany({
        where: {
          date: { gte: desde, lte: ahora },
          enrichedAt: { not: null, lte: enriquecidaAntesDe },
          OR: [{ resolvedClientId: { not: null } }, { manualClientId: { not: null } }],
          AND: [DONDE_PUEDE_TENER_TEXTO],
        },
        select: { id: true, title: true, date: true, enrichedAt: true, resolvedClientId: true, manualClientId: true, participants: true, organizerEmail: true },
      })
    ).filter((s) => +s.date >= +desde && +s.date <= +ahora && !!s.enrichedAt && +s.enrichedAt <= +enriquecidaAntesDe);
    if (!candidatas.length) return cumple("✓ INV44: no hay reuniones recientes de clientes o prospectos que esperen su lectura.");

    // Las de puertas adentro no las lee el seguimiento (misma regla que la cola y la tarjeta): no se esperan.
    const dominios = buildInternalDomainsSet(await db.sessionCategory.findMany({ select: { domains: true, kind: true } }));
    const deAfuera = candidatas.filter((s) => !esReunionDePuertasAdentro({ participants: s.participants ?? [], organizerEmail: s.organizerEmail ?? null }, dominios));
    if (!deAfuera.length) return cumple("✓ INV44: no hay reuniones recientes de clientes o prospectos que esperen su lectura.");

    // El dueño, con la precedencia del chokepoint (`duenoDeLaSesion`): resolvedClientId; el manual, solo si no hay.
    const duenoDe = (s: { resolvedClientId: string | null; manualClientId: string | null }) => s.resolvedClientId ?? s.manualClientId ?? null;
    const ids = [...new Set(deAfuera.map(duenoDe).filter((x): x is string => !!x))];
    const kinds = new Map((await db.client.findMany({ where: { id: { in: ids } }, select: { id: true, kind: true } })).map((c) => [c.id, String(c.kind)]));
    const deClientes = deAfuera.filter((s) => KINDS_QUE_SE_LEEN.has(kinds.get(duenoDe(s) ?? "") ?? ""));
    if (!deClientes.length) return cumple("✓ INV44: no hay reuniones recientes de clientes o prospectos que esperen su lectura.");

    const sesionIds = deClientes.map((s) => s.id);
    const conMinuta = new Set((await db.sessionMinute.findMany({ where: { sessionId: { in: sesionIds } }, select: { sessionId: true } })).map((m) => m.sessionId));
    let sinLasColumnas = false;
    let leidas = new Set<string>();
    try {
      const filas = await db.lecturaDeReunion.findMany({
        where: { sessionId: { in: sesionIds }, seguimientoEstado: { in: [...ESTADOS_QUE_CUENTAN] } },
        select: { sessionId: true, seguimientoEstado: true },
      });
      leidas = new Set(filas.filter((f) => !!f.sessionId && (ESTADOS_QUE_CUENTAN as readonly string[]).includes(f.seguimientoEstado ?? "")).map((f) => f.sessionId!));
    } catch (e) {
      // Falta la tabla o la columna (el SQL de Tareas o el de la cola): se mira solo la minuta.
      if (!esquemaDesactualizado(e)) throw e;
      sinLasColumnas = true;
    }
    const pendientes = deClientes.filter((s) => !conMinuta.has(s.id) && !leidas.has(s.id));

    // El texto tiene que ser de verdad (el predicado único). Se trae SOLO para las que quedan, de a 50. Las de solo notas
    // se esperan si la cola las toma (`colaTomaSoloNotas`): con las dos banderas apagadas, nadie las lee.
    const conNotas = colaTomaSoloNotas(process.env);
    const clases = new Map<string, string>();
    for (let i = 0; i < pendientes.length; i += 50) {
      const tanda = pendientes.slice(i, i + 50).map((s) => s.id);
      const filas = await db.firefliesSession.findMany({ where: { id: { in: tanda } }, select: { id: true, transcript: true, summary: true } });
      for (const f of filas) if (tanda.includes(f.id)) clases.set(f.id, claseDeTexto(f));
    }
    const sinLectura = pendientes.filter((s) => clases.get(s.id) === "transcripcion" || (conNotas && clases.get(s.id) === "solo_notas"));
    const nota = sinLasColumnas ? ` (sin las columnas de la cola —falta ${SQL_DEL_SEGUIMIENTO}—: se mira solo la minuta)` : "";

    if (sinLectura.length) {
      return viola(
        `✗ INV44 VIOLADO: ${sinLectura.length} reunión(es) de clientes o prospectos, de ${DIAS_DE_FRESCURA} días o menos y con texto, sin su lectura a las ${HORAS_PARA_LEERLA} h${nota}.\n` +
          `${lista(sinLectura.map((s) => `«${s.title}» (${s.id}), ${dia(s.date)}`))}\n` +
          `    ${REMEDIO_DE_INV44}`,
      );
    }
    return cumple(`✓ INV44: las ${deClientes.length} reunión(es) recientes de clientes o prospectos tienen su lectura${nota}.`);
  },
};

/**
 * INV46 · Ningún pedido fuera de alcance (vivo: todo menos DESCARTADO) queda en un cliente que no es el dueño de la
 * reunión de donde salió. Es INV42 llevada a los pedidos: si el dueño de una reunión ya leída se corrige después (en
 * /sessions), la reunión no se vuelve a leer y lo que dejó queda con el cliente anterior; esto lo muestra. Una reunión
 * de Smarteam no cuenta. Remedio: revisar el dueño en /sessions; si está bien, descartar el pedido en «Fuera de alcance»
 * del cliente equivocado.
 */
export const INV46: Invariante = {
  id: "46",
  nombre: "ningún pedido fuera de alcance de una reunión de otro cliente",
  async correr(db) {
    const conReunion = await db.pedidoFueraDeAlcance.findMany({
      where: { sessionId: { not: null }, estado: { not: "DESCARTADO" } },
      select: { id: true, clientId: true, pedido: true, estado: true, session: { select: { title: true, resolvedClientId: true, manualClientId: true } } },
    });
    const duenoDe = (s: { resolvedClientId: string | null; manualClientId: string | null } | null) => s?.resolvedClientId ?? s?.manualClientId ?? null;
    const duenos = [...new Set(conReunion.map((p) => duenoDe(p.session)).filter((x): x is string => !!x))];
    const internos = new Set((duenos.length ? await db.client.findMany({ where: { id: { in: duenos }, kind: "INTERNO" }, select: { id: true } }) : []).map((c) => c.id));
    const malos = conReunion
      .filter((p) => p.estado !== "DESCARTADO")
      .filter((p) => {
        const dueno = duenoDe(p.session);
        return !!dueno && !internos.has(dueno) && dueno !== p.clientId;
      })
      .map((p) => `«${p.pedido.slice(0, 80)}» (${p.id}): de «${p.session?.title ?? "una reunión"}», que es de otro cliente`);
    if (malos.length) {
      return viola(
        `✗ INV46 VIOLADO: ${malos.length} pedido(s) fuera de alcance de una reunión de otro cliente.\n${lista(malos)}\n` +
          "    Remedio: revisar el dueño de la reunión en /sessions; si está bien, descartar el pedido en «Fuera de alcance» del cliente equivocado.",
      );
    }
    return cumple(`✓ INV46: ningún pedido fuera de alcance de una reunión de otro cliente (${conReunion.length} con reunión).`);
  },
};
