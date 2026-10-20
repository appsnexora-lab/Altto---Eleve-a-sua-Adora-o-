'use client';

import React, { useEffect, useState } from 'react';
import type { PDFPageProxy } from 'pdfjs-dist';

interface PdfTextLayerProps {
  page: PDFPageProxy | null;
  scale: number;
  width: number;
  height: number;
}

export const PdfTextLayer: React.FC<PdfTextLayerProps> = ({ page, scale, width, height: _height }) => {
  const [textItems, setTextItems] = useState<{ str: string; left: number; top: number; width: number; height: number }[]>([]);

  useEffect(() => {
    if (!page) return;
    let isCancelled = false;

    async function loadText() {
      try {
        const textContent = await page!.getTextContent();
        if (isCancelled) return;

        const unscaledViewport = page!.getViewport({ scale: 1 });
        const actualScale = width > 0 ? width / unscaledViewport.width : scale;
        const viewport = page!.getViewport({ scale: actualScale });

        const items: any[] = [];
        for (const item of textContent.items as any[]) {
          if (!item.str || !item.transform) continue;
          // Compute transformed position
          const tx = item.transform;
          // [a, b, c, d, e, f]
          const x = tx[4] * (viewport.width / unscaledViewport.width);
          const y = (unscaledViewport.height - tx[5]) * (viewport.height / unscaledViewport.height);
          items.push({
            str: item.str,
            left: Math.max(0, x),
            top: Math.max(0, y - (item.height || 12) * actualScale),
            width: (item.width || 20) * actualScale,
            height: (item.height || 12) * actualScale,
          });
        }
        setTextItems(items);
      } catch (e) {
        // Text layer is optional for pure scanned documents
      }
    }
    loadText();
    return () => {
      isCancelled = true;
    };
  }, [page, scale, width]);

  if (textItems.length === 0) return null;

  return (
    <div
      className="absolute inset-0 select-text pointer-events-auto overflow-hidden text-transparent"
      style={{ width: `${width}px`, height: `${_height}px` }}
    >
      {textItems.map((item, idx) => (
        <span
          key={idx}
          className="absolute select-text cursor-text leading-none opacity-0 selection:bg-amber-500/40 selection:text-slate-900"
          style={{
            left: `${item.left}px`,
            top: `${item.top}px`,
            fontSize: `${Math.max(10, item.height)}px`,
            whiteSpace: 'pre',
          }}
        >
          {item.str}
        </span>
      ))}
    </div>
  );
};
