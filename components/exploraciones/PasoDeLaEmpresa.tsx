"use client";

/**
 * PasoDeLaEmpresa — «Información del cliente» y «Procesos» dentro de la preventa (Elías, 2026-10-06:
 * «deben ser los mismos de los clientes … compartido por la misma empresa de HubSpot, y verse aparte,
 * igual que en el módulo de clientes»).
 *
 * No es una copia: son los MISMOS componentes de la ficha del cliente sobre la MISMA empresa
 * (`exp.empresa.clientId`, que es la ficha de la empresa de HubSpot). Lo que se confirma acá queda en
 * la ficha y en HubSpot, y cuando la venta pasa a proyecto el CSE lo encuentra ya escrito. En la
 * barra van aparte, en «La cuenta», como en la ficha del cliente. Quedan afuera las licencias: un
 * prospecto todavía no compró nada.
 */
import ClientInfoPanel from "@/components/clients/ClientInfoPanel";
import ProcesosDeLaCuenta from "@/components/procesos/ProcesosDeLaCuenta";
import { useLienzo } from "./contexto";

/** El proyecto que guarda la información de la empresa (lib/canvas/strategy-project.ts). */
export interface InfoDeLaEmpresa {
  projectId: string;
  canvasId: string;
}

export function PasoInformacion({ info }: { info: InfoDeLaEmpresa }) {
  const { exp } = useLienzo();
  return <ClientInfoPanel projectId={info.projectId} canvasId={info.canvasId} clientId={exp.empresa.clientId} enLaPreventa />;
}

export function PasoProcesos() {
  const { exp } = useLienzo();
  return <ProcesosDeLaCuenta clientId={exp.empresa.clientId} slotDelPanel={null} />;
}
