"use client";

/**
 * FranjaDeSugerencias — la franja azul de arriba de una pieza: cuánto sugirió el agente ahí y qué
 * hacer con todo junto (diseño del 2026-10-03). Reemplaza al marco grande de «Hay N propuestas»: la
 * decisión fina se toma en cada fila, en su lugar, o en el cajón «Revisar todo».
 *
 * Las piezas (la franja, los tres botones de los tableros y la chispa) se mudaron a
 * components/ui/sistema.tsx el 2026-10-04, cuando las necesitó la ficha del cliente. Este archivo
 * las re-exporta para que la preventa siga importándolas de donde siempre.
 */
import { FranjaDeSugerencias } from "@/components/ui/sistema";

export { BotonAzul, BotonBlanco, BotonTexto, IconoDeSugerencia } from "@/components/ui/sistema";

export default FranjaDeSugerencias;
