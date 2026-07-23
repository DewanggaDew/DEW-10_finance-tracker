import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { AuthError } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth, signIn } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const signupSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(8),
});

const ERRORS: Record<string, string> = {
  taken: "An account with that email already exists.",
  invalid: "Check your details — password must be at least 8 characters.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");
  const { error } = await searchParams;

  async function signup(formData: FormData) {
    "use server";
    const parsed = signupSchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (!parsed.success) redirect("/signup?error=invalid");
    const { name, password } = parsed.data;
    const email = parsed.data.email.trim().toLowerCase();

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    if (existing) redirect("/signup?error=taken");

    await db.insert(users).values({
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
    });

    try {
      await signIn("credentials", { email, password, redirectTo: "/" });
    } catch (e) {
      if (e instanceof AuthError) redirect("/login");
      throw e;
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-xs">
        <h1 className="font-heading text-4xl font-bold tracking-tight">
          Kanto<span className="text-primary">.</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create your account.
        </p>
        <form action={signup} className="mt-10 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name" className="label-caps">
              Name
            </Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="label-caps">
              Email
            </Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="label-caps">
              Password
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              minLength={8}
              required
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">
              {ERRORS[error] ?? "Something went wrong. Try again."}
            </p>
          )}
          <Button type="submit" className="w-full">
            Sign up
          </Button>
        </form>
        <p className="mt-6 text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-foreground underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
