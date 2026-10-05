"use client";

/**
 * ElegirResponsable — quién lleva la preventa, elegido ahí mismo: en la columna «La lleva» del
 * listado y en la cabecera de la preventa (pedido de Elías, 2026-10-05).
 *
 * Es una envoltura de `CeldaSelect` (flechita, buscador, el clic que no navega, el error en la celda).
 * Guarda con la misma operación que el lienzo (`responsable`, PATCH de la preventa). El servidor le
 * avisa a la persona nueva y vuelve a medir el «Para ti» de las dos (app/api/sales/exploraciones/[id]).
 *
 * Si chocó con otro cambio (409) y quien la lleva sigue siendo el que se veía, se manda de nuevo
 * sobre la versión nueva: lo que cambió fue otra cosa (casi siempre el agente al preparar).
 *
 * La celda no es optimista y el refresco tarda: lo que devolvió el último PATCH (quién la lleva y la
 * versión) queda guardado y manda sobre las props mientras sea más nuevo. Sin eso, elegir B y volver
 * a A antes del refresco no mandaba nada («ya es A») y quedaba B en el servidor (auditoría 2026-10-05).
 */
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { CeldaSelect, type OpcionDeCelda } from "@/components/ui/CeldaSelect";

export interface PersonaDelEquipo {
  email: string;
  name: string;
}

/** El `value` de «Sin responsable»: CeldaSelect no acepta un value vacío como opción distinguible. */
const NADIE = "__nadie__";

export default function ElegirResponsable({
  exploracionId,
  version,
  responsableEmail,
  empresa,
  equipo,
  puedeEditar,
}: {
  exploracionId: string;
  version: number;
  responsableEmail: string | null;
  empresa: string;
  equipo: PersonaDelEquipo[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const actual = responsableEmail?.toLowerCase() ?? null;
  const opciones: OpcionDeCelda[] = [
    ...equipo.map((p) => ({ value: p.email.toLowerCase(), label: p.name, hint: p.email })),
    { value: NADIE, label: "Sin responsable" },
  ];
  // Quien la lleva y ya no está en el equipo activo se sigue viendo (CeldaSelect cae al value crudo).
  const seleccion = actual ? [actual] : [];

  // Lo último que confirmó un PATCH de esta celda, hasta que el refresco traiga algo igual o más nuevo.
  const confirmado = useRef<{ email: string | null; version: number } | null>(null);

  const guardar = async (value: string) => {
    const email = value === NADIE ? null : value;
    const ultimo = confirmado.current;
    const base = ultimo && ultimo.version > version ? ultimo : { email: actual, version };
    if (email === base.email) return;
    const mandar = (v: number) =>
      fetch(`/api/sales/exploraciones/${exploracionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: v, operaciones: [{ op: "responsable", email }] }),
      });
    let res = await mandar(base.version);
    let data = (await res.json().catch(() => ({}))) as { error?: string; exploracion?: { version: number; estado: { responsableEmail: string | null } } };
    if (res.status === 409 && data.exploracion && (data.exploracion.estado.responsableEmail?.toLowerCase() ?? null) === base.email) {
      res = await mandar(data.exploracion.version);
      data = (await res.json().catch(() => ({}))) as typeof data;
    }
    if (!res.ok) throw new Error(data.error ?? "no se pudo cambiar quién la lleva");
    if (data.exploracion) {
      confirmado.current = { email: data.exploracion.estado.responsableEmail?.toLowerCase() ?? null, version: data.exploracion.version };
    }
    router.refresh();
  };

  return (
    <CeldaSelect
      opciones={opciones}
      seleccion={seleccion}
      vacio="Sin responsable"
      puedeEditar={puedeEditar}
      etiqueta={`Quién lleva la preventa de ${empresa}`}
      placeholderBusqueda="Buscar persona…"
      minimoParaBuscar={6}
      onElegir={guardar}
    />
  );
}
