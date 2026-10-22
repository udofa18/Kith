import { useCallback, useEffect, useState } from 'react';

/**
 * Tracks whether an element is on screen. Attach the returned `ref` to the element;
 * it works even if the element mounts later (e.g. after a loading state).
 * `seen` flips to true the first time it appears and stays true.
 */
export function useInView<T extends Element = HTMLDivElement>(options: IntersectionObserverInit = {}) {
  const [node, setNode] = useState<T | null>(null);
  const [inView, setInView] = useState(false);
  const [seen, setSeen] = useState(false);
  const ref = useCallback((el: T | null) => setNode(el), []);
  const { root, rootMargin, threshold } = options;

  useEffect(() => {
    if (!node) {
      setInView(false);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting);
      if (entry.isIntersecting) setSeen(true);
    }, { root, rootMargin, threshold });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, root, rootMargin, threshold]);

  return { ref, inView, seen };
}
