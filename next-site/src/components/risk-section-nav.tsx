"use client";

import { useEffect, useState } from "react";

export function RiskSectionNav({
  links,
}: {
  links: readonly (readonly [id: string, label: string])[];
}) {
  const [activeId, setActiveId] = useState(links[0]?.[0]);

  useEffect(() => {
    const sections = links.flatMap(([id]) => {
      const element = document.getElementById(id);
      return element ? [element] : [];
    });
    let frame = 0;
    const update = () => {
      frame = 0;
      // Follow the section crossing the reading line below the fixed header.
      const readingLine = Math.min(160, window.innerHeight * 0.25);
      let current: HTMLElement | undefined = sections[0];
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= readingLine) current = section;
      }
      // The final section may be too short to reach the reading line.
      if (window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
        current = sections.at(-1);
      }
      if (current) setActiveId(current.id);
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("hashchange", scheduleUpdate);
    // Charts and tables load asynchronously and can move section boundaries.
    const observer = new ResizeObserver(scheduleUpdate);
    sections.forEach((section) => observer.observe(section));
    scheduleUpdate();
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("hashchange", scheduleUpdate);
      observer.disconnect();
    };
  }, [links]);

  return (
    <aside className="risk-section-nav" aria-label="Dashboard sections">
      <div className="risk-section-nav__label">On this page</div>
      <nav className="risk-section-nav__links">
        {links.map(([id, label], index) => (
          <a href={`#${id}`} key={id} aria-current={activeId === id ? "location" : undefined}>
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            {label}
          </a>
        ))}
      </nav>
    </aside>
  );
}
