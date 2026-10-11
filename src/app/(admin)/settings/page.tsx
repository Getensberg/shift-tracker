import { prisma } from "@/lib/db";
import { isSheetsConfigured } from "@/lib/sheets";
import { getMe, getWebhookInfo, isBotConfigured, type WebhookInfo } from "@/lib/telegram";
import { formatLocal } from "@/lib/time";
import { Flash } from "@/components/Flash";
import { Submit } from "@/components/Submit";
import { retryAction, setupWebhookAction, testSheetsAction } from "../../actions";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  let bot: { username?: string } | null = null;
  let hook: WebhookInfo | null = null;
  let botError: string | null = null;
  if (isBotConfigured()) {
    try {
      [bot, hook] = await Promise.all([getMe(), getWebhookInfo()]);
    } catch (e) {
      botError = e instanceof Error ? e.message : String(e);
    }
  }
  const [pending, errors, syncErrors, syncPending] = await Promise.all([
    prisma.message.count({ where: { status: "PENDING" } }),
    prisma.message.count({ where: { status: "ERROR" } }),
    prisma.shiftMark.count({ where: { sheetStatus: "ERROR" } }),
    prisma.shiftMark.count({ where: { sheetStatus: { in: ["PENDING", "DISABLED"] } } }),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Интеграции</h1>
          <p>Подключение Telegram-бота, Google Sheets и обслуживание очереди.</p>
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid-2">
        <div className="card stack">
          <h2>Telegram-бот</h2>
          {!isBotConfigured() ? (
            <p className="muted">Переменная <code>TELEGRAM_BOT_TOKEN</code> не задана.</p>
          ) : botError ? (
            <div className="flash err" style={{ margin: 0 }}>{botError}</div>
          ) : (
            <dl className="kv">
              <dt>Бот</dt><dd>@{bot?.username}</dd>
              <dt>Вебхук</dt><dd className="small mono" style={{ wordBreak: "break-all" }}>{hook?.url || <span className="muted">не установлен</span>}</dd>
              <dt>В очереди у Telegram</dt><dd>{hook?.pending_update_count ?? 0}</dd>
              {hook?.last_error_message ? (<><dt>Последняя ошибка</dt><dd className="small">{hook.last_error_message} ({formatLocal(new Date((hook.last_error_date ?? 0) * 1000))})</dd></>) : null}
            </dl>
          )}
          <form action={setupWebhookAction}>
            <Submit pendingText="Устанавливаю…" className="btn">Установить вебхук на этот домен</Submit>
          </form>
          <p className="muted small">
            Чтобы бот видел фото в группах: @BotFather → <code>/setprivacy</code> → Disable (или сделайте бота админом группы).
            Затем добавьте бота в группу — она появится в «Группы и объекты».
          </p>
        </div>

        <div className="card stack">
          <h2>Google Sheets</h2>
          <p>
            {isSheetsConfigured() ? <span className="badge b-ACCEPTED">подключено</span> : <span className="badge b-IGNORED">не настроено</span>}
          </p>
          <p className="muted small">
            Табель зеркалируется в Google-таблицу через Apps Script (код — <code>google-apps-script/Code.gs</code>). Нужны
            переменные <code>SHEETS_WEBHOOK_URL</code> и <code>SHEETS_SECRET</code>.
          </p>
          <dl className="kv">
            <dt>Ошибки отправки</dt><dd>{syncErrors}</dd>
            <dt>Ожидают отправки</dt><dd>{syncPending}</dd>
          </dl>
          <form action={testSheetsAction}><Submit className="btn" pendingText="Проверяю…">Проверить связь</Submit></form>
        </div>

        <div className="card stack">
          <h2>Очередь обработки</h2>
          <dl className="kv">
            <dt>Не обработано</dt><dd>{pending}</dd>
            <dt>С ошибкой</dt><dd>{errors}</dd>
          </dl>
          <p className="muted small">
            Сообщения сохраняются до обработки, поэтому при сбое ничего не теряется. Кнопка (и Vercel Cron) дообрабатывает
            зависшие сообщения и повторяет отправку в Google Sheets.
          </p>
          <form action={retryAction}><Submit className="btn" pendingText="Обрабатываю…">Дообработать сейчас</Submit></form>
        </div>
      </div>
    </>
  );
}
