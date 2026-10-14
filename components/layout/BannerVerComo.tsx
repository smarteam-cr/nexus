"use client";

/**
 * El aviso de «Ver como otra persona» (2026-10-13, lib/auth/ver-como.ts): fijo arriba, en todas las pantallas,
 * mientras un Super Admin mira Nexus como alguien. Dice a quién, que es solo lectura, y la salida.
 */
import { useState } from "react";

export default function BannerVerComo({ nombre, rol }: { nombre: string; rol: string }) {
  const [saliendo, setSaliendo] = useState(false);

  const salir = async () => {
    setSaliendo(true);
    await fetch("/api/ver-como", { method: "DELETE" }).catch(() => null);
    window.location.href = "/team";
  };

  return (
    <div
      role="status"
      className="fixed left-1/2 top-2 z-[60] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 rounded-full border border-warn-line bg-warn-surface px-4 py-1.5 text-xs text-warn-ink shadow-md"
    >
      <span>
        Estás viendo Nexus como <strong>{nombre}</strong> ({rol}) · solo lectura
      </span>
      <button
        type="button"
        onClick={() => void salir()}
        disabled={saliendo}
        className="rounded-full border border-warn-line bg-surface px-2.5 py-0.5 font-medium text-fg hover:bg-surface-muted disabled:cursor-wait"
      >
        {saliendo ? "Volviendo…" : "Volver a mi usuario"}
      </button>
    </div>
  );
}
