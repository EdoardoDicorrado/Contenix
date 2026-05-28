import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

const allowedDomain = process.env.AUTH_ALLOWED_DOMAIN ?? "";

export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ profile }) {
      if (!profile?.email) return false;
      if (!allowedDomain) return true;
      return profile.email.endsWith(`@${allowedDomain}`);
    },
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      if (process.env.AUTH_DEV_BYPASS === "true") return true;

      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname.startsWith("/login");

      if (isOnLogin) {
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl));
        return true;
      }
      return isLoggedIn;
    },
  },
  session: { strategy: "jwt" },
};
