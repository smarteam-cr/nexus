"use client";

/**
 * lib/notifications/client.ts
 *
 * Utilidades de cliente para las notificaciones de "agente terminado" (v1: navegador
 * abierto, sin push server). Registra el Service Worker, pide permiso una sola vez
 * (soft-prompt vía NotificationsInit) y dispara la notificación OS al completar un agente
 * — SOLO si el permiso está concedido Y la pestaña no está en foco (si está mirando, el
 * toast ya avisa). Degrada a no-op si el navegador no soporta SW/Notification.
 */
import { notifyMetaForGroup } from "./agents";

const DISMISS_KEY = "nexus.notif.optin.dismissed";

let swRegistration: ServiceWorkerRegistration | null = null;
let registering: Promise<ServiceWorkerRegistration | null> | null = null;
let promptOpener: (() => void) | null = null;

function swSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}
function notifSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Registra el SW (idempotente). No-op + null si el navegador no lo soporta. */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!swSupported()) return Promise.resolve(null);
  if (registering) return registering;
  registering = navigator.serviceWorker
    .register("/sw.js")
    .then((reg) => {
      swRegistration = reg;
      return reg;
    })
    .catch((e) => {
      console.warn("[notif] no se pudo registrar el service worker", e);
      return null;
    });
  return registering;
}

/** NotificationsInit registra acá su abridor del soft-prompt. */
export function registerPromptOpener(fn: (() => void) | null): void {
  promptOpener = fn;
}

/**
 * Llamar en el GESTO que lanza un agente largo. Si el permiso está sin decidir y el usuario
 * no descartó el opt-in, abre el soft-prompt. No-op si ya está granted/denied o sin soporte.
 */
export function maybeRequestPermission(): void {
  if (!notifSupported() || Notification.permission !== "default") return;
  try {
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
  } catch {
    /* localStorage no disponible → mostramos igual */
  }
  promptOpener?.();
}

/** El usuario descartó el opt-in ("Ahora no") → no volver a ofrecerlo. */
export function dismissOptIn(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* no-op */
  }
}

/** Pide el permiso NATIVO. Debe llamarse desde un gesto (el click "Activar" del prompt). */
export async function requestPermission(): Promise<NotificationPermission> {
  if (!notifSupported()) return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export interface AgentDoneNotice {
  /** Grupo del agente (lib/notifications/agents.ts) → gate notifiable + etiqueta por defecto. */
  group?: string | null;
  /** Etiqueta explícita (sustantivo). Tiene prioridad sobre la del grupo. */
  label?: string;
  clientName?: string | null;
  ok: boolean;
  /** Deep-link al que lleva el click de la notificación. */
  url?: string;
}

const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Muestra la notificación OS de "agente terminado". No hace nada si: el agente no es
 * notifiable, no hay permiso concedido, o la pestaña está en foco (ahí basta el toast).
 */
/** Resultado de notifyCsAlert — el caller decide el fallback:
 *  "shown" = notificación OS disparada · "focused" = suprimida porque el usuario
 *  está mirando Nexus · "unavailable" = sin soporte/permiso (la OS no puede mostrar). */
export type CsNotifyOutcome = "shown" | "focused" | "unavailable";

/** Notificación OS de una ALERTA del watchdog de Éxito del cliente (severidad alta).
 *  Mismos gates que notifyAgentDone (permiso + pestaña desenfocada); `tag` por
 *  alerta → re-notificar la misma alerta reemplaza, no duplica. Devuelve el outcome
 *  para que el caller haga fallback in-app (toast) cuando la OS no mostró nada. */
export async function notifyCsAlert(a: {
  alertId: string;
  title: string;
  clientName: string;
  url?: string;
}): Promise<CsNotifyOutcome> {
  if (!notifSupported() || Notification.permission !== "granted") return "unavailable";
  const lookingAtNexus =
    typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus();
  if (lookingAtNexus) return "focused";

  const options: NotificationOptions = {
    body: a.title,
    icon: "/logo-smarteam.png",
    badge: "/logo-smarteam.png",
    tag: `nexus-cs-alert-${a.alertId}`,
    data: { url: a.url ?? "/customer-success" },
  };
  try {
    const reg = swRegistration ?? (await registerServiceWorker());
    if (reg) await reg.showNotification(`🚨 ${a.clientName}: alerta de éxito del cliente`, options);
    else new Notification(`🚨 ${a.clientName}: alerta de éxito del cliente`, options);
    return "shown";
  } catch (e) {
    console.warn("[notif] no se pudo mostrar la alerta CS", e);
    return "unavailable";
  }
}

export async function notifyAgentDone(n: AgentDoneNotice): Promise<void> {
  const meta = notifyMetaForGroup(n.group);
  if (!meta.notifiable) return;
  if (!notifSupported() || Notification.permission !== "granted") return;
  // Suprimir SOLO si el usuario está REALMENTE mirando Nexus: pestaña visible Y ventana enfocada.
  // `visibilityState` por sí solo NO detecta "se fue a otra APP" (la pestaña sigue "visible" con
  // otra app al frente) → sin hasFocus() no dispararía justo en el caso que importa. hasFocus()=false
  // cubre otra app / otra ventana; visibilityState="hidden" cubre otra pestaña / minimizado.
  const lookingAtNexus =
    typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus();
  if (lookingAtNexus) return;

  const label = (n.label ?? meta.label).trim() || meta.label;
  const who = n.clientName ? ` de ${n.clientName}` : "";
  // Forma neutral (sin concordancia de género) para que sirva a "handoff" y "planificación".
  const title = n.ok ? `Listo: ${label}${who}` : `Falló: ${label}${who}`;
  const body = n.ok ? "Ya puedes revisarlo en Nexus." : "Revisa qué pasó en Nexus.";
  const options: NotificationOptions = {
    body,
    icon: "/logo-smarteam.png",
    badge: "/logo-smarteam.png",
    tag: `nexus-agent-${label}`,
    data: { url: n.url ?? "/" },
  };
  try {
    const reg = swRegistration ?? (await registerServiceWorker());
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
  } catch (e) {
    console.warn("[notif] no se pudo mostrar la notificación", e);
  }
}
