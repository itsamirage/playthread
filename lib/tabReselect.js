import { useEffect, useRef } from "react";
import { onTabBarScroll } from "./tabBarScroll";

const listenersByTab = new Map();

export function emitTabReselect(tabKey) {
  const listeners = listenersByTab.get(tabKey);

  if (!listeners) {
    return;
  }

  for (const listener of listeners) {
    listener(Date.now());
  }
}

export function useTabReselectScroll(tabKey, { scrollRef, onRefresh } = {}) {
  const scrollOffsetRef = useRef(0);
  const restoreOffsetRef = useRef(0);
  const lastReselectAtRef = useRef(0);

  useEffect(() => {
    const nextListener = (timestamp) => {
      const currentOffset = scrollOffsetRef.current;
      const isNearTop = currentOffset <= 24;
      const pressedAgainQuickly = timestamp - lastReselectAtRef.current < 1400;

      const scrollToOffset = (offset) => {
        if (scrollRef?.current?.scrollToOffset) {
          scrollRef.current.scrollToOffset({ offset, animated: true });
        } else {
          scrollRef?.current?.scrollTo?.({ y: offset, animated: true });
        }
      };

      if (pressedAgainQuickly && isNearTop && restoreOffsetRef.current > 24) {
        scrollToOffset(restoreOffsetRef.current);
        restoreOffsetRef.current = 0;
        lastReselectAtRef.current = timestamp;
        return;
      }

      if (!isNearTop) {
        restoreOffsetRef.current = currentOffset;
        scrollToOffset(0);
      } else {
        onRefresh?.();
      }

      lastReselectAtRef.current = timestamp;
    };

    const listeners = listenersByTab.get(tabKey) ?? new Set();
    listeners.add(nextListener);
    listenersByTab.set(tabKey, listeners);

    return () => {
      const currentListeners = listenersByTab.get(tabKey);

      if (!currentListeners) {
        return;
      }

      currentListeners.delete(nextListener);

      if (currentListeners.size === 0) {
        listenersByTab.delete(tabKey);
      }
    };
  }, [onRefresh, scrollRef, tabKey]);

  return {
    onScroll(event) {
      scrollOffsetRef.current = event?.nativeEvent?.contentOffset?.y ?? 0;
      onTabBarScroll(event);
    },
    scrollEventThrottle: 16,
  };
}
