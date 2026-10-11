import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Flash } from "@/components/Flash";
import { Submit } from "@/components/Submit";
import { saveGroupAction } from "../../../actions";

export default async function GroupEdit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const g = await prisma.group.findUnique({ where: { id: Number(id) }, include: { employees: true } });
  if (!g) notFound();
  const employees = await prisma.employee.findMany({ where: { active: true }, orderBy: { lastName: "asc" } });
  const bound = new Set(g.employees.map((e) => e.employeeId));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{g.title}</h1>
          <p><Link href="/groups">← все группы</Link> · chat id <span className="mono">{String(g.chatId)}</span></p>
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <form action={saveGroupAction} className="stack">
        <input type="hidden" name="id" value={g.id} />
        <div className="card stack">
          <h2>Основное</h2>
          <div className="checks">
            <label className="check"><input type="checkbox" name="active" defaultChecked={g.active} /> Группа подключена к учёту</label>
            <label className="check"><input type="checkbox" name="autoAccept" defaultChecked={g.autoAccept} /> Автоматически ставить 1 в очевидных случаях</label>
          </div>
          <div className="form-grid">
            <label className="field">Название<input type="text" name="title" defaultValue={g.title} required /></label>
            <label className="field">Объект / пост<input type="text" name="objectName" defaultValue={g.objectName ?? ""} /></label>
          </div>
        </div>

        <div className="card stack">
          <h2>График и окно подтверждения</h2>
          <p className="muted small">
            Дата смены — дата её начала. Фото, отправленное в окне [начало − до; начало + после], считается заступлением.
            Например, смена с 23:00 и фото в 00:20 — это смена предыдущих суток.
          </p>
          <div className="form-grid">
            <label className="field">Начало смены<input type="time" name="shiftStart" defaultValue={g.shiftStart} required /></label>
            <label className="field">Окно до начала, мин<input type="number" name="windowBeforeMin" min={0} max={719} defaultValue={g.windowBeforeMin} /></label>
            <label className="field">Окно после начала, мин<input type="number" name="windowAfterMin" min={0} max={719} defaultValue={g.windowAfterMin} /></label>
            <label className="field">Часовой пояс<input type="text" name="timezone" defaultValue={g.timezone} /></label>
          </div>
        </div>

        <div className="card stack">
          <h2>Правила</h2>
          <div className="form-grid">
            <label className="field">
              Фото вне окна
              <select name="outOfWindow" defaultValue={g.outOfWindow}>
                <option value="REVIEW">На ручную проверку</option>
                <option value="REJECT">Отклонять</option>
              </select>
            </label>
            <label className="field">
              Несколько сотрудников в подписи
              <select name="multiEmployee" defaultValue={g.multiEmployee}>
                <option value="REVIEW">На ручную проверку</option>
                <option value="ACCEPT_ALL">Отмечать всех</option>
              </select>
            </label>
          </div>
        </div>

        <div className="card stack">
          <h2>Сотрудники группы</h2>
          <p className="muted small">Подпись сопоставляется только с этим списком — меньше ложных совпадений. Если никто не выбран — со всеми активными сотрудниками.</p>
          <div className="checks">
            {employees.map((e) => (
              <label className="check" key={e.id}>
                <input type="checkbox" name="employeeIds" value={e.id} defaultChecked={bound.has(e.id)} />
                {e.lastName}{e.firstName ? ` ${e.firstName}` : ""}
              </label>
            ))}
          </div>
        </div>
        <div><Submit pendingText="Сохраняю…">Сохранить</Submit></div>
      </form>
    </>
  );
}
