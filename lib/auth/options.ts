import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";

const credentialsSchema = z.object({
  username: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(128),
});

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Username or email",
      credentials: {
        username: { label: "Username or email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // Step 1: Validate input
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          console.warn("[auth] Login rejected: invalid input format");
          return null;
        }

        const identifier = parsed.data.username.toLowerCase();

        // Step 2: Look up user in database
        let user;
        try {
          user = await prisma.user.findFirst({
            where: {
              deletedAt: null,
              OR: [{ username: identifier }, { email: identifier }],
            },
          });
        } catch (error) {
          // Database connection or query failure — log the error category
          // without exposing connection string, host, or credentials
          const message =
            error instanceof Error ? error.message : String(error);
          const isConnectionError =
            message.includes("connect") ||
            message.includes("ECONNREFUSED") ||
            message.includes("ETIMEDOUT") ||
            message.includes("Can't reach database");
          if (isConnectionError) {
            console.error(
              "[auth] DATABASE CONNECTION ERROR during login. Check DATABASE_URL and network connectivity."
            );
          } else {
            console.error("[auth] DATABASE QUERY ERROR during login:", message);
          }
          // Re-throw so NextAuth returns an error response (not just "wrong credentials")
          throw new Error("DatabaseError");
        }

        // Step 3: Check user existence
        if (!user) {
          console.warn(
            `[auth] Login failed: account not found for identifier "${identifier}"`
          );
          return null;
        }

        // Step 4: Check account status
        if (user.status !== "ACTIVE") {
          console.warn(
            `[auth] Login failed: account "${identifier}" has status "${user.status}"`
          );
          return null;
        }

        // Step 5: Verify password
        let passwordMatch = false;
        try {
          passwordMatch = await bcrypt.compare(
            parsed.data.password,
            user.passwordHash
          );
        } catch (error) {
          console.error(
            "[auth] Password verification error (possible hash format issue):",
            error instanceof Error ? error.message : String(error)
          );
          return null;
        }

        if (!passwordMatch) {
          console.warn(
            `[auth] Login failed: password mismatch for "${identifier}"`
          );
          return null;
        }

        // Step 6: Update last login timestamp
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          });
        } catch (error) {
          // Non-critical: log but don't block login
          console.error(
            "[auth] Failed to update lastLoginAt:",
            error instanceof Error ? error.message : String(error)
          );
        }

        console.info(
          `[auth] Login successful: "${identifier}" (role: ${user.role})`
        );

        return {
          id: user.id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
};
