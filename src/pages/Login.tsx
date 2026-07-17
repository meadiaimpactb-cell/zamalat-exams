import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { useI18n } from "@/i18n";
import { useAuth } from "@/providers/auth";
import { LanguageSwitcher, Logo } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ShieldCheck, Loader2 } from "lucide-react";

export default function Login() {
  const { t } = useI18n();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/dashboard");
    } catch {
      setError(t("invalidLogin"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center brand-gradient p-4">
      <div className="absolute end-4 top-4">
        <LanguageSwitcher variant="secondary" />
      </div>
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="items-center text-center">
          <Logo size="lg" />
          <CardTitle className="mt-4 flex items-center gap-2 text-2xl text-brand">
            <ShieldCheck className="h-6 w-6" />
            {t("loginTitle")}
          </CardTitle>
          <CardDescription>{t("loginSub")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{t("username")}</Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("password")}</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </div>
            {error && <p className="rounded-lg bg-destructive/10 p-2 text-center text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full bg-brand hover:opacity-90" disabled={loading}>
              {loading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              {t("login")}
            </Button>
            <Link to="/" className="block text-center text-sm text-muted-foreground hover:text-brand">
              ← {t("back")}
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
