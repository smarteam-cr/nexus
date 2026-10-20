/**
 * lib/para-ti/fuentes/limpieza.ts — lo tuyo para poner al día en HubSpot (2026-10-16, fase 0.5 de
 * docs/nexus-sistema-de-trabajo-plan.md). SERVER-ONLY.
 *
 * Personal: a cada persona, lo que la lista de limpieza (lib/limpieza) dice que le toca, en UNA línea de «Esta semana»
 * con cada proyecto y su enlace a HubSpot. Es limpieza: no compite con lo de hoy. A quien lidera un sprint le llega
 * además lo de los proyectos sin encargado o a nombre de alguien que se fue; a la CSL y a dirección la línea las lleva a
 * la lista entera.
 *
 * La lista es la misma para todos y se arma con varias consultas: se guarda cinco minutos (un solo proceso, RUNBOOK
 * invariante #1).
 */
import "server-only";
import { cargarListaDeLimpieza } from "@/lib/limpieza/lista-server";
import { pendientesDeLimpieza } from "@/lib/limpieza/para-ti";
import type { ArregloDeLimpieza } from "@/lib/limpieza/reglas";
import type { Fuente } from "../fuente";

const VIDA_DE_LA_LISTA_MS = 5 * 60_000;
let guardada: { at: number; lista: ArregloDeLimpieza[] } | null = null;
let enVuelo: Promise<ArregloDeLimpieza[]> | null = null;

async function lista(ahora: Date): Promise<ArregloDeLimpieza[]> {
  if (guardada && ahora.getTime() - guardada.at < VIDA_DE_LA_LISTA_MS) return guardada.lista;
  enVuelo ??= cargarListaDeLimpieza(ahora)
    .then((l) => {
      guardada = { at: ahora.getTime(), lista: l };
      return l;
    })
    .finally(() => {
      enVuelo = null;
    });
  return enVuelo;
}

export const LIMPIEZA_DE_HUBSPOT: Fuente = {
  clave: "hubspot-limpieza",
  frente: null,
  alDia: "Lo tuyo en HubSpot",
  aplica: (a) => ["CSE", "CSL", "DEV", "SUPER_ADMIN"].includes(a.rol) || a.proyectos.length > 0,
  async medir(a, c) {
    return pendientesDeLimpieza(await lista(c.ahora), { email: a.email, rol: a.rol, lideraCs: a.frentes.includes("LIDERAR_CS") });
  },
};
