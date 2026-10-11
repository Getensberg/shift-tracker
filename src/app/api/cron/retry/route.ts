import { retryPending } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Добор зависших сообщений и повтор синхронизации с Google Sheets. Вызывается Vercel Cron. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const result = await retryPending();
  return Response.json({ ok: true, ...result });
}
