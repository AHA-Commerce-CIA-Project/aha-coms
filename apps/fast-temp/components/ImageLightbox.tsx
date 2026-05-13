'use client';

import { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface ImageLightboxProps {
  /** Currently-displayed image URL. `null` closes the lightbox. */
  src: string | null;
  alt?: string;
  onClose: () => void;
  /**
   * Optional gallery the current `src` belongs to. When provided AND it
   * contains `src`, prev/next arrows + ←/→ keyboard nav cycle through it.
   * Single-image callers can omit this and the lightbox behaves as before.
   */
  images?: string[];
}

export function ImageLightbox({ src, alt = 'Preview', onClose, images }: ImageLightboxProps) {
  // Resolve gallery + starting index. We mirror src -> internal currentSrc so
  // the user can navigate without the parent re-rendering on every step.
  const gallery = (images && images.length > 0) ? images : (src ? [src] : []);
  const initialIndex = src ? Math.max(0, gallery.indexOf(src)) : 0;
  const [currentIdx, setCurrentIdx] = useState(initialIndex);

  // When the parent opens the lightbox with a different src (different
  // message/comment), reset the index. We key off the src+gallery identity.
  useEffect(() => {
    if (!src) return;
    const idx = gallery.indexOf(src);
    setCurrentIdx(idx >= 0 ? idx : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, images]);

  const total = gallery.length;
  const hasNav = total > 1;
  const currentSrc = total > 0 ? gallery[Math.min(currentIdx, total - 1)] : null;

  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (!hasNav) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentIdx((i) => (i + 1) % total);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentIdx((i) => (i - 1 + total) % total);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [src, onClose, hasNav, total]);

  if (!src || !currentSrc) return null;

  // Stop propagation on the backdrop so closing the lightbox doesn't bubble
  // up and close a parent modal (e.g. the Direct Assign form). Without this,
  // the synthetic click reaches the form's backdrop handler too.
  const handleBackdropClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  const goPrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIdx((i) => (i - 1 + total) % total);
  };
  const goNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIdx((i) => (i + 1) % total);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
      onClick={handleBackdropClick}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
        aria-label="Close preview"
      >
        <X className="w-5 h-5" />
      </button>

      {hasNav && (
        <>
          <button
            type="button"
            onClick={goPrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
            aria-label="Previous image"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={goNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
            aria-label="Next image"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/10 text-white text-xs font-medium"
            onClick={(e) => e.stopPropagation()}
          >
            {currentIdx + 1} / {total}
          </div>
        </>
      )}

      <img
        src={currentSrc}
        alt={alt}
        className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
