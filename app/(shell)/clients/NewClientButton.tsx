"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Button, Input } from "@/components/ui";

export default function NewClientButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setOpen(false);
    setName("");
    setCompany("");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), company: company.trim() || undefined }),
      });
      if (!res.ok) throw new Error("Error al crear el cliente");
      const data = (await res.json()) as { id?: string };
      if (!data.id) throw new Error("Sin ID de cliente");
      router.push(`/clients/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="primary" size="md" onClick={() => setOpen(true)}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Nuevo cliente
      </Button>

      <Modal
        open={open}
        onClose={reset}
        title="Nuevo cliente"
        size="md"
        footer={
          <>
            <Button type="button" variant="secondary" size="md" onClick={reset} disabled={loading}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="new-client-form"
              variant="primary"
              size="md"
              loading={loading}
              disabled={!name.trim()}
            >
              Crear cliente
            </Button>
          </>
        }
      >
        <form id="new-client-form" onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-2xs font-medium text-gray-400 uppercase tracking-wider mb-1">
              Nombre <span className="text-brand-light">*</span>
            </label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Acme Corp"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-2xs font-medium text-gray-400 uppercase tracking-wider mb-1">
              Sitio web <span className="text-gray-600">(opcional)</span>
            </label>
            <Input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Ej: acmecorp.com"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </form>
      </Modal>
    </>
  );
}
