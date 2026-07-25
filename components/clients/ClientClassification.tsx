"use client";

/**
 * ClientClassification — QUÉ ES esta empresa y CUÁNTO puede valer.
 *
 * Vive en la ficha (Configuración del cliente) y escribe por
 * `PATCH /api/clients/[id]/classification`. Dos campos con dos permisos distintos:
 * la categoría la mueve quien puede clasificar (`clientes.classify`) y el TAM lo
 * escribe el área de Ventas (`ventas.write`) — el gate de acá es COSMÉTICO; la
 * seguridad vive en el endpoint, que valida campo por campo.
 *
 * Manda SOLO los campos que el usuario puede tocar: si mandara los dos siempre, a
 * alguien con un solo permiso el guardado entero le daría 403.
 */

import { useState } from "react";
import type { ClientKind } from "@prisma/client";
import { Alert, Button, Field, Select, Input } from "@/components/ui";
import { CLIENT_KINDS, CLIENT_KIND_META } from "@/lib/clients/kind";
import { useMe } from "@/hooks/useMe";

export default function ClientClassification({
  clientId,
  initialKind,
  initialTamUsd,
  onSaved,
}: {
  clientId: string;
  initialKind: ClientKind;
  initialTamUsd: number | null;
  onSaved?: () => void;
}) {
  const me = useMe();
  const canClassify = me?.permissions?.sections?.clientes?.classify === true;
  const canSetTam = me?.permissions?.sections?.ventas?.write === true;

  const [kind, setKind] = useState<ClientKind>(initialKind);
  const [tam, setTam] = useState(initialTamUsd === null ? "" : String(initialTamUsd));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Mientras `me` carga no se sabe qué puede tocar: no se pinta el formulario a medias.
  if (me === null) return null;
  if (!canClassify && !canSetTam) return null;

  const dirty =
    (canClassify && kind !== initialKind) ||
    (canSetTam && tam.trim() !== (initialTamUsd === null ? "" : String(initialTamUsd)));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const body: Record<string, unknown> = {};
      if (canClassify) body.kind = kind;
      if (canSetTam) body.tamUsd = tam.trim() === "" ? null : tam.trim();

      const res = await fetch(`/api/clients/${clientId}/classification`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo guardar la clasificación.");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl bg-surface border border-line p-5">
      <h2 className="text-sm font-semibold text-fg mb-1">Clasificación y potencial</h2>
      <p className="text-xs text-fg-muted mb-4">
        Qué es esta empresa para el negocio y cuánto puede llegar a facturar. Solo las
        marcadas como <strong className="text-fg-secondary">Cliente</strong> entran a la
        cartera, al portafolio y a cobranza.
      </p>

      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {canClassify && (
            <Field label="Categoría" hint={CLIENT_KIND_META[kind].help}>
              <Select value={kind} onChange={(e) => setKind(e.target.value as ClientKind)}>
                {CLIENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {CLIENT_KIND_META[k].label}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {canSetTam && (
            <Field
              label="TAM estimado (USD)"
              hint="Cuánto puede facturar esta cuenta en un año. Vacío = todavía sin estimar (no es cero)."
            >
              <Input
                type="text"
                inputMode="decimal"
                value={tam}
                onChange={(e) => setTam(e.target.value)}
                placeholder="ej. 36000"
              />
            </Field>
          )}
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving || !dirty}>
            {saving ? "Guardando…" : "Guardar clasificación"}
          </Button>
          {saved && <span className="text-xs text-fg-muted">Guardado</span>}
        </div>
      </form>
    </section>
  );
}
