"use client";

/**
 * components/siguiente-paso/personas.ts — quién puede llevar un siguiente paso y qué equipos escribe quien mira
 * (GET /api/siguiente-paso/personas). Se pide una vez por pestaña: la lista del equipo no cambia mientras se trabaja.
 */
import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/api/fetch-json";
import type { EquipoDelSiguientePaso } from "@/lib/siguiente-paso/propiedades";

export interface PersonasDelPaso {
  yo: string;
  equipos: EquipoDelSiguientePaso[];
  personas: Array<{ email: string; nombre: string; equipos: EquipoDelSiguientePaso[] }>;
}

let pedido: Promise<PersonasDelPaso> | null = null;

export function pedirPersonasDelPaso(): Promise<PersonasDelPaso> {
  pedido ??= fetchJson<PersonasDelPaso>("/api/siguiente-paso/personas").catch((e) => {
    pedido = null;
    throw e;
  });
  return pedido;
}

/** null mientras llega. */
export function usePersonasDelPaso(): PersonasDelPaso | null {
  const [datos, setDatos] = useState<PersonasDelPaso | null>(null);
  useEffect(() => {
    let vivo = true;
    pedirPersonasDelPaso()
      .then((d) => vivo && setDatos(d))
      .catch(() => vivo && setDatos({ yo: "", equipos: [], personas: [] }));
    return () => {
      vivo = false;
    };
  }, []);
  return datos;
}

/** `YYYY-MM-DD` de hoy en Costa Rica (UTC-6, sin horario de verano), armado a mano. */
export function hoyEnCostaRica(): string {
  return new Date(Date.now() - 6 * 3_600_000).toISOString().slice(0, 10);
}
