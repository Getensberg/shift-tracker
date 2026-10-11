import { after } from "next/server";
import { ingestUpdate, processMessage } from "@/lib/pipeline";
import type { TgUpdate } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Точка входа Telegram.
 * 1. Проверяем секрет (его задаём в setWebhook) — чужие запросы отбрасываем.
 * 2. Синхронно сохраняем сообщение. Если БД недоступна — отвечаем 500,
 *    и Telegram сам повторит доставку (хранит апдейты до 24 ч) — события не теряются.
 * 3. Обработку запускаем после ответа (after), чтобы Telegram не ждал.
 *    Если она упадёт — сообщение останется PENDING/ERROR и его доберёт /api/cron/retry.
 */
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return Response.json({ ok: false, error: "bad secret" }, { status: 401 });
  }

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return Response.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  try {
    const result = await ingestUpdate(update);
    if (result.messageIds.length) {
      after(async () => {
        for (const id of result.messageIds) await processMessage(id);
      });
    }
    return Response.json({ ok: true, note: result.note });
  } catch (e) {
    console.error("webhook ingest failed", e);
    return Response.json({ ok: false }, { status: 500 });
  }
}
