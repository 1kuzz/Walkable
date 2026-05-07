import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import { db } from "@/lib/db";
import { logServerEvent } from "@/lib/server/logger";

const hasGoogleOAuth = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const hasGithubOAuth = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
const hasNextAuthConfig = Boolean(process.env.NEXTAUTH_SECRET && process.env.NEXTAUTH_URL);
const nextAuthUrlValue = process.env.NEXTAUTH_URL;

if (!hasGoogleOAuth && !hasGithubOAuth) {
  logServerEvent("warn", "auth.providers_missing", {
    hint: "Set Google and/or GitHub OAuth credentials in environment variables",
  });
}

if (!hasNextAuthConfig) {
  logServerEvent("warn", "auth.nextauth_env_missing", {
    missing: [
      !process.env.NEXTAUTH_SECRET ? "NEXTAUTH_SECRET" : null,
      !process.env.NEXTAUTH_URL ? "NEXTAUTH_URL" : null,
    ].filter(Boolean),
  });
}

if (nextAuthUrlValue) {
  try {
    const hostname = new URL(nextAuthUrlValue).hostname;
    if (process.env.NODE_ENV !== "development" && ["localhost", "127.0.0.1", "::1"].includes(hostname)) {
      logServerEvent("warn", "auth.nextauth_url_localhost_in_production", {
        nextAuthUrl: nextAuthUrlValue,
        hint: "Set NEXTAUTH_URL to your deployed HTTPS origin and redeploy so OAuth callback URLs match the provider configuration",
      });
    }
  } catch {
    logServerEvent("warn", "auth.nextauth_url_invalid", {
      nextAuthUrl: nextAuthUrlValue,
      hint: "Set NEXTAUTH_URL to a valid absolute HTTPS URL, for example https://www.1kuzz.org",
    });
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db) as Adapter,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
