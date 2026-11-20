"use client";

/**
 * components/trivias/EntrarConCodigo.tsx — /trivia/play: el jugador escribe el código que muestra la pantalla de la
 * trivia. Acepta minúsculas, espacios y guiones («k7m-2qx»): `normalizarCodigo` los limpia antes de ir a la partida.
 * Quien escanea el QR no pasa por acá: el QR lleva directo a /trivia/play/CODIGO.
 */
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Gamepad2 } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { normalizarCodigo } from "@/lib/trivias/reglas";

export function EntrarConCodigo() {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [yendo, setYendo] = useState(false);

  function entrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const codigo = normalizarCodigo(texto);
    if (!codigo) {
      setError(texto.trim() ? "Revisa el código: son 6 letras y números." : "Escribe el código de la partida.");
      return;
    }
    setYendo(true);
    router.push(`/trivia/play/${codigo}`);
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <form onSubmit={entrar} noValidate className="space-y-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <span
            className="flex size-16 items-center justify-center rounded-2xl bg-brand-soft text-brand-dark"
            aria-hidden="true"
          >
            <Gamepad2 className="size-8" strokeWidth={1.75} />
          </span>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-fg">Entrar a una trivia</h1>
            <p className="text-sm leading-relaxed text-fg-muted">
              Escribe el código que aparece en la pantalla de la trivia.
            </p>
          </div>
        </div>

        <Field
          label="Código de la partida"
          error={error}
          hint="Si tienes el QR a mano, escanéalo con la cámara y entras directo."
        >
          <Input
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              if (error) setError(null);
              if (yendo) setYendo(false);
            }}
            placeholder="K7M2QX"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            enterKeyHint="go"
            maxLength={8}
            className="h-16 text-center font-mono text-3xl font-bold uppercase tracking-[0.3em] placeholder:font-normal placeholder:tracking-[0.3em]"
          />
        </Field>

        <Button type="submit" variant="primary" size="lg" loading={yendo} className="h-12 w-full text-base">
          Entrar
        </Button>
      </form>
    </div>
  );
}
