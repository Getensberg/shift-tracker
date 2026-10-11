import { prisma } from "@/lib/db";
import { formatLocal, toDateStr } from "@/lib/time";
import { Flash } from "@/components/Flash";
import { Submit } from "@/components/Submit";
import { approveAction, rejectAction } from "../../actions";

export default async function ReviewPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const items = await prisma.message.findMany({
    where: { status: "REVIEW" },
    orderBy: { sentAt: "asc" },
    take: 50,
    include: { group: { include: { employees: { include: { employee: true } } } } },
  });
  const allEmployees = await prisma.employee.findMany({ where: { active: true }, orderBy: { lastName: "asc" } });
  const total = await prisma.message.count({ where: { status: "REVIEW" } });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ручная проверка</h1>
          <p>
            Спорные случаи: система не смогла однозначно определить сотрудника, время или их несколько. Подтвердите — и в
            табеле появится 1 с основанием этого сообщения.
          </p>
        </div>
        <span className="muted">{total} в очереди</span>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      {items.length === 0 ? (
        <div className="card empty">Всё проверено — спорных сообщений нет.</div>
      ) : (
        <div className="stack">
          {items.map((m) => {
            const staff = m.group?.employees.map((g) => g.employee).filter((e) => e.active) ?? [];
            const options = staff.length ? staff : allEmployees;
            const extra = allEmployees.filter((e) => m.suggestedIds.includes(e.id) && !options.some((o) => o.id === e.id));
            const list = [...options, ...extra];
            const date = m.suggestedDate ? toDateStr(m.suggestedDate) : "";
            return (
              <div className="card review-card" key={m.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/photo/${m.id}`} alt="Фото из сообщения" loading="lazy" />
                <div>
                  <div className="reason-box">{m.reason}</div>
                  <div className="caption-quote">{m.caption ? `«${m.caption}»` : <span className="muted">без подписи</span>}</div>
                  <dl className="kv" style={{ marginBottom: 14 }}>
                    <dt>Группа</dt><dd>{m.group?.title}{m.group?.objectName ? ` · ${m.group.objectName}` : ""}</dd>
                    <dt>Отправил</dt><dd>{m.fromName}{m.fromUsername ? ` (@${m.fromUsername})` : ""} <span className="muted small">id {String(m.fromUserId)}</span></dd>
                    <dt>Время</dt><dd>{formatLocal(m.sentAt, m.group?.timezone)} <span className="muted small">(смена {m.group?.shiftStart})</span></dd>
                    <dt>Сообщение</dt><dd>#{m.tgMessageId} {m.link ? <a href={m.link} target="_blank" rel="noreferrer">открыть ↗</a> : null}</dd>
                  </dl>
                  <form action={approveAction} className="stack" style={{ gap: 10 }}>
                    <input type="hidden" name="messageId" value={m.id} />
                    <div className="field">
                      <span className="small" style={{ fontWeight: 550 }}>Кто на фото</span>
                      <div className="checks">
                        {list.map((e) => (
                          <label className="check" key={e.id}>
                            <input type="checkbox" name="employeeIds" value={e.id} defaultChecked={m.suggestedIds.includes(e.id)} />
                            {e.lastName}{e.firstName ? ` ${e.firstName[0]}.` : ""}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="row">
                      <label className="field">
                        Дата смены
                        <input type="date" name="shiftDate" defaultValue={date} required />
                      </label>
                      <label className="field grow">
                        Комментарий
                        <input type="text" name="comment" placeholder="необязательно" />
                      </label>
                    </div>
                    <div className="row">
                      <Submit className="btn ok" pendingText="Сохраняю…">Подтвердить — поставить 1</Submit>
                      <Submit className="btn danger" pendingText="…" formAction={rejectAction} formNoValidate>
                        Отклонить
                      </Submit>
                    </div>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
