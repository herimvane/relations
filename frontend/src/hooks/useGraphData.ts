import { useCallback, useEffect, useState } from 'react';
import { fetchGraph, uploadCsv, uploadExcel } from '../api/graphApi';
import { mockGraph } from '../data/mockGraph';
import { GraphData } from '../types/graph';

export function useGraphData() {
  const [data, setData] = useState<GraphData>({ nodes: [], edges: [] });
  const [source, setSource] = useState('loading');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState('正在连接后端图谱数据...');

  const refresh = useCallback(async () => {
    setLoading(true);
    setStatus('正在连接后端图谱数据...');
    try {
      const remote = await fetchGraph();
      if (remote.nodes.length === 0) {
        throw new Error('Backend graph is empty, using mock data');
      }
      setData(remote);
      setSource('api');
      setError(undefined);
      setStatus(`已加载后端图谱：${remote.nodes.length.toLocaleString()} 节点 / ${remote.edges.length.toLocaleString()} 关系`);
    } catch (err) {
      setData(mockGraph);
      setSource('mock');
      setError(err instanceof Error ? err.message : 'Backend unavailable, using mock data');
      setStatus(`使用内置 mock 数据：${mockGraph.nodes.length.toLocaleString()} 节点 / ${mockGraph.edges.length.toLocaleString()} 关系`);
    } finally {
      setLoading(false);
    }
  }, []);

  const importExcel = useCallback(async (file: File) => {
    setLoading(true);
    setStatus('正在导入 Excel 数据，大文件可能需要 10-30 秒...');
    try {
      const imported = await uploadExcel(file);
      setData(imported);
      setSource(`excel:${file.name}`);
      setError(undefined);
      setStatus(`导入完成：${imported.nodes.length.toLocaleString()} 节点 / ${imported.edges.length.toLocaleString()} 关系`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      setError(message);
      setStatus(`导入失败：${message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const importCsv = useCallback(async (files: File[]) => {
    setLoading(true);
    setStatus('正在导入 CSV 数据...');
    try {
      const lowerName = (file: File) => file.name.toLowerCase();
      const nodesFile = files.find((file) => /node|nodes|节点/.test(lowerName(file))) ?? files[0];
      const edgesFile = files.find((file) => /edge|edges|relation|relations|关系|边/.test(lowerName(file))) ?? files[1];
      const imported = await uploadCsv(nodesFile, edgesFile);
      setData(imported);
      setSource(`csv:${files.map((file) => file.name).join(', ')}`);
      setError(undefined);
      setStatus(`导入完成：${imported.nodes.length.toLocaleString()} 节点 / ${imported.edges.length.toLocaleString()} 关系`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'CSV import failed';
      setError(message);
      setStatus(`导入失败：${message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMock = useCallback(() => {
    setData(mockGraph);
    setSource('mock');
    setError(undefined);
    setStatus(`已切回内置 mock 数据：${mockGraph.nodes.length.toLocaleString()} 节点 / ${mockGraph.edges.length.toLocaleString()} 关系`);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, setData, source, setSource, loading, error, setError, status, setStatus, refresh, importExcel, importCsv, loadMock };
}
