import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from './components/AppShell';
import { RightPanel } from './components/RightPanel';
import { TopBar } from './components/TopBar';
import { fetchBackboneView, fetchGalaxyView, fetchLocalView, fetchUniverseView } from './api/graphApi';
import { exportCanvas } from './graph/exportCanvas';
import { NebulaGraph } from './graph/NebulaGraph';
import { findNodeByText, mergeGraphWithPath, parsePathQuery, searchGraphPaths } from './graph/pathSearch';
import { useGraphData } from './hooks/useGraphData';
import { useGraphFilters } from './hooks/useGraphFilters';
import { useGraphViewport } from './hooks/useGraphViewport';
import { GraphNode, GraphPath, GraphViewCommand, GraphViewResponse, GraphViewState } from './types/graph';

const CONFIG_DATASET = 'social';
const DRILL_PREVIEW_MS = 180;

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export default function App() {
  const { data, setData, source, setSource, loading, setLoading, error, setError, status, setStatus, refresh, importExcel, importCsv, loadMock } = useGraphData(false);
  const filters = useGraphFilters(data);
  const [selectedNode, setSelectedNode] = useState<GraphNode>();
  const [hoveredNode, setHoveredNode] = useState<GraphNode>();
  const [query, setQuery] = useState('');
  const [focusedNodeId, setFocusedNodeId] = useState<string>();
  const [expansionDepth, setExpansionDepth] = useState(1);
  const [pathResults, setPathResults] = useState<GraphPath[]>([]);
  const [activePathId, setActivePathId] = useState<string>();
  const [pathQueryLabel, setPathQueryLabel] = useState<string>();
  const [viewCommand, setViewCommand] = useState<GraphViewCommand>();
  const [viewState, setViewState] = useState<GraphViewState>();
  const [viewHistory, setViewHistory] = useState<GraphViewState[]>([]);
  const [viewLocked, setViewLocked] = useState(false);
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const focusedNodeIdRef = useRef<string>();
  const initialViewLoadedRef = useRef(false);
  const viewport = useGraphViewport(filters.filteredData, focusedNodeId, expansionDepth);
  const activePath = useMemo(
    () => pathResults.find((path) => path.id === activePathId) ?? pathResults[0],
    [activePathId, pathResults]
  );
  const canvasData = useMemo(() => mergeGraphWithPath(viewport.data, activePath), [activePath, viewport.data]);

  const visibleSelected = useMemo(
    () => canvasData.nodes.find((node) => node.id === selectedNode?.id) ?? filters.filteredData.nodes.find((node) => node.id === selectedNode?.id),
    [canvasData.nodes, filters.filteredData.nodes, selectedNode]
  );

  useEffect(() => {
    focusedNodeIdRef.current = focusedNodeId;
  }, [focusedNodeId]);

  const applyGraphView = useCallback((view: GraphViewResponse, nextState: GraphViewState, pushHistory = true) => {
    if (pushHistory && viewState) setViewHistory((history) => [...history.slice(-19), viewState]);
    setViewState(nextState);
    setData({ nodes: view.nodes, edges: view.edges });
    setSource(`view:${nextState.dataset}:${nextState.level}`);
    setStatus(
      `${view.title}：${view.nodes.length.toLocaleString()} 可见节点 / ${view.edges.length.toLocaleString()} 可见关系` +
        (view.stats ? `，全量 ${view.stats.total_nodes.toLocaleString()} 节点 / ${view.stats.total_edges.toLocaleString()} 关系` : '')
    );
    setError(undefined);
    setSelectedNode(undefined);
    setHoveredNode(undefined);
    setFocusedNodeId(undefined);
    setExpansionDepth(1);
    setPathResults([]);
    setActivePathId(undefined);
    setPathQueryLabel(undefined);
    setQuery('');
  }, [setData, setError, setSource, setStatus, viewState]);

  const loadUniverseView = useCallback(async (pushHistory = false) => {
    setViewLocked(false);
    setLoading(true);
    setStatus('正在加载 Universe 视图...');
    try {
      const view = await fetchUniverseView();
      applyGraphView(view, { level: 'L0', dataset: CONFIG_DATASET, title: view.title }, pushHistory);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Universe view load failed';
      setError(message);
      setStatus(`Universe 视图加载失败：${message}`);
    } finally {
      setLoading(false);
    }
  }, [applyGraphView, setError, setLoading, setStatus]);

  const drillToView = useCallback(async (node: GraphNode) => {
    setViewCommand({ type: 'zoom-in', nonce: Date.now() });
    await sleep(DRILL_PREVIEW_MS);
    setLoading(true);
    try {
      if (node.type === '社区') {
        const communityId = String(node.properties?.community_id ?? node.id.replace(/^community:/, ''));
        setStatus(`正在加载 Galaxy 视图：${communityId}...`);
        const view = await fetchGalaxyView(communityId);
        applyGraphView(view, { level: 'L1', dataset: CONFIG_DATASET, id: communityId, title: view.title });
        return;
      }
      const currentLevel = viewState?.level ?? 'L0';
      const nextView =
        currentLevel === 'L1'
          ? await fetchBackboneView(node.id)
          : await fetchLocalView(node.id);
      applyGraphView(nextView, {
        level: currentLevel === 'L1' ? 'L2' : 'L3',
        dataset: CONFIG_DATASET,
        id: node.id,
        title: nextView.title
      });
    } finally {
      setLoading(false);
    }
  }, [applyGraphView, setLoading, setStatus, viewState?.level]);

  const goBackView = useCallback(async () => {
    const previous = viewHistory[viewHistory.length - 1];
    if (!previous) return;
    setViewHistory((history) => history.slice(0, -1));
    setViewLocked(false);
    setViewCommand({ type: 'zoom-out', nonce: Date.now() });
    await sleep(DRILL_PREVIEW_MS);
    setLoading(true);
    try {
      const view =
        previous.level === 'L0'
          ? await fetchUniverseView()
          : previous.level === 'L1' && previous.id
            ? await fetchGalaxyView(previous.id)
            : previous.level === 'L2' && previous.id
              ? await fetchBackboneView(previous.id)
              : previous.id
                ? await fetchLocalView(previous.id)
                : await fetchUniverseView();
      applyGraphView(view, previous, false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'View back failed';
      setError(message);
      setStatus(`返回视图失败：${message}`);
    } finally {
      setLoading(false);
    }
  }, [applyGraphView, setError, setLoading, setStatus, viewHistory]);

  const reloadCurrentView = useCallback(async () => {
    if (!viewState) {
      refresh();
      return;
    }
    setLoading(true);
    try {
      const view =
        viewState.level === 'L0'
          ? await fetchUniverseView()
          : viewState.level === 'L1' && viewState.id
            ? await fetchGalaxyView(viewState.id)
            : viewState.level === 'L2' && viewState.id
              ? await fetchBackboneView(viewState.id)
              : viewState.id
                ? await fetchLocalView(viewState.id)
                : await fetchUniverseView();
      applyGraphView(view, viewState, false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'View refresh failed';
      setError(message);
      setStatus(`刷新视图失败：${message}`);
    } finally {
      setLoading(false);
    }
  }, [applyGraphView, refresh, setError, setLoading, setStatus, viewState]);

  useEffect(() => {
    if (initialViewLoadedRef.current) return;
    initialViewLoadedRef.current = true;
    loadUniverseView(false);
  }, [loadUniverseView]);

  const focusNode = useCallback((node: GraphNode) => {
    setExpansionDepth((currentDepth) => (node.id === focusedNodeIdRef.current ? Math.min(3, currentDepth + 1) : 1));
    setSelectedNode(node);
    setFocusedNodeId(node.id);
    setQuery(node.name);
    setPathResults([]);
    setActivePathId(undefined);
    setPathQueryLabel(undefined);
  }, []);

  const pickNode = useCallback((node: GraphNode) => {
    if (source.startsWith('view:') && !viewLocked) {
      drillToView(node).catch((err) => {
        const message = err instanceof Error ? err.message : 'View drill failed';
        setError(message);
        setStatus(`视图下钻失败：${message}`);
      });
      return;
    }
    focusNode(node);
  }, [drillToView, focusNode, setError, setStatus, source, viewLocked]);

  const clearGraphFocus = useCallback(() => {
    setSelectedNode(undefined);
    setHoveredNode(undefined);
    setFocusedNodeId(undefined);
    setExpansionDepth(1);
    setPathResults([]);
    setActivePathId(undefined);
    setPathQueryLabel(undefined);
    setQuery('');
  }, []);

  const handleImportExcel = useCallback(async (file: File) => {
    clearGraphFocus();
    setViewState(undefined);
    setViewHistory([]);
    setViewLocked(false);
    filters.resetFilters();
    await importExcel(file);
  }, [clearGraphFocus, filters, importExcel]);

  const handleImportCsv = useCallback(async (files: File[]) => {
    clearGraphFocus();
    setViewState(undefined);
    setViewHistory([]);
    setViewLocked(false);
    filters.resetFilters();
    await importCsv(files);
  }, [clearGraphFocus, filters, importCsv]);

  const handleLoadMock = useCallback(() => {
    clearGraphFocus();
    setViewState(undefined);
    setViewHistory([]);
    setViewLocked(false);
    filters.resetFilters();
    loadMock();
  }, [clearGraphFocus, filters, loadMock]);

  const submitQuery = useCallback(() => {
    const pathQuery = parsePathQuery(query);
    if (pathQuery) {
      const sourceNode = findNodeByText(filters.filteredData.nodes, pathQuery.sourceText);
      const targetNode = findNodeByText(filters.filteredData.nodes, pathQuery.targetText);
      const label = `${pathQuery.sourceText} -> ${pathQuery.targetText}`;
      setPathQueryLabel(label);

      if (!sourceNode || !targetNode) {
        setPathResults([]);
        setActivePathId(undefined);
        return;
      }

      const nextPaths = searchGraphPaths(filters.filteredData, sourceNode, targetNode, {
        maxDepth: 4,
        maxPaths: 20,
        maxBranching: filters.filteredData.nodes.length > 6000 ? 42 : 72
      });
      setPathResults(nextPaths);
      setActivePathId(nextPaths[0]?.id);
      setSelectedNode(sourceNode);
      setFocusedNodeId(sourceNode.id);
      setExpansionDepth(1);
      return;
    }

    const node = findNodeByText(filters.filteredData.nodes, query);
    if (node) pickNode(node);
  }, [filters.filteredData, pickNode, query]);

  const setCanvas = useCallback((canvas: HTMLCanvasElement) => {
    canvasRef.current = canvas;
  }, []);

  const handleHoverNode = useCallback((node?: GraphNode) => {
    setHoveredNode((current) => (current?.id === node?.id ? current : node));
  }, []);

  const sendViewCommand = useCallback((type: GraphViewCommand['type']) => {
    setViewCommand({ type, nonce: Date.now() });
  }, []);

  return (
    <AppShell
      top={
        <TopBar
          nodes={filters.filteredData.nodes}
          query={query}
          loading={loading}
          source={source}
          status={status}
          error={error}
          onQueryChange={setQuery}
          onPickNode={pickNode}
          onSubmitQuery={submitQuery}
          viewState={viewState}
          canGoBack={viewHistory.length > 0}
          viewLocked={viewLocked}
          onRefresh={reloadCurrentView}
          onBack={goBackView}
          onToggleViewLock={() => setViewLocked((locked) => !locked)}
          onLoadMock={handleLoadMock}
          onImportExcel={handleImportExcel}
          onImportCsv={handleImportCsv}
          onExport={() => exportCanvas(canvasRef.current)}
          onFitView={() => sendViewCommand('fit')}
          onZoomIn={() => sendViewCommand('zoom-in')}
          onZoomOut={() => sendViewCommand('zoom-out')}
        />
      }
      center={
        <NebulaGraph
          data={canvasData}
          selectedNodeId={visibleSelected?.id}
          focusedNodeId={focusedNodeId}
          highlightedPath={activePath}
          viewCommand={viewCommand}
          relationTypes={filters.relationTypes}
          minWeight={filters.minWeight}
          onSelectNode={pickNode}
          onHoverNode={handleHoverNode}
          onCanvasReady={setCanvas}
        />
      }
      right={
        <RightPanel
          selected={visibleSelected}
          hovered={hoveredNode}
          data={filters.filteredData}
          pathResults={pathResults}
          activePathId={activePath?.id}
          pathQueryLabel={pathQueryLabel}
          onPickPath={setActivePathId}
          collapsed={detailsCollapsed}
          onToggleCollapsed={() => setDetailsCollapsed((collapsed) => !collapsed)}
        />
      }
    />
  );
}
