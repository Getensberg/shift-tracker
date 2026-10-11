import type { Employee } from "@prisma/client";

export function EmployeeFields({ e }: { e?: Employee }) {
  return (
    <div className="form-grid">
      <label className="field">Фамилия *<input type="text" name="lastName" defaultValue={e?.lastName} required /></label>
      <label className="field">Имя<input type="text" name="firstName" defaultValue={e?.firstName ?? ""} /></label>
      <label className="field">Отчество<input type="text" name="middleName" defaultValue={e?.middleName ?? ""} /></label>
      <label className="field">Табельный номер<input type="text" name="personnelNumber" defaultValue={e?.personnelNumber ?? ""} /></label>
      <label className="field">
        <span>Позывные / варианты написания <span className="hint">через запятую</span></span>
        <input type="text" name="aliases" defaultValue={e?.aliases.join(", ")} />
      </label>
      <label className="field">
        <span>Telegram ID <span className="hint">число, напр. от @userinfobot</span></span>
        <input type="text" name="tgUserId" inputMode="numeric" defaultValue={e?.tgUserId ? String(e.tgUserId) : ""} />
      </label>
      <label className="field">Telegram @username<input type="text" name="tgUsername" defaultValue={e?.tgUsername ?? ""} /></label>
    </div>
  );
}
