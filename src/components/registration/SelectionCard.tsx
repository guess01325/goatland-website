import type { ReactNode } from 'react';

type SelectionCardProps = {
  title: string;
  description?: ReactNode;
  badge?: string;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
};

export function SelectionCard({
  title,
  description,
  badge,
  selected = false,
  disabled = false,
  onSelect,
}: SelectionCardProps) {
  return (
    <button
      className={`registration-option${selected ? ' registration-option--selected' : ''}`}
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
    >
      <span className="registration-option__topline">
        <strong>{title}</strong>
        {badge ? <span className="registration-option__badge">{badge}</span> : null}
      </span>
      {description ? <span className="registration-option__description">{description}</span> : null}
      {selected ? <span className="registration-option__selected-label">Selected</span> : null}
    </button>
  );
}
