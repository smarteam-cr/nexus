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
 */
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

  const guardar = async (value: string) => {
    const email = value === NADIE ? null : value;
    if (email === actual) return;
    const mandar = (v: number) =>
      fetch(`/api/sales/exploraciones/${exploracionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: v, operaciones: [{ op: "responsable", email }] }),
      });
    let res = await mandar(version);
    let data = (await res.json().catch(() => ({}))) as { error?: string; exploracion?: { version: number; estado: { responsableEmail: string | null } } };
    if (res.status === 409 && data.exploracion && (data.exploracion.estado.responsableEmail?.toLowerCase() ?? null) === actual) {
      res = await mandar(data.exploracion.version);
      data = (await res.json().catch(() => ({}))) as typeof data;
    }
    if (!res.ok) throw new Error(data.error ?? "no se pudo cambiar quién la lleva");
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
