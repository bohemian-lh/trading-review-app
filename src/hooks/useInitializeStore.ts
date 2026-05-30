import { useEffect } from 'react';
import { useDataStore } from '@/stores';

export function useInitializeStore(): void {
  const loadFromR2 = useDataStore((state) => state.loadFromR2);
  const isInitialized = useDataStore((state) => state.isInitialized);

  useEffect(() => {
    if (!isInitialized) {
      loadFromR2();
    }
  }, [loadFromR2, isInitialized]);
}
