import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { GraphNode, NodeSearchResult } from '../types/graph';

type Props = {
  nodes: GraphNode[];
  databaseResults: NodeSearchResult[];
  searching?: boolean;
  value: string;
  onChange: (value: string) => void;
  onPick: (node: GraphNode) => void;
  onSubmit: () => void;
};

export function SearchBox({ nodes, databaseResults, searching, value, onChange, onPick, onSubmit }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const previousValueRef = useRef(value);
  const isPathQuery = /(::|->|到)/.test(value);
  const normalizedValue = value.toLowerCase();

  useEffect(() => {
    if (previousValueRef.current !== value) {
      previousValueRef.current = value;
      if (isFocused && value.trim()) setIsOpen(true);
    }
  }, [isFocused, value]);

  const shouldShowResults = isOpen && isFocused && value.trim() && !isPathQuery;
  const viewMatches = shouldShowResults
    ? nodes
        .filter((node) =>
          node.name.toLowerCase().includes(normalizedValue) ||
          node.id.toLowerCase().includes(normalizedValue) ||
          node.type.toLowerCase().includes(normalizedValue) ||
          (node.group ?? '').toLowerCase().includes(normalizedValue)
        )
        .slice(0, 6)
    : [];
  const viewIds = new Set(viewMatches.map((node) => node.id));
  const remoteMatches = shouldShowResults
    ? databaseResults.filter((node) => !viewIds.has(node.id)).slice(0, 8)
    : [];
  const hasResults = shouldShowResults && (viewMatches.length > 0 || remoteMatches.length > 0 || searching);

  return (
    <div className="search-box">
      <Search size={17} />
      <input
        value={value}
        onBlur={() => window.setTimeout(() => {
          setIsFocused(false);
          setIsOpen(false);
        }, 120)}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          setIsFocused(true);
          if (value.trim()) setIsOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            setIsOpen(false);
            onSubmit();
          }
        }}
        placeholder="搜索节点、实体、ID 或 节点A::节点B"
      />
      {hasResults && (
        <div className="search-results">
          {viewMatches.length > 0 && <div className="search-group-title">当前视图</div>}
          {viewMatches.map((node) => (
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
              <small>{node.type} / 视图</small>
            </button>
          ))}
          {remoteMatches.length > 0 && <div className="search-group-title">数据库</div>}
          {remoteMatches.map((node) => (
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
              <small>{node.type}{node.degree !== undefined ? ` / ${node.degree} 关系` : ''}</small>
            </button>
          ))}
          {searching && <div className="search-loading">搜索数据库...</div>}
        </div>
      )}
    </div>
  );
}
