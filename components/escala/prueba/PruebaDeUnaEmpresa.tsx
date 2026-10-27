"use client";

/**
 * components/escala/prueba/PruebaDeUnaEmpresa.tsx — Escala › Probar, con una empresa elegida (N2, 2026-10-26).
 *
 * Qué nivel le da la escala a la empresa en cada área (Ventas, Marketing y Servicio), con qué versión (la publicada,
 * por defecto, o el borrador) y de qué exploración salen los niveles; y, por área, dónde cree quien prueba (o el CSE de
 * la cuenta) que está. Cada «Guardar» deja una comparación. Wherex no se prueba nunca.
 * Datos: GET/POST /api/clients/[id]/escala/prueba (lib/escala/prueba/).
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, EmptyState, Field, Segmentado, Select, Textarea, useToast } from "@/components/ui";
import { SkeletonPanel, SkeletonText } from "@/components/ui/Skeleton";
import { BotonAzul, BotonEnlace, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { PUNTO_DE_NIVEL, nombreDe } from "@/components/escala/niveles";
import { cn } from "@/lib/cn";
import type { Letra } from "@/lib/escala/documento/tipos";
import { claveDeLaVersion, LETRAS_DE_LA_PRUEBA, POR_QUE_SE_EXCLUYE, type AreaDeLaPrueba, type FilaDePrueba } from "@/lib/escala/prueba/calculo";
import type { ConQueEscala, PruebaDeLaEmpresa } from "@/lib/escala/prueba/servidor";

type Datos = Exclude<PruebaDeLaEmpresa, { estado: "no-existe" }>;
type Ok = Extract<Datos, { estado: "ok" }>;
type Niveles = Ok["niveles"];

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** La fecha en la hora de Costa Rica (UTC-6), armada a mano: así servidor y navegador dicen lo mismo. */
function fecha(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 6 * 3_600_000);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function Nivel({ letra, niveles }: { letra: Letra | null; niveles: Niveles }) {
  if (!letra) return <span className="text-[13px] text-fg-muted">Sin nivel</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-fg">
      <span aria-hidden="true" className={cn("h-2.5 w-2.5 flex-shrink-0 rounded-full", PUNTO_DE_NIVEL[letra])} />
      {nombreDe(niveles, letra)}
    </span>
  );
}

function deQueSale(a: AreaDeLaPrueba): string {
  const partes = [`${a.conEvidencia} con evidencia`];
  if (a.hipotesis) partes.push(`${a.hipotesis} hipótesis`);
  if (a.faltan) partes.push(`${a.faltan} sin nivel`);
  const base = `${a.aplican} dimensiones: ${partes.join(", ")}`;
  return a.propuestas ? `${base}. ${a.propuestas === 1 ? "Una la propuso" : `${a.propuestas} las propuso`} el agente y nadie la confirmó todavía.` : `${base}.`;
}

export default function PruebaDeUnaEmpresa({ clientId, exploracionInicial }: { clientId: string; exploracionInicial: string | null }) {
  const toast = useToast();
  const [con, setCon] = useState<ConQueEscala>("publicada");
  const [exploracionId, setExploracionId] = useState<string | null>(exploracionInicial);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [eleccion, setEleccion] = useState<Record<string, { nivel: Letra | ""; quien: string; nota: string }>>({});

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const q = new URLSearchParams({ con });
      if (exploracionId) q.set("exploracion", exploracionId);
      const r = await fetch(`/api/clients/${clientId}/escala/prueba?${q}`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? "No se pudo cargar la prueba de la escala.");
      setDatos(j as Datos);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la prueba de la escala.");
    } finally {
      setCargando(false);
    }
  }, [clientId, con, exploracionId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const reintentar = (
    <BotonEnlace onClick={() => void cargar()} disabled={cargando}>
      Reintentar
    </BotonEnlace>
  );
  // Sin nada cargado, el error ocupa el lugar; con algo ya a la vista, va arriba y no lo borra.
  if (error && !datos)
    return (
      <Alert variant="danger" action={reintentar}>
        {error}
      </Alert>
    );
  if (!datos)
    return (
      <SkeletonPanel minH="min-h-[10rem]" bodyClassName="flex flex-col gap-2 p-4">
        <SkeletonText lines={3} />
      </SkeletonPanel>
    );
  if (datos.estado === "excluida") return <Alert variant="danger" title={datos.empresa.nombre}>{POR_QUE_SE_EXCLUYE}</Alert>;

  const d = datos;
  const quienPorDefecto = d.quienes[0]?.email ?? "";
  const de = (areaId: string) => eleccion[areaId] ?? { nivel: "" as const, quien: quienPorDefecto, nota: "" };
  const cambiar = (areaId: string, cambio: Partial<{ nivel: Letra | ""; quien: string; nota: string }>) =>
    setEleccion((e) => ({ ...e, [areaId]: { ...de(areaId), ...cambio } }));
  const nombreDeQuien = (email: string) => d.quienes.find((q) => q.email === email)?.nombre ?? email;
  const conQueSeMide = { esBorrador: d.con === "borrador", escalaVersion: d.version ?? "", revision: d.revision };
  const ultimaDe = (areaId: string): FilaDePrueba | null =>
    d.historial.find((f) => f.areaId === areaId && claveDeLaVersion(f) === claveDeLaVersion(conQueSeMide)) ?? null;

  async function guardar(a: AreaDeLaPrueba) {
    const e = de(a.id);
    if (!e.nivel || !d.fuente) return;
    setGuardando(a.id);
    try {
      const r = await fetch(`/api/clients/${clientId}/escala/prueba`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ con: d.con, exploracionId: d.fuente, areaId: a.id, nivelQueCree: e.nivel, creePorEmail: e.quien, nota: e.nota || null }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? "No se pudo guardar.");
      const fila = j.fila as FilaDePrueba;
      toast.success(fila.nivelDeLaEscala === fila.nivelQueCree ? `${a.nombre}: coinciden.` : `${a.nombre}: guardado, no coinciden.`);
      setEleccion((x) => ({ ...x, [a.id]: { nivel: "", quien: e.quien, nota: "" } }));
      await cargar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setGuardando(null);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="danger" action={reintentar}>
          {error}
        </Alert>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg">{d.empresa.nombre}</h2>
          <p className="text-xs text-fg-muted">
            {d.empresa.industria ?? "Sin industria en Nexus"}
            {d.edicion ? ` · se mide con la edición ${d.edicion}` : " · se mide con la escala general"}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {/* El borrador solo aparece para quien lo ve en Escala › Borrador (el servidor no se lo manda a los demás). */}
          {d.versiones.borrador || d.con === "borrador" ? (
            <Segmentado<ConQueEscala>
              etiqueta="Con qué versión de la escala"
              valor={d.con}
              deshabilitado={cargando}
              onCambio={(k) => setCon(k)}
              opciones={[
                { clave: "publicada", etiqueta: d.versiones.publicada ? `Publicada ${d.versiones.publicada}` : "Publicada", deshabilitada: !d.versiones.publicada },
                {
                  clave: "borrador",
                  etiqueta: d.versiones.borrador ? `Borrador ${d.versiones.borrador}` : "Borrador",
                  deshabilitada: !d.versiones.borrador,
                  title: d.versiones.borrador ? "Los mismos niveles de cada dimensión, juntados con las reglas del borrador." : "No hay un borrador de la escala abierto.",
                },
              ]}
            />
          ) : (
            d.versiones.publicada && <span className="text-xs text-fg-muted">Con la versión publicada {d.versiones.publicada}</span>
          )}
          {d.fuentes.length > 1 && (
            <Field label="De dónde salen los niveles" className="min-w-[240px]">
              <Select value={d.fuente ?? ""} disabled={cargando} onChange={(e) => setExploracionId(e.target.value || null)}>
                {d.fuentes.map((f) => (
                  <option key={f.exploracionId} value={f.exploracionId}>
                    {f.titulo} · {fecha(f.fecha)} · {f.areasConNivel === 0 ? "sin niveles" : `nivel en ${f.areasConNivel} ${f.areasConNivel === 1 ? "área" : "áreas"}`}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      </div>

      {d.con === "borrador" && (
        <Alert variant="info">
          Con el borrador, cada dimensión conserva el nivel de la exploración (se estimó con la escala publicada). Lo que cambia es cómo se juntan: qué
          dimensiones hay y aplican, las capas y el orden.
        </Alert>
      )}
      {d.sinTabla && <Alert variant="warning">Falta aplicar el SQL de la prueba en esta base: se puede mirar, no guardar.</Alert>}
      {!d.version ? (
        <Alert variant="warning">
          {d.con === "borrador" ? "Ya no hay un borrador de la escala abierto: elige «Publicada»." : "No hay una escala publicada con que probar."}
        </Alert>
      ) : !d.fuente ? (
        <EmptyState
          title="Esta empresa todavía no tiene niveles en la escala"
          description="Ubícala primero: en su ficha, La escala › «Actualizar escala» (el agente lee lo que Nexus sabe y propone niveles), o en su preventa."
          action={
            <Link href={`/clients/${clientId}?tab=__escala__`} className="text-sm font-medium text-brand hover:underline">
              Abrir La escala de la ficha
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          {d.areas.map((a) => {
            const e = de(a.id);
            const ultima = ultimaDe(a.id);
            return (
              <section key={a.id} aria-label={a.nombre} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
                <h3 className="text-sm font-semibold text-fg">{a.nombre}</h3>
                <div>
                  <p className={ROTULO_DEL_SISTEMA}>La escala dice</p>
                  <div className="mt-1">
                    {a.nivel ? (
                      <Nivel letra={a.nivel} niveles={d.niveles} />
                    ) : (
                      <span className="text-[13px] text-fg-muted">
                        Todavía nada: {a.faltan === 1 ? "falta una dimensión" : `faltan ${a.faltan} dimensiones`} por estimar.
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-fg-muted">{deQueSale(a)}</p>
                </div>
                {a.nivel && (
                  <>
                    <Field label="¿Dónde crees que está?">
                      <Select value={e.nivel} disabled={!!guardando} onChange={(x) => cambiar(a.id, { nivel: x.target.value as Letra | "" })}>
                        <option value="">Elige un nivel</option>
                        {LETRAS_DE_LA_PRUEBA.map((l) => (
                          <option key={l} value={l}>
                            {nombreDe(d.niveles, l)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    {d.quienes.length > 1 && (
                      <Field label="¿Quién lo dice?">
                        <Select value={e.quien} disabled={!!guardando} onChange={(x) => cambiar(a.id, { quien: x.target.value })}>
                          {d.quienes.map((q, i) => (
                            <option key={q.email} value={q.email}>
                              {i === 0 ? `Yo (${q.nombre})` : `${q.nombre}, CSE de la cuenta`}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    )}
                    <Field label="Por qué (opcional)">
                      <Textarea rows={2} maxLength={500} value={e.nota} disabled={!!guardando} onChange={(x) => cambiar(a.id, { nota: x.target.value })} />
                    </Field>
                    <div>
                      <BotonAzul disabled={!e.nivel || !!guardando || d.sinTabla} onClick={() => void guardar(a)}>
                        {guardando === a.id ? "Guardando…" : "Guardar la comparación"}
                      </BotonAzul>
                    </div>
                  </>
                )}
                {ultima && (
                  <p className="border-t border-line pt-2 text-xs text-fg-secondary">
                    <span className={ultima.nivelDeLaEscala === ultima.nivelQueCree ? "font-medium text-fg" : "font-medium text-warn-ink"}>
                      {ultima.nivelDeLaEscala === ultima.nivelQueCree ? "Coinciden" : "No coinciden"}
                    </span>{" "}
                    · la última, el {fecha(ultima.en)}: la escala {nombreDe(d.niveles, ultima.nivelDeLaEscala)}, {nombreDeQuien(ultima.creePorEmail)}{" "}
                    {nombreDe(d.niveles, ultima.nivelQueCree)}.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}

      {d.historial.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-fg">Lo ya probado con esta empresa</h3>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {d.historial.map((f) => (
              <li key={f.id} className="flex flex-wrap items-baseline justify-between gap-3 px-4 py-2.5 text-[13px]">
                <span className="text-fg-secondary">
                  <span className="tabular-nums text-fg">{fecha(f.en)}</span> · {f.areaNombre} · {f.esBorrador ? "borrador" : "versión"} {f.escalaVersion}
                  {f.esBorrador && f.revision !== null ? ` (revisión ${f.revision})` : ""}
                </span>
                <span className="flex flex-wrap items-center gap-3">
                  <span className="text-fg-muted">La escala</span>
                  <Nivel letra={f.nivelDeLaEscala} niveles={d.niveles} />
                  <span className="text-fg-muted">{nombreDeQuien(f.creePorEmail)}</span>
                  <Nivel letra={f.nivelQueCree} niveles={d.niveles} />
                  <span className={f.nivelDeLaEscala === f.nivelQueCree ? "text-fg" : "text-warn-ink"}>{f.nivelDeLaEscala === f.nivelQueCree ? "✓" : "≠"}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
