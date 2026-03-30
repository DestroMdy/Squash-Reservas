"use client";

import Script from "next/script";
import { FormEvent, useEffect, useState } from "react";
import {
  requestPasswordReset,
  signInWithPassword,
  signUp
} from "@/lib/supabase";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (callback: () => void) => void;
      execute: (
        siteKey: string,
        options: { action: string }
      ) => Promise<string>;
    };
  }
}

const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "";

export function AuthForm() {
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [recaptchaLoaded, setRecaptchaLoaded] = useState(false);
  const [recaptchaReady, setRecaptchaReady] = useState(false);

  useEffect(() => {
    if (!recaptchaLoaded || !window.grecaptcha) {
      return;
    }

    window.grecaptcha.ready(() => {
      setRecaptchaReady(true);
    });
  }, [recaptchaLoaded]);

  async function runRecaptcha(action: string) {
    if (!recaptchaSiteKey) {
      throw new Error("El registro está temporalmente deshabilitado.");
    }

    if (!window.grecaptcha || !recaptchaReady) {
      throw new Error("reCAPTCHA todavía no terminó de cargar.");
    }

    return new Promise<string>((resolve, reject) => {
      window.grecaptcha?.ready(async () => {
        try {
          const token = await window.grecaptcha?.execute(recaptchaSiteKey, {
            action
          });

          const normalizedToken = token?.trim();

          if (!normalizedToken) {
            reject(new Error("No se pudo validar reCAPTCHA."));
            return;
          }

          resolve(normalizedToken);
        } catch {
          reject(new Error("No se pudo validar reCAPTCHA."));
        }
      });
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (mode === "register") {
        const captchaToken = await runRecaptcha("register");
        await signUp(email, password, captchaToken);
        window.location.href = "/profile";
      } else if (mode === "forgot") {
        await requestPasswordReset(email);
        setMessage(
          "Te enviamos un mail para cambiar la contraseña. Revisá tu bandeja y spam."
        );
        setMode("login");
      } else {
        await signInWithPassword(email, password);
        window.location.href = "/schedule";
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ocurrió un error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card mx-auto max-w-md p-6">
      {recaptchaSiteKey ? (
        <Script
          src={`https://www.google.com/recaptcha/api.js?render=${recaptchaSiteKey}`}
          strategy="afterInteractive"
          onLoad={() => setRecaptchaLoaded(true)}
        />
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={mode === "login" ? "btn-primary" : "btn-secondary"}
          onClick={() => setMode("login")}
        >
          Ingresar
        </button>
        <button
          type="button"
          className={mode === "register" ? "btn-primary" : "btn-secondary"}
          onClick={() => setMode("register")}
        >
          Registrarse
        </button>
        <button
          type="button"
          className={mode === "forgot" ? "btn-primary" : "btn-secondary"}
          onClick={() => setMode("forgot")}
        >
          Recuperar clave
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            type="email"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>

        {mode !== "forgot" ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Contraseña
            </label>
            <input
              type="password"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
            />
          </div>
        ) : null}

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={loading || (mode === "register" && !recaptchaReady)}
        >
          {loading
            ? "Procesando..."
            : mode === "login"
              ? "Ingresar"
              : mode === "forgot"
                ? "Enviar mail"
                : !recaptchaReady
                  ? "Cargando seguridad..."
                  : "Crear cuenta"}
        </button>
      </form>

      {mode === "login" ? (
        <div className="mt-4 text-sm">
          <button
            type="button"
            className="text-slate-600 underline"
            onClick={() => setMode("forgot")}
          >
            Olvidé mi contraseña
          </button>
        </div>
      ) : null}

      {mode === "register" ? (
        <p className="mt-4 text-xs text-slate-500">
          Este sitio está protegido por reCAPTCHA v3 y se aplican la Política
          de Privacidad y los Términos de Servicio de Google.
        </p>
      ) : null}

      {mode === "forgot" ? (
        <p className="mt-4 text-xs text-slate-500">
          Te vamos a mandar un enlace para definir una nueva contraseña.
        </p>
      ) : null}

      {message ? <p className="mt-4 text-sm text-slate-600">{message}</p> : null}

      {mode === "forgot" ? (
        <p className="mt-4 text-xs text-slate-500">
          El enlace te va a llevar a una pantalla para actualizar la contraseña.
        </p>
      ) : null}
    </div>
  );
}
