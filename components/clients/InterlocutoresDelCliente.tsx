"use client";

/**
 * components/clients/InterlocutoresDelCliente.tsx — la pestaña «Interlocutores» de Información del cliente («Unidades e
 * interlocutores», 2026-11-25).
 *
 * Con quién trabajamos en el cliente, con su rol (decide · champion · participa · no involucrado) y, si la empresa tiene
 * unidades (el TEC: AE y TAE), a qué unidad va cada persona. Una persona puede ser «del grupo»: trabaja para varias fichas
 * (Laura, Marco y Mariana, para Teamnet y Stratosphere).
 *
 * Lo CONFIRMADO aquí es lo que usa Nexus para saber de qué ficha es cada reunión (lib/sessions/categorize.ts, paso 3·0):
 * vale más que el dominio y que lo que Nexus aprende de los títulos. Por eso, antes de guardar un cambio que mueve
 * reuniones, la pantalla dice cuántas y de qué ficha a cuál, y pide confirmarlo. Todo pasa por
 * `/api/clients/[id]/interlocutores` (lib/clients/personas-de-la-empresa-server.ts, el único escritor).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, CeldaSelect, ConfirmDialog, Field, IconButton, Input, Selector, Skeleton } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { InfoHint } from "@/components/ui/Tooltip";
import { BotonAzul, BotonBlanco, BotonEnlace, BotonTexto, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { ETIQUETA_DEL_ROL, QUE_ES_EL_ROL, ROLES_DE_PERSONA, type RolDePersona } from "@/lib/clients/roles-de-persona";
import { esDelGrupo, type FichaDeLaEmpresa, type Interlocutor } from "@/lib/clients/interlocutores";

interface Datos {
  fichas: FichaDeLaEmpresa[];
  personas: (Omit<Interlocutor, "ultimaReunionAt" | "confirmadaAt"> & { ultimaReunionAt: string | null; confirmadaAt: string | null })[];
  otrasFichas: { id: string; nombre: string }[];
}
type Persona = Datos["personas"][number];
/** El pedido (lib/clients/interlocutores.ts › PedidoDeInterlocutor): `confirmadaEn` y `sugeridaEn` son de ESTA empresa. */
interface Cambio {
  correo: string;
  nombre?: string | null;
  cargo?: string | null;
  rol?: RolDePersona | null;
  confirmadaEn?: string[];
  sugeridaEn?: string[];
  /** Fichas de otras empresas («del grupo»): se suman o se quitan de a una. */
  otras?: { sumar?: string[]; quitar?: string[] };
  /** La huella del aviso que se vio: al guardar, el servidor mueve solo eso (si cambió, devuelve el aviso nuevo). */
  huella?: string;
}
interface Movidas {
  reuniones: number;
  movidas: { de: string; a: string; reuniones: number }[];
  huella?: string;
}

/** Cuántas personas por confirmar se ven antes de «Ver más». */
const A_LA_VISTA = 8;
const SIN_ROL = "__sin_rol__";
const DEL_GRUPO = "__del_grupo__";
const SIN_CONFIRMAR = "__sin_confirmar__";

const OPCIONES_DE_ROL = [
  ...ROLES_DE_PERSONA.map((r) => ({ value: r, label: ETIQUETA_DEL_ROL[r], hint: QUE_ES_EL_ROL[r] })),
  { value: SIN_ROL, label: "Sin rol" },
];

function textoDeMovidas(m: Movidas): string {
  return m.movidas.map((x) => `${x.reuniones} de ${x.de} a ${x.a}`).join(" · ");
}

export default function InterlocutoresDelCliente({ clientId }: { clientId: string }) {
  const toast = useToast();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verTodas, setVerTodas] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [pendiente, setPendiente] = useState<{ cambio: Cambio; movidas: Movidas } | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const r = await fetch(`/api/clients/${clientId}/interlocutores`, { cache: "no-store" }).catch(() => null);
      const d = await r?.json().catch(() => null);
      if (!vivo) return;
      if (!r?.ok) {
        setError(d?.error ?? "No se pudieron cargar los interlocutores.");
        return;
      }
      setError(null);
      setDatos(d as Datos);
    })();
    return () => {
      vivo = false;
    };
  }, [clientId]);

  const nombreDe = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of datos?.fichas ?? []) m.set(f.id, f.nombre);
    for (const f of datos?.otrasFichas ?? []) m.set(f.id, f.nombre);
    return (id: string) => m.get(id) ?? "otra ficha";
  }, [datos]);

  /** El aviso: cuántas reuniones cambiarían de ficha y su huella. No guarda nada. */
  const simular = useCallback(
    async (cambio: Cambio): Promise<Movidas> => {
      const r = await fetch(`/api/clients/${clientId}/interlocutores`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...cambio, huella: undefined, simular: true }),
      }).catch(() => null);
      const d = (await r?.json().catch(() => null)) as (Movidas & { error?: string }) | null;
      if (!r?.ok || !d) throw new Error(d?.error ?? "No se pudo calcular qué reuniones se mueven.");
      return d;
    },
    [clientId],
  );

  /**
   * Guarda de verdad y avisa cuántas reuniones se movieron. Si algo cambió desde el aviso (otra persona guardó, llegó una
   * reunión), el servidor no guarda nada: se vuelve a pedir el aviso UNA vez; si mueve reuniones, se muestra para
   * confirmarlo de nuevo; si no mueve ninguna, se guarda.
   */
  const guardar = useCallback(
    async (cambio: Cambio): Promise<void> => {
      const intentar = async (c: Cambio, reintento: boolean): Promise<void> => {
        const r = await fetch(`/api/clients/${clientId}/interlocutores`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(c),
        }).catch(() => null);
        const d = await r?.json().catch(() => null);
        if (r?.status === 409 && d?.avisoNuevo && !reintento) {
          const nuevo = await simular(c);
          const conHuella = { ...c, huella: nuevo.huella };
          if (nuevo.reuniones > 0) {
            setPendiente({ cambio: conHuella, movidas: nuevo });
            toast.info("Cambió algo desde el aviso: revísalo de nuevo.");
            return;
          }
          return intentar(conHuella, true);
        }
        if (!r?.ok) throw new Error(d?.error ?? "No se pudo guardar.");
        setDatos((antes) => (antes ? { ...antes, fichas: d.fichas, personas: d.personas } : antes));
        if (d.reuniones > 0) toast.success(`Guardado. ${d.reuniones === 1 ? "1 reunión cambió" : `${d.reuniones} reuniones cambiaron`} de ficha: ${textoDeMovidas(d)}.`);
        else toast.success("Guardado.");
      };
      return intentar(cambio, false);
    },
    [clientId, toast, simular],
  );

  /**
   * Un cambio que puede mover reuniones: primero el aviso. Si mueve alguna, se pide confirmarlo con el número a la vista;
   * si no, se guarda. Solo el rol (o el nombre) no mueve ninguna y se guarda directo.
   */
  const cambiar = useCallback(
    async (cambio: Cambio) => {
      if (!cambio.confirmadaEn && !cambio.otras) return guardar(cambio);
      const d = await simular(cambio);
      const conHuella = { ...cambio, huella: d.huella };
      if (d.reuniones > 0) {
        setPendiente({ cambio: conHuella, movidas: d });
        return;
      }
      return guardar(conHuella);
    },
    [guardar, simular],
  );

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!datos) return <EsqueletoDeInterlocutores />;

  const conUnidades = datos.fichas.length > 1;
  /* Confirmada AQUÍ (en una ficha de esta empresa). Quien solo está confirmada en otra empresa va en «por confirmar». */
  const confirmadas = datos.personas.filter((p) => p.confirmadaEn.length > 0);
  const porConfirmar = datos.personas.filter((p) => p.confirmadaEn.length === 0);
  const aLaVista = verTodas ? porConfirmar : porConfirmar.slice(0, A_LA_VISTA);

  return (
    <div className="space-y-4">
      <section aria-label="Unidades e interlocutores" className="rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className={ROTULO_DEL_SISTEMA}>{conUnidades ? "Unidades e interlocutores" : "Interlocutores"}</p>
            <h3 className="mt-1 text-base font-semibold leading-[22px] text-fg">Con quién trabajamos en el cliente</h3>
            <p className="mt-1 max-w-3xl text-[13px] leading-5 text-fg-muted">
              Nexus usa a las personas confirmadas para saber de qué ficha es cada reunión: valen más que el dominio del correo y
              que lo que aprende de los títulos. Lo que asignes a mano a una reunión sigue ganando.
            </p>
          </div>
          {!agregando && <BotonAzul onClick={() => setAgregando(true)}>+ Agregar persona</BotonAzul>}
        </div>

        {conUnidades && (
          <p className="mt-3 text-[13px] text-fg-secondary">
            Esta empresa tiene {datos.fichas.length} unidades:{" "}
            {datos.fichas.map((f, i) => (
              <span key={f.id}>
                {i > 0 && " · "}
                <span className="font-medium text-fg">{f.nombre}</span>
                {f.principal && <span className="text-fg-muted"> (principal)</span>}
              </span>
            ))}
            . Cada persona va a la suya; «del grupo» si trabaja con varias.
          </p>
        )}

        {agregando && (
          <FormularioNuevo
            fichas={datos.fichas}
            personas={datos.personas}
            fichaDeLaPagina={clientId}
            onCancelar={() => setAgregando(false)}
            onGuardar={async (c) => {
              await cambiar(c);
              setAgregando(false);
            }}
          />
        )}
      </section>

      <section aria-label="Personas confirmadas" className="rounded-xl border border-line bg-surface p-5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-fg">Confirmadas</h3>
          <span className="text-xs text-fg-muted">{confirmadas.length}</span>
        </div>
        {confirmadas.length === 0 ? (
          <p className="mt-2 text-[13px] text-fg-muted">
            Todavía nadie confirmó a ninguna persona. Mientras tanto, Nexus reparte las reuniones por el dominio, el título y lo
            que aprende de los títulos.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {confirmadas.map((p) => (
              <Fila key={p.correo} p={p} datos={datos} conUnidades={conUnidades} nombreDe={nombreDe} onCambio={cambiar} fichaDeLaPagina={clientId} />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Personas por confirmar" className="rounded-xl border border-line bg-surface p-5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-fg">Por confirmar</h3>
          <span className="text-xs text-fg-muted">{porConfirmar.length}</span>
          <InfoHint text="Las trajo la copia (HubSpot, las reuniones o un cuestionario) o las sugirió alguien del equipo. Nexus no las usa para repartir reuniones hasta que alguien las confirme." />
        </div>
        {porConfirmar.length === 0 ? (
          <p className="mt-2 text-[13px] text-fg-muted">No hay personas por confirmar.</p>
        ) : (
          <>
            <ul className="mt-2 divide-y divide-line">
              {aLaVista.map((p) => (
                <Fila key={p.correo} p={p} datos={datos} conUnidades={conUnidades} nombreDe={nombreDe} onCambio={cambiar} fichaDeLaPagina={clientId} />
              ))}
            </ul>
            {porConfirmar.length > A_LA_VISTA && (
              <BotonEnlace className="mt-2" onClick={() => setVerTodas((v) => !v)} aria-expanded={verTodas}>
                {verTodas ? "Ver menos" : `Ver ${porConfirmar.length - A_LA_VISTA} más`}
              </BotonEnlace>
            )}
          </>
        )}
      </section>

      <ConfirmDialog
        open={!!pendiente}
        title="Este cambio mueve reuniones"
        variant="default"
        confirmLabel="Guardar y mover"
        description={
          pendiente && (
            <div className="space-y-2 text-[13px]">
              <p>
                Con este cambio, {pendiente.movidas.reuniones === 1 ? "1 reunión cambia" : `${pendiente.movidas.reuniones} reuniones cambian`} de
                ficha:
              </p>
              <ul className="list-disc space-y-0.5 pl-5">
                {pendiente.movidas.movidas.map((m) => (
                  <li key={`${m.de}-${m.a}`}>
                    {m.reuniones} de <span className="font-medium">{m.de}</span> a <span className="font-medium">{m.a}</span>
                  </li>
                ))}
              </ul>
              <p className="text-fg-muted">Lo que alguien asignó a mano a una reunión no se mueve.</p>
            </div>
          )
        }
        onCancel={() => setPendiente(null)}
        onConfirm={async () => {
          if (!pendiente) return;
          const { cambio } = pendiente;
          /* Se cierra antes de guardar: si algo cambió desde el aviso, `guardar` abre el aviso nuevo. */
          setPendiente(null);
          try {
            await guardar(cambio);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
          }
        }}
      />
    </div>
  );
}

// ── Una persona ───────────────────────────────────────────────────────────────────────────────────────────────────────

function Fila({
  p,
  datos,
  conUnidades,
  nombreDe,
  onCambio,
  fichaDeLaPagina,
}: {
  p: Persona;
  datos: Datos;
  conUnidades: boolean;
  nombreDe: (id: string) => string;
  onCambio: (c: Cambio) => Promise<void>;
  /** La ficha donde se confirma con un clic si la empresa no tiene unidades. */
  fichaDeLaPagina: string;
}) {
  const toast = useToast();
  const confirmada = p.confirmadaEn.length > 0;
  const avisar = (e: unknown) => toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
  const todasLasDeEstaEmpresa = datos.fichas.map((f) => f.id);
  /**
   * Solo lo de esta empresa: lo confirmado en otras queda como está. Sin confirmar en ninguna de aquí, tampoco queda
   * sugerida: quien la sumó a mano la saca así.
   */
  const cambiarConfirmacion = (deEstaEmpresa: string[]) =>
    onCambio({ correo: p.correo, confirmadaEn: deEstaEmpresa, ...(deEstaEmpresa.length === 0 ? { sugeridaEn: [] } : {}) });

  const opcionesDeUnidad = [
    ...datos.fichas.map((f) => ({ value: f.id, label: f.nombre, hint: f.principal ? "La principal" : undefined })),
    { value: DEL_GRUPO, label: "Del grupo: todas las unidades", hint: "Trabaja con varias: no decide sola de quién es una reunión" },
    ...(confirmada ? [{ value: SIN_CONFIRMAR, label: "Sin confirmar", hint: "Deja de contar para repartir reuniones" }] : []),
  ];
  const seleccionDeUnidad =
    p.confirmadaEn.length > 1 && p.confirmadaEn.length === todasLasDeEstaEmpresa.length ? [DEL_GRUPO] : p.confirmadaEn;

  const elegirUnidad = async (v: string) => {
    if (v === DEL_GRUPO) return cambiarConfirmacion(todasLasDeEstaEmpresa);
    if (v === SIN_CONFIRMAR) return cambiarConfirmacion([]);
    return cambiarConfirmacion([v]);
  };

  const donde = [
    !confirmada && p.tambienEn.length ? `Confirmada en ${p.tambienEn.map((t) => t.nombre).join(" y ")}` : null,
    p.sugeridaEn.length ? `Sugerida en ${p.sugeridaEn.map(nombreDe).join(" y ")}` : null,
    !confirmada && p.vistaEn.length ? `Vista en ${p.vistaEn.map(nombreDe).join(" y ")}` : null,
    p.reuniones ? `${p.reuniones === 1 ? "1 reunión" : `${p.reuniones} reuniones`}` : null,
  ].filter(Boolean);

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
      <div className="min-w-[220px] flex-1">
        <p className="text-[13px] font-medium text-fg">
          {p.nombre ?? p.correo}
          {esDelGrupo(p) && <span className="ml-2 rounded-full border border-line bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-fg-secondary">Del grupo</span>}
        </p>
        <p className="text-xs text-fg-muted">
          {p.nombre ? p.correo : null}
          {p.cargo ? `${p.nombre ? " · " : ""}${p.cargo}` : null}
        </p>
        {donde.length > 0 && <p className="text-[11px] text-fg-muted">{donde.join(" · ")}</p>}
      </div>

      <div className="w-36">
        <CeldaSelect
          etiqueta={`Rol de ${p.nombre ?? p.correo}`}
          opciones={OPCIONES_DE_ROL}
          seleccion={p.rol ? [p.rol] : []}
          vacio="Sin rol"
          puedeEditar
          onElegir={async (v) => onCambio({ correo: p.correo, rol: v === SIN_ROL ? null : (v as RolDePersona) })}
        />
      </div>

      {conUnidades ? (
        <div className="w-56">
          <CeldaSelect
            etiqueta={`Unidad de ${p.nombre ?? p.correo}`}
            opciones={opcionesDeUnidad}
            seleccion={seleccionDeUnidad}
            vacio="Confirmar en…"
            puedeEditar
            sugerencia={!confirmada ? p.sugeridaEn[0] : undefined}
            onElegir={elegirUnidad}
          />
        </div>
      ) : confirmada ? (
        <BotonTexto onClick={() => void cambiarConfirmacion([]).catch(avisar)} title="Deja de contar para repartir reuniones">
          Quitar confirmación
        </BotonTexto>
      ) : (
        <BotonBlanco onClick={() => void cambiarConfirmacion([fichaDeLaPagina]).catch(avisar)}>Confirmar</BotonBlanco>
      )}

      {confirmada && <TambienCon p={p} datos={datos} onCambio={onCambio} />}
    </li>
  );
}

/** «También trabaja con…»: las fichas de OTRAS empresas donde está confirmada (la hace «del grupo»). */
function TambienCon({ p, datos, onCambio }: { p: Persona; datos: Datos; onCambio: (c: Cambio) => Promise<void> }) {
  const toast = useToast();
  const opciones = datos.otrasFichas.filter((f) => !p.tambienEn.some((t) => t.id === f.id)).map((f) => ({ value: f.id, label: f.nombre }));
  const avisar = (e: unknown) => toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
  return (
    <div className="flex w-full flex-wrap items-center gap-2 pl-0 text-xs text-fg-muted sm:w-auto">
      {p.tambienEn.length > 0 && <span>También con</span>}
      {p.tambienEn.map((t) => (
        <span key={t.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-muted px-2 py-0.5 text-fg-secondary">
          {t.nombre}
          {t.abre !== false && (
            <IconButton
              aria-label={`Quitar ${t.nombre}`}
              size="xs"
              icon={<span aria-hidden="true">×</span>}
              onClick={() => void onCambio({ correo: p.correo, otras: { quitar: [t.id] } }).catch(avisar)}
            />
          )}
        </span>
      ))}
      <div className="w-48">
        <Selector
          etiqueta={`Otra ficha con la que trabaja ${p.nombre ?? p.correo}`}
          placeholder="+ Trabaja también con…"
          opciones={opciones}
          placeholderBusqueda="Buscar una ficha…"
          onElegir={(v) => onCambio({ correo: p.correo, otras: { sumar: [v] } })}
        />
      </div>
    </div>
  );
}

// ── Agregar a alguien que la copia no trajo ───────────────────────────────────────────────────────────────────────────

function FormularioNuevo({
  fichas,
  personas,
  fichaDeLaPagina,
  onCancelar,
  onGuardar,
}: {
  fichas: FichaDeLaEmpresa[];
  personas: Persona[];
  fichaDeLaPagina: string;
  onCancelar: () => void;
  onGuardar: (c: Cambio) => Promise<void>;
}) {
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [rol, setRol] = useState<string | null>(null);
  const [ficha, setFicha] = useState(fichas.some((f) => f.id === fichaDeLaPagina) ? fichaDeLaPagina : (fichas[0]?.id ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const valido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim());

  return (
    <div className="mt-4 grid gap-3 rounded-lg border border-line bg-surface-muted p-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Nombre">
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellido" />
      </Field>
      <Field label="Correo">
        <Input value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="nombre@empresa.com" />
      </Field>
      <Field label="Rol">
        <Selector etiqueta="Rol" placeholder="Sin rol" valor={rol} opciones={OPCIONES_DE_ROL} onElegir={(v) => setRol(v === SIN_ROL ? null : v)} />
      </Field>
      {fichas.length > 1 && (
        <Field label="Unidad">
          <Selector etiqueta="Unidad" placeholder="Elegir unidad" valor={ficha} opciones={fichas.map((f) => ({ value: f.id, label: f.nombre }))} onElegir={setFicha} />
        </Field>
      )}
      <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-4">
        <BotonAzul
          disabled={!valido || guardando}
          onClick={async () => {
            setGuardando(true);
            setError(null);
            try {
              const limpio = correo.trim().toLowerCase();
              /* Si ya está en la lista, se SUMA esta unidad a las que tenía y no se toca el rol si no se eligió uno. */
              const ya = personas.find((x) => x.correo === limpio);
              await onGuardar({
                correo: limpio,
                ...(nombre.trim() ? { nombre: nombre.trim() } : {}),
                ...(rol ? { rol: rol as RolDePersona } : {}),
                confirmadaEn: [...new Set([...(ya?.confirmadaEn ?? []), ficha])],
              });
            } catch (e) {
              setError(e instanceof Error ? e.message : "No se pudo guardar.");
            } finally {
              setGuardando(false);
            }
          }}
        >
          {guardando ? "Guardando…" : "Confirmar persona"}
        </BotonAzul>
        <BotonTexto onClick={onCancelar}>Cancelar</BotonTexto>
        {error && <span className="text-xs text-danger-ink">{error}</span>}
      </div>
    </div>
  );
}

/** El esqueleto con la forma de la pestaña: la cabecera y las dos listas (doctrina de los estados de carga). */
function EsqueletoDeInterlocutores() {
  return (
    <div className="space-y-4" aria-busy="true">
      {[2, 4, 3].map((filas, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-line bg-surface p-5">
          <Skeleton className="h-4 w-40" delay={i * 60} />
          {Array.from({ length: filas }, (_, j) => (
            <div key={j} className="flex items-center gap-4">
              <Skeleton className="h-4 flex-1" delay={i * 60 + j * 40} />
              <Skeleton className="h-6 w-32" delay={i * 60 + j * 40} />
              <Skeleton className="h-6 w-48" delay={i * 60 + j * 40} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
