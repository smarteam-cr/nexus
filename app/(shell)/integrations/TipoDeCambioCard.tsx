/**
 * app/(shell)/integrations/TipoDeCambioCard.tsx — EL TIPO DE CAMBIO DEL BCCR, EN LA PANTALLA DE INTEGRACIONES (2026-10-06).
 *
 * Server component: pinta lo que la página ya midió.
 *
 * Desde el 2026-10-05 Nexus convierte colones a dólares con la tasa de cada día del Banco Central (lib/finanzas/
 * tipo-cambio-server.ts), que trae el job `tipo-cambio-daily`. Hasta acá el job corría sin tarjeta: si un día no
 * llegaba la tasa, solo se veía en el semáforo del servidor, con su clave cruda. La tarjeta dice si la tasa de hoy
 * está, de dónde salió y desde cuándo hay histórico.
 *
 * Sin gate de costos, a diferencia de Odoo y Mercury: una tasa publicada no es plata de nadie (mismo criterio que
 * `TipoCambioMes` en policies.sql). El enlace al histórico sí respeta su página (`cobranza.read`).
 */
import Link from "next/link";
import TarjetaDeConexion, { type EstadoDeConexion } from "./TarjetaDeConexion";
import type { EstadoDelTipoDeCambio } from "@/lib/finanzas/tipo-cambio-server";
import type { ResultadoDeJob } from "@/lib/jobs/estado";
import { sumarDias } from "@/lib/finanzas/tipo-cambio";

interface Props {
  /** null = la tabla del tipo de cambio diario todavía no existe en esta base. */
  estado: EstadoDelTipoDeCambio | null;
  /** Lo último que anotó el scheduler para `tipo-cambio-daily` (null = nunca corrió acá). */
  ultimaCorrida: ResultadoDeJob | null;
  motivoApagado: string | null;
  hoyISO: string;
  puedeVerHistorico: boolean;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fechaCorta = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]}`;
const fechaConAnio = (f: string) => `${fechaCorta(f)} ${f.slice(0, 4)}`;
const crc = (n: number) => `₡${n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TipoDeCambioCard({ estado, ultimaCorrida, motivoApagado, hoyISO, puedeVerHistorico }: Props) {
  const ultima = estado?.ultima ?? null;
  // La tasa de hoy sale temprano; un día de atraso puede ser un feriado. Dos ya es que no está llegando.
  const atrasada = !!ultima && ultima.fecha < sumarDias(hoyISO, -2);
  const fallo = ultimaCorrida?.ok === false;

  const situacion: EstadoDeConexion = motivoApagado
    ? { tono: "apagado", texto: "Apagado" }
    : !estado
      ? { tono: "atencion", texto: "Sin preparar" }
      : fallo
        ? { tono: "error", texto: "Falló" }
        : !ultima || atrasada
          ? { tono: "atencion", texto: "Atrasado" }
          : { tono: "ok", texto: "Al día" };

  return (
    <TarjetaDeConexion
      nombre="Tipo de cambio"
      queTrae="La venta y la compra del dólar, cada día, del Banco Central"
      estado={situacion}
      dato={ultima ? { numero: crc(ultima.venta), unidad: `venta del ${fechaCorta(ultima.fecha)}` } : null}
      pie={
        motivoApagado ??
        (!estado
          ? "Falta preparar la base para guardar la tasa de cada día."
          : estado.desde
            ? `Desde el ${fechaConAnio(estado.desde)} · ${estado.dias.toLocaleString("es-CR")} días · ${estado.conToken ? "del BCCR" : "de Hacienda"}`
            : "Todavía no se guardó ninguna tasa.")
      }
      accion={
        puedeVerHistorico && estado ? (
          <Link href="/finanzas/tipo-de-cambio" className="text-[13px] font-semibold text-brand hover:text-brand-light">
            Ver el histórico
          </Link>
        ) : undefined
      }
    >
      {!motivoApagado && fallo && (
        <p className="text-xs leading-[17px] text-danger-ink bg-danger-surface border border-danger-line rounded-lg px-3 py-2">
          La última corrida no dejó la tasa de hoy: lo que tiene fecha de hoy se convierte con la del último día guardado.
        </p>
      )}
      {!motivoApagado && !fallo && atrasada && ultima && (
        <p className="text-xs leading-[17px] text-warn-ink bg-warn-surface border border-warn-line rounded-lg px-3 py-2">
          La última tasa es del {fechaConAnio(ultima.fecha)}. Pasada una semana sin tasa, los cobros de esos días se
          convierten con el promedio del mes.
        </p>
      )}
      {estado && !estado.conToken && !motivoApagado && (
        <p className="text-xs leading-[17px] text-warn-ink bg-warn-surface border border-warn-line rounded-lg px-3 py-2">
          Sin el token del Banco Central en este servidor: toma la tasa de Hacienda, que es la misma, pero no completa días
          que falten.
        </p>
      )}
    </TarjetaDeConexion>
  );
}
