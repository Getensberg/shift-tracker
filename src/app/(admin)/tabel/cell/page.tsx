import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { dateOnly, formatDateRu, formatLocal } from "@/lib/time";
import { sheetRowName } from "@/lib/sheets";
import { StatusBadge } from "@/components/StatusBadge";
import { Flash } from "@/components/Flash";
import { Submit } from "@/components/Submit";
import { ACTION_LABEL } from "@/lib/labels";
import { manualMarkAction, removeMarkAction } from "../../../actions";


export default async function CellPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const employeeId = Number(sp.e);
  const date = sp.d;
  if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) notFound();

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) notFound();
  const shiftDate = dateOnly(date);
  const [mark, history, related] = await Promise.all([
    prisma.shiftMark.findUnique({
      where: { employeeId_shiftDate: { employeeId, shiftDate } },
      include: { message: { include: { group: true } } },
    }),
    prisma.auditLog.findMany({ where: { employeeId, shiftDate }, orderBy: { at: "desc" }, include: { message: true } }),
    prisma.message.findMany({
      where: { suggestedDate: shiftDate, suggestedIds: { has: employeeId } },
      orderBy: { sentAt: "asc" },
      include: { group: true },
    }),
  ]);
  const self = `/tabel/cell?e=${employeeId}&d=${date}`;
  const msg = mark?.message;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            {sheetRowName(employee)} · {formatDateRu(date)}
          </h1>
          <p>
            <Link href={`/tabel?month=${date.slice(0, 7)}`}>← к табелю</Link>
          </p>
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <div className="grid-2">
        <div className="card">
          <h2>Отметка</h2>
          {mark ? (
            <div className="stack">
              <div className="review-card" style={{ gridTemplateColumns: msg ? "180px 1fr" : "1fr" }}>
                {msg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/photo/${msg.id}`} alt="Фото заступления" className="photo" />
                ) : null}
                <dl className="kv">
                  <dt>Значение</dt>
                  <dd><b>{mark.value}</b> — {mark.source === "AUTO" ? "автоматически" : `вручную (${mark.createdBy})`}</dd>
                  {mark.objectName ? (<><dt>Объект</dt><dd>{mark.objectName}</dd></>) : null}
                  {msg ? (
                    <>
                      <dt>Группа</dt><dd>{msg.group?.title}</dd>
                      <dt>Отправил</dt><dd>{msg.fromName}{msg.fromUsername ? ` (@${msg.fromUsername})` : ""}</dd>
                      <dt>Время фото</dt><dd>{formatLocal(msg.sentAt, msg.group?.timezone)}{mark.lateMinutes ? <span className="tag" style={{ marginLeft: 6 }}>опоздание {mark.lateMinutes} мин</span> : null}</dd>
                      <dt>Подпись</dt><dd>{msg.caption ? `«${msg.caption}»` : <span className="muted">нет</span>}</dd>
                      <dt>Сообщение</dt>
                      <dd>
                        #{msg.tgMessageId}{" "}
                        {msg.link ? <a href={msg.link} target="_blank" rel="noreferrer">открыть в Telegram ↗</a> : <span className="muted">(ссылка недоступна{msg.simulated ? " — симуляция" : ""})</span>}
                      </dd>
                      <dt>Решение</dt><dd className="small">{msg.reason}</dd>
                    </>
                  ) : null}
                  {mark.comment ? (<><dt>Комментарий</dt><dd>{mark.comment}</dd></>) : null}
                  <dt>Google Sheets</dt><dd><span className="tag">{mark.sheetStatus}</span> {mark.sheetError ? <span className="small muted">{mark.sheetError}</span> : null}</dd>
                </dl>
              </div>
              <form action={removeMarkAction} className="row">
                <input type="hidden" name="markId" value={mark.id} />
                <input type="hidden" name="back" value={self} />
                <input type="text" name="comment" placeholder="Причина снятия" className="grow" required />
                <Submit className="btn danger" pendingText="…">Снять отметку</Submit>
              </form>
            </div>
          ) : (
            <div className="stack">
              <p className="muted">Отметки нет: сотрудник не заступил или система не подтвердила факт заступления.</p>
              <form action={manualMarkAction} className="row">
                <input type="hidden" name="employeeId" value={employeeId} />
                <input type="hidden" name="date" value={date} />
                <input type="text" name="comment" placeholder="Причина (напр. фото прислал в личку)" className="grow" required />
                <Submit pendingText="…">Поставить 1 вручную</Submit>
              </form>
            </div>
          )}
        </div>

        <div className="card">
          <h2>История изменений</h2>
          {history.length === 0 ? (
            <p className="muted">Изменений не было.</p>
          ) : (
            <ul className="timeline">
              {history.map((h) => (
                <li key={h.id}>
                  <div className="row">
                    <b>{ACTION_LABEL[h.action] ?? h.action}</b>
                    <span className="muted small">{formatLocal(h.at)} · {h.actor}</span>
                  </div>
                  {h.details ? <div className="small">{h.details}</div> : null}
                </li>
              ))}
            </ul>
          )}
          {related.length > 0 ? (
            <>
              <h3 style={{ marginTop: 16 }}>Сообщения по сотруднику за эту смену</h3>
              <ul className="timeline">
                {related.map((m) => (
                  <li key={m.id} className="row">
                    <StatusBadge status={m.status} />
                    <span className="small">{formatLocal(m.sentAt, m.group?.timezone)} · «{m.caption ?? "без подписи"}»</span>
                    <Link className="small" href={`/journal?q=${m.id}`}>в журнал</Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
