"use client";

/**
 * components/layout/LatidoDeUso.tsx — avisa al servidor que la persona abrió una sección de Nexus (etapa 4a de
 * docs/mi-dia-plan.md). No pinta nada.
 *
 * Cuenta una apertura al entrar a una sección o al volver a ella (por navegación o al volver a la pestaña) después de
 * 30 minutos (`hayQueContar`). Lo último que contó lo recuerda la pestaña (sessionStorage), así recargar la página no
 * suma otra. Si el navegador no deja guardar, cuenta igual: la regla del servidor no depende de esto.
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { hayQueContar, seccionDeLaRuta, type UltimaApertura } from "@/lib/uso/secciones";

const CLAVE = "nexus-uso-ultima";

function leer(): UltimaApertura | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE);
    const v = crudo ? (JSON.parse(crudo) as UltimaApertura) : null;
    return v && typeof v.seccion === "string" && typeof v.at === "number" ? v : null;
  } catch {
    return null;
  }
}

function guardar(v: UltimaApertura) {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(v));
  } catch {
    /* sin almacenamiento: se cuenta igual */
  }
}

function latir(ruta: string) {
  const seccion = seccionDeLaRuta(ruta);
  if (!seccion) return;
  const ahora = Date.now();
  if (!hayQueContar(leer(), seccion, ahora)) return;
  guardar({ seccion, at: ahora });
  fetch("/api/uso", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ruta }),
    keepalive: true,
  }).catch(() => {});
}

export default function LatidoDeUso() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname) latir(pathname);
  }, [pathname]);

  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === "visible") latir(window.location.pathname);
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, []);

  return null;
}
