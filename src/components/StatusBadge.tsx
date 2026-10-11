export const STATUS_LABEL: Record<string, string> = {
  PENDING: "В очереди",
  ACCEPTED: "Принято",
  REJECTED: "Отклонено",
  REVIEW: "На проверке",
  DUPLICATE: "Дубль",
  ERROR: "Ошибка",
  IGNORED: "Пропущено",
  SKIPPED: "Не сохранено",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge b-${status}`}>{STATUS_LABEL[status] ?? status}</span>;
}
