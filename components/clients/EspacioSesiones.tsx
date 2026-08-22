/**
 * EspacioSesiones — lo que se abre al entrar a un ALIADO o a una empresa nuestra.
 *
 * Ni una cosa ni la otra son cartera: no hay proyectos que gestionar ni propuesta que
 * publicar. Lo que sí hay —y es lo único que hay— es **historia de conversación**: las
 * reuniones que tuvimos con ellos. Esta pantalla las mapea.
 *
 * Por ahora solo visualiza (Elías, 2026-08-22). Es el piso sobre el que después se cuelga lo
 * que cada categoría necesite: un canvas de relación con el aliado, un tablero de trabajo
 * interno. El destino lo decide `ESPACIO_POR_CATEGORIA` en `lib/clients/kind.ts`.
 *
 * ⚠ NO CORTA POR FECHA, y es la decisión correcta: es una AGENDA, no contexto para un
 * modelo. Las reuniones futuras se marcan aparte en vez de esconderse — esconderlas es el
 * bug que `lib/sessions/ocurridas.test.ts` documenta (alguien busca una reunión que sabe que
 * existe, no la encuentra, y concluye que Nexus no la tiene). Este archivo está declarado
 * como `agenda` en el censo de ese test.
 */
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { EmptyState } from "@/components/ui";
import { CLIENT_KIND_META } from "@/lib/clients/kind";
import { yaOcurrio } from "@/lib/sessions/ocurridas";
import type { ClientKind } from "@prisma/client";

/** Techo de la lista. Con más que esto la pantalla deja de ser un mapa y pasa a ser un volcado. */
const TECHO = 200;

function formatearFecha(d: Date): string {
  return d.toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatearDuracion(minutos: number): string | null {
  if (!minutos || minutos <= 0) return null;
  const m = Math.round(minutos);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

function FilaDeSesion({
  s,
  futura,
}: {
  s: {
    id: string;
    title: string;
    date: Date;
    duration: number;
    participants: string[];
    tieneTranscripcion: boolean;
  };
  futura: boolean;
}) {
  const duracion = formatearDuracion(s.duration);
  return (
    <Link
      href={`/sessions/${s.id}`}
      className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 hover:border-brand/40 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-fg truncate">{s.title}</p>
        <p className="text-xs text-fg-muted truncate">
          {formatearFecha(s.date)}
          {duracion ? ` · ${duracion}` : ""}
          {s.participants.length > 0
            ? ` · ${s.participants.length} participante${s.participants.length !== 1 ? "s" : ""}`
            : ""}
        </p>
      </div>
      {/* Que una reunión no tenga transcripción no es un error: puede no haberse grabado.
          Se dice, porque es lo que explica por qué de esa reunión no se puede sacar nada. */}
      {!futura && !s.tieneTranscripcion && (
        <span
          className="flex-shrink-0 text-[11px] px-2 py-1 rounded border border-line text-fg-muted"
          title="Nexus no tiene la transcripción de esta reunión: no se grabó, o el documento de Meet no se pudo leer."
        >
          Sin transcripción
        </span>
      )}
      {futura && (
        <span className="flex-shrink-0 text-[11px] px-2 py-1 rounded border border-success-line bg-success-surface text-success-ink">
          Agendada
        </span>
      )}
    </Link>
  );
}

export default async function EspacioSesiones({
  clientId,
  clientName,
  kind,
}: {
  clientId: string;
  clientName: string;
  kind: ClientKind;
}) {
  /* Las DOS formas de que una reunión sea de esta empresa: la atribución materializada
     (`resolvedClientId`, la cascada de lib/sessions/resolve-client.ts) y el override que
     alguien puso a mano (`manualClientId`). Pedir solo la primera dejaba afuera justo las
     que un humano tuvo que rescatar — que en un aliado son la mayoría, porque el dominio
     de correo de un partner no matchea con nada. */
  const sesiones = await prisma.firefliesSession.findMany({
    where: { OR: [{ resolvedClientId: clientId }, { manualClientId: clientId }] },
    orderBy: { date: "desc" },
    take: TECHO,
    select: {
      id: true,
      title: true,
      date: true,
      duration: true,
      participants: true,
    },
  });

  /* El BLOB de la transcripción no viaja nunca —con ~16k filas es el peso dominante de
     /sessions y acá sería igual—: solo cruzan los ids de las que la tienen. Y se pregunta por
     `transcript` y no por `enrichedAt`, que es cuándo se INTENTÓ traerla: el sellado viejo
     marcaba antes de tiempo, así que `enrichedAt` habría dicho "tiene" sobre reuniones vacías.

     El total va aparte para poder decir si el techo recortó: un listado que muestra 200 de
     340 sin decirlo se lee como "hay 200". */
  const ids = sesiones.map((s) => s.id);
  const [conTranscripcion, total] = await Promise.all([
    prisma.firefliesSession.findMany({
      where: { id: { in: ids }, transcript: { not: null } },
      select: { id: true },
    }),
    prisma.firefliesSession.count({
      where: { OR: [{ resolvedClientId: clientId }, { manualClientId: clientId }] },
    }),
  ]);
  const tienen = new Set(conTranscripcion.map((s) => s.id));

  /* `yaOcurrio` es el mismo predicado que usan los lectores de contexto, pero acá SEPARA en
     vez de descartar: la agenda se pinta en su propio bloque y no desaparece. Usar el helper
     y no un `>` a mano es lo que evita que dos pantallas discrepen sobre qué es "hoy". */
  const ahora = new Date();
  const filas = sesiones.map((s) => ({
    id: s.id,
    title: s.title,
    date: s.date,
    duration: s.duration,
    participants: s.participants,
    tieneTranscripcion: tienen.has(s.id),
    ocurrio: yaOcurrio(s.date, ahora),
  }));
  const futuras = filas.filter((s) => !s.ocurrio).reverse(); // la más próxima primero
  const pasadas = filas.filter((s) => s.ocurrio);

  const meta = CLIENT_KIND_META[kind];

  return (
    <div className="px-6 py-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-fg">Reuniones</h2>
        <p className="text-xs text-fg-muted mt-0.5">
          {total === 0
            ? `Todavía no hay ninguna reunión mapeada con ${clientName}.`
            /* «reunión» pierde la tilde en plural: pegarle "es" da «reuniónes». Se escriben
               las dos formas en vez de derivar una de la otra. */
            : `${total} ${total === 1 ? "reunión" : "reuniones"} con ${clientName}` +
              (total > TECHO ? ` · se muestran las ${TECHO} más recientes` : "")}
          {" · "}
          <span title={meta.help} className="cursor-help underline decoration-dotted">
            {meta.label}
          </span>
        </p>
      </div>

      {total === 0 ? (
        <EmptyState
          variant="dashed"
          title="Sin reuniones mapeadas"
          description={
            "Las reuniones se atribuyen solas por el dominio de correo de quienes asisten. Si " +
            "sabés que hubo reuniones con esta empresa y no aparecen acá, se les puede asignar " +
            "la empresa a mano desde el detalle de cada una, en Reuniones."
          }
          action={
            <Link
              href="/sessions"
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 bg-brand/15 text-brand hover:bg-brand/25 transition-colors"
            >
              Ir a Reuniones
            </Link>
          }
        />
      ) : (
        <div className="space-y-5">
          {/* La agenda va ARRIBA y separada: mezclarla con el historial en un solo orden
              descendente pone lo que todavía no pasó donde la vista busca lo último que pasó. */}
          {futuras.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                Agendadas ({futuras.length})
              </h3>
              {futuras.map((s) => (
                <FilaDeSesion key={s.id} s={s} futura />
              ))}
            </section>
          )}
          <section className="space-y-2">
            {futuras.length > 0 && (
              <h3 className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                Historial ({pasadas.length})
              </h3>
            )}
            {pasadas.map((s) => (
              <FilaDeSesion key={s.id} s={s} futura={false} />
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
