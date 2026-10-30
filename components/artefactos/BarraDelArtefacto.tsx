"use client";

/**
 * components/artefactos/BarraDelArtefacto.tsx — la barra de un documento de un tipo que admite copias (etapa V3 y V4 de
 * docs/artefactos-plan.md): su nombre, su estado (en construcción o terminado), su enlace para compartir pantalla, el
 * orden de los de su tipo y «Crear otra». La misma para el documento de siempre y para cada copia: son todas iguales
 * (Elías, 29 oct). Archivar es solo de las copias.
 *
 * UI interna: primitivas de components/ui, tokens semánticos y tuteo.
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, ConfirmDialog, IconButton, Input, Menu, Modal, Segmentado } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { tipoDeArtefacto } from "@/lib/artefactos/tipos";
import { rutaDelEnlace } from "@/lib/artefactos/enlaces";
import { ROTULO_DEL_ESTADO } from "@/lib/artefactos/copias";
import OrdenarArtefactosModal, { type DocumentoParaOrdenar } from "./OrdenarArtefactosModal";

interface Enlace {
  enlace: string | null;
  desde: string | null;
  ultimaVista: string | null;
}

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "America/Costa_Rica" });

/** El enlace propio del documento: crearlo, copiarlo, abrirlo y dejar de compartir. */
function CompartirModal({ projectId, canvasId, nombre, open, onClose }: { projectId: string; canvasId: string; nombre: string; open: boolean; onClose: () => void }) {
  const base = rutaDelEnlace({ projectId, canvasId });
  /** null = leyendo; «error» = no se pudo leer (no es lo mismo que «no se comparte»). */
  const [estado, setEstado] = useState<Enlace | "error" | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const r = await fetch(base).catch(() => null);
      const j = r?.ok ? ((await r.json().catch(() => null)) as Enlace | null) : null;
      setEstado(j ?? "error");
    })();
  }, [open, base]);

  const cambiar = async (metodo: "POST" | "DELETE") => {
    setTrabajando(true);
    try {
      const r = await fetch(base, { method: metodo });
      const j = (await r.json().catch(() => null)) as (Enlace & { error?: string }) | null;
      if (!r.ok || !j) return toast.error(j?.error ?? "No se pudo. Vuelve a intentarlo.");
      setEstado(j);
      if (metodo === "DELETE") toast.success("Dejaste de compartirlo: el enlace ya no abre.");
    } catch {
      toast.error("Error de conexión.");
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Compartir «${nombre}»`}
      description="Un enlace propio de este documento, sin contraseña. Muestra lo que está escrito ahora, sin lo oculto ni lo interno: sirve para compartir pantalla."
    >
      {estado === "error" ? (
        <Alert variant="danger">No se pudo leer si este documento se comparte. Cierra y vuelve a intentarlo.</Alert>
      ) : estado === null ? (
        <p className="text-sm text-fg-muted">Leyendo…</p>
      ) : estado.enlace ? (
        <div className="space-y-3">
          <Input readOnly value={estado.enlace} onFocus={(e) => e.currentTarget.select()} aria-label="El enlace" />
          <p className="text-xs text-fg-muted">
            {estado.desde ? `Compartido desde el ${fecha(estado.desde)}.` : ""}
            {estado.ultimaVista ? ` Se abrió por última vez el ${fecha(estado.ultimaVista)}.` : " Todavía nadie lo abrió."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => void navigator.clipboard?.writeText(estado.enlace!).then(() => toast.success("Enlace copiado."))}>
              Copiar el enlace
            </Button>
            <Button size="sm" variant="secondary" onClick={() => window.open(estado.enlace!, "_blank", "noopener,noreferrer")}>
              Abrirlo
            </Button>
            <Button size="sm" variant="destructive" disabled={trabajando} onClick={() => void cambiar("DELETE")}>
              Dejar de compartir
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-fg-secondary">Solo lo ve el equipo. Con el enlace lo abre cualquiera que lo tenga, hasta que dejes de compartirlo.</p>
          <Button size="sm" variant="primary" loading={trabajando} onClick={() => void cambiar("POST")}>
            Crear el enlace
          </Button>
        </div>
      )}
    </Modal>
  );
}

export default function BarraDelArtefacto({
  projectId,
  canvasId,
  tipo,
  nombre,
  esCopia,
  terminado,
  delTipo,
  compartible,
  onCambio,
  onCrearOtra,
  onArchivada,
}: {
  projectId: string;
  canvasId: string;
  tipo: string;
  nombre: string;
  esCopia: boolean;
  terminado: boolean;
  /** Todos los documentos del tipo, en su orden (para «Ordenar»). */
  delTipo: readonly DocumentoParaOrdenar[];
  /** false = no se ofrece compartir (un proyecto de prueba). */
  compartible: boolean;
  /** Algo cambió (nombre, estado, orden): el panel vuelve a leer el listado. */
  onCambio: () => void | Promise<unknown>;
  onCrearOtra: () => void;
  onArchivada?: () => void;
}) {
  const t = tipoDeArtefacto(tipo);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(nombre);
  const [guardando, setGuardando] = useState(false);
  const [compartir, setCompartir] = useState(false);
  const [ordenar, setOrdenar] = useState(false);
  /** El estado elegido mientras se guarda (optimista); null = el que dice el listado. */
  const [estadoElegido, setEstadoElegido] = useState<boolean | null>(null);
  const estadoLocal = estadoElegido ?? terminado;
  const toast = useToast();
  const base = `/api/projects/${projectId}/artefactos/${canvasId}`;
  const [confirmarArchivo, setConfirmarArchivo] = useState(false);


  const patch = useCallback(
    async (body: object): Promise<boolean> => {
      const r = await fetch(base, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
      const j = (await r?.json().catch(() => null)) as { error?: string } | null;
      if (!r?.ok) {
        toast.error(j?.error ?? "No se pudo guardar.");
        return false;
      }
      await onCambio();
      return true;
    },
    [base, onCambio, toast],
  );

  const guardarNombre = async () => {
    const n = borrador.trim();
    if (!n || n === nombre) return setEditando(false);
    setGuardando(true);
    if (await patch({ nombre: n })) setEditando(false);
    setGuardando(false);
  };

  const archivar = async () => {
    setConfirmarArchivo(false);
    const r = await fetch(base, { method: "DELETE" }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { error?: string } | null;
    if (!r?.ok) return toast.error(j?.error ?? "No se pudo archivar.");
    toast.success(`«${nombre}» quedó archivado: ya no está en el riel ni lo leen los agentes.`, {
      action: { label: "Deshacer", onClick: () => void patch({ archivado: false }) },
    });
    onArchivada?.();
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {editando ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void guardarNombre();
            }}
          >
            <Input autoFocus value={borrador} maxLength={120} onChange={(e) => setBorrador(e.target.value)} aria-label="Nombre del documento" className="min-w-0 flex-1" />
            <Button size="xs" variant="primary" type="submit" loading={guardando}>
              Guardar
            </Button>
            <Button size="xs" variant="secondary" type="button" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </form>
        ) : (
          <>
            <span className="text-fg-muted">{t?.nombre ?? "Documento"}</span>
            <span className="min-w-0 truncate font-semibold text-fg" title={nombre}>
              {nombre}
            </span>
            <IconButton
              size="sm"
              aria-label="Cambiar el nombre"
              title="Cambiar el nombre"
              onClick={() => {
                setBorrador(nombre);
                setEditando(true);
              }}
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5" aria-hidden="true">
                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
                </svg>
              }
            />
          </>
        )}
      </div>
      <Segmentado
        etiqueta="Estado del documento"
        opciones={[
          { clave: "en_construccion", etiqueta: ROTULO_DEL_ESTADO.en_construccion, title: "Quien lo lee lo toma como un borrador que todavía cambia" },
          { clave: "terminado", etiqueta: ROTULO_DEL_ESTADO.terminado, title: "Quien lo lee lo toma como acordado" },
        ]}
        valor={estadoLocal ? "terminado" : "en_construccion"}
        onCambio={(k) => {
          const nuevo = k === "terminado";
          setEstadoElegido(nuevo);
          // Al volver, manda el listado (`onCambio` lo vuelve a leer); si falló, vuelve a lo de antes.
          void patch({ terminado: nuevo }).then(() => setEstadoElegido(null));
        }}
      />
      {t?.clientFacing && compartible && (
        <Button size="xs" variant="secondary" onClick={() => setCompartir(true)}>
          Compartir
        </Button>
      )}
      <Menu
        align="end"
        triggerTitle="Más"
        trigger={
          <span className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-hover px-2.5 py-1 text-fg-secondary hover:text-fg">
            Más
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        }
        items={[
          { key: "otra", label: `Crear otr${t?.conArticulo.startsWith("una") ? "a" : "o"} ${(t?.nombre ?? "documento").toLowerCase()}`, onSelect: onCrearOtra },
          ...(delTipo.length > 1 ? [{ key: "ordenar", label: `Ordenar (${delTipo.length})`, onSelect: () => setOrdenar(true) }] : []),
          ...(esCopia ? [{ key: "archivar", label: "Archivar", danger: true, separatorBefore: true, onSelect: () => setConfirmarArchivo(true) }] : []),
        ]}
      />
      <ConfirmDialog
        open={confirmarArchivo}
        title={`¿Archivar «${nombre}»?`}
        description="Sale del riel y los agentes dejan de leerlo. Nada se borra, pero si tiene enlace deja de abrir y, al recuperarlo, hay que crear uno nuevo."
        confirmLabel="Archivar"
        onCancel={() => setConfirmarArchivo(false)}
        onConfirm={() => void archivar()}
      />
      <CompartirModal projectId={projectId} canvasId={canvasId} nombre={nombre} open={compartir} onClose={() => setCompartir(false)} />
      <OrdenarArtefactosModal
        projectId={projectId}
        tipo={tipo}
        nombreDelTipo={t?.nombre ?? "los documentos"}
        documentos={delTipo}
        open={ordenar}
        onClose={() => setOrdenar(false)}
        onGuardado={onCambio}
      />
    </div>
  );
}
