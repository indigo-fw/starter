'use client';

interface OptionGroup {
  name: string;
  values: string[];
}

export function VariantSelector({
  optionGroups,
  selections,
  onSelect,
}: {
  optionGroups: OptionGroup[];
  selections: Record<string, string>;
  onSelect: (name: string, value: string) => void;
}) {
  return (
    <>
      {optionGroups.map((group) => (
        <div key={group.name} className="variant-group">
          <span className="variant-group-label">
            {group.name}: <strong>{selections[group.name]}</strong>
          </span>
          <div className="variant-options">
            {group.values.map((value) => (
              <button
                key={value}
                type="button"
                className="variant-option"
                data-selected={selections[group.name] === value ? 'true' : undefined}
                onClick={() => onSelect(group.name, value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
