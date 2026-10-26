"use client";

/**
 * components/tareas/AsociarATarea.tsx — en el panel de un evento de la agenda de «Para ti»: qué tarea tuya está unida a
 * ese evento y «Asociar a una tarea» (P3, 2026-10-27, roadmap área P).
 *
 * Hasta hoy «Agendar» solo creaba un bloque NUEVO: una tarea no se podía unir con un evento que ya existía (la reunión
 * con el cliente que prepara, el rato que ya te reservaste). Acá eliges una de tus tareas abiertas y queda unida a ese
 * evento: Nexus lo verifica en tu calendario y nunca lo mueve ni lo borra (POST /api/tareas/[id]/agenda «asociar»).
 * Tocar un espacio vacío de la agenda sigue creando, como siempre.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui";
import { BotonBlanco, BotonTexto, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { estaAbierta } from "@/lib/tareas/estados";
import { normalizar } from "@/lib/tareas/texto";
import type { TareaVista } from "@/lib/tareas/tipos";
import { apiTareas, avisarQueCambiaronLasTareas } from "./api";

/** Cuántas tareas se ofrecen a la vez en el buscador. */
const OPCIONES_A_LA_VISTA = 8;

const enlace = (id: string) => `/tareas?t=${encodeURIComponent(id)}`;

export default function AsociarATarea({ eventoId, correo }: { eventoId: string; correo: string }) {
  const toast = useToast();
  const [unidas, setUnidas] = useState<TareaVista[] | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [mias, setMias] = useState<TareaVista[] | null>(null);
  const [q, setQ] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setUnidas((await apiTareas.delEvento(eventoId)).tareas);
    } catch {
      setUnidas([]);
    }
  }, [eventoId]);

  useEffect(() => {
    setUnidas(null);
    setEligiendo(false);
    setQ("");
    void cargar();
  }, [cargar]);

  async function abrir() {
    setEligiendo(true);
    if (mias) return;
    try {
      const m = await apiTareas.mias();
      const yo = correo.toLowerCase();
      setMias([...m.estaSemana, ...m.masAdelante].filter((t) => estaAbierta(t.estado) && t.responsable?.email === yo));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron cargar tus tareas.");
      setEligiendo(false);
    }
  }

  async function unir(t: TareaVista) {
    setOcupado(t.id);
    try {
      await apiTareas.agendar(t.id, { modo: "asociar", eventoId });
      toast.success(`T-${t.numero} quedó unida a este evento.`);
      avisarQueCambiaronLasTareas();
      setEligiendo(false);
      setQ("");
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo unir.");
    } finally {
      setOcupado(null);
    }
  }

  const ya = useMemo(() => new Set((unidas ?? []).map((t) => t.id)), [unidas]);
  const opciones = useMemo(() => {
    const texto = normalizar(q);
    return (mias ?? []).filter((t) => !ya.has(t.id) && (!texto || normalizar(`T-${t.numero} ${t.titulo} ${t.cliente?.nombre ?? ""}`).includes(texto))).slice(0, OPCIONES_A_LA_VISTA);
  }, [mias, q, ya]);

  if (unidas === null) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className={ROTULO_DEL_SISTEMA}>Tareas de este evento</p>
      {unidas.length > 0 && (
        <ul className="flex flex-col gap-1">
          {unidas.map((t) => (
            <li key={t.id} className="text-[13px]">
              <Link href={enlace(t.id)} className="text-fg hover:underline">
                <span className="text-fg-muted">T-{t.numero}</span> · {t.titulo}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!eligiendo ? (
        <div>
          <BotonBlanco onClick={() => void abrir()}>{unidas.length ? "Asociar otra tarea" : "Asociar a una tarea"}</BotonBlanco>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-muted p-2.5">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca una de tus tareas abiertas" autoFocus aria-label="Buscar una tarea" />
          {mias === null ? (
            <p className="text-xs text-fg-muted">Cargando tus tareas…</p>
          ) : opciones.length === 0 ? (
            <p className="text-xs text-fg-muted">{q ? "Ninguna de tus tareas abiertas dice eso." : "No tienes tareas abiertas para unir."}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {opciones.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={!!ocupado}
                    onClick={() => void unir(t)}
                    className="w-full rounded-md px-2 py-1.5 text-left text-[13px] text-fg transition-colors hover:bg-surface-hover disabled:opacity-60"
                  >
                    <span className="text-fg-muted">T-{t.numero}</span> · {t.titulo}
                    {t.cliente ? <span className="text-fg-muted"> · {t.cliente.nombre}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-fg-muted">Nexus no mueve ni borra el evento: solo lo une a la tarea.</p>
          <div>
            <BotonTexto onClick={() => setEligiendo(false)}>Cancelar</BotonTexto>
          </div>
        </div>
      )}
    </div>
  );
}
