"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AvatarImage } from "../../components/AvatarImage";
import { AppNoticeModal } from "../../components/AppNoticeModal";
import { SectionTitle } from "../../components/SectionTitle";
import {
  fetchProfile,
  getSession,
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const session = getSession();

        if (!session?.user?.id || !session?.access_token) return;

        const profile = await fetchProfile(
          session.user.id,
          session.access_token
        );

        if (profile) {
          setName(profile.full_name ?? "");
          setPhone(profile.phone ?? "");
          setCategory(profile.category ?? "");
          setAvatarUrl(profile.avatar_url ?? "");
        }
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const isComplete = useMemo(() => {
    return Boolean(name.trim() && phone.trim() && category.trim());
  }, [name, phone, category]);

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

      await updateProfile(session.user.id, session.access_token, {
        full_name: name || null,
        phone: phone || null,
        category: category || null
      });

      setNoticeMessage("Perfil actualizado");
    } catch {
      setNoticeMessage("No se pudo guardar el perfil");
    } finally {
      setSaving(false);
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
            {category || "Sin categoría"}
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
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Teléfono</label>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Categoría</label>
            <select
              className="w-full rounded-xl border px-3 py-2"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Seleccionar</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={save}
            className="btn-primary w-full"
            disabled={saving}
          >
            {saving ? "Guardando..." : "Guardar cambios"}
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
