import { useMemo, useState } from 'react';
import { Network } from 'lucide-react';
import { extractTableGraph } from '../api/queryApi';
import { GraphData } from '../types/graph';

type Props = {
  onLoadGraph: (graph: GraphData, source: string) => void;
  onError: (message?: string) => void;
};

const sampleTable = `person,friend,relation,score
张明,李宁,好友,78
李宁,王晨,同学,64
王晨,赵航,同事,82`;

function parseTable(text: string) {
  const rows = text.trim().split(/\r?\n/).filter(Boolean);
  if (rows.length < 2) return [];
  const separator = rows[0].includes('\t') ? '\t' : ',';
  const headers = rows[0].split(separator).map((item) => item.trim());
  return rows.slice(1).map((line) => {
    const values = line.split(separator).map((item) => item.trim());
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

export function TableExtractPanel({ onLoadGraph, onError }: Props) {
  const [tableText, setTableText] = useState(sampleTable);
  const [sourceField, setSourceField] = useState('person');
  const [targetField, setTargetField] = useState('friend');
  const [relationField, setRelationField] = useState('relation');
  const [weightField, setWeightField] = useState('score');
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => parseTable(tableText), [tableText]);

  const runExtract = async () => {
    setBusy(true);
    try {
      const graph = await extractTableGraph({
        rows,
        source_field: sourceField,
        target_field: targetField,
        relation_field: relationField || undefined,
        weight_field: weightField || undefined
      });
      onLoadGraph(graph, 'table');
      onError(undefined);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Table extraction failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel-section">
      <div className="section-title">二维表抽取</div>
      <div className="datasource-form">
        <textarea value={tableText} onChange={(event) => setTableText(event.target.value)} aria-label="table rows" />
        <div className="form-grid">
          <input value={sourceField} onChange={(event) => setSourceField(event.target.value)} placeholder="source field" />
          <input value={targetField} onChange={(event) => setTargetField(event.target.value)} placeholder="target field" />
          <input value={relationField} onChange={(event) => setRelationField(event.target.value)} placeholder="relation field" />
          <input value={weightField} onChange={(event) => setWeightField(event.target.value)} placeholder="weight field" />
        </div>
        <button type="button" className="wide-action" onClick={runExtract} disabled={busy || rows.length === 0}>
          <Network size={14} />
          抽取图谱
        </button>
      </div>
    </section>
  );
}
