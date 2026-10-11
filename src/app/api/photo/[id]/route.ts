import { prisma } from "@/lib/db";
import { downloadFile, isBotConfigured } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function placeholder(text: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
<rect width="300" height="400" fill="#e7ebf0"/>
<circle cx="150" cy="150" r="48" fill="#c3ccd8"/><rect x="85" y="210" width="130" height="120" rx="30" fill="#c3ccd8"/>
<text x="150" y="372" font-family="sans-serif" font-size="15" fill="#5b6675" text-anchor="middle">${text}</text></svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "private, max-age=86400" } });
}

/** Превью фото: файлы храним в Telegram, отдаём через прокси (токен бота не светится). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const msg = await prisma.message.findUnique({ where: { id: Number(id) }, select: { photoFileId: true, simulated: true } });
  if (!msg?.photoFileId) return new Response("not found", { status: 404 });
  if (msg.simulated) return placeholder("фото из симулятора");
  if (!isBotConfigured()) return placeholder("бот не настроен");
  try {
    const file = await downloadFile(msg.photoFileId);
    if (!file.ok || !file.body) return placeholder("фото недоступно");
    return new Response(file.body, {
      headers: {
        "content-type": file.headers.get("content-type") ?? "image/jpeg",
        "cache-control": "private, max-age=86400",
      },
    });
  } catch {
    return placeholder("фото недоступно");
  }
}
