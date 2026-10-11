import Link from "next/link";
import { prisma } from "@/lib/db";
import { Flash } from "@/components/Flash";
import { Submit } from "@/components/Submit";
import { saveEmployeeAction } from "../../actions";
import { EmployeeFields } from "./EmployeeFields";

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const employees = await prisma.employee.findMany({
    orderBy: [{ active: "desc" }, { lastName: "asc" }],
    include: { groups: { include: { group: true } }, _count: { select: { marks: true } } },
  });
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Сотрудники</h1>
          <p>Справочник для сопоставления: фамилия, позывные, табельный номер и привязка аккаунта Telegram.</p>
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="stack">
        <div className="card flush">
          {employees.length === 0 ? (
            <div className="empty">Сотрудников нет.</div>
          ) : (
            <table className="list">
              <thead>
                <tr><th>Сотрудник</th><th>Таб. №</th><th>Позывные</th><th>Telegram</th><th>Группы</th><th>Смен</th><th></th></tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id} style={e.active ? undefined : { opacity: 0.55 }}>
                    <td><b>{e.lastName}</b> {[e.firstName, e.middleName].filter(Boolean).join(" ")}{!e.active ? <span className="tag" style={{ marginLeft: 6 }}>неактивен</span> : null}</td>
                    <td className="mono">{e.personnelNumber ?? "—"}</td>
                    <td className="small">{e.aliases.join(", ") || "—"}</td>
                    <td className="small">{e.tgUserId ? <span className="mono">{String(e.tgUserId)}</span> : <span className="muted">не привязан</span>}{e.tgUsername ? <div className="muted">@{e.tgUsername}</div> : null}</td>
                    <td className="small">{e.groups.map((g) => g.group.title).join(", ") || "—"}</td>
                    <td>{e._count.marks}</td>
                    <td><Link className="btn sm" href={`/employees/${e.id}`}>Изменить</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <form action={saveEmployeeAction} className="card stack">
          <h2>Добавить сотрудника</h2>
          <input type="hidden" name="id" value="0" />
          <EmployeeFields />
          <div><Submit pendingText="Сохраняю…">Добавить</Submit></div>
        </form>
      </div>
    </>
  );
}
