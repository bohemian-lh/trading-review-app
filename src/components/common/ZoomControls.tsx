import React from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Button } from './Button';

interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  isAtMin: boolean;
  isAtMax: boolean;
  hint?: string;
  showHint: boolean;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
  isAtMin,
  isAtMax,
  hint,
  showHint,
}) => {
  return (
    <div className="flex items-center gap-2 bg-white rounded-lg shadow-sm border border-gray-200 px-3 py-2">
      <div className="flex items-center gap-1">
        <Button
          variant="secondary"
          size="sm"
          onClick={onZoomOut}
          disabled={isAtMin}
          className="!p-2"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <div className="w-16 text-center text-sm font-medium text-gray-700">
          {Math.round(zoom * 100)}%
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onZoomIn}
          disabled={isAtMax}
          className="!p-2"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>
      <div className="h-5 w-px bg-gray-200 mx-1" />
      <Button
        variant="secondary"
        size="sm"
        onClick={onReset}
        className="!p-2"
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
      {showHint && hint && (
        <div className="ml-2 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
          {hint}
        </div>
      )}
    </div>
  );
};
