"use client";

/**
 * AgendarEnLaAgenda — el «Agendar» de una cuenta sin acción ni reunión, en «Lo que importa hoy» (2026-10-17).
 *
 * En vez de abrir Google Calendar a ciegas, deja el borrador del evento en la agenda, en la primera hora libre en
 * horario laboral (lib/mi-dia/inicio.ts › primerHuecoLaboral), con la cuenta y su contacto, y abre Google Calendar con
 * ese evento ya configurado: la persona lo guarda allá. El contacto es quien estuvo en la última reunión con la cuenta
 * (lo trae el enlace que arma el servidor, lib/mi-dia/servicio.ts); si no hay, el contacto de HubSpot de la cuenta con
 * la actividad más reciente.
 */
import { FUENTE_CUENTA_SIN_ACCION } from "@/lib/mi-dia/servicio";
import { datosDelEnlaceDeAgendar, enlaceDelBorrador, type ResultadoParaAgendar } from "@/lib/mi-dia/agenda-borrador";
import type { Pendiente } from "@/lib/para-ti/tipos";
import { cambiarBorrador, crearBorrador, primeraHoraLibre } from "./borradores";
import { EnlaceDelInicio } from "./piezas";

/** ¿Es el «Agendar» de una cuenta sin reunión? (El de «Crear la acción» va a la ficha.) */
export function esAgendarDeLaCuenta(it: Pendiente): boolean {
  return it.fuente === FUENTE_CUENTA_SIN_ACCION && it.href.startsWith("https://calendar.google.com/");
}

/** El botón de un pendiente: «Agendar» de una cuenta deja el borrador en la agenda; los demás, su enlace de siempre. */
export function AccionDelPendiente({ it, className }: { it: Pendiente; className?: string }) {
  if (!esAgendarDeLaCuenta(it)) {
    return (
      <EnlaceDelInicio href={it.href} className={className}>
        {it.accion}
      </EnlaceDelInicio>
    );
  }
  return (
    <button type="button" className={className} onClick={() => agendar(it)} title="Lo pone en tu primera hora libre y abre Google Calendar para guardarlo">
      {it.accion}
    </button>
  );
}

function agendar(it: Pendiente) {
  const datos = datosDelEnlaceDeAgendar(it.href);
  if (!datos?.correo) {
    window.open(it.href, "_blank", "noopener,noreferrer");
    return;
  }
  const h = primeraHoraLibre(datos.correo, new Date());
  const empresa = it.meta.split(" · ")[0]?.trim() || "la cuenta";
  const b = crearBorrador({
    correo: datos.correo,
    inicio: h.inicio,
    fin: h.fin,
    cuenta: it.clientId ? { id: it.clientId, nombre: empresa } : null,
    invitados: datos.invitados.map((correo) => ({ correo, nombre: null, clientId: it.clientId ?? null })),
    origen: "agendar",
    abierto: true,
    enfocar: true,
  });
  const origen = window.location.origin;
  if (b.invitados.length > 0 || !b.cuenta) {
    window.open(enlaceDelBorrador(b, origen), "_blank", "noopener,noreferrer");
    return;
  }
  // Sin quién estuvo en la última reunión: se busca el contacto de la cuenta. La pestaña se abre YA (con el clic de la
  // persona, para que el navegador no la bloquee) y se llena cuando llega el contacto.
  const pestana = window.open("", "_blank");
  const cuentaId = b.cuenta.id;
  fetch(`/api/para-ti/contactos?cliente=${encodeURIComponent(cuentaId)}`)
    .then((r) => (r.ok ? (r.json() as Promise<ResultadoParaAgendar>) : null))
    .catch(() => null)
    .then((j) => {
      const c = j?.contactos[0];
      const conContacto = c ? { ...b, invitados: [{ correo: c.email, nombre: c.nombre, clientId: c.clientId }] } : b;
      if (c) cambiarBorrador(b.id, { invitados: conContacto.invitados });
      const url = enlaceDelBorrador(conContacto, origen);
      if (pestana) {
        pestana.opener = null;
        pestana.location.href = url;
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    });
}
