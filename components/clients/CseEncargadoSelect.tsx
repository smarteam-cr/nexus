"use client";

/**
 * components/clients/CseEncargadoSelect.tsx — la celda "CSE encargado" del listado de clientes.
 *
 * ── ES UNA ENVOLTURA FINA, A PROPÓSITO ───────────────────────────────────────
 * Toda la mecánica (flechita, buscador, teclado, el clic que no navega, el error que se queda en
 * la celda) vive en `CeldaSelect`, la primitiva de `components/ui`. Acá solo queda lo que es DE
 * ESTE dominio: a qué endpoint le pega y qué significa el cambio.
 *
 * Elías lo pidió así: *«estandariza este componente porque me interesa que en el futuro los
 * listing otros puedan ser selects igual»*.
 *
 * ── QUÉ CAMBIA AL ELEGIR ─────────────────────────────────────────────────────
 * Escribe `csl_encargado` en TODOS los proyectos del cliente que están en el pipeline de
 * Implementación de HubSpot — porque el encargado es de la CUENTA, no de un proyecto. Los de
 * Desarrollo/Sitios web NO se tocan: cuelgan como hijos y tienen su propio encargado técnico.
 * Eso lo decide el endpoint; acá solo se elige.
 */
import { useRouter } from "next/navigation";
import { CeldaSelect, type OpcionDeCelda } from "@/components/ui/CeldaSelect";

export interface OpcionDeEncargado {
  email: string;
  name: string;
}

export default function CseEncargadoSelect({
  clientId,
  clientName,
  nombres,
  opciones,
  puedeEditar,
}: {
  clientId: string;
  clientName: string;
  /** Los encargados de HOY, ya deduplicados y acotados al pipeline de CS por el servidor. */
  nombres: string[];
  /** El equipo activo. Vacío ⇒ se pinta como texto, sin desplegable. */
  opciones: OpcionDeEncargado[];
  puedeEditar: boolean;
}) {
  const router = useRouter();

  /* ⚠ El `value` es el EMAIL y no el nombre: es lo que el endpoint sabe resolver contra
     `TeamMember`, y dos personas pueden llamarse igual. El nombre es solo lo que se lee. */
  const items: OpcionDeCelda[] = opciones.map((o) => ({
    value: o.email,
    label: o.name,
    hint: o.email,
  }));

  /**
   * La selección de hoy llega como NOMBRES (así los arma el servidor, resolviendo owners de
   * HubSpot), y `CeldaSelect` trabaja con `value`. Se traduce nombre → email.
   *
   * ⚠ Lo que NO matchea se conserva TAL CUAL en vez de descartarse: un encargado que está en
   * HubSpot pero no en el equipo de Nexus (alguien que se fue, o un owner que nunca se dio de
   * alta acá) tiene que seguir viéndose. `CeldaSelect` cae al `value` crudo cuando no encuentra
   * la opción, así que se lee el nombre; y el contador «+N» sigue contando bien, que es lo que
   * se rompía al filtrarlos.
   */
  const seleccion = nombres.map((n) => opciones.find((o) => o.name === n)?.email ?? n);

  return (
    <CeldaSelect
      opciones={items}
      seleccion={seleccion}
      puedeEditar={puedeEditar}
      etiqueta={`CSE encargado de ${clientName}${nombres.length ? `: ${nombres[0]}` : ""}`}
      placeholderBusqueda="Buscar persona…"
      onElegir={async (email) => {
        const r = await fetch(`/api/clients/${clientId}/cse-encargado`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        if (!r.ok) throw new Error(j.error ?? "no se pudo reasignar");
        /* El valor nuevo lo trae el servidor: la celda se repinta con lo que quedó en HubSpot,
           no con lo que pedimos. Si el espejo trajo otra cosa, se ve esa. */
        router.refresh();
      }}
    />
  );
}
