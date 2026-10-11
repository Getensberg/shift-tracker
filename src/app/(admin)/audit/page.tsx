import Link from "next/link";
import { prisma } from "@/lib/db";
import { ACTION_LABEL } from "@/lib/labels";
import { formatDateRu, formatLocal, toDateStr } from "@/lib/time";

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const employeeId = Number(sp.employee) || undefined;
  const [items, employees] = await Promise.all([
    prisma.auditLog.findMany({
      where: employeeId ? { employeeId } : {},
      orderBy: { at: "desc" },
      take: 300,
      include: { employee: true, message: true },
    }),
    prisma.employee.findMany({ orderBy: { lastName: "asc" } }),
  ]);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>История изменений</h1>
          <p>Все автоматические и ручные изменения табеля и справочников (последние 300).</p>
        </div>
        <form className="row" action="/audit">
          <select name="employee" defaultValue={employeeId ?? ""}>
            <option value="">Все сотрудники</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.lastName}</option>)}
          </select>
          <button className="btn" type="submit">Показать</button>
        </form>
      </div>
      <div className="card flush">
        {items.length === 0 ? (
          <div className="empty">Изменений пока нет.</div>
        ) : (
          <table className="list">
            <thead>
              <tr><th>Когда</th><th>Кто</th><th>Действие</th><th>Сотрудник · дата</th><th>Детали</th><th>Сообщение</th></tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{formatLocal(a.at)}</td>
                  <td><span className="tag">{a.actor}</span></td>
                  <td>{ACTION_LABEL[a.action] ?? a.action}</td>
                  <td className="small">
                    {a.employee && a.shiftDate ? (
                      <Link href={`/tabel/cell?e=${a.employeeId}&d=${toDateStr(a.shiftDate)}`}>
                        {a.employee.lastName} · {formatDateRu(toDateStr(a.shiftDate))}
                      </Link>
                    ) : (
                      a.employee?.lastName ?? "—"
                    )}
                  </td>
                  <td className="small reason">{a.details}</td>
                  <td className="small">
                    {a.message ? <Link href={`/journal?q=${a.message.id}`}>#{a.message.id}</Link> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
