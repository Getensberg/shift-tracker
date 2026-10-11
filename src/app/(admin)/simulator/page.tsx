import { prisma } from "@/lib/db";
import { zonedParts, ymd } from "@/lib/time";
import { Flash } from "@/components/Flash";
import { Submit } from "@/components/Submit";
import { resetSimAction, seedAction } from "../../actions";
import { ScenarioRunner, SimForm } from "./SimClient";

export default async function SimulatorPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const groups = await prisma.group.findMany({ orderBy: { title: "asc" } });
  const employees = await prisma.employee.findMany({ where: { tgUserId: { not: null } }, orderBy: { lastName: "asc" } });
  const now = zonedParts(new Date(), "Europe/Moscow");
  const today = ymd(now.year, now.month, now.day);
  const simCount = await prisma.message.count({ where: { simulated: true } });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Симулятор Telegram</h1>
          <p>
            Формирует настоящий Telegram Update и прогоняет его через тот же код, что и вебхук. Удобно для демонстрации без
            реальной группы.
          </p>
        </div>
        <div className="row">
          <form action={seedAction}><Submit className="btn" pendingText="…">Загрузить демо-справочник</Submit></form>
          <form action={resetSimAction}><Submit className="btn danger" pendingText="…">Удалить данные симуляции ({simCount})</Submit></form>
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="stack">
        <ScenarioRunner today={today} />
        <SimForm
          today={today}
          groups={groups.map((g) => ({ id: g.id, title: g.title, active: g.active, shiftStart: g.shiftStart }))}
          accounts={employees.map((e) => ({ id: String(e.tgUserId), name: e.lastName }))}
        />
      </div>
    </>
  );
}
