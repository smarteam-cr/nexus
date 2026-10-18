"use client";

/**
 * components/business-cases/BibliotecaDeModulos.tsx — la biblioteca de módulos en el editor de la propuesta.
 *
 *   · ElegirModulo        → «Agregar módulo»: la lista de la biblioteca, con lo que cada uno trae del
 *                            cliente para el que se armó. Elegir uno inserta una COPIA al final.
 *   · GuardarComoModulo   → «Guardar como módulo» desde una sección personalizada. Si sus textos nombran a
 *                            la empresa (o traen correos, teléfonos, montos), lo muestra antes de guardar.
 *   · AdaptarAEstaEmpresa → la IA propone cambiar los TEXTOS del HTML para el cliente de esta propuesta;
 *                            la persona marca qué cambios aplica. El diseño no se toca: ver
 *                            `lib/landing/html-textos.ts`.
 *
 * Ver DECISIONS «La biblioteca de módulos de las propuestas».
 */
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { AgentProposal } from "@/components/ai/AgentProposal";
import { NOMBRE_DEL_HALLAZGO, resumenDeHallazgos, type Hallazgo } from "@/lib/landing/modulos-biblioteca";
import { aplicarTextos, extraerTextos, huellaDelHtml } from "@/lib/landing/html-textos";
import { cambiosElegidos, type PropuestaDeAdaptacion } from "@/lib/landing/adaptar-modulo";

export interface ModuloDeLaLista {
  id: string;
  nombre: string;
  descripcion: string | null;
  tipo: string;
  tipoNombre: string;
  origenClienteNombre: string | null;
  avisos: Hallazgo[];
  resumenDeAvisos: string;
  usos: number;
  creadoPorEmail: string;
}

function ListaDeHallazgos({ hallazgos }: { hallazgos: readonly Hallazgo[] }) {
  return (
    <ul className="mt-2 space-y-1 text-xs text-warn-ink">
      {hallazgos.slice(0, 12).map((h, i) => (
        <li key={i}>
          {NOMBRE_DEL_HALLAZGO[h.tipo]}: <span className="font-semibold">«{h.texto}»</span>
          {h.veces > 1 ? ` (${h.veces} veces)` : ""}
        </li>
      ))}
    </ul>
  );
}

/** «Agregar módulo»: la biblioteca. `onElegir` recibe el módulo; quien llama crea la sección. */
export function ElegirModulo({ onElegir, onCancelar }: { onElegir: (m: ModuloDeLaLista) => void; onCancelar: () => void }) {
  const toast = useToast();
  const [modulos, setModulos] = useState<ModuloDeLaLista[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    let vivo = true;
    void fetch("/api/business-cases/modulos")
      .then((r) => r.json())
      .then((b: { modulos?: ModuloDeLaLista[]; aviso?: string; error?: string }) => {
        if (!vivo) return;
        setModulos(b.modulos ?? []);
        setAviso(b.aviso ?? b.error ?? null);
      })
      .catch(() => vivo && (setModulos([]), setAviso("No se pudo leer la biblioteca.")));
    return () => {
      vivo = false;
    };
  }, []);

  const archivar = async (m: ModuloDeLaLista) => {
    if (!confirm(`¿Archivar «${m.nombre}»?\n\nDeja de ofrecerse en la biblioteca. Las propuestas donde ya se insertó no cambian.`)) return;
    const res = await fetch(`/api/business-cases/modulos/${m.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body?.error ?? "No se pudo archivar.");
      return;
    }
    setModulos((ms) => (ms ?? []).filter((x) => x.id !== m.id));
    toast.success("Módulo archivado.");
  };

  const q = filtro.trim().toLowerCase();
  const visibles = (modulos ?? []).filter(
    (m) => !q || `${m.nombre} ${m.descripcion ?? ""} ${m.origenClienteNombre ?? ""} ${m.tipoNombre}`.toLowerCase().includes(q),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onCancelar()}
          placeholder="Buscar en la biblioteca…"
          className="min-w-64 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-fg outline-none focus:border-brand"
        />
        <Button size="sm" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
      {aviso && <p className="text-xs text-warn-ink">{aviso}</p>}
      {modulos === null ? (
        <p className="text-xs text-fg-muted">Cargando la biblioteca…</p>
      ) : visibles.length === 0 ? (
        <p className="text-xs text-fg-muted">
          {modulos.length === 0
            ? "La biblioteca está vacía. Para sumar uno, abre una sección que hayas creado y toca «Guardar como módulo»."
            : "Ningún módulo coincide con la búsqueda."}
        </p>
      ) : (
        <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {visibles.map((m) => (
            <li key={m.id} className="rounded-lg border border-line bg-surface p-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fg">{m.nombre}</p>
                  <p className="text-xs text-fg-muted">
                    {m.tipoNombre}
                    {m.origenClienteNombre ? ` · armado para ${m.origenClienteNombre}` : ""}
                    {m.usos > 0 ? ` · usado ${m.usos} ${m.usos === 1 ? "vez" : "veces"}` : ""}
                  </p>
                  {m.descripcion && <p className="mt-1 text-xs text-fg-secondary">{m.descripcion}</p>}
                  {m.resumenDeAvisos && (
                    <p className="mt-1 text-xs text-warn-ink">
                      ⚠ {m.resumenDeAvisos}
                      {m.tipo === "html" ? " Después de agregarlo, usa «Adaptar a esta empresa»." : " Revísalo después de agregarlo."}
                    </p>
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <Button size="sm" variant="primary" onClick={() => onElegir(m)}>
                    Agregar
                  </Button>
                  <button type="button" onClick={() => void archivar(m)} className="text-xs text-fg-muted hover:text-fg" title="Archivar este módulo">
                    Archivar
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** «Guardar como módulo». */
export function GuardarComoModulo({
  open,
  onClose,
  businessCaseId,
  sectionId,
  nombreInicial,
}: {
  open: boolean;
  onClose: () => void;
  businessCaseId: string;
  sectionId: string;
  nombreInicial: string;
}) {
  const toast = useToast();
  const [nombre, setNombre] = useState(nombreInicial);
  const [descripcion, setDescripcion] = useState("");
  const [hallazgos, setHallazgos] = useState<Hallazgo[] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async (confirmarAvisos: boolean) => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/business-cases/modulos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessCaseId, sectionId, nombre, descripcion, confirmarAvisos }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && Array.isArray(body?.hallazgos)) {
        setHallazgos(body.hallazgos as Hallazgo[]);
        return;
      }
      if (!res.ok) {
        setError(body?.error ?? "No se pudo guardar el módulo.");
        return;
      }
      toast.success("Quedó en la biblioteca: ya se puede agregar en otra propuesta.");
      onClose();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Guardar como módulo"
      description="Queda en la biblioteca de módulos de las propuestas para que cualquiera de Ventas lo agregue en otra."
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          {hallazgos ? (
            <Button size="sm" variant="primary" onClick={() => void guardar(true)} disabled={guardando || !nombre.trim()}>
              {guardando ? "Guardando…" : "Guardar igual"}
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={() => void guardar(false)} disabled={guardando || !nombre.trim()}>
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="text-xs text-fg-muted">Nombre del módulo</span>
          <input
            value={nombre}
            maxLength={80}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-fg outline-none focus:border-brand"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-fg-muted">Para qué sirve (opcional)</span>
          <textarea
            value={descripcion}
            maxLength={400}
            rows={2}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej. Tabs de proyectos con sus casos de uso, para propuestas con varios servicios."
            className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-fg outline-none focus:border-brand"
          />
        </label>
        {hallazgos && (
          <div className="rounded-lg border border-warn-line bg-warn-surface p-3">
            <p className="text-sm font-semibold text-warn-ink">Este módulo trae datos de esta empresa</p>
            <p className="mt-1 text-xs text-warn-ink">
              {resumenDeHallazgos(hallazgos)} Si lo guardas igual, quien lo agregue en otra propuesta lo va a ver, y en un HTML
              podrá usar «Adaptar a esta empresa». Si prefieres, cancela y quítalos antes.
            </p>
            <ListaDeHallazgos hallazgos={hallazgos} />
          </div>
        )}
        {error && <p className="text-xs text-danger-ink">{error}</p>}
      </div>
    </Modal>
  );
}

/** «Adaptar a esta empresa»: propone, la persona elige, y `onAplicar` recibe el HTML nuevo. */
export function AdaptarAEstaEmpresa({
  open,
  onClose,
  businessCaseId,
  sectionId,
  html,
  onAplicar,
}: {
  open: boolean;
  onClose: () => void;
  businessCaseId: string;
  sectionId: string;
  html: string;
  onAplicar: (htmlNuevo: string) => Promise<boolean> | boolean;
}) {
  const toast = useToast();
  const [propuesta, setPropuesta] = useState<(PropuestaDeAdaptacion & { huella: string }) | null>(null);
  const [elegidos, setElegidos] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    setPropuesta(null);
    setError(null);
    void fetch(`/api/business-cases/${businessCaseId}/canvas-sections/${sectionId}/adaptar`, { method: "POST" })
      .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (!vivo) return;
        if (!ok) {
          setError(body?.error ?? "No se pudo adaptar el módulo.");
          return;
        }
        const p = body as PropuestaDeAdaptacion & { huella: string };
        setPropuesta(p);
        // Todo marcado, salvo lo que trae un aviso (voseo): eso lo decide la persona.
        setElegidos(new Set(p.cambios.filter((c) => !c.aviso).map((c) => c.id)));
      })
      .catch(() => vivo && setError("No se pudo adaptar el módulo."));
    return () => {
      vivo = false;
    };
  }, [open, businessCaseId, sectionId]);

  const aplicar = async () => {
    if (!propuesta) return;
    // Los rangos solo valen sobre el MISMO HTML: si alguien lo cambió mientras tanto, no se aplica.
    if (huellaDelHtml(html) !== propuesta.huella) {
      setError("El HTML de la sección cambió desde que se pidió la adaptación. Ciérrala y vuelve a pedirla.");
      return;
    }
    setAplicando(true);
    try {
      const nuevo = aplicarTextos(html, extraerTextos(html), cambiosElegidos(propuesta, elegidos));
      const ok = await onAplicar(nuevo);
      if (ok) {
        toast.success(`Listo: ${elegidos.size} ${elegidos.size === 1 ? "texto cambiado" : "textos cambiados"}.`);
        onClose();
      }
    } finally {
      setAplicando(false);
    }
  };

  const alternar = (id: number) =>
    setElegidos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Modal open={open} onClose={onClose} title="Adaptar a esta empresa" size="xxl">
      {error ? (
        <p className="text-sm text-danger-ink">{error}</p>
      ) : !propuesta ? (
        <p className="text-sm text-fg-muted">La IA está leyendo los textos de la sección… El diseño no se toca: solo cambian los textos que elijas.</p>
      ) : propuesta.cambios.length === 0 ? (
        <p className="text-sm text-fg-muted">La IA no encontró nada que cambiar para esta empresa.</p>
      ) : (
        <AgentProposal
          title={`${propuesta.cambios.length} ${propuesta.cambios.length === 1 ? "texto para cambiar" : "textos para cambiar"}`}
          subtitle="Revisa cada uno y desmarca lo que no quieras. El diseño y el código de la sección no cambian."
          warnings={[
            ...propuesta.notas,
            ...(propuesta.sinRevisar > 0
              ? [`${propuesta.sinRevisar} textos del final no entraron en el pedido: revísalos a mano.`]
              : []),
          ]}
          applyLabel={`Aplicar ${elegidos.size}`}
          applyDisabled={elegidos.size === 0}
          applying={aplicando}
          onApply={aplicar}
          onDiscard={onClose}
        >
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {propuesta.cambios.map((c) => (
              <li key={c.id} className="flex items-start gap-3 rounded-lg border border-line bg-surface p-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={elegidos.has(c.id)}
                  onChange={() => alternar(c.id)}
                  aria-label={`Aplicar el cambio ${c.id + 1}`}
                />
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <p className="text-fg-muted line-through">{c.antes}</p>
                  <p className="text-fg">{c.despues}</p>
                  {c.aviso && <p className="text-xs text-warn-ink">⚠ {c.aviso}</p>}
                </div>
              </li>
            ))}
          </ul>
        </AgentProposal>
      )}
    </Modal>
  );
}
