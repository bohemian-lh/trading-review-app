import { useState, useCallback, useRef, useEffect } from 'react';

interface ZoomPanState {
  dataStart: number; // fraction 0..1
  dataEnd: number; // fraction 0..1
}

/**
 * 图表缩放/平移 Hook
 * - Ctrl+滚轮: 缩放（调整可视数据窗口）
 * - 拖拽: 平移（滑动窗口）
 * - 双击: 重置
 *
 * @param dataLength 数据点总数
 * @returns { displayData, zoomRatio, resetZoom, containerRef, zoomPanState }
 */
export function useChartZoomPan(dataLength: number) {
  const [state, setState] = useState<ZoomPanState>({ dataStart: 0, dataEnd: 1 });
  const [zoomRatio, setZoomRatio] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartState = useRef<ZoomPanState>({ dataStart: 0, dataEnd: 1 });

  // Reset when data length changes
  useEffect(() => {
    setState({ dataStart: 0, dataEnd: 1 });
    setZoomRatio(1);
  }, [dataLength]);

  const resetZoom = useCallback(() => {
    setState({ dataStart: 0, dataEnd: 1 });
    setZoomRatio(1);
  }, []);

  // Mouse wheel zoom (Ctrl+wheel)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || dataLength <= 1) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();

      const rect = el.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left) / rect.width; // 0..1, mouse position ratio

      const currentRange = state.dataEnd - state.dataStart;
      const zoomSpeed = 0.15;
      const delta = e.deltaY > 0 ? zoomSpeed : -zoomSpeed;
      const newRange = Math.max(0.05, Math.min(1, currentRange + delta));

      // Zoom towards mouse position
      const center = state.dataStart + mouseX * currentRange;
      let newStart = center - mouseX * newRange;
      let newEnd = center + (1 - mouseX) * newRange;

      // Clamp
      if (newStart < 0) { newStart = 0; newEnd = newRange; }
      if (newEnd > 1) { newEnd = 1; newStart = 1 - newRange; }

      const newState = { dataStart: newStart, dataEnd: newEnd };
      setState(newState);
      setZoomRatio(parseFloat((1 / (newState.dataEnd - newState.dataStart)).toFixed(2)));
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [state, dataLength]);

  // Drag to pan
  useEffect(() => {
    const el = containerRef.current;
    if (!el || dataLength <= 1) return;

    const handleMouseDown = (e: MouseEvent) => {
      // Only drag on left button, not on interactive elements
      const target = e.target as HTMLElement;
      if (target.closest('label') || target.closest('button') || target.closest('input')) return;

      isDragging.current = true;
      dragStartX.current = e.clientX;
      dragStartState.current = { ...state };
      el.style.cursor = 'grabbing';
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - dragStartX.current;
      const rect = el.getBoundingClientRect();
      const dxRatio = dx / rect.width;
      const range = dragStartState.current.dataEnd - dragStartState.current.dataStart;

      let newStart = dragStartState.current.dataStart - dxRatio * range;
      let newEnd = dragStartState.current.dataEnd - dxRatio * range;

      // Clamp
      if (newStart < 0) { newStart = 0; newEnd = range; }
      if (newEnd > 1) { newEnd = 1; newStart = 1 - range; }

      setState({ dataStart: newStart, dataEnd: newEnd });
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      el.style.cursor = '';
    };

    el.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      el.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [state, dataLength]);

  // Compute visible slice
  const totalLen = dataLength;
  const startIdx = Math.floor(state.dataStart * totalLen);
  const endIdx = Math.max(startIdx + 1, Math.ceil(state.dataEnd * totalLen));

  return {
    containerRef,
    startIdx,
    endIdx,
    zoomRatio,
    isZoomed: state.dataStart > 0 || state.dataEnd < 1,
    resetZoom,
  };
}
