'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { Text } from '@astryxdesign/core/Text';

import { indexFromScroll } from '@/lib/photo/carousel';

type PhotoCarouselProps<T extends { key: string }> = {
  items: readonly T[];
  renderMedia: (item: T, index: number) => ReactNode;
  renderBelow?: (item: T, index: number) => ReactNode;
};

export function PhotoCarousel<T extends { key: string }>({
  items,
  renderMedia,
  renderBelow,
}: PhotoCarouselProps<T>) {
  const count = items.length;
  const [index, setIndex] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const prevCountRef = useRef(count);
  const clampedIndex = Math.min(index, Math.max(count - 1, 0));

  useEffect(() => {
    indexRef.current = clampedIndex;
  }, [clampedIndex]);

  // Scroll to the last slide when a photo is added.
  useEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = count;
    if (count > prev) {
      setIndex(count - 1);
      const scroller = scrollerRef.current;
      if (scroller) scroller.scrollLeft = (count - 1) * scroller.clientWidth;
    }
  }, [count]);

  // Keep the in-view photo in view on resize.
  useEffect(() => {
    function handleResize() {
      const scroller = scrollerRef.current;
      if (scroller) scroller.scrollLeft = indexRef.current * scroller.clientWidth;
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  function handleScroll() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    setIndex(indexFromScroll(scroller.scrollLeft, scroller.clientWidth, count));
  }

  return (
    <section aria-label="Photo carousel" aria-roledescription="carousel">
      <div
        ref={scrollerRef}
        data-testid="photo-carousel-scroller"
        className="flex snap-x snap-mandatory overflow-x-auto"
        onScroll={handleScroll}
      >
        {items.map((item, slideIndex) => (
          <div
            key={item.key}
            role="group"
            aria-label={`Photo ${slideIndex + 1} of ${count}`}
            className="w-full shrink-0 snap-start"
          >
            <div className="flex aspect-[3/4] w-full justify-center overflow-hidden [&_img]:h-full [&_img]:max-w-none [&_img]:w-auto">
              {renderMedia(item, slideIndex)}
            </div>
            {renderBelow ? renderBelow(item, slideIndex) : null}
          </div>
        ))}
      </div>
      {count >= 2 ? (
        <Text type="body">
          {clampedIndex + 1} / {count}
        </Text>
      ) : null}
    </section>
  );
}
