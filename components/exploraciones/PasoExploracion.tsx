"use client";

/**
 * PasoExploracion — las sesiones con el cliente.
 *
 * Una pestaña por sesión, cada una con «Antes» (la guía para prepararla) y «Después» (leer la
 * reunión, lo que salió, lo que nadie exploró y armar la siguiente): components/exploraciones/
 * SesionesDeExploracion.tsx (pedido de Elías, 2026-10-03). La escala, las áreas en juego y los datos
 * de la medición viven en «La escala»; con quién se habla y cómo conectar, en Preparación. Al final,
 * plegado, el historial del agente.
 *
 * Lo que no quedó en Meet se suma en el «Contexto adicional» de arriba (ContextoDeLaPreventa), que
 * está en todas las piezas: la preventa que se abre «Con una transcripción» llega acá con `?sumar=1`
 * y ese bloque abierto.
 */
import { HistorialDelAgente } from "./PanelDelAgente";
import SesionesDeExploracion from "./SesionesDeExploracion";

export default function PasoExploracion() {
  return (
    <div className="space-y-8">
      <SesionesDeExploracion />
      <HistorialDelAgente />
    </div>
  );
}
