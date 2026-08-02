export function RiskSectionNav({
  links,
}: {
  links: readonly (readonly [id: string, label: string])[];
}) {
  return (
    <aside className="risk-section-nav" aria-label="Dashboard sections">
      <div className="risk-section-nav__label">On this page</div>
      <nav className="risk-section-nav__links">
        {links.map(([id, label], index) => (
          <a href={`#${id}`} key={id}>
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            {label}
          </a>
        ))}
      </nav>
    </aside>
  );
}
