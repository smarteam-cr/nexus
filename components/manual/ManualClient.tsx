"use client";

/**
 * components/manual/ManualClient.tsx — la Documentación de Nexus, en cuatro pestañas.
 *
 * La pestaña activa vive en la URL (`?s=agentes`) y no en un `useState`: así un link a una
 * sección concreta se puede pegar en un chat, que es la mitad de para qué sirve una
 * documentación. Se usa `replace` y no `push` para no llenar el historial del navegador con
 * cada clic de pestaña.
 *
 * Contenido: lo narrativo viene de `lib/manual/contenido.ts` y lo demás está DERIVADO de los
 * registros del código (`lib/manual/armar.ts`) — ver el header de esos módulos.
 */
import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Card, Tabs, Badge } from "@/components/ui";
import type { BloqueNarrativo } from "@/lib/manual/contenido";
import {
  QUE_ES,
  QUE_TE_AHORRA,
  QUE_NO_HACE,
  EL_RECORRIDO,
  INTRO_DOCUMENTOS,
  INTRO_AGENTES,
  INTRO_HUBSPOT,
  HUBSPOT_ESCRIBE,
  HUBSPOT_NO_ESCRIBE,
} from "@/lib/manual/contenido";
import type {
  DocumentoDoc,
  CategoriaDeAgentes,
  PipelineDoc,
  GrupoDePropiedades,
} from "@/lib/manual/armar";

const SECCIONES = [
  { key: "como-funciona", label: "Cómo funciona" },
  { key: "documentos", label: "Documentos" },
  { key: "agentes", label: "Agentes" },
  { key: "hubspot", label: "HubSpot" },
] as const;

type SeccionKey = (typeof SECCIONES)[number]["key"];

function esSeccion(v: string | null): v is SeccionKey {
  return SECCIONES.some((s) => s.key === v);
}

// ── Piezas de presentación ─────────────────────────────────────────────────────

function Bloque({ b }: { b: BloqueNarrativo }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-semibold text-fg mb-2">{b.titulo}</h2>
      {b.parrafos.map((p, i) => (
        <p key={i} className="text-sm text-fg-secondary leading-relaxed mb-2 max-w-3xl">
          {p}
        </p>
      ))}
      {b.bullets && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {b.bullets.map((x) => (
            <Card key={x.titulo} className="p-4">
              <p className="text-sm font-medium text-fg">{x.titulo}</p>
              <p className="text-xs text-fg-muted leading-relaxed mt-1">{x.detalle}</p>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

/** Rótulo neutro y chico — para etiquetas derivadas, no para estados. */
function Pildora({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-line bg-surface-hover px-2 py-0.5 text-[11px] text-fg-secondary">
      {children}
    </span>
  );
}

// ── Pestañas ───────────────────────────────────────────────────────────────────

function ComoFunciona() {
  return (
    <div>
      <Bloque b={QUE_ES} />
      <Bloque b={QUE_TE_AHORRA} />
      <Bloque b={EL_RECORRIDO} />
      <Bloque b={QUE_NO_HACE} />
    </div>
  );
}

function Documentos({ docs }: { docs: DocumentoDoc[] }) {
  return (
    <div>
      <Bloque b={INTRO_DOCUMENTOS} />
      <div className="grid gap-4">
        {docs.map((d) => (
          <Card key={d.slug} className="p-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-sm font-semibold text-fg">{d.nombre}</h3>
              <span className="text-xs text-fg-muted">{d.deQuien}</span>
              {d.etapa && <Pildora>Etapa: {d.etapa}</Pildora>}
            </div>

            <p className="text-sm text-fg-secondary leading-relaxed mt-2 max-w-3xl">{d.paraQue}</p>
            <p className="text-xs text-fg-muted leading-relaxed mt-1 max-w-3xl">
              <span className="font-medium text-fg-secondary">Cuándo:</span> {d.cuando}
            </p>

            <div className="flex flex-wrap gap-1.5 mt-3">
              {d.etiquetas.map((e) => (
                <Pildora key={e}>{e}</Pildora>
              ))}
              {d.generadoPor && <Pildora>Botón: {d.generadoPor}</Pildora>}
            </div>

            {d.secciones.length > 0 && (
              <details className="mt-3 group">
                <summary className="text-xs text-fg-muted cursor-pointer hover:text-fg-secondary select-none">
                  Sus {d.secciones.length} secciones
                </summary>
                <ol className="mt-2 grid gap-1 sm:grid-cols-2 list-decimal list-inside">
                  {d.secciones.map((s, i) => (
                    <li key={`${s}-${i}`} className="text-xs text-fg-muted">
                      {s}
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function Agentes({ categorias }: { categorias: CategoriaDeAgentes[] }) {
  return (
    <div>
      <Bloque b={INTRO_AGENTES} />
      {categorias.map((c) => (
        <section key={c.key} className="mb-8">
          <h3 className="text-sm font-semibold text-fg">{c.label}</h3>
          <p className="text-xs text-fg-muted mt-0.5 mb-3 max-w-3xl">{c.description}</p>
          <div className="grid gap-3">
            {c.agentes.map((a) => (
              <Card key={a.id} className="p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="text-sm font-medium text-fg">{a.nombre}</p>
                  {!a.activo && <Badge variant="default">Inactivo</Badge>}
                </div>
                {a.descripcion && (
                  <p className="text-xs text-fg-secondary leading-relaxed mt-1 max-w-3xl">
                    {a.descripcion}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  <Pildora>Se dispara desde: {a.disparo}</Pildora>
                  {a.escribeEn && <Pildora>Escribe en: {a.escribeEn}</Pildora>}
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function HubSpot({
  pipelines,
  grupos,
  totalProps,
}: {
  pipelines: PipelineDoc[];
  grupos: GrupoDePropiedades[];
  totalProps: number;
}) {
  return (
    <div>
      <Bloque b={INTRO_HUBSPOT} />

      <section className="mb-8">
        <h2 className="text-base font-semibold text-fg mb-1">Los tipos de proyecto</h2>
        <p className="text-sm text-fg-secondary mb-3 max-w-3xl">
          Cada uno es un pipeline en HubSpot, con sus propias etapas. La etapa la mueve el equipo
          allá; Nexus la refleja.
        </p>
        <div className="grid gap-4">
          {pipelines.map((p) => (
            <Card key={p.label} className="p-5">
              <h3 className="text-sm font-semibold text-fg">{p.label}</h3>
              <p className="text-sm text-fg-secondary leading-relaxed mt-1 max-w-3xl">{p.help}</p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {p.etapas.map((e) => (
                  <Pildora key={e.label}>
                    {e.label}
                    {e.cierra && " ·  cierra"}
                  </Pildora>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <Bloque b={HUBSPOT_ESCRIBE} />
      <Bloque b={HUBSPOT_NO_ESCRIBE} />

      <section className="mb-8">
        <h2 className="text-base font-semibold text-fg mb-1">Qué lee de cada proyecto</h2>
        <p className="text-sm text-fg-secondary mb-3 max-w-3xl">
          Las {totalProps} propiedades que Nexus le pide al objeto Proyectos. Los nombres son los
          internos de HubSpot, para que se puedan buscar allá.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {grupos.map((g) => (
            <Card key={g.titulo} className="p-4">
              <p className="text-sm font-medium text-fg mb-2">{g.titulo}</p>
              <ul className="grid gap-1">
                {g.props.map((p) => (
                  <li key={p} className="text-xs text-fg-muted font-mono">
                    {p}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Contenedor ─────────────────────────────────────────────────────────────────

export default function ManualClient({
  documentos,
  agentes,
  pipelines,
  propiedades,
  totalPropiedades,
}: {
  documentos: DocumentoDoc[];
  agentes: CategoriaDeAgentes[];
  pipelines: PipelineDoc[];
  propiedades: GrupoDePropiedades[];
  totalPropiedades: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const crudo = params.get("s");
  const activa: SeccionKey = esSeccion(crudo) ? crudo : "como-funciona";

  const cambiar = useCallback(
    (key: SeccionKey) => {
      const q = new URLSearchParams(params.toString());
      if (key === "como-funciona") q.delete("s");
      else q.set("s", key);
      const qs = q.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return (
    <div>
      <Tabs
        items={SECCIONES}
        value={activa}
        onChange={cambiar}
        aria-label="Secciones de la documentación"
        className="mb-6"
      />
      {activa === "como-funciona" && <ComoFunciona />}
      {activa === "documentos" && <Documentos docs={documentos} />}
      {activa === "agentes" && <Agentes categorias={agentes} />}
      {activa === "hubspot" && (
        <HubSpot pipelines={pipelines} grupos={propiedades} totalProps={totalPropiedades} />
      )}
    </div>
  );
}
