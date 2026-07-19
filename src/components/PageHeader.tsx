type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description: string;
};

export function PageHeader({ eyebrow = 'GOATLAND', title, description }: PageHeaderProps) {
  return (
    <section className="page-header">
      <div className="container page-header__inner">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </section>
  );
}
