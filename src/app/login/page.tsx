import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { signIn, auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  if (process.env.AUTH_DEV_BYPASS === "true") {
    redirect("/");
  }

  const session = await auth();
  if (session?.user) redirect("/");

  const hasGoogle = !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader>
          <div className="flex flex-col items-center gap-2 pt-2">
            <div className="text-base font-semibold">Contabilità WPaper</div>
            <p className="text-xs text-muted-foreground text-center">
              Accedi con il tuo account aziendale Google
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
            className="flex flex-col gap-3"
          >
            <Button type="submit" variant="primary" disabled={!hasGoogle}>
              {hasGoogle ? "Accedi con Google" : "Google OAuth non configurato"}
            </Button>
            {!hasGoogle && (
              <p className="text-xs text-muted-foreground text-center">
                Configura <code className="font-mono">AUTH_GOOGLE_ID</code> e{" "}
                <code className="font-mono">AUTH_GOOGLE_SECRET</code> in{" "}
                <code className="font-mono">.env.local</code>
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
