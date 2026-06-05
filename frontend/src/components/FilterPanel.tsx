type Props = {
  title: string;
  values: string[];
  active: string[];
  onChange: (values: string[]) => void;
};

export function FilterPanel({ title, values, active, onChange }: Props) {
  const activeSet = new Set(active);
  return (
    <section className="panel-section">
      <div className="section-title">{title}</div>
      <div className="chip-list">
        {values.map((value) => (
          <button
            type="button"
            key={value}
            className={activeSet.has(value) ? 'chip active' : 'chip'}
            onClick={() => {
              const next = activeSet.has(value) ? active.filter((item) => item !== value) : [...active, value];
              onChange(next.length === values.length ? [] : next);
            }}
          >
            {value}
          </button>
        ))}
      </div>
    </section>
  );
}
