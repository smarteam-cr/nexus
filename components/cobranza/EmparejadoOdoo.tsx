"use client";

/**
 * components/cobranza/EmparejadoOdoo.tsx
 *
 * Decir qué cliente de Odoo es qué cuenta de Nexus. Es trabajo de una tarde que se hace una
 * sola vez, y de él depende que el espejo de facturas quede bien atribuido.
 *
 * ── POR QUÉ NO ES «CONFIRMÁ ESTAS 49 PROPUESTAS» ────────────────────────────────
 * Medido contra los datos reales: **15 de 49** cuentas tienen candidato de primera. Con 28
 * huecos, una pantalla de confirmación sería una pantalla vacía. Así que el **buscador es el
 * flujo principal** y las propuestas son el atajo.
 *
 * ⚠ Y toda propuesta muestra SU EVIDENCIA. La señal de monto acierta 8 de 9: sin ver por qué
 * se propuso, la persona no puede hacer otra cosa que aceptar todo — y el error que se cuela
 * cuelga las facturas de un cliente de la cuenta de otro.
 *
 * ── «ESTÁ EN MERCURY» (2026-09-25) ──────────────────────────────────────────────
 * Una cuenta que factura por Mercury no tiene nada que buscar en Odoo, y hasta ese día seguía en la lista
 * para siempre: 8 que ya decían Mercury y 14 internacionales con la vía de Odoo por defecto. El botón de cada
 * tarjeta cambia la VÍA DE COBRO de la cuenta —una sola verdad en todo Cobranza, decisión de Elías— y la lista
 * «En Mercury» dice quién y cuándo, con «Deshacer». La lista y todos los contadores salen de la misma regla
 * (`quedaPorEmparejar`): vía Odoo y sin cliente de Odoo.
 *
 * ── LO QUE CAMBIÓ EL 2026-09-29 (revisión con Alex) ─────────────────────────────
 * · «Actualizar lista desde Odoo» ya no está acá: la lista de clientes viaja con cada copia de Odoo, y la copia a
 *   pedido es el botón «Actualizar desde Odoo» de arriba de las pestañas (OdooClient). Esta pestaña no llama al ERP
 *   salvo por «Buscar directamente en Odoo», que aprieta una persona.
 * · Los clientes de Odoo SIN cuenta en Nexus que tienen facturas por cobrar van a la vista, con su plata. Son los
 *   mismos que «Lo que no cuadra» manda a emparejar, y hasta ese día acá no aparecían por ningún lado: las tarjetas
 *   son de cuentas de Nexus, y esos clientes no tienen cuenta.
 * · «En Mercury» se pliega: 24 cuentas ya resueltas debajo de una sola tarjeta pendiente se leían como trabajo.
 * · El buscador dice de qué cuenta es cada cliente de Odoo ANTES del clic, y puede buscar directamente en Odoo: un
 *   cliente nuevo al que todavía no se le facturó se empareja igual.
 *
 * ── 2026-09-30 ──────────────────────────────────────────────────────────────────
 * · Cada botón dice en su `title` qué hace y qué cambia en Nexus, en una frase (la capa global de tooltips lo dibuja).
 * · «Marcados como no clientes»: los que alguien marcó «No es cliente nuestro», uno por uno, con quién y cuándo, y su
 *   «Sí es cliente». Reemplaza a «Devolver el primero a la lista», que devolvía uno sin decir cuál.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, EmptyState, Input, Spinner } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { textoDeMontos, type MontoEnMoneda } from "@/lib/cobranza/odoo/diferencias";
import { fmtFecha } from "./format";

type Via = "CEDULA" | "MONTO" | "NOMBRE" | "MANUAL";
type Clase = "CEDULA" | "NOMBRE_EXACTO" | "MONTO" | "DUDOSA" | "SIN_CANDIDATO" | "INEMPAREJABLE";

interface Candidato {
  odooPartnerId: number;
  nombre: string;
  via: Via;
  evidencia: string;
}
interface Propuesta {
  cuentaId: string;
  cuentaNombre: string;
  clase: Clase;
  candidatos: Candidato[];
  /** La cuenta ya tiene un cliente de Odoo: esto propone otra ficha para la misma cuenta (etapa 12). */
  otraSociedad: boolean;
}
interface Vinculo {
  odooPartnerId: number;
  odooPartnerNombre: string;
  odooVat: string | null;
  cuentaId: string | null;
  cuentaNombre: string | null;
  via: string | null;
  ignorado: boolean;
  /** Quién lo vinculó o lo marcó «No es cliente nuestro», y cuándo. */
  confirmadoPor: string | null;
  confirmadoEn: string | null;
  /** Documentos en la copia de Odoo. 0 = todavía no se le facturó. */
  facturas: number;
  ultimaFactura: string | null;
  /** Lo que Odoo le da por cobrar, sin IVA y por moneda: la misma cifra que «Lo que no cuadra». */
  porCobrar: MontoEnMoneda[];
  facturasPorCobrar: number;
}
/** Una ficha que devolvió el buscador (`FichaEncontrada`, servicio.ts). */
interface PartnerOdoo {
  odooPartnerId: number;
  nombre: string;
  vat: string | null;
  customerRank: number;
  /** La cuenta de Nexus que ya la tiene vinculada, si la tiene. */
  vinculadaA?: string | null;
  facturas?: number;
}
/** Una cuenta de Nexus, para vincularle un cliente de Odoo desde la fila del cliente. */
interface CuentaDeNexus {
  cuentaId: string;
  nombre: string;
  /** ODOO, MERCURY u OTRA. */
  via: string;
}
/** Una cuenta sin cliente de Odoo que factura por Mercury o QuickBooks (`CuentaFueraDeOdoo` del servicio). */
interface CuentaFueraDeOdoo {
  cuentaId: string;
  nombre: string;
  via: string;
  marcadaPor: string | null;
  marcadaEn: string | null;
  origen: "IMPORTACION" | "ALTA";
  altaEn: string;
}
/** Los contadores que la página comparte con la pestaña y con «Cómo funciona». */
export interface ConteosDelEmparejado {
  cuentas: number;
  cuentasVinculadas: number;
  porEmparejar: number;
  enMercury: number;
  enOtra: number;
}
interface Estado {
  propuestas: Propuesta[];
  vinculos: Vinculo[];
  partners: PartnerOdoo[];
  conteos: ConteosDelEmparejado & {
    deOdoo: number;
    partners: number;
    partnersVinculados: number;
    partnersIgnorados: number;
    facturasLeidas: number;
  };
  fueraDeOdoo: CuentaFueraDeOdoo[];
  /** Todas las cuentas de Nexus, para vincular un cliente de Odoo a una que ya existe. */
  cuentas: CuentaDeNexus[];
}

/**
 * Cada clase dice DE DÓNDE salió la propuesta, y eso cambia cuánto hay que mirarla. La
 * cédula no tiene falsos positivos; el monto tiene uno de cada nueve.
 */
const CLASE_META: Record<Clase, { label: string; chip: string; orden: number; nota?: string }> = {
  CEDULA: { label: "Por cédula", chip: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30", orden: 0 },
  NOMBRE_EXACTO: { label: "Nombre exacto", chip: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30", orden: 1 },
  MONTO: {
    label: "Por monto",
    chip: "text-sky-600 bg-sky-500/10 border-sky-500/30",
    orden: 2,
    nota: "Acierta 8 de cada 9. Mira la evidencia antes de confirmar.",
  },
  DUDOSA: {
    label: "Nombre parecido",
    chip: "text-amber-600 bg-amber-500/10 border-amber-500/30",
    orden: 3,
    nota: "Nexus guarda el nombre comercial y Odoo la razón social: parecerse no alcanza.",
  },
  SIN_CANDIDATO: { label: "Sin candidato", chip: "text-fg-muted bg-surface-muted border-line", orden: 4 },
  INEMPAREJABLE: {
    label: "Nombre sin señal",
    chip: "text-fg-muted bg-surface-muted border-line",
    orden: 5,
    nota: "El nombre de la cuenta es demasiado corto para comparar. Búscalo a mano.",
  },
};

const VIA_LABEL: Record<string, string> = {
  CEDULA: "cédula",
  MONTO: "monto",
  NOMBRE: "nombre",
  MANUAL: "a mano",
};

/* La ayuda de cada botón que vincula (2026-09-30, pedido de Elías: qué hace y qué cambia en Nexus, en poco texto).
   Es la misma acción desde cuatro lugares, así que dice lo mismo en los cuatro. */
const TIP_ES_ESTE = "Lo vincula a esta cuenta: sus facturas de Odoo pasan a ella en Nexus. Odoo no cambia.";
const TIP_ES_ESTA = "Vincula el cliente de Odoo a esta cuenta: sus facturas de Odoo pasan a ella en Nexus. Odoo no cambia.";

/** Quién dejó la cuenta en esa vía, o de dónde venía si nadie la firmó. */
function origenDeLaVia(c: CuentaFueraDeOdoo): string {
  if (c.marcadaPor) return `Marcada por ${c.marcadaPor} el ${fmtFecha(c.marcadaEn)}`;
  return c.origen === "IMPORTACION"
    ? "Venía así de la importación, sin firma"
    : `Venía así desde el alta de la cuenta (${fmtFecha(c.altaEn)}), sin firma`;
}

export default function EmparejadoOdoo({
  puedeEditar,
  recarga = 0,
  onConteos,
  onCambio,
}: {
  /** `cobranza.write`: «Está en Mercury» y «Deshacer» cambian la vía de cobro de la cuenta. Sin él no se dibujan. */
  puedeEditar: boolean;
  /**
   * Sube cada vez que alguien aprieta «Actualizar desde Odoo» (OdooClient): la pestaña vuelve a leer, sin
   * desmontarse, así lo que tenías abierto sigue abierto.
   */
  recarga?: number;
  /** Después de cada carga: el número de la pestaña baja al marcar sin recargar la página. */
  onConteos?: (c: ConteosDelEmparejado) => void;
  /**
   * Después de cada cambio que se guardó (vincular, desvincular, «Está en Mercury», «Deshacer»…). Emparejar también
   * mueve «Lo que no cuadra»: con esto OdooClient recuenta sus filas pendientes y su número no queda viejo.
   */
  onCambio?: () => void;
}) {
  const toast = useToast();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [buscandoPara, setBuscandoPara] = useState<string | null>(null);
  const [verVinculados, setVerVinculados] = useState(false);
  const [verSinUsar, setVerSinUsar] = useState(false);
  const [verEnMercury, setVerEnMercury] = useState(false);
  const [verNoClientes, setVerNoClientes] = useState(false);
  /** El vínculo desde cuya fila se busca otra ficha para la misma cuenta. */
  const [sumandoA, setSumandoA] = useState<number | null>(null);
  /** El cliente de Odoo sin cuenta al que se le está eligiendo una cuenta de Nexus. */
  const [eligiendoCuentaPara, setEligiendoCuentaPara] = useState<number | null>(null);

  /**
   * ⚠ Esta carga NO toca el ERP: sale de la copia de facturas y de la lista de clientes ya guardadas en la base, así
   * que abrir la pantalla no cuesta ninguna autenticación.
   *
   * ⛔ Esto no es una optimización: el 2026-09-02 Odoo empezó a rechazar el usuario por
   * volumen de logins. Cada apertura de esta pantalla eran 2 autenticaciones — 4 con el doble
   * render de React en desarrollo — y ninguna hacía falta.
   */
  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setEstado(await fetchJson<Estado>("/api/cobranza/odoo/emparejado"));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cargar el emparejado.");
    } finally {
      setCargando(false);
    }
  }, [toast]);

  useEffect(() => {
    void cargar();
  }, [cargar, recarga]);

  useEffect(() => {
    if (!estado || !onConteos) return;
    const { cuentas, cuentasVinculadas, porEmparejar, enMercury, enOtra } = estado.conteos;
    onConteos({ cuentas, cuentasVinculadas, porEmparejar, enMercury, enOtra });
  }, [estado, onConteos]);

  const accion = useCallback(
    async (body: Record<string, unknown>, clave: string, exito: string) => {
      setOcupado(clave);
      try {
        const r = await fetchJson<{
          cedulaAprendida?: string | null;
          conflictoCedula?: { nexus: string; odoo: string } | null;
          otraSociedad?: { nexus: string; odoo: string } | null;
          facturasAtribuidas?: number;
          facturasDesatribuidas?: number;
        }>("/api/cobranza/odoo/emparejado", { method: "POST", body: JSON.stringify(body) });
        /* ⭐ Cuántas facturas se movieron se DICE. Hasta el 2026-09-12 vincular no movía
           ninguna —lo hacía un sync que no volvió a correr— y la pantalla decía «quedó
           vinculada» igual: diez días de trabajo sin efecto y sin una sola pista. */
        const documentos = (n: number) => `${n} ${n === 1 ? "documento" : "documentos"} de Odoo`;
        const efecto = r?.facturasAtribuidas
          ? ` Pasaron a esta cuenta ${documentos(r.facturasAtribuidas)}.`
          : r?.facturasDesatribuidas
            ? ` ${documentos(r.facturasDesatribuidas)} quedaron sin cuenta.`
            : "";
        /* ⚠ El conflicto de cédula se DICE. Es la única señal sin falsos positivos y que
           Nexus y Odoo tengan dos números distintos para el mismo cliente significa que uno
           de los dos está mal — o que el vínculo lo está. */
        if (r?.conflictoCedula) {
          toast.error(
            `Vinculado, pero las cédulas no coinciden: Nexus tiene ${r.conflictoCedula.nexus} y Odoo ${r.conflictoCedula.odoo}. No se pisó ninguna.${efecto}`,
          );
        } else if (r?.otraSociedad) {
          /* Etapa 12: una segunda cédula en una cuenta que ya tenía su cliente de Odoo es otra sociedad,
             no un error. Se dice, para que nadie salga a corregir una cédula que está bien. */
          toast.success(
            `${exito}${efecto} Quedó como otra sociedad de la cuenta: la cuenta sigue con la cédula ${r.otraSociedad.nexus} y esta ficha trae la ${r.otraSociedad.odoo}.`,
          );
        } else if (r?.cedulaAprendida) {
          toast.success(`${exito}${efecto} Se guardó la cédula ${r.cedulaAprendida} en la cuenta.`);
        } else {
          toast.success(`${exito}${efecto}`);
        }
        setBuscandoPara(null);
        setSumandoA(null);
        setEligiendoCuentaPara(null);
        await cargar();
        onCambio?.();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
      } finally {
        setOcupado(null);
      }
    },
    [cargar, toast, onCambio],
  );

  const ordenadas = useMemo(
    () => (estado?.propuestas ?? []).slice().sort((a, b) => CLASE_META[a.clase].orden - CLASE_META[b.clase].orden),
    [estado],
  );
  /* Separadas: «no queda ninguna cuenta por vincular» sigue siendo cierto aunque haya fichas para sumarle
     a una cuenta que ya tiene su cliente de Odoo. */
  const pendientes = useMemo(() => ordenadas.filter((p) => !p.otraSociedad), [ordenadas]);
  const otrasFichas = useMemo(() => ordenadas.filter((p) => p.otraSociedad), [ordenadas]);
  const vinculados = useMemo(() => (estado?.vinculos ?? []).filter((v) => v.cuentaId), [estado]);
  /* Los clientes de Odoo que ninguna cuenta de Nexus tiene. ⭐ Los que tienen facturas por cobrar van a la vista: son
     los que «Lo que no cuadra» manda a emparejar. El resto —historia y fichas sin facturas— sigue plegado, con lo más
     reciente arriba. */
  const sinCuenta = useMemo(() => (estado?.vinculos ?? []).filter((v) => !v.cuentaId && !v.ignorado), [estado]);
  const conPlata = useMemo(
    () =>
      sinCuenta
        .filter((v) => v.porCobrar.length > 0)
        /* El mismo orden que la línea de «Lo que no cuadra»: primero los dólares, y dentro de cada moneda la cifra
           más grande. ⛔ Nunca se comparan colones con dólares. */
        .sort((a, b) => {
          const [x, y] = [a.porCobrar[0]!, b.porCobrar[0]!];
          return Number(x.moneda !== "USD") - Number(y.moneda !== "USD") || y.monto - x.monto;
        }),
    [sinCuenta],
  );
  const sinUsar = useMemo(
    () =>
      sinCuenta
        .filter((v) => v.porCobrar.length === 0)
        .sort((a, b) => (b.ultimaFactura ?? "").localeCompare(a.ultimaFactura ?? "") || a.odooPartnerNombre.localeCompare(b.odooPartnerNombre, "es")),
    [sinCuenta],
  );
  const ignorados = useMemo(() => (estado?.vinculos ?? []).filter((v) => v.ignorado), [estado]);
  const enMercury = useMemo(() => (estado?.fueraDeOdoo ?? []).filter((c) => c.via === "MERCURY"), [estado]);
  const enQuickBooks = useMemo(() => (estado?.fueraDeOdoo ?? []).filter((c) => c.via !== "MERCURY"), [estado]);

  /* «Está en Mercury» y «Deshacer»: la misma acción del servidor, con la vía que se pide. */
  const marcarVia = (cuentaId: string, nombre: string, via: "MERCURY" | "ODOO") =>
    accion(
      { accion: "via", cuentaId, via },
      `v${cuentaId}`,
      via === "MERCURY"
        ? `${nombre} quedó en Mercury: salió de la lista y su vía de cobro es Mercury en todo Cobranza.`
        : `${nombre} vuelve a la lista para emparejar: su vía de cobro es Odoo otra vez.`,
    );

  /* Desde la fila de un cliente de Odoo sin cuenta: vincularlo a una cuenta que ya existe, o marcarlo ajeno. Es el
     mismo «confirmar» que usa la tarjeta de la cuenta, empezado desde el otro lado. */
  const vincularACuenta = (v: Vinculo, cuenta: CuentaDeNexus) =>
    accion(
      { accion: "confirmar", odooPartnerId: v.odooPartnerId, cuentaId: cuenta.cuentaId, via: "MANUAL", aprenderCedula: true },
      `p${v.odooPartnerId}`,
      `«${v.odooPartnerNombre}» quedó vinculado a ${cuenta.nombre}.`,
    );
  const ignorar = (v: Vinculo) =>
    accion(
      { accion: "ignorar", odooPartnerId: v.odooPartnerId, ignorado: true },
      `p${v.odooPartnerId}`,
      `«${v.odooPartnerNombre}» quedó en «Marcados como no clientes», al final.`,
    );
  /* El camino de vuelta, uno por uno (punto 7 de la revisión con Alex, 2026-09-30). */
  const esCliente = (v: Vinculo) =>
    accion(
      { accion: "ignorar", odooPartnerId: v.odooPartnerId, ignorado: false },
      `p${v.odooPartnerId}`,
      `«${v.odooPartnerNombre}» vuelve a la lista de clientes de Odoo sin cuenta.`,
    );

  if (cargando && !estado) {
    return (
      <div className="flex items-center gap-3 py-16 text-sm text-fg-muted">
        <Spinner /> Cargando…
      </div>
    );
  }
  if (!estado) return <EmptyState title="No se pudo cargar" description="Prueba de nuevo en un momento." />;

  const { conteos } = estado;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
        <span className="text-fg">
          <strong className="text-lg tabular-nums">{conteos.cuentasVinculadas}</strong>
          <span className="text-fg-muted"> de {conteos.cuentas} cuentas vinculadas</span>
          {/* Las que no se emparejan porque facturan por otra vía: sin esto «27 de 56» parecía trabajo pendiente. */}
          {conteos.enMercury > 0 && <span className="text-fg-muted"> · {conteos.enMercury} en Mercury</span>}
          {conteos.enOtra > 0 && <span className="text-fg-muted"> · {conteos.enOtra} en QuickBooks</span>}
        </span>
        <span className="text-fg-muted">
          {conteos.partners} clientes en Odoo · {conteos.partnersIgnorados} marcados como no clientes
        </span>
        {conteos.facturasLeidas > 0 && (
          <span className="text-fg-muted">{conteos.facturasLeidas} facturas de la copia de Odoo para proponer</span>
        )}
        {/* La lista de clientes ya no se actualiza acá: viaja con «Actualizar desde Odoo», arriba, junto con las
            facturas. Se dice, para quien busque el botón que estaba en esta fila. */}
        <span className="ml-auto text-xs text-fg-muted">
          ¿Falta un cliente nuevo de Odoo? «Actualizar desde Odoo», arriba, lo trae.
        </span>
      </div>

      {pendientes.length === 0 ? (
        <EmptyState
          title="No queda ninguna cuenta por vincular"
          description="Todas las cuentas que facturan por Odoo tienen su cliente de Odoo. Cada factura que llega de Odoo cae en su cuenta."
        />
      ) : (
        <div className="space-y-2">
          {pendientes.map((p) => (
            <FilaCuenta
              key={p.cuentaId}
              propuesta={p}
              ocupado={ocupado === p.cuentaId}
              buscando={buscandoPara === p.cuentaId}
              onBuscar={() => setBuscandoPara(buscandoPara === p.cuentaId ? null : p.cuentaId)}
              onConfirmar={(odooPartnerId, via) =>
                accion(
                  { accion: "confirmar", odooPartnerId, cuentaId: p.cuentaId, via, aprenderCedula: true },
                  p.cuentaId,
                  `${p.cuentaNombre} quedó vinculada.`,
                )
              }
              mercury={
                puedeEditar
                  ? {
                      ocupado: ocupado === `v${p.cuentaId}`,
                      onMarcar: () => void marcarVia(p.cuentaId, p.cuentaNombre, "MERCURY"),
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {/* ⭐ Etapa 12 (H10): una cuenta que ya tiene su cliente de Odoo sigue pudiendo sumar otro. Hasta el
          2026-09-13 desaparecía de la lista, y la segunda ficha de la misma empresa quedaba sin dueño. */}
      {otrasFichas.length > 0 && (
        <div className="space-y-2">
          <div>
            <h3 className="text-sm font-medium text-fg">
              Otra ficha de Odoo para una cuenta ya vinculada ({otrasFichas.length})
            </h3>
            <p className="text-xs text-fg-muted">
              Una ficha libre con la misma cédula o el mismo nombre que una cuenta que ya tiene su cliente de Odoo. Si
              es otra sociedad de la misma empresa, o la misma empresa cargada dos veces en Odoo, vincúlala también:
              sus facturas pasan a esa cuenta. Si es una ficha vacía, márcala «No es cliente nuestro» más abajo.
            </p>
          </div>
          {otrasFichas.map((p) => (
            <FilaCuenta
              key={p.cuentaId}
              propuesta={p}
              ocupado={ocupado === p.cuentaId}
              buscando={buscandoPara === p.cuentaId}
              onBuscar={() => setBuscandoPara(buscandoPara === p.cuentaId ? null : p.cuentaId)}
              onConfirmar={(odooPartnerId, via) =>
                accion(
                  { accion: "confirmar", odooPartnerId, cuentaId: p.cuentaId, via, aprenderCedula: true },
                  p.cuentaId,
                  `Otra ficha de Odoo sumada a ${p.cuentaNombre}.`,
                )
              }
              /* ⛔ Ya tiene cliente de Odoo: el servidor no la marca en Mercury (`decidirMarcaDeMercury`) y el
                 rechazo explica por qué y qué hacer. El mensaje vive en un solo lugar, el servidor. */
              mercury={
                puedeEditar
                  ? {
                      ocupado: ocupado === `v${p.cuentaId}`,
                      onMarcar: () => void marcarVia(p.cuentaId, p.cuentaNombre, "MERCURY"),
                      titulo:
                        "Ya tiene un cliente de Odoo vinculado: Nexus no la marca en Mercury sin que antes desvincules ese cliente en «Ya vinculadas».",
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {/* ⭐ 2026-09-29. Los clientes de Odoo con facturas por cobrar que ninguna cuenta de Nexus tiene. A la vista, no
          plegados: son exactamente los que «Lo que no cuadra» manda a emparejar, con la misma cifra. Hasta ese día el
          botón «Ir a emparejar» traía a una pestaña donde no aparecían (Publimark, McCann, Aditec…). */}
      {conPlata.length > 0 && (
        <div className="rounded-lg border border-line bg-surface">
          <div className="px-4 py-2.5">
            <h3 className="text-sm font-medium text-fg">
              Clientes de Odoo con facturas por cobrar y sin cuenta en Nexus ({conPlata.length})
            </h3>
            <p className="mt-0.5 text-xs text-fg-muted">
              Odoo les facturó, siguen sin pagar y ninguna cuenta de Nexus los tiene: por eso salen en «Lo que no
              cuadra». Si la empresa ya tiene cuenta —con su nombre comercial, o porque factura con varias razones
              sociales—, vincúlalo a esa cuenta: sus facturas pasan a ella en el momento. Si todavía no tiene cuenta,
              créala en Cobranza, con «Nueva empresa», y vuelve a vincularlo.
            </p>
          </div>
          <div className="border-t border-line px-4 py-1">
            {conPlata.map((v) => (
              <FilaDeClienteDeOdoo
                key={v.odooPartnerId}
                cliente={v}
                cuentas={estado.cuentas}
                ocupado={ocupado === `p${v.odooPartnerId}`}
                eligiendo={eligiendoCuentaPara === v.odooPartnerId}
                onElegir={() => setEligiendoCuentaPara(eligiendoCuentaPara === v.odooPartnerId ? null : v.odooPartnerId)}
                onVincular={(cuenta) => vincularACuenta(v, cuenta)}
                onIgnorar={() => ignorar(v)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Plegada desde el 2026-09-29: 24 cuentas ya resueltas debajo de una sola tarjeta pendiente se leían como
          trabajo por hacer («me muestra cuentas que ya se emparejaron»). El título dice cuántas son, se abre con un
          clic y cada una sigue diciendo quién la sacó y cuándo, con su «Deshacer». */}
      {(enMercury.length > 0 || enQuickBooks.length > 0) && (
        <Seccion
          titulo={`En Mercury (${enMercury.length})${enQuickBooks.length > 0 ? ` · en QuickBooks (${enQuickBooks.length})` : ""}`}
          abierta={verEnMercury}
          onToggle={() => setVerEnMercury((v) => !v)}
          nota="Facturan por Mercury, no por Odoo: no se emparejan y Nexus no les busca facturas en Odoo. «Deshacer» devuelve su vía de cobro a Odoo y la cuenta vuelve a la lista para emparejar, con todo lo que tenía."
        >
          {enMercury.map((c) => (
            <div
              key={c.cuentaId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2 last:border-0"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg" title={c.nombre}>
                {c.nombre}
              </span>
              <span className="text-xs text-fg-muted">{origenDeLaVia(c)}</span>
              {puedeEditar && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={ocupado === `v${c.cuentaId}`}
                  onClick={() => void marcarVia(c.cuentaId, c.nombre, "ODOO")}
                  title="Su vía de cobro vuelve a Odoo y la cuenta vuelve a la lista para emparejar."
                >
                  {ocupado === `v${c.cuentaId}` ? "Guardando…" : "Deshacer"}
                </Button>
              )}
            </div>
          ))}
          {/* QuickBooks no tiene botón: se elige en la ficha de la cuenta. Se nombran para que ninguna cuenta
              desaparezca de la pantalla sin decir por qué. */}
          {enQuickBooks.length > 0 && (
            <p className="pt-2 text-xs text-fg-muted">
              {enQuickBooks.length === 1 ? "Una cuenta factura" : `${enQuickBooks.length} cuentas facturan`} por
              QuickBooks y tampoco se emparejan: {enQuickBooks.map((c) => c.nombre).join(", ")}. Su vía de cobro se
              cambia en la ficha de la cuenta.
            </p>
          )}
        </Seccion>
      )}

      <Seccion
        titulo={`Otros clientes de Odoo sin cuenta en Nexus (${sinUsar.length})`}
        abierta={verSinUsar}
        onToggle={() => setVerSinUsar((v) => !v)}
        nota="No tienen nada por cobrar: son historia ya pagada, o clientes nuevos a los que todavía no se les facturó. Los de facturas más recientes van primero. Vincula el que sea de una cuenta de Nexus, y marca los que no son clientes nuestros para que dejen de aparecer."
      >
        {sinUsar.map((v) => (
          <FilaDeClienteDeOdoo
            key={v.odooPartnerId}
            cliente={v}
            cuentas={estado.cuentas}
            ocupado={ocupado === `p${v.odooPartnerId}`}
            eligiendo={eligiendoCuentaPara === v.odooPartnerId}
            onElegir={() => setEligiendoCuentaPara(eligiendoCuentaPara === v.odooPartnerId ? null : v.odooPartnerId)}
            onVincular={(cuenta) => vincularACuenta(v, cuenta)}
            onIgnorar={() => ignorar(v)}
          />
        ))}
      </Seccion>

      <Seccion
        titulo={`Ya vinculadas (${vinculados.length})`}
        abierta={verVinculados}
        onToggle={() => setVerVinculados((v) => !v)}
        nota="Una cuenta puede tener más de un cliente de Odoo: otra sociedad de la misma empresa, o la misma empresa cargada dos veces. «Sumar otra ficha» la agrega sin soltar la que ya tiene."
      >
        {vinculados.map((v) => {
          const cuentaId = v.cuentaId;
          if (!cuentaId) return null;
          const clave = `s${v.odooPartnerId}`;
          return (
            <div key={v.odooPartnerId} className="border-b border-line py-2 last:border-0">
              <div className="flex items-center gap-3">
                <span className="w-48 shrink-0 truncate text-sm font-medium text-fg">{v.cuentaNombre}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-fg-secondary" title={v.odooPartnerNombre}>
                  {v.odooPartnerNombre}
                </span>
                {v.via && (
                  <Badge className="shrink-0 text-xs">
                    {VIA_LABEL[v.via] ?? v.via.toLowerCase()}
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSumandoA(sumandoA === v.odooPartnerId ? null : v.odooPartnerId)}
                  title="Vincula otro cliente de Odoo a esta misma cuenta, sin soltar este: sus facturas también caen en ella."
                >
                  {sumandoA === v.odooPartnerId ? "Cerrar" : "Sumar otra ficha"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={ocupado === `p${v.odooPartnerId}`}
                  onClick={() =>
                    accion({ accion: "desvincular", odooPartnerId: v.odooPartnerId }, `p${v.odooPartnerId}`, "Desvinculado.")
                  }
                  title="Separa este cliente de Odoo de la cuenta: sus facturas quedan sin cuenta en Nexus. Los cobros no cambian."
                >
                  Desvincular
                </Button>
              </div>
              {sumandoA === v.odooPartnerId && (
                <Buscador
                  ocupado={ocupado === clave}
                  onElegir={(odooPartnerId) =>
                    accion(
                      { accion: "confirmar", odooPartnerId, cuentaId, via: "MANUAL", aprenderCedula: true },
                      clave,
                      `Otra ficha de Odoo sumada a ${v.cuentaNombre ?? "la cuenta"}.`,
                    )
                  }
                />
              )}
            </div>
          );
        })}
      </Seccion>

      {/* ⭐ Punto 7 de la revisión con Alex (2026-09-30): los marcados «No es cliente nuestro», uno por uno, con quién
          los marcó y su «Sí es cliente». Hasta ese día solo se podía devolver «el primero» de la lista, sin ver cuál era,
          y una empresa marcada por error no tenía forma de volver. */}
      {ignorados.length > 0 && (
        <Seccion
          titulo={`Marcados como no clientes (${ignorados.length})`}
          abierta={verNoClientes}
          onToggle={() => setVerNoClientes((v) => !v)}
          nota="No aparecen en las listas ni en las propuestas. Sus facturas siguen en la copia de Odoo: no se borró nada. «Sí es cliente» lo devuelve a la lista de clientes de Odoo sin cuenta, para vincularlo."
        >
          {ignorados.map((v) => (
            <div
              key={v.odooPartnerId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-fg" title={v.odooPartnerNombre}>
                  {v.odooPartnerNombre}
                </div>
                <div className={`text-xs ${v.porCobrar.length > 0 ? "text-warn-ink" : "text-fg-muted"}`}>
                  {loQueTieneEnOdoo(v)}
                  {v.confirmadoPor && ` · lo marcó ${v.confirmadoPor}${v.confirmadoEn ? ` el ${fmtFecha(v.confirmadoEn)}` : ""}`}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={ocupado === `p${v.odooPartnerId}`}
                onClick={() => esCliente(v)}
                title="Vuelve a la lista de clientes de Odoo sin cuenta, para vincularlo. No cambia nada más."
              >
                {ocupado === `p${v.odooPartnerId}` ? "Guardando…" : "Sí es cliente"}
              </Button>
            </div>
          ))}
        </Seccion>
      )}
    </div>
  );
}

/* ── Una cuenta pendiente ────────────────────────────────────────────────────────── */

function FilaCuenta({
  propuesta,
  ocupado,
  buscando,
  onBuscar,
  onConfirmar,
  mercury,
}: {
  propuesta: Propuesta;
  ocupado: boolean;
  buscando: boolean;
  onBuscar: () => void;
  onConfirmar: (odooPartnerId: number, via: Via) => void;
  /**
   * «Está en Mercury». undefined = sin permiso de edición, no se dibuja. `titulo` reemplaza la explicación del
   * botón (la tarjeta de una cuenta que ya tiene cliente de Odoo avisa que se va a rechazar).
   */
  mercury?: { ocupado: boolean; onMarcar: () => void; titulo?: string };
}) {
  const meta = CLASE_META[propuesta.clase];
  const principal = propuesta.candidatos[0];

  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-fg">{propuesta.cuentaNombre}</span>
        <span className={`rounded-full border px-2 py-0.5 text-xs ${meta.chip}`}>{meta.label}</span>
        {propuesta.otraSociedad && (
          <span className="rounded-full border border-line bg-surface-muted px-2 py-0.5 text-xs text-fg-secondary">
            Ya tiene un cliente de Odoo
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {mercury && (
            <Button
              variant="ghost"
              size="sm"
              disabled={mercury.ocupado || ocupado}
              onClick={mercury.onMarcar}
              title={
                mercury.titulo ??
                "Factura por Mercury, no por Odoo: su vía de cobro pasa a Mercury en Cobranza y sale de esta lista. Se deshace en «En Mercury»."
              }
            >
              {mercury.ocupado ? "Guardando…" : "Está en Mercury"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onBuscar}
            title="Busca a mano, por nombre o cédula, el cliente de Odoo de esta cuenta. Buscar no cambia nada."
          >
            {buscando ? "Cerrar" : "Buscar en Odoo"}
          </Button>
        </div>
      </div>

      {meta.nota && <p className="mt-1 text-xs text-fg-muted">{meta.nota}</p>}

      {principal && (
        <div className="mt-2 flex flex-wrap items-start gap-3 rounded-md bg-surface-muted p-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-fg" title={principal.nombre}>
              {principal.nombre}
            </div>
            {/* La evidencia no es decoración: es lo único que le permite a la persona
                distinguir un acierto de un monto que dos clientes comparten. */}
            <div className="mt-0.5 text-xs text-fg-muted">{principal.evidencia}</div>
          </div>
          <Button
            size="sm"
            disabled={ocupado}
            onClick={() => onConfirmar(principal.odooPartnerId, principal.via)}
            title={TIP_ES_ESTE}
          >
            {ocupado ? "Guardando…" : "Es este"}
          </Button>
        </div>
      )}

      {propuesta.candidatos.length > 1 && (
        <div className="mt-2 space-y-1">
          {propuesta.candidatos.slice(1).map((c) => (
            <div key={c.odooPartnerId} className="flex items-center gap-3 pl-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-fg-secondary" title={c.evidencia}>
                {c.nombre}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={ocupado}
                onClick={() => onConfirmar(c.odooPartnerId, c.via)}
                title={TIP_ES_ESTE}
              >
                Es este
              </Button>
            </div>
          ))}
        </div>
      )}

      {buscando && <Buscador ocupado={ocupado} onElegir={(id) => onConfirmar(id, "MANUAL")} />}
    </div>
  );
}

/* ── Un cliente de Odoo que ninguna cuenta tiene ─────────────────────────────────── */

/** Lo que el cliente tiene en Odoo, en una frase: la plata por cobrar, su historia, o que todavía no se le facturó. */
function loQueTieneEnOdoo(v: Vinculo): string {
  if (v.porCobrar.length > 0) {
    return `${v.facturasPorCobrar === 1 ? "1 factura" : `${v.facturasPorCobrar} facturas`} por cobrar · ${textoDeMontos(v.porCobrar)} sin IVA`;
  }
  if (v.facturas === 0) return "Sin facturas todavía";
  return `${v.facturas === 1 ? "1 documento" : `${v.facturas} documentos`}, nada por cobrar · el último, del ${fmtFecha(v.ultimaFactura)}`;
}

/**
 * La fila de un cliente de Odoo sin cuenta en Nexus: qué tiene en Odoo y las dos salidas —es de una cuenta que ya
 * existe, o no es cliente nuestro—. El vínculo es el mismo de la tarjeta de la cuenta, empezado desde el otro lado.
 */
function FilaDeClienteDeOdoo({
  cliente,
  cuentas,
  ocupado,
  eligiendo,
  onElegir,
  onVincular,
  onIgnorar,
}: {
  cliente: Vinculo;
  cuentas: readonly CuentaDeNexus[];
  ocupado: boolean;
  /** El selector de cuenta de esta fila está abierto. */
  eligiendo: boolean;
  onElegir: () => void;
  onVincular: (cuenta: CuentaDeNexus) => void;
  onIgnorar: () => void;
}) {
  return (
    <div className="border-b border-line py-2 last:border-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-fg" title={cliente.odooPartnerNombre}>
            {cliente.odooPartnerNombre}
          </div>
          <div className={`text-xs ${cliente.porCobrar.length > 0 ? "text-fg-secondary" : "text-fg-muted"}`}>
            {loQueTieneEnOdoo(cliente)}
            {cliente.odooVat && <span className="font-mono"> · {cliente.odooVat}</span>}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={ocupado}
          onClick={onElegir}
          title="Elige la cuenta de Nexus de este cliente: sus facturas de Odoo pasan a esa cuenta."
        >
          {eligiendo ? "Cerrar" : "Es de una cuenta de Nexus"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={ocupado}
          onClick={onIgnorar}
          title="Deja de aparecer en esta lista y en las propuestas. No borra nada: se devuelve desde «Marcados como no clientes»."
        >
          No es cliente nuestro
        </Button>
      </div>
      {eligiendo && <SelectorDeCuenta cuentas={cuentas} ocupado={ocupado} onElegir={onVincular} />}
    </div>
  );
}

/** Elegir una cuenta de Nexus por su nombre. Son unas sesenta: se filtran acá, sin ir al servidor. */
function SelectorDeCuenta({
  cuentas,
  ocupado,
  onElegir,
}: {
  cuentas: readonly CuentaDeNexus[];
  ocupado: boolean;
  onElegir: (cuenta: CuentaDeNexus) => void;
}) {
  const [q, setQ] = useState("");
  const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const buscada = sinTildes(q.trim());
  const hits = buscada.length < 2 ? [] : cuentas.filter((c) => sinTildes(c.nombre).includes(buscada)).slice(0, 8);
  return (
    <div className="mt-2 rounded-md border border-line p-2">
      <Input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Nombre de la cuenta en Nexus…"
        className="text-sm"
      />
      {buscada.length >= 2 && hits.length === 0 && (
        <p className="mt-2 text-xs text-fg-muted">
          Ninguna cuenta de Nexus se llama así. Si la empresa todavía no tiene cuenta, créala en Cobranza, con «Nueva
          empresa», y vuelve acá.
        </p>
      )}
      <div className="mt-1 max-h-56 overflow-y-auto">
        {hits.map((c) => (
          <div key={c.cuentaId} className="flex items-center gap-3 border-b border-line py-1.5 last:border-0">
            <span className="min-w-0 flex-1 truncate text-sm text-fg" title={c.nombre}>
              {c.nombre}
            </span>
            {c.via !== "ODOO" && (
              <span className="shrink-0 text-xs text-fg-muted">factura por {c.via === "MERCURY" ? "Mercury" : "QuickBooks"}</span>
            )}
            <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => onElegir(c)} title={TIP_ES_ESTA}>
              {ocupado ? "Guardando…" : "Es esta"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── El buscador, que es el flujo principal ──────────────────────────────────────── */

function Buscador({ ocupado, onElegir }: { ocupado: boolean; onElegir: (odooPartnerId: number) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PartnerOdoo[]>([]);
  const [buscando, setBuscando] = useState(false);
  /* ⭐ «Buscar directamente en Odoo» (2026-09-29): lo que devolvió el ERP para lo que está escrito, y si falló. Se
     limpia al cambiar el texto: son resultados de OTRA búsqueda. */
  const [deOdoo, setDeOdoo] = useState<{ para: string; fichas: PartnerOdoo[]; error: string | null } | null>(null);
  const [buscandoEnOdoo, setBuscandoEnOdoo] = useState(false);

  useEffect(() => {
    setDeOdoo(null);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    /* Se espera a que dejen de escribir: una consulta por tecla contra 82 filas es gratis de
       escribir y cara de sostener. */
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await fetchJson<{ partners: PartnerOdoo[] }>(
          `/api/cobranza/odoo/emparejado?q=${encodeURIComponent(q)}`,
        );
        setHits(r.partners);
      } catch {
        setHits([]);
      } finally {
        setBuscando(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  /* ⚠ Esta SÍ consulta el ERP, y por eso la manda un botón y no cada tecla. */
  const buscarEnOdoo = async () => {
    const para = q.trim();
    setBuscandoEnOdoo(true);
    try {
      const r = await fetchJson<{ partners: PartnerOdoo[]; errorOdoo: string | null }>(
        `/api/cobranza/odoo/emparejado?q=${encodeURIComponent(para)}&enOdoo=1`,
      );
      setDeOdoo({ para, fichas: r.partners, error: r.errorOdoo });
    } catch (e) {
      setDeOdoo({ para, fichas: [], error: e instanceof ApiError ? e.message : "No se pudo consultar Odoo." });
    } finally {
      setBuscandoEnOdoo(false);
    }
  };

  const enLaLista = new Set(hits.map((p) => p.odooPartnerId));
  const soloEnOdoo = (deOdoo?.fichas ?? []).filter((p) => !enLaLista.has(p.odooPartnerId));
  const fila = (p: PartnerOdoo) => (
    <div key={p.odooPartnerId} className="flex items-center gap-3 border-b border-line py-1.5 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-fg" title={p.nombre}>
          {p.nombre}
        </div>
        {/* De quién es, ANTES del clic: hasta el 2026-09-29 se podía elegir el cliente de otra cuenta y recién ahí
            aparecía el rechazo. */}
        {(p.vinculadaA || p.facturas === 0) && (
          <div className="text-xs text-fg-muted">
            {p.vinculadaA ? `Ya es de la cuenta «${p.vinculadaA}»` : "Sin facturas todavía"}
          </div>
        )}
      </div>
      {p.vat && <span className="shrink-0 font-mono text-xs text-fg-muted">{p.vat}</span>}
      <Button
        variant="ghost"
        size="sm"
        disabled={ocupado || !!p.vinculadaA}
        title={
          p.vinculadaA
            ? `Un cliente de Odoo va en una sola cuenta, y este ya es de «${p.vinculadaA}». Si es la misma empresa, el servicio nuevo se agrega en esa cuenta.`
            : TIP_ES_ESTE
        }
        onClick={() => onElegir(p.odooPartnerId)}
      >
        Es este
      </Button>
    </div>
  );

  return (
    <div className="mt-2 rounded-md border border-line p-2">
      <Input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Nombre o cédula del cliente en Odoo…"
        className="text-sm"
      />
      {buscando && <p className="mt-2 text-xs text-fg-muted">Buscando…</p>}
      {!buscando && q.trim().length >= 2 && hits.length === 0 && (
        <p className="mt-2 text-xs text-fg-muted">
          Nada con ese nombre ni esa cédula en la lista guardada. Odoo puede tenerlo con la razón social completa, o
          ser un cliente nuevo: búscalo directamente en Odoo.
        </p>
      )}
      <div className="mt-1 max-h-56 overflow-y-auto">{hits.map(fila)}</div>

      {q.trim().length >= 3 && (
        <div className="mt-2 border-t border-line pt-2">
          {deOdoo?.para !== q.trim() && (
            <Button
              variant="ghost"
              size="sm"
              disabled={buscandoEnOdoo}
              onClick={() => void buscarEnOdoo()}
              title="Pregunta a Odoo ahora, por si el cliente es nuevo y todavía no está en la lista. Solo lee Odoo."
            >
              {buscandoEnOdoo ? "Consultando Odoo…" : `Buscar «${q.trim()}» directamente en Odoo`}
            </Button>
          )}
          {deOdoo?.para === q.trim() && deOdoo.error && (
            <p className="text-xs text-danger-ink">No se pudo consultar Odoo: {deOdoo.error}</p>
          )}
          {deOdoo?.para === q.trim() && !deOdoo.error && soloEnOdoo.length === 0 && (
            <p className="text-xs text-fg-muted">
              Odoo no tiene ningún otro cliente con ese nombre ni esa cédula. Si lo acaban de crear, revisa cómo quedó
              escrito en Odoo.
            </p>
          )}
          {soloEnOdoo.length > 0 && (
            <>
              <p className="text-xs text-fg-muted">
                En Odoo y todavía fuera de la lista guardada. Al elegir uno, entra a la lista y queda vinculado:
              </p>
              <div className="mt-1 max-h-56 overflow-y-auto">{soloEnOdoo.map(fila)}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Una sección plegable ────────────────────────────────────────────────────────── */

function Seccion({
  titulo,
  abierta,
  onToggle,
  nota,
  children,
}: {
  titulo: string;
  abierta: boolean;
  onToggle: () => void;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-fg hover:bg-surface-hover"
      >
        <span className="text-fg-muted">{abierta ? "▾" : "▸"}</span>
        {titulo}
      </button>
      {abierta && (
        <div className="border-t border-line px-4 py-2">
          {nota && <p className="pb-2 text-xs text-fg-muted">{nota}</p>}
          {children}
        </div>
      )}
    </div>
  );
}
