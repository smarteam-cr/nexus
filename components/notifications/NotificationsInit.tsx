"use client";

/**
 * components/notifications/NotificationsInit.tsx
 *
 * Montado una vez en app/layout.tsx (junto a ToastProvider/UndoProvider). Registra el
 * Service Worker al montar y muestra el SOFT-PROMPT de opt-in una sola vez: lo abren los
 * disparadores de agentes largos vía maybeRequestPermission() (gesto del click). No pide
 * el permiso nativo en frío; primero el banner suave, y en "Activar" pide el permiso real.
 */
import { useEffect, useState } from "react";
import {
  registerServiceWorker,
  registerPromptOpener,
  requestPermission,
  dismissOptIn,
} from "@/lib/notifications/client";

export default function NotificationsInit() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    registerServiceWorker();
    registerPromptOpener(() => setOpen(true));
    return () => registerPromptOpener(null);
  }, []);

  const activate = async () => {
    setBusy(true);
    await requestPermission(); // granted/denied → en ambos casos cerramos
    setBusy(false);
    setOpen(false);
  };

  const notNow = () => {
    dismissOptIn();
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[101] w-[min(92vw,22rem)] pointer-events-none">
      <div className="nx-notif-in pointer-events-auto rounded-2xl border border-line bg-surface text-fg shadow-[0_10px_40px_-12px_rgba(0,0,0,0.55)] p-4">
        <style>{`@keyframes nx-notif-in{from{opacity:0;transform:translateY(10px) scale(.975)}to{opacity:1;transform:translateY(0) scale(1)}}.nx-notif-in{animation:nx-notif-in .18s cubic-bezier(.21,1.02,.73,1)}`}</style>
        <p className="text-sm font-semibold text-fg">Activa las notificaciones</p>
        <p className="mt-1 text-[13px] leading-relaxed text-fg-secondary">
          Te avisamos cuando un agente termine, así no tienes que quedarte mirando la pestaña.
        </p>
        <div className="mt-3 flex items-center justify-end gap-3">
          <button
            onClick={notNow}
            disabled={busy}
            className="text-xs font-medium text-fg-muted hover:text-fg transition-colors"
          >
            Ahora no
          </button>
          <button
            onClick={activate}
            disabled={busy}
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-60 transition-colors"
          >
            Activar
          </button>
        </div>
      </div>
    </div>
  );
}
