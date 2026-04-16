"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { SectionTitle } from "@/components/SectionTitle";
import { exchangeRecoveryTokenHash, updatePassword } from "@/lib/supabase";

function getRecoveryParams() {
  if (typeof window === "undefined") {
    return {
      accessToken: null,
      tokenHash: null,
      type: "recovery"
    };
  }

  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  const searchParams = new URLSearchParams(window.location.search);
  const type = (searchParams.get("type") || "recovery") as
    | "recovery"
    | "email"
    | "invite"
    | "email_change";

  return {
    accessToken: hashParams.get("access_token"),
    tokenHash: searchParams.get("token_hash"),
    type
  };
}

export default function ResetPasswordPage() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function initializeRecovery() {
      const { accessToken: hashAccessToken, tokenHash, type } = getRecoveryParams();

      if (hashAccessToken) {
        if (active) {
          setAccessToken(hashAccessToken);
          setInitializing(false);
        }
        return;
      }

      if (!tokenHash) {
        if (active) {
          setMessage("El enlace de recuperación no es válido o venció.");
          setInitializing(false);
        }
        return;
      }

      try {
        const session = await exchangeRecoveryTokenHash(tokenHash, type);

        if (active) {
          setAccessToken(session.access_token);
        }
      } catch (error) {
        if (active) {
          setMessage(
            error instanceof Error
              ? error.message
              : "El enlace de recuperación no es válido o venció."
          );
        }
      } finally {
        if (active) {
          setInitializing(false);
        }
      }
    }

    initializeRecovery();

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (!accessToken) {
        throw new Error("El enlace de recuperación no es válido o venció.");
      }

      await updatePassword(accessToken, password);
      setMessage("Contraseña actualizada. Ya podés iniciar sesión.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo actualizar la contraseña.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link href="/login" className="btn-secondary">
        Volver al login
      </Link>

      <SectionTitle
        title="Cambiar contraseña"
        subtitle="Elegí una nueva contraseña desde el enlace que llegó por mail."
      />

      <section className="card p-6">
        {initializing ? (
          <p className="text-sm text-slate-600">Validando enlace de recuperación...</p>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Nueva contraseña
            </label>
            <input
              type="password"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={6}
              required
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={loading || !accessToken}
          >
            {loading ? "Actualizando..." : "Guardar nueva contraseña"}
          </button>
        </form>
        )}

        {message ? (
          <p className="mt-4 text-sm text-slate-600">{message}</p>
        ) : null}
      </section>
    </div>
  );
}
