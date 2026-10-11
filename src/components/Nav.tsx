"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; count?: number };

export function Nav({ sections }: { sections: { title: string; items: Item[] }[] }) {
  const path = usePathname();
  return (
    <>
      {sections.map((s) => (
        <div key={s.title} className="nav">
          <div className="nav-section">{s.title}</div>
          {s.items.map((i) => (
            <Link key={i.href} href={i.href} className={path === i.href || path.startsWith(i.href + "/") ? "active" : ""}>
              {i.label}
              {i.count ? <span className="count">{i.count}</span> : null}
            </Link>
          ))}
        </div>
      ))}
    </>
  );
}
