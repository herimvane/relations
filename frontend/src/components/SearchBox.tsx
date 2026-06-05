import { Search } from 'lucide-react';
import { GraphNode } from '../types/graph';

type Props = {
  nodes: GraphNode[];
  value: string;
  onChange: (value: string) => void;
  onPick: (node: GraphNode) => void;
};

export function SearchBox({ nodes, value, onChange, onPick }: Props) {
  const matches = value.trim()
    ? nodes.filter((node) => node.name.toLowerCase().includes(value.toLowerCase()) || node.id.includes(value)).slice(0, 6)
    : [];

  return (
    <div className="search-box">
      <Search size={17} />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="搜索节点、实体、ID" />
      {matches.length > 0 && (
        <div className="search-results">
          {matches.map((node) => (
            <button type="button" key={node.id} onClick={() => onPick(node)}>
              <span>{node.name}</span>
              <small>{node.type}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
