// Creates (or resets the password of) an admin user.
// Usage: npm run db:seed -- <email> <password> [name]
import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { users } from "../src/db/schema";

async function main() {
  const [email, password, name] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: npm run db:seed -- <email> <password> [name]");
    process.exit(1);
  }

  const client = postgres(process.env.DATABASE_URL!);
  const db = drizzle(client);
  const passwordHash = await bcrypt.hash(password, 12);
  const normalized = email.trim().toLowerCase();

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalized));

  if (existing) {
    await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, existing.id));
    console.log(`Password updated for ${normalized}`);
  } else {
    await db.insert(users).values({
      email: normalized,
      name: name ?? normalized.split("@")[0],
      passwordHash,
      isAdmin: true,
    });
    console.log(`Admin user created: ${normalized}`);
  }
  await client.end();
}

main();
