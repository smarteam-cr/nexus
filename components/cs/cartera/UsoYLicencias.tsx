"use client";

/**
 * «Uso y licencias» — ¿están usando lo que compraron?, los primeros 90 días, y dónde se
 * desperdicia o se queda corto el dinero. Todo sumado en la cartera entera: «10 cuentas no
 * activaron Service Hub» dice qué taller dar, en vez de resolverlo cuenta por cuenta.
 *
 * ⚠ Lo que «falta activar» es la frase general que da HubSpot («Scale Support»), no una
 * herramienta puntual: Partner Clients no baja a ese detalle.
 */
import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/cs/formato";
import { UMBRALES } from "@/lib/cs/lectura-partner";
import type { AdopcionDeUnHub, CuentaNueva, ItemDeConsumo } from "@/lib/cs/cartera-reglas";
import { Avatar, Barra, CajaDeTabla, Chip, EncabezadoDeTabla, TituloDeSeccion } from "../piezas";

const COLUMNAS = "grid-cols-[minmax(0,1fr)_90px_120px_96px_minmax(0,1.5fr)_minmax(0,1.2fr)]";

export default function UsoYLicencias({
  adopcion,
  primeros90,
  consumo,
}: {
  adopcion: AdopcionDeUnHub[];
  primeros90: { nuevas: number; pendientes: CuentaNueva[] };
  consumo: { paganYNoUsan: ItemDeConsumo[]; alLimite: ItemDeConsumo[] };
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  return (
    <div className="space-y-7">
      <section className="space-y-3">
        <TituloDeSeccion
          titulo="¿Están usando lo que compraron?"
          ayuda="Cada hub sumado en la cartera. Lo que falta activar es lo que dice HubSpot de cada cuenta."
        />
        {adopcion.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-surface-muted px-4 py-6 text-[13px] text-fg-muted">
            Sin datos de uso: HubSpot Partner no trajo hubs para las cuentas de la cartera.
          </p>
        ) : (
          <CajaDeTabla minimo="min-w-[940px]">
            <EncabezadoDeTabla columnas={COLUMNAS}>
              <span>Hub</span>
              <span className="text-right">Cuentas</span>
              <span>Uso promedio</span>
              <span className="text-right">Sin activar</span>
              <span>Lo que falta activar</span>
              <span>Para varias cuentas</span>
            </EncabezadoDeTabla>
            {adopcion.map((h, i) => (
              <div key={h.hub} className={cn(i > 0 && "border-t border-line")}>
                <div className={cn("grid items-center gap-4 px-4 py-3.5 text-[13px] text-fg", COLUMNAS)}>
                  <span className="text-sm font-semibold">{h.nombre}</span>
                  <span className="text-right tabular-nums">{h.cuentas}</span>
                  {h.usoPromedio === null ? (
                    <span className="text-xs text-fg-muted">HubSpot no lo mide</span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <b className="w-[22px] font-semibold tabular-nums">{h.usoPromedio}</b>
                      <Barra valor={h.usoPromedio} atencion={h.usoPromedio < UMBRALES.usoBajo} ancho="w-14" />
                    </span>
                  )}
                  <span className="text-right">
                    {h.sinActivar.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setAbierto(abierto === h.hub ? null : h.hub)}
                        className="font-semibold tabular-nums text-warn-ink underline-offset-2 hover:underline"
                        aria-expanded={abierto === h.hub}
                      >
                        {h.sinActivar.length}
                      </button>
                    ) : (
                      <span className="tabular-nums">0</span>
                    )}
                  </span>
                  <span>
                    {h.porActivar.length > 0
                      ? h.porActivar.map((p) => `«${p.frase}» · ${plural(p.cuentas.length, "cuenta", "cuentas")}`).join(" · ")
                      : <span className="text-fg-muted">—</span>}
                  </span>
                  <span>
                    {h.tallerGrupal ? (
                      <b className="font-semibold text-fg">Taller grupal de {h.nombre}</b>
                    ) : h.sinActivar.length > 0 ? (
                      <span className="text-fg-secondary">Cuenta por cuenta</span>
                    ) : (
                      <span className="text-fg-muted">—</span>
                    )}
                  </span>
                </div>
                {abierto === h.hub && (
                  <div className="flex flex-wrap gap-1.5 border-t border-line bg-surface-muted px-4 py-2.5">
                    <span className="mr-1 text-xs text-fg-muted">Sin activar:</span>
                    {h.sinActivar.map((c) => (
                      <Link key={c.clientId} href={`/customer-success/${c.clientId}`} className="text-xs font-medium text-brand hover:text-brand-light">
                        {c.nombre}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CajaDeTabla>
        )}
      </section>

      <section className="space-y-3">
        <TituloDeSeccion
          titulo="Primeros 90 días"
          ayuda={`${plural(primeros90.nuevas, "cuenta nueva", "cuentas nuevas")}. ${primeros90.pendientes.length > 0 ? `${plural(primeros90.pendientes.length, "todavía no activó", "todavía no activaron")} algo que paga${primeros90.pendientes.length === 1 ? "" : "n"}.` : "Todas activaron lo que pagan."}`}
        />
        {primeros90.pendientes.length > 0 && (
          <div className="rounded-xl border border-line bg-surface">
            {primeros90.pendientes.map((c, i) => (
              <Link
                key={c.clientId}
                href={`/customer-success/${c.clientId}`}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_130px_30px] items-center gap-4 px-4 py-3.5 transition-colors hover:bg-surface-hover",
                  i > 0 && "border-t border-line",
                )}
              >
                <span className="truncate text-sm font-semibold text-fg">{c.nombre}</span>
                <span className="text-[13px] text-fg">{c.pendiente}</span>
                <span className={cn("text-[13px]", c.dias > 60 ? "text-warn-ink" : "text-fg-secondary")}>cliente hace {c.dias} días</span>
                <Avatar nombre={c.cse?.nombre ?? null} />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <TituloDeSeccion
          titulo="¿Dónde se desperdicia o se queda corto el dinero?"
          ayuda="Quien paga y no usa puede no renovar. Quien está al límite puede subir de plan."
        />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <ListaDeConsumo titulo="Pagan y no usan" chip={<Chip tono="atencion">riesgo de no renovar</Chip>} items={consumo.paganYNoUsan} vacio="Nadie paga licencias o contactos que no usa." />
          <ListaDeConsumo titulo="Al límite" chip={<Chip>oportunidad de subir de plan</Chip>} items={consumo.alLimite} vacio="Ninguna cuenta está al límite de lo que paga." />
        </div>
      </section>
    </div>
  );
}

function ListaDeConsumo({ titulo, chip, items, vacio }: { titulo: string; chip: React.ReactNode; items: ItemDeConsumo[]; vacio: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-semibold text-fg">{titulo}</span>
        {chip}
      </div>
      {items.length === 0 ? (
        <p className="mt-3 border-t border-line pt-3 text-[13px] text-fg-muted">{vacio}</p>
      ) : (
        items.map((it, i) => (
          <Link
            key={`${it.clientId}-${it.que}`}
            href={`/customer-success/${it.clientId}`}
            className={cn("flex justify-between gap-3 border-t border-line py-2.5 text-[13px] hover:text-brand", i === 0 && "mt-2.5", i === items.length - 1 && "pb-0")}
          >
            <span>
              <b className="font-semibold text-fg">{it.nombre}</b>
              <br />
              <span className="text-fg-muted">{it.que}</span>
            </span>
            <span className="whitespace-nowrap text-fg-secondary">{it.cuanto}</span>
          </Link>
        ))
      )}
    </div>
  );
}
