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
 *
 * El cuadro ocupa EXACTAMENTE el lugar del texto (9 nov, Elías: «al hacer clic, el cuadro cambia de tamaño y la información
 * queda cortada»): la misma letra, el mismo margen y el alto de lo escrito, que crece y se achica mientras se escribe
 * (`ajustarAlto`). Antes tenía un alto fijo y lo largo se cortaba con una barra.
 *
 * Del 23 al 24 nov, al pasar el cursor salía también «✨ Mejorar con IA» de esta pieza. Se fue (Elías: «por sección, no
 * por texto»): ahora va uno en el encabezado de cada sección (EdicionDelResumen / EdicionDeLaPagina › `mejorar`).
 *
 * `cola` (25 nov, Elías con TEC · AE): lo que va PEGADO AL FINAL del texto, en su mismo renglón, como el ícono (i) de de
 * dónde sale. Antes ese ícono iba después de este bloque y caía debajo de cada línea. Para que pueda ser su propio botón
 * (un botón dentro de otro no se anuncia), el que se enfoca y anuncia «Editar: …» es el texto (`rd-editable-boton`) y el
 * cuadro entero sigue abriendo el editor al tocarlo; un toque en la cola (o en su globo) no lo abre. La ÚLTIMA PALABRA va
 * con la cola en un renglón que no se corta (`rd-editable-fin`, `partirLaUltimaPalabra`): un botón siempre deja cortar el
 * renglón antes de él, y sin esto, con el texto justo al borde, el ícono bajaba solo. Mientras se edita, la cola va al
 * final de los botones: las citas se pueden mirar mientras se corrige.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** El texto partido antes de su última palabra: esa palabra y la cola van juntas, el renglón no se corta entre ellas. */
export function partirLaUltimaPalabra(texto: string): { antes: string; ultima: string } {
  const m = texto.match(/^([\s\S]*?)(\S+)\s*$/);
  return m ? { antes: m[1], ultima: m[2] } : { antes: texto, ultima: "" };
}

/** Un texto con algo pegado al final (lo que no se edita: quien no tiene permiso), con la misma regla del renglón. */
export function textoConCola(texto: string | null, cola: ReactNode): ReactNode {
  const { antes, ultima } = partirLaUltimaPalabra(texto ?? "");
  return (
    <>
      {antes}
      <span className="rd-editable-fin">
        {ultima}
        {cola}
      </span>
    </>
  );
}

/** El alto del cuadro: el de lo escrito (sin barra), y nunca menos que el texto que reemplazó. */
export function ajustarAlto(el: HTMLTextAreaElement, minimo = 0): void {
  el.style.height = "auto";
  const bordes = el.offsetHeight - el.clientHeight;
  el.style.height = `${Math.max(el.scrollHeight + bordes, minimo)}px`;
}

export default function TextoEditableDeLaPagina({
  valor,
  vacio,
  max,
  etiqueta,
  origen = null,
  acciones,
  quitar = null,
  cola = null,
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
  /** Pegado al final del texto, en su mismo renglón (el ícono de de dónde sale). Tocarlo no abre el editor. */
  cola?: ReactNode;
  /** Devuelve si se guardó: si no, el cuadro queda abierto con lo escrito. */
  onGuardar: (texto: string | null) => Promise<boolean>;
}) {
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState("");
  const [guardando, setGuardando] = useState(false);
  /** Lo recién guardado, con el valor que había: se muestra mientras la página no traiga uno nuevo. */
  const [recien, setRecien] = useState<{ texto: string | null; sobre: string | null } | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const cuadro = useRef<HTMLTextAreaElement>(null);
  /** El alto del texto al tocarlo: el cuadro arranca de ese tamaño. */
  const altoDelTexto = useRef(0);

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
  useLayoutEffect(() => {
    if (editando && cuadro.current) ajustarAlto(cuadro.current, altoDelTexto.current);
  }, [editando, borrador]);

  const abrir = () => {
    altoDelTexto.current = caja.current?.querySelector<HTMLElement>(".rd-editable-texto")?.offsetHeight ?? 0;
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
          ref={cuadro}
          rows={1}
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
          {cola && <span className="rd-editable-cola">{cola}</span>}
        </div>
      </div>
    );

  // Con cola, la última palabra va con ella (fuera del botón de editar, que no puede tener otro botón adentro).
  const partes = cola && visible ? partirLaUltimaPalabra(visible) : null;
  return (
    <div ref={caja}>
      {/* El cuadro se toca entero para editar; el foco va al texto, y la cola es otro botón a su lado (no adentro). */}
      <div className="rd-editable-texto" onClick={abrir}>
        <span
          role="button"
          tabIndex={0}
          aria-label={`Editar: ${etiqueta}`}
          className="rd-editable-boton"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              abrir();
            }
          }}
        >
          {visible ? <span style={{ whiteSpace: "pre-line" }}>{partes ? partes.antes : visible}</span> : <span className="rd-editable-vacio">{vacio}</span>}
        </span>
        {cola && (
          <span className="rd-editable-fin">
            {/* Como el resto del texto (el botón de editar se anuncia por su nombre, «Editar: …»), no se anuncia suelta. */}
            {partes?.ultima && <span aria-hidden="true">{partes.ultima}</span>}
            {/* Los eventos del globo (un portal) también suben por aquí: se cortan para que no abran el editor. */}
            <span className="rd-editable-cola" onClick={(e) => e.stopPropagation()}>
              {cola}
            </span>
          </span>
        )}
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
