"use client";

import Script from "next/script";
import { FormEvent, useState } from "react";
import { signInWithPassword, signUp } from "@/lib/supabase";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (callback: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "";

export function AuthForm() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function runRecaptcha(action: string) {
    if (!recaptchaSiteKey) {
      throw new Error("El registro está temporalmente deshabilitado.");
    }

    if (!window.grecaptcha) {
      throw new Error("No se pudo cargar reCAPTCHA. Intenta nuevamente.");
    }

    return new Promise<string>((resolve, reject) => {
      window.grecaptcha?.ready(async () => {
        try {
          const token = await window.grecaptcha?.execute(recaptchaSiteKey, {
            action
          });

          if (!token) {
            reject(new Error("No se pudo validar reCAPTCHA."));
            return;
          }

          resolve(token);
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
        setMessage("Cuenta creada. Ahora iniciá sesión.");
        setMode("login");
      } else {
        await signInWithPassword(email, password);
        window.location.href = "/schedule";
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ocurrió un error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card mx-auto max-w-md p-6">
      {mode === "register" && recaptchaSiteKey ? (
        <Script
          src={`https://www.google.com/recaptcha/api.js?render=${recaptchaSiteKey}`}
          strategy="afterInteractive"
        />
      ) : null}

      <div className="mb-4 flex gap-2">
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
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Contraseña
          </label>
          <input
            type="password"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading
            ? "Procesando..."
            : mode === "login"
              ? "Ingresar"
              : "Crear cuenta"}
        </button>
      </form>

      {mode === "register" ? (
        <p className="mt-4 text-xs text-slate-500">
          Este sitio está protegido por reCAPTCHA v3 y se aplican la Política
          de Privacidad y los Términos de Servicio de Google.
        </p>
      ) : null}

      {message ? (
        <p className="mt-4 text-sm text-slate-600">{message}</p>
      ) : null}
    </div>
  );
}
