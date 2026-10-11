import Link from "next/link";
import { prisma } from "@/lib/db";
import { loadTabel, shiftMonth } from "@/lib/tabel";
import { MONTHS_RU, zonedParts } from "@/lib/time";

export default async function TabelPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const t = await loadTabel(sp.month);
  const [review, syncErrors] = await Promise.all([
    prisma.message.count({ where: { status: "REVIEW" } }),
    prisma.shiftMark.count({ where: { sheetStatus: "ERROR" } }),
  ]);
  const now = zonedParts(new Date(), "Europe/Moscow");
  const todayDay = now.year === t.year && now.month === t.mon ? now.day : -1;
  const weekend = (d: number) => [0, 6].includes(new Date(Date.UTC(t.year, t.mon - 1, d)).getUTCDay());
  const auto = t.marks.filter((m) => m.source === "AUTO").length;
  const dayStr = (d: number) => `${t.month}-${String(d).padStart(2, "0")}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            Табель — {MONTHS_RU[t.mon - 1]} {t.year}
          </h1>
          <p>Клик по ячейке — основание отметки, история изменений и ручная корректировка.</p>
        </div>
        <div className="row">
          <Link className="btn" href={`/tabel?month=${shiftMonth(t.month, -1)}`}>←</Link>
          <form className="row" action="/tabel">
            <input type="month" name="month" defaultValue={t.month} />
            <button className="btn" type="submit">Показать</button>
          </form>
          <Link className="btn" href={`/tabel?month=${shiftMonth(t.month, 1)}`}>→</Link>
          <a className="btn primary" href={`/api/export?month=${t.month}`}>Скачать .xlsx</a>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><b>{t.total}</b><span>смен отмечено за месяц</span></div>
        <div className="stat"><b>{t.total ? Math.round((auto / t.total) * 100) : 0}%</b><span>отмечено автоматически</span></div>
        <Link href="/review" className={`stat ${review ? "warn" : ""}`} style={{ textDecoration: "none", color: "inherit" }}>
          <b>{review}</b><span>ждут ручной проверки</span>
        </Link>
        <Link href="/settings" className={`stat ${syncErrors ? "bad" : ""}`} style={{ textDecoration: "none", color: "inherit" }}>
          <b>{syncErrors}</b><span>ошибок синхронизации с Google Sheets</span>
        </Link>
      </div>

      <div className="card flush">
        <div className="card-head">
          <div className="legend">
            <span><i style={{ background: "var(--auto)" }} />автоматически</span>
            <span><i style={{ background: "var(--manual)" }} />вручную / оператором</span>
          </div>
          <span className="muted small">{t.rows.length} сотрудников</span>
        </div>
        {t.rows.length === 0 ? (
          <div className="empty">
            Справочник сотрудников пуст. <Link href="/employees">Добавьте сотрудников</Link> или загрузите демо-данные в{" "}
            <Link href="/simulator">симуляторе</Link>.
          </div>
        ) : (
          <div className="tabel-wrap">
            <table className="tabel">
              <thead>
                <tr>
                  <th className="name">Ф.И.О.</th>
                  {Array.from({ length: t.days }, (_, i) => i + 1).map((d) => (
                    <th key={d} className={`${weekend(d) ? "we" : ""} ${d === todayDay ? "today" : ""}`}>{d}</th>
                  ))}
                  <th className="total">смен</th>
                </tr>
              </thead>
              <tbody>
                {t.rows.map((r) => (
                  <tr key={r.employee.id}>
                    <td className="name">
                      <Link href={`/employees/${r.employee.id}`} style={{ color: "inherit" }}>{r.name}</Link>
                      {!r.employee.active ? <span className="tag" style={{ marginLeft: 6 }}>уволен</span> : null}
                    </td>
                    {Array.from({ length: t.days }, (_, i) => i + 1).map((d) => {
                      const mk = r.cells[d];
                      const title = mk
                        ? `${mk.source === "AUTO" ? "Авто" : "Вручную"}${mk.message?.caption ? ` · «${mk.message.caption}»` : ""}${mk.lateMinutes ? ` · опоздание ${mk.lateMinutes} мин` : ""}`
                        : "Нет отметки";
                      return (
                        <td key={d} className={`cell ${mk ? mk.source : ""} ${weekend(d) ? "we" : ""}`}>
                          <Link href={`/tabel/cell?e=${r.employee.id}&d=${dayStr(d)}`} title={title}>
                            {mk ? mk.value : ""}
                          </Link>
                        </td>
                      );
                    })}
                    <td className="total">{r.total}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="name">ИТОГ:</td>
                  {t.dayTotals.map((n, i) => <td key={i}>{n || ""}</td>)}
                  <td className="total">{t.total}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
