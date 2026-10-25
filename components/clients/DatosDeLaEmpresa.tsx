"use client";

/**
 * components/clients/DatosDeLaEmpresa.tsx — la pestaña «Datos de la empresa» de Información del cliente (R1, R5 y U27,
 * 2026-10-24). Diseño aprobado por Elías el 24 oct (Claude Design «Datos de la empresa», sistema «Nexus · interfaz
 * interna»), construido con los tokens que ya tiene el código.
 *
 * A la izquierda, cada dato con su valor, su fuente y su fecha, y la propuesta al lado (de quién y por qué, con «Usar»,
 * «Editar» y «Descartar»); a la derecha, el TAM estimado v1 con cómo se calculó, lo que ya paga y lo que le falta, y la
 * investigación de la empresa. Quien no tiene `clientes.decidirDatos` propone en vez de guardar. Todo pasa por
 * `/api/clients/[id]/datos` (lib/clients/datos-de-la-empresa-server.ts). No escribe en HubSpot.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Input, Select, Skeleton } from "@/components/ui";
import { BotonAzul, BotonBlanco, BotonEnlace, BotonTexto, BotonUsar, IconoDeSugerencia, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import {
  CATALOGO_DE_DATOS,
  cierraElEditor,
  datoDeLaEmpresa,
  esFuenteDeIA,
  ETIQUETA_DE_LA_FUENTE,
  textoDelContador,
  valorParaMostrar,
  EDICIONES_DE_LA_ESCALA,
  type ClaveDeDato,
  type DatoDeLaEmpresa,
  type FuenteDeDato,
  type ValorDeDato,
} from "@/lib/clients/datos-de-la-empresa";
import type { CalculoDelTam } from "@/lib/clients/tam-v1";
import { deDondeSale, montoConMoneda, type LoQueLeFalta, type LoQueYaPaga } from "@/lib/clients/lo-que-ya-paga";

interface Dato {
  clave: ClaveDeDato;
  valor: ValorDeDato | null;
  fuente: FuenteDeDato | null;
  at: string | null;
  decidio: { nombre: string; estado: string; origen: FuenteDeDato | null } | null;
}
interface Propuesta {
  id: string;
  clave: ClaveDeDato;
  valor: ValorDeDato | null;
  fuente: FuenteDeDato;
  autor: string | null;
  cita: string | null;
  enlace: string | null;
  creadaAt: string;
}
interface Investigacion {
  hechaAt: string;
  venceAt: string;
  vencida: boolean;
  resumen: string | null;
  contenido: { sector?: string; hitos?: { texto: string; url: string }[] };
  fuentes: { url: string }[];
  contrataciones: { puesto: string; url: string; fecha?: string }[];
  tamanoEstimado: { empleados?: number; rango?: string; cita: string; url: string } | null;
}
interface Corrida {
  id: string;
  status: string;
  currentPhase: string | null;
  output: string | null;
}
interface Respuesta {
  datos: Dato[];
  propuestas: Propuesta[];
  porRevisar: number;
  tamCalculo: CalculoDelTam | null;
  yaPaga: LoQueYaPaga | null;
  leFalta: LoQueLeFalta[];
  investigacion: Investigacion | null;
  corrida: Corrida | null;
  puedeDecidir: boolean;
}

/** Los datos que la pantalla pinta en otro lugar: la edición, debajo de la industria; el TAM, en la tarjeta del potencial. */
const EN_OTRO_LUGAR: ReadonlySet<ClaveDeDato> = new Set(["edicionEscala", "tamUsd"]);

/** Las tarjetas de la izquierda, con los datos que el CATÁLOGO pone en cada grupo: un dato nuevo aparece solo. */
const GRUPOS: { rotulo: string; titulo: string; claves: ClaveDeDato[] }[] = (
  [
    { grupo: "quien", rotulo: "La empresa", titulo: "Quién es" },
    { grupo: "tamano", rotulo: "El tamaño", titulo: "Cuánta empresa es" },
    { grupo: "vende", rotulo: "Cómo vende", titulo: "Su modelo de negocio" },
  ] as const
).map((g) => ({ rotulo: g.rotulo, titulo: g.titulo, claves: CATALOGO_DE_DATOS.filter((d) => d.grupo === g.grupo && !EN_OTRO_LUGAR.has(d.clave)).map((d) => d.clave) }));

/** Lo del grupo «potencial» que no es el TAM (hoy, Insider): va en la tarjeta del potencial, debajo del monto. */
const DEL_POTENCIAL: ClaveDeDato[] = CATALOGO_DE_DATOS.filter((d) => d.grupo === "potencial" && !EN_OTRO_LUGAR.has(d.clave)).map((d) => d.clave);

/** «24 oct». Una fecha sin hora («2026-10-24») es ese día: leída como medianoche UTC, en Costa Rica saldría el 23. */
const fecha = (iso: string | null | undefined) => {
  if (!iso) return null;
  // Solo año y mes (así guarda la investigación algunas fechas): se muestra el mes, sin inventar un día.
  if (/^\d{4}-\d{2}$/.test(iso)) {
    return new Date(`${iso}-15T12:00:00`).toLocaleDateString("es-CR", { month: "short", year: "numeric", timeZone: "America/Costa_Rica" }).replace(".", "");
  }
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return d.toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" }).replace(".", "");
};
const usd = (n: number) => `US$ ${n.toLocaleString("es-CR", { maximumFractionDigits: 0 })}`;
const dominio = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "") + new URL(url).pathname.replace(/\/$/, "");
  } catch {
    return url;
  }
};

// ── Las piezas chicas ────────────────────────────────────────────────────────────────────────────

function Chip({ tono, children }: { tono: "hubspot" | "persona" | "nexus" | "ambar"; children: React.ReactNode }) {
  const color = {
    hubspot: "bg-surface-hover text-fg-secondary",
    persona: "bg-success-surface text-success-ink",
    nexus: "bg-info-surface text-info-ink",
    ambar: "bg-warn-surface text-warn-ink",
  }[tono];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-[14px] ${color}`}>{children}</span>;
}

function ChipDeFuente({ dato }: { dato: Dato }) {
  if (!dato.fuente) return null;
  if (dato.fuente === "persona") return <Chip tono="persona">{dato.decidio?.nombre ?? "Una persona"}</Chip>;
  if (dato.fuente === "hubspot") return <Chip tono="hubspot">HubSpot</Chip>;
  return <Chip tono="nexus">{ETIQUETA_DE_LA_FUENTE[dato.fuente]}</Chip>;
}

function LineaDeFuente({ dato, extra }: { dato: Dato; extra?: React.ReactNode }) {
  const f = fecha(dato.at);
  if (!dato.fuente && !extra) return null;
  return (
    <div className="mt-0.5 text-xs leading-4 text-fg-muted">
      <ChipDeFuente dato={dato} />
      {f && <> · {f}</>}
      {dato.fuente === "persona" && dato.decidio?.origen && <> · lo propuso {dato.decidio.origen === "persona" ? "otra persona" : ETIQUETA_DE_LA_FUENTE[dato.decidio.origen].toLowerCase()}</>}
      {dato.decidio && dato.fuente === "nexus" && dato.decidio.estado === "usada" && <> · lo usó {dato.decidio.nombre}</>}
      {extra}
    </div>
  );
}

function Falta({ children = "Falta" }: { children?: React.ReactNode }) {
  return <div className="rounded-[10px] border border-dashed border-line bg-surface-muted px-3 py-2 text-[13px] text-fg-muted">{children}</div>;
}

function Tarjeta({ rotulo, titulo, derecha, children, etiqueta }: { rotulo: string; titulo: string; derecha?: React.ReactNode; children: React.ReactNode; etiqueta: string }) {
  return (
    <section aria-label={etiqueta} className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center gap-2">
        <p className={ROTULO_DEL_SISTEMA}>{rotulo}</p>
        <span className="flex-1" />
        {derecha}
      </div>
      <h3 className="mb-1.5 mt-1 text-base font-semibold leading-[22px] text-fg">{titulo}</h3>
      {children}
    </section>
  );
}

// ── El editor de un dato ─────────────────────────────────────────────────────────────────────────

function Editor({
  dato,
  inicial,
  puedeDecidir,
  guardando,
  onGuardar,
  onCancelar,
  ayuda,
}: {
  dato: DatoDeLaEmpresa;
  inicial: ValorDeDato | null;
  puedeDecidir: boolean;
  guardando: boolean;
  onGuardar: (valor: string, cita: string) => void;
  onCancelar: () => void;
  ayuda?: React.ReactNode;
}) {
  const [valor, setValor] = useState(inicial === null ? "" : String(inicial));
  const [cita, setCita] = useState("");
  const id = `dato-${dato.clave}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs leading-4 text-fg-secondary">
        {dato.etiqueta}
      </label>
      {dato.tipo === "opcion" ? (
        <Select id={id} value={valor} onChange={(e) => setValor(e.target.value)}>
          <option value="">Sin dato</option>
          {dato.opciones!.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </Select>
      ) : (
        <Input id={id} value={valor} inputMode={dato.tipo === "texto" ? undefined : "numeric"} onChange={(e) => setValor(e.target.value)} autoFocus />
      )}
      <p className="mt-1.5 text-xs leading-4 text-fg-muted">{ayuda ?? dato.ayuda}</p>
      {!puedeDecidir && (
        <>
          <label htmlFor={`${id}-porque`} className="mb-1.5 mt-2.5 block text-xs leading-4 text-fg-secondary">
            Por qué (opcional)
          </label>
          <Input id={`${id}-porque`} value={cita} onChange={(e) => setCita(e.target.value)} />
        </>
      )}
      <div className="mt-2.5 flex gap-1.5">
        {puedeDecidir ? (
          <BotonAzul onClick={() => onGuardar(valor, cita)} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </BotonAzul>
        ) : (
          <BotonBlanco onClick={() => onGuardar(valor, cita)} disabled={guardando}>
            {guardando ? "Proponiendo…" : "Proponer el cambio"}
          </BotonBlanco>
        )}
        <BotonTexto onClick={onCancelar}>Cancelar</BotonTexto>
      </div>
    </div>
  );
}

// ── La propuesta al lado del dato ────────────────────────────────────────────────────────────────

function Sugerencia({
  propuesta,
  dato,
  actual,
  puedeDecidir,
  ocupado,
  onUsar,
  onEditar,
  onDescartar,
}: {
  propuesta: Propuesta;
  dato: DatoDeLaEmpresa;
  actual: ValorDeDato | null;
  puedeDecidir: boolean;
  ocupado: boolean;
  onUsar: () => void;
  onEditar: () => void;
  onDescartar: () => void;
}) {
  const valor = valorParaMostrar(dato, propuesta.valor) ?? "vacío";
  const deLaIA = esFuenteDeIA(propuesta.fuente);
  const quien =
    propuesta.fuente === "persona"
      ? `Propuesto por ${propuesta.autor ?? "una persona"}`
      : deLaIA
        ? "Nexus sugiere"
        : `${ETIQUETA_DE_LA_FUENTE[propuesta.fuente]} dice`;
  const origen = propuesta.fuente === "investigacion" ? `De la investigación del ${fecha(propuesta.creadaAt)}` : propuesta.fuente === "reunion" ? `Reunión del ${fecha(propuesta.creadaAt)}` : fecha(propuesta.creadaAt);
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-[14px] border border-info-line bg-info-surface px-3.5 py-2.5">
      <div className="flex items-center gap-1.5 text-[13px] text-info-ink">
        {deLaIA && <IconoDeSugerencia className="h-[15px] w-[15px] text-brand" />}
        <span>
          {quien} <b className="font-semibold">{valor}</b>
          {actual !== null && <span className="text-fg-muted"> en lugar de {valorParaMostrar(dato, actual)}</span>}
        </span>
      </div>
      {(propuesta.cita || origen) && (
        <div className="text-xs leading-4 text-fg-secondary">
          {origen}
          {propuesta.cita && <>{origen ? ": " : ""}«{propuesta.cita}»</>}
          {propuesta.enlace && (
            <>
              {" "}
              <a href={propuesta.enlace} target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand-light">
                fuente
              </a>
            </>
          )}
        </div>
      )}
      {puedeDecidir ? (
        <div className="flex gap-1.5">
          <BotonUsar onClick={onUsar} disabled={ocupado} />
          <BotonBlanco onClick={onEditar} disabled={ocupado} className="rounded-[10px] px-3 py-1.5 text-[13px]">
            Editar
          </BotonBlanco>
          <BotonTexto onClick={onDescartar} disabled={ocupado} className="text-[13px]">
            Descartar
          </BotonTexto>
        </div>
      ) : (
        <div className="text-xs leading-4 text-fg-muted">Lo decide el CSE, la CSL o Ventas.</div>
      )}
    </div>
  );
}

// ── La pantalla ──────────────────────────────────────────────────────────────────────────────────

export default function DatosDeLaEmpresa({ clientId }: { clientId: string }) {
  const [r, setR] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Lo que pasó al guardar: al lado del dato que se tocó (`clave`), o arriba si no es de un dato. */
  const [aviso, setAviso] = useState<{ texto: string; tono: "info" | "danger"; clave?: ClaveDeDato } | null>(null);
  const [editando, setEditando] = useState<{ clave: ClaveDeDato; propuestaId?: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [soloPorRevisar, setSoloPorRevisar] = useState(false);
  const montado = useRef(true);

  /** Trae los datos. Devuelve si pudo: después de guardar, quien llama avisa si la pantalla quedó vieja. */
  const cargar = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/clients/${clientId}/datos`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!montado.current) return false;
      if (!res.ok) {
        setError(j.error ?? "No se pudieron cargar los datos de la empresa.");
        return false;
      }
      setError(null);
      setR(j as Respuesta);
      return true;
    } catch {
      if (montado.current) setError("No se pudieron cargar los datos de la empresa.");
      return false;
    }
  }, [clientId]);

  useEffect(() => {
    montado.current = true;
    void cargar();
    return () => {
      montado.current = false;
    };
  }, [cargar]);

  // Mientras investiga, se sigue la fase y al terminar se recargan los datos (llegan las propuestas).
  const investigando = r?.corrida?.status === "RUNNING" || r?.corrida?.status === "PENDING";
  useEffect(() => {
    if (!investigando) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/clients/${clientId}/investigacion`, { cache: "no-store" }).catch(() => null);
      const j = res && res.ok ? ((await res.json()) as { corrida: Corrida | null }) : null;
      if (!montado.current || !j) return;
      if (j.corrida?.status === "RUNNING" || j.corrida?.status === "PENDING") {
        setR((x) => (x ? { ...x, corrida: j.corrida } : x));
      } else {
        await cargar();
      }
    }, 3000);
    return () => clearInterval(t);
  }, [investigando, clientId, cargar]);

  const porClave = useMemo(() => new Map((r?.datos ?? []).map((d) => [d.clave, d])), [r]);
  // Sin nada por revisar, el filtro no tiene sentido (y su botón desaparece): se apaga solo para no dejar tarjetas vacías.
  const porRevisar = r?.porRevisar ?? 0;
  useEffect(() => {
    if (porRevisar === 0) setSoloPorRevisar(false);
  }, [porRevisar]);
  const propuestasDe = useCallback((clave: ClaveDeDato) => (r?.propuestas ?? []).filter((p) => p.clave === clave), [r]);

  /**
   * Manda un cambio. `cierra`: si cierra el editor abierto (solo lo hace guardar lo que se estaba editando; usar o
   * descartar una propuesta de OTRO dato, o lanzar la investigación, no se lleva lo que la persona estaba escribiendo).
   * `clave`: el dato al lado del cual se dice si falló.
   */
  async function enviar(url: string, method: "POST" | "PATCH", body: unknown, o: { exito?: string; cierra?: boolean; clave?: ClaveDeDato } = {}) {
    setOcupado(true);
    setAviso(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAviso({ texto: j.error ?? "No se pudo guardar.", tono: "danger", clave: o.clave });
        return false;
      }
      if (o.cierra) setEditando(null);
      const recargo = await cargar();
      if (!recargo) setAviso({ texto: "Se guardó, pero la pantalla no se pudo poner al día: recárgala para ver cómo quedó.", tono: "danger" });
      else if (o.exito) setAviso({ texto: o.exito, tono: "info", clave: o.clave });
      return true;
    } catch {
      // Sin red, el fetch ni llega: que se diga, en vez de que parezca que no pasó nada.
      if (montado.current) setAviso({ texto: "No se pudo conectar con Nexus. Revisa tu conexión y vuelve a intentarlo: no se guardó nada.", tono: "danger", clave: o.clave });
      return false;
    } finally {
      if (montado.current) setOcupado(false);
    }
  }

  const guardar = (clave: ClaveDeDato, valor: string, cita: string) =>
    enviar(
      `/api/clients/${clientId}/datos`,
      "POST",
      { clave, valor: valor.trim() === "" ? null : valor, ...(cita.trim() ? { cita: cita.trim() } : {}) },
      { cierra: true, clave, exito: r?.puedeDecidir ? undefined : "Listo: tu propuesta quedó para que la decida el CSE, la CSL o Ventas." },
    );
  const decidir = (p: Propuesta, cuerpo: { accion: "usar" } | { accion: "descartar" } | { accion: "editar"; valor: string | null }) =>
    enviar(`/api/clients/${clientId}/datos/propuestas/${p.id}`, "PATCH", cuerpo, {
      clave: p.clave,
      cierra: cierraElEditor(cuerpo.accion, p.id, editando),
    });
  const investigar = () => enviar(`/api/clients/${clientId}/investigacion`, "POST", {});

  if (error && !r) return <Alert variant="danger">{error}</Alert>;
  if (!r) return <Esqueleto />;

  const contador = textoDelContador(r.porRevisar);

  /** Una fila del catálogo: el valor (o «Falta»), su fuente, el editor y las propuestas. Es una función que arma JSX y
   *  no un componente: definido acá adentro, React lo montaría de nuevo en cada render y el editor perdería lo escrito. */
  const fila = (clave: ClaveDeDato, opciones: { extraFuente?: React.ReactNode; ayuda?: React.ReactNode } = {}) => {
    const { extraFuente, ayuda } = opciones;
    const def = datoDeLaEmpresa(clave);
    const d = porClave.get(clave);
    if (!d) return null;
    const ps = propuestasDe(clave);
    const editandoEste = editando?.clave === clave;
    if (soloPorRevisar && ps.length === 0 && !editandoEste) return null;
    const propuestaEnEdicion = editando?.propuestaId ? ps.find((p) => p.id === editando.propuestaId) : undefined;
    return (
      <div key={clave} className="grid grid-cols-1 items-start gap-x-4 gap-y-1 border-t border-line py-3 sm:grid-cols-[200px_minmax(0,1fr)_auto]">
        <span className="text-[13px] leading-[19px] text-fg-secondary">{def.etiqueta}</span>
        <div className="min-w-0">
          {editandoEste ? (
            <Editor
              dato={def}
              inicial={propuestaEnEdicion ? propuestaEnEdicion.valor : d.valor}
              puedeDecidir={r!.puedeDecidir}
              guardando={ocupado}
              ayuda={ayuda}
              onCancelar={() => setEditando(null)}
              onGuardar={(valor, cita) => (propuestaEnEdicion ? void decidir(propuestaEnEdicion, { accion: "editar", valor: valor.trim() === "" ? null : valor }) : void guardar(clave, valor, cita))}
            />
          ) : (
            <>
              {d.valor === null ? (
                <Falta>
                  {/* Vaciarlo a propósito es una decisión (no se vuelve a llenar solo): se dice, para no confundirlo con «nunca se cargó». */}
                  {d.fuente === "persona" ? `Vacío a propósito${d.decidio ? ` · lo vació ${d.decidio.nombre}` : ""}${d.at ? ` · ${fecha(d.at)}` : ""}` : "Falta"}
                </Falta>
              ) : <div className="text-sm font-medium leading-[21px] text-fg tabular-nums">{valorParaMostrar(def, d.valor)}</div>}
              {d.valor !== null && <LineaDeFuente dato={d} extra={extraFuente} />}
              {ps.map((p) => (
                <Sugerencia
                  key={p.id}
                  propuesta={p}
                  dato={def}
                  actual={d.valor}
                  puedeDecidir={r!.puedeDecidir}
                  ocupado={ocupado}
                  onUsar={() => void decidir(p, { accion: "usar" })}
                  onEditar={() => setEditando({ clave, propuestaId: p.id })}
                  onDescartar={() => void decidir(p, { accion: "descartar" })}
                />
              ))}
            </>
          )}
          {aviso?.clave === clave && (
            <div className="mt-2">
              <Alert variant={aviso.tono}>{aviso.texto}</Alert>
            </div>
          )}
        </div>
        {!editandoEste && (ps.length === 0 || !r!.puedeDecidir) ? (
          <BotonTexto onClick={() => setEditando({ clave })} className="text-[13px]" title={`${d.valor === null ? "Agregar" : "Editar"}: ${def.etiqueta}`}>
            {/* Quien no decide propone, aunque ya haya otra propuesta esperando. */}
            {ps.length > 0 ? "Proponer" : d.valor === null ? "Agregar" : "Editar"}
          </BotonTexto>
        ) : (
          <span />
        )}
      </div>
    );
  };

  const tam = porClave.get("tamUsd");
  const edicion = porClave.get("edicionEscala");
  const nombreDeLaEdicion = EDICIONES_DE_LA_ESCALA.find((e) => e.valor === edicion?.valor)?.etiqueta;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-[14px] border border-line bg-surface px-3.5 py-2.5">
        {contador ? (
          <Chip tono="nexus">
            <IconoDeSugerencia className="h-[13px] w-[13px]" />
            {contador}
          </Chip>
        ) : (
          <Chip tono="persona">Nada por revisar</Chip>
        )}
        <span className="text-[13px] text-fg-secondary">
          {r.puedeDecidir
            ? "Nexus propone; decides tú. Lo que uses o edites se guarda con tu nombre y la fecha."
            : "Nexus y el equipo proponen; lo decide el CSE, la CSL o Ventas. Tú también puedes proponer un cambio."}
        </span>
        <span className="flex-1" />
        {r.porRevisar > 0 && (
          <BotonEnlace onClick={() => setSoloPorRevisar((x) => !x)} className="text-[13px] font-medium">
            {soloPorRevisar ? "Ver todos los datos" : "Ver solo los que faltan revisar"}
          </BotonEnlace>
        )}
      </div>

      {aviso && !aviso.clave && <Alert variant={aviso.tono}>{aviso.texto}</Alert>}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {GRUPOS.map((g) => {
            const filas = g.claves.flatMap((clave) => {
              if (clave === "industriaSmarteam") {
                return [
                  fila(clave, {
                    extraFuente: (
                      <>
                        {" "}
                        · decide la edición de la escala: <b className="font-semibold text-fg-secondary">{nombreDeLaEdicion ?? "la escala general"}</b>
                      </>
                    ),
                    ayuda: "Cambiarla cambia la edición de la escala, la exploración y el diagnóstico.",
                  }),
                  propuestasDe("edicionEscala").length > 0 ? fila("edicionEscala") : null,
                ];
              }
              if (clave === "filiales" && porClave.get("estructura")?.valor !== "casa_matriz" && porClave.get("filiales")?.valor === null && propuestasDe("filiales").length === 0) return [];
              return [fila(clave)];
            });
            // Con el filtro, una tarjeta sin nada por revisar no se muestra (quedaba el título solo).
            if (soloPorRevisar && filas.every((f) => f === null)) return null;
            return (
              <Tarjeta key={g.rotulo} rotulo={g.rotulo} titulo={g.titulo} etiqueta={g.rotulo}>
                {filas}
              </Tarjeta>
            );
          })}
        </div>

        <div className="flex flex-col gap-4">
          <Tarjeta rotulo="El potencial" titulo="Cuánto le podría vender Smarteam en un año" etiqueta="El potencial" derecha={<Chip tono="hubspot">Solo el equipo</Chip>}>
            <Potencial
              tam={tam}
              calculo={r.tamCalculo}
              propuestas={editando?.clave === "tamUsd" ? [] : propuestasDe("tamUsd")}
              puedeDecidir={r.puedeDecidir}
              ocupado={ocupado}
              decidir={decidir}
              onEditar={(p) => setEditando({ clave: "tamUsd", propuestaId: p.id })}
            />
            {/* El TAM no tiene fila a la vista (solo al editarlo): lo que pasó al usar o descartar su propuesta se dice acá. */}
            {aviso?.clave === "tamUsd" && editando?.clave !== "tamUsd" && (
              <div className="mt-2">
                <Alert variant={aviso.tono}>{aviso.texto}</Alert>
              </div>
            )}
            {editando?.clave === "tamUsd" ? (
              <div className="mt-3">{fila("tamUsd")}</div>
            ) : (
              r.puedeDecidir &&
              propuestasDe("tamUsd").length === 0 && (
                <BotonTexto onClick={() => setEditando({ clave: "tamUsd" })} className="mt-1 text-[13px]">
                  {tam?.valor === null ? "Estimarlo a mano" : "Corregir el TAM"}
                </BotonTexto>
              )
            )}
            <div className="mt-3">{DEL_POTENCIAL.map((clave) => fila(clave))}</div>
            <LoQuePaga yaPaga={r.yaPaga} leFalta={r.leFalta} />
          </Tarjeta>

          <LaInvestigacion inv={r.investigacion} corrida={r.corrida} puedeDecidir={r.puedeDecidir} ocupado={ocupado} onInvestigar={() => void investigar()} />
        </div>
      </div>
    </div>
  );
}

// ── El potencial ─────────────────────────────────────────────────────────────────────────────────

function Potencial({
  tam,
  calculo,
  propuestas,
  puedeDecidir,
  ocupado,
  decidir,
  onEditar,
}: {
  tam: Dato | undefined;
  calculo: CalculoDelTam | null;
  propuestas: Propuesta[];
  puedeDecidir: boolean;
  ocupado: boolean;
  decidir: (p: Propuesta, cuerpo: { accion: "usar" } | { accion: "descartar" }) => Promise<boolean>;
  onEditar: (p: Propuesta) => void;
}) {
  const valor = typeof tam?.valor === "number" ? tam.valor : null;
  const deNexus = tam?.fuente === "nexus";
  return (
    <>
      <div className="mt-2.5 flex items-baseline gap-2.5">
        {valor === null ? (
          <span className="text-[34px] font-light leading-[38px] tracking-[-0.02em] text-fg-muted">Sin estimar</span>
        ) : (
          <span className="text-[34px] font-light leading-[38px] tracking-[-0.02em] text-info-ink tabular-nums">{usd(valor)}</span>
        )}
        {deNexus && <Chip tono="ambar">estimado {calculo?.version ?? "v1"}</Chip>}
      </div>
      {tam && tam.valor !== null && (
        <div className="mt-1 text-xs leading-4 text-fg-muted">
          {deNexus ? <Chip tono="nexus">Calculado por Nexus</Chip> : <ChipDeFuente dato={tam} />}
          {fecha(tam.at) && <> · {fecha(tam.at)}</>}
          {deNexus && " · con los datos de la izquierda"}
          {!deNexus && tam.fuente === "persona" && " · corregido a mano: Nexus ya no lo pisa"}
        </div>
      )}
      {valor === null && tam?.fuente === "persona" && (
        <p className="mt-1 text-xs leading-4 text-fg-muted">
          Lo vació {tam.decidio?.nombre ?? "una persona"} a propósito{fecha(tam.at) ? ` el ${fecha(tam.at)}` : ""}: Nexus ya no lo llena solo, lo propone.
        </p>
      )}
      {valor === null && tam?.fuente !== "persona" && !calculo && <p className="mt-1 text-xs leading-4 text-fg-muted">Nexus lo calcula apenas sepa cuántos empleados tiene.</p>}

      {/* La misma propuesta que el resto de la ficha: dice quién la hizo (Nexus, HubSpot o una persona) y deja editarla. */}
      {propuestas.map((p) => (
        <Sugerencia
          key={p.id}
          propuesta={p}
          dato={datoDeLaEmpresa("tamUsd")}
          actual={valor}
          puedeDecidir={puedeDecidir}
          ocupado={ocupado}
          onUsar={() => void decidir(p, { accion: "usar" })}
          onEditar={() => onEditar(p)}
          onDescartar={() => void decidir(p, { accion: "descartar" })}
        />
      ))}

      {calculo && calculo.total !== null && (
        <div className="mt-3.5 rounded-[18px] border border-info-line bg-info-surface px-3.5 py-3">
          <div className="flex items-center gap-1.5">
            <IconoDeSugerencia className="h-[15px] w-[15px] text-brand" />
            <span className={`${ROTULO_DEL_SISTEMA} text-brand`}>Cómo se calculó</span>
          </div>
          <p className="mb-2 mt-1.5 text-[13px] leading-[19px] text-fg">{calculo.porQue}</p>
          {calculo.lineas.map((l) => (
            <div key={l.concepto} className="flex justify-between gap-3 border-t border-info-line py-1.5 text-[13px] leading-[19px] text-fg-secondary">
              <span>
                {l.concepto}
                {l.montoAnual !== null && l.detalle ? ` · ${l.detalle}` : ""}
              </span>
              {l.montoAnual !== null ? <span className="tabular-nums">{usd(l.montoAnual)}</span> : <span className="text-fg-muted">{l.detalle}</span>}
            </div>
          ))}
          {calculo.supuestos.length > 0 && (
            <ul className="mt-1.5 list-disc pl-4 text-xs leading-4 text-fg-muted">
              {calculo.supuestos.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs leading-4 text-fg-muted">A precio de lista, por año (precios del {fecha(calculo.preciosAl)}). Los servicios no suman: sus precios los fija Ventas.</p>
        </div>
      )}
    </>
  );
}

function LoQuePaga({ yaPaga, leFalta }: { yaPaga: LoQueYaPaga | null; leFalta: LoQueLeFalta[] }) {
  return (
    <>
      <div className="mt-4">
        <p className={ROTULO_DEL_SISTEMA}>Lo que ya paga</p>
        {yaPaga ? (
          <>
            {yaPaga.hubs.map((h, i) => (
              <div key={h.hub} className={`flex justify-between gap-3 py-1.5 text-[13px] leading-[19px] text-fg-secondary ${i ? "border-t border-line" : ""}`}>
                <span>
                  {h.nombre}
                  {h.plan ? ` ${h.plan}` : ""}
                </span>
                {/* Cada monto con SU moneda: lo cargado a mano puede estar en colones aunque Partner esté en dólares. */}
                {h.montoMensual !== null && <span className="tabular-nums">{`${montoConMoneda(h.montoMensual, h.moneda)} al mes`}</span>}
              </div>
            ))}
            {yaPaga.totalMensual !== null && yaPaga.hubs.every((h) => h.montoMensual === null) && (
              <div className="flex justify-between gap-3 border-t border-line py-1.5 text-[13px] leading-[19px] text-fg-secondary">
                <span>En total</span>
                <span className="tabular-nums">{`${montoConMoneda(yaPaga.totalMensual, yaPaga.moneda)} al mes`}</span>
              </div>
            )}
            <div className="mt-0.5 text-xs leading-4 text-fg-muted">{deDondeSale(yaPaga, fecha)}</div>
          </>
        ) : (
          <p className="mt-1.5 text-[13px] text-fg-muted">HubSpot Partner no dice que pague licencias.</p>
        )}
      </div>
      {leFalta.length > 0 && (
        <div className="mt-3.5">
          <p className={ROTULO_DEL_SISTEMA}>Le falta · venta cruzada</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {leFalta.map((f) => (
              <span key={f.hub} title={f.motivo}>
                <Chip tono="nexus">{f.nombre}</Chip>
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── La investigación ─────────────────────────────────────────────────────────────────────────────

function LaInvestigacion({ inv, corrida, puedeDecidir, ocupado, onInvestigar }: { inv: Investigacion | null; corrida: Corrida | null; puedeDecidir: boolean; ocupado: boolean; onInvestigar: () => void }) {
  const [todas, setTodas] = useState(false);
  const corriendo = corrida?.status === "RUNNING" || corrida?.status === "PENDING";
  const fallo = corrida?.status === "ERROR" ? (() => {
    try {
      return (JSON.parse(corrida.output ?? "{}") as { error?: string }).error ?? "La investigación falló.";
    } catch {
      return "La investigación falló.";
    }
  })() : null;
  const boton = puedeDecidir && !corriendo && inv && (
    <BotonBlanco onClick={onInvestigar} disabled={ocupado} className="rounded-[10px] px-3 py-[7px] text-[13px]">
      Actualizar la investigación
    </BotonBlanco>
  );
  return (
    <Tarjeta rotulo="La investigación" titulo="Lo que Nexus encontró en la web" etiqueta="La investigación" derecha={boton}>
      {fallo && <div className="mb-2"><Alert variant="danger">{fallo}</Alert></div>}
      {corriendo ? (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[13px] text-brand">
            <IconoDeSugerencia className="h-[15px] w-[15px]" />
            {corrida?.currentPhase ?? "Investigando…"}
          </div>
          <div className="h-3 w-4/5 rounded-md bg-info-surface" />
          <div className="h-3 w-3/5 rounded-md bg-info-surface" />
          <div className="h-3 w-[70%] rounded-md bg-info-surface" />
          <p className="mt-1 text-xs leading-4 text-fg-muted">Lo que encuentre llena lo que falta de lo que trae HubSpot y propone lo demás. Lo que decidió una persona no cambia.</p>
        </div>
      ) : !inv ? (
        <div className="mt-2 flex flex-col items-start gap-2.5 rounded-[14px] border border-dashed border-line bg-surface-muted p-5">
          <p className="text-sm leading-[21px] text-fg">Nexus todavía no investigó esta empresa.</p>
          <p className="text-[13px] leading-[19px] text-fg-muted">
            Busca su sitio, noticias, contrataciones y tamaño, y deja cada fuente. Lo que no encuentra queda vacío: no inventa cifras. Llena lo que falta de lo que trae HubSpot y propone lo demás. Tarda un par de minutos.
          </p>
          {puedeDecidir && (
            <BotonBlanco onClick={onInvestigar} disabled={ocupado} className="rounded-[10px] px-3 py-[7px] text-[13px]">
              Investigar la empresa
            </BotonBlanco>
          )}
        </div>
      ) : (
        <>
          <div className="mt-0.5 text-xs leading-4 text-fg-muted">
            {fecha(inv.hechaAt)} · {inv.vencida ? <Chip tono="ambar">venció el {fecha(inv.venceAt)}</Chip> : <>vence el {fecha(inv.venceAt)}</>} · {inv.fuentes.length} {inv.fuentes.length === 1 ? "fuente" : "fuentes"}
          </div>
          {inv.resumen && <p className="mt-3 text-[13px] leading-[19px] text-fg">{inv.resumen}</p>}
          {inv.contrataciones.length > 0 && (
            <div className="mt-3">
              <p className={ROTULO_DEL_SISTEMA}>Contrataciones</p>
              {inv.contrataciones.map((c, i) => (
                <div key={c.url + c.puesto} className={`flex justify-between gap-3 py-1.5 text-[13px] leading-[19px] text-fg-secondary ${i ? "border-t border-line" : ""}`}>
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="hover:text-fg">
                    {c.puesto}
                  </a>
                  <span className="text-fg-muted">
                    {dominio(c.url).split("/")[0]}
                    {c.fecha ? ` · ${fecha(c.fecha)}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
          {inv.tamanoEstimado && (
            <div className="mt-3">
              <p className={ROTULO_DEL_SISTEMA}>Tamaño estimado</p>
              <p className="mt-1.5 text-[13px] text-fg">
                {inv.tamanoEstimado.empleados !== undefined ? <span className="tabular-nums">{inv.tamanoEstimado.empleados.toLocaleString("es-CR")} empleados</span> : inv.tamanoEstimado.rango}
                {" · "}
                <a href={inv.tamanoEstimado.url} target="_blank" rel="noopener noreferrer" className="text-fg-muted hover:text-fg">
                  {dominio(inv.tamanoEstimado.url).split("/")[0]}
                </a>
              </p>
            </div>
          )}
          {inv.fuentes.length > 0 && (
            <div className="mt-3">
              <p className={ROTULO_DEL_SISTEMA}>Fuentes</p>
              <ul className="mt-1.5 list-disc pl-[18px] text-[13px] leading-[21px]">
                {(todas ? inv.fuentes : inv.fuentes.slice(0, 3)).map((f) => (
                  <li key={f.url}>
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand-light">
                      {dominio(f.url)}
                    </a>
                  </li>
                ))}
                {!todas && inv.fuentes.length > 3 && (
                  <li className="-ml-[18px] list-none">
                    <BotonEnlace onClick={() => setTodas(true)} className="text-[13px]">
                      y {inv.fuentes.length - 3} más
                    </BotonEnlace>
                  </li>
                )}
              </ul>
            </div>
          )}
        </>
      )}
    </Tarjeta>
  );
}

// ── Cargando: la pantalla sin los datos ──────────────────────────────────────────────────────────

function Esqueleto() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="rounded-[14px] border border-line bg-surface px-3.5 py-2.5">
        <Skeleton className="h-5 w-64" />
      </div>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {GRUPOS.map((g) => (
            <section key={g.rotulo} className="rounded-xl border border-line bg-surface p-5">
              <p className={ROTULO_DEL_SISTEMA}>{g.rotulo}</p>
              <h3 className="mb-1.5 mt-1 text-base font-semibold leading-[22px] text-fg">{g.titulo}</h3>
              {g.claves.slice(0, 3).map((c) => (
                <div key={c} className="grid grid-cols-1 gap-x-4 gap-y-1 border-t border-line py-3 sm:grid-cols-[200px_minmax(0,1fr)]">
                  <span className="text-[13px] text-fg-secondary">{datoDeLaEmpresa(c).etiqueta}</span>
                  <Skeleton className="h-9 w-40" />
                </div>
              ))}
            </section>
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <section className="rounded-xl border border-line bg-surface p-5">
            <p className={ROTULO_DEL_SISTEMA}>El potencial</p>
            <h3 className="mt-1 text-base font-semibold leading-[22px] text-fg">Cuánto le podría vender Smarteam en un año</h3>
            <Skeleton className="mt-3 h-9 w-48" />
            <div className="mt-4 flex flex-col gap-2 rounded-[18px] border border-info-line p-3.5">
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </section>
          <section className="rounded-xl border border-line bg-surface p-5">
            <p className={ROTULO_DEL_SISTEMA}>La investigación</p>
            <h3 className="mt-1 text-base font-semibold leading-[22px] text-fg">Lo que Nexus encontró en la web</h3>
            <div className="mt-3 flex flex-col gap-2">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
