"use client";

/**
 * Sesiones — las reuniones que planea el vendedor con el prospecto, las que necesite.
 *
 * Pedido de Elías (2026-10-01): ya no hay «Reunión 1» y «Reunión 2» fijas. Una venta chica puede
 * cerrarse en una sesión; una grande, con varias áreas, lleva más. La guía de abajo es siempre la de
 * la PRÓXIMA (la primera que no pasó). Las reuniones agendadas en HubSpot se ofrecen para sumarlas
 * con un clic.
 */
import { useState } from "react";
import { Badge, Button, Input } from "@/components/ui";
import { diaYHora, hoyEnCostaRica } from "@/lib/exploraciones/fechas";
import { MAX_SESIONES, proximaReunion, sesionHecha, type SesionPlaneada } from "@/lib/exploraciones/guia";
import { useLienzo } from "./contexto";

const nuevoId = () => `s-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function FilaDeSesion({ s, numero, esLaProxima, onCambio, onQuitar }: { s: SesionPlaneada; numero: number; esLaProxima: boolean; onCambio: (s: SesionPlaneada) => void; onQuitar: () => void }) {
  const { puedeEditar, guardando } = useLienzo();
  const [titulo, setTitulo] = useState(s.titulo ?? "");
  const [visto, setVisto] = useState(s.titulo);
  if (visto !== s.titulo) {
    setVisto(s.titulo);
    setTitulo(s.titulo ?? "");
  }
  const hoy = hoyEnCostaRica();
  const hecha = sesionHecha(s, hoy);
  return (
    <li className="grid items-center gap-2 px-3 py-2 sm:grid-cols-[6rem_1fr_10rem_auto]">
      <span className="flex items-center gap-1.5 text-xs font-medium text-fg-secondary">
        Sesión {numero}
        {esLaProxima && (
          <Badge size="xs" variant="info">
            Próxima
          </Badge>
        )}
      </span>
      <Input
        value={titulo}
        disabled={!puedeEditar}
        placeholder="De qué va (opcional)"
        aria-label={`Tema de la sesión ${numero}`}
        onChange={(e) => setTitulo(e.target.value)}
        onBlur={() => {
          const t = titulo.trim();
          if (t !== (s.titulo ?? "")) onCambio({ ...s, ...(t ? { titulo: t } : { titulo: undefined }) });
        }}
      />
      <Input
        type="date"
        value={s.fecha ?? ""}
        disabled={!puedeEditar || guardando}
        aria-label={`Fecha de la sesión ${numero}`}
        onChange={(e) => onCambio({ ...s, fecha: e.target.value || undefined })}
      />
      <span className="flex items-center justify-end gap-2">
        <label className="flex items-center gap-1.5 text-xs text-fg-secondary">
          <input type="checkbox" checked={hecha} disabled={!puedeEditar || guardando || (!!s.fecha && s.fecha < hoy)} onChange={(e) => onCambio({ ...s, hecha: e.target.checked || undefined })} />
          Hecha
        </label>
        {puedeEditar && (
          <button type="button" className="text-xs text-fg-muted underline hover:text-fg" disabled={guardando} onClick={onQuitar}>
            Quitar
          </button>
        )}
      </span>
    </li>
  );
}

export default function Sesiones() {
  const { exp, cambiar, puedeEditar, guardando } = useLienzo();
  const sesiones = exp.estado.contenido.sesiones;
  const hoy = hoyEnCostaRica();
  const proxima = proximaReunion(sesiones, exp.leido.agenda, hoy, exp.estado.propuesta.leidas.sesiones.length);
  const guardar = (lista: SesionPlaneada[]) => void cambiar([{ op: "sesiones", sesiones: lista }]);

  // Las agendadas en HubSpot que todavía no están en la lista (por el día).
  const dias = new Set(sesiones.map((s) => s.fecha).filter(Boolean));
  const deHubspot = exp.leido.agenda.filter((a) => !dias.has(hoyEnCostaRica(new Date(a.inicio))));

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-fg">Las sesiones</h2>
          <p className="text-xs text-fg-muted">Las que necesites: una venta grande, con varias áreas, lleva más. La guía de abajo es siempre la de la próxima.</p>
        </div>
        {puedeEditar && sesiones.length < MAX_SESIONES && (
          <Button size="sm" variant="secondary" disabled={guardando} onClick={() => guardar([...sesiones, { id: nuevoId() }])}>
            Agregar sesión
          </Button>
        )}
      </div>

      {sesiones.length > 0 ? (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {sesiones.map((s, i) => (
            <FilaDeSesion
              key={s.id}
              s={s}
              numero={i + 1}
              esLaProxima={proxima.sesionId === s.id}
              onCambio={(nueva) => guardar(sesiones.map((x) => (x.id === s.id ? nueva : x)))}
              onQuitar={() => guardar(sesiones.filter((x) => x.id !== s.id))}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-fg-muted">
          Todavía no planeaste sesiones. {proxima.desde === "hubspot" ? "La guía de abajo es para la reunión agendada en HubSpot." : "La guía de abajo es para la primera reunión."}
        </p>
      )}

      {puedeEditar && deHubspot.length > 0 && sesiones.length < MAX_SESIONES && (
        <ul className="space-y-1">
          {deHubspot.slice(0, 3).map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 text-xs text-fg-secondary">
              <span>
                Agendada en HubSpot: {diaYHora(a.inicio)} · {a.titulo}
              </span>
              <button
                type="button"
                className="text-brand-light underline"
                disabled={guardando}
                onClick={() => guardar([...sesiones, { id: nuevoId(), titulo: a.titulo.slice(0, 120), fecha: hoyEnCostaRica(new Date(a.inicio)) }])}
              >
                Sumarla
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
