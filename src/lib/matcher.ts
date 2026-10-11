// Сопоставление подписи к фото со справочником сотрудников.
// Чистая функция без БД — легко тестировать.

export type Candidate = {
  id: number;
  lastName: string;
  firstName?: string | null;
  aliases: string[];
  personnelNumber?: string | null;
};

export type CaptionMatch = {
  /** Однозначно найденные сотрудники. */
  matched: Candidate[];
  /** Слова подписи, которым соответствует больше одного сотрудника. */
  ambiguous: { token: string; candidates: Candidate[] }[];
  /** Как найдено: точное совпадение или с учётом опечаток / окончаний. */
  fuzzy: boolean;
};

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(caption: string): string[] {
  const out: string[] = [];
  for (const raw of normalize(caption).split(" ")) {
    if (!raw) continue;
    out.push(raw);
    // "Иванов-Петров" ищем и целиком, и по частям
    if (raw.includes("-")) out.push(...raw.split("-").filter(Boolean));
  }
  return out;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 99;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

function keysOf(c: Candidate): string[] {
  const keys = [c.lastName, ...c.aliases].map(normalize).filter((k) => k.length >= 3);
  if (c.personnelNumber) keys.push(normalize(c.personnelNumber));
  return keys;
}

const ENDINGS = ["ского", "скому", "ским", "ском", "ский", "ская", "ской", "ого", "ому", "ым", "ом", "ой", "ий", "ый", "ая", "а", "у", "е", "ы"];

/** Грубый «стемминг» фамилий: Македонского -> македон, Петрову -> петров. */
export function stem(word: string): string {
  for (const e of ENDINGS) if (word.endsWith(e) && word.length - e.length >= 4) return word.slice(0, -e.length);
  return word;
}

/** Нечёткое сравнение: опечатка в 1 символ или падежное окончание (Петрова, Македонского). */
function fuzzyEq(token: string, key: string): boolean {
  if (key.length < 5 || /^\d+$/.test(key)) return false;
  if (token.startsWith(key) && token.length - key.length <= 2) return true; // окончания
  if (stem(token) === stem(key)) return true;
  return levenshtein(token, key) <= 1;
}

/**
 * Если у нескольких сотрудников одинаковая фамилия — пробуем уточнить по
 * имени или инициалу из подписи ("Петров А.", "Петров Андрей").
 */
function narrowByFirstName(cands: Candidate[], tokens: string[]): Candidate[] {
  const narrowed = cands.filter((c) => {
    if (!c.firstName) return false;
    const fn = normalize(c.firstName);
    return tokens.some((t) => t === fn || (t.length === 1 && t === fn[0]));
  });
  return narrowed.length === 1 ? narrowed : cands;
}

export function matchCaption(caption: string | null | undefined, candidates: Candidate[]): CaptionMatch {
  const result: CaptionMatch = { matched: [], ambiguous: [], fuzzy: false };
  if (!caption) return result;
  const tokens = tokenize(caption);
  const found = new Map<number, Candidate>();

  const resolve = (token: string, cands: Candidate[]) => {
    const unique = [...new Map(cands.map((c) => [c.id, c])).values()];
    const narrowed = unique.length > 1 ? narrowByFirstName(unique, tokens) : unique;
    if (narrowed.length === 1) found.set(narrowed[0].id, narrowed[0]);
    else if (narrowed.length > 1) result.ambiguous.push({ token, candidates: narrowed });
  };

  for (const token of tokens) {
    if (token.length < 3 && !/^\d+$/.test(token)) continue;
    const exact = candidates.filter((c) => keysOf(c).includes(token));
    if (exact.length) {
      resolve(token, exact);
      continue;
    }
    const fuzzy = candidates.filter((c) => keysOf(c).some((k) => fuzzyEq(token, k)));
    if (fuzzy.length) {
      result.fuzzy = true;
      resolve(token, fuzzy);
    }
  }

  // Неоднозначность, которую уже разрешил другой токен, не считается.
  result.ambiguous = result.ambiguous.filter((a) => !a.candidates.some((c) => found.has(c.id)));
  result.matched = [...found.values()];
  return result;
}
