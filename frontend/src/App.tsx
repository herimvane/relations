import { useCallback, useMemo, useRef, useState } from 'react';
import { AppShell } from './components/AppShell';
import { BottomRankPanel } from './components/BottomRankPanel';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';
import { TopBar } from './components/TopBar';
import { exportCanvas } from './graph/exportCanvas';
import { NebulaGraph } from './graph/NebulaGraph';
import { useGraphData } from './hooks/useGraphData';
import { useGraphFilters } from './hooks/useGraphFilters';
import { GraphNode } from './types/graph';

export default function App() {
  const { data, setData, source, setSource, loading, error, setError, refresh, importExcel } = useGraphData();
  const filters = useGraphFilters(data);
  const [selectedNode, setSelectedNode] = useState<GraphNode>();
  const [hoveredNode, setHoveredNode] = useState<GraphNode>();
  const [query, setQuery] = useState('');
  const [focusedNodeId, setFocusedNodeId] = useState<string>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const visibleSelected = useMemo(
    () => filters.filteredData.nodes.find((node) => node.id === selectedNode?.id),
    [filters.filteredData.nodes, selectedNode]
  );

  const pickNode = useCallback((node: GraphNode) => {
    setSelectedNode(node);
    setFocusedNodeId(node.id);
    setQuery(node.name);
  }, []);

  const setCanvas = useCallback((canvas: HTMLCanvasElement) => {
    canvasRef.current = canvas;
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
          onRefresh={refresh}
          onImportExcel={importExcel}
          onExport={() => exportCanvas(canvasRef.current)}
        />
      }
      left={
        <LeftPanel
          source={source}
          error={error}
          allRelationTypes={filters.allRelationTypes}
          activeRelationTypes={filters.relationTypes}
          allNodeTypes={filters.allNodeTypes}
          activeNodeTypes={filters.nodeTypes}
          minWeight={filters.minWeight}
          onRelationTypesChange={filters.setRelationTypes}
          onNodeTypesChange={filters.setNodeTypes}
          onMinWeightChange={filters.setMinWeight}
          onLoadGraph={(graph, nextSource) => {
            setData(graph);
            setSource(nextSource);
          }}
          onError={setError}
        />
      }
      center={
        <NebulaGraph
          data={filters.filteredData}
          selectedNodeId={visibleSelected?.id}
          focusedNodeId={focusedNodeId}
          relationTypes={filters.relationTypes}
          minWeight={filters.minWeight}
          onSelectNode={pickNode}
          onHoverNode={setHoveredNode}
          onCanvasReady={setCanvas}
        />
      }
      right={<RightPanel selected={visibleSelected} hovered={hoveredNode} data={filters.filteredData} />}
      bottom={<BottomRankPanel edges={filters.filteredData.edges} />}
    />
  );
}
