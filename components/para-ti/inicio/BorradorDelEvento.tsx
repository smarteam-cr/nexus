"use client";

/**
 * BorradorDelEvento — el cuadro de un evento nuevo, al lado de su lugar en la agenda del inicio (2026-10-17).
 *
 * Título, hora, duración, a quién invitar (los contactos de HubSpot de las cuentas que ves, buscando por nombre o
 * empresa) y la cuenta. «Abrir en Google Calendar» abre el evento ya configurado en la cuenta de Google de la persona:
 * ella lo guarda allá y Google manda la invitación. Nexus no escribe en el calendario.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Input, Select } from "@/components/ui";
import { BotonBlanco, BotonTexto, IconoDeSugerencia, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { horaCR, instante, minutoDelDia } from "@/lib/mi-dia/inicio";
import {
  conDuracion,
  conInvitado,
  DURACIONES_DEL_BORRADOR,
  duracionDelBorrador,
  enlaceDelBorrador,
  MAX_INVITADOS_DEL_BORRADOR,
  moverBorrador,
  tituloDelBorrador,
  dejaReunionPlaneada,
  type BorradorDeEvento,
  type ContactoParaAgendar,
  type ResultadoParaAgendar,
} from "@/lib/mi-dia/agenda-borrador";
import { cambiarBorrador, editarBorrador, quitarBorrador, yaLoGuarde } from "./borradores";
import { useToast } from "@/components/ui/Toast";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const diaLargo = (ymd: string) => `${DIAS[(new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7]} ${Number(ymd.slice(8, 10))} ${MESES[Number(ymd.slice(5, 7)) - 1]}`;
const duracionTexto = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60}` : `${m / 60} h`);

/** Las horas de inicio que se ofrecen: cada media hora de 6:00 a 21:00, más la de ahora si no cae justo. */
function horasDelDia(dia: string, actual: number): number[] {
  const out: number[] = [];
  for (let m = 6 * 60; m <= 21 * 60; m += 30) out.push(m);
  if (!out.includes(actual)) out.push(actual);
  return out.sort((a, b) => a - b);
}

export default function BorradorDelEvento({
  b,
  className,
  onGuardado,
  onCerrar,
}: {
  b: BorradorDeEvento;
  className?: string;
  /** La X y Escape. Sin esto, solo se cierra el cuadro; la agenda lo usa para soltar el borrador (borrarlo). */
  onCerrar?: () => void;
  /** Después de «Ya lo guardé» (ya se quitó el borrador): «Planifica tu semana» lo usa para mostrarla agendada. */
  onGuardado?: (b: BorradorDeEvento) => void;
}) {
  const titulo = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [resultado, setResultado] = useState<{ q: string; r: ResultadoParaAgendar | null } | null>(null);
  const [deLaCuenta, setDeLaCuenta] = useState<{ id: string; contactos: ContactoParaAgendar[] } | null>(null);
  const { dia, minuto } = minutoDelDia(b.inicio);
  const duracion = duracionDelBorrador(b);
  const origen = typeof window === "undefined" ? "" : window.location.origin;
  const enlace = useMemo(() => enlaceDelBorrador(b, origen), [b, origen]);
  const toast = useToast();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cerrar = onCerrar ?? (() => editarBorrador(null));

  useEffect(() => {
    if (!b.abierto) titulo.current?.focus();
    // Solo al abrir el cuadro de ESTE borrador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.id]);

  // La búsqueda, con una pausa corta para no pedir por cada letra.
  const buscado = q.trim();
  useEffect(() => {
    if (buscado.length < 2) return;
    let vivo = true;
    const t = setTimeout(() => {
      fetch(`/api/para-ti/contactos?q=${encodeURIComponent(buscado)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => vivo && setResultado({ q: buscado, r: (j as ResultadoParaAgendar | null) ?? null }))
        .catch(() => vivo && setResultado({ q: buscado, r: null }));
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [buscado]);

  // Con una cuenta: sus contactos, para sumarlos con un clic (y para ponerle nombre a un invitado que solo tiene correo).
  const cuentaId = b.cuenta?.id ?? null;
  useEffect(() => {
    if (!cuentaId) return;
    let vivo = true;
    fetch(`/api/para-ti/contactos?cliente=${encodeURIComponent(cuentaId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!vivo || !j) return;
        const contactos = (j as ResultadoParaAgendar).contactos;
        setDeLaCuenta({ id: cuentaId, contactos });
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [cuentaId]);

  const contactosDeLaCuenta = deLaCuenta?.id === cuentaId ? deLaCuenta.contactos : [];
  const invitados = b.invitados.map((i) => (i.nombre ? i : { ...i, nombre: contactosDeLaCuenta.find((c) => c.email === i.correo)?.nombre ?? null }));
  const sugeridos = contactosDeLaCuenta.filter((c) => !b.invitados.some((i) => i.correo === c.email)).slice(0, 4);
  const lista = buscado.length >= 2 && resultado?.q === buscado ? resultado.r : null;
  const lleno = b.invitados.length >= MAX_INVITADOS_DEL_BORRADOR;

  const invitar = (c: ContactoParaAgendar) => {
    cambiarBorrador(b.id, {
      invitados: conInvitado(b.invitados, { correo: c.email, nombre: c.nombre, clientId: c.clientId }),
      // El primer contacto que se elige dice la cuenta, si todavía no había.
      cuenta: b.cuenta ?? { id: c.clientId, nombre: c.empresa },
    });
    setQ("");
  };
  const invitarCorreo = (correo: string) => {
    cambiarBorrador(b.id, { invitados: conInvitado(b.invitados, { correo, nombre: null, clientId: null }) });
    setQ("");
  };

  return (
    <div
      role="dialog"
      aria-label="Evento nuevo"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          cerrar();
        }
      }}
      className={cn("flex w-[340px] max-w-[calc(100vw-48px)] flex-col gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-segment", className)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className={ROTULO_DEL_SISTEMA}>Evento nuevo</p>
          {b.origen === "agendar" && (
            <p className="flex items-center gap-1 text-xs text-brand">
              <IconoDeSugerencia className="h-3 w-3" />
              Nexus lo puso en tu primera hora libre
            </p>
          )}
        </div>
        <button type="button" aria-label="Cerrar" onClick={cerrar} className="rounded px-1.5 text-base leading-5 text-fg-muted transition-colors hover:text-fg">
          ×
        </button>
      </div>

      <Input
        ref={titulo}
        aria-label="Título del evento"
        placeholder={tituloDelBorrador({ titulo: "", cuenta: b.cuenta })}
        value={b.titulo}
        maxLength={200}
        onChange={(e) => cambiarBorrador(b.id, { titulo: e.target.value })}
        className="py-1.5 text-[13px]"
      />

      <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-secondary">
        <span className="font-medium text-fg">{diaLargo(dia)}</span>
        <Select
          aria-label="Hora de inicio"
          value={minuto}
          onChange={(e) => cambiarBorrador(b.id, moverBorrador(b, instante(dia, Number(e.target.value))))}
          className="w-auto px-2 py-1 text-[13px]"
        >
          {horasDelDia(dia, minuto).map((m) => (
            <option key={m} value={m}>
              {horaCR(instante(dia, m))}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Duración"
          value={duracion}
          onChange={(e) => cambiarBorrador(b.id, conDuracion(b, Number(e.target.value)))}
          className="w-auto px-2 py-1 text-[13px]"
        >
          {[...new Set([...DURACIONES_DEL_BORRADOR, duracion])]
            .sort((x, y) => x - y)
            .map((m) => (
              <option key={m} value={m}>
                {duracionTexto(m)}
              </option>
            ))}
        </Select>
        <span className="text-xs text-fg-muted">hasta las {horaCR(b.fin)}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className={ROTULO_DEL_SISTEMA}>Cuenta</p>
        {b.cuenta ? (
          <span className="flex items-center gap-2 text-[13px] text-fg">
            {b.cuenta.nombre}
            <button type="button" aria-label="Quitar la cuenta" onClick={() => cambiarBorrador(b.id, { cuenta: null })} className="text-xs text-fg-muted hover:text-fg">
              ×
            </button>
          </span>
        ) : (
          <span className="text-xs text-fg-muted">Sin cuenta. Búscala abajo, o se toma la del primer contacto que invites.</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <p className={ROTULO_DEL_SISTEMA}>Invitados</p>
        {invitados.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {invitados.map((i) => (
              <li key={i.correo} className="flex max-w-full items-center gap-1 rounded-md border border-line bg-surface-muted px-2 py-0.5 text-xs text-fg" title={i.correo}>
                <span className="truncate">{i.nombre ?? i.correo}</span>
                <button
                  type="button"
                  aria-label={`Quitar a ${i.nombre ?? i.correo}`}
                  onClick={() => cambiarBorrador(b.id, { invitados: b.invitados.filter((x) => x.correo !== i.correo) })}
                  className="text-fg-muted hover:text-fg"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {sugeridos.length > 0 && !lleno && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-fg-muted">De {b.cuenta?.nombre}:</span>
            {sugeridos.map((c) => (
              <button key={c.id} type="button" onClick={() => invitar(c)} title={c.email} className="rounded-md border border-line px-2 py-0.5 text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg">
                + {c.nombre}
              </button>
            ))}
          </div>
        )}
        {!lleno && (
          <div className="relative">
            <Input
              aria-label="Buscar un contacto o una cuenta"
              placeholder="Busca un contacto por nombre o empresa"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && CORREO.test(buscado)) {
                  e.preventDefault();
                  invitarCorreo(buscado.toLowerCase());
                }
              }}
              className="py-1.5 text-[13px]"
            />
            {buscado.length >= 2 && (
              <div className="mt-1 flex max-h-56 flex-col overflow-y-auto rounded-lg border border-line bg-surface">
                {!lista && resultado?.q !== buscado ? (
                  <p className="px-3 py-2 text-xs text-fg-muted">Buscando…</p>
                ) : (
                  <>
                    {lista?.cuentas.map((c) => (
                      <button
                        key={`c-${c.id}`}
                        type="button"
                        onClick={() => {
                          cambiarBorrador(b.id, { cuenta: c });
                          setQ("");
                        }}
                        className="flex items-baseline gap-2 border-b border-line px-3 py-1.5 text-left text-[13px] transition-colors last:border-b-0 hover:bg-surface-hover"
                      >
                        <span className="text-xs text-fg-muted">Cuenta</span>
                        <span className="truncate font-medium text-fg">{c.nombre}</span>
                      </button>
                    ))}
                    {lista?.contactos.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => invitar(c)}
                        className="flex flex-col border-b border-line px-3 py-1.5 text-left transition-colors last:border-b-0 hover:bg-surface-hover"
                      >
                        <span className="truncate text-[13px] font-medium text-fg">{c.nombre}</span>
                        <span className="truncate text-xs text-fg-muted">{[c.cargo, c.empresa, c.email].filter(Boolean).join(" · ")}</span>
                      </button>
                    ))}
                    {CORREO.test(buscado) && (
                      <button type="button" onClick={() => invitarCorreo(buscado.toLowerCase())} className="px-3 py-1.5 text-left text-[13px] text-brand transition-colors hover:bg-surface-hover">
                        Invitar a {buscado.toLowerCase()}
                      </button>
                    )}
                    {lista && lista.cuentas.length === 0 && lista.contactos.length === 0 && !CORREO.test(buscado) && (
                      <p className="px-3 py-2 text-xs text-fg-muted">Ningún contacto ni cuenta tuya se llama así. También puedes escribir un correo.</p>
                    )}
                    {!lista && <p className="px-3 py-2 text-xs text-danger-ink">No se pudo buscar ahora.</p>}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {b.abierto ? (
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2.5">
          <p className="text-xs leading-[17px] text-fg-secondary">
            {dejaReunionPlaneada(b)
              ? "Lo abriste en Google Calendar. Guárdalo allá y dale «Ya lo guardé»: queda en tus tareas como reunión con la cuenta."
              : "Lo abriste en Google Calendar. Guárdalo allá: al recargar, aparece en tu agenda."}
          </p>
          {error && <p className="text-xs text-danger-ink">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <BotonBlanco
              disabled={guardando}
              onClick={async () => {
                setGuardando(true);
                const r = await yaLoGuarde(b);
                setGuardando(false);
                if (!r.ok) setError(r.error);
                else {
                  if (r.planeada) toast.success("Quedó en tus tareas como reunión con la cuenta.");
                  onGuardado?.(b);
                }
              }}
            >
              {guardando ? "Guardando…" : "Ya lo guardé"}
            </BotonBlanco>
            <a href={enlace} target="_blank" rel="noreferrer" className="rounded px-1.5 py-[5px] text-xs font-medium text-brand transition-colors hover:text-brand-light">
              Abrir de nuevo
            </a>
            <BotonTexto onClick={() => quitarBorrador(b.id)} className="ml-auto">
              Descartar
            </BotonTexto>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={enlace}
              target="_blank"
              rel="noreferrer"
              onClick={() => cambiarBorrador(b.id, { abierto: true })}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
            >
              Abrir en Google Calendar
            </a>
            <BotonTexto onClick={() => quitarBorrador(b.id)}>Descartar</BotonTexto>
          </div>
          <p className="text-xs leading-[17px] text-fg-muted">Google Calendar abre con todo lleno; lo guardas allá y Google manda la invitación.</p>
        </div>
      )}
    </div>
  );
}
