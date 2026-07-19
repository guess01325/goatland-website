type PlaceholderSectionProps = {
  title: string;
  children: React.ReactNode;
};

export function PlaceholderSection({ title, children }: PlaceholderSectionProps) {
  return (
    <section className="section">
      <div className="container">
        <div className="placeholder-card">
          <p className="eyebrow">Placeholder</p>
          <h2>{title}</h2>
          <div className="placeholder-card__body">{children}</div>
        </div>
      </div>
    </section>
  );
}
