"use client";

/**
 * PositionStatementDelProspecto — el position statement de Smarteam armado para este prospecto (K3 y pregunta 12 del
 * roadmap, 2026-10-28). Solo la preventa.
 *
 * Lo arma la preparación desde la base (Marketing › Audiencia) y lo valida contra ella
 * (lib/exploraciones/posicionamiento.ts): la frase tal cual, dos o tres hechos de la empresa con su fuente y el frente
 * que calza, condición por condición. Si calza a medias, lo dice y nombra lo que falta confirmar. Material de
 * preparación: se lee, no se «usa».
 */
import { Alert, Badge } from "@/components/ui";
import {
  condicionesPendientes,
  NOMBRE_DEL_ESTADO,
  type EstadoDeLaCondicion,
  type HechoCitado,
  type PosicionamientoDelProspecto,
} from "@/lib/exploraciones/posicionamiento";
import { useLienzo } from "./contexto";

const VARIANTE: Readonly<Record<EstadoDeLaCondicion, "success" | "warning" | "destructive" | "default">> = {
  cumple: "success",
  a_medias: "warning",
  no_cumple: "destructive",
  sin_dato: "default",
};

function Fuente({ h }: { h: HechoCitado }) {
  const texto = `${h.fuente}${h.fecha ? ` · ${h.fecha}` : ""}`;
  return h.url ? (
    <a href={h.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
      {texto}
    </a>
  ) : (
    <span>{texto}</span>
  );
}

/** El bloque de Preparación › Conexión. Null en un proyecto o mientras la preparación no lo armó. */
export function PositionStatementDelProspecto() {
  const { exp, posicionamientoAnterior } = useLienzo();
  const ps = exp.estado.propuesta.posicionamiento;
  if (!ps || exp.projectId) return null;
  return <Contenido ps={ps} empresa={exp.empresa.nombre} anterior={posicionamientoAnterior !== null && posicionamientoAnterior === ps.corridaId} />;
}

function Contenido({ ps, empresa, anterior }: { ps: PosicionamientoDelProspecto; empresa: string; anterior: boolean }) {
  const f = ps.frente;
  const { faltan, noSeCumplen } = f ? condicionesPendientes(f) : { faltan: [], noSeCumplen: [] };
  return (
    <section aria-label={`Position statement para ${empresa}`} className="space-y-4 rounded-xl border border-line bg-surface p-5">
      <div>
        <h3 className="text-sm font-semibold text-fg">Position statement para {empresa}</h3>
        <p className="text-xs text-fg-muted">Lo arma Nexus desde el de Smarteam (Marketing › Audiencia) y lo valida contra él: no promete nada que no diga.</p>
      </div>
      {anterior && (
        <Alert variant="warning" title="Se armó con un position statement anterior">
          El de Smarteam cambió en Marketing › Audiencia después de preparar esta sesión, así que esto ya no está validado
          contra el de hoy y la guía no lo usa. Vuelve a preparar para actualizarlo.
        </Alert>
      )}
      <blockquote className="border-l-4 border-l-brand pl-3 text-[13px] italic leading-[20px] text-fg">«{ps.frase}»</blockquote>

      {ps.hechos.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-fg-muted">Lo que sabemos de {empresa}</p>
          <ul className="space-y-1.5">
            {ps.hechos.map((h, i) => (
              <li key={i} className="text-[13px] leading-[19px] text-fg">
                {h.texto}{" "}
                <span className="text-xs text-fg-muted">
                  · <Fuente h={h} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {f ? (
        <div className="space-y-3 rounded-lg border border-line bg-surface-muted p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-fg-muted">Por dónde entrar</p>
            <span className="text-sm font-semibold text-fg">{f.nombre}</span>
            <Badge size="xs" variant={f.calce === "calza" ? "success" : "warning"}>
              {f.calce === "calza" ? "Calza" : "Calza a medias"}
            </Badge>
          </div>
          <p className="text-[13px] leading-[19px] text-fg-secondary">{f.promesa}</p>
          <p className="text-[13px] leading-[19px] text-fg">{f.razon}</p>
          {noSeCumplen.length > 0 && (
            <p className="text-[13px] leading-[19px] text-fg">
              <span className="font-medium">Ya se sabe que no se cumple (no lo prometas):</span> {noSeCumplen.map((c) => c.texto.toLowerCase()).join("; ")}.
            </p>
          )}
          {faltan.length > 0 && (
            <p className="text-[13px] leading-[19px] text-fg">
              <span className="font-medium">Falta confirmar en la sesión:</span> {faltan.map((c) => c.texto.toLowerCase()).join("; ")}.
            </p>
          )}
          {f.logros.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-fg-muted">Qué le lograría</p>
              <ul className="space-y-1 text-[13px] leading-[19px] text-fg">
                {f.logros.map((l, i) => (
                  <li key={i}>
                    <span className="font-semibold">{l.titulo}</span>
                    {l.detalle ? `: ${l.detalle}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="space-y-1.5">
            <p className="text-xs text-fg-muted">Cuándo cabe, condición por condición</p>
            <ul className="space-y-1.5">
              {f.condiciones.map((c, i) => (
                <li key={i} className="text-[13px] leading-[19px] text-fg">
                  <Badge size="xs" variant={VARIANTE[c.estado]} className="mr-1.5">
                    {NOMBRE_DEL_ESTADO[c.estado]}
                  </Badge>
                  {c.texto}
                  {c.razon ? <span className="text-fg-secondary"> — {c.razon}</span> : null}
                  {c.hechos.length > 0 && (
                    <span className="text-xs text-fg-muted">
                      {" "}
                      ·{" "}
                      {c.hechos.map((h, k) => (
                        <span key={k}>
                          {k > 0 ? ", " : ""}
                          <Fuente h={h} />
                        </span>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {f.nota && <p className="text-xs italic text-fg-muted">{f.nota}</p>}
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-line bg-surface-muted px-3.5 py-2.5 text-[13px] text-fg-secondary">
          {ps.sinFrente ?? "Ningún frente calza con lo que se sabe de la empresa."}
        </p>
      )}
    </section>
  );
}
