import { Download, FileUp, LocateFixed, RefreshCw } from 'lucide-react';
import { GraphNode } from '../types/graph';
import { SearchBox } from './SearchBox';

type Props = {
  nodes: GraphNode[];
  query: string;
  loading: boolean;
  onQueryChange: (query: string) => void;
  onPickNode: (node: GraphNode) => void;
  onRefresh: () => void;
  onImportExcel: (file: File) => void;
  onExport: () => void;
};

export function TopBar({ nodes, query, loading, onQueryChange, onPickNode, onRefresh, onImportExcel, onExport }: Props) {
  return (
    <header className="top-bar">
      <div className="brand">
        <span className="brand-mark" />
        <div>
          <strong>关联关系星云图</strong>
          <small>Relation Nebula MVP</small>
        </div>
      </div>
      <SearchBox nodes={nodes} value={query} onChange={onQueryChange} onPick={onPickNode} />
      <div className="top-actions">
        <button type="button" title="重新加载" onClick={onRefresh}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
        </button>
        <label className="icon-button" title="导入 Excel">
          <FileUp size={16} />
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImportExcel(file);
            }}
          />
        </label>
        <button type="button" title="聚焦核心" onClick={() => nodes[0] && onPickNode(nodes[0])}>
          <LocateFixed size={16} />
        </button>
        <button type="button" title="导出图片" onClick={onExport}>
          <Download size={16} />
        </button>
      </div>
    </header>
  );
}
