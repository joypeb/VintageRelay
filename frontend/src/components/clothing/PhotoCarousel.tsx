'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Text } from '@astryxdesign/core/Text';

import {
  indexFromScroll,
  linearScrollAt,
  nextTarget,
  SLIDE_DURATION_MS,
} from '@/lib/photo/carousel';

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
  const rafRef = useRef<number | null>(null);
  const targetIndexRef = useRef<number | null>(null);
  const clampedIndex = Math.min(index, Math.max(count - 1, 0));

  // One slide animation at a time; every exit restores snap and clears the target.
  const cancelSlide = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const scroller = scrollerRef.current;
    if (scroller) scroller.style.scrollSnapType = '';
    targetIndexRef.current = null;
  }, []);

  useEffect(() => {
    indexRef.current = clampedIndex;
  }, [clampedIndex]);

  // Scroll to the last slide when a photo is added.
  useEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = count;
    cancelSlide();
    if (count > prev) {
      setIndex(count - 1);
      const scroller = scrollerRef.current;
      if (scroller) scroller.scrollLeft = (count - 1) * scroller.clientWidth;
    }
  }, [count, cancelSlide]);

  // Keep the in-view photo in view on resize.
  useEffect(() => {
    function handleResize() {
      cancelSlide();
      const scroller = scrollerRef.current;
      if (scroller) scroller.scrollLeft = indexRef.current * scroller.clientWidth;
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [cancelSlide]);

  // Unmount cancels any running slide.
  useEffect(() => cancelSlide, [cancelSlide]);

  function slide(dir: -1 | 1) {
    const scroller = scrollerRef.current;
    if (!scroller || count < 2 || scroller.clientWidth <= 0) return;
    const target = nextTarget(clampedIndex, targetIndexRef.current, dir, count);
    cancelSlide();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      scroller.scrollLeft = target * scroller.clientWidth;
      return;
    }
    const from = scroller.scrollLeft;
    const to = target * scroller.clientWidth;
    const el: HTMLDivElement = scroller;
    targetIndexRef.current = target;
    el.style.scrollSnapType = 'none';
    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      el.scrollLeft = linearScrollAt(from, to, elapsed, SLIDE_DURATION_MS);
      if (elapsed >= SLIDE_DURATION_MS) {
        rafRef.current = null;
        el.style.scrollSnapType = '';
        targetIndexRef.current = null;
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  function handleScroll() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    setIndex(indexFromScroll(scroller.scrollLeft, scroller.clientWidth, count));
  }

  return (
    <section aria-label="Photo carousel" aria-roledescription="carousel" className="relative">
      <div
        ref={scrollerRef}
        data-testid="photo-carousel-scroller"
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={handleScroll}
        onPointerDown={cancelSlide}
        onTouchStart={cancelSlide}
        onWheel={cancelSlide}
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
        <div className="pointer-events-none absolute inset-x-0 top-0 aspect-[3/4]">
          <div className="pointer-events-auto absolute left-2 top-1/2 hidden -translate-y-1/2 pointer-fine:block">
            <IconButton
              label="Previous photo"
              icon={<Icon icon="chevronLeft" />}
              isDisabled={clampedIndex <= 0}
              onClick={() => slide(-1)}
            />
          </div>
          <div className="pointer-events-auto absolute right-2 top-1/2 hidden -translate-y-1/2 pointer-fine:block">
            <IconButton
              label="Next photo"
              icon={<Icon icon="chevronRight" />}
              isDisabled={clampedIndex >= count - 1}
              onClick={() => slide(1)}
            />
          </div>
        </div>
      ) : null}
      {count >= 2 ? (
        <Text type="body">
          {clampedIndex + 1} / {count}
        </Text>
      ) : null}
    </section>
  );
}
