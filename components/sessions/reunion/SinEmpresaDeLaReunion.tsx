"use client";

/**
 * SinEmpresaDeLaReunion — una reunión sin empresa lo dice en la reunión misma y deja decidirla ahí (T3, 2026-10-25):
 * la propuesta de Nexus, con por qué, y la lista para elegir otra (components/sessions/ElegirEmpresa.tsx). La decide
 * quien la organizó o estuvo; los demás ven quién la decide. Reemplaza el aviso «No tiene cliente» de la lista de avisos.
 */
import { ElegirEmpresa, ProveedorDeEmpresas, type EmpresaParaElegir, type PropuestaParaElegir } from "@/components/sessions/ElegirEmpresa";

export function SinEmpresaDeLaReunion({
  sessionId,
  titulo,
  propuesta,
  porque,
  empresas,
  puedeDecidir,
}: {
  sessionId: string;
  titulo: string;
  propuesta: PropuestaParaElegir | null;
  porque: string | null;
  empresas: readonly EmpresaParaElegir[];
  puedeDecidir: boolean;
}) {
  return (
    <section aria-label="Sin empresa" className="space-y-3 rounded-2xl border border-warn-line bg-warn-surface p-5">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-warn-ink">Esta reunión no tiene empresa</h2>
        <p className="text-[13px] leading-[19px] text-fg">
          Hasta que alguien decida de quién es, lo que se habló no entra al contexto de ninguna empresa y Nexus no la lee.
          {puedeDecidir ? "" : " La decide quien la organizó o estuvo en ella."}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold text-fg-secondary">Empresa</span>
        <ProveedorDeEmpresas empresas={empresas}>
          <ElegirEmpresa sessionId={sessionId} titulo={titulo} propuesta={propuesta} puedeDecidir={puedeDecidir} />
        </ProveedorDeEmpresas>
      </div>
      {porque && <p className="text-xs text-fg-muted">Lo propone Nexus: {porque}</p>}
    </section>
  );
}
