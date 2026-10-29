"use client";

/**
 * components/clients/PerfilDeLaEmpresaQueUsaNexus.tsx — el perfil de Smarteam, en su ficha (R13, 2026-10-25).
 *
 * Lo que Nexus sabe de NOSOTROS, en un lugar: la propuesta de valor, el position statement, el tono, los servicios con
 * su tarifa y los clientes de referencia por industria; y, para mirar, el cliente ideal y las buyer personas, que se
 * editan donde ya se editaban (Marketing › Audiencia) y cuelgan de esta misma ficha. Lo leen los agentes por
 * lib/smarteam/contexto.ts. Solo aparece en la ficha de la empresa que usa Nexus (la ruta lo dice); edita quien tiene
 * `marketing.write`. El position statement (la frase y sus frentes) se edita desde el 2026-10-28 en Marketing › Audiencia:
 * acá solo se ve.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Field, Input, Select, SkeletonPanel, SkeletonText, Textarea } from "@/components/ui";
import { BotonAzul, BotonBlanco, BotonTexto, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import type { ClienteDeReferencia, ContextoDeLaEmpresaQueUsaNexus, PerfilDeLaEmpresa, ServicioDelPerfil } from "@/lib/smarteam/perfil";
import { INDUSTRIAS_DE_SMARTEAM } from "@/lib/clients/datos-de-la-empresa";

interface Respuesta {
  esLaEmpresaQueUsaNexus: boolean;
  empresa?: { id: string; nombre: string };
  perfil?: PerfilDeLaEmpresa;
  tonoDeMarketing?: string | null;
  clienteIdeal?: ContextoDeLaEmpresaQueUsaNexus["clienteIdeal"];
  buyerPersonas?: { nombre: string; cargo: string | null }[];
  clientes?: { id: string; nombre: string; industria: string | null }[];
  puedeEditar?: boolean;
}

const vacioANull = (s: string) => (s.trim() ? s : null);

export default function PerfilDeLaEmpresaQueUsaNexus({ clientId }: { clientId: string }) {
  const [r, setR] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState<PerfilDeLaEmpresa | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; tono: "info" | "danger" } | null>(null);

  const cargar = async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/perfil`, { cache: "no-store" });
      const j = (await res.json().catch(() => null)) as (Respuesta & { error?: string }) | null;
      if (!res.ok || !j) {
        setError(j?.error ?? "No se pudo cargar el perfil.");
        return;
      }
      setR(j);
    } catch {
      setError("No se pudo conectar con Nexus.");
    }
  };

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se carga una vez por empresa
  }, [clientId]);

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!r)
    return (
      <SkeletonPanel minH="min-h-[160px]">
        <SkeletonText lines={4} />
      </SkeletonPanel>
    );
  if (!r.esLaEmpresaQueUsaNexus || !r.perfil || !r.empresa) return null;

  const p = editando && borrador ? borrador : r.perfil;
  const cambiar = (x: Partial<PerfilDeLaEmpresa>) => setBorrador((b) => ({ ...(b ?? r.perfil!), ...x }));

  const guardar = async () => {
    if (!borrador) return;
    setGuardando(true);
    setAviso(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/perfil`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propuestaDeValor: borrador.propuestaDeValor ?? null,
          tono: borrador.tono ?? null,
          servicios: borrador.servicios.map((s) => ({ nombre: s.nombre, descripcion: s.descripcion ?? null, tarifa: s.tarifa ?? null })),
          clientesDeReferencia: borrador.clientesDeReferencia.map((c) => ({ clientId: c.clientId, industria: c.industria, porque: c.porque ?? null })),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAviso({ texto: j.error ?? "No se pudo guardar.", tono: "danger" });
        return;
      }
      setEditando(false);
      setBorrador(null);
      setAviso({ texto: "Guardado. Los agentes lo leen desde ahora.", tono: "info" });
      await cargar();
    } catch {
      setAviso({ texto: "No se pudo conectar con Nexus: no se guardó nada.", tono: "danger" });
    } finally {
      setGuardando(false);
    }
  };

  const texto = (rotulo: string, clave: "propuestaDeValor" | "tono", ayuda: string) => (
    <div className="border-t border-line py-3">
      {editando ? (
        <Field label={rotulo} hint={ayuda}>
          <Textarea rows={3} value={p[clave] ?? ""} onChange={(e) => cambiar({ [clave]: vacioANull(e.target.value) })} />
        </Field>
      ) : (
        <>
          <p className="text-xs text-fg-muted">{rotulo}</p>
          {p[clave] ? (
            <p className="mt-0.5 whitespace-pre-line text-[13px] leading-[19px] text-fg">{p[clave]}</p>
          ) : clave === "tono" && r.tonoDeMarketing ? (
            <p className="mt-0.5 text-[13px] leading-[19px] text-fg-secondary">
              Vale el de Marketing › Voz mientras no escribas uno acá: «{r.tonoDeMarketing.slice(0, 220)}
              {r.tonoDeMarketing.length > 220 ? "…" : ""}»
            </p>
          ) : (
            <p className="mt-0.5 text-[13px] text-fg-muted">Falta.</p>
          )}
        </>
      )}
    </div>
  );

  return (
    <section aria-label={`El perfil de ${r.empresa.nombre}`} className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className={ROTULO_DEL_SISTEMA}>La empresa que usa Nexus</p>
        <span className="flex-1" />
        {r.puedeEditar && !editando && (
          <BotonBlanco
            onClick={() => {
              setBorrador(r.perfil!);
              setEditando(true);
            }}
          >
            Editar el perfil
          </BotonBlanco>
        )}
      </div>
      <h2 className="mt-1 text-sm font-semibold text-fg">El perfil de {r.empresa.nombre}</h2>
      <p className="mt-0.5 text-xs text-fg-muted">
        Lo que Nexus sabe de nosotros. Lo leen Marketing y Documentación; la preventa, las propuestas y el analizador de reuniones de venta lo van a leer de acá.
      </p>

      {aviso && (
        <div className="mt-3">
          <Alert variant={aviso.tono}>{aviso.texto}</Alert>
        </div>
      )}

      <div className="mt-3">
        {texto("Propuesta de valor", "propuestaDeValor", "Qué le damos al cliente, en dos o tres frases.")}
        <div className="border-t border-line py-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex-1 text-xs text-fg-muted">Position statement</p>
            <Link href="/marketing/posicionamiento" className="text-xs text-brand hover:underline">
              {r.puedeEditar ? "Editar en Marketing › Audiencia" : "Ver en Marketing › Audiencia"}
            </Link>
          </div>
          {p.positionStatement ? (
            <p className="mt-0.5 whitespace-pre-line text-[13px] leading-[19px] text-fg">{p.positionStatement}</p>
          ) : (
            <p className="mt-0.5 text-[13px] text-fg-muted">Falta.</p>
          )}
          {p.frentes.length > 0 && <p className="mt-1 text-xs text-fg-secondary">Frentes: {p.frentes.map((f) => (f.herramienta ? `${f.nombre} · ${f.herramienta}` : f.nombre)).join(" · ")}</p>}
        </div>
        {texto("Tono de la marca", "tono", "Cómo hablamos. Vacío: vale el de Marketing › Voz.")}
        <Servicios servicios={p.servicios} editando={editando} onCambio={(servicios) => cambiar({ servicios })} />
        <Referencias referencias={p.clientesDeReferencia} clientes={r.clientes ?? []} editando={editando} onCambio={(clientesDeReferencia) => cambiar({ clientesDeReferencia })} />
      </div>

      {editando && (
        <div className="mt-3 flex items-center gap-2">
          <BotonAzul onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </BotonAzul>
          <BotonTexto
            onClick={() => {
              setEditando(false);
              setBorrador(null);
            }}
          >
            Cancelar
          </BotonTexto>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 border-t border-line pt-3 md:grid-cols-2">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs text-fg-muted">Cliente ideal</p>
            <span className="flex-1" />
            <Link href="/marketing/icp" className="text-xs text-brand hover:underline">
              Editar en Marketing
            </Link>
          </div>
          {r.clienteIdeal?.length ? (
            <ul className="mt-1 space-y-1">
              {r.clienteIdeal.map((s) => (
                <li key={s.seccion} className="text-[13px] leading-[19px] text-fg-secondary">
                  <span className="font-medium text-fg">{s.etiqueta}</span> · {s.items.length === 1 ? "1 punto" : `${s.items.length} puntos`}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[13px] text-fg-muted">Sin cargar.</p>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs text-fg-muted">Buyer personas</p>
            <span className="flex-1" />
            <Link href="/marketing/personas" className="text-xs text-brand hover:underline">
              Editar en Marketing
            </Link>
          </div>
          {r.buyerPersonas?.length ? (
            <ul className="mt-1 space-y-1">
              {r.buyerPersonas.map((b) => (
                <li key={b.nombre} className="text-[13px] leading-[19px] text-fg-secondary">
                  <span className="font-medium text-fg">{b.nombre}</span>
                  {b.cargo ? ` · ${b.cargo}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[13px] text-fg-muted">Sin cargar.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Servicios({ servicios, editando, onCambio }: { servicios: ServicioDelPerfil[]; editando: boolean; onCambio: (s: ServicioDelPerfil[]) => void }) {
  const fila = (i: number, x: Partial<ServicioDelPerfil>) => onCambio(servicios.map((s, j) => (j === i ? { ...s, ...x } : s)));
  return (
    <div className="border-t border-line py-3">
      <p className="text-xs text-fg-muted">Servicios y tarifas</p>
      {!editando && !servicios.length && <p className="mt-0.5 text-[13px] text-fg-muted">Falta.</p>}
      {!editando && servicios.length > 0 && (
        <ul className="mt-1 space-y-1">
          {servicios.map((s) => (
            <li key={s.nombre} className="text-[13px] leading-[19px] text-fg-secondary">
              <span className="font-medium text-fg">{s.nombre}</span>
              {s.tarifa ? ` · ${s.tarifa}` : ""}
              {s.descripcion ? <span className="block text-xs text-fg-muted">{s.descripcion}</span> : null}
            </li>
          ))}
        </ul>
      )}
      {editando && (
        <div className="mt-1.5 space-y-2">
          {servicios.map((s, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_auto]">
              <Input aria-label="Servicio" placeholder="Servicio" value={s.nombre} onChange={(e) => fila(i, { nombre: e.target.value })} />
              <Input aria-label="Qué incluye" placeholder="Qué incluye" value={s.descripcion ?? ""} onChange={(e) => fila(i, { descripcion: vacioANull(e.target.value) })} />
              <Input aria-label="Tarifa" placeholder="US$ 85 la hora" value={s.tarifa ?? ""} onChange={(e) => fila(i, { tarifa: vacioANull(e.target.value) })} />
              <BotonTexto onClick={() => onCambio(servicios.filter((_, j) => j !== i))}>Quitar</BotonTexto>
            </div>
          ))}
          <BotonTexto onClick={() => onCambio([...servicios, { nombre: "", descripcion: null, tarifa: null }])}>Agregar un servicio</BotonTexto>
        </div>
      )}
    </div>
  );
}

function Referencias({
  referencias,
  clientes,
  editando,
  onCambio,
}: {
  referencias: ClienteDeReferencia[];
  clientes: { id: string; nombre: string; industria: string | null }[];
  editando: boolean;
  onCambio: (r: ClienteDeReferencia[]) => void;
}) {
  const fila = (i: number, x: Partial<ClienteDeReferencia>) => onCambio(referencias.map((r, j) => (j === i ? { ...r, ...x } : r)));
  return (
    <div className="border-t border-line py-3">
      <p className="text-xs text-fg-muted">Clientes de referencia por industria</p>
      {!editando && !referencias.length && <p className="mt-0.5 text-[13px] text-fg-muted">Falta.</p>}
      {!editando && referencias.length > 0 && (
        <ul className="mt-1 space-y-1">
          {referencias.map((r) => (
            <li key={`${r.clientId}:${r.industria}`} className="text-[13px] leading-[19px] text-fg-secondary">
              <span className="font-medium text-fg">{r.industria}</span> · {r.nombre ?? r.clientId}
              {r.porque ? ` · ${r.porque}` : ""}
            </li>
          ))}
        </ul>
      )}
      {editando && (
        <div className="mt-1.5 space-y-2">
          {referencias.map((r, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.2fr)_auto]">
              <Select
                aria-label="Cliente"
                value={r.clientId}
                onChange={(e) => {
                  const c = clientes.find((x) => x.id === e.target.value);
                  fila(i, { clientId: e.target.value, nombre: c?.nombre, industria: r.industria || c?.industria || "" });
                }}
              >
                <option value="">Elige un cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
              <Select aria-label="Industria" value={r.industria} onChange={(e) => fila(i, { industria: e.target.value })}>
                <option value="">Elige la industria</option>
                {INDUSTRIAS_DE_SMARTEAM.map((x) => (
                  <option key={x.valor} value={x.valor}>
                    {x.etiqueta}
                  </option>
                ))}
              </Select>
              <Input aria-label="Por qué es referencia" placeholder="Por qué es referencia" value={r.porque ?? ""} onChange={(e) => fila(i, { porque: vacioANull(e.target.value) })} />
              <BotonTexto onClick={() => onCambio(referencias.filter((_, j) => j !== i))}>Quitar</BotonTexto>
            </div>
          ))}
          <BotonTexto onClick={() => onCambio([...referencias, { clientId: "", industria: "", porque: null }])}>Agregar un cliente de referencia</BotonTexto>
        </div>
      )}
    </div>
  );
}
