"use client";

/**
 * components/finanzas/ActualizarTodo.tsx — «Actualizar todo» de Finanzas › Integraciones (rediseño 2026-10-03): vuelve a
 * copiar Odoo, Mercury y las ventas de HubSpot, cobra lo pagado (2026-10-21) y recarga la página. ⛔ Solo lee esos sistemas.
 */
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";

export default function ActualizarTodo() {
  const router = useRouter();
  const toast = useToast();
  const [actualizando, setActualizando] = useState(false);
  /* Un doble clic rápido llega antes de que el botón se dibuje deshabilitado: el ref lo corta en el acto. */
  const enCurso = useRef(false);
  return (
    <Button data-recorrido="fin.integraciones.actualizar"
      variant="secondary"
      size="sm"
      disabled={actualizando}
      title="Trae ya lo último de Odoo, Mercury y HubSpot y cobra lo que Odoo y Mercury dan por pagado y conciliado. Solo lee esos sistemas."
      onClick={async () => {
        if (enCurso.current) return;
        enCurso.current = true;
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
          enCurso.current = false;
          setActualizando(false);
        }
      }}
    >
      {actualizando ? "Leyendo Odoo, Mercury y HubSpot…" : "Actualizar todo"}
    </Button>
  );
}
