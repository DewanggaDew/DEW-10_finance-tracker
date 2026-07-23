import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** Resolve the signed-in user's id, or redirect to /login.
 *  Every user-scoped query must be filtered by this id. */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}
