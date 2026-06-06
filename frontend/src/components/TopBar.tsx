import { Download, FileText, FileUp, LocateFixed, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import { GraphNode } from '../types/graph';
import { SearchBox } from './SearchBox';

type Props = {
  nodes: GraphNode[];
  query: string;
  loading: boolean;
  onQueryChange: (query: string) => void;
  onPickNode: (node: GraphNode) => void;
  onSubmitQuery: () => void;
  onRefresh: () => void;
  onImportExcel: (file: File) => void;
  onImportCsv: (files: File[]) => void;
  onExport: () => void;
  onFitView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
};

export function TopBar({
  nodes,
  query,
  loading,
  onQueryChange,
  onPickNode,
  onSubmitQuery,
  onRefresh,
  onImportExcel,
  onImportCsv,
  onExport,
  onFitView,
  onZoomIn,
  onZoomOut
}: Props) {
  return (
    <header className="top-bar">
      <div className="brand">
        <span className="brand-mark" />
        <div>
          <strong>关联关系星云图</strong>
          <small>Relation Nebula MVP</small>
        </div>
      </div>
      <SearchBox nodes={nodes} value={query} onChange={onQueryChange} onPick={onPickNode} onSubmit={onSubmitQuery} />
      <div className="top-actions">
        <button type="button" title="刷新数据" onClick={onRefresh}>
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
              event.target.value = '';
            }}
          />
        </label>
        <label className="icon-button" title="导入 CSV">
          <FileText size={16} />
          <input
            type="file"
            accept=".csv"
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length) onImportCsv(files);
              event.target.value = '';
            }}
          />
        </label>
        <button type="button" title="放大" onClick={onZoomIn}>
          <ZoomIn size={16} />
        </button>
        <button type="button" title="缩小" onClick={onZoomOut}>
          <ZoomOut size={16} />
        </button>
        <button type="button" title="重置视图" onClick={onFitView}>
          <LocateFixed size={16} />
        </button>
        <button type="button" title="导出图片" onClick={onExport}>
          <Download size={16} />
        </button>
      </div>
    </header>
  );
}
