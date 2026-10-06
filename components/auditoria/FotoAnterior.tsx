/**
 * La ficha de una auditoría de la VERSIÓN ANTERIOR (antes del rediseño del 2026-10-04), en SOLO LECTURA.
 *
 * Esas fotos no se migran ni se reescriben, pero lo que guardaron se sigue viendo: los totales, los
 * embudos del ciclo de vida, los propietarios y los insights de la IA. Qué se muestra lo decide
 * `leerFotoAnterior` (lib/auditoria-portal/foto-anterior.ts); acá solo se pinta. Sin botones: no se
 * confirma, no se regenera, no se edita nada.
 */
import type { ReactNode } from "react";
import { Alert } from "@/components/ui";
import { cifra, porcentaje } from "@/lib/auditoria-portal/cifras";
import {
  ETIQUETA_DE_SEVERIDAD_ANTERIOR,
  ROTULO_DE_LA_VERSION_ANTERIOR,
  type FotoAnterior,
  type SeveridadAnterior,
} from "@/lib/auditoria-portal/foto-anterior";
import { Barras, ChipDeEstado, Cifra, Rotulo, Tarjeta } from "./piezas";

const TONO: Record<SeveridadAnterior, "critico" | "atencion" | "neutro" | "bien"> = {
  critical: "critico",
  warning: "atencion",
  info: "neutro",
  positive: "bien",
};

const fechaLarga = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <Rotulo>{titulo}</Rotulo>
      {children}
    </section>
  );
}

export default function FotoAnteriorDeAuditoria({ foto }: { foto: FotoAnterior }) {
  const { totales, propietarios } = foto;
  const nada =
    !totales &&
    foto.contactosPorEtapa.length === 0 &&
    foto.empresasPorEtapa.length === 0 &&
    !propietarios &&
    !foto.workflows?.length &&
    foto.insights.length === 0;

  return (
    <div className="w-full max-w-5xl space-y-7 px-6 py-8">
      <Alert variant="warning" title={ROTULO_DE_LA_VERSION_ANTERIOR}>
        Se muestra tal como quedó guardada{foto.capturadaEn ? `, con el portal leído el ${fechaLarga(foto.capturadaEn)}` : ""}. Se corrió antes de que la
        auditoría registrara qué lecturas fallaron, así que algún cero puede ser un error de lectura. Para ver el portal completo, la configuración y el
        análisis nuevo, vuelve a correrla: se crea una auditoría nueva y esta queda como está.
      </Alert>

      {nada && (
        <Tarjeta>
          <p className="text-sm text-fg-secondary">Esta auditoría no guardó datos que se puedan mostrar.</p>
        </Tarjeta>
      )}

      {totales && (
        <Bloque titulo="Totales del portal">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Cifra rotulo="Contactos" valor={totales.contactos} />
            <Cifra rotulo="Empresas" valor={totales.empresas} />
            <Cifra rotulo="Negocios" valor={totales.negocios} />
            <Cifra rotulo="Tickets" valor={totales.tickets} />
          </div>
        </Bloque>
      )}

      {(foto.contactosPorEtapa.length > 0 || foto.empresasPorEtapa.length > 0) && (
        <Bloque titulo="Embudo del ciclo de vida">
          <div className="grid gap-3 lg:grid-cols-2">
            {foto.contactosPorEtapa.length > 0 && (
              <Tarjeta className="space-y-3">
                <p className="text-sm font-semibold text-fg">Contactos por etapa</p>
                <Barras filas={foto.contactosPorEtapa} total={totales?.contactos ?? foto.contactosPorEtapa.reduce((s, f) => s + f.valor, 0)} />
              </Tarjeta>
            )}
            {foto.empresasPorEtapa.length > 0 && (
              <Tarjeta className="space-y-3">
                <p className="text-sm font-semibold text-fg">Empresas por etapa</p>
                <Barras filas={foto.empresasPorEtapa} total={totales?.empresas ?? foto.empresasPorEtapa.reduce((s, f) => s + f.valor, 0)} />
              </Tarjeta>
            )}
          </div>
        </Bloque>
      )}

      {propietarios && (
        <Bloque titulo="Propietarios de los contactos">
          <Tarjeta className="space-y-4">
            <p className="text-[13px] text-fg-secondary">
              {propietarios.asignados !== null && <>Con propietario: <span className="font-semibold tabular-nums text-fg">{cifra(propietarios.asignados)}</span></>}
              {propietarios.asignados !== null && propietarios.sinPropietario !== null && " · "}
              {propietarios.sinPropietario !== null && <>Sin propietario: <span className="font-semibold tabular-nums text-fg">{cifra(propietarios.sinPropietario)}</span></>}
            </p>
            {propietarios.porPropietario.length > 0 && (
              <Barras
                filas={propietarios.porPropietario.map((p) => ({ etiqueta: p.nombre, valor: p.contactos }))}
                total={propietarios.asignados ?? propietarios.porPropietario.reduce((s, p) => s + p.contactos, 0)}
              />
            )}
            {propietarios.meses.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-fg-muted">
                      <th className="py-1.5 pr-3 font-semibold">Mes</th>
                      <th className="py-1.5 pr-3 text-right font-semibold">Contactos creados</th>
                      <th className="py-1.5 pr-3 text-right font-semibold">Asignados a alguien</th>
                      <th className="py-1.5 text-right font-semibold">Cobertura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {propietarios.meses.map((m) => (
                      <tr key={m.etiqueta} className="border-t border-line">
                        <td className="py-1.5 pr-3 text-fg-secondary">{m.etiqueta}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-fg">{m.creados !== null ? cifra(m.creados) : "—"}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-fg">{m.asignados !== null ? cifra(m.asignados) : "—"}</td>
                        <td className="py-1.5 text-right text-xs text-fg-muted">
                          {m.creados !== null && m.asignados !== null ? porcentaje(m.asignados, m.creados) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tarjeta>
        </Bloque>
      )}

      {foto.workflows && foto.workflows.length > 0 && (
        <Bloque titulo="Workflows que tocaban el ciclo de vida">
          <Tarjeta>
            <ul className="space-y-1 text-[13px] text-fg">
              {foto.workflows.map((w, i) => (
                <li key={`${w}-${i}`}>{w}</li>
              ))}
            </ul>
          </Tarjeta>
        </Bloque>
      )}

      {foto.insights.length > 0 && (
        <Bloque titulo={foto.insightsGeneradosEn ? `Insights de la IA · ${fechaLarga(foto.insightsGeneradosEn)}` : "Insights de la IA"}>
          <div className="space-y-3">
            {foto.insights.map((ins, i) => (
              <Tarjeta key={i} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <ChipDeEstado tono={TONO[ins.severidad]}>{ETIQUETA_DE_SEVERIDAD_ANTERIOR[ins.severidad]}</ChipDeEstado>
                  {ins.seccion && <span className="text-xs text-fg-muted">{ins.seccion}</span>}
                </div>
                {ins.titulo && <p className="text-sm font-semibold text-fg">{ins.titulo}</p>}
                {ins.comentario && <p className="text-[13px] leading-relaxed text-fg-secondary">{ins.comentario}</p>}
                {ins.recomendaciones.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-[13px] text-fg-secondary">
                    {ins.recomendaciones.map((r, k) => (
                      <li key={k}>{r}</li>
                    ))}
                  </ul>
                )}
              </Tarjeta>
            ))}
          </div>
        </Bloque>
      )}
    </div>
  );
}
