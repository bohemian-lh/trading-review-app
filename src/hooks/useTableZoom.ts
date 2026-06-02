import { useState, useCallback, useEffect, useRef, useMemo } from 'react';

const MIN_ZOOM = 0.5; // 50%
const MAX_ZOOM = 2.0; // 200%
const ZOOM_STEP = 0.1; // 10% per step

export function useTableZoom() {
  const [zoom, setZoom] = useState(1.0);
  const [showZoomHint, setShowZoomHint] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      
      // Calculate new zoom
      const zoomDelta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      const newZoom = Math.min(Math.max(zoom + zoomDelta, MIN_ZOOM), MAX_ZOOM);
      
      if (newZoom !== zoom) {
        setZoom(newZoom);
        
        // Show hint when reaching limits
        if (newZoom === MIN_ZOOM || newZoom === MAX_ZOOM) {
          setShowZoomHint(true);
          setTimeout(() => setShowZoomHint(false), 2000);
        }
      }
    }
  }, [zoom]);

  const resetZoom = useCallback(() => {
    setZoom(1.0);
  }, []);

  const increaseZoom = useCallback(() => {
    setZoom(prev => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const decreaseZoom = useCallback(() => {
    setZoom(prev => Math.max(prev - ZOOM_STEP, MIN_ZOOM));
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  // memo 稳定 zoomStyle 引用 + CSS contain 隔离布局重计算
  const zoomStyle = useMemo(() => ({
    transform: `scale(${zoom})`,
    transformOrigin: 'top left' as const,
    width: `${100 / zoom}%`,
    contain: 'layout style' as const,
  }), [zoom]);

  return {
    zoom,
    setZoom,
    containerRef,
    showZoomHint,
    zoomHint: zoom === MIN_ZOOM ? '已达到最小缩放比例' : zoom === MAX_ZOOM ? '已达到最大缩放比例' : '',
    resetZoom,
    increaseZoom,
    decreaseZoom,
    isAtMin: zoom === MIN_ZOOM,
    isAtMax: zoom === MAX_ZOOM,
    zoomStyle,
  };
}
