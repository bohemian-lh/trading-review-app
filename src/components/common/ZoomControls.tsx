import React from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  isAtMin: boolean;
  isAtMax: boolean;
  showHint: boolean;
  hint: string;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
  isAtMin,
  isAtMax,
  showHint,
  hint,
}) => {
  return (
    <div className="flex items-center gap-2 bg-white rounded-lg shadow-sm border border-gray-200 px-3 py-2 relative">
      <button
        onClick={onZoomOut}
        disabled={isAtMin}
        className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
        title="缩小"
      >
        <ZoomOut className="h-4 w-4" />
      </button>
      <span className="text-sm font-medium text-gray-700 w-12 text-center">{Math.round(zoom * 100)}%</span>
      <button
        onClick={onZoomIn}
        disabled={isAtMax}
        className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
        title="放大"
      >
        <ZoomIn className="h-4 w-4" />
      </button>
      <button
        onClick={onReset}
        className="p-2 rounded-md hover:bg-gray-100"
        title="重置"
      >
        <RotateCcw className="h-4 w-4" />
      </button>
      {showHint && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
          {hint}
        </div>
      )}
    </div>
  );
};
