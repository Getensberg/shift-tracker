import { prisma } from "@/lib/db";
import { Nav } from "@/components/Nav";
import { logoutAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [review, errors, newGroups] = await Promise.all([
    prisma.message.count({ where: { status: "REVIEW" } }),
    prisma.message.count({ where: { status: "ERROR" } }),
    prisma.group.count({ where: { active: false } }),
  ]);
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <div className="brand-mark">✓</div>
          <div>
            Табель смен
            <small>учёт по фото из Telegram</small>
          </div>
        </div>
        <Nav
          sections={[
            {
              title: "Учёт",
              items: [
                { href: "/tabel", label: "Табель" },
                { href: "/review", label: "На проверке", count: review },
                { href: "/journal", label: "Журнал сообщений", count: errors },
                { href: "/audit", label: "История изменений" },
              ],
            },
            {
              title: "Настройки",
              items: [
                { href: "/groups", label: "Группы и объекты", count: newGroups },
                { href: "/employees", label: "Сотрудники" },
                { href: "/settings", label: "Интеграции" },
                { href: "/simulator", label: "Симулятор" },
              ],
            },
          ]}
        />
        <div className="side-foot">
          <form action={logoutAction}>
            <button type="submit">Выйти</button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
