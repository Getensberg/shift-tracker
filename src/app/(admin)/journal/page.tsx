import Link from "next/link";
import type { MessageStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatDateRu, formatLocal, toDateStr } from "@/lib/time";
import { StatusBadge, STATUS_LABEL } from "@/components/StatusBadge";
import { Flash } from "@/components/Flash";
import { Submit } from "@/components/Submit";
import { reprocessAction } from "../../actions";

const PAGE = 50;
const STATUSES: MessageStatus[] = ["ACCEPTED", "REVIEW", "DUPLICATE", "REJECTED", "ERROR", "IGNORED", "PENDING"];

export default async function JournalPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as MessageStatus) ? (sp.status as MessageStatus) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim();
  const groupId = Number(sp.group) || undefined;

  const where: Prisma.MessageWhereInput = {
    ...(status ? { status } : {}),
    ...(groupId ? { groupId } : {}),
    ...(q ? (/^\d+$/.test(q) ? { OR: [{ id: Number(q) }, { tgMessageId: Number(q) }] } : { caption: { contains: q, mode: "insensitive" } }) : {}),
  };
  const [items, total, counts, groups, employees] = await Promise.all([
    prisma.message.findMany({
      where,
      orderBy: { sentAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: { group: true, marks: { select: { employeeId: true } } },
    }),
    prisma.message.count({ where }),
    prisma.message.groupBy({ by: ["status"], _count: true }),
    prisma.group.findMany({ orderBy: { title: "asc" } }),
    prisma.employee.findMany({ select: { id: true, lastName: true } }),
  ]);
  const countOf = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const all = counts.reduce((s, c) => s + c._count, 0);
  const empName = new Map(employees.map((e) => [e.id, e.lastName]));
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { status, q, group: groupId ? String(groupId) : undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    return `/journal?${p.toString()}`;
  };
  const self = qs({ page: String(page) });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Журнал сообщений</h1>
          <p>Каждое сообщение с фото из подключённых групп: результат обработки и причина решения.</p>
        </div>
        <form className="row" action="/journal">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <select name="group" defaultValue={groupId ?? ""}>
            <option value="">Все группы</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
          <input type="text" name="q" defaultValue={q} placeholder="Подпись или ID" />
          <button className="btn" type="submit">Найти</button>
        </form>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <div className="tabs">
        <Link href={qs({ status: undefined })} className={!status ? "on" : ""}>Все · {all}</Link>
        {STATUSES.map((s) => (
          <Link key={s} href={qs({ status: s })} className={status === s ? "on" : ""}>
            {STATUS_LABEL[s]} · {countOf[s] ?? 0}
          </Link>
        ))}
      </div>

      <div className="card flush">
        {items.length === 0 ? (
          <div className="empty">Сообщений нет. Отправьте фото в подключённую группу или воспользуйтесь <Link href="/simulator">симулятором</Link>.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="list">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Время</th>
                  <th>Группа</th>
                  <th>Отправитель / подпись</th>
                  <th>Статус</th>
                  <th>Сотрудник · смена</th>
                  <th>Причина / комментарий системы</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => {
                  const ids = m.marks.length ? m.marks.map((x) => x.employeeId) : m.suggestedIds;
                  return (
                    <tr key={m.id}>
                      <td className="mono">
                        #{m.id}
                        <div className="muted small">tg {m.tgMessageId}</div>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {formatLocal(m.sentAt, m.group?.timezone)}
                        {m.editedAt ? <div className="tag">изменено</div> : null}
                      </td>
                      <td className="small">{m.group?.title ?? String(m.chatId)}</td>
                      <td>
                        <div className="small muted">{m.fromName}</div>
                        {m.caption ? `«${m.caption}»` : <span className="muted">без подписи</span>}
                      </td>
                      <td><StatusBadge status={m.status} /></td>
                      <td className="small">
                        {ids.map((id) => empName.get(id)).filter(Boolean).join(", ") || "—"}
                        {m.suggestedDate ? <div className="muted">{formatDateRu(toDateStr(m.suggestedDate))}</div> : null}
                      </td>
                      <td className="small reason">{m.reason}</td>
                      <td>
                        <div className="stack" style={{ gap: 6 }}>
                          {m.link ? <a className="small" href={m.link} target="_blank" rel="noreferrer">открыть ↗</a> : null}
                          {m.status === "REVIEW" ? <Link className="small" href="/review">проверить</Link> : null}
                          {["ERROR", "REJECTED", "IGNORED", "DUPLICATE"].includes(m.status) && m.marks.length === 0 ? (
                            <form action={reprocessAction}>
                              <input type="hidden" name="messageId" value={m.id} />
                              <input type="hidden" name="back" value={self} />
                              <Submit className="btn sm">Повторить</Submit>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {total > PAGE ? (
          <div className="pager">
            <span className="muted small">
              {(page - 1) * PAGE + 1}–{Math.min(page * PAGE, total)} из {total}
            </span>
            {page > 1 ? <Link className="btn sm" href={qs({ page: String(page - 1) })}>←</Link> : null}
            {page * PAGE < total ? <Link className="btn sm" href={qs({ page: String(page + 1) })}>→</Link> : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
