import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/70">
        <div className="mx-auto flex max-w-5xl items-baseline gap-10 px-6 py-5">
          <Link href="/" className="font-heading text-2xl font-bold tracking-tight">
            Kanto<span className="text-primary">.</span>
          </Link>
          <nav className="flex gap-6">
            <Link href="/" className="label-caps transition-colors hover:text-foreground">
              Dashboard
            </Link>
            <Link
              href="/portfolios"
              className="label-caps transition-colors hover:text-foreground"
            >
              Portfolios
            </Link>
          </nav>
          <div className="ml-auto flex items-baseline gap-4">
            <span className="text-sm text-muted-foreground">
              {session.user.name}
            </span>
            <form action={logout}>
              <Button
                variant="ghost"
                size="sm"
                type="submit"
                className="text-muted-foreground hover:text-foreground"
              >
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
