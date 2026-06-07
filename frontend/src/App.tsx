import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from './components/AppShell';
import { BottomRankPanel } from './components/BottomRankPanel';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';
import { TopBar } from './components/TopBar';
import { exportCanvas } from './graph/exportCanvas';
import { NebulaGraph } from './graph/NebulaGraph';
import { findNodeByText, mergeGraphWithPath, parsePathQuery, searchGraphPaths } from './graph/pathSearch';
import { useGraphData } from './hooks/useGraphData';
import { useGraphFilters } from './hooks/useGraphFilters';
import { useGraphViewport } from './hooks/useGraphViewport';
import { GraphEdge, GraphNode, GraphPath, GraphViewCommand } from './types/graph';

export default function App() {
  const { data, setData, source, setSource, loading, error, setError, status, setStatus, refresh, importExcel, importCsv, loadMock } = useGraphData();
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const focusedNodeIdRef = useRef<string>();
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

  const pickNode = useCallback((node: GraphNode) => {
    setExpansionDepth((currentDepth) => (node.id === focusedNodeIdRef.current ? Math.min(3, currentDepth + 1) : 1));
    setSelectedNode(node);
    setFocusedNodeId(node.id);
    setQuery(node.name);
    setPathResults([]);
    setActivePathId(undefined);
    setPathQueryLabel(undefined);
  }, []);

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
    filters.resetFilters();
    await importExcel(file);
  }, [clearGraphFocus, filters, importExcel]);

  const handleImportCsv = useCallback(async (files: File[]) => {
    clearGraphFocus();
    filters.resetFilters();
    await importCsv(files);
  }, [clearGraphFocus, filters, importCsv]);

  const handleLoadMock = useCallback(() => {
    clearGraphFocus();
    filters.resetFilters();
    loadMock();
  }, [clearGraphFocus, filters, loadMock]);

  const pickRankedEdge = useCallback((edge: GraphEdge) => {
    const sourceNode = filters.filteredData.nodes.find((node) => node.id === edge.source) ?? canvasData.nodes.find((node) => node.id === edge.source);
    const targetNode = filters.filteredData.nodes.find((node) => node.id === edge.target) ?? canvasData.nodes.find((node) => node.id === edge.target);
    const nextNode = sourceNode ?? targetNode;
    if (!nextNode) return;
    setSelectedNode(nextNode);
    setFocusedNodeId(nextNode.id);
    setExpansionDepth(1);
    setQuery(nextNode.name);
    setHoveredNode(undefined);
  }, [canvasData.nodes, filters.filteredData.nodes]);

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
          onQueryChange={setQuery}
          onPickNode={pickNode}
          onSubmitQuery={submitQuery}
          onRefresh={refresh}
          onImportExcel={handleImportExcel}
          onImportCsv={handleImportCsv}
          onExport={() => exportCanvas(canvasRef.current)}
          onFitView={() => sendViewCommand('fit')}
          onZoomIn={() => sendViewCommand('zoom-in')}
          onZoomOut={() => sendViewCommand('zoom-out')}
        />
      }
      left={
        <LeftPanel
          source={source}
          status={status}
          loading={loading}
          error={error}
          allRelationTypes={filters.allRelationTypes}
          activeRelationTypes={filters.relationTypes}
          allNodeTypes={filters.allNodeTypes}
          activeNodeTypes={filters.nodeTypes}
          minWeight={filters.minWeight}
          onRelationTypesChange={filters.setRelationTypes}
          onNodeTypesChange={filters.setNodeTypes}
          onMinWeightChange={filters.setMinWeight}
          onLoadMock={handleLoadMock}
          onLoadGraph={(graph, nextSource) => {
            clearGraphFocus();
            filters.resetFilters();
            setData(graph);
            setSource(nextSource);
            setStatus(`已加载 ${nextSource}：${graph.nodes.length.toLocaleString()} 节点 / ${graph.edges.length.toLocaleString()} 关系`);
          }}
          onError={setError}
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
          onHoverNode={setHoveredNode}
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
        />
      }
      bottom={
        <BottomRankPanel
          edges={canvasData.edges}
          nodes={canvasData.nodes}
          activePath={activePath}
          onPickEdge={pickRankedEdge}
        />
      }
    />
  );
}
