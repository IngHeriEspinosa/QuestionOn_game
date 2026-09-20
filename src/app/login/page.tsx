import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/dal";
import { LoginForm } from "@/components/auth/LoginForm";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  missing: "El enlace no traía el código de acceso.",
  invalid: "Ese enlace ya no vale. Pide uno nuevo.",
};

export default async function LoginPage({
  searchParams,
}: {
  // searchParams es una Promise en Next 15+.
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getSession()) redirect("/dashboard");

  const { error } = await searchParams;
  const message = error ? ERRORS[error] ?? ERRORS.invalid : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-slate-200/70 bg-white/90 p-6 shadow-xl shadow-slate-900/10 md:p-8">
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-semibold text-slate-900">
            Entra en QuestionON
          </h1>
          <p className="text-sm text-slate-600">
            Te enviamos un enlace de acceso. Sin contraseñas que recordar.
          </p>
        </div>

        {message && (
          <p
            className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="alert"
          >
            {message}
          </p>
        )}

        <LoginForm />

        <p className="text-xs leading-relaxed text-slate-500">
          Solo el profesorado necesita cuenta. El alumnado entra con un código de
          sala y un apodo, sin dar ningún dato personal.
        </p>
      </div>
    </main>
  );
}
