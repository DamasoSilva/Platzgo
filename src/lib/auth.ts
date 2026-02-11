import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import bcrypt from "bcryptjs";
import type { Role } from "@/generated/prisma/enums";

import { prisma } from "@/lib/prisma";
import { checkRateLimit, clearAttempts, recordFailure } from "@/lib/antifraud";

const prismaAdapter = PrismaAdapter(prisma as unknown as Parameters<typeof PrismaAdapter>[0]);

export const authOptions: NextAuthOptions = {
  adapter: prismaAdapter,
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
        roleIntent: { label: "Role", type: "text" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        const roleIntent = credentials?.roleIntent;

        if (typeof email !== "string" || typeof password !== "string") return null;

        const key = `login:${email.toLowerCase()}`;
        const guard = await checkRateLimit(key, { limit: 5, windowMs: 10 * 60 * 1000, blockMs: 15 * 60 * 1000 });
        if (!guard.allowed) {
          throw new Error("TOO_MANY_ATTEMPTS");
        }

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) {
          await recordFailure(key, { limit: 5, windowMs: 10 * 60 * 1000, blockMs: 15 * 60 * 1000 });
          return null;
        }

        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
          await recordFailure(key, { limit: 5, windowMs: 10 * 60 * 1000, blockMs: 15 * 60 * 1000 });
          return null;
        }

        if (!user.emailVerified) {
          throw new Error("EMAIL_NOT_VERIFIED");
        }

        if (user.is_active === false) {
          const reason = (user.inactive_reason ?? "Usuário inativo").trim() || "Usuário inativo";
          throw new Error(`USER_INACTIVE:${reason}`);
        }

        // SYSADMIN pode entrar independente do "tipo" escolhido na UI.
        if (user.role !== "SYSADMIN") {
          if (roleIntent === "ADMIN" && user.role !== "ADMIN") {
            await recordFailure(key, { limit: 5, windowMs: 10 * 60 * 1000, blockMs: 15 * 60 * 1000 });
            throw new Error("ROLE_MISMATCH_OWNER");
          }
          if (roleIntent === "CUSTOMER" && user.role !== "CUSTOMER") {
            await recordFailure(key, { limit: 5, windowMs: 10 * 60 * 1000, blockMs: 15 * 60 * 1000 });
            throw new Error("ROLE_MISMATCH_CUSTOMER");
          }
        }

        await clearAttempts(key);

        return {
          id: user.id,
          name: user.name,
          image: user.image,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: Role }).role;
        const u = user as { name?: string | null; image?: string | null };
        if (typeof u.name === "string") token.name = u.name;
        if (typeof u.image === "string") token.image = u.image;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = (token.role ?? "CUSTOMER") as Role;
        if (typeof token.name === "string") session.user.name = token.name;
        if (typeof (token as unknown as { image?: unknown }).image === "string") {
          session.user.image = (token as unknown as { image: string }).image;
        }
      }
      return session;
    },
  },
};
