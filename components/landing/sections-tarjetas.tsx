"use client";

/**
 * components/landing/sections-tarjetas.tsx — LA GRILLA DE TARJETAS CON ÍCONO, CREABLE.
 *
 * Es el hermano con ícono de «Texto con tarjetas», y comparte su MISMO esquema: migrar una sección
 * de una forma a la otra no debería costar reescribir el contenido. Lo único que cambia es cómo se
 * pinta — cuatro por fila y con un ícono arriba.
 *
 * ⚠ El ícono usa el token del motor (`.stl-card-icon`, azul del tema), no un color propio. La
 * excepción ámbar de los dolores de una propuesta comercial se declara allá, en quien la quiere.
 */
import type { FC } from "react";
import { CardGrid } from "./card-grid";
import type { SectionProps } from "./types";

interface ItemDeTarjeta {
  title: string;
  detail?: string;
}
interface TarjetasData {
  intro?: string;
  items?: ItemDeTarjeta[];
}

/**
 * Los íconos, rotados por posición.
 *
 * ⚠ Son GEOMÉTRICOS y no ilustrativos: el modelo elige el contenido, no el dibujo, y un ícono que
 * pretenda significar algo va a contradecir al texto en la mitad de los casos. Acá el ícono es
 * ritmo visual, no información.
 */
const FIGURAS = ["◆", "●", "▲", "■"];

export const TarjetasSection: FC<SectionProps<TarjetasData>> = ({ data, editable, onChange }) => {
  const items = data?.items ?? [];
  return (
    <CardGrid
      items={items}
      editable={editable}
      onItems={(next) => onChange?.({ ...data, items: next })}
      columnas={4}
      icono={(i) => FIGURAS[i % FIGURAS.length]}
      addLabel="Agregar tarjeta"
      placeholderTitulo="Título corto…"
      placeholderDetalle="Una línea que lo explique…"
    />
  );
};
