import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * 表格缩放 Hook
 * 提供 Ctrl+滚轮缩放 + 按钮缩放功能
 * 支持缩放范围限制和重置
 */
export function useTableZoom(minZoom = 0.5, maxZoom = 3) {
  const [zoom, setZoom] = useState(1);
  const [showZoomHint, setShowZoomHint] = useState(false);
  const [zoomHint, setZoomHint] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const hideHintTimer = useRef<ReturnType<typeof setTimeout>>();

  const showHint = useCallback((message: string) => {
    setZoomHint(message);
    setShowZoomHint(true);
    if (hideHintTimer.current) clearTimeout(hideHintTimer.current);
    hideHintTimer.current = setTimeout(() => setShowZoomHint(false), 2000);
  }, []);

  const increaseZoom = useCallback(() => {
    setZoom(prev => {
      const newZoom = Math.min(prev + 0.2, maxZoom);
      return parseFloat(newZoom.toFixed(1));
    });
    showHint(`已放大至 ${Math.round(zoom * 100)}%`);
  }, [maxZoom, showHint, zoom]);

  const decreaseZoom = useCallback(() => {
    setZoom(prev => {
      const newZoom = Math.max(prev - 0.2, minZoom);
      return parseFloat(newZoom.toFixed(1));
    });
    showHint(`已缩小至 ${Math.round(zoom * 100)}%`);
  }, [minZoom, showHint, zoom]);

  const resetZoom = useCallback(() => {
    setZoom(1);
    showHint('已重置缩放');
  }, [showHint]);

  const isAtMin = zoom <= minZoom;
  const isAtMax = zoom >= maxZoom;

  const zoomStyle = { transform: `scale(${zoom})`, transformOrigin: 'top left' };

  // Ctrl+滚轮缩放
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) increaseZoom();
        else decreaseZoom();
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [increaseZoom, decreaseZoom]);

  return { zoom, containerRef, showZoomHint, zoomHint, resetZoom, increaseZoom, decreaseZoom, isAtMin, isAtMax, zoomStyle };
}
