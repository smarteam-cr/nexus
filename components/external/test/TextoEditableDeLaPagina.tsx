"use client";

/**
 * TextoEditableDeLaPagina — un texto de la página de resultados que se edita EN SU LUGAR (La escala interna editable,
 * 8 nov; Elías: «se le da clic, se cambia el texto y se guarda»). Solo lo usa la pantalla interna (`EdicionDeLaPagina` de
 * ResultadoDelTestVista): la página pública no lo monta.
 *
 * Se ve como el texto de la página, con la misma letra; al pasar el cursor se marca y dice «Editar». Al tocarlo (o con
 * Enter) se vuelve un cuadro de texto en el mismo lugar: Guardar (o Ctrl+Enter) y Cancelar (o Escape). Vacío, muestra
 * la invitación (`vacio`). Dentro de la tarjeta del radar, mientras se edita la tarjeta queda fija (`data-fijada`, que
 * respeta AnimacionesDelResultado): no se cierra al mover el cursor. Lo guardado se sigue viendo hasta que llega la
 * página nueva (antes asomaba un instante el texto viejo). Hex literal por las clases de resultado.css: la página no
 * tiene tema.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

export default function TextoEditableDeLaPagina({
  valor,
  vacio,
  max,
  etiqueta,
  origen = null,
  acciones,
  quitar = null,
  onGuardar,
}: {
  valor: string | null;
  /** Lo que se lee sin texto: la invitación a escribirlo. */
  vacio: string;
  max: number;
  /** Para el lector de pantalla: qué texto es. */
  etiqueta: string;
  /** Una línea chica debajo, solo adentro: de dónde sale el texto. */
  origen?: ReactNode;
  /** Botones de más junto a Guardar; `poner` lleva un texto al cuadro (lo que sugiere Nexus, un texto anterior). */
  acciones?: (poner: (texto: string) => void) => ReactNode;
  /** Con un rótulo, un botón que guarda null (quitarlo, o volver al texto de la escala). */
  quitar?: string | null;
  /** Devuelve si se guardó: si no, el cuadro queda abierto con lo escrito. */
  onGuardar: (texto: string | null) => Promise<boolean>;
}) {
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState("");
  const [guardando, setGuardando] = useState(false);
  /** Lo recién guardado, con el valor que había: se muestra mientras la página no traiga uno nuevo. */
  const [recien, setRecien] = useState<{ texto: string | null; sobre: string | null } | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tip = caja.current?.closest<HTMLElement>(".rd-tip");
    if (!tip) return;
    if (editando) tip.dataset.fijada = "1";
    else delete tip.dataset.fijada;
    return () => {
      delete tip.dataset.fijada;
    };
  }, [editando]);

  const visible = recien && recien.sobre === valor ? recien.texto : valor;
  const abrir = () => {
    setBorrador(visible ?? "");
    setEditando(true);
  };
  const guardar = async (texto: string | null) => {
    const limpio = texto && texto.trim() ? texto.trim() : null;
    setGuardando(true);
    const ok = await onGuardar(limpio).finally(() => setGuardando(false));
    if (!ok) return;
    setRecien({ texto: limpio, sobre: valor });
    setEditando(false);
  };

  if (editando)
    return (
      <div ref={caja} className="rd-editor">
        <textarea
          aria-label={etiqueta}
          autoFocus
          value={borrador}
          maxLength={max}
          onChange={(e) => setBorrador(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditando(false);
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void guardar(borrador);
          }}
        />
        <div className="rd-editor-botones">
          <button
            type="button"
            className="rd-btn rd-btn-primary"
            disabled={guardando}
            aria-busy={guardando || undefined}
            onClick={() => void guardar(borrador)}
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          <button type="button" className="rd-btn rd-btn-ghost" disabled={guardando} onClick={() => setEditando(false)}>
            Cancelar
          </button>
          {quitar && (
            <button type="button" className="rd-btn rd-btn-ghost" disabled={guardando} onClick={() => void guardar(null)}>
              {quitar}
            </button>
          )}
          {acciones?.((t) => setBorrador(t.slice(0, max)))}
          <span className="rd-editor-nota">
            {borrador.length}/{max} · Ctrl+Enter guarda
          </span>
        </div>
      </div>
    );

  return (
    <div ref={caja}>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Editar: ${etiqueta}`}
        className="rd-editable-texto"
        onClick={abrir}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            abrir();
          }
        }}
      >
        {visible ? <span style={{ whiteSpace: "pre-line" }}>{visible}</span> : <span className="rd-editable-vacio">{vacio}</span>}
        {visible && (
          <span className="rd-editable-lapiz" aria-hidden="true">
            Editar
          </span>
        )}
      </div>
      {origen && <span className="rd-editable-origen">{origen}</span>}
    </div>
  );
}
