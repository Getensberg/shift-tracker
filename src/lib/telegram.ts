// Минимальная работа с Telegram Bot API без сторонних библиотек.

export type TgUser = { id: number; is_bot?: boolean; first_name?: string; last_name?: string; username?: string };
export type TgChat = { id: number; type: "private" | "group" | "supergroup" | "channel"; title?: string; username?: string };
export type TgPhotoSize = { file_id: string; file_unique_id: string; width: number; height: number; file_size?: number };
export type TgMessage = {
  message_id: number;
  date: number;
  edit_date?: number;
  chat: TgChat;
  from?: TgUser;
  caption?: string;
  text?: string;
  photo?: TgPhotoSize[];
  document?: { file_id: string; mime_type?: string };
  media_group_id?: string;
};
export type TgChatMemberUpdated = {
  chat: TgChat;
  from: TgUser;
  date: number;
  new_chat_member: { status: string; user: TgUser };
};
export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  my_chat_member?: TgChatMemberUpdated;
};

/** file_id фото: обычное фото (берём самый большой размер) или картинка документом. */
export function extractPhotoFileId(msg: TgMessage): string | null {
  if (msg.photo?.length) return msg.photo[msg.photo.length - 1].file_id;
  if (msg.document?.mime_type?.startsWith("image/")) return msg.document.file_id;
  return null;
}

export function displayName(u?: TgUser): string | null {
  if (!u) return null;
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || String(u.id);
}

/**
 * Ссылка на сообщение.
 *  - публичная группа: https://t.me/<username>/<id>
 *  - супергруппа (id = -100XXXXXXXXXX): https://t.me/c/XXXXXXXXXX/<id> (открывается у участников)
 *  - обычная (не супер) группа ссылок не поддерживает.
 */
export function messageLink(chat: { id: number | bigint; username?: string | null }, messageId: number): string | null {
  if (chat.username) return `https://t.me/${chat.username}/${messageId}`;
  const id = String(chat.id);
  if (id.startsWith("-100")) return `https://t.me/c/${id.slice(4)}/${messageId}`;
  return null;
}

export const SIMULATED_PREFIX = "SIM_";

function token() {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN не задан");
  return t;
}

export function isBotConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export async function tgCall<T = unknown>(method: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description ?? res.status}`);
  return json.result;
}

export async function setWebhook(url: string) {
  return tgCall("setWebhook", {
    url,
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message", "edited_message", "my_chat_member"],
    max_connections: 40,
  });
}

export type WebhookInfo = {
  url: string;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
};

export async function getWebhookInfo() {
  return tgCall<WebhookInfo>("getWebhookInfo");
}

export async function getMe() {
  return tgCall<TgUser>("getMe");
}

/** Скачать файл (для превью фото в админке). */
export async function downloadFile(fileId: string): Promise<Response> {
  const file = await tgCall<{ file_path: string }>("getFile", { file_id: fileId });
  return fetch(`https://api.telegram.org/file/bot${token()}/${file.file_path}`, { cache: "no-store" });
}
