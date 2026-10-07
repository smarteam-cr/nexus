"use client";

/**
 * «Nueva pregunta» (Feedback › Encuestas, 2026-10-06): qué quieres saber, sobre qué pantalla, a quién y hasta cuándo,
 * y abajo la burbuja tal como le aparece a cada persona. Reemplaza al formulario que vivía en el panel: ahí no se veía
 * qué iba a recibir la gente (diseño «Feedback · Encuestas (v2)»).
 *
 * Se monta abierto y con `key` cada vez que se abre: así arranca limpio o con lo que trae quien lo abrió (las personas
 * marcadas en Personas, «Preguntarle» de alguien que no reporta, una de las ideas para empezar).
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import DatePickerField from "@/components/ui/DatePickerField";
import { Drawer } from "@/components/ui/Drawer";
import { Field } from "@/components/ui/Field";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { APP_NAV } from "@/components/layout/nav-config";
import { cn } from "@/lib/cn";
import { IDEAS_DE_PREGUNTA } from "@/lib/feedback/encuestas";
import type { PersonaParaPreguntar } from "@/lib/feedback/queries";
import { fechaCorta } from "@/lib/feedback/reglas";
import { CuerpoDelPedido } from "../PedidoDeOpinion";

/** Las pantallas que se pueden elegir: las del menú, con sus hijos. */
function pantallasDelMenu(): { nombre: string; ruta: string }[] {
  const salida: { nombre: string; ruta: string }[] = [];
  for (const item of APP_NAV) {
    if (item.key === "feedback") continue;
    if (item.children?.length) {
      for (const h of item.children) salida.push({ nombre: `${item.label} › ${h.label}`, ruta: h.href });
    } else {
      salida.push({ nombre: item.label, ruta: item.href });
    }
  }
  return salida;
}

/** «2026-10-14», en la fecha local. */
export function enDias(dias: number, desde: Date = new Date()): string {
  const d = new Date(desde);
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Plazo = "3" | "7" | "14" | "otra";
const PLAZOS: readonly { clave: Exclude<Plazo, "otra">; etiqueta: string; dias: number }[] = [
  { clave: "3", etiqueta: "3 días", dias: 3 },
  { clave: "7", etiqueta: "Una semana", dias: 7 },
  { clave: "14", etiqueta: "Dos semanas", dias: 14 },
];

/** Lo que admite el servidor (lib/feedback/schema.ts › CrearPedido). */
const MAXIMO_DE_PERSONAS = 20;

const PASO = "text-[13px] font-semibold text-fg";

export default function NuevaPregunta({
  equipo,
  paraInicial,
  preguntaInicial,
  deQuien,
  onCerrar,
}: {
  equipo: readonly PersonaParaPreguntar[];
  paraInicial: readonly string[];
  preguntaInicial: string;
  /** Quien pregunta, como lo lee la persona en la burbuja. */
  deQuien: string;
  onCerrar: (enviada: boolean) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const pantallas = useMemo(pantallasDelMenu, []);
  const porEmail = useMemo(() => new Map(equipo.map((m) => [m.email, m])), [equipo]);
  const [pregunta, setPregunta] = useState(preguntaInicial);
  const [ruta, setRuta] = useState(pantallas[0]?.ruta ?? "/clients");
  const [para, setPara] = useState<string[]>(() => paraInicial.filter((e) => porEmail.has(e)));
  const [busqueda, setBusqueda] = useState("");
  const [plazo, setPlazo] = useState<Plazo>("7");
  const [otraFecha, setOtraFecha] = useState(enDias(7));
  const [guardando, setGuardando] = useState(false);

  const hasta = plazo === "otra" ? otraFecha : enDias(PLAZOS.find((p) => p.clave === plazo)!.dias);
  const elegidos = para.map((e) => porEmail.get(e)).filter((m): m is PersonaParaPreguntar => !!m);
  const q = busqueda.trim().toLowerCase();
  const visibles = q ? equipo.filter((m) => `${m.nombre} ${m.rol}`.toLowerCase().includes(q)) : equipo;
  const demasiados = elegidos.length > MAXIMO_DE_PERSONAS;
  const listo = elegidos.length > 0 && !demasiados && pregunta.trim().length >= 5 && !!hasta && !guardando;

  const alternar = (email: string) => setPara((ps) => (ps.includes(email) ? ps.filter((e) => e !== email) : [...ps, email]));

  const enviar = async () => {
    if (!listo) return;
    setGuardando(true);
    try {
      const pantalla = pantallas.find((p) => p.ruta === ruta)?.nombre ?? ruta;
      const r = await fetch("/api/feedback/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paraEmails: elegidos.map((m) => m.email), pantalla, ruta, pregunta: pregunta.trim(), hasta }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => null)) as { error?: string } | null;
        toast.error(d?.error ?? "No se pudo mandar la pregunta.");
        return;
      }
      toast.success(
        elegidos.length === 1
          ? `Listo: a ${elegidos[0].nombre.split(" ")[0]} le aparece al entrar a «${pantalla}».`
          : `Listo: les aparece a ${elegidos.length} personas al entrar a «${pantalla}».`,
      );
      onCerrar(true);
      router.refresh();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Drawer
      open
      onClose={() => onCerrar(false)}
      title="Nueva pregunta"
      description="Le aparece a cada persona al entrar a la pantalla que elijas."
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center gap-3">
          <span className="min-w-0 flex-1 text-xs text-fg-muted">No le llega correo. Lo que conteste llega a tu Bandeja.</span>
          <button type="button" onClick={() => onCerrar(false)} className="rounded px-2.5 py-2 text-[13px] text-fg-muted hover:text-fg">
            Cancelar
          </button>
          <Button variant="primary" className="px-4 font-semibold" disabled={!listo} loading={guardando} onClick={() => void enviar()}>
            {elegidos.length === 0
              ? "Enviar la pregunta"
              : elegidos.length === 1
                ? `Enviársela a ${elegidos[0].nombre.split(" ")[0]}`
                : `Enviársela a ${elegidos.length} personas`}
          </Button>
        </div>
      }
    >
      <div className="space-y-[22px] py-1">
        <div className="space-y-2">
          <Field label="1 · ¿Qué quieres saber?" labelClassName={PASO}>
            <Textarea
              value={pregunta}
              onChange={(e) => setPregunta(e.target.value)}
              rows={3}
              placeholder="Una pregunta concreta, sobre algo que la persona hace todas las semanas"
              className="resize-y rounded-lg px-3 py-2 text-sm leading-[1.45]"
            />
          </Field>
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-fg-muted">Ideas:</span>
            {IDEAS_DE_PREGUNTA.map((i) => (
              <button
                key={i.corta}
                type="button"
                onClick={() => setPregunta(i.texto)}
                title={i.texto}
                className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs text-fg-secondary transition-colors hover:border-info-line hover:bg-info-surface"
              >
                {i.corta}
              </button>
            ))}
          </p>
        </div>

        <Field
          label="2 · ¿Sobre qué pantalla?"
          labelClassName={PASO}
          hint="Le aparece cuando entra ahí. Si no entra, no la ve: elige una pantalla que use."
        >
          <Select value={ruta} onChange={(e) => setRuta(e.target.value)} className="bg-surface text-sm">
            {pantallas.map((p) => (
              <option key={p.ruta} value={p.ruta}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </Field>

        <div className="space-y-2">
          <p className={PASO}>3 · ¿A quién?</p>
          {elegidos.length > 0 && (
            <p className="flex flex-wrap gap-1.5">
              {elegidos.map((m) => (
                <span
                  key={m.email}
                  className="inline-flex items-center gap-1.5 rounded-full border border-info-line bg-info-surface py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-fg"
                >
                  {m.nombre}
                  <button type="button" aria-label={`Quitar a ${m.nombre}`} onClick={() => alternar(m.email)} className="px-0.5 text-fg-muted hover:text-fg">
                    ✕
                  </button>
                </span>
              ))}
            </p>
          )}
          <div className="overflow-hidden rounded-[10px] border border-line">
            <div className="relative border-b border-line">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted"
                aria-hidden="true"
              >
                <path d="M21 21l-4.35-4.35M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z" />
              </svg>
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar a alguien del equipo"
                aria-label="Buscar a alguien del equipo"
                className="rounded-none border-0 bg-surface py-2 pl-8 text-[13px] focus:ring-0"
              />
            </div>
            <div className="max-h-[168px] overflow-y-auto">
              {visibles.length === 0 ? (
                <p className="px-3 py-2.5 text-[13px] text-fg-muted">Nadie se llama así.</p>
              ) : (
                visibles.map((m) => (
                  <label key={m.email} className="flex cursor-pointer items-center gap-2.5 px-3 py-[7px] transition-colors hover:bg-surface-muted">
                    <input type="checkbox" checked={para.includes(m.email)} onChange={() => alternar(m.email)} className="h-[15px] w-[15px] flex-none accent-brand" />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-fg">
                      {m.nombre} <span className="text-fg-muted">· {m.rol}</span>
                    </span>
                    {m.callado && <span className="flex-none text-[11px] text-fg-muted">no reporta hace 30 días</span>}
                  </label>
                ))
              )}
            </div>
          </div>
          {demasiados && <p className="text-xs text-warn-ink">Como mucho {MAXIMO_DE_PERSONAS} personas por pregunta.</p>}
        </div>

        <div className="space-y-2">
          <p className={PASO}>4 · ¿Hasta cuándo?</p>
          <div role="radiogroup" aria-label="Hasta cuándo" className="flex flex-wrap gap-1.5">
            {[...PLAZOS, { clave: "otra" as const, etiqueta: "Otra fecha", dias: 0 }].map((p) => {
              const activo = plazo === p.clave;
              return (
                <button
                  key={p.clave}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  onClick={() => setPlazo(p.clave)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-[13px] transition-colors",
                    activo ? "border-brand bg-info-surface font-semibold text-fg" : "border-line bg-surface text-fg-secondary hover:bg-surface-hover hover:text-fg",
                  )}
                >
                  {p.etiqueta}
                  {activo && p.clave !== "otra" && hasta ? ` · ${fechaCorta(`${hasta}T12:00:00`)}` : ""}
                </button>
              );
            })}
          </div>
          {plazo === "otra" && <DatePickerField value={otraFecha} onChange={setOtraFecha} placeholder="Elige la fecha" manual />}
        </div>

        <div className="space-y-2 border-t border-line pt-[18px]">
          <p className={ROTULO_DEL_SISTEMA}>Así le aparece a cada persona</p>
          <div className="flex justify-end rounded-xl border border-dashed border-line bg-surface-muted p-4">
            <div className="w-[340px] max-w-full">
              <CuerpoDelPedido deQuien={deQuien} hasta={hasta ? `${hasta}T12:00:00` : null} pregunta={pregunta.trim()} />
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
