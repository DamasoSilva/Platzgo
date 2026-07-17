"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { OptimizedImage } from "./OptimizedImage";

const VISIBLE_WINDOW = 3;

export function PhotoStrip({
  photos,
  altPrefix = "Foto",
}: {
  photos: string[];
  altPrefix?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const left = el.scrollLeft;

    const center = left + el.clientWidth / 2;
    const children = Array.from(el.children) as HTMLElement[];
    let closest = 0;
    let minDist = Infinity;
    children.forEach((child, i) => {
      const dist = Math.abs(child.offsetLeft + child.offsetWidth / 2 - center);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    });
    setActiveIndex(closest);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        updateScrollState();
      });
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    updateScrollState();

    const ro = new ResizeObserver(() => {
      updateScrollState();
    });
    ro.observe(el);

    return () => {
      el.removeEventListener("scroll", handleScroll);
      ro.disconnect();
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [updateScrollState]);

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = el.firstElementChild?.clientWidth ?? 300;
    const gap = 16;
    const step = cardWidth + gap;
    if (direction === "right") {
      if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 4) {
        el.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        el.scrollBy({ left: step, behavior: "smooth" });
      }
    } else {
      if (el.scrollLeft <= 4) {
        el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
      } else {
        el.scrollBy({ left: -step, behavior: "smooth" });
      }
    }
  };

  const visibleRange = useMemo(() => {
    if (photos.length <= VISIBLE_WINDOW) {
      return { start: 0, end: photos.length };
    }
    const start = Math.max(0, activeIndex - 1);
    const end = Math.min(photos.length, start + VISIBLE_WINDOW);
    return { start, end };
  }, [photos.length, activeIndex]);

  if (photos.length === 0) {
    return (
      <div className="flex h-48 sm:h-64 items-center justify-center rounded-2xl bg-card/50 border border-border/50 text-sm text-muted-foreground">
        Nenhuma foto disponível
      </div>
    );
  }

  if (photos.length === 1) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-card/30">
        <OptimizedImage
          src={photos[0]}
          alt={`${altPrefix} 1`}
          width={1200}
          height={600}
          className="w-full aspect-[2/1] object-cover"
          priority
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1100px"
        />
      </div>
    );
  }

  const useVirtualization = photos.length > VISIBLE_WINDOW + 2;

  return (
    <div className="relative group">
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-none scroll-smooth"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {useVirtualization
          ? photos.map((url, i) => {
              const isVisible = i >= visibleRange.start && i < visibleRange.end;
              return (
                <div
                  key={i}
                  className="flex-shrink-0 w-[85vw] sm:w-[55vw] lg:w-[45vw] max-w-[700px] snap-center"
                  style={{ minHeight: isVisible ? "auto" : "0" }}
                >
                  <div className="relative overflow-hidden rounded-2xl bg-card/30">
                    {isVisible ? (
                      <OptimizedImage
                        src={url}
                        alt={`${altPrefix} ${i + 1}`}
                        width={800}
                        height={450}
                        className="w-full aspect-[16/9] object-cover"
                        priority={i === 0}
                        sizes="(max-width: 640px) 85vw, (max-width: 1024px) 55vw, 45vw"
                      />
                    ) : (
                      <div className="w-full aspect-[16/9] bg-card/30" />
                    )}
                  </div>
                </div>
              );
            })
          : photos.map((url, i) => (
              <div
                key={i}
                className="flex-shrink-0 w-[85vw] sm:w-[55vw] lg:w-[45vw] max-w-[700px] snap-center"
              >
                <div className="relative overflow-hidden rounded-2xl bg-card/30">
                  <OptimizedImage
                    src={url}
                    alt={`${altPrefix} ${i + 1}`}
                    width={800}
                    height={450}
                    className="w-full aspect-[16/9] object-cover"
                    priority={i === 0}
                    sizes="(max-width: 640px) 85vw, (max-width: 1024px) 55vw, 45vw"
                  />
                </div>
              </div>
            ))}
      </div>

      {photos.length > 1 && (
        <button
          onClick={() => scroll("left")}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 backdrop-blur-sm"
          aria-label="Foto anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}

      {photos.length > 1 && (
        <button
          onClick={() => scroll("right")}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 backdrop-blur-sm"
          aria-label="Próxima foto"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      {photos.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {photos.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                const el = scrollRef.current;
                if (!el) return;
                const child = el.children[i] as HTMLElement;
                child?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
              }}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === activeIndex
                  ? "w-6 bg-primary"
                  : "w-2 bg-border hover:bg-muted-foreground/40"
              }`}
              aria-label={`Ver foto ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}