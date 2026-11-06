import Link from "next/link";

export const metadata = {
  title: "Lien invalide — Arneph",
};

export default function AuthCodeErrorPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-sm text-center">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          Ce lien n&apos;est plus valide
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Le lien de connexion a expiré ou a déjà été utilisé. Demandez-en un
          nouveau depuis la page de connexion.
        </p>
        <Link
          href="/login"
          className="mt-8 inline-block text-sm font-medium text-foreground underline underline-offset-4"
        >
          Retourner à la connexion
        </Link>
      </div>
    </main>
  );
}
