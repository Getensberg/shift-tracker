"use client";

import Link from "next/link";
import { useActionState } from "react";
import { scenariosAction, simulateAction } from "../../actions";
import { StatusBadge } from "@/components/StatusBadge";
import { Submit } from "@/components/Submit";

export function ScenarioRunner({ today }: { today: string }) {
  const [state, action] = useActionState(scenariosAction, null);
  const passed = state?.rows?.filter((r) => r.ok).length ?? 0;
  return (
    <div className="card stack">
      <div className="row">
        <h2 className="grow" style={{ margin: 0 }}>Сценарии из ТЗ (п. 9)</h2>
        <form action={action} className="row">
          <label className="field" style={{ flexDirection: "row", alignItems: "center" }}>
            Дата смены <input type="date" name="date" defaultValue={today} required />
          </label>
          <label className="check"><input type="checkbox" name="cleanup" defaultChecked /> очистить прошлую симуляцию</label>
          <Submit pendingText="Прогоняю…">Прогнать 16 сценариев</Submit>
        </form>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Дневной пост — смена 08:00 (окно −60/+90 мин), ночной — 23:00. После прогона результат виден в табеле, журнале и на проверке.
      </p>
      {state?.err ? <div className="flash err">{state.err}</div> : null}
      {state?.rows ? (
        <>
          <div className={`flash ${passed === state.rows.length ? "ok" : "err"}`} style={{ margin: 0 }}>
            Совпало с ожиданием: {passed} из {state.rows.length}.{" "}
            <Link href={`/tabel?month=${state.date?.slice(0, 7)}`}>Открыть табель →</Link>
          </div>
          <div className="card flush">
            <table className="list">
              <thead>
                <tr><th>#</th><th>Ситуация</th><th>Ожидается</th><th>Результат</th><th>Комментарий системы</th></tr>
              </thead>
              <tbody>
                {state.rows.map((r, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td><b>{r.title}</b><div className="muted small">{r.description}</div></td>
                    <td><StatusBadge status={r.expected} /></td>
                    <td><StatusBadge status={r.actual} /> {r.ok ? "✓" : "✗"}</td>
                    <td className="small reason">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function SimForm({
  today,
  groups,
  accounts,
}: {
  today: string;
  groups: { id: number; title: string; active: boolean; shiftStart: string }[];
  accounts: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(simulateAction, null);
  return (
    <form action={action} className="card stack">
      <h2>Отправить одно сообщение</h2>
      {groups.length === 0 ? <p className="muted">Нет групп — загрузите демо-справочник.</p> : null}
      <div className="form-grid">
        <label className="field">
          Группа
          <select name="groupId" required>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title} · смена {g.shiftStart}{g.active ? "" : " (выключена)"}
              </option>
            ))}
          </select>
        </label>
        <label className="field">Дата<input type="date" name="date" defaultValue={today} required /></label>
        <label className="field">Время (местное)<input type="time" name="time" defaultValue="07:50" required /></label>
        <label className="field">
          <span>Telegram ID отправителя <span className="hint">привязанные: {accounts.map((a) => `${a.name} ${a.id}`).join(", ") || "нет"}</span></span>
          <input type="text" name="fromId" defaultValue="700500" inputMode="numeric" />
        </label>
        <label className="field">Имя отправителя<input type="text" name="fromName" defaultValue="Тестовый охранник" /></label>
        <label className="field">Подпись к фото<input type="text" name="caption" placeholder="напр. Мехоношин" /></label>
      </div>
      <label className="check"><input type="checkbox" name="withPhoto" defaultChecked /> Сообщение с фото</label>
      <div className="row">
        <Submit pendingText="Отправляю…">Отправить</Submit>
        {state?.err ? <span className="flash err" style={{ margin: 0 }}>{state.err}</span> : null}
        {state?.status ? (
          <span className="row"><StatusBadge status={state.status} /> <span className="small">{state.reason}</span></span>
        ) : null}
      </div>
    </form>
  );
}
