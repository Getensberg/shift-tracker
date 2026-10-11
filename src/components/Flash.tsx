export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (err) return <div className="flash err">{err}</div>;
  if (ok) return <div className="flash ok">{ok}</div>;
  return null;
}
