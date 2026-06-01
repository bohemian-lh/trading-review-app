import { create } from 'zustand';
import {
  DEFAULT_HEADER_KEYWORDS,
  HeaderKeywords,
  setHeaderKeywords as setKeywordsInParser,
  resetHeaderKeywords as resetKeywordsInParser
} from '../services/text-parser';

const STORAGE_KEY = 'text-parser-header-keywords';

interface HeaderKeywordsStore {
  keywords: HeaderKeywords;
  setKeywords: (keywords: Partial<HeaderKeywords>) => void;
  resetKeywords: () => void;
  loadKeywords: () => void;
}

export const useHeaderKeywordsStore = create<HeaderKeywordsStore>((set) => ({
  keywords: { ...DEFAULT_HEADER_KEYWORDS },

  setKeywords: (keywords) => {
    // 先更新 parser
    setKeywordsInParser(keywords);
    // 再更新 store
    set((state) => {
      const newKeywords = { ...state.keywords, ...keywords };
      // 保存到 localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newKeywords));
      }
      return { keywords: newKeywords };
    });
  },

  resetKeywords: () => {
    // 先重置 parser
    resetKeywordsInParser();
    // 再更新 store
    set({ keywords: { ...DEFAULT_HEADER_KEYWORDS } });
    // 删除 localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  },

  loadKeywords: () => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<HeaderKeywords>;
          const loadedKeywords = {
            ...DEFAULT_HEADER_KEYWORDS,
            ...parsed
          };
          setKeywordsInParser(loadedKeywords);
          set({ keywords: loadedKeywords });
        }
      } catch (e) {
        console.error('加载关键词配置失败:', e);
      }
    }
  }
}));
