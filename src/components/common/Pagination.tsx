import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  total: number;
}

/**
 * 页码分页：1 2 3 4 … + 上一页/下一页 + “跳至第 N 页”。
 * 不使用「加载更多」的追加式交互，页码与总数都直接对应服务端分页结果。
 */
export const Pagination: React.FC<Props> = ({ currentPage, totalPages, onPageChange, pageSize, total }) => {
  const [jumpValue, setJumpValue] = useState('');

  // 页码变化后清空输入，避免把上一页的数字留在输入框里
  useEffect(() => {
    setJumpValue('');
  }, [currentPage]);

  if (totalPages <= 1) return null;

  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('...');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  const submitJump = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = Number(jumpValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setJumpValue('');
      return;
    }
    const target = Math.min(Math.max(1, Math.trunc(parsed)), totalPages);
    if (target !== currentPage) onPageChange(target);
    setJumpValue('');
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-white border-t">
      <span className="text-sm text-gray-600">
        共 {total} 条，每页 {pageSize} 条，第 {currentPage}/{totalPages} 页
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
          aria-label="上一页"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="px-2 text-gray-400">...</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`w-8 h-8 text-sm rounded ${p === currentPage ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 text-gray-700'}`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
          aria-label="下一页"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <form onSubmit={submitJump} className="ml-2 flex items-center gap-1 text-sm text-gray-600">
          <span>跳至</span>
          <input
            value={jumpValue}
            onChange={(e) => setJumpValue(e.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric"
            aria-label="跳转页码"
            className="w-12 px-1.5 py-1 text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder={String(currentPage)}
          />
          <span>页</span>
          <button
            type="submit"
            className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
          >
            确定
          </button>
        </form>
      </div>
    </div>
  );
};
