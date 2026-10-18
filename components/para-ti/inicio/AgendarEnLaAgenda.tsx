"use client";

/**
 * AgendarEnLaAgenda — «Agendar» de una cuenta, con vista previa en la agenda (2026-10-17).
 *
 * «Agendar» (una cuenta sin acción ni reunión, en «Lo que importa hoy» y en la lista entera de «Para ti») y
 * «Planificar acción» (la cartera de Customer Success) NO abren Google Calendar: dejan el borrador del evento en la
 * agenda del inicio, con el MISMO cuadro de «+ Crear evento» abierto (título, hora propuesta, cuenta y contacto, todo
 * editable). Recién «Abrir en Google Calendar», dentro del cuadro, abre el enlace. Nunca se abre Calendar sin que la
 * persona vea el borrador antes.
 *
 * La hora propuesta es la que trae el enlace del servidor (el primer hueco libre de los próximos 8 días, leído del
 * calendario entero; lib/mi-dia/servicio.ts) o, sin ella, la primera hora libre de lo que la agenda tiene cargado. El
 * contacto es quien estuvo en la última reunión con la cuenta; si no hay, el contacto de HubSpot de la cuenta con la
 * actividad más reciente.
 *
 * Para la cartera: `usePlanificarAccion()` devuelve la función que hace todo eso con una cuenta. Si no hay una agenda
 * en pantalla (la cartera es otra vista de «Para ti»), lleva al día del borrador en el inicio: los borradores viven en
 * la pestaña y sobreviven a la navegación dentro de Nexus.
 */
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { FUENTE_CUENTA_SIN_ACCION } from "@/lib/mi-dia/servicio";
import { datosDelEnlaceDeAgendar, type ResultadoParaAgendar } from "@/lib/mi-dia/agenda-borrador";
import { minutoDelDia } from "@/lib/mi-dia/inicio";
import type { Pendiente } from "@/lib/para-ti/tipos";
import { cambiarBorrador, crearBorrador, hayAgendaEnPantalla, primeraHoraLibre } from "./borradores";
import { EnlaceDelInicio } from "./piezas";

/** Lo que necesita «Planificar acción» de una cuenta. */
export interface CuentaParaPlanificar {
  /** El correo de quien planifica: Google Calendar abre en su cuenta. */
  correo: string;
  clientId: string;
  empresa: string;
  /** Los correos a invitar. Sin ninguno, se busca el contacto de la cuenta con actividad más reciente. */
  invitados?: readonly string[];
  /** La hora propuesta (ISO). Sin ella, la primera hora libre de trabajo. */
  inicio?: string | null;
  fin?: string | null;
  titulo?: string;
}

/**
 * «Planificar acción» con una cuenta: deja el borrador en la agenda del inicio con su cuadro abierto, para revisarlo y
 * recién ahí abrirlo en Google Calendar.
 */
export function usePlanificarAccion(): (c: CuentaParaPlanificar) => void {
  const router = useRouter();
  return useCallback(
    (c: CuentaParaPlanificar) => {
      const h = c.inicio && c.fin ? { inicio: c.inicio, fin: c.fin } : primeraHoraLibre(c.correo, new Date());
      const b = crearBorrador({
        correo: c.correo,
        inicio: h.inicio,
        fin: h.fin,
        titulo: c.titulo ?? "",
        cuenta: { id: c.clientId, nombre: c.empresa },
        invitados: (c.invitados ?? []).map((correo) => ({ correo, nombre: null, clientId: c.clientId })),
        origen: "agendar",
        enfocar: true,
      });
      if (b.invitados.length === 0) {
        // Sin quién estuvo en la última reunión: el contacto de la cuenta con actividad más reciente. El cuadro ya está
        // abierto; el contacto aparece cuando llega (si la persona no invitó a nadie mientras tanto).
        fetch(`/api/para-ti/contactos?cliente=${encodeURIComponent(c.clientId)}`)
          .then((r) => (r.ok ? (r.json() as Promise<ResultadoParaAgendar>) : null))
          .catch(() => null)
          .then((j) => {
            const k = j?.contactos[0];
            if (k) cambiarBorradorSiSigueVacio(b.id, { correo: k.email, nombre: k.nombre, clientId: k.clientId });
          });
      }
      if (!c.inicio && !hayAgendaEnPantalla()) {
        // Sin la agenda en pantalla no se sabe qué hay ocupado: la hora sale del calendario entero. Mientras llega, se
        // va al día de la hora provisoria; si la persona ya la cambió, no se toca.
        fetch("/api/para-ti/agenda?hueco=1")
          .then((r) => (r.ok ? (r.json() as Promise<{ hueco: { inicio: string; fin: string } | null }>) : null))
          .catch(() => null)
          .then((j) => {
            const hh = j?.hueco;
            if (hh && hh.inicio !== h.inicio) cambiarBorrador(b.id, (x) => (x.inicio === h.inicio && x.fin === h.fin ? { inicio: hh.inicio, fin: hh.fin } : {}));
            router.push(`/para-ti?dia=${minutoDelDia(hh?.inicio ?? h.inicio).dia}`, { scroll: false });
          });
        return;
      }
      if (!hayAgendaEnPantalla()) router.push(`/para-ti?dia=${minutoDelDia(h.inicio).dia}`, { scroll: false });
    },
    [router],
  );
}

/** Pone el contacto solo si el borrador todavía no tiene invitados (no pisa lo que la persona ya eligió). */
function cambiarBorradorSiSigueVacio(id: string, invitado: { correo: string; nombre: string | null; clientId: string }) {
  cambiarBorrador(id, (b) => (b.invitados.length === 0 ? { invitados: [invitado] } : {}));
}

/** ¿Es el «Agendar» de una cuenta sin reunión? (El de «Crear la acción» va a la ficha.) */
export function esAgendarDeLaCuenta(it: Pendiente): boolean {
  return it.fuente === FUENTE_CUENTA_SIN_ACCION && it.href.startsWith("https://calendar.google.com/");
}

/** El botón de un pendiente: «Agendar» de una cuenta deja el borrador en la agenda; los demás, su enlace de siempre. */
export function AccionDelPendiente({ it, className }: { it: Pendiente; className?: string }) {
  const planificar = usePlanificarAccion();
  if (!esAgendarDeLaCuenta(it)) {
    return (
      <EnlaceDelInicio href={it.href} className={className}>
        {it.accion}
      </EnlaceDelInicio>
    );
  }
  const datos = datosDelEnlaceDeAgendar(it.href);
  return (
    <button
      type="button"
      className={className}
      title="Deja el borrador en tu agenda para revisarlo antes de abrirlo en Google Calendar"
      onClick={() => {
        if (!datos?.correo || !it.clientId) {
          // Sin correo ni cuenta no hay borrador que armar: se abre el enlace tal cual (no pasa con lo que arma el servidor).
          window.open(it.href, "_blank", "noopener,noreferrer");
          return;
        }
        planificar({
          correo: datos.correo,
          clientId: it.clientId,
          empresa: it.meta.split(" · ")[0]?.trim() || "la cuenta",
          invitados: datos.invitados,
          inicio: datos.inicio,
          fin: datos.fin,
        });
      }}
    >
      {it.accion}
    </button>
  );
}
