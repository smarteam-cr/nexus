"use client";

/**
 * components/finanzas/YaLoCorregi.tsx — el botón de Pendientes para avisar que algo devuelto ya se corrigió (rediseño
 * de Finanzas, 2026-10-03). Vuelve a la revisión de quien supervisa, marcado como corregido.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import type { TipoRevisado } from "@/lib/finanzas/revision";

export default function YaLoCorregi({ tipo, registroId, supervisor }: { tipo: TipoRevisado; registroId: string; supervisor: string }) {
  const router = useRouter();
  const toast = useToast();
  const [enviando, setEnviando] = useState(false);

  async function avisar() {
    setEnviando(true);
    try {
      await fetchJson("/api/finanzas/revision/corregido", { method: "POST", body: JSON.stringify({ tipo, id: registroId }) });
      toast.success(`Listo: ${supervisor} lo vuelve a ver como corregido.`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo avisar.");
      setEnviando(false);
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={() => void avisar()} disabled={enviando}>
      {enviando ? "Avisando…" : "Ya lo corregí"}
    </Button>
  );
}
