"use client";

/**
 * components/clients/DocumentosDeLaEmpresa.tsx — los documentos de la EMPRESA, sin proyecto (R3 etapas 2 y 3,
 * 2026-10-27): la lista, si la empresa ya los ve, y armar el diagnóstico (esencial o completo). Para un prospecto, por
 * ejemplo: antes no había dónde, porque todo documento era de un proyecto o de una propuesta.
 *
 * UI interna: primitivas y tokens, tuteo.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Button, EmptyState, PageHeader, Segmentado } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";

export interface FilaDeDocumento {
  id: string;
  nombre: string;
  pieza: string | null;
  actualizado: string;
  compartidoDesde: string | null;
}

const PLANTILLAS = [
  { value: "diagnostico-esencial", label: "Esencial" },
  { value: "diagnostico-estrategico", label: "Completo" },
] as const;

export function DocumentosDeLaEmpresa({
  clientId,
  empresa,
  documentos,
  contenedor,
}: {
  clientId: string;
  empresa: string;
  documentos: FilaDeDocumento[];
  contenedor: string;
}) {
  const [plantilla, setPlantilla] = useState<(typeof PLANTILLAS)[number]["value"]>("diagnostico-esencial");
  const [creando, setCreando] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const tieneDiagnostico = documentos.some((d) => d.pieza === "diagnosis");

  const crear = async () => {
    setCreando(true);
    try {
      const r = await fetch(`/api/clients/${clientId}/documentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pieza: "diagnosis", plantilla }),
      });
      const j = (await r.json().catch(() => null)) as { canvasId?: string; error?: string } | null;
      if (!r.ok || !j?.canvasId) return toast.error(j?.error ?? "No se pudo crear. Vuelve a intentarlo.");
      router.push(`/clients/${clientId}/documentos/${j.canvasId}`);
    } catch {
      toast.error("Error de conexión.");
    } finally {
      setCreando(false);
    }
  };

  return (
    <div className={cn(contenedor, "space-y-6")}>
      <PageHeader
        title="Documentos de la empresa"
        backHref={`/clients/${clientId}`}
        backLabel={empresa}
        description="Los documentos que son de la empresa y no de un proyecto: un diagnóstico para un prospecto, por ejemplo. Se escriben a mano y se comparten con un enlace."
      />

      {!tieneDiagnostico && (
        <section className="space-y-3 rounded-lg border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-fg">Armar el diagnóstico de {empresa}</h2>
          <p className="text-xs text-fg-muted">
            El esencial explica por qué tiene los resultados que tiene y qué haríamos; el completo suma cómo opera, las
            herramientas, los equipos y el alcance. Después puedes ocultar o mover cualquier parte.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Segmentado
              opciones={PLANTILLAS.map((p) => ({ clave: p.value, etiqueta: p.label }))}
              valor={plantilla}
              onCambio={setPlantilla}
              etiqueta="Plantilla del diagnóstico"
            />
            <Button variant="primary" size="sm" loading={creando} onClick={() => void crear()}>
              Armar el diagnóstico
            </Button>
          </div>
        </section>
      )}

      {!documentos.length ? (
        <EmptyState title="Todavía no hay documentos de la empresa" description="Los documentos de sus proyectos y propuestas siguen en la ficha." />
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {documentos.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Link href={`/clients/${clientId}/documentos/${d.id}`} className="text-sm font-medium text-brand hover:underline">
                {d.nombre}
              </Link>
              <span className="text-xs text-fg-muted">
                Editado el {new Date(d.actualizado).toLocaleDateString("es-CR", { day: "numeric", month: "long", timeZone: "America/Costa_Rica" })}
              </span>
              <span className="ml-auto text-xs text-fg-secondary">
                {d.compartidoDesde
                  ? `La empresa lo ve desde el ${new Date(d.compartidoDesde).toLocaleDateString("es-CR", { day: "numeric", month: "long", timeZone: "America/Costa_Rica" })}`
                  : "Solo lo ve el equipo"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
