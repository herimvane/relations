import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, FileSpreadsheet, HelpCircle, Loader2, Plus, Trash2, UploadCloud, X } from 'lucide-react';
import { CommunityMethod, ImportanceAvailableField, ImportanceFormula, ImportanceFormulaComponent, ImportanceTemplate, ImportPreviewJob, ImportReport } from '../types/graph';

type ImportMode = 'temporary' | 'database';
const DEFAULT_COMMUNITY_METHOD: CommunityMethod = 'leiden';
const DEFAULT_IMPORTANCE_TEMPLATE: ImportanceTemplate = 'auto';

type Props = {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onTemporaryExcel: (file: File) => Promise<void>;
  onTemporaryCsv: (files: File[]) => Promise<void>;
  onCreatePreviewJob: (files: File[], communityMethod: CommunityMethod, importanceTemplate: ImportanceTemplate, importanceFormula?: ImportanceFormula) => Promise<ImportPreviewJob>;
  onFetchPreviewJob: (jobId: string) => Promise<ImportPreviewJob>;
  onCancelPreviewJob: (jobId: string) => Promise<ImportPreviewJob>;
  onCommitDatabase: (files: File[], communityMethod: CommunityMethod, importanceTemplate: ImportanceTemplate, importanceFormula?: ImportanceFormula) => Promise<ImportReport>;
};

const methodOptions: Array<{ value: CommunityMethod; label: string; description: string; tip: string }> = [
  {
    value: 'leiden',
    label: 'Leiden 推荐',
    description: '高质量社区，适合正式导入。',
    tip: '优点：社区连通性和稳定性更好，适合风控/社交大图。缺点：依赖 python-igraph/leidenalg，计算成本高于 Label。'
  },
  {
    value: 'louvain',
    label: 'Louvain',
    description: '质量与速度平衡，适合大图。',
    tip: '优点：经典模块度优化算法，速度快，社区质量通常优于 Label。缺点：可能产生局部最优，社区内部连通性弱于 Leiden。'
  },
  {
    value: 'label',
    label: 'Label Propagation',
    description: '轻量快速，适合预览。',
    tip: '优点：速度快、依赖少，适合快速试算。缺点：结果稳定性和社区质量通常不如 Louvain/Leiden。'
  },
  {
    value: 'connected',
    label: '连通分量',
    description: '最快粗分关系岛。',
    tip: '优点：结果稳定、速度最快。缺点：粒度很粗，一个大连通图只会得到一个社区。'
  },
  {
    value: 'existing',
    label: '使用已有字段',
    description: '沿用数据自带社区。',
    tip: '优点：保留外部系统或人工标注结果。缺点：如果 group/community_id 不完整，未标注节点会回退到连通分量。'
  }
];

function formatNumber(value: number) {
  return value.toLocaleString();
}

function fileSummary(files: File[]) {
  if (files.length === 0) return '尚未选择文件';
  if (files.length === 1) return files[0].name;
  return `${files.length} 个文件`;
}

function nextPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function formulaWeightTotal(formula?: ImportanceFormula) {
  if (!formula) return 0;
  return formula.components
    .filter((component) => component.enabled && component.available)
    .reduce((total, component) => total + component.weight, 0);
}

function isCustomFormulaComponent(component: ImportanceFormulaComponent) {
  return component.key.startsWith('field:');
}

function normalizeFormula(formula: ImportanceFormula): ImportanceFormula {
  const total = formulaWeightTotal(formula);
  if (total <= 0) return formula;
  return {
    ...formula,
    components: formula.components.map((component) => ({
      ...component,
      weight: component.enabled && component.available ? Number((component.weight / total).toFixed(4)) : 0
    }))
  };
}

function FormulaEditor({
  formula,
  availableFields = [],
  disabled,
  onChange,
  onRestore
}: {
  formula?: ImportanceFormula;
  availableFields?: ImportanceAvailableField[];
  disabled?: boolean;
  onChange: (formula: ImportanceFormula) => void;
  onRestore: () => void;
}) {
  const [selectedFieldKey, setSelectedFieldKey] = useState('');

  if (!formula?.components?.length) {
    return (
      <div className="formula-editor empty">
        <div>
          <strong>重要度公式</strong>
          <span>上传后点击预检，系统会根据字段自动生成推荐公式。</span>
        </div>
      </div>
    );
  }

  const total = formulaWeightTotal(formula);
  const selectableFields = availableFields.filter((field) => (
    !formula.components.some((component) => component.source === field.key)
  ));
  const selectedField = selectableFields.find((field) => field.key === selectedFieldKey) ?? selectableFields[0];
  const updateComponent = (componentKey: string, patch: Partial<ImportanceFormulaComponent>) => {
    onChange({
      ...formula,
      components: formula.components.map((component) => (
        component.key === componentKey ? { ...component, ...patch } : component
      ))
    });
  };
  const removeComponent = (componentKey: string) => {
    onChange({
      ...formula,
      components: formula.components.filter((component) => component.key !== componentKey)
    });
  };
  const addField = () => {
    if (!selectedField) return;
    onChange({
      ...formula,
      components: [
        ...formula.components,
        {
          key: `field:${selectedField.key}`,
          label: `${selectedField.scope === 'edge' ? '关系' : '节点'} · ${selectedField.label}`,
          weight: 0.1,
          enabled: true,
          available: true,
          source: selectedField.key,
          reason: selectedField.reason,
          scope: selectedField.scope,
          field: selectedField.field,
          transform: selectedField.transform
        }
      ]
    });
    setSelectedFieldKey('');
  };

  return (
    <div className="formula-editor">
      <div className="formula-head">
        <div>
          <strong>重要度公式：{formula.label}</strong>
          <span>置信度 {(formula.confidence * 100).toFixed(0)}% · 保存时自动归一化</span>
        </div>
        <button type="button" className="link-action" disabled={disabled || !formula} onClick={onRestore}>恢复推荐</button>
      </div>
      <div className="formula-rows">
        {formula.components.map((component) => (
          <div className={!component.available ? 'formula-row disabled' : 'formula-row'} key={component.key}>
            <input
              type="checkbox"
              checked={component.enabled && component.available}
              disabled={disabled || !component.available}
              onChange={(event) => updateComponent(component.key, { enabled: event.target.checked })}
            />
            <span className="formula-label">
              <strong>{component.label}</strong>
              <small>{component.reason}</small>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(component.weight * 100)}
              disabled={disabled || !component.available || !component.enabled}
              onChange={(event) => updateComponent(component.key, { weight: Number(event.target.value) / 100 })}
            />
            <em>{Math.round(component.weight * 100)}%</em>
            <button
              type="button"
              className="formula-remove"
              title={isCustomFormulaComponent(component) ? '移除字段' : '默认结构项不可移除'}
              disabled={disabled || !isCustomFormulaComponent(component)}
              onClick={() => removeComponent(component.key)}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
      <div className="formula-add-row">
        <select
          value={selectedField?.key ?? ''}
          disabled={disabled || selectableFields.length === 0}
          onChange={(event) => setSelectedFieldKey(event.target.value)}
        >
          {selectableFields.length === 0 ? (
            <option value="">没有可添加的数值属性字段</option>
          ) : selectableFields.map((field) => (
            <option value={field.key} key={field.key}>
              {field.scope === 'edge' ? '关系' : '节点'} · {field.label} · 覆盖率 {(field.coverage * 100).toFixed(0)}%
            </option>
          ))}
        </select>
        <button type="button" className="secondary-action compact" disabled={disabled || !selectedField} onClick={addField}>
          <Plus size={14} />
          添加字段
        </button>
      </div>
      <div className={total <= 0 ? 'formula-total warning' : 'formula-total'}>
        {total <= 0
          ? '当前启用权重为 0，保存时会自动回退到默认结构公式。'
          : `当前启用权重合计 ${(total * 100).toFixed(0)}%，后端会按启用项重新归一化。`}
      </div>
    </div>
  );
}

function ReportView({ report }: { report: ImportReport }) {
  const metrics = [
    ['节点数', report.nodes],
    ['边数', report.edges],
    ['孤立节点', report.isolated_nodes],
    ['缺失端点边', report.missing_endpoint_edges],
    ['社区数量', report.communities]
  ];

  return (
    <div className="import-report">
      <div className="import-metrics">
        {metrics.map(([label, value]) => (
          <div className="import-metric" key={label}>
            <span>{label}</span>
            <strong>{formatNumber(Number(value))}</strong>
          </div>
        ))}
      </div>

      <div className={`importance-status ${report.importance_template_status}`}>
        <strong>推荐公式：{report.importance_formula?.label || report.importance_template_label}</strong>
        <span>
          {report.importance_template_status === 'available'
            ? `可添加字段 ${report.available_importance_fields?.length ?? 0} 个`
            : report.importance_template_status === 'degraded'
              ? `缺少推荐字段：${report.missing_recommended_fields.join('、')}`
              : `缺少必需字段：${report.missing_required_fields.join('、')}`}
        </span>
      </div>

      {report.warnings.length > 0 && (
        <div className="import-warnings">
          <AlertTriangle size={15} />
          <div>
            {report.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        </div>
      )}

      <div className="import-report-grid">
        <section>
          <h3>Top 节点</h3>
          <div className="import-list">
            {report.top_nodes.slice(0, 8).map((node) => (
              <div className="import-row" key={node.id}>
                <span>{node.name}</span>
                <small>{node.type} · {node.degree} 度 · {(node.importance_score * 100).toFixed(1)}</small>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3>社区 / 关系类型</h3>
          <div className="import-list compact">
            {report.top_communities.slice(0, 5).map(([name, count]) => (
              <div className="import-row" key={name}>
                <span>{name}</span>
                <small>{formatNumber(count)} 节点</small>
              </div>
            ))}
            {report.relation_types.slice(0, 5).map(([name, count]) => (
              <div className="import-row subtle" key={name}>
                <span>{name}</span>
                <small>{formatNumber(count)} 条</small>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export function ImportDataDialog({
  open,
  loading,
  onClose,
  onTemporaryExcel,
  onTemporaryCsv,
  onCreatePreviewJob,
  onFetchPreviewJob,
  onCancelPreviewJob,
  onCommitDatabase
}: Props) {
  const [mode, setMode] = useState<ImportMode>('temporary');
  const [temporaryFiles, setTemporaryFiles] = useState<File[]>([]);
  const [databaseFiles, setDatabaseFiles] = useState<File[]>([]);
  const [communityMethod, setCommunityMethod] = useState<CommunityMethod>(DEFAULT_COMMUNITY_METHOD);
  const [importanceTemplate, setImportanceTemplate] = useState<ImportanceTemplate>(DEFAULT_IMPORTANCE_TEMPLATE);
  const [importanceFormula, setImportanceFormula] = useState<ImportanceFormula>();
  const [formulaEdited, setFormulaEdited] = useState(false);
  const [report, setReport] = useState<ImportReport>();
  const [previewJob, setPreviewJob] = useState<ImportPreviewJob>();
  const [previewBusy, setPreviewBusy] = useState(false);
  const [commitBusy, setCommitBusy] = useState(false);
  const [temporaryError, setTemporaryError] = useState<string>();
  const [databaseError, setDatabaseError] = useState<string>();
  const activeFiles = mode === 'temporary' ? temporaryFiles : databaseFiles;
  const hasTemporaryFiles = temporaryFiles.length > 0;
  const hasDatabaseFiles = databaseFiles.length > 0;
  const previewRunning = previewBusy || previewJob?.status === 'queued' || previewJob?.status === 'running';
  const selectedFileSummary = useMemo(() => fileSummary(activeFiles), [activeFiles]);

  const clearDialogState = (nextMode: ImportMode = 'temporary') => {
    setMode(nextMode);
    setTemporaryFiles([]);
    setDatabaseFiles([]);
    setReport(undefined);
    setPreviewJob(undefined);
    setPreviewBusy(false);
    setCommitBusy(false);
    setCommunityMethod(DEFAULT_COMMUNITY_METHOD);
    setImportanceTemplate(DEFAULT_IMPORTANCE_TEMPLATE);
    setImportanceFormula(undefined);
    setFormulaEdited(false);
    setTemporaryError(undefined);
    setDatabaseError(undefined);
  };

  useEffect(() => {
    if (!previewJob || !['queued', 'running'].includes(previewJob.status)) return undefined;
    let stopped = false;
    const poll = async () => {
      try {
        const nextJob = await onFetchPreviewJob(previewJob.job_id);
        if (stopped) return;
        setPreviewJob(nextJob);
        if (nextJob.report) {
          setReport(nextJob.report);
          if (nextJob.report.importance_formula && !formulaEdited) {
            setImportanceFormula(nextJob.report.importance_formula);
          }
        }
        if (nextJob.status === 'failed') setDatabaseError(nextJob.error || nextJob.message || '校验报告生成失败');
      } catch (err) {
        if (!stopped) setDatabaseError(err instanceof Error ? err.message : '校验任务状态获取失败');
      }
    };
    const timer = window.setInterval(poll, 1200);
    poll();
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [formulaEdited, onFetchPreviewJob, previewJob]);

  useEffect(() => {
    if (!open) clearDialogState();
  }, [open]);

  const resetDialog = (nextMode: ImportMode = 'temporary') => {
    clearDialogState(nextMode);
  };

  const handleClose = () => {
    clearDialogState();
    onClose();
  };

  if (!open) return null;

  const resetSelection = (nextFiles: File[]) => {
    if (mode === 'temporary') {
      setTemporaryFiles(nextFiles);
      setTemporaryError(undefined);
      return;
    }
    setDatabaseFiles(nextFiles);
    setReport(undefined);
    setPreviewJob(undefined);
    setImportanceFormula(undefined);
    setFormulaEdited(false);
    setDatabaseError(undefined);
  };

  const runTemporaryImport = async () => {
    setTemporaryError(undefined);
    const excelFile = temporaryFiles.find((file) => /\.(xlsx|xls)$/i.test(file.name));
    const csvFiles = temporaryFiles.filter((file) => /\.csv$/i.test(file.name));
    try {
      if (excelFile) await onTemporaryExcel(excelFile);
      else if (csvFiles.length) await onTemporaryCsv(csvFiles);
      else throw new Error('请选择 Excel 或 CSV 文件');
      resetDialog('temporary');
      onClose();
    } catch (err) {
      setTemporaryError(err instanceof Error ? err.message : '临时导入失败');
    }
  };

  const runPreview = async () => {
    if (!hasDatabaseFiles) return;
    setDatabaseError(undefined);
    setPreviewBusy(true);
    try {
      const job = await onCreatePreviewJob(
        databaseFiles,
        communityMethod,
        importanceTemplate,
        importanceFormula ? normalizeFormula(importanceFormula) : undefined,
      );
      setPreviewJob(job);
      if (job.report) {
        setReport(job.report);
        if (job.report.importance_formula && !formulaEdited) {
          setImportanceFormula(job.report.importance_formula);
        }
      }
    } catch (err) {
      setDatabaseError(err instanceof Error ? err.message : '校验报告生成失败');
    } finally {
      setPreviewBusy(false);
    }
  };

  const cancelPreview = async () => {
    if (!previewJob || !['queued', 'running'].includes(previewJob.status)) return;
    setDatabaseError(undefined);
    try {
      setPreviewJob(await onCancelPreviewJob(previewJob.job_id));
    } catch (err) {
      setDatabaseError(err instanceof Error ? err.message : '取消校验任务失败');
    }
  };

  const runCommit = async () => {
    if (!hasDatabaseFiles) return;
    setDatabaseError(undefined);
    setCommitBusy(true);
    setPreviewBusy(false);
    try {
      await nextPaint();
      setReport(await onCommitDatabase(
        databaseFiles,
        communityMethod,
        importanceTemplate,
        importanceFormula ? normalizeFormula(importanceFormula) : undefined,
      ));
      resetDialog('temporary');
      onClose();
    } catch (err) {
      setDatabaseError(err instanceof Error ? err.message : '数据库导入失败');
    } finally {
      setCommitBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="import-dialog" role="dialog" aria-modal="true" aria-label="导入数据">
        <header className="import-dialog-head">
          <div>
            <span className="eyebrow">Data Ingestion</span>
            <h2>导入数据</h2>
          </div>
          <button type="button" className="ghost-icon" title="关闭" onClick={handleClose}>
            <X size={18} />
          </button>
        </header>

        <div className="import-mode-tabs">
          <button
            type="button"
            className={mode === 'temporary' ? 'active' : undefined}
            onClick={() => {
              setMode('temporary');
            }}
          >
            <FileSpreadsheet size={16} />
            <span>临时模式</span>
          </button>
          <button
            type="button"
            className={mode === 'database' ? 'active' : undefined}
            onClick={() => {
              setMode('database');
            }}
          >
            <Database size={16} />
            <span>数据库模式</span>
          </button>
        </div>

        <label className="import-dropzone">
          <UploadCloud size={22} />
          <strong>{selectedFileSummary}</strong>
          <small>{mode === 'temporary' ? '导入到当前会话，不覆盖数据库' : '先预检数据，确认后导入并覆盖当前数据库'}</small>
          <input
            key={mode}
            type="file"
            accept=".xlsx,.xls,.csv"
            multiple
            onChange={(event) => resetSelection(Array.from(event.target.files ?? []))}
          />
        </label>

        {mode === 'database' && (
          <div className="community-methods">
            <div className="section-title">社区识别方法</div>
            {methodOptions.map((option) => (
              <button
                type="button"
                key={option.value}
                className={communityMethod === option.value ? 'active' : undefined}
                disabled={previewRunning}
                onClick={() => {
                  setCommunityMethod(option.value);
                  setReport(undefined);
                  setPreviewJob(undefined);
                  setImportanceFormula(undefined);
                  setFormulaEdited(false);
                }}
              >
                <HelpCircle className="method-help" size={14} aria-label={option.tip}>
                  <title>{option.tip}</title>
                </HelpCircle>
                <span>{option.label}</span>
                <small>{option.description}</small>
              </button>
            ))}
          </div>
        )}

        {mode === 'database' && (
          <FormulaEditor
            formula={importanceFormula}
            availableFields={report?.available_importance_fields}
            disabled={previewRunning || commitBusy}
            onChange={(nextFormula) => {
              setImportanceFormula(nextFormula);
              setFormulaEdited(true);
            }}
            onRestore={() => {
              setImportanceFormula(report?.importance_formula);
              setFormulaEdited(false);
            }}
          />
        )}

        {mode === 'database' && previewJob && (
          <div className={`preview-job ${previewJob.status}`}>
            <div className="preview-job-head">
              <span>{previewJob.stage_label || previewJob.message || '正在生成校验报告...'}</span>
              <strong>{previewJob.stage_index || 1}/{previewJob.stage_total || 5}</strong>
            </div>
            <div className="preview-job-message">{previewJob.message || '正在生成校验报告...'}</div>
            <div className="preview-progress">
              <span style={{ width: `${Math.max(2, Math.min(100, previewJob.progress))}%` }} />
            </div>
            {['queued', 'running'].includes(previewJob.status) && (
              <button type="button" className="link-action" onClick={cancelPreview}>
                取消校验任务
              </button>
            )}
          </div>
        )}
        {mode === 'temporary' && temporaryError && <div className="import-error">{temporaryError}</div>}
        {mode === 'database' && databaseError && <div className="import-error">{databaseError}</div>}
        {mode === 'database' && report && <ReportView report={report} />}

        <footer className="import-dialog-actions">
          <button type="button" className="secondary-action" onClick={handleClose}>取消</button>
          {mode === 'temporary' ? (
            <button type="button" className="primary-action" disabled={!hasTemporaryFiles || loading} onClick={runTemporaryImport}>
              {loading ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
              导入临时图谱
            </button>
          ) : (
            <>
              <button
                type="button"
                className="secondary-action"
                disabled={!hasDatabaseFiles || previewRunning || commitBusy}
                onClick={runPreview}
              >
                {previewRunning ? <Loader2 size={16} className="spin" /> : null}
                预检数据
              </button>
              <button type="button" className="primary-action danger" disabled={!hasDatabaseFiles || !report || commitBusy || previewRunning} onClick={runCommit}>
                {commitBusy ? <Loader2 size={16} className="spin" /> : null}
                确认导入数据库
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
