import { ArrowLeft, Database, Download, FileUp, LocateFixed, Lock, RefreshCw, RotateCcw, Unlock, ZoomIn, ZoomOut } from 'lucide-react';
import { GraphNode, GraphViewState } from '../types/graph';
import { SearchBox } from './SearchBox';

type Props = {
  nodes: GraphNode[];
  query: string;
  loading: boolean;
  source: string;
  status: string;
  error?: string;
  viewState?: GraphViewState;
  canGoBack: boolean;
  viewLocked: boolean;
  onQueryChange: (query: string) => void;
  onPickNode: (node: GraphNode) => void;
  onSubmitQuery: () => void;
  onRefresh: () => void;
  onBack: () => void;
  onToggleViewLock: () => void;
  onLoadMock: () => void;
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
  source,
  status,
  error,
  viewState,
  canGoBack,
  viewLocked,
  onQueryChange,
  onPickNode,
  onSubmitQuery,
  onRefresh,
  onBack,
  onToggleViewLock,
  onLoadMock,
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
          <strong>星域洞察</strong>
          <small>NebulaNet</small>
        </div>
      </div>
      <SearchBox nodes={nodes} value={query} onChange={onQueryChange} onPick={onPickNode} onSubmit={onSubmitQuery} />
      <div className="top-actions">
        <button type="button" title="返回上一个视图" onClick={onBack} disabled={!canGoBack}>
          <ArrowLeft size={16} />
        </button>
        <button type="button" title="切回内置 Mock 数据" onClick={onLoadMock}>
          <RotateCcw size={16} />
        </button>
        <div className={`data-status ${error ? 'error' : loading ? 'loading' : ''}`} title={error || status || source}>
          <Database size={14} />
          <span>{loading ? 'Loading' : error ? 'Error' : source.startsWith('view:') ? 'Live Graph' : source || 'Graph'}</span>
        </div>
        <div className="view-indicator" title={viewState?.title}>
          <strong>{viewState?.level ?? 'L0'}</strong>
          <small>{viewState?.title ?? 'Universe'}</small>
        </div>
        <button
          className={viewLocked ? 'active' : undefined}
          type="button"
          title={viewLocked ? '解除层级锁定，点击节点继续下钻' : '锁定当前层级，点击节点只聚焦不下钻'}
          onClick={onToggleViewLock}
          disabled={!viewState}
        >
          {viewLocked ? <Lock size={16} /> : <Unlock size={16} />}
        </button>
        <button type="button" title="刷新数据" onClick={onRefresh}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
        </button>
        <label className="icon-button" title="导入 Excel / CSV">
          <FileUp size={16} />
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              const excelFile = files.find((file) => /\.(xlsx|xls)$/i.test(file.name));
              const csvFiles = files.filter((file) => /\.csv$/i.test(file.name));
              if (excelFile) onImportExcel(excelFile);
              else if (csvFiles.length) onImportCsv(csvFiles);
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
