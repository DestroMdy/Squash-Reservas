import { AuthForm } from "@/components/AuthForm";
import { SectionTitle } from "@/components/SectionTitle";

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <SectionTitle
        title="Ingresar o crear cuenta"
        subtitle="Usá tu email para gestionar tus reservas."
      />
      <AuthForm />
    </div>
  );
}