/**
 * components/escala/prueba/ResumenDeLaPrueba.tsx — cómo va la prueba de la escala, para los super admin (N2,
 * 2026-10-26). Por versión de la escala: cuántas empresas se probaron, de qué industrias y en cuántas comparaciones
 * coinciden el nivel de la escala y el que cree el equipo, contra el criterio de la tarjeta (5 a 8 clientes de varias
 * industrias, 4 de cada 5). Solo presentación: los números salen de lib/escala/prueba/calculo.ts.
 */
import Link from "next/link";
import { Alert, EmptyState } from "@/components/ui";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import type { Letra } from "@/lib/escala/documento/tipos";
import { claveDeLaVersion, META_DE_LA_PRUEBA, type ResumenDeUnaVersion } from "@/lib/escala/prueba/calculo";
import type { ResumenDeLaPrueba as Resumen } from "@/lib/escala/prueba/servidor";

type Nombres = { nivel: (l: Letra) => string; persona: (email: string) => string };

function Meta({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-baseline gap-2 text-[13px]">
      <span aria-hidden="true" className={ok ? "text-fg" : "text-fg-muted"}>
        {ok ? "✓" : "○"}
      </span>
      <span className={ok ? "text-fg" : "text-fg-secondary"}>{children}</span>
    </li>
  );
}

function UnaVersion({ v, nombres }: { v: ResumenDeUnaVersion; nombres: Nombres }) {
  const pct = v.comparaciones ? Math.round((100 * v.coinciden) / v.comparaciones) : 0;
  return (
    <section aria-label={`Versión ${v.version}`} className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg">
          {v.esBorrador ? "Borrador" : "Versión publicada"} {v.version}
          {v.esBorrador && v.revision !== null ? ` (revisión ${v.revision})` : ""}
        </h3>
        <span className={v.cumple.todo ? "text-[13px] font-medium text-fg" : "text-[13px] text-fg-muted"}>
          {v.cumple.todo ? "Cumple el criterio para publicar" : "Todavía no cumple el criterio"}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className={ROTULO_DEL_SISTEMA}>Empresas probadas</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-fg">{v.empresas}</p>
        </div>
        <div>
          <p className={ROTULO_DEL_SISTEMA}>Industrias</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-fg">{v.industrias.length}</p>
        </div>
        <div>
          <p className={ROTULO_DEL_SISTEMA}>Coinciden</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-fg">
            {v.coinciden} de {v.comparaciones} <span className="text-sm font-normal text-fg-muted">({pct} %)</span>
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-1">
        <Meta ok={v.cumple.empresas}>Al menos {META_DE_LA_PRUEBA.empresas} empresas (van {v.empresas}).</Meta>
        <Meta ok={v.cumple.industrias}>
          De al menos {META_DE_LA_PRUEBA.industrias} industrias distintas (van {v.industrias.length}
          {v.sinIndustria ? `; ${v.sinIndustria} sin industria en Nexus no cuentan` : ""}).
        </Meta>
        <Meta ok={v.cumple.coincidencia}>
          Coinciden en al menos {META_DE_LA_PRUEBA.coincidencia.coinciden} de cada {META_DE_LA_PRUEBA.coincidencia.de} (van {v.coinciden} de {v.comparaciones}).
        </Meta>
      </ul>

      {v.coinciden < v.comparaciones && (
        <p className="text-[13px] text-fg-secondary">
          Donde no coinciden, la escala pone a la empresa más arriba de lo que cree el equipo en {v.escalaMasAlta} y más abajo en {v.escalaMasBaja}.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className={ROTULO_DEL_SISTEMA}>Por área</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-[13px] text-fg-secondary">
            {v.porArea.map((a) => (
              <li key={a.areaId}>
                <span className="text-fg">{a.areaNombre}</span>: coinciden {a.coinciden} de {a.comparaciones}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className={ROTULO_DEL_SISTEMA}>Por industria</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-[13px] text-fg-secondary">
            {v.industrias.map((i) => (
              <li key={i.nombre}>
                <span className="text-fg">{i.nombre}</span>: {i.empresas} {i.empresas === 1 ? "empresa" : "empresas"}
              </li>
            ))}
            {v.sinIndustria > 0 && <li className="text-fg-muted">Sin industria: {v.sinIndustria}</li>}
          </ul>
        </div>
      </div>

      <div>
        <p className={ROTULO_DEL_SISTEMA}>Cada comparación (la última de cada empresa y área)</p>
        <ul className="mt-1 divide-y divide-line rounded-lg border border-line">
          {v.filas.map((f) => (
            <li key={f.id} className="flex flex-wrap items-baseline justify-between gap-3 px-3 py-2 text-[13px]">
              <span className="min-w-0">
                <Link href={`/escala/probar?cliente=${f.clientId}`} className="font-medium text-fg hover:underline">
                  {f.empresa}
                </Link>
                <span className="text-fg-muted"> · {f.areaNombre}{f.industria ? ` · ${f.industria}` : ""}</span>
              </span>
              <span className="flex flex-wrap items-baseline gap-2 text-fg-secondary">
                La escala {nombres.nivel(f.nivelDeLaEscala)}, {nombres.persona(f.creePorEmail)} {nombres.nivel(f.nivelQueCree)}
                <span className={f.nivelDeLaEscala === f.nivelQueCree ? "text-fg" : "text-warn-ink"}>{f.nivelDeLaEscala === f.nivelQueCree ? "✓" : "≠"}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function ResumenDeLaPrueba({ resumen }: { resumen: Resumen }) {
  if (resumen.estado === "sin-tabla") return <Alert variant="warning">Falta aplicar el SQL de la prueba en esta base: todavía no hay nada guardado.</Alert>;
  if (!resumen.versiones.length)
    return <EmptyState title="Todavía nadie probó la escala" description="Cuando el equipo guarde la primera comparación, aquí se ve cuántas empresas van, de qué industrias y en cuántas coinciden." />;
  const { niveles, nombres: equipo } = resumen;
  const nombres: Nombres = {
    nivel: (l) => niveles.find((n) => n.letra === l)?.nombre ?? l,
    persona: (email) => equipo[email.toLowerCase()] ?? email,
  };
  return (
    <div className="space-y-4">
      {resumen.versiones.map((v) => (
        <UnaVersion key={claveDeLaVersion({ esBorrador: v.esBorrador, escalaVersion: v.version, revision: v.revision })} v={v} nombres={nombres} />
      ))}
    </div>
  );
}
