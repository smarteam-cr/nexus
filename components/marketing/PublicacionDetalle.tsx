"use client";

/**
 * PublicacionDetalle — la publicación elegida en la pantalla Publicaciones (rediseño del 2026-10-04, sistema
 * «Nexus · interfaz interna»). Lado derecho de la lista: de quién es y en qué estado está, la vista previa del post
 * (avatar, texto y concepto de imagen), de qué posts sale y las acciones del estado.
 *
 * Decisiones que se ven acá:
 *  - Lo que sugiere el agente lleva la chispa azul; una vez que una persona la aceptó, es de esa persona y no.
 *  - «Ajustar con IA» ya no reemplaza el texto: deja una PROPUESTA azul que se usa o se descarta. Nada entra solo.
 *  - El concepto de imagen va en un recuadro punteado: la imagen no existe, se diseña aparte.
 *  - «Copiar texto» lo tiene todo el equipo, también quien solo puede mirar: copiar no cambia nada.
 *  - Enviar a HubSpot elige los canales en un Modal (antes, un popover a mano).
 */
import { useState } from "react";
import { Modal, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ideaState, JOURNEY_STAGE_META, type MarketingUsageTargetValue } from "@/lib/marketing/marketing-ui";
import { BotonAzul, BotonBlanco, BotonTexto, IconoDeSugerencia } from "@/components/ui/sistema";
import { AvatarDePublicacion, Chip, ChipAtencion, ChipHecho, RecuadroPunteado, Rotulo, diaYMesCr } from "./piezas";
import type { CampoEditable, CanalSocial, IdeaRow } from "./tipos";

const CANAL: Record<string, string> = {
  LinkedInCompanyPage: "LinkedIn",
  LinkedInProfile: "LinkedIn (perfil)",
  FacebookPage: "Facebook",
  Instagram: "Instagram",
};
const nombreDeCanal = (c: CanalSocial) => `${CANAL[c.type] ?? c.type} · ${c.name}`;

/** Lo que se le pide al agente con cada atajo. Van en tuteo: un pedido en voseo invita a contestar en voseo. */
const AJUSTES: Array<{ etiqueta: string; instruccion: string }> = [
  { etiqueta: "Más corto", instruccion: "Hazlo más corto y conciso, sin perder el mensaje central." },
  { etiqueta: "Más largo", instruccion: "Desarróllalo un poco más, con más detalle y contexto." },
  { etiqueta: "Más cercano", instruccion: "Reescríbelo con un tono más cercano y conversacional." },
];

export interface PublicacionDetalleProps {
  idea: IdeaRow;
  canEdit: boolean;
  /** Solo el equipo de Marketing publica para la página de Smarteam (el server lo hace cumplir igual). */
  canChooseSmarteam: boolean;
  busy: boolean;
  /** Cuántas publicaciones parecidas hay en su grupo, contándola (1 = ninguna). */
  versiones: number;
  /** Desde cuándo repite el agente este ángulo («8 jul»). */
  versionesDesde: string | null;
  versionesAbiertas: boolean;
  onVerVersiones: () => void;
  onDescartarOtras: () => void;
  onAccept: (destino: MarketingUsageTargetValue) => void;
  onApprove: () => void;
  onUnapprove: () => void;
  onDiscard: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onSaveField: (campo: CampoEditable, valor: string) => void;
  onAdjust: (instruccion: string) => Promise<string | null>;
  onCopy: (texto: string) => void;
  channels: CanalSocial[];
  channelsSupported: boolean;
  onSendHubspot: (channelKeys: string[]) => Promise<boolean>;
}

export default function PublicacionDetalle(p: PublicacionDetalleProps) {
  const { idea } = p;
  const estado = ideaState(idea);
  const esPersona = idea.postType === "PERSONA";
  const editable = p.canEdit && (estado === "seleccionada" || estado === "aprobada");
  const sugerida = estado === "sugerida";

  const [propuesta, setPropuesta] = useState<{ texto: string; etiqueta: string } | null>(null);
  const [ajustando, setAjustando] = useState<string | null>(null);
  const [libreAbierta, setLibreAbierta] = useState(false);
  const [instruccion, setInstruccion] = useState("");
  const [verFuentes, setVerFuentes] = useState(false);
  const [hubspotAbierto, setHubspotAbierto] = useState(false);

  const ajustar = async (etiqueta: string, texto: string) => {
    if (!texto.trim() || ajustando) return;
    setAjustando(etiqueta);
    const copy = await p.onAdjust(texto.trim());
    setAjustando(null);
    if (copy) {
      setPropuesta({ texto: copy, etiqueta });
      setLibreAbierta(false);
      setInstruccion("");
    }
  };

  const rotulo =
    estado === "sugerida"
      ? `Sugerida por el agente · ${diaYMesCr(idea.createdAt)}`
      : estado === "seleccionada"
        ? `Aceptada${idea.acceptedByName ? ` por ${idea.acceptedByName}` : ""}${idea.selectedAt ? ` · ${diaYMesCr(idea.selectedAt)}` : ""}`
        : estado === "aprobada"
          ? `Aprobada${idea.usedAt ? ` · ${diaYMesCr(idea.usedAt)}` : ""}`
          : `Descartada${idea.discardedAt ? ` · ${diaYMesCr(idea.discardedAt)}` : ""}`;

  const autores = [...new Set(idea.sources.map((s) => s.post.source.label ?? s.post.authorName ?? "una fuente"))];
  const fuentesTxt =
    idea.sources.length === 0
      ? "El agente no citó posts para esta"
      : `Inspirada en ${idea.sources.length} post${idea.sources.length === 1 ? "" : "s"} de ${
          autores.length <= 1 ? autores.join("") : `${autores.slice(0, -1).join(", ")} y ${autores[autores.length - 1]}`
        }`;

  return (
    <section
      aria-label="Publicación elegida"
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-surface p-5"
    >
      <div className="flex flex-col gap-1.5">
        <Rotulo azul={sugerida}>
          {sugerida && <IconoDeSugerencia className="h-[13px] w-[13px]" />}
          {rotulo}
        </Rotulo>
        <h2 className="text-lg font-semibold leading-[26px] text-fg">
          {editable ? (
            <InlineEditable value={idea.title} onSave={(v) => p.onSaveField("title", v)} textClass="text-lg font-semibold leading-[26px] text-fg" rows={2} />
          ) : (
            idea.title
          )}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          <Chip>{esPersona ? "Perfil personal" : "Página de empresa"}</Chip>
          {idea.journeyStage && <Chip>Etapa · {JOURNEY_STAGE_META[idea.journeyStage].label}</Chip>}
          {idea.pillar ? (
            <Chip>Tema · {idea.pillar.name}</Chip>
          ) : idea.suggestedPillarName ? (
            <ChipAtencion>Tema propuesto · {idea.suggestedPillarName}</ChipAtencion>
          ) : (
            <Chip>Sin tema</Chip>
          )}
          {!sugerida && idea.acceptedFor && (
            <Chip>{idea.acceptedFor === "SMARTEAM" ? "Para Smarteam" : "Uso personal"}</Chip>
          )}
          {idea.hubspotDraftAt && <ChipHecho>✓ Borrador en HubSpot · {diaYMesCr(idea.hubspotDraftAt)}</ChipHecho>}
        </div>
      </div>

      {sugerida && p.versiones > 1 && (
        <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-info-line bg-info-surface px-3 py-2.5 text-[13px] leading-[19px] text-info-ink">
          <span className="min-w-0 flex-1 basis-80">
            <b className="font-semibold">Hay {p.versiones - 1} publicaciones parecidas a esta.</b>{" "}
            {p.versionesDesde ? `El agente repite este ángulo desde el ${p.versionesDesde}. ` : ""}Quédate con una.
          </span>
          <BotonBlanco onClick={p.onVerVersiones}>{p.versionesAbiertas ? "Ocultar las parecidas" : `Ver las ${p.versiones}`}</BotonBlanco>
          {p.canEdit && <BotonTexto onClick={p.onDescartarOtras} disabled={p.busy}>Descartar las otras {p.versiones - 1}</BotonTexto>}
        </div>
      )}

      <article aria-label="Vista previa de la publicación" className="flex flex-col gap-3 rounded-xl border border-line p-4">
        <div className="flex items-center gap-2.5">
          <AvatarDePublicacion persona={esPersona} />
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-semibold leading-5 text-fg">{esPersona ? "Tu perfil" : "Smarteam"}</span>
            <span className="text-xs leading-4 text-fg-muted">
              {esPersona ? "Perfil personal · LinkedIn · se adapta a quien lo publique" : "Página de empresa · LinkedIn"}
            </span>
          </span>
        </div>

        {editable ? (
          <div className="flex flex-col gap-1.5">
            <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
              <IconoLapiz />
              Haz clic en el texto para editarlo. Se guarda al salir.
            </span>
            <InlineEditable
              value={idea.copy}
              onSave={(v) => p.onSaveField("copy", v)}
              textClass="whitespace-pre-wrap text-sm leading-[22px] text-fg-secondary"
              boxClass="rounded-lg border border-line px-3 py-2.5"
              rows={10}
            />
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-[22px] text-fg-secondary">{idea.copy}</p>
        )}

        {propuesta && (
          <div className="flex flex-col gap-2 rounded-lg border border-info-line bg-info-surface p-3">
            <Rotulo azul>
              <IconoDeSugerencia className="h-[13px] w-[13px]" />
              El agente propone · {propuesta.etiqueta}
            </Rotulo>
            <p className="whitespace-pre-wrap text-sm leading-[22px] text-fg">{propuesta.texto}</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 basis-64 text-xs text-fg-muted">Tu texto no cambia hasta que uses este.</span>
              <BotonTexto onClick={() => setPropuesta(null)}>Descartar</BotonTexto>
              <BotonAzul
                onClick={() => {
                  p.onSaveField("copy", propuesta.texto);
                  setPropuesta(null);
                }}
              >
                Usar este texto
              </BotonAzul>
            </div>
          </div>
        )}

        {editable && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-0.5 text-xs text-fg-muted">Ajustar con IA:</span>
              {AJUSTES.map((a) => (
                <BotonBlanco key={a.etiqueta} onClick={() => ajustar(a.etiqueta, a.instruccion)} disabled={!!ajustando}>
                  {a.etiqueta}
                </BotonBlanco>
              ))}
              <BotonBlanco onClick={() => setLibreAbierta((o) => !o)} disabled={!!ajustando}>
                Escribir qué cambiar…
              </BotonBlanco>
              {ajustando && (
                <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
                  <Spinner size="sm" /> Ajustando · {ajustando}
                </span>
              )}
            </div>
            {libreAbierta && (
              <div className="flex flex-col gap-2">
                <label className="sr-only" htmlFor={`instruccion-${idea.id}`}>
                  Qué cambiar del texto
                </label>
                <textarea
                  id={`instruccion-${idea.id}`}
                  value={instruccion}
                  onChange={(e) => setInstruccion(e.target.value)}
                  rows={2}
                  placeholder="Por ejemplo: más orientado a ventas, o cierra con una pregunta"
                  className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none"
                />
                <div className="flex justify-end gap-2">
                  <BotonTexto onClick={() => setLibreAbierta(false)}>Cancelar</BotonTexto>
                  <BotonBlanco onClick={() => ajustar("Tu pedido", instruccion)} disabled={!instruccion.trim() || !!ajustando}>
                    Pedir la propuesta
                  </BotonBlanco>
                </div>
              </div>
            )}
          </div>
        )}

        <RecuadroPunteado>
          <Rotulo>Concepto de imagen · se diseña aparte</Rotulo>
          {editable ? (
            <InlineEditable
              value={idea.imageConcept}
              onSave={(v) => p.onSaveField("imageConcept", v)}
              textClass="whitespace-pre-wrap text-[13px] leading-[19px] text-fg-secondary"
              rows={4}
            />
          ) : (
            <span className="whitespace-pre-wrap text-[13px] leading-[19px] text-fg-secondary">{idea.imageConcept}</span>
          )}
        </RecuadroPunteado>
      </article>

      <div className="flex flex-col gap-2">
        <span className="text-xs text-fg-muted">
          {fuentesTxt}
          {idea.sources.length > 0 && (
            <>
              {" · "}
              <button type="button" onClick={() => setVerFuentes((v) => !v)} className="font-medium text-brand hover:text-brand-light">
                {verFuentes ? "ocultar los posts" : "ver los posts"}
              </button>
            </>
          )}
        </span>
        {verFuentes && (
          <ul className="flex flex-col gap-1 rounded-lg border border-line bg-surface-muted px-3 py-2">
            {idea.sources.map((s) => (
              <li key={s.post.id} className="flex flex-wrap items-baseline gap-x-2 text-xs text-fg-secondary">
                <span className="font-medium text-fg">{s.post.source.label ?? s.post.authorName ?? "Fuente"}</span>
                <span className="text-fg-muted">{diaYMesCr(s.post.postedAt)}</span>
                {s.post.url ? (
                  <a href={s.post.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand-light">
                    Abrir en LinkedIn ↗
                  </a>
                ) : (
                  <span className="text-fg-muted">sin enlace</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {p.canEdit && <Acciones {...p} estado={estado} esPersona={esPersona} onHubspot={() => setHubspotAbierto(true)} />}
          <span className="flex-1" />
          <BotonTexto onClick={() => p.onCopy(idea.copy)}>Copiar texto</BotonTexto>
        </div>
        {p.canEdit && sugerida && (
          <span className="text-xs text-fg-muted">Atajos: A acepta · D descarta · ↓ y ↑ para moverte por la lista</span>
        )}
      </div>

      {hubspotAbierto && (
        <EnviarAHubspot
          canales={p.channels}
          yaEnviada={!!idea.hubspotDraftAt}
          desdeAceptadas={estado === "seleccionada"}
          onCerrar={() => setHubspotAbierto(false)}
          onEnviar={p.onSendHubspot}
        />
      )}
    </section>
  );
}

function Acciones(
  p: PublicacionDetalleProps & { estado: ReturnType<typeof ideaState>; esPersona: boolean; onHubspot: () => void },
) {
  const hubspotPosible = p.channelsSupported && p.channels.length > 0;
  if (p.estado === "sugerida") {
    if (!p.canChooseSmarteam) {
      return (
        <>
          <BotonAzul onClick={() => p.onAccept("PERSONAL")} disabled={p.busy}>Aceptar para mí</BotonAzul>
          <BotonTexto onClick={p.onDiscard} disabled={p.busy}>Descartar</BotonTexto>
        </>
      );
    }
    // Marketing elige el destino: en un post de empresa lo natural es Smarteam; en uno personal, su perfil.
    const [principal, secundario] = p.esPersona
      ? (["PERSONAL", "SMARTEAM"] as const)
      : (["SMARTEAM", "PERSONAL"] as const);
    return (
      <>
        <BotonAzul onClick={() => p.onAccept(principal)} disabled={p.busy}>
          {principal === "SMARTEAM" ? "Aceptar para Smarteam" : "Aceptar para mí"}
        </BotonAzul>
        <BotonBlanco onClick={() => p.onAccept(secundario)} disabled={p.busy}>
          {secundario === "SMARTEAM" ? "Para Smarteam" : "Para mí"}
        </BotonBlanco>
        <BotonTexto onClick={p.onDiscard} disabled={p.busy}>Descartar</BotonTexto>
      </>
    );
  }
  if (p.estado === "seleccionada") {
    return (
      <>
        <BotonAzul onClick={p.onApprove} disabled={p.busy}>Aprobar</BotonAzul>
        {hubspotPosible && (
          <BotonBlanco onClick={p.onHubspot} disabled={p.busy}>
            {p.idea.hubspotDraftAt ? "Reenviar a HubSpot" : "Enviar a HubSpot"}
          </BotonBlanco>
        )}
        <BotonTexto onClick={p.onDiscard} disabled={p.busy}>Descartar</BotonTexto>
      </>
    );
  }
  if (p.estado === "aprobada") {
    return (
      <>
        {hubspotPosible &&
          (p.idea.hubspotDraftAt ? (
            <BotonBlanco onClick={p.onHubspot} disabled={p.busy}>Reenviar a HubSpot</BotonBlanco>
          ) : (
            <BotonAzul onClick={p.onHubspot} disabled={p.busy}>Enviar a HubSpot</BotonAzul>
          ))}
        <BotonTexto onClick={p.onUnapprove} disabled={p.busy}>Reabrir</BotonTexto>
        <BotonTexto onClick={p.onDiscard} disabled={p.busy}>Descartar</BotonTexto>
      </>
    );
  }
  return (
    <>
      <BotonBlanco onClick={p.onRestore} disabled={p.busy}>Restaurar</BotonBlanco>
      <BotonTexto onClick={p.onDelete} className="text-danger-ink hover:text-danger-ink">Borrar para siempre</BotonTexto>
    </>
  );
}

function EnviarAHubspot({
  canales,
  yaEnviada,
  desdeAceptadas,
  onCerrar,
  onEnviar,
}: {
  canales: CanalSocial[];
  yaEnviada: boolean;
  desdeAceptadas: boolean;
  onCerrar: () => void;
  onEnviar: (channelKeys: string[]) => Promise<boolean>;
}) {
  // LinkedIn marcado de entrada si existe; si no, el primer canal.
  const [elegidos, setElegidos] = useState<Set<string>>(() => {
    const li = canales.find((c) => /linkedin/i.test(c.type));
    return new Set(li ? [li.channelKey] : canales[0] ? [canales[0].channelKey] : []);
  });
  const [enviando, setEnviando] = useState(false);
  const alternar = (k: string) =>
    setElegidos((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const enviar = async () => {
    if (elegidos.size === 0 || enviando) return;
    setEnviando(true);
    const ok = await onEnviar([...elegidos]);
    setEnviando(false);
    if (ok) onCerrar();
  };
  return (
    <Modal
      open
      onClose={onCerrar}
      size="sm"
      title={yaEnviada ? "Reenviar a HubSpot" : "Enviar a HubSpot"}
      description={`Se crea un borrador en el compositor social, uno por canal. Se publica desde HubSpot.${
        desdeAceptadas ? " Enviarla también la aprueba." : ""
      }`}
      footer={
        <>
          <BotonTexto onClick={onCerrar}>Cancelar</BotonTexto>
          <BotonAzul onClick={enviar} disabled={enviando || elegidos.size === 0}>
            {enviando ? "Creando…" : elegidos.size === 1 ? "Crear el borrador" : `Crear ${elegidos.size} borradores`}
          </BotonAzul>
        </>
      }
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Canales</legend>
        {canales.map((c) => (
          <label key={c.channelKey} className="flex cursor-pointer items-center gap-2 text-sm text-fg-secondary">
            <input type="checkbox" checked={elegidos.has(c.channelKey)} onChange={() => alternar(c.channelKey)} className="accent-brand" />
            {nombreDeCanal(c)}
          </label>
        ))}
      </fieldset>
    </Modal>
  );
}

function IconoLapiz() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
    </svg>
  );
}

/** Clic para editar; guarda al salir si cambió y no quedó vacío. Escape cancela. */
function InlineEditable({
  value,
  onSave,
  textClass,
  boxClass,
  rows,
}: {
  value: string;
  onSave: (v: string) => void;
  /** La tipografía: la misma leyendo y editando, así el texto no salta al hacer clic. */
  textClass: string;
  /** La caja en modo lectura (el borde que dice «esto se edita»). */
  boxClass?: string;
  rows: number;
}) {
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState("");
  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => {
          setBorrador(value);
          setEditando(true);
        }}
        title="Clic para editar"
        className={cn("block w-full cursor-text rounded-lg text-left transition-colors hover:bg-surface-hover", boxClass, textClass)}
      >
        {value}
      </button>
    );
  }
  return (
    <textarea
      value={borrador}
      onChange={(e) => setBorrador(e.target.value)}
      onBlur={() => {
        const t = borrador.trim();
        if (t && t !== value) onSave(t);
        setEditando(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setEditando(false);
      }}
      autoFocus
      rows={rows}
      className={cn("w-full resize-y rounded-lg border border-brand bg-surface px-3 py-2.5 focus:outline-none", textClass)}
    />
  );
}
