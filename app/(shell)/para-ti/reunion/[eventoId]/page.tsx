/**
 * /para-ti/reunion/[eventoId]?cliente=… — el resumen de una cuenta antes de una reunión (etapa 4c de
 * docs/mi-dia-plan.md). Se abre con «Preparar» desde la agenda de «Para ti».
 *
 * Sin IA: cada bloque sale de su lugar y dice de dónde salió (la invitación, la última reunión, Tareas, el siguiente
 * paso, HubSpot). Pide acceso al cliente; sin acceso, 404. El evento se lee del calendario de quien lo abre.
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAccessToClient } from "@/lib/auth/access";
import { ForbiddenError, requireInternalUser, UnauthorizedError } from "@/lib/auth/supabase";
import { getEffectivePermissions } from "@/lib/auth/permissions/engine";
import { esLiderDeCs } from "@/lib/cs/acceso";
import { PageHeader } from "@/components/ui";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { ENLACE_BLANCO } from "@/components/carga/piezas";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { cn } from "@/lib/cn";
import { resumenParaLaReunion, type ResumenDeLaReunion } from "@/lib/mi-dia/resumen-server";
import { NOMBRE_DEL_EQUIPO } from "@/lib/siguiente-paso/reglas";
import BuscarEnReuniones, { FraseDeReunion } from "@/components/busqueda/BuscarEnReuniones";

export const dynamic = "force-dynamic";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const cr = (iso: string) => new Date(new Date(iso).getTime() - 6 * 3_600_000);
const fecha = (iso: string) => `${cr(iso).getUTCDate()} ${MESES[cr(iso).getUTCMonth()]}`;
const hora = (iso: string) => cr(iso).toISOString().slice(11, 16);
const dia = (ymd: string) => `${Number(ymd.slice(8, 10))} ${MESES[Number(ymd.slice(5, 7)) - 1]}`;

const POR_QUE_SIN_EVENTO: Record<string, string> = {
  "sin-google": "La agenda de Google no está configurada en este servidor.",
  "sin-permiso": "Nexus no pudo leer tu calendario.",
  error: "Tu calendario no se pudo leer ahora.",
  cancelado: "La reunión se canceló en el calendario.",
  noExiste: "La reunión ya no está en tu calendario.",
  "sin-evento": "",
};

export default async function PrepararLaReunion({
  params,
  searchParams,
}: {
  params: Promise<{ eventoId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");
  const { eventoId } = await params;
  const sp = await searchParams;
  const clientId = Array.isArray(sp.cliente) ? sp.cliente[0] : sp.cliente;
  if (!clientId) notFound();
  try {
    await requireAccessToClient(clientId);
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof UnauthorizedError) notFound();
    throw e;
  }
  const permisos = await getEffectivePermissions(ctx.teamMember);
  const r = await resumenParaLaReunion({
    clientId,
    eventoId: decodeURIComponent(eventoId),
    email: ctx.teamMember.email,
    veAlertas: esLiderDeCs(ctx.role),
    veMontos: ctx.role === "SUPER_ADMIN" || permisos.sections?.ventas?.read === true,
  });
  if (!r) notFound();

  const cuando = r.reunion ? `hoy, ${hora(r.reunion.inicio)}${r.reunion.fin ? `–${hora(r.reunion.fin)}` : ""}` : null;
  const motivo = r.reunionNoLeida ? POR_QUE_SIN_EVENTO[r.reunionNoLeida] ?? "" : "";

  return (
    <div className={cn(SHELL_DEFAULT, "space-y-6")}>
      <PageHeader
        title={r.reunion?.titulo ?? "Preparar la reunión"}
        backHref="/para-ti"
        backLabel="Para ti"
        description={[r.cliente.nombre, cuando].filter(Boolean).join(" · ") + (motivo ? ` · ${motivo}` : "")}
        action={
          <Link href={`/clients/${r.cliente.id}`} className={ENLACE_BLANCO}>
            Abrir la ficha
          </Link>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <QuienViene r={r} />
        <LaUltimaVez r={r} />
        {r.loQueSeDijo.frases.length > 0 && (
          <Bloque titulo={`Lo que se dijo de «${r.loQueSeDijo.palabras.join(", ")}»`} fuente="las transcripciones">
            <ul className="space-y-3">
              {r.loQueSeDijo.frases.map((f, i) => (
                <FraseDeReunion key={`${f.sessionId}-${i}`} r={f} q={r.loQueSeDijo.palabras.join(" ")} />
              ))}
            </ul>
          </Bloque>
        )}
        <LoPendiente r={r} />
        <SiguientePaso r={r} />
        {r.alertas && r.alertas.length > 0 && (
          <Bloque titulo="Alertas abiertas" fuente="Éxito del cliente">
            <ul className="space-y-1.5">
              {r.alertas.map((a, i) => (
                <li key={i} className="text-[13px]">
                  <span className="font-medium text-fg">{a.titulo}</span>
                  <span className="block text-xs text-fg-muted">{a.razon}</span>
                </li>
              ))}
            </ul>
          </Bloque>
        )}
        <Bloque titulo="Tickets abiertos" fuente="HubSpot">
          {r.tickets.length === 0 ? (
            <Vacio>No hay tickets abiertos.</Vacio>
          ) : (
            <ul className="space-y-1.5">
              {r.tickets.slice(0, 8).map((t) => (
                <li key={t.id} className="text-[13px]">
                  <span className="text-fg">{t.asunto}</span>
                  <span className="block text-xs text-fg-muted">{[t.etapa, t.creado ? `desde el ${fecha(t.creado)}` : null].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
          )}
        </Bloque>
        <BuscarEnReuniones clientId={r.cliente.id} nombre={r.cliente.nombre} />
        {r.negocios.length > 0 && (
          <Bloque titulo="Negocios abiertos" fuente="HubSpot">
            <ul className="space-y-1.5">
              {r.negocios.map((n, i) => (
                <li key={i} className="text-[13px]">
                  <span className="text-fg">{n.nombre}</span>
                  <span className="block text-xs text-fg-muted">{[n.etapa, n.cierre ? `cierra el ${n.cierre}` : null, n.monto].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
          </Bloque>
        )}
      </div>
    </div>
  );
}

function Bloque({ titulo, fuente, children }: { titulo: string; fuente: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className={ROTULO_DEL_SISTEMA}>{titulo}</h2>
        <span className="text-[11px] text-fg-muted">De {fuente}</span>
      </div>
      {children}
    </section>
  );
}

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-fg-muted">{children}</p>;
}

function QuienViene({ r }: { r: ResumenDeLaReunion }) {
  const delCliente = r.invitados.filter((i) => i.lado !== "smarteam");
  const deSmarteam = r.invitados.filter((i) => i.lado === "smarteam");
  return (
    <Bloque titulo="Quién viene" fuente="la invitación y los contactos de HubSpot">
      {r.invitados.length === 0 ? (
        <Vacio>{r.reunion ? "La invitación no tiene invitados." : "Sin la invitación no se sabe quién viene."}</Vacio>
      ) : (
        <ul className="space-y-1.5">
          {delCliente.map((i) => (
            <li key={i.email} className="text-[13px]">
              <span className="font-medium text-fg">{i.nombre ?? i.email}</span>
              {i.cargo && <span className="text-fg-secondary"> · {i.cargo}</span>}
              <span className="block text-xs text-fg-muted">
                {i.lado === "otro" ? "No está en los contactos de HubSpot" : i.ultimaReunion ? `Última reunión: ${fecha(i.ultimaReunion)}` : "Primera reunión que se registra"}
              </span>
            </li>
          ))}
          {deSmarteam.length > 0 && (
            <li className="pt-1 text-xs text-fg-muted">De Smarteam: {deSmarteam.map((i) => i.nombre ?? i.email).join(", ")}</li>
          )}
        </ul>
      )}
    </Bloque>
  );
}

function LaUltimaVez({ r }: { r: ResumenDeLaReunion }) {
  const u = r.ultimaVez;
  return (
    <Bloque titulo="La última vez" fuente={u ? `la ${u.fuente}` : "las reuniones"}>
      {!u ? (
        <Vacio>No hay una reunión anterior con algo que leer.</Vacio>
      ) : (
        <div className="space-y-2 text-[13px]">
          <Link href={`/sessions/${u.sessionId}`} className="font-medium text-fg transition-colors hover:text-brand">
            {u.titulo} · {fecha(u.fecha)}
          </Link>
          {u.resumen && <p className="line-clamp-6 whitespace-pre-line text-fg-secondary">{u.resumen}</p>}
          {u.acuerdos.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-fg-muted">Lo que se acordó</p>
              <ul className="list-disc space-y-0.5 pl-4 text-fg-secondary">
                {u.acuerdos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Bloque>
  );
}

function LoPendiente({ r }: { r: ResumenDeLaReunion }) {
  const lado = (l: "cliente" | "smarteam") => r.pendientes.filter((p) => p.lado === l);
  const lista = (items: ResumenDeLaReunion["pendientes"]) => (
    <ul className="space-y-1">
      {items.slice(0, 6).map((p, i) => (
        <li key={i} className="text-[13px]">
          <span className="text-fg">{p.titulo}</span>
          <span className="block text-xs text-fg-muted">{[p.proyecto, p.venceEl ? `para el ${dia(p.venceEl)}` : null, p.estado].filter(Boolean).join(" · ")}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <Bloque titulo="Lo pendiente" fuente="Tareas">
      {r.pendientes.length === 0 ? (
        <Vacio>No hay compromisos abiertos.</Vacio>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="pb-1 text-xs font-semibold text-fg-muted">Del cliente</p>
            {lado("cliente").length ? lista(lado("cliente")) : <Vacio>Nada.</Vacio>}
          </div>
          <div>
            <p className="pb-1 text-xs font-semibold text-fg-muted">De Smarteam</p>
            {lado("smarteam").length ? lista(lado("smarteam")) : <Vacio>Nada.</Vacio>}
          </div>
        </div>
      )}
    </Bloque>
  );
}

function SiguientePaso({ r }: { r: ResumenDeLaReunion }) {
  const pasos = r.pasos?.pasos ?? [];
  const nombreDe = new Map((r.pasos?.objetos ?? []).map((o) => [o.objetoId, o.nombre]));
  return (
    <Bloque titulo="Siguiente paso" fuente="Nexus y HubSpot">
      {pasos.length === 0 ? (
        <Vacio>Ningún equipo tiene un siguiente paso.</Vacio>
      ) : (
        <ul className="space-y-1.5">
          {pasos.map((p) => (
            <li key={p.id} className="text-[13px]">
              <span className="text-fg">{p.que}</span>
              <span className="block text-xs text-fg-muted">
                {[NOMBRE_DEL_EQUIPO[p.equipo], nombreDe.get(p.objetoId), p.fecha ? `para el ${dia(p.fecha)}` : null, p.responsableNombre].filter(Boolean).join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Bloque>
  );
}
