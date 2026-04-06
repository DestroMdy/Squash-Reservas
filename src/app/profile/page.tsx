"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AvatarImage } from "../../components/AvatarImage";
import { AppNoticeModal } from "../../components/AppNoticeModal";
import { SectionTitle } from "../../components/SectionTitle";
import { formatCategoryLabel } from "../../lib/category-labels";
import { isWhatsAppPhoneValid } from "../../lib/whatsapp-utils";
import {
  fetchProfile,
  getSession,
  updateCurrentUserPassword,
  updateProfile,
  uploadProfileAvatar
} from "../../lib/supabase";

const categories = [
  "Primera",
  "Segunda",
  "Tercera",
  "Cuarta",
  "Quinta",
  "Principiante"
];

export default function ProfilePage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [whatsappWaitlistOptIn, setWhatsappWaitlistOptIn] = useState(false);
  const [whatsappWaitlistAvailable, setWhatsappWaitlistAvailable] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const session = getSession();

        if (!session?.user?.id || !session?.access_token) {
          return;
        }

        const profile = await fetchProfile(
          session.user.id,
          session.access_token
        );

        if (profile) {
          setName(profile.full_name ?? "");
          setPhone(profile.phone ?? "");
          setCategory(profile.category ?? "");
          setAvatarUrl(profile.avatar_url ?? "");
          setWhatsappWaitlistOptIn(
            profile.whatsapp_waitlist_opt_in === true
          );
          setWhatsappWaitlistAvailable(
            profile.whatsapp_waitlist_available === true
          );
        }
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const isComplete = useMemo(() => {
    return Boolean(name.trim() && phone.trim() && category.trim());
  }, [name, phone, category]);

  const canUseWhatsAppWaitlist = useMemo(() => {
    return isWhatsAppPhoneValid(phone);
  }, [phone]);

  const showWelcomeNotice = searchParams.get("welcome") === "1";

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    try {
      const file = event.target.files?.[0];
      if (!file) return;

      const session = getSession();
      if (!session?.user?.id || !session?.access_token) {
        setNoticeMessage("Debes iniciar sesión");
        return;
      }

      setUploadingPhoto(true);
      const uploadedUrl = await uploadProfileAvatar(
        session.user.id,
        session.access_token,
        file
      );

      await updateProfile(session.user.id, session.access_token, {
        avatar_url: uploadedUrl
      });

      setAvatarUrl(uploadedUrl);
      setNoticeMessage("Foto actualizada");
    } catch (error) {
      setNoticeMessage(
        error instanceof Error
          ? error.message
          : "No se pudo subir la foto. Usá JPG, PNG o WebP de hasta 5 MB."
      );
    } finally {
      setUploadingPhoto(false);
      event.target.value = "";
    }
  }

  async function save() {
    try {
      setSaving(true);

      const session = getSession();

      if (!session?.user?.id || !session?.access_token) {
        setNoticeMessage("Debes iniciar sesión");
        return;
      }

      if (
        whatsappWaitlistAvailable &&
        whatsappWaitlistOptIn &&
        !canUseWhatsAppWaitlist
      ) {
        setNoticeMessage(
          "Para recibir avisos por WhatsApp, cargá un celular válido. Ejemplo: 2804123456 o +54 9 ..."
        );
        return;
      }

      const updatedProfile = await updateProfile(
        session.user.id,
        session.access_token,
        {
          full_name: name || null,
          phone: phone || null,
          category: category || null,
          whatsapp_waitlist_opt_in: whatsappWaitlistOptIn
        }
      );

      setWhatsappWaitlistOptIn(
        updatedProfile?.whatsapp_waitlist_opt_in === true
      );
      setWhatsappWaitlistAvailable(
        updatedProfile?.whatsapp_waitlist_available === true
      );
      setNoticeMessage("Perfil actualizado");
    } catch (error) {
      setNoticeMessage(
        error instanceof Error ? error.message : "No se pudo guardar el perfil"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordChange() {
    try {
      if (!newPassword.trim() || !confirmPassword.trim()) {
        setNoticeMessage(
          "Debes completar la nueva contraseña y su confirmación."
        );
        return;
      }

      if (newPassword !== confirmPassword) {
        setNoticeMessage("Las contraseñas no coinciden.");
        return;
      }

      setUpdatingPassword(true);
      await updateCurrentUserPassword(newPassword);
      setNewPassword("");
      setConfirmPassword("");
      setNoticeMessage("Contraseña actualizada.");
    } catch (error) {
      setNoticeMessage(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la contraseña."
      );
    } finally {
      setUpdatingPassword(false);
    }
  }

  if (loading) return <p>Cargando perfil...</p>;

  return (
    <>
      <div className="mx-auto max-w-xl space-y-6">
        <Link href="/" className="btn-secondary">
          Volver al inicio
        </Link>

        <SectionTitle
          title="Mi perfil"
          subtitle="Completá tu información para poder reservar."
        />

        {showWelcomeNotice ? (
          <div className="card border-2 border-orange-200 bg-orange-50 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-700">
              Bienvenido
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">
              Completá tu perfil para empezar a usar la app
            </h2>
            <p className="mt-2 text-sm text-slate-700">
              Antes de reservar o usar el resto de las funciones, cargá tu
              nombre, teléfono y categoría.
            </p>
          </div>
        ) : null}

        <div className="card rounded-2xl p-5">
          <div className="flex items-center gap-4">
            <AvatarImage
              src={avatarUrl}
              alt="Foto de perfil"
              size={96}
              className="h-24 w-24 rounded-full border border-slate-200 object-cover"
            />
            <div className="flex-1 space-y-2">
              <p className="text-sm text-slate-500">Foto de perfil</p>
              <label className="btn-secondary inline-flex cursor-pointer">
                {uploadingPhoto ? "Subiendo..." : "Cambiar foto"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleAvatarChange}
                  disabled={uploadingPhoto}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="card rounded-2xl p-5">
          <p className="text-sm text-slate-500">Categoría actual</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {formatCategoryLabel(category)}
          </p>
        </div>

        {!isComplete ? (
          <div className="card border border-amber-300 bg-amber-50 p-4">
            <p className="font-medium text-amber-900">Perfil incompleto</p>
            <p className="mt-1 text-sm text-amber-800">
              Debes completar nombre, teléfono y categoría.
            </p>
          </div>
        ) : (
          <div className="card border border-green-300 bg-green-50 p-4">
            <p className="font-medium text-green-900">Perfil completo</p>
            <p className="mt-1 text-sm text-green-800">
              Ya puedes reservar turnos.
            </p>
          </div>
        )}

        <div className="card space-y-4 p-6">
          <div>
            <label className="mb-1 block text-sm font-medium">
              Nombre y apellido
            </label>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Teléfono</label>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Ej: 2804123456 o +54 9 ..."
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Categoría</label>
            <select
              className="w-full rounded-xl border px-3 py-2"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">Seleccionar</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {formatCategoryLabel(cat)}
                </option>
              ))}
            </select>
          </div>

          {whatsappWaitlistAvailable ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-start gap-3">
                <input
                  id="waitlist-whatsapp-opt-in"
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  checked={whatsappWaitlistOptIn}
                  onChange={(event) =>
                    setWhatsappWaitlistOptIn(event.target.checked)
                  }
                />
                <div className="space-y-1">
                  <label
                    htmlFor="waitlist-whatsapp-opt-in"
                    className="block text-sm font-semibold text-slate-900"
                  >
                    Quiero recibir avisos de lista de espera por WhatsApp
                  </label>
                  <p className="text-sm text-slate-700">
                    Cuando se libere un turno ocupado, te avisamos al número de
                    este perfil. Si no lo activás, seguimos usando email.
                  </p>
                  {!canUseWhatsAppWaitlist ? (
                    <p className="text-xs font-medium text-amber-700">
                      Cargá un celular válido para poder activar WhatsApp.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <button
            onClick={save}
            className="btn-primary w-full"
            disabled={saving}
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>

        <div className="card space-y-4 p-6">
          <div>
            <p className="text-sm text-slate-500">Seguridad</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              Cambiar contraseña
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Actualizá tu contraseña desde tu sesión actual.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Nueva contraseña
            </label>
            <input
              type="password"
              className="w-full rounded-xl border px-3 py-2"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Repetir nueva contraseña
            </label>
            <input
              type="password"
              className="w-full rounded-xl border px-3 py-2"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          <button
            onClick={handlePasswordChange}
            className="btn-secondary w-full"
            disabled={updatingPassword}
          >
            {updatingPassword ? "Actualizando..." : "Actualizar contraseña"}
          </button>
        </div>
      </div>

      <AppNoticeModal
        open={Boolean(noticeMessage)}
        message={noticeMessage}
        onClose={() => setNoticeMessage("")}
      />
    </>
  );
}
