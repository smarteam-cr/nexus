"use client";

/**
 * components/documentacion/comentarios/HiloContenido.tsx — un hilo: sus comentarios, responder,
 * resolver, editar y borrar. Lo usan el globo sobre el texto y el panel de la página.
 *
 * Los botones se muestran según lo que el servidor dijo (`puedeResolver`) y quién escribió cada
 * comentario; la API vuelve a validar las dos cosas.
 */
import { useState } from "react";
import { Avatar, Button, Textarea } from "@/components/ui";
import { haceCuanto, type HiloVisto } from "@/lib/documentacion/comentarios";
import { citaParaMostrar } from "./extension";
import { useComentarios } from "./ContextoDeComentarios";

/** Ctrl+Enter (o Cmd+Enter) envía, como en cualquier caja de comentarios. */
export function esEnviar(e: React.KeyboardEvent) {
  return e.key === "Enter" && (e.ctrlKey || e.metaKey);
}

export function CitaDelHilo({ cita }: { cita: string }) {
  return (
    <p className="line-clamp-3 border-l-2 border-warn-line pl-2 text-xs text-fg-secondary">
      {cita ? `«${citaParaMostrar(cita)}»` : "Todo el bloque"}
    </p>
  );
}

export default function HiloContenido({ hilo, conCita = true }: { hilo: HiloVisto; conCita?: boolean }) {
  const { yo, puedeResolver, responder, resolver, editar, borrar } = useComentarios();
  const [respuesta, setRespuesta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [textoEditado, setTextoEditado] = useState("");
  const [confirmandoBorrar, setConfirmandoBorrar] = useState<string | null>(null);
  const resuelto = !!hilo.resueltoAt;
  const esMio = (email: string) => email.toLowerCase() === yo.email.toLowerCase();

  const enviarRespuesta = async () => {
    const cuerpo = respuesta.trim();
    if (!cuerpo || enviando) return;
    setEnviando(true);
    if (await responder(hilo.id, cuerpo)) setRespuesta("");
    setEnviando(false);
  };

  const guardarEdicion = async (comentarioId: string) => {
    const cuerpo = textoEditado.trim();
    if (!cuerpo) return;
    if (await editar(hilo.id, comentarioId, cuerpo)) setEditando(null);
  };

  return (
    <div className="space-y-3">
      {(conCita || puedeResolver) && (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">{conCita && <CitaDelHilo cita={hilo.cita} />}</div>
          {puedeResolver && (
            <Button size="xs" variant={resuelto ? "secondary" : "ghost"} onClick={() => void resolver(hilo.id, !resuelto)}>
              {resuelto ? "Reabrir" : "Resolver"}
            </Button>
          )}
        </div>
      )}

      {resuelto && hilo.resueltoAt && (
        <p className="text-2xs text-success-ink">
          Resuelto por {hilo.resueltoPor?.nombre ?? "alguien del equipo"} · {haceCuanto(hilo.resueltoAt)}
        </p>
      )}

      <ul className="space-y-3">
        {hilo.comentarios.map((c) => {
          const mio = esMio(c.autor.email);
          return (
            <li key={c.id} className="flex gap-2">
              <Avatar name={c.autor.nombre} src={c.autor.foto ?? undefined} colorSeed={c.autor.email} size="xs" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-1.5 text-xs">
                  <span className="font-semibold text-fg">{c.autor.nombre}</span>
                  <span className="text-fg-muted" title={new Date(c.createdAt).toLocaleString("es-CR")}>
                    {haceCuanto(c.createdAt)}
                    {c.editadoAt ? " · editado" : ""}
                  </span>
                </div>

                {editando === c.id ? (
                  <div className="mt-1 space-y-1.5">
                    <Textarea
                      autoFocus
                      rows={3}
                      value={textoEditado}
                      aria-label="Editar el comentario"
                      onChange={(e) => setTextoEditado(e.target.value)}
                      onKeyDown={(e) => {
                        if (esEnviar(e)) void guardarEdicion(c.id);
                        if (e.key === "Escape") setEditando(null);
                      }}
                    />
                    <div className="flex justify-end gap-1.5">
                      <Button size="xs" variant="secondary" onClick={() => setEditando(null)}>
                        Cancelar
                      </Button>
                      <Button size="xs" variant="primary" disabled={!textoEditado.trim()} onClick={() => void guardarEdicion(c.id)}>
                        Guardar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-fg">{c.cuerpo}</p>
                )}

                {editando !== c.id && (mio || puedeResolver) && (
                  <div className="mt-1 flex gap-2 text-2xs">
                    {mio && (
                      <button
                        type="button"
                        className="text-fg-muted hover:text-fg"
                        onClick={() => {
                          setTextoEditado(c.cuerpo);
                          setEditando(c.id);
                        }}
                      >
                        Editar
                      </button>
                    )}
                    {confirmandoBorrar === c.id ? (
                      <>
                        <button
                          type="button"
                          className="font-semibold text-danger-ink"
                          onClick={() => {
                            setConfirmandoBorrar(null);
                            void borrar(hilo.id, c.id);
                          }}
                        >
                          Sí, borrar
                        </button>
                        <button type="button" className="text-fg-muted hover:text-fg" onClick={() => setConfirmandoBorrar(null)}>
                          No
                        </button>
                      </>
                    ) : (
                      <button type="button" className="text-fg-muted hover:text-danger-ink" onClick={() => setConfirmandoBorrar(c.id)}>
                        Borrar
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="space-y-1.5">
        <Textarea
          rows={2}
          value={respuesta}
          placeholder="Responder…"
          aria-label="Responder en el hilo"
          onChange={(e) => setRespuesta(e.target.value)}
          onKeyDown={(e) => {
            if (esEnviar(e)) void enviarRespuesta();
          }}
        />
        {respuesta.trim() && (
          <div className="flex justify-end">
            <Button size="xs" variant="primary" loading={enviando} onClick={() => void enviarRespuesta()}>
              Responder
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
