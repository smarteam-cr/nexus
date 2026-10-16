/**
 * lib/uso/secciones.ts — de qué sección de Nexus es una ruta, y cuándo una visita cuenta como apertura. PURO y
 * client-safe: lo usan el latido del navegador (components/layout/LatidoDeUso.tsx) y la API que lo guarda.
 *
 * Etapa 4a de docs/mi-dia-plan.md (2026-10-16). La sección es la clave del ítem del MENÚ (`APP_NAV`): un módulo nuevo
 * se cuenta solo, sin tocar este archivo. Lo que no está en el menú (una página suelta como «Tu carga») es «otra».
 *
 * Una APERTURA es entrar a una sección, o volver a ella después de 30 minutos. Pasar de una ficha de cliente a otra no
 * es otra apertura: se mide si Nexus se usa, no cuántos clics hace cada persona.
 */
import { APP_NAV } from "@/components/layout/nav-config";

export const SECCION_OTRA = "otra";

/** Volver a la misma sección después de este tiempo cuenta como otra apertura. */
export const MINUTOS_PARA_CONTAR_DE_NUEVO = 30;

/** Las rutas que no se cuentan: la pantalla de la propia medición y el login. */
const NO_SE_CUENTAN = ["/para-ti/uso", "/login", "/auth", "/portal"];

interface Prefijo {
  prefijo: string;
  seccion: string;
}

/** Cada prefijo del menú (el ítem y sus hijos) con la clave de su ítem, de más largo a más corto. */
const PREFIJOS: readonly Prefijo[] = APP_NAV.flatMap((item) => [
  ...(item.match ?? [item.href]).map((prefijo) => ({ prefijo, seccion: item.key })),
  ...(item.children ?? []).flatMap((c) => (c.match ?? [c.href]).map((prefijo) => ({ prefijo, seccion: item.key }))),
]).sort((a, b) => b.prefijo.length - a.prefijo.length);

const coincide = (ruta: string, prefijo: string) => ruta === prefijo || ruta.startsWith(`${prefijo}/`) || ruta.startsWith(`${prefijo}?`);

/**
 * La sección de una ruta: la del prefijo del menú más largo que la contiene (así «Rentabilidad», que cuelga de
 * Finanzas en el menú aunque su ruta empiece con /customer-success, cuenta para Finanzas). null = no se cuenta.
 */
export function seccionDeLaRuta(ruta: string): string | null {
  const limpia = ruta.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (NO_SE_CUENTAN.some((p) => coincide(limpia, p))) return null;
  return PREFIJOS.find((p) => coincide(limpia, p.prefijo))?.seccion ?? SECCION_OTRA;
}

/** Las secciones que se pueden guardar: las del menú, en su orden, más «otra». */
export function seccionesDeNexus(): { clave: string; nombre: string }[] {
  return [...APP_NAV.map((i) => ({ clave: i.key, nombre: i.label })), { clave: SECCION_OTRA, nombre: "Otras pantallas" }];
}

export function esSeccionValida(clave: string): boolean {
  return clave === SECCION_OTRA || APP_NAV.some((i) => i.key === clave);
}

/** El nombre de una sección para la pantalla. */
export function nombreDeLaSeccion(clave: string): string {
  return seccionesDeNexus().find((s) => s.clave === clave)?.nombre ?? clave;
}

export interface UltimaApertura {
  seccion: string;
  /** epoch ms */
  at: number;
}

/** ¿Esta visita es una apertura nueva? Sí si cambió de sección o si pasaron 30 minutos desde la última que se contó. */
export function hayQueContar(previa: UltimaApertura | null, seccion: string, ahora: number): boolean {
  if (!previa) return true;
  if (previa.seccion !== seccion) return true;
  return ahora - previa.at >= MINUTOS_PARA_CONTAR_DE_NUEVO * 60_000;
}

/** El día en Costa Rica (UTC−6, sin horario de verano), AAAA-MM-DD. */
export function diaEnCostaRica(ahora: Date): string {
  return new Date(ahora.getTime() - 6 * 3_600_000).toISOString().slice(0, 10);
}
