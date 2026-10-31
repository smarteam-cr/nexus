"use client";

/**
 * components/artefactos/NuevoArtefactoModal.tsx — CREAR UN ARTEFACTO en el proyecto (etapa V3 de docs/artefactos-plan.md):
 * el tipo, su plantilla, el nombre y desde dónde empieza (en blanco con la plantilla, o duplicando un documento del mismo
 * tipo). Crear no gasta IA: se genera después, desde el documento.
 *
 * Las plantillas son las tarjetas de «Elegir plantilla», con su descripción y sus secciones (Elías, 30 oct). La elegida se
 * guarda por tipo y se deriva: volver a un tipo conserva lo elegido, y lo que se manda es siempre lo que está marcado.
 *
 * UI interna: primitivas de components/ui, tokens semánticos y tuteo.
 */
import { useEffect, useMemo, useState } from "react";
import { Button, Field, Input, Modal, Select } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { TarjetaDePlantilla } from "@/components/canvas/ElegirPlantilla";
import { seccionesDeUnaCopia } from "@/lib/artefactos/catalogo";
import { plantillaDelTipo, plantillasDelTipo, tipoDeArtefacto, tiposCreablesEnElProyecto } from "@/lib/artefactos/tipos";
import { cn } from "@/lib/cn";

export interface DocumentoParaDuplicar {
  id: string;
  nombre: string;
  tipo: string;
}

export default function NuevoArtefactoModal({
  projectId,
  open,
  onClose,
  tipoInicial,
  documentos,
  onCreado,
  onActivarPieza,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  /** El tipo ya elegido («Crear otra planificación»). Sin él, se elige en el modal. */
  tipoInicial?: string | null;
  /** Los documentos del proyecto que se pueden duplicar (de cualquier tipo: se filtran por el elegido). */
  documentos: readonly DocumentoParaDuplicar[];
  onCreado: (canvasId: string) => void;
  /** Un tipo que no lleva copias (`seAbreUna`): abre su pieza en vez de crear un documento. */
  onActivarPieza: (slug: string) => void;
}) {
  const tipos = useMemo(() => tiposCreablesEnElProyecto(), []);
  const [tipo, setTipo] = useState<string>(tipoInicial ?? tipos[0]?.id ?? "");
  const [elegidas, setElegidas] = useState<Record<string, string>>({});
  const [nombre, setNombre] = useState("");
  const [desde, setDesde] = useState<string>("");
  const [creando, setCreando] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- cada apertura arranca de cero */
    setTipo(tipoInicial ?? tipos[0]?.id ?? "");
    setElegidas({});
    setNombre("");
    setDesde("");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, tipoInicial, tipos]);

  const elegirTipo = (id: string) => {
    setTipo(id);
    setDesde("");
  };

  const plantillas = plantillasDelTipo(tipo);
  const plantilla = plantillas.find((p) => p.id === elegidas[tipo]) ?? plantillaDelTipo(tipo);
  const delTipo = documentos.filter((d) => d.tipo === tipo);
  const t = tipoDeArtefacto(tipo);
  const duplicado = delTipo.find((d) => d.id === desde);

  /* El nombre que toma si la persona no escribe uno: el del tipo con su plantilla, numerado si ya existe. */
  const sugerido = useMemo(() => {
    const base = duplicado ? `${duplicado.nombre} (copia)` : plantillas.length > 1 && plantilla ? `${t?.nombre ?? ""} · ${plantilla.nombre}` : (t?.nombre ?? "");
    const usados = new Set(documentos.map((d) => d.nombre));
    if (!usados.has(base)) return base;
    for (let n = 2; ; n++) if (!usados.has(`${base} ${n}`)) return `${base} ${n}`;
  }, [documentos, duplicado, plantilla, plantillas.length, t?.nombre]);

  const crear = async () => {
    if (t?.seAbreUna) {
      onActivarPieza(tipo);
      onClose();
      return;
    }
    setCreando(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/artefactos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, plantillaId: desde ? null : (plantilla?.id ?? null), nombre: nombre.trim() || sugerido, desdeCanvasId: desde || null }),
      });
      const j = (await r.json().catch(() => null)) as { canvasId?: string; nombre?: string; error?: string } | null;
      if (!r.ok || !j?.canvasId) return toast.error(j?.error ?? "No se pudo crear. Inténtalo de nuevo.");
      toast.success(`Listo: «${j.nombre ?? "el artefacto"}» está en el riel.`);
      onCreado(j.canvasId);
      onClose();
    } catch {
      toast.error("Error de conexión.");
    } finally {
      setCreando(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="pantalla"
      title={tipoInicial && t ? `Crear otr${t.conArticulo.startsWith("una") ? "a" : "o"} ${t.nombre.toLowerCase()}` : "Nuevo artefacto"}
      description="Queda en el riel con su nombre, en construcción. Lo generas con IA o lo escribes tú desde adentro."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={creando}>
            Cancelar
          </Button>
          <Button variant="primary" loading={creando} disabled={!tipo} onClick={() => void crear()}>
            {t?.seAbreUna ? `Abrir ${t.nombre.toLowerCase()}` : "Crear"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6 md:flex-row">
        {!tipoInicial && (
          <div className="space-y-2 md:w-72 md:flex-shrink-0">
            <p className="text-xs text-fg-muted">Qué necesitas</p>
            <div className="space-y-1.5">
              {tipos.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => elegirTipo(x.id)}
                  aria-pressed={tipo === x.id}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                    tipo === x.id ? "border-brand bg-info-surface" : "border-line bg-surface hover:bg-surface-hover",
                  )}
                >
                  <span className="block text-sm font-semibold text-fg">{x.nombre}</span>
                  <span className="mt-0.5 block text-xs text-fg-muted">{x.paraQue}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {t?.seAbreUna ? (
          <div className="min-w-0 flex-1 space-y-2 rounded-lg border border-line bg-surface p-5">
            <p className="text-sm font-semibold text-fg">{t.nombre} del proyecto</p>
            <p className="text-sm text-fg-secondary">{t.paraQue}</p>
            <p className="text-xs text-fg-muted">Hay una por proyecto. Si ya existe, la abre.</p>
          </div>
        ) : (
        <div className="min-w-0 flex-1 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" hint="Si lo dejas vacío, se llama como sugerimos.">
              <Input value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} placeholder={sugerido} />
            </Field>
            {delTipo.length > 0 && (
              <Field label="Empezar" hint="Duplicar copia lo escrito, lo oculto, las instrucciones, las reuniones elegidas y las notas; el enlace no.">
                <Select value={desde} onChange={(e) => setDesde(e.target.value)}>
                  <option value="">En blanco, con una plantilla</option>
                  {delTipo.map((d) => (
                    <option key={d.id} value={d.id}>
                      Duplicar «{d.nombre}»
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>

          {!desde && plantillas.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-fg-muted">Plantilla</p>
              <div role="radiogroup" aria-label="Plantillas del documento" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {plantillas.map((p) => (
                  <TarjetaDePlantilla
                    key={p.id}
                    plantilla={p}
                    secciones={seccionesDeUnaCopia(tipo, p.id).map((s) => ({ key: s.key, nombre: s.label }))}
                    activa={p.id === plantilla?.id}
                    distintivo={p.recomendada ? "Recomendada" : null}
                    enfocable
                    onElegir={() => setElegidas((e) => ({ ...e, [tipo]: p.id }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setElegidas((x) => ({ ...x, [tipo]: p.id }));
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
        )}
      </div>
    </Modal>
  );
}
