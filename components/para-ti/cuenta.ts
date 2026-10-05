"use client";

/**
 * components/para-ti/cuenta.ts — el NÚMERO de «Para ti» en el menú (2026-10-04).
 *
 * Un solo latido por pestaña, compartido por quien lo use (el ítem del menú): un pedido a `/api/para-ti/cuenta` cada
 * minuto y medio con la pestaña a la vista, cada cinco minutos con la pestaña escondida (para poder avisar por el
 * sistema operativo), y uno más al volver a ella. Mismo ritmo que tenía el notificador de alertas de la CSL, al que
 * reemplaza.
 *
 * Un aviso NUEVO con la pestaña sin foco sale como notificación del navegador (la misma vía que las corridas de
 * agentes). La primera lectura solo toma la foto: no avisa de lo que ya estaba.
 */
import { useSyncExternalStore } from "react";
import { notifyAviso } from "@/lib/notifications/client";
import type { CuentaDeParaTi } from "@/lib/para-ti/tipos";

export const LATIDO_MS = 90_000;
/** Con la pestaña escondida, un pedido cada tanto alcanza para avisar por el sistema operativo. */
export const LATIDO_ESCONDIDO_MS = 5 * 60_000;
let ultimoPedido = 0;

let actual: CuentaDeParaTi | null = null;
let ultimoAvisadoId: string | null | undefined = undefined;
const oyentes = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let pidiendo = false;

function emitir() {
  for (const o of oyentes) o();
}

async function pedir() {
  if (pidiendo || typeof document === "undefined") return;
  if (document.visibilityState !== "visible" && Date.now() - ultimoPedido < LATIDO_ESCONDIDO_MS) return;
  pidiendo = true;
  ultimoPedido = Date.now();
  try {
    const r = await fetch("/api/para-ti/cuenta", { cache: "no-store" });
    if (!r.ok) return;
    const c = (await r.json()) as CuentaDeParaTi;
    const nuevo = c.ultimoAviso;
    if (ultimoAvisadoId !== undefined && nuevo && nuevo.id !== ultimoAvisadoId) {
      void notifyAviso(nuevo);
    }
    ultimoAvisadoId = nuevo?.id ?? null;
    actual = c;
    emitir();
  } catch {
    /* sin red: se reintenta en el próximo latido */
  } finally {
    pidiendo = false;
  }
}

function alVolver() {
  if (document.visibilityState === "visible") void pedir();
}

function suscribir(o: () => void) {
  oyentes.add(o);
  if (oyentes.size === 1) {
    void pedir();
    timer = setInterval(() => void pedir(), LATIDO_MS);
    document.addEventListener("visibilitychange", alVolver);
  }
  return () => {
    oyentes.delete(o);
    if (oyentes.size === 0) {
      if (timer) clearInterval(timer);
      timer = null;
      document.removeEventListener("visibilitychange", alVolver);
    }
  };
}

/** El número del menú (null mientras no llegó la primera lectura). */
export function useCuentaParaTi(): CuentaDeParaTi | null {
  return useSyncExternalStore(
    suscribir,
    () => actual,
    () => null,
  );
}

/** Pide el número de nuevo ya (tras marcar avisos leídos, por ejemplo). */
export function avisarCambioDeParaTi(): void {
  void pedir();
}
