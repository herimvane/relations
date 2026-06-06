import { DataSourcePanel } from './DataSourcePanel';
import { FilterPanel } from './FilterPanel';
import { TableExtractPanel } from './TableExtractPanel';
import { GraphData } from '../types/graph';

type Props = {
  source: string;
  status: string;
  loading: boolean;
  error?: string;
  allRelationTypes: string[];
  activeRelationTypes: string[];
  allNodeTypes: string[];
  activeNodeTypes: string[];
  minWeight: number;
  onRelationTypesChange: (values: string[]) => void;
  onNodeTypesChange: (values: string[]) => void;
  onMinWeightChange: (value: number) => void;
  onLoadMock: () => void;
  onLoadGraph: (graph: GraphData, source: string) => void;
  onError: (message?: string) => void;
};

export function LeftPanel({
  source,
  status,
  loading,
  error,
  allRelationTypes,
  activeRelationTypes,
  allNodeTypes,
  activeNodeTypes,
  minWeight,
  onRelationTypesChange,
  onNodeTypesChange,
  onMinWeightChange,
  onLoadMock,
  onLoadGraph,
  onError
}: Props) {
  return (
    <aside className="left-panel">
      <DataSourcePanel
        source={source}
        status={status}
        loading={loading}
        error={error}
        onLoadMock={onLoadMock}
        onLoadGraph={onLoadGraph}
        onError={onError}
      />
      <TableExtractPanel onLoadGraph={onLoadGraph} onError={onError} />
      <FilterPanel title="节点类型" values={allNodeTypes} active={activeNodeTypes} onChange={onNodeTypesChange} />
      <FilterPanel title="关系类型" values={allRelationTypes} active={activeRelationTypes} onChange={onRelationTypesChange} />
      <section className="panel-section">
        <div className="section-title">权重阈值</div>
        <input
          className="range"
          type="range"
          min="0"
          max="100"
          step="1"
          value={minWeight}
          onChange={(event) => onMinWeightChange(Number(event.target.value))}
        />
        <div className="range-value">≥ {minWeight}</div>
      </section>
    </aside>
  );
}
