import { useState } from 'react';
import { Search } from 'lucide-react';
import { GraphNode } from '../types/graph';

type Props = {
  nodes: GraphNode[];
  value: string;
  onChange: (value: string) => void;
  onPick: (node: GraphNode) => void;
  onSubmit: () => void;
};

export function SearchBox({ nodes, value, onChange, onPick, onSubmit }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const isPathQuery = /(::|->|到)/.test(value);
  const normalizedValue = value.toLowerCase();
  const matches = isOpen && value.trim() && !isPathQuery
    ? nodes.filter((node) => node.name.toLowerCase().includes(normalizedValue) || node.id.toLowerCase().includes(normalizedValue)).slice(0, 6)
    : [];

  return (
    <div className="search-box">
      <Search size={17} />
      <input
        value={value}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            setIsOpen(false);
            onSubmit();
          }
        }}
        placeholder="搜索节点、实体、ID 或 节点A::节点B"
      />
      {matches.length > 0 && (
        <div className="search-results">
          {matches.map((node) => (
            <button
              type="button"
              key={node.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onPick(node);
                setIsOpen(false);
              }}
            >
              <span>{node.name}</span>
              <small>{node.type}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
