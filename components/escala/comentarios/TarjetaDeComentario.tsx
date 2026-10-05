"use client";

/**
 * components/escala/comentarios/TarjetaDeComentario.tsx — un comentario de la escala con su hilo.
 *
 * Arriba lo que lo distingue: el tipo, el estado, su número de Feedback, la versión en que se hizo y,
 * si «no calza», con qué cliente y qué perfil. Si la versión vigente cambió el texto comentado, se ve
 * al lado. Los botones salen de las reglas (`reglas.ts`); la API las vuelve a validar.
 *
 * Desde el 2026-10-05 el estado se decide en la bandeja de /feedback (cualquier super admin): acá solo
 * se ve, y quien revisa tiene el enlace para decidirlo allá. Responder lo puede cualquiera del equipo y
 * no cambia el estado.
 */
import { useState } from "react";
import { Avatar, Button, Textarea } from "@/components/ui";
import { haceCuanto } from "@/lib/documentacion/comentarios";
import { describirPerfil } from "@/lib/escala/documento/perfil";
import { COLUMNA, esColumna, numeroDeReporte } from "@/lib/feedback/reglas";
import {
  autoriaDe,
  ESTADOS_DE_COMENTARIO,
  etiquetaDeTipo,
  puedeBorrarComentario,
  puedeEditarComentario,
  type ComentarioVisto,
  type EstadoDeComentario,
} from "@/lib/escala/comentarios/reglas";
import { cn } from "@/lib/cn";
import CambioDeTexto from "./CambioDeTexto";

const TONO_DE_TIPO: Record<string, string> = {
  no_se_entiende: "border-line bg-surface-hover text-fg-secondary",
  no_calza: "border-warn-line bg-warn-surface text-warn-ink",
  propuesta: "border-info-line bg-info-surface text-info-ink",
};

/** El color dice el estado: sin revisar pide atención; respondido está cerrado bien; en la hoja de ruta, en curso. */
const TONO_DE_ESTADO: Record<EstadoDeComentario, string> = {
  abierto: "border-warn-line bg-warn-surface text-warn-ink",
  respondido: "border-success-line bg-success-surface text-success-ink",
  cambio_pendiente: "border-info-line bg-info-surface text-info-ink",
  descartado: "border-line bg-surface-hover text-fg-secondary",
};

export function EtiquetaDeEstado({ estado }: { estado: EstadoDeComentario }) {
  const e = ESTADOS_DE_COMENTARIO.find((x) => x.clave === estado);
  return <span className={cn("rounded-full border px-2 py-0.5 text-2xs font-semibold", TONO_DE_ESTADO[estado])}>{e?.etiqueta ?? estado}</span>;
}

/** Ctrl+Enter (o Cmd+Enter) envía. */
const esEnviar = (e: React.KeyboardEvent) => e.key === "Enter" && (e.ctrlKey || e.metaKey);

export interface AccionesDeComentario {
  responder: (id: string, cuerpo: string) => Promise<boolean>;
  editar: (id: string, datos: { cuerpo: string; decisionQueCambiaria: string | null }) => Promise<boolean>;
  borrar: (id: string) => Promise<boolean>;
}

export default function TarjetaDeComentario({
  c,
  yoEmail,
  esRevisor,
  textoDeHoy,
  versionVigente,
  acciones,
  conAncla = false,
}: {
  c: ComentarioVisto;
  yoEmail: string;
  /** Quien revisa el feedback (super admin): decide en /feedback y puede borrar. */
  esRevisor: boolean;
  /** El texto del ancla en la versión vigente (null = ya no existe). */
  textoDeHoy: string | null;
  versionVigente: string;
  acciones: AccionesDeComentario;
  /** Mostrar a qué identificador se ancla (cuando se mezclan los de un nivel y sus criterios). */
  conAncla?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [cuerpo, setCuerpo] = useState(c.cuerpo);
  const [decision, setDecision] = useState(c.decisionQueCambiaria ?? "");
  const [respuesta, setRespuesta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);

  const autoria = autoriaDe(c);
  const puedoEditar = puedeEditarComentario(autoria, yoEmail);
  const puedoBorrar = puedeBorrarComentario(autoria, yoEmail, esRevisor);
  const perfil = describirPerfil(c.perfil);
  const columna = c.tema && esColumna(c.tema.columna) ? COLUMNA[c.tema.columna].nombre : null;

  const enviarRespuesta = async () => {
    const t = respuesta.trim();
    if (!t || enviando) return;
    setEnviando(true);
    if (await acciones.responder(c.id, t)) setRespuesta("");
    setEnviando(false);
  };

  return (
    <article className="space-y-2.5 rounded-xl border border-line bg-surface px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("rounded-full border px-2 py-0.5 text-2xs font-semibold", TONO_DE_TIPO[c.tipo])}>{etiquetaDeTipo(c.tipo)}</span>
        <EtiquetaDeEstado estado={c.estado} />
        {conAncla && <span className="rounded-full border border-line bg-surface px-1.5 py-0.5 text-2xs tabular-nums text-fg-secondary">{c.ancla}</span>}
        <span className="ml-auto text-2xs text-fg-muted" title={new Date(c.createdAt).toLocaleString("es-CR")}>
          {c.numero ? `${numeroDeReporte(c.numero)} · ` : ""}
          {haceCuanto(c.createdAt)} · en la {c.versionEscala}
        </span>
      </div>

      <CambioDeTexto antes={c.textoAnclado} hoy={textoDeHoy} versionComentada={c.versionEscala} versionVigente={versionVigente} />

      {(c.cliente || perfil || c.edicion) && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-secondary">
          {c.edicion && (
            <span
              className="rounded-full border border-line bg-surface px-1.5 py-0.5 text-2xs text-fg-secondary"
              title="Se comentó leyendo la escala con esta edición: el texto comentado es el de esa edición."
            >
              Edición {c.edicion.nombre}
            </span>
          )}
          {c.cliente && (
            <span>
              <span className="text-fg-muted">Cliente · </span>
              <span className="font-semibold text-fg">{c.cliente.nombre}</span>
              {!c.cliente.id && <span className="text-fg-muted"> (no está en Nexus)</span>}
            </span>
          )}
          {perfil && (
            <span className="rounded-full border border-line bg-surface px-1.5 py-0.5 text-2xs text-fg-secondary" title="El perfil de negocio del caso">
              {perfil}
            </span>
          )}
        </p>
      )}

      {editando ? (
        <div className="space-y-1.5">
          <Textarea autoFocus rows={3} value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} aria-label="Editar el comentario" />
          {c.tipo !== "no_se_entiende" && (
            <Textarea rows={2} value={decision} onChange={(e) => setDecision(e.target.value)} placeholder="¿Qué decisión con el cliente cambiaría? (opcional)" aria-label="Qué decisión cambiaría" />
          )}
          <div className="flex justify-end gap-1.5">
            <Button size="xs" variant="secondary" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
            <Button
              size="xs"
              variant="primary"
              disabled={!cuerpo.trim()}
              onClick={async () => {
                if (await acciones.editar(c.id, { cuerpo: cuerpo.trim(), decisionQueCambiaria: decision.trim() || null })) setEditando(false);
              }}
            >
              Guardar
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg">{c.cuerpo}</p>
          {c.decisionQueCambiaria && (
            <p className="text-xs text-fg-secondary">
              <span className="text-fg-muted">Qué decisión cambiaría · </span>
              {c.decisionQueCambiaria}
            </p>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-2 text-2xs">
        <Avatar name={c.autor.nombre} src={c.autor.foto ?? undefined} colorSeed={c.autor.email} size="xs" />
        <span className="font-semibold text-fg-secondary">{c.autor.nombre}</span>
        {c.editadoAt && <span className="text-fg-muted">· editado</span>}
        {!editando && puedoEditar && (
          <button type="button" className="text-fg-muted hover:text-fg" onClick={() => setEditando(true)}>
            Editar
          </button>
        )}
        {!editando &&
          puedoBorrar &&
          (confirmarBorrar ? (
            <>
              <button type="button" className="font-semibold text-danger-ink" onClick={() => void acciones.borrar(c.id)}>
                Sí, borrar
              </button>
              <button type="button" className="text-fg-muted hover:text-fg" onClick={() => setConfirmarBorrar(false)}>
                No
              </button>
            </>
          ) : (
            <button type="button" className="text-fg-muted hover:text-danger-ink" onClick={() => setConfirmarBorrar(true)}>
              Borrar
            </button>
          ))}
        {esRevisor && (
          <a href={`/feedback?reporte=${c.id}`} className="ml-auto font-semibold text-brand hover:text-brand-light">
            {c.estado === "abierto" ? "Decidir en Feedback →" : "Ver en Feedback →"}
          </a>
        )}
      </div>

      {c.estado === "cambio_pendiente" && (
        <div className="rounded-lg border border-info-line bg-info-surface px-3 py-2 text-xs leading-relaxed text-info-ink">
          <p className="font-semibold">
            En la hoja de ruta{c.tema ? ` · «${c.tema.titulo}»` : ""}
            {columna ? ` · ${columna}` : ""}
          </p>
          {c.cambio && (
            <>
              <p className="mt-1">
                <span className="opacity-80">Qué cambiaría · </span>
                {c.cambio.que}
              </p>
              {c.cambio.caso && (
                <p>
                  <span className="opacity-80">Caso · </span>
                  {c.cambio.caso}
                </p>
              )}
              <p>
                <span className="opacity-80">Qué decisión cambiaría · </span>
                {c.cambio.decision}
              </p>
            </>
          )}
        </div>
      )}
      {c.estado === "descartado" && c.motivoDescarte && (
        <p className="text-xs text-fg-muted">
          <span className="font-semibold">No se hará · </span>
          {c.motivoDescarte}
        </p>
      )}

      {c.respuestas.length > 0 && (
        <ul className="space-y-2.5 border-l-2 border-line pl-3">
          {c.respuestas.map((r) => (
            <li key={r.id} className="flex gap-2">
              <Avatar name={r.autor.nombre} src={r.autor.foto ?? undefined} colorSeed={r.autor.email} size="xs" />
              <div className="min-w-0 flex-1">
                <p className="text-2xs">
                  <span className="font-semibold text-fg">{r.autor.nombre}</span> <span className="text-fg-muted">{haceCuanto(r.createdAt)}</span>
                </p>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-fg">{r.cuerpo}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5">
        <Textarea
          rows={1}
          value={respuesta}
          placeholder="Responder…"
          aria-label="Responder el comentario"
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
    </article>
  );
}
