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
 * Escribe «CSE Encargado» (`cse_encargado`) en TODOS los proyectos del cliente que están en el pipeline de
 * Implementación de HubSpot, en la empresa y en sus contactos, y deja «CSL Encargado» con la CSL (desde el
 * 2026-10-09; antes escribía `csl_encargado`, que guardaba al CSE) — porque el encargado es de la CUENTA, no de un
 * proyecto. Los de Desarrollo/Sitios web NO se tocan: cuelgan como hijos y tienen su propio encargado técnico.
 * Eso lo decide el endpoint; acá solo se elige. Al CSE nuevo le llega el resumen de la cuenta en «Para ti».
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CeldaSelect, type OpcionDeCelda } from "@/components/ui/CeldaSelect";

export interface OpcionDeEncargado {
  email: string;
  name: string;
}

export default function CseEncargadoSelect({
  clientId,
  clientName,
  encargado,
  opciones,
  puedeEditar,
  sugerencia,
}: {
  clientId: string;
  clientName: string;
  /**
   * Quien lleva la cuenta HOY, de la regla única (lib/cuentas/encargado.ts). Uno solo: antes la celda recibía los
   * dueños de todos los proyectos y pintaba el primero, y una fila vieja dejaba a otra persona adelante (Librería,
   * 2026-10-19). `email` null = no está en el equipo activo (se lee el nombre tal cual).
   */
  encargado: { nombre: string; email: string | null } | null;
  /** El equipo activo. Vacío ⇒ se pinta como texto, sin desplegable. */
  opciones: OpcionDeEncargado[];
  puedeEditar: boolean;
  /** El correo que propone Nexus cuando no hay encargado (Éxito del cliente › Equipo): elegirlo es el pase de cuenta. */
  sugerencia?: string;
}) {
  const router = useRouter();

  const items: OpcionDeCelda[] = opciones.map((o) => ({
    value: o.email,
    label: o.name,
    hint: o.email,
  }));

  /* Lo elegido, mientras el servidor no traiga otra cosa: si el pase se escribió pero la página todavía muestra al
     anterior (la sincronización no terminó), la celda no vuelve atrás. Se suelta en cuanto los props traen a esa
     persona, o a otra distinta de la que había al elegir (alguien la cambió después). */
  const [elegido, setElegido] = useState<{ email: string; antes: string | null } | null>(null);
  const deHoy = encargado?.email?.toLowerCase() ?? null;
  const vigente = elegido && elegido.antes === deHoy && elegido.email !== deHoy ? elegido.email : null;
  // En cuanto la página trae a la persona elegida (o a otra), lo elegido se suelta: después manda la página. Se ajusta
  // durante el render (el patrón de React para derivar estado de las props), no en un efecto.
  if (elegido && elegido.antes !== deHoy) setElegido(null);

  /* ⚠ El `value` es el EMAIL: es lo que el endpoint sabe resolver contra `TeamMember`, y dos personas pueden llamarse
     igual. Alguien que no está en el equipo de Nexus (se fue, o nunca se dio de alta) se ve por su nombre. */
  const opcionDe = (email: string | null) => (email ? opciones.find((o) => o.email.toLowerCase() === email)?.email ?? null : null);
  const seleccion = vigente
    ? [opcionDe(vigente) ?? vigente]
    : encargado
      ? [opcionDe(deHoy) ?? encargado.nombre]
      : [];

  return (
    <CeldaSelect
      opciones={items}
      seleccion={seleccion}
      puedeEditar={puedeEditar}
      etiqueta={`CSE encargado de ${clientName}${encargado ? `: ${encargado.nombre}` : ""}`}
      placeholderBusqueda="Buscar persona…"
      sugerencia={sugerencia}
      onElegir={async (email) => {
        const r = await fetch(`/api/clients/${clientId}/cse-encargado`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        if (!r.ok) throw new Error(j.error ?? "no se pudo reasignar");
        setElegido({ email: email.toLowerCase(), antes: deHoy });
        /* La ruta responde bien SOLO si Nexus ya lee a esa persona como encargada (relee después de escribir); si no,
           devuelve el error y la celda lo muestra. Recién entonces se fija lo elegido, hasta que la página traiga lo
           nuevo: así la celda no vuelve atrás mientras `router.refresh()` no llega. */
        router.refresh();
      }}
    />
  );
}
