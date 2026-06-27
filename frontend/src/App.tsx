import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from './components/AppShell';
import { ImportDataDialog } from './components/ImportDataDialog';
import { RightPanel } from './components/RightPanel';
import { TopBar } from './components/TopBar';
import { cancelDatabasePreviewJob, commitDatabaseImport, createDatabasePreviewJob, fetchBackboneView, fetchDatabasePreviewJob, fetchGalaxyView, fetchLocalView, fetchUniverseView } from './api/graphApi';
import { searchDatabaseNodes, searchDatabasePaths } from './api/searchApi';
import { exportCanvas } from './graph/exportCanvas';
import { NebulaGraph } from './graph/NebulaGraph';
import { findNodeByText, mergeGraphWithPath, parsePathQuery, searchGraphPaths } from './graph/pathSearch';
import { useGraphData } from './hooks/useGraphData';
import { useGraphFilters } from './hooks/useGraphFilters';
import { useGraphViewport } from './hooks/useGraphViewport';
import { CommunityMethod, GraphNode, GraphPath, GraphViewCommand, GraphViewResponse, GraphViewState, ImportanceFormula, ImportanceTemplate, ImportPreviewJob, ImportReport, NodeSearchResult } from './types/graph';

const CONFIG_DATASET = 'social';
const DRILL_PREVIEW_MS = 36;

function canSearchDatabase(source: string) {
  return source !== 'loading' && source !== 'unavailable';
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export default function App() {
  const { data, setData, source, setSource, loading, setLoading, error, setError, status, setStatus, refresh, importExcel, importCsv } = useGraphData(false);
  const filters = useGraphFilters(data);
  const [selectedNode, setSelectedNode] = useState<GraphNode>();
  const [hoveredNode, setHoveredNode] = useState<GraphNode>();
  const [query, setQuery] = useState('');
  const [databaseSearchResults, setDatabaseSearchResults] = useState<NodeSearchResult[]>([]);
  const [searchingDatabase, setSearchingDatabase] = useState(false);
  const [focusedNodeId, setFocusedNodeId] = useState<string>();
  const [focusNonce, setFocusNonce] = useState(0);
  const [expansionDepth, setExpansionDepth] = useState(1);
  const [pathResults, setPathResults] = useState<GraphPath[]>([]);
  const [activePathId, setActivePathId] = useState<string>();
  const [pathQueryLabel, setPathQueryLabel] = useState<string>();
  const [viewCommand, setViewCommand] = useState<GraphViewCommand>();
  const [viewState, setViewState] = useState<GraphViewState>();
  const [viewHistory, setViewHistory] = useState<GraphViewState[]>([]);
  const [viewLocked, setViewLocked] = useState(false);
  const [showNodeLabels, setShowNodeLabels] = useState(true);
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const focusedNodeIdRef = useRef<string>();
  const initialViewLoadedRef = useRef(false);
  const suppressNextSearchRef = useRef(false);
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

  useEffect(() => {
    const trimmed = query.trim();
    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false;
      setDatabaseSearchResults([]);
      setSearchingDatabase(false);
      return undefined;
    }
    if (!trimmed || /(::|->|到)/.test(trimmed) || !canSearchDatabase(source)) {
      setDatabaseSearchResults([]);
      setSearchingDatabase(false);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearchingDatabase(true);
      searchDatabaseNodes(trimmed, 16)
        .then((results) => {
          if (!cancelled) setDatabaseSearchResults(results);
        })
        .catch(() => {
          if (!cancelled) setDatabaseSearchResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearchingDatabase(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, source]);

  const applyGraphView = useCallback((view: GraphViewResponse, nextState: GraphViewState, pushHistory = true) => {
    if (pushHistory && viewState) setViewHistory((history) => [...history.slice(-19), viewState]);
    const resolvedState = {
      ...nextState,
      canDrill: view.can_drill ?? nextState.canDrill ?? nextState.level !== 'L3',
      complete: view.complete ?? nextState.complete ?? false
    };
    setViewState(resolvedState);
    setData({ nodes: view.nodes, edges: view.edges });
    setSource(`view:${resolvedState.dataset}:${resolvedState.level}`);
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

  const focusNode = useCallback((node: GraphNode) => {
    setExpansionDepth((currentDepth) => (node.id === focusedNodeIdRef.current ? Math.min(3, currentDepth + 1) : 1));
    setSelectedNode(node);
    setFocusedNodeId(node.id);
    setFocusNonce((nonce) => nonce + 1);
    suppressNextSearchRef.current = true;
    setQuery(node.name);
    setDatabaseSearchResults([]);
    setSearchingDatabase(false);
    setPathResults([]);
    setActivePathId(undefined);
    setPathQueryLabel(undefined);
  }, []);

  const drillToView = useCallback(async (node: GraphNode, options: { focusAfterLoad?: boolean; forceLocal?: boolean } = {}) => {
    const currentLevel = viewState?.level ?? 'L0';
    if (currentLevel === 'L3' && viewState?.canDrill === false && !options.forceLocal) {
      focusNode(node);
      return;
    }

    const origin = node as GraphNode & { x?: number; y?: number; z?: number };
    setLoading(true);
    try {
      let nextView: GraphViewResponse;
      let nextState: GraphViewState;
      if (!options.forceLocal && node.type === '社区') {
        const communityId = String(node.properties?.community_id ?? node.id.replace(/^community:/, ''));
        setStatus(`正在加载 Galaxy 视图：${communityId}...`);
        nextView = await fetchGalaxyView(communityId);
        nextState = { level: 'L1', dataset: CONFIG_DATASET, id: communityId, title: nextView.title };
      } else {
        setStatus(`正在加载 ${node.name} 的关联视图...`);
        nextView =
          options.forceLocal
            ? await fetchLocalView(node.id)
          : currentLevel === 'L1'
            ? await fetchBackboneView(node.id)
            : await fetchLocalView(node.id);
        nextState = {
          level: options.forceLocal ? 'L3' : currentLevel === 'L1' ? 'L2' : 'L3',
          dataset: CONFIG_DATASET,
          id: node.id,
          title: nextView.title,
          canDrill: nextView.can_drill,
          complete: nextView.complete
        };
      }

      setViewCommand({
        type: 'drill-in',
        nonce: Date.now(),
        origin: {
          id: node.id,
          x: origin.x,
          y: origin.y,
          z: origin.z
        }
      });
      await sleep(DRILL_PREVIEW_MS);
      applyGraphView(nextView, nextState);
      if (options.focusAfterLoad) {
        const loadedNode = nextView.nodes.find((item) => item.id === node.id) ?? node;
        window.setTimeout(() => {
          setSelectedNode(loadedNode);
          setFocusedNodeId(loadedNode.id);
          setFocusNonce((nonce) => nonce + 1);
          suppressNextSearchRef.current = true;
          setQuery(loadedNode.name);
          setDatabaseSearchResults([]);
          setSearchingDatabase(false);
        }, 0);
      }
    } finally {
      setLoading(false);
    }
  }, [applyGraphView, focusNode, setLoading, setStatus, viewState?.canDrill, viewState?.level]);

  const goBackView = useCallback(async () => {
    const previous = viewHistory[viewHistory.length - 1];
    if (!previous) return;
    setViewHistory((history) => history.slice(0, -1));
    setViewLocked(false);
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
      setViewCommand({ type: 'drill-out', nonce: Date.now() });
      await sleep(DRILL_PREVIEW_MS);
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

  const pickNode = useCallback((node: GraphNode) => {
    const databaseResult = (node as NodeSearchResult).source === 'database';
    if (databaseResult || (source.startsWith('view:') && !viewLocked)) {
      drillToView(node).catch((err) => {
        const message = err instanceof Error ? err.message : 'View drill failed';
        setError(message);
        setStatus(`视图下钻失败：${message}`);
      });
      return;
    }
    focusNode(node);
  }, [drillToView, focusNode, setError, setStatus, source, viewLocked]);

  const pickSearchNode = useCallback((node: GraphNode) => {
    const currentNode = findNodeByText(filters.filteredData.nodes, node.id) ?? filters.filteredData.nodes.find((item) => item.id === node.id);
    if (currentNode) {
      focusNode(currentNode);
      return;
    }

    drillToView(node, { focusAfterLoad: true, forceLocal: true }).catch((err) => {
      const message = err instanceof Error ? err.message : 'Search navigation failed';
      setError(message);
      setStatus(`搜索定位失败：${message}`);
    });
  }, [drillToView, filters.filteredData.nodes, focusNode, setError, setStatus]);

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

  const handleCreatePreviewJob = useCallback(async (
    files: File[],
    communityMethod: CommunityMethod,
    importanceTemplate: ImportanceTemplate,
    importanceFormula?: ImportanceFormula,
  ): Promise<ImportPreviewJob> => {
    setLoading(true);
    setStatus('正在上传文件并创建校验任务...');
    try {
      const job = await createDatabasePreviewJob(files, communityMethod, importanceTemplate, importanceFormula);
      setError(undefined);
      setStatus('校验任务已创建，正在后台生成报告...');
      return job;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import preview job failed';
      setError(message);
      setStatus(`校验任务创建失败：${message}`);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setError, setLoading, setStatus]);

  const handleFetchPreviewJob = useCallback(async (jobId: string): Promise<ImportPreviewJob> => {
    const job = await fetchDatabasePreviewJob(jobId);
    if (job.status === 'completed' && job.report) {
      setError(undefined);
      setStatus(`校验完成：${job.report.nodes.toLocaleString()} 节点 / ${job.report.edges.toLocaleString()} 关系`);
    } else if (job.status === 'failed') {
      setError(job.error || job.message);
      setStatus(`校验失败：${job.error || job.message}`);
    } else if (job.status === 'cancelled') {
      setStatus('校验任务已取消');
    }
    return job;
  }, [setError, setStatus]);

  const handleCancelPreviewJob = useCallback(async (jobId: string): Promise<ImportPreviewJob> => {
    const job = await cancelDatabasePreviewJob(jobId);
    setStatus('校验任务已取消');
    return job;
  }, [setStatus]);

  const handleCommitDatabaseImport = useCallback(async (
    files: File[],
    communityMethod: CommunityMethod,
    importanceTemplate: ImportanceTemplate,
    importanceFormula?: ImportanceFormula,
  ): Promise<ImportReport> => {
    setLoading(true);
    setStatus('正在覆盖数据库并重建社区...');
    try {
      const response = await commitDatabaseImport(files, communityMethod, importanceTemplate, importanceFormula);
      clearGraphFocus();
      setViewHistory([]);
      setViewLocked(false);
      filters.resetFilters();
      setStatus('数据库导入完成，正在刷新 L0...');
      await loadUniverseView(false);
      return response.report;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Database import failed';
      setError(message);
      setStatus(`数据库导入失败：${message}`);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [clearGraphFocus, filters, loadUniverseView, setError, setLoading, setStatus]);

  const submitQuery = useCallback(async () => {
    const pathQuery = parsePathQuery(query);
    if (pathQuery) {
      const sourceNode = findNodeByText(filters.filteredData.nodes, pathQuery.sourceText);
      const targetNode = findNodeByText(filters.filteredData.nodes, pathQuery.targetText);
      const label = `${pathQuery.sourceText} -> ${pathQuery.targetText}`;
      setPathQueryLabel(label);

      try {
        if (canSearchDatabase(source)) {
          setLoading(true);
          const remotePaths = await searchDatabasePaths(pathQuery.sourceText, pathQuery.targetText, 4, 12);
          if (remotePaths.length > 0) {
            setPathResults(remotePaths);
            setActivePathId(remotePaths[0]?.id);
            setSelectedNode(remotePaths[0]?.nodes[0]);
            setFocusedNodeId(remotePaths[0]?.nodes[0]?.id);
            setFocusNonce((nonce) => nonce + 1);
            setExpansionDepth(1);
            setError(undefined);
            setStatus(`路径搜索完成：找到 ${remotePaths.length} 条候选路径`);
            return;
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Path search failed';
        setStatus(`全库路径搜索失败，使用当前视图搜索：${message}`);
      } finally {
        setLoading(false);
      }

      if (sourceNode && targetNode) {
        const nextPaths = searchGraphPaths(filters.filteredData, sourceNode, targetNode, {
          maxDepth: 4,
          maxPaths: 20,
          maxBranching: filters.filteredData.nodes.length > 6000 ? 42 : 72
        });
        setPathResults(nextPaths);
        setActivePathId(nextPaths[0]?.id);
        setSelectedNode(sourceNode);
        setFocusedNodeId(sourceNode.id);
        setFocusNonce((nonce) => nonce + 1);
        setExpansionDepth(1);
      } else {
        setPathResults([]);
        setActivePathId(undefined);
      }
      return;
    }

    const node = findNodeByText(filters.filteredData.nodes, query);
    if (node) {
      focusNode(node);
      return;
    }
    const remoteNode = databaseSearchResults[0];
    if (remoteNode) {
      pickSearchNode(remoteNode);
      return;
    }

    const trimmed = query.trim();
    if (trimmed && canSearchDatabase(source)) {
      try {
        setLoading(true);
        const results = await searchDatabaseNodes(trimmed, 1);
        if (results[0]) {
          pickSearchNode(results[0]);
          return;
        }
        setStatus(`未找到匹配节点：${trimmed}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Node search failed';
        setError(message);
        setStatus(`搜索失败：${message}`);
      } finally {
        setLoading(false);
      }
    }
  }, [databaseSearchResults, filters.filteredData, focusNode, pickSearchNode, query, setError, setLoading, setStatus, source]);

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
    <>
      <AppShell
      top={
        <TopBar
          nodes={filters.filteredData.nodes}
          databaseResults={databaseSearchResults}
          searching={searchingDatabase}
          query={query}
          loading={loading}
          source={source}
          status={status}
          error={error}
          onQueryChange={setQuery}
          onPickNode={pickSearchNode}
          onSubmitQuery={submitQuery}
          viewState={viewState}
          canGoBack={viewHistory.length > 0}
          viewLocked={viewLocked}
          showNodeLabels={showNodeLabels}
          onRefresh={reloadCurrentView}
          onBack={goBackView}
          onToggleViewLock={() => setViewLocked((locked) => !locked)}
          onToggleNodeLabels={() => setShowNodeLabels((visible) => !visible)}
          onOpenImport={() => setImportDialogOpen(true)}
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
          focusNonce={focusNonce}
          viewCommand={viewCommand}
          relationTypes={filters.relationTypes}
          minWeight={filters.minWeight}
          showLabels={showNodeLabels}
          onSelectNode={pickNode}
          onHoverNode={handleHoverNode}
          onCanvasReady={setCanvas}
        />
      }
      right={
        <RightPanel
          selected={visibleSelected}
          hovered={hoveredNode}
          data={canvasData}
          pathResults={pathResults}
          activePathId={activePath?.id}
          pathQueryLabel={pathQueryLabel}
          onPickPath={setActivePathId}
          collapsed={detailsCollapsed}
          onToggleCollapsed={() => setDetailsCollapsed((collapsed) => !collapsed)}
        />
      }
      />
      <ImportDataDialog
        open={importDialogOpen}
        loading={loading}
        onClose={() => setImportDialogOpen(false)}
        onTemporaryExcel={handleImportExcel}
        onTemporaryCsv={handleImportCsv}
        onCreatePreviewJob={handleCreatePreviewJob}
        onFetchPreviewJob={handleFetchPreviewJob}
        onCancelPreviewJob={handleCancelPreviewJob}
        onCommitDatabase={handleCommitDatabaseImport}
      />
    </>
  );
}
