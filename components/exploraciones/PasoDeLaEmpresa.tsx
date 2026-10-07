"use client";

/**
 * PasoDeLaEmpresa — «Información del cliente» y «Procesos» dentro de la preventa (Elías, 2026-10-06:
 * «copia todo el módulo de información del cliente y procesos a las preventas»).
 *
 * No es una copia: son los MISMOS componentes de la ficha del cliente sobre la MISMA empresa
 * (`exp.empresa.clientId`). Lo que se confirma acá queda en la ficha de la empresa y en HubSpot, y
 * cuando la venta pasa a proyecto, el CSE lo encuentra ya escrito. Quedan afuera las licencias (un
 * prospecto todavía no compró nada) y, por ahora, los documentos y la marca: viven en el proyecto de
 * estrategia del cliente, que la ficha no le crea a un prospecto (app/(shell)/clients/[id]/page.tsx).
 * Lo que se suma a mano en la preventa va en Exploración.
 */
import FichaDelCliente from "@/components/clients/FichaDelCliente";
import ProcesosDeLaCuenta from "@/components/procesos/ProcesosDeLaCuenta";
import { useLienzo } from "./contexto";

export function PasoInformacion() {
  const { exp } = useLienzo();
  return <FichaDelCliente clientId={exp.empresa.clientId} />;
}

export function PasoProcesos() {
  const { exp } = useLienzo();
  return <ProcesosDeLaCuenta clientId={exp.empresa.clientId} slotDelPanel={null} />;
}
