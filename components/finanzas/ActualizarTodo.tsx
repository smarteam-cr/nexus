"use client";

/**
 * components/finanzas/ActualizarTodo.tsx — «Actualizar todo» de Finanzas › Integraciones (rediseño 2026-10-03): vuelve a
 * copiar Odoo, Mercury y las ventas de HubSpot y recarga la página. ⛔ Solo lee esos sistemas.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";

export default function ActualizarTodo() {
  const router = useRouter();
  const toast = useToast();
  const [actualizando, setActualizando] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={actualizando}
      title="Trae ya lo último de Odoo, Mercury y HubSpot, sin esperar a mañana. Solo lee: no cambia ningún cobro."
      onClick={async () => {
        setActualizando(true);
        try {
          const r = await fetchJson<{ todoBien: boolean; texto: string }>("/api/finanzas/actualizar", {
            method: "POST",
            body: JSON.stringify({ ventas: true }),
          });
          if (r.todoBien) toast.success(r.texto);
          else toast.error(`No todo se pudo actualizar. ${r.texto}`);
          router.refresh();
        } catch (e) {
          toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar.");
        } finally {
          setActualizando(false);
        }
      }}
    >
      {actualizando ? "Leyendo Odoo, Mercury y HubSpot…" : "Actualizar todo"}
    </Button>
  );
}
