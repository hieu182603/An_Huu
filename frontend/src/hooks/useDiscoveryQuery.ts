import { useEffect, useRef, useState } from "react";
export function useDiscoveryQuery<T>(key: string, query: (signal: AbortSignal) => Promise<T>) {
  const latest = useRef(query); latest.current = query;
  const [state, setState] = useState<{ key: string; data?: T; error?: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    latest.current(controller.signal).then(data => { if (active) setState({ key, data }); }).catch(error => { if (active) setState({ key, error: error instanceof Error ? error.message : "Không tải được dữ liệu." }); });
    return () => { active = false; controller.abort(); };
  }, [key]);
  const current = state?.key === key ? state : null;
  // `previous` is the last successful result for an earlier key, so pages can keep
  // showing figures while a refresh runs instead of blanking them.
  return { data: current?.data, error: current?.error, loading: !current, previous: state?.data };
}
