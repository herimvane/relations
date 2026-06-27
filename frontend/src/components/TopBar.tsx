import { ArrowLeft, Database, Download, Eye, EyeOff, FileUp, LocateFixed, Lock, RefreshCw, Unlock, ZoomIn, ZoomOut } from 'lucide-react';
import { GraphNode, GraphViewState, NodeSearchResult } from '../types/graph';
import { SearchBox } from './SearchBox';

type Props = {
  nodes: GraphNode[];
  databaseResults: NodeSearchResult[];
  searching: boolean;
  query: string;
  loading: boolean;
  source: string;
  status: string;
  error?: string;
  viewState?: GraphViewState;
  canGoBack: boolean;
  viewLocked: boolean;
  showNodeLabels: boolean;
  onQueryChange: (query: string) => void;
  onPickNode: (node: GraphNode) => void;
  onSubmitQuery: () => void;
  onRefresh: () => void;
  onBack: () => void;
  onToggleViewLock: () => void;
  onToggleNodeLabels: () => void;
  onOpenImport: () => void;
  onExport: () => void;
  onFitView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
};

export function TopBar({
  nodes,
  databaseResults,
  searching,
  query,
  loading,
  source,
  status,
  error,
  viewState,
  canGoBack,
  viewLocked,
  showNodeLabels,
  onQueryChange,
  onPickNode,
  onSubmitQuery,
  onRefresh,
  onBack,
  onToggleViewLock,
  onToggleNodeLabels,
  onOpenImport,
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
      <SearchBox
        nodes={nodes}
        databaseResults={databaseResults}
        searching={searching}
        value={query}
        onChange={onQueryChange}
        onPick={onPickNode}
        onSubmit={onSubmitQuery}
      />
      <div className="top-actions">
        <button type="button" title="返回上一个视图" onClick={onBack} disabled={!canGoBack}>
          <ArrowLeft size={16} />
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
        <button
          className={showNodeLabels ? 'active' : undefined}
          type="button"
          title={showNodeLabels ? '隐藏节点名称' : '显示节点名称'}
          onClick={onToggleNodeLabels}
        >
          {showNodeLabels ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
        <button type="button" title="导入数据" onClick={onOpenImport}>
          <FileUp size={16} />
        </button>
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
