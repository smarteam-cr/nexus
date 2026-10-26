"use client";

/**
 * LeadsDelTest — el reporte de Marketing de los leads del test, por empresa (K10 etapa 3, 2026-10-27). Lo arma el
 * servidor (lib/exploraciones/llegadas-server.ts › reporteDeLeadsDelTest); acá solo se pinta.
 */
import { EmptyState, Table, type TableColumn } from "@/components/ui";
import { diaCorto } from "@/lib/exploraciones/fechas";
import { quienesPorArea } from "@/lib/exploraciones/llegadas";
import type { FilaDelReporte, ReporteDeLeadsDelTest } from "@/lib/exploraciones/llegadas-server";
import type { LlegadaSinEmpresa } from "@/lib/exploraciones/llegadas";
import { hubspotCompanyListUrl, hubspotCompanyUrl } from "@/lib/hubspot/urls";

function Cifra({ valor, que, ayuda }: { valor: number; que: string; ayuda?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3" title={ayuda}>
      <p className="text-2xl font-semibold tabular-nums text-fg">{valor.toLocaleString("es-CR")}</p>
      <p className="text-xs text-fg-muted">{que}</p>
    </div>
  );
}

const ESTADO_DE_LA_PREVENTA = (f: FilaDelReporte) => (f.ficha?.preventa ? (f.ficha.preventa.archivada ? "Sí (archivada)" : "Sí") : "No");

export default function LeadsDelTest({ reporte, nombresDeAreas, portalId }: { reporte: ReporteDeLeadsDelTest; nombresDeAreas: Record<string, string>; portalId: string | null }) {
  const nombreDelArea = (id: string) => nombresDeAreas[id] ?? "Un área";
  const t = reporte.totales;
  const columnas: TableColumn<FilaDelReporte>[] = [
    {
      key: "empresa",
      header: "Empresa",
      width: "w-56",
      sortValue: (f) => f.empresa.toLowerCase(),
      render: (f) => {
        const url = hubspotCompanyUrl(portalId, f.companyId);
        return url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-fg hover:text-brand hover:underline">
            {f.empresa}
          </a>
        ) : (
          <span className="font-medium text-fg">{f.empresa}</span>
        );
      },
    },
    { key: "areas", header: "Quién llenó cada área", render: (f) => <span className="text-fg-secondary">{quienesPorArea(f.porArea, nombreDelArea)}</span> },
    { key: "nAreas", header: "Áreas", width: "w-20", align: "right", sortValue: (f) => f.porArea.filter((a) => a.areaId).length, render: (f) => f.porArea.filter((a) => a.areaId).length },
    { key: "fecha", header: "Último intento", width: "w-32", sortValue: (f) => f.fecha, render: (f) => diaCorto(f.fecha), hideOnMobile: true },
    { key: "terminado", header: "Lo terminó", width: "w-28", sortValue: (f) => Number(f.terminado), render: (f) => (f.terminado ? "Sí" : "A medias") },
    { key: "preventa", header: "Pasó a preventa", width: "w-36", sortValue: (f) => ESTADO_DE_LA_PREVENTA(f), render: (f) => ESTADO_DE_LA_PREVENTA(f) },
  ];
  const crear = hubspotCompanyListUrl(portalId);
  const columnasSinEmpresa: TableColumn<LlegadaSinEmpresa>[] = [
    { key: "dominio", header: "Dominio del correo", width: "w-56", render: (g) => <span className="font-medium text-fg">{g.dominio ?? `${g.clave} (correo personal)`}</span> },
    { key: "quienes", header: "Quién lo llenó", render: (g) => <span className="text-fg-secondary">{quienesPorArea(g.porArea, nombreDelArea)}</span> },
    { key: "intentos", header: "Intentos", width: "w-24", align: "right", render: (g) => g.intentos },
    { key: "fecha", header: "Último", width: "w-28", render: (g) => diaCorto(new Date(g.ts).toISOString()), hideOnMobile: true },
    {
      key: "crear",
      header: "",
      width: "w-56",
      render: (g) =>
        g.dominio && crear ? (
          <a href={crear} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-brand hover:underline">
            Crear la empresa en HubSpot ↗
          </a>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cifra valor={t.empresas} que="empresas llegaron por el test" />
        <Cifra valor={t.terminaron} que="lo terminaron" />
        <Cifra valor={t.variasAreas} que="con dos o más áreas" ayuda="Más de una persona de la empresa llenó el test de un área distinta." />
        <Cifra valor={t.aPreventa} que="pasaron a preventa" ayuda="Tienen o tuvieron una preventa en Nexus." />
      </div>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-fg">Por empresa</h2>
        <Table
          variante="sistema"
          columns={columnas}
          rows={reporte.filas}
          rowKey={(f) => f.companyId}
          initialSort={{ key: "fecha", dir: "desc" }}
          search={{ placeholder: "Buscar una empresa o una persona", getText: (f) => `${f.empresa} ${f.porArea.map((a) => a.contacto ?? "").join(" ")}` }}
          empty={<EmptyState title="Nadie llegó por el test todavía" description="Cuando alguien haga el test con el correo de su empresa, aparece acá." />}
        />
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-fg">Sin empresa en HubSpot{reporte.sinEmpresa.length ? ` · ${reporte.sinEmpresa.length}` : ""}</h2>
        <p className="text-xs text-fg-muted">
          Hicieron el test y su contacto no tiene empresa en HubSpot. Con un correo de empresa, créala allá con ese dominio y pasa a la tabla de arriba.
        </p>
        <Table
          variante="sistema"
          columns={columnasSinEmpresa}
          rows={reporte.sinEmpresa}
          rowKey={(g) => g.clave}
          empty={<EmptyState title="Todos los intentos tienen empresa" description="No hay nadie que haya hecho el test sin empresa en HubSpot." />}
        />
      </section>
    </div>
  );
}
