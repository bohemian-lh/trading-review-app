import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Image } from 'lucide-react';
import { useImageDirectory } from '@/hooks/useImageDirectory';

interface Props {
  images: string[];
  isOpen: boolean;
  onClose: () => void;
}

export const ImagePreviewModal: React.FC<Props> = ({ images, isOpen, onClose }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { getImageBlobUrl, getImageFullPath } = useImageDirectory();

  useEffect(() => {
    if (!isOpen || images.length === 0) return;
    setCurrentIdx(prev => Math.min(prev, images.length - 1));
  }, [isOpen, images.length]);

  useEffect(() => {
    if (!isOpen || images.length === 0) return;
    const filename = images[currentIdx];
    if (!filename) { setBlobUrl(null); return; }
    setLoading(true);
    getImageBlobUrl(filename)
      .then(setBlobUrl)
      .catch(() => setBlobUrl(null))
      .finally(() => setLoading(false));
  }, [isOpen, currentIdx, images, getImageBlobUrl]);

  // 键盘导航
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, currentIdx, images.length]);

  if (!isOpen || images.length === 0) return null;

  const prev = () => setCurrentIdx(i => (i > 0 ? i - 1 : images.length - 1));
  const next = () => setCurrentIdx(i => (i < images.length - 1 ? i + 1 : 0));

  const currentFile = images[currentIdx];
  const fullPath = currentFile ? getImageFullPath(currentFile) : '';

  return createPortal(
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10001]" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Image className="h-5 w-5 text-blue-600" />
            <span className="font-medium text-gray-900">
              {currentIdx + 1} / {images.length}
            </span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Image area */}
        <div className="flex-1 flex items-center justify-center p-4 min-h-0">
          <button onClick={prev} className="p-2 hover:bg-gray-100 rounded-full">
            <ChevronLeft className="h-6 w-6 text-gray-600" />
          </button>

          <div className="flex-1 flex items-center justify-center max-h-[60vh] mx-2">
            {loading ? (
              <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
            ) : blobUrl ? (
              <img src={blobUrl} alt={currentFile} className="max-w-full max-h-[60vh] object-contain rounded" />
            ) : (
              <p className="text-gray-500">图片加载失败: {currentFile}</p>
            )}
          </div>

          <button onClick={next} className="p-2 hover:bg-gray-100 rounded-full">
            <ChevronRight className="h-6 w-6 text-gray-600" />
          </button>
        </div>

        {/* Footer: path */}
        <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-600 font-mono rounded-b-lg truncate">
          {fullPath}
        </div>
      </div>
    </div>,
    document.body
  );
};
