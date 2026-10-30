"use client";

/**
 * components/artefactos/NuevoArtefactoModal.tsx — CREAR UN ARTEFACTO en el proyecto (etapa V3 de docs/artefactos-plan.md):
 * el tipo, su plantilla, el nombre y desde dónde empieza (en blanco con la plantilla, o duplicando un documento del mismo
 * tipo). Crear no gasta IA: se genera después, desde el documento.
 *
 * UI interna: primitivas de components/ui, tokens semánticos y tuteo.
 */
import { useEffect, useMemo, useState } from "react";
import { Button, Field, Input, Modal, Select } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { plantillasDelTipo, tipoDeArtefacto, tiposCreablesEnElProyecto } from "@/lib/artefactos/tipos";
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
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  /** El tipo ya elegido («Crear otra planificación»). Sin él, se elige en el modal. */
  tipoInicial?: string | null;
  /** Los documentos del proyecto que se pueden duplicar (de cualquier tipo: se filtran por el elegido). */
  documentos: readonly DocumentoParaDuplicar[];
  onCreado: (canvasId: string) => void;
}) {
  const tipos = useMemo(() => tiposCreablesEnElProyecto(), []);
  const [tipo, setTipo] = useState<string>(tipoInicial ?? tipos[0]?.id ?? "");
  const [plantillaId, setPlantillaId] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [desde, setDesde] = useState<string>("");
  const [creando, setCreando] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setTipo(tipoInicial ?? tipos[0]?.id ?? "");
    setNombre("");
    setDesde("");
  }, [open, tipoInicial, tipos]);

  const plantillas = plantillasDelTipo(tipo);
  useEffect(() => {
    setPlantillaId((plantillas.find((p) => p.recomendada) ?? plantillas[0])?.id ?? null);
    setDesde("");
  }, [tipo]); // eslint-disable-line react-hooks/exhaustive-deps -- solo al cambiar de tipo
  const delTipo = documentos.filter((d) => d.tipo === tipo);
  const t = tipoDeArtefacto(tipo);

  const crear = async () => {
    setCreando(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/artefactos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, plantillaId: desde ? null : plantillaId, nombre: nombre.trim() || null, desdeCanvasId: desde || null }),
      });
      const j = (await r.json().catch(() => null)) as { canvasId?: string; error?: string } | null;
      if (!r.ok || !j?.canvasId) return toast.error(j?.error ?? "No se pudo crear. Inténtalo de nuevo.");
      toast.success(`Listo: «${(j as { nombre?: string }).nombre ?? "el artefacto"}» está en el riel.`);
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
      size="lg"
      title={tipoInicial && t ? `Crear otr${t.conArticulo.startsWith("una") ? "a" : "o"} ${t.nombre.toLowerCase()}` : "Nuevo artefacto"}
      description="Queda en el riel con su nombre, en construcción. Lo generas con IA o lo escribes tú desde adentro."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={creando}>
            Cancelar
          </Button>
          <Button variant="primary" loading={creando} disabled={!tipo} onClick={() => void crear()}>
            Crear
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {!tipoInicial && (
          <div className="space-y-2">
            <p className="text-xs text-fg-muted">Qué necesitas</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {tipos.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => setTipo(x.id)}
                  aria-pressed={tipo === x.id}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors",
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

        <Field label="Nombre" hint={`Sin nombre, se llama «${t?.nombre ?? ""} ${delTipo.length + 1}».`}>
          <Input value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} placeholder={`Ej.: ${t?.nombre ?? ""} — Marketing`} />
        </Field>

        {delTipo.length > 0 && (
          <Field label="Empezar" hint="Duplicar copia lo escrito, lo oculto y las instrucciones; el enlace no.">
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

        {!desde && plantillas.length > 1 && (
          <div className="space-y-2">
            <p className="text-xs text-fg-muted">Plantilla</p>
            <div className="space-y-1.5">
              {plantillas.map((p) => (
                <label
                  key={p.id}
                  className={cn(
                    "flex cursor-pointer gap-2.5 rounded-lg border px-3 py-2",
                    plantillaId === p.id ? "border-brand bg-info-surface" : "border-line bg-surface hover:bg-surface-hover",
                  )}
                >
                  <input type="radio" name="plantilla" className="mt-1" checked={plantillaId === p.id} onChange={() => setPlantillaId(p.id)} />
                  <span>
                    <span className="block text-sm font-semibold text-fg">
                      {p.nombre}
                      {p.recomendada && <span className="ml-1.5 text-xs font-normal text-fg-muted">· recomendada</span>}
                    </span>
                    <span className="block text-xs text-fg-muted">{p.paraQue}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
