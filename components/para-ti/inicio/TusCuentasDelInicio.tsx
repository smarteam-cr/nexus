/**
 * TusCuentasDelInicio — las cuentas del inicio con su acción de la semana y su reunión de los próximos 8 días (ficha D,
 * 2026-10-17; diseño «Para ti · Ventas y CSE», la tarjeta «Tus cuentas» del CSE).
 *
 * Una fila por cuenta: el color (a quien lo puede ver), el nombre, por qué tiene ese color o qué se hace con ella, y
 * dos marcas: ✓ si tiene su acción esta semana y ✓ con el día si tiene reunión; ○ en ámbar si falta. Primero las que
 * les falta algo. La CSL ve además quién la lleva.
 *
 * Abajo, «Ver las N» lleva a TODAS las cuentas y «Ver las M sin acción o reunión», a todas las que la regla marca, sin
 * tope (2026-10-19): la tarjeta muestra cinco, y lo que no entra tiene que poder verse entero.
 */
import Link from "next/link";
import { cn } from "@/lib/cn";
import { cuandoEsLaReunion, DIAS_PARA_LA_REUNION } from "@/lib/mi-dia/servicio";
import type { CuentaDelInicio } from "@/lib/mi-dia/inicio-server";
import { NOMBRE_DE_SALUD, Punto, PUNTO_DE_SALUD, TARJETA, TITULO } from "./piezas";

const ORDEN_DE_SALUD: Record<string, number> = { riesgo: 0, senales: 1, "sin-datos": 2, espera: 3, bien: 4 };

export function ordenarCuentas(cuentas: readonly CuentaDelInicio[]): CuentaDelInicio[] {
  return [...cuentas].sort(
    (a, b) =>
      (b.servicio?.falta.length ?? 0) - (a.servicio?.falta.length ?? 0) ||
      (ORDEN_DE_SALUD[a.salud ?? "sin-datos"] ?? 2) - (ORDEN_DE_SALUD[b.salud ?? "sin-datos"] ?? 2) ||
      a.empresa.localeCompare(b.empresa, "es"),
  );
}

export default function TusCuentasDelInicio({
  cuentas,
  titulo,
  max,
  verTodas,
  verSinServicio = null,
  enElDestino = null,
  conQuienLaLleva,
  hoyISO,
}: {
  cuentas: readonly CuentaDelInicio[];
  titulo: string;
  /** Cuántas se ven; null = todas. */
  max: number | null;
  verTodas: string | null;
  /** Todas las que la regla de servicio marca. */
  verSinServicio?: string | null;
  /**
   * Cuántas cuentas hay en la lista a la que lleva «Ver las N» (la cartera de Customer Success, que en la CSL suma las que
   * solo tienen desarrollo). Si no coincide con las de la tarjeta, el enlace de las que faltan no dice un número que la
   * lista de destino no va a mostrar.
   */
  enElDestino?: number | null;
  conQuienLaLleva: boolean;
  hoyISO: string;
}) {
  const orden = ordenarCuentas(cuentas);
  const vista = max == null ? orden : orden.slice(0, max);
  const faltan = cuentas.filter((c) => (c.servicio?.falta.length ?? 0) > 0).length;
  const faltanFuera = orden.slice(vista.length).some((c) => (c.servicio?.falta.length ?? 0) > 0);
  const total = enElDestino ?? cuentas.length;
  const mismaLista = total === cuentas.length;
  return (
    <section className={cn(TARJETA, "flex flex-col gap-3 p-5")} aria-labelledby="cuentas-t">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="cuentas-t" className={TITULO}>
          {titulo}
        </h2>
        <span className="text-[11px] text-fg-muted">Acción · Reunión en {DIAS_PARA_LA_REUNION} días</span>
      </div>
      {vista.length === 0 ? (
        <p className="border-t border-line pt-2.5 text-[13px] text-fg-muted">No hay cuentas con servicio activo.</p>
      ) : (
        <ul className="flex flex-col">
          {vista.map((c) => {
            const accion = c.servicio?.accion ?? null;
            const reunion = c.servicio?.reunion ?? null;
            const sinCalendario = c.servicio ? !c.servicio.calendarioLeido : false;
            const linea = [conQuienLaLleva ? (c.lleva ? `Lleva ${c.lleva}` : "Sin CSE") : null, c.porque ?? (accion ? `Acción: ${accion.titulo}` : c.proyectos.join(", "))]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={c.clientId} className="flex items-start gap-2.5 border-t border-line px-1 py-2.5 transition-colors hover:bg-surface-muted">
                {c.salud ? <Punto className={cn("mt-1.5", PUNTO_DE_SALUD[c.salud])} /> : <Punto className="mt-1.5 border-[1.5px] border-line bg-transparent" />}
                <div className="min-w-0 flex-1">
                  <Link href={`/clients/${encodeURIComponent(c.clientId)}`} className="block truncate text-[13px] font-semibold text-fg transition-colors hover:text-brand" title={c.salud ? NOMBRE_DE_SALUD[c.salud] : undefined}>
                    {c.empresa}
                  </Link>
                  <p className="truncate text-xs text-fg-muted" title={linea}>
                    {linea}
                  </p>
                </div>
                <span className="flex flex-none items-baseline gap-3 whitespace-nowrap text-xs">
                  <span className={cn("font-semibold", accion ? "text-success-ink" : "text-warn-ink")} title={accion ? `T-${accion.numero} · ${accion.titulo}` : "Sin una tarea con fecha esta semana"}>
                    {accion ? "✓" : "○"}
                  </span>
                  <span
                    className={cn("min-w-[44px] font-semibold", reunion ? "text-success-ink" : sinCalendario ? "text-fg-muted" : "text-warn-ink")}
                    title={reunion ? reunion.titulo : sinCalendario ? "El calendario no se pudo leer" : `Sin reunión en los próximos ${DIAS_PARA_LA_REUNION} días`}
                  >
                    {reunion ? `✓ ${cuandoEsLaReunion(reunion.inicio, hoyISO)}` : sinCalendario ? "?" : "○"}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {max != null && cuentas.length > max && (verTodas || (verSinServicio && faltanFuera)) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {verSinServicio && faltanFuera && (
            <Link href={verSinServicio} className="text-[13px] font-medium text-brand transition-colors hover:text-brand-light">
              {mismaLista ? `Ver las ${faltan} sin acción o reunión` : "Ver las que no tienen acción o reunión"}
            </Link>
          )}
          {verTodas && (
            <Link href={verTodas} className="text-[13px] font-medium text-brand transition-colors hover:text-brand-light">
              Ver las {total}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
