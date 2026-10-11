import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="login">
      <div className="card">
        <div className="brand" style={{ color: "var(--ink)", padding: "0 0 18px" }}>
          <div className="brand-mark">✓</div>
          <div>
            Табель смен
            <small style={{ color: "var(--muted)" }}>вход для администратора</small>
          </div>
        </div>
        <LoginForm next={next ?? "/tabel"} />
      </div>
    </div>
  );
}
