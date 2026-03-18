"use client";

import { FormEvent, useState } from "react";
import { signInWithPassword, signUp } from "@/lib/supabase";

export function AuthForm() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (mode === "register") {
        await signUp(email, password);
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

      {message ? (
        <p className="mt-4 text-sm text-slate-600">{message}</p>
      ) : null}
    </div>
  );
}
