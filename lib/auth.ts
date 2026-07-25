import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { eq, sql } from "drizzle-orm";

import { db, schema } from "@/db";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // Single trusted coordinator, no email verification flow. Public sign-up is
    // blocked at the route handler (app/api/auth/[...all]/route.ts); accounts
    // are created only via the env-seed helper below.
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "coordinator",
        input: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  plugins: [nextCookies()],
});

let seedPromise: Promise<void> | null = null;

/**
 * Create the coordinator account from COORDINATOR_EMAIL / COORDINATOR_PASSWORD
 * if no user exists yet. Idempotent and safe to call on every login-page load;
 * it short-circuits once any user is present. Runs once per process.
 */
export async function ensureCoordinatorSeeded(): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    const email = process.env.COORDINATOR_EMAIL;
    const password = process.env.COORDINATOR_PASSWORD;
    const name = process.env.COORDINATOR_NAME ?? "Coordinator";
    if (!email || !password) return;

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.user);
    if (count > 0) return;

    try {
      await auth.api.signUpEmail({ body: { email, password, name } });
      await db
        .update(schema.user)
        .set({ role: "coordinator", emailVerified: true })
        .where(eq(schema.user.email, email));
      console.log(`Seeded coordinator account: ${email}`);
    } catch (err) {
      console.error("Failed to seed coordinator account:", err);
    }
  })();
  return seedPromise;
}
