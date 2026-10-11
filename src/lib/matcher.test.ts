import { describe, expect, it } from "vitest";
import { matchCaption, type Candidate } from "./matcher";

const staff: Candidate[] = [
  { id: 1, lastName: "Мехоношин", aliases: [] },
  { id: 2, lastName: "Петров", firstName: "Андрей", aliases: [] },
  { id: 3, lastName: "Петров", firstName: "Виктор", aliases: [] },
  { id: 4, lastName: "Македонский", aliases: ["Саша-М"], personnelNumber: "1005" },
  { id: 5, lastName: "Семёнов", aliases: [] },
  { id: 6, lastName: "Петрова", aliases: [] },
];

const ids = (c: string | null) => matchCaption(c, staff).matched.map((m) => m.id).sort();

describe("matchCaption", () => {
  it("точное совпадение фамилии, регистр и пунктуация не важны", () => {
    expect(ids("Мехоношин")).toEqual([1]);
    expect(ids("мехоношин.")).toEqual([1]);
    expect(ids("МЕХОНОШИН заступил")).toEqual([1]);
  });
  it("ё = е", () => expect(ids("Семенов")).toEqual([5]));
  it("опечатка в одну букву", () => expect(ids("Мехоношн")).toEqual([1]));
  it("падежное окончание", () => expect(ids("за Македонского")).toEqual([4]));
  it("позывной и табельный номер", () => {
    expect(ids("Саша-М на посту")).toEqual([4]);
    expect(ids("таб 1005")).toEqual([4]);
  });
  it("однофамильцы без имени — неоднозначно", () => {
    const r = matchCaption("Петров", staff);
    expect(r.matched).toEqual([]);
    expect(r.ambiguous[0].candidates.map((c) => c.id).sort()).toEqual([2, 3]);
  });
  it("однофамильцы уточняются по имени или инициалу", () => {
    expect(ids("Петров Виктор")).toEqual([3]);
    expect(ids("Петров А.")).toEqual([2]);
  });
  it("точное совпадение важнее нечёткого: Петрова ≠ Петров", () => expect(ids("Петрова")).toEqual([6]));
  it("несколько сотрудников", () => expect(ids("Мехоношин, Македонский")).toEqual([1, 4]));
  it("пустая подпись / нет совпадений", () => {
    expect(ids(null)).toEqual([]);
    expect(ids("заступил на смену")).toEqual([]);
  });
});
