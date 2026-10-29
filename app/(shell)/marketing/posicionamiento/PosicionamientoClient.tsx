"use client";

/**
 * Audiencia › Position statement (/marketing/posicionamiento) — K3 y pregunta 12 del roadmap (2026-10-28).
 *
 * El position statement de Smarteam lo escribe Elías: la frase («Smarteam en una frase») y los frentes, cada uno con
 * «qué logra» y «cuándo cabe». Se ve y se edita acá (quien tiene `marketing.write`); la preventa lo personaliza para cada
 * prospecto con dos o tres hechos de la empresa y lo valida contra esto: no promete lo que no está acá ni propone un
 * frente cuyas condiciones el prospecto no cumple (lib/exploraciones/posicionamiento.ts). Un frente sin su detalle se
 * ve como pendiente.
 */
import { useCallback, useEffect, useState } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { Alert, Button, Field, Input, PageHeader, SkeletonPanel, SkeletonText, Textarea } from "@/components/ui";
import { BotonTexto } from "@/components/ui/sistema";
import AudienciaTabs from "@/components/marketing/AudienciaTabs";
import { ChipAtencion, Rotulo } from "@/components/marketing/piezas";
import { frentePendiente, nombreCompleto, type FrenteDelPosicionamiento } from "@/lib/smarteam/posicionamiento";

interface Respuesta {
  empresa: { id: string; nombre: string } | null;
  frase: string | null;
  frentes: FrenteDelPosicionamiento[];
}

/** El frente mientras se edita: todo texto, sin nulos. */
interface FrenteEnEdicion {
  nombre: string;
  herramienta: string;
  promesa: string;
  titulo: string;
  queLogra: { titulo: string; detalle: string }[];
  cuandoCabe: string[];
  nota: string;
}

const aEdicion = (f: FrenteDelPosicionamiento): FrenteEnEdicion => ({
  nombre: f.nombre,
  herramienta: f.herramienta ?? "",
  promesa: f.promesa,
  titulo: f.titulo ?? "",
  queLogra: f.queLogra.map((l) => ({
    titulo: l.titulo,
    detalle: l.detalle ?? "",
  })),
  cuandoCabe: [...f.cuandoCabe],
  nota: f.nota ?? "",
});

const FRENTE_NUEVO: FrenteEnEdicion = {
  nombre: "",
  herramienta: "",
  promesa: "",
  titulo: "",
  queLogra: [],
  cuandoCabe: [],
  nota: "",
};

export default function PosicionamientoClient({ canEdit, conteos }: { canEdit: boolean; conteos: { icp: number; personas: number } }) {
  const toast = useToast();
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<{
    frase: string;
    frentes: FrenteEnEdicion[];
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDatos(await fetchJson<Respuesta>("/api/marketing/posicionamiento"));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar el position statement.");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const guardar = async () => {
    if (!borrador || busy) return;
    setBusy(true);
    try {
      const d = await fetchJson<Respuesta>("/api/marketing/posicionamiento", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frase: borrador.frase,
          frentes: borrador.frentes.map((f) => ({
            nombre: f.nombre,
            herramienta: f.herramienta,
            promesa: f.promesa,
            titulo: f.titulo,
            queLogra: f.queLogra.filter((l) => l.titulo.trim()).map((l) => ({ titulo: l.titulo, detalle: l.detalle })),
            cuandoCabe: f.cuandoCabe.filter((c) => c.trim()),
            nota: f.nota,
          })),
        }),
      });
      setDatos(d);
      setBorrador(null);
      toast.success("Position statement guardado. La próxima preparación de una preventa ya lo usa.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const cambiarFrente = (i: number, x: Partial<FrenteEnEdicion>) =>
    setBorrador((b) =>
      b
        ? {
            ...b,
            frentes: b.frentes.map((f, j) => (j === i ? { ...f, ...x } : f)),
          }
        : b,
    );

  return (
    <>
      <PageHeader
        title="Audiencia"
        description={`Qué hacemos por las empresas y en qué frente cabe cada una. La preventa lo personaliza para cada prospecto y no promete nada que no esté acá.${canEdit ? "" : " Tu rol puede verlo pero no editarlo."}`}
      />
      <div className="space-y-6">
        <AudienciaTabs icp={conteos.icp} personas={conteos.personas} />
        {error ? (
          <Alert variant="danger">{error}</Alert>
        ) : !datos ? (
          <SkeletonPanel minH="min-h-[320px]" bodyClassName="p-5 space-y-4">
            <SkeletonText lines={3} />
            <SkeletonText lines={4} />
          </SkeletonPanel>
        ) : !datos.empresa ? (
          <Alert variant="warning">
            Nexus no sabe cuál es la empresa que lo usa: falta su perfil en la ficha de Smarteam. Sin eso no hay dónde guardar el position statement.
          </Alert>
        ) : borrador ? (
          <Editor
            borrador={borrador}
            setBorrador={setBorrador}
            cambiarFrente={cambiarFrente}
            busy={busy}
            onGuardar={guardar}
            onDescartar={() => setBorrador(null)}
          />
        ) : (
          <Vista
            datos={datos}
            canEdit={canEdit}
            onEditar={() =>
              setBorrador({
                frase: datos.frase ?? "",
                frentes: datos.frentes.map(aEdicion),
              })
            }
          />
        )}
      </div>
    </>
  );
}

function Vista({ datos, canEdit, onEditar }: { datos: Respuesta; canEdit: boolean; onEditar: () => void }) {
  const vacio = !datos.frase && datos.frentes.length === 0;
  return (
    <div className="space-y-6">
      <section aria-label="Smarteam en una frase" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Rotulo azul>{datos.empresa?.nombre ?? "Smarteam"} en una frase</Rotulo>
          <span className="flex-1" />
          {canEdit && (
            <Button variant="secondary" size="sm" onClick={onEditar}>
              {vacio ? "Escribirlo" : "Editar"}
            </Button>
          )}
        </div>
        <h2 className="text-sm font-semibold text-fg">Qué hacemos por las empresas</h2>
        {datos.frase ? (
          <blockquote className="rounded-xl border border-line border-l-4 border-l-brand bg-surface-muted px-5 py-4 text-[15px] italic leading-[24px] text-fg">
            «{datos.frase}»
          </blockquote>
        ) : (
          <p className="text-sm text-fg-muted">Todavía no está escrita. Mientras falte, la preventa presenta a Smarteam con su propuesta de valor.</p>
        )}
        {datos.frentes.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {datos.frentes.map((f) => (
              <a
                key={f.clave}
                href={`#frente-${f.clave}`}
                className="rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:bg-surface-hover"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">{nombreCompleto(f)}</p>
                <p className="mt-1 text-sm leading-[20px] text-fg-secondary">{f.promesa}</p>
              </a>
            ))}
          </div>
        )}
      </section>

      {datos.frentes.map((f) => (
        <section key={f.clave} id={`frente-${f.clave}`} aria-label={nombreCompleto(f)} className="space-y-3 border-t border-line pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <Rotulo>{f.nombre}</Rotulo>
            {frentePendiente(f) && <ChipAtencion>Pendiente: falta {pendienteDe(f)}</ChipAtencion>}
          </div>
          <h2 className="text-sm font-semibold text-fg">{f.titulo ?? nombreCompleto(f)}</h2>
          {frentePendiente(f) && (
            <p className="text-xs text-fg-muted">Mientras falte, la preventa no propone este frente: no tiene contra qué validar si el prospecto calza.</p>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs text-fg-muted">Qué logra</p>
              {f.queLogra.length ? (
                <ul className="space-y-2">
                  {f.queLogra.map((l, i) => (
                    <li key={i} className="rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm leading-[20px] text-fg">
                      <span className="font-semibold">{l.titulo}</span>
                      {l.detalle ? `: ${l.detalle}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-fg-muted">Sin escribir.</p>
              )}
            </div>
            <div className="space-y-2 rounded-xl border border-line bg-surface-muted p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand">Cuándo cabe</p>
              {f.cuandoCabe.length ? (
                <ul className="space-y-1.5 text-sm leading-[20px] text-fg">
                  {f.cuandoCabe.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-fg-muted">Sin escribir.</p>
              )}
              {f.nota && <p className="text-sm italic text-fg-secondary">{f.nota}</p>}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

function pendienteDe(f: FrenteDelPosicionamiento): string {
  if (!f.queLogra.length && !f.cuandoCabe.length) return "qué logra y cuándo cabe";
  return f.queLogra.length ? "cuándo cabe" : "qué logra";
}

function Editor({
  borrador,
  setBorrador,
  cambiarFrente,
  busy,
  onGuardar,
  onDescartar,
}: {
  borrador: { frase: string; frentes: FrenteEnEdicion[] };
  setBorrador: (fn: (b: { frase: string; frentes: FrenteEnEdicion[] } | null) => { frase: string; frentes: FrenteEnEdicion[] } | null) => void;
  cambiarFrente: (i: number, x: Partial<FrenteEnEdicion>) => void;
  busy: boolean;
  onGuardar: () => void;
  onDescartar: () => void;
}) {
  return (
    <div className="space-y-6">
      <Field label="Smarteam en una frase" hint="Qué hacemos por las empresas. La preventa la usa palabra por palabra.">
        <Textarea rows={4} value={borrador.frase} onChange={(e) => setBorrador((b) => (b ? { ...b, frase: e.target.value } : b))} />
      </Field>

      {borrador.frentes.map((f, i) => (
        <section key={i} aria-label={`Frente ${i + 1}`} className="space-y-4 rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center gap-2">
            <Rotulo>Frente {i + 1}</Rotulo>
            <span className="flex-1" />
            <BotonTexto onClick={() => setBorrador((b) => (b ? { ...b, frentes: b.frentes.filter((_, j) => j !== i) } : b))}>Quitar el frente</BotonTexto>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" hint="Estructura, Activación, Acompañamiento…">
              <Input value={f.nombre} onChange={(e) => cambiarFrente(i, { nombre: e.target.value })} />
            </Field>
            <Field label="Herramienta" hint="Opcional: HubSpot, Insider One…">
              <Input value={f.herramienta} onChange={(e) => cambiarFrente(i, { herramienta: e.target.value })} />
            </Field>
          </div>
          <Field label="La promesa, en una línea">
            <Input value={f.promesa} onChange={(e) => cambiarFrente(i, { promesa: e.target.value })} />
          </Field>
          <Field label="Título del detalle" hint="Opcional, p. ej. «HubSpot: ordenar la relación con cada cliente».">
            <Input value={f.titulo} onChange={(e) => cambiarFrente(i, { titulo: e.target.value })} />
          </Field>

          <div className="space-y-2">
            <p className="text-xs text-fg-muted">Qué logra</p>
            {f.queLogra.map((l, k) => (
              <div key={k} className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label={`Qué logra ${k + 1}: título`}
                  className="min-w-[180px] flex-[1_1_180px]"
                  value={l.titulo}
                  placeholder="Un solo lugar por cliente"
                  onChange={(e) =>
                    cambiarFrente(i, {
                      queLogra: f.queLogra.map((x, j) => (j === k ? { ...x, titulo: e.target.value } : x)),
                    })
                  }
                />
                <Input
                  aria-label={`Qué logra ${k + 1}: detalle`}
                  className="min-w-[220px] flex-[2_1_220px]"
                  value={l.detalle}
                  placeholder="toda su historia, visible para el equipo"
                  onChange={(e) =>
                    cambiarFrente(i, {
                      queLogra: f.queLogra.map((x, j) => (j === k ? { ...x, detalle: e.target.value } : x)),
                    })
                  }
                />
                <BotonTexto
                  onClick={() =>
                    cambiarFrente(i, {
                      queLogra: f.queLogra.filter((_, j) => j !== k),
                    })
                  }
                >
                  Quitar
                </BotonTexto>
              </div>
            ))}
            <BotonTexto
              onClick={() =>
                cambiarFrente(i, {
                  queLogra: [...f.queLogra, { titulo: "", detalle: "" }],
                })
              }
            >
              + Agregar qué logra
            </BotonTexto>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-fg-muted">Cuándo cabe (una condición por línea: la preventa revisa cada una)</p>
            {f.cuandoCabe.map((c, k) => (
              <div key={k} className="flex items-center gap-2">
                <Input
                  aria-label={`Cuándo cabe ${k + 1}`}
                  className="flex-1"
                  value={c}
                  onChange={(e) =>
                    cambiarFrente(i, {
                      cuandoCabe: f.cuandoCabe.map((x, j) => (j === k ? e.target.value : x)),
                    })
                  }
                />
                <BotonTexto
                  onClick={() =>
                    cambiarFrente(i, {
                      cuandoCabe: f.cuandoCabe.filter((_, j) => j !== k),
                    })
                  }
                >
                  Quitar
                </BotonTexto>
              </div>
            ))}
            <BotonTexto onClick={() => cambiarFrente(i, { cuandoCabe: [...f.cuandoCabe, ""] })}>+ Agregar condición</BotonTexto>
          </div>

          <Field label="Nota" hint="Opcional: un ejemplo o una advertencia («Sin volumen, la IA no tiene de qué aprender»).">
            <Input value={f.nota} onChange={(e) => cambiarFrente(i, { nota: e.target.value })} />
          </Field>
        </section>
      ))}

      <div className="flex flex-wrap items-center gap-2.5">
        <BotonTexto onClick={() => setBorrador((b) => (b ? { ...b, frentes: [...b.frentes, { ...FRENTE_NUEVO }] } : b))}>+ Agregar un frente</BotonTexto>
        <span className="flex-1" />
        <BotonTexto onClick={onDescartar}>Descartar los cambios</BotonTexto>
        <Button variant="primary" onClick={onGuardar} disabled={busy}>
          {busy ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </div>
  );
}
