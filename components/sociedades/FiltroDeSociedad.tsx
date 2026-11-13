"use client";

/**
 * components/sociedades/FiltroDeSociedad.tsx — el filtro por sociedad de Smarteam (2026-11-13), el mismo en toda
 * pantalla que lo use. Controlado: la pantalla guarda la clave elegida y filtra con `filtrarPorSociedad`
 * (lib/sociedades/sociedades.ts). La elección queda en la dirección (`?sociedad=`) para compartirla, sin recargar.
 *
 * Solo muestra las sociedades que tienen algo en la lista (`opcionesDelFiltro`); con una sola, no se dibuja.
 */
import { Segmentado } from "@/components/ui";
import { opcionesDelFiltro, TODAS_LAS_SOCIEDADES, type SociedadPropiaDTO } from "@/lib/sociedades/sociedades";

export default function FiltroDeSociedad({
  sociedades,
  conteo,
  valor,
  onCambio,
  className,
}: {
  sociedades: ReadonlyArray<Pick<SociedadPropiaDTO, "clave" | "nombre" | "orden" | "activa">>;
  /** Cuántas filas tiene cada sociedad (por clave). */
  conteo: ReadonlyMap<string, number>;
  /** La clave elegida; null = todas. */
  valor: string | null;
  onCambio: (clave: string | null) => void;
  className?: string;
}) {
  const opciones = opcionesDelFiltro(sociedades, conteo, valor);
  if (opciones.length <= 2 && !valor) return null;
  return (
    <Segmentado
      etiqueta="Sociedad de Smarteam"
      className={className}
      opciones={opciones}
      valor={valor ?? TODAS_LAS_SOCIEDADES}
      onCambio={(k) => {
        const clave = k === TODAS_LAS_SOCIEDADES ? null : k;
        onCambio(clave);
        try {
          const url = new URL(window.location.href);
          if (clave) url.searchParams.set("sociedad", clave);
          else url.searchParams.delete("sociedad");
          window.history.replaceState(window.history.state, "", url);
        } catch {
          /* Sin la dirección actualizada el filtro anda igual. */
        }
      }}
    />
  );
}
