import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Flash } from "@/components/Flash";
import { Submit } from "@/components/Submit";
import { saveEmployeeAction } from "../../../actions";
import { EmployeeFields } from "../EmployeeFields";

export default async function EmployeeEdit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const e = await prisma.employee.findUnique({ where: { id: Number(id) } });
  if (!e) notFound();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{e.lastName} {e.firstName ?? ""}</h1>
          <p><Link href="/employees">← все сотрудники</Link> · <Link href={`/audit?employee=${e.id}`}>история изменений</Link></p>
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <form action={saveEmployeeAction} className="card stack">
        <input type="hidden" name="id" value={e.id} />
        <EmployeeFields e={e} />
        <label className="check"><input type="checkbox" name="active" defaultChecked={e.active} /> Активен (участвует в сопоставлении)</label>
        <div><Submit pendingText="Сохраняю…">Сохранить</Submit></div>
      </form>
    </>
  );
}
