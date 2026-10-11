import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function GroupsPage() {
  const groups = await prisma.group.findMany({
    orderBy: [{ active: "asc" }, { title: "asc" }],
    include: { _count: { select: { employees: true, messages: true } } },
  });
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Группы и объекты</h1>
          <p>
            Группа появляется здесь сама, когда бота добавляют в чат (или когда в нём публикуют первое фото). Новые группы
            выключены — включите и задайте график смены.
          </p>
        </div>
      </div>
      <div className="card flush">
        {groups.length === 0 ? (
          <div className="empty">Групп пока нет. Добавьте бота в рабочий чат Telegram или загрузите демо-данные в симуляторе.</div>
        ) : (
          <table className="list">
            <thead>
              <tr><th>Группа</th><th>Объект</th><th>Смена</th><th>Окно</th><th>Режим</th><th>Сотрудников</th><th>Сообщений</th><th></th></tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td>
                    <b>{g.title}</b>
                    <div className="muted small mono">{String(g.chatId)}</div>
                  </td>
                  <td>{g.objectName ?? "—"}</td>
                  <td>{g.shiftStart} <span className="muted small">{g.timezone}</span></td>
                  <td className="small">−{g.windowBeforeMin} / +{g.windowAfterMin} мин</td>
                  <td>
                    {!g.active ? <span className="badge b-REVIEW">выключена</span> : g.autoAccept ? <span className="badge b-ACCEPTED">авто</span> : <span className="badge b-PENDING">ручное подтв.</span>}
                  </td>
                  <td>{g._count.employees || <span className="muted">все</span>}</td>
                  <td>{g._count.messages}</td>
                  <td><Link className="btn sm" href={`/groups/${g.id}`}>Настроить</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
