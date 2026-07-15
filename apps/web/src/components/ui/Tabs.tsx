export interface TabItem {
  id: string;
  label: string;
}

interface Props {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
}

/** Barra de abas acessível (role=tablist). O conteúdo é responsabilidade do pai. */
export function Tabs({ tabs, active, onChange }: Props) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={t.id === active}
          className="tab"
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
