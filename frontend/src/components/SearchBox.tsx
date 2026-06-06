import { useState } from 'react';
import { Search } from 'lucide-react';
import { GraphNode } from '../types/graph';

type Props = {
  nodes: GraphNode[];
  value: string;
  onChange: (value: string) => void;
  onPick: (node: GraphNode) => void;
};

export function SearchBox({ nodes, value, onChange, onPick }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const matches = isOpen && value.trim()
    ? nodes.filter((node) => node.name.toLowerCase().includes(value.toLowerCase()) || node.id.includes(value)).slice(0, 6)
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
        placeholder="搜索节点、实体、ID"
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
