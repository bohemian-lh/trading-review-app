import { useEffect } from 'react';
import { useUIStore } from '@/stores';
import { initializeFromR2 } from '@/hooks/useStoreSync';

export function useInitializeStore(): void {
  const isInitialized = useUIStore((state) => state.isInitialized);

  useEffect(() => {
    if (!isInitialized) {
      initializeFromR2();
    }
  }, [isInitialized]);
}
