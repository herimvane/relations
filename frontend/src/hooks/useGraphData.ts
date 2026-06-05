import { useCallback, useEffect, useState } from 'react';
import { fetchGraph, uploadExcel } from '../api/graphApi';
import { mockGraph } from '../data/mockGraph';
import { GraphData } from '../types/graph';

export function useGraphData() {
  const [data, setData] = useState<GraphData>(mockGraph);
  const [source, setSource] = useState('mock');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const remote = await fetchGraph();
      if (remote.nodes.length === 0) {
        throw new Error('Backend graph is empty, using mock data');
      }
      setData(remote);
      setSource('api');
      setError(undefined);
    } catch (err) {
      setData(mockGraph);
      setSource('mock');
      setError(err instanceof Error ? err.message : 'Backend unavailable, using mock data');
    } finally {
      setLoading(false);
    }
  }, []);

  const importExcel = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const imported = await uploadExcel(file);
      setData(imported);
      setSource(file.name);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, setData, source, setSource, loading, error, setError, refresh, importExcel };
}
