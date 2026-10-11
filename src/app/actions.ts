"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, isValidSession, sessionToken } from "@/lib/session";
import { approveReview, rejectReview, reprocess, retryPending } from "@/lib/pipeline";
import { createMark, removeMark, syncCreated } from "@/lib/marks";
import { callSheets } from "@/lib/sheets";
import { getWebhookInfo, setWebhook } from "@/lib/telegram";
import { parseHHMM, zonedToUtc } from "@/lib/time";
import { resetSimulated, runScenarios, seedDemo, simulate, type ScenarioRow } from "@/lib/demo";

const ACTOR = "admin";

async function requireAuth() {
  const c = await cookies();
  if (!(await isValidSession(c.get(SESSION_COOKIE)?.value))) redirect("/login");
}

function back(path: string, msg: { ok?: string; err?: string }): never {
  const [base, q] = path.split("?");
  const sp = new URLSearchParams(q);
  sp.delete("ok");
  sp.delete("err");
  if (msg.ok) sp.set("ok", msg.ok);
  if (msg.err) sp.set("err", msg.err);
  redirect(`${base}?${sp.toString()}`);
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => Number(f.get(k));

// ---------------- auth ----------------

export async function loginAction(_: unknown, form: FormData) {
  if (!process.env.ADMIN_PASSWORD) return { error: "ADMIN_PASSWORD не задан в переменных окружения" };
  if (str(form, "password") !== process.env.ADMIN_PASSWORD) return { error: "Неверный пароль" };
  (await cookies()).set(SESSION_COOKIE, await sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  const next = str(form, "next");
  redirect(next.startsWith("/") ? next : "/tabel");
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// ---------------- review ----------------

export async function approveAction(form: FormData) {
  await requireAuth();
  const id = num(form, "messageId");
  const ids = form.getAll("employeeIds").map(Number).filter(Boolean);
  const date = str(form, "shiftDate");
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Укажите дату смены");
    const res = await approveReview(id, ids, date, ACTOR, str(form, "comment"));
    const created = res.filter((r) => r.created).length;
    revalidatePath("/", "layout");
    back(str(form, "back") || "/review", {
      ok: created ? `Отметка поставлена (${created})` : "Отметка за эту дату уже стояла — дубль не создан",
    });
  } catch (e) {
    if (isRedirect(e)) throw e;
    back(str(form, "back") || "/review", { err: errText(e) });
  }
}

export async function rejectAction(form: FormData) {
  await requireAuth();
  await rejectReview(num(form, "messageId"), ACTOR, str(form, "comment"));
  revalidatePath("/", "layout");
  back(str(form, "back") || "/review", { ok: "Сообщение отклонено" });
}

export async function reprocessAction(form: FormData) {
  await requireAuth();
  const backTo = str(form, "back") || "/journal";
  try {
    const status = await reprocess(num(form, "messageId"), ACTOR);
    revalidatePath("/", "layout");
    back(backTo, { ok: `Обработано заново: ${status}` });
  } catch (e) {
    if (isRedirect(e)) throw e;
    back(backTo, { err: errText(e) });
  }
}

// ---------------- tabel ----------------

export async function manualMarkAction(form: FormData) {
  await requireAuth();
  const employeeId = num(form, "employeeId");
  const date = str(form, "date");
  const backTo = `/tabel/cell?e=${employeeId}&d=${date}`;
  const comment = str(form, "comment");
  if (!comment) back(backTo, { err: "Укажите причину ручной отметки" });
  const r = await createMark({ employeeId, shiftDate: date, source: "MANUAL", comment, actor: ACTOR, details: `Ручная отметка: ${comment}` });
  await syncCreated([r]);
  revalidatePath("/", "layout");
  back(backTo, r.created ? { ok: "Отметка поставлена" } : { err: "Отметка уже стоит" });
}

export async function removeMarkAction(form: FormData) {
  await requireAuth();
  const comment = str(form, "comment");
  const backTo = str(form, "back");
  if (!comment) back(backTo, { err: "Укажите причину снятия отметки" });
  await removeMark(num(form, "markId"), ACTOR, comment);
  revalidatePath("/", "layout");
  back(backTo, { ok: "Отметка снята" });
}

// ---------------- справочники ----------------

export async function saveGroupAction(form: FormData) {
  await requireAuth();
  const id = num(form, "id");
  const backTo = `/groups/${id}`;
  try {
    const shiftStart = str(form, "shiftStart");
    parseHHMM(shiftStart);
    const before = num(form, "windowBeforeMin");
    const after = num(form, "windowAfterMin");
    if (!(before >= 0 && before < 720 && after >= 0 && after < 720)) throw new Error("Окно должно быть от 0 до 719 минут");
    const timezone = str(form, "timezone") || "Europe/Moscow";
    new Intl.DateTimeFormat("ru", { timeZone: timezone }); // валидация пояса
    const employeeIds = form.getAll("employeeIds").map(Number).filter(Boolean);
    await prisma.$transaction([
      prisma.group.update({
        where: { id },
        data: {
          title: str(form, "title"),
          objectName: str(form, "objectName") || null,
          timezone,
          shiftStart,
          windowBeforeMin: before,
          windowAfterMin: after,
          outOfWindow: str(form, "outOfWindow") === "REJECT" ? "REJECT" : "REVIEW",
          multiEmployee: str(form, "multiEmployee") === "ACCEPT_ALL" ? "ACCEPT_ALL" : "REVIEW",
          autoAccept: form.get("autoAccept") === "on",
          active: form.get("active") === "on",
        },
      }),
      prisma.groupEmployee.deleteMany({ where: { groupId: id } }),
      prisma.groupEmployee.createMany({ data: employeeIds.map((employeeId) => ({ groupId: id, employeeId })) }),
      prisma.auditLog.create({ data: { actor: ACTOR, action: "GROUP_UPDATED", details: `Группа #${id} «${str(form, "title")}»` } }),
    ]);
    revalidatePath("/", "layout");
  } catch (e) {
    back(backTo, { err: errText(e) });
  }
  back(backTo, { ok: "Сохранено" });
}

export async function saveEmployeeAction(form: FormData) {
  await requireAuth();
  const id = num(form, "id");
  const tgRaw = str(form, "tgUserId");
  const data = {
    lastName: str(form, "lastName"),
    firstName: str(form, "firstName") || null,
    middleName: str(form, "middleName") || null,
    aliases: str(form, "aliases").split(",").map((s) => s.trim()).filter(Boolean),
    personnelNumber: str(form, "personnelNumber") || null,
    tgUserId: tgRaw ? BigInt(tgRaw) : null,
    tgUsername: str(form, "tgUsername").replace(/^@/, "") || null,
    active: id ? form.get("active") === "on" : true,
  };
  const backTo = id ? `/employees/${id}` : "/employees";
  if (!data.lastName) back(backTo, { err: "Фамилия обязательна" });
  if (tgRaw && !/^\d+$/.test(tgRaw)) back(backTo, { err: "Telegram ID — число (узнать можно у @userinfobot)" });
  try {
    if (id) await prisma.employee.update({ where: { id }, data });
    else await prisma.employee.create({ data });
    await prisma.auditLog.create({ data: { actor: ACTOR, action: id ? "EMPLOYEE_UPDATED" : "EMPLOYEE_CREATED", details: data.lastName } });
  } catch (e) {
    back(backTo, { err: errText(e).includes("Unique") ? "Табельный номер или Telegram ID уже заняты" : errText(e) });
  }
  revalidatePath("/", "layout");
  back(backTo, { ok: id ? "Сохранено" : `Сотрудник ${data.lastName} добавлен` });
}

// ---------------- интеграции ----------------

export async function setupWebhookAction() {
  await requireAuth();
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    const url = `${proto}://${host}/api/telegram/webhook`;
    if (!url.startsWith("https://")) throw new Error(`Telegram принимает только https-адрес, а сейчас ${url}. Запустите на Vercel или через туннель (ngrok).`);
    await setWebhook(url);
    const info = await getWebhookInfo();
    back("/settings", { ok: `Вебхук установлен: ${info.url}` });
  } catch (e) {
    if (isRedirect(e)) throw e;
    back("/settings", { err: errText(e) });
  }
}

export async function testSheetsAction() {
  await requireAuth();
  const r = await callSheets({ action: "ping" });
  back("/settings", r.ok ? { ok: "Google Sheets отвечает" } : { err: `Google Sheets: ${r.error}` });
}

export async function retryAction() {
  await requireAuth();
  const r = await retryPending();
  revalidatePath("/", "layout");
  back("/settings", { ok: `Обработано сообщений: ${r.messages}, синхронизировано отметок: ${r.marks}` });
}

// ---------------- симулятор ----------------

export type SimState = { ok?: string; err?: string; status?: string; reason?: string | null } | null;

export async function simulateAction(_: SimState, form: FormData): Promise<SimState> {
  await requireAuth();
  try {
    const group = await prisma.group.findUnique({ where: { id: num(form, "groupId") } });
    if (!group) throw new Error("Выберите группу");
    const [d, t] = [str(form, "date"), str(form, "time")];
    const [y, m, dd] = d.split("-").map(Number);
    const { hour, minute } = parseHHMM(t);
    const r = await simulate({
      chatId: Number(group.chatId),
      chatTitle: group.title,
      fromId: Number(str(form, "fromId") || 700999),
      fromName: str(form, "fromName") || "Тест",
      caption: str(form, "caption") || undefined,
      sentAt: zonedToUtc(y, m, dd, hour, minute, group.timezone),
      withPhoto: form.get("withPhoto") === "on",
    });
    revalidatePath("/", "layout");
    if (!r.statuses.length) return { status: "SKIPPED", reason: r.note };
    const msg = await prisma.message.findFirst({ where: { chatId: group.chatId, tgMessageId: r.tgMessageId } });
    return { status: r.statuses[0], reason: msg?.reason };
  } catch (e) {
    return { err: errText(e) };
  }
}

export type ScenarioState = { rows?: ScenarioRow[]; err?: string; date?: string } | null;

export async function scenariosAction(_: ScenarioState, form: FormData): Promise<ScenarioState> {
  await requireAuth();
  try {
    const date = str(form, "date");
    const rows = await runScenarios(date, form.get("cleanup") === "on");
    revalidatePath("/", "layout");
    return { rows, date };
  } catch (e) {
    return { err: errText(e) };
  }
}

export async function resetSimAction() {
  await requireAuth();
  const n = await resetSimulated();
  revalidatePath("/", "layout");
  back("/simulator", { ok: `Удалено сообщений симулятора: ${n} (вместе с их отметками)` });
}

export async function seedAction() {
  await requireAuth();
  await seedDemo();
  revalidatePath("/", "layout");
  back("/simulator", { ok: "Демо-справочник загружен: 8 сотрудников, 2 группы" });
}

function isRedirect(e: unknown) {
  return typeof e === "object" && e !== null && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
}
