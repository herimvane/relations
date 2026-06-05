import { useMemo, useState } from 'react';
import { GraphData } from '../types/graph';

export function useGraphFilters(data: GraphData) {
  const allRelationTypes = useMemo(() => Array.from(new Set(data.edges.map((edge) => edge.relation_type))).sort(), [data]);
  const allNodeTypes = useMemo(() => Array.from(new Set(data.nodes.map((node) => node.type))).sort(), [data]);
  const [relationTypes, setRelationTypes] = useState<string[]>([]);
  const [nodeTypes, setNodeTypes] = useState<string[]>([]);
  const [minWeight, setMinWeight] = useState(0);

  const activeRelationTypes = relationTypes.length ? relationTypes : allRelationTypes;
  const activeNodeTypes = nodeTypes.length ? nodeTypes : allNodeTypes;

  const filteredData = useMemo(() => {
    const nodeIds = new Set(data.nodes.filter((node) => activeNodeTypes.includes(node.type)).map((node) => node.id));
    return {
      nodes: data.nodes.filter((node) => nodeIds.has(node.id)),
      edges: data.edges.filter(
        (edge) =>
          nodeIds.has(edge.source) &&
          nodeIds.has(edge.target) &&
          activeRelationTypes.includes(edge.relation_type) &&
          (edge.weight ?? 0) >= minWeight
      )
    };
  }, [activeNodeTypes, activeRelationTypes, data, minWeight]);

  return {
    allRelationTypes,
    allNodeTypes,
    relationTypes: activeRelationTypes,
    nodeTypes: activeNodeTypes,
    minWeight,
    setRelationTypes,
    setNodeTypes,
    setMinWeight,
    filteredData
  };
}
