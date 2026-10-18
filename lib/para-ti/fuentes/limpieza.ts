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
import { RUTA_DE_LA_LIMPIEZA, type ArregloDeLimpieza, type MotivoDeLimpieza } from "@/lib/limpieza/reglas";
import { plural } from "../armar";
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

const CORTO: Record<MotivoDeLimpieza, string> = {
  "excliente-activo": "abierto en una cuenta excliente",

  "encargado-de-baja": "encargado que ya no está",
  "sin-encargado": "sin encargado",
  "servicio-sin-registrar": "servicio sin proyecto",
  "etapa-quieta": "etapa quieta",
  "sin-actividad": "sin actividad",
};

export const LIMPIEZA_DE_HUBSPOT: Fuente = {
  clave: "hubspot-limpieza",
  frente: null,
  alDia: "Lo tuyo en HubSpot",
  aplica: (a) => ["CSE", "CSL", "DEV", "SUPER_ADMIN"].includes(a.rol) || a.proyectos.length > 0,
  async medir(a, c) {
    const yo = a.email.toLowerCase();
    const mias = (await lista(c.ahora)).filter((x) => x.responsable.email === yo);
    if (mias.length === 0) return [];
    // Una entrada por proyecto (o por cuenta, si no hay proyecto), con todo lo que tiene.
    const porLugar = new Map<string, { a: ArregloDeLimpieza; motivos: MotivoDeLimpieza[] }>();
    for (const x of mias) {
      const k = x.proyectoId ?? `cuenta:${x.clientId}`;
      const g = porLugar.get(k);
      if (g) g.motivos.push(x.motivo);
      else porLugar.set(k, { a: x, motivos: [x.motivo] });
    }
    const lugares = [...porLugar.values()];
    // La lista entera la abren la CSL y dirección (Éxito del cliente); los demás van al proyecto.
    const veLaLista = a.rol === "CSL" || a.rol === "SUPER_ADMIN";
    const primero = lugares[0].a;
    const cuenta = (m: MotivoDeLimpieza) => mias.filter((x) => x.motivo === m).length;
    const partes = (Object.keys(CORTO) as MotivoDeLimpieza[]).filter((m) => cuenta(m) > 0).map((m) => `${cuenta(m)} ${CORTO[m]}`);
    return [
      {
        clave: "hubspot-limpieza",
        fuente: "hubspot-limpieza",
        cuando: "semana",
        delAgente: false,
        clientId: null,
        titulo: `HubSpot: ${plural(lugares.length, "cosa por poner al día", "cosas por poner al día")}`,
        detalle: `${partes.join(" · ")}. Nexus usa estos datos para saber de quién es cada cuenta y en qué etapa va.`,
        meta: "HubSpot",
        accion: veLaLista ? "Ver la lista" : primero.hubspotUrl ? "Abrir en HubSpot" : "Abrir la cuenta",
        href: veLaLista ? RUTA_DE_LA_LIMPIEZA : (primero.hubspotUrl ?? `/clients/${encodeURIComponent(primero.clientId)}`),
        enlaces: lugares.slice(0, 12).map(({ a: x, motivos }) => ({
          texto: `${x.proyecto ?? x.cliente}: ${motivos.map((m) => CORTO[m]).join(", ")}`,
          href: x.hubspotUrl ?? `/clients/${encodeURIComponent(x.clientId)}`,
        })),
        desde: null,
      },
    ];
  },
};

