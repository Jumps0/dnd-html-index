import { useEffect, useMemo, useRef, useState } from 'react';
import { findText, PptxHandler } from 'pptx-viewer-core';
import { SvgExporter } from 'pptx-viewer-core/converter';
import returnIcon from '../../../assets/icons/return.png';
import { recapFiles } from './recapFiles.mjs';
import './RecapsPage.css';

type RecapFile = (typeof recapFiles)[number];

type PresentationData = Awaited<ReturnType<PptxHandler['load']>>;
type SearchMatch = ReturnType<typeof findText>[number];

async function blobUrlToDataUrl(blobUrl: string): Promise<string> {
  const response = await fetch(blobUrl);
  if (!response.ok) throw new Error('Unable to decode an embedded slide image.');
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Unable to decode an embedded slide image.'));
    };
    reader.onerror = () => reject(new Error('Unable to decode an embedded slide image.'));
    reader.readAsDataURL(blob);
  });
}

async function resolveBlobImageUrls(
  elements: PresentationData['slides'][number]['elements'],
): Promise<void> {
  await Promise.all(
    elements.map(async (element) => {
      if (element.type === 'image' || element.type === 'picture') {
        if (element.imageData?.startsWith('blob:')) {
          element.imageData = await blobUrlToDataUrl(element.imageData);
        }
        if (element.svgData?.startsWith('blob:')) {
          element.svgData = await blobUrlToDataUrl(element.svgData);
        }
      }
      if (element.type === 'group') {
        await resolveBlobImageUrls(element.children);
      }
    }),
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function RecapsPage() {
  const [selectedFile, setSelectedFile] = useState<RecapFile | null>(null);
  const [presentation, setPresentation] = useState<PresentationData | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [query, setQuery] = useState('');
  const [listQuery, setListQuery] = useState('');
  const [listCounts, setListCounts] = useState<Record<string, number>>({});
  const [listSearchProgress, setListSearchProgress] = useState(0);
  const [listSearchInProgress, setListSearchInProgress] = useState(false);
  const [listSearchError, setListSearchError] = useState<string | null>(null);
  const [currentMatch, setCurrentMatch] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const slideContainer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = selectedFile ? `${selectedFile.name} - Recaps` : 'Recaps';
  }, [selectedFile]);

  useEffect(() => {
    const searchTerm = listQuery.trim();
    if (selectedFile || !searchTerm) {
      setListCounts({});
      setListSearchProgress(0);
      setListSearchInProgress(false);
      setListSearchError(null);
      return undefined;
    }

    let cancelled = false;
    setListCounts({});
    setListSearchProgress(0);
    setListSearchInProgress(true);
    setListSearchError(null);

    const timer = window.setTimeout(() => {
      void (async () => {
        let failedCount = 0;

        for (let index = 0; index < recapFiles.length; index += 1) {
          if (cancelled) return;

          const file = recapFiles[index];
          const handler = new PptxHandler();
          try {
            const response = await fetch(file.url);
            if (!response.ok) throw new Error(`Unable to read ${file.name}`);
            const data = await handler.load(await response.arrayBuffer());
            if (cancelled) return;

            const count = findText(
              data.slides,
              new RegExp(escapeRegExp(searchTerm), 'gi'),
            ).length;
            setListCounts((current) => ({ ...current, [file.url]: count }));
          } catch {
            if (cancelled) return;
            failedCount += 1;
          } finally {
            handler.dispose();
          }

          if (cancelled) return;
          setListSearchProgress(index + 1);
        }

        setListSearchError(
          failedCount
            ? `Could not search ${failedCount} presentation${failedCount === 1 ? '' : 's'}.`
            : null,
        );
        setListSearchInProgress(false);
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [listQuery, selectedFile]);

  useEffect(() => {
    if (!selectedFile) {
      setPresentation(null);
      setCurrentSlide(0);
      setQuery('');
      setCurrentMatch(0);
      setError(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    const handler = new PptxHandler();
    setLoading(true);
    setError(null);
    setPresentation(null);

    void fetch(selectedFile.url)
      .then((response) => {
        if (!response.ok) throw new Error(`Unable to read ${selectedFile.name}`);
        return response.arrayBuffer();
      })
      .then((buffer) => handler.load(buffer, { eagerDecodeImages: true }))
      .then(async (data) => {
        await Promise.all(data.slides.map((slide) => resolveBlobImageUrls(slide.elements)));
        if (!cancelled) {
          setPresentation(data);
          setCurrentSlide(0);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Unable to open this presentation.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      handler.dispose();
    };
  }, [selectedFile]);

  const matches = useMemo(() => {
    if (!presentation || !query.trim()) return [];
    return findText(presentation.slides, new RegExp(escapeRegExp(query.trim()), 'gi'));
  }, [presentation, query]);

  const activeMatch: SearchMatch | undefined = matches[currentMatch];
  const slideIndex = activeMatch?.slideIndex ?? currentSlide;
  const activeSlideMatchIndex = activeMatch
    ? matches.slice(0, currentMatch).filter((match) => match.slideIndex === slideIndex).length
    : -1;
  const slideSvg = useMemo(() => {
    if (!presentation || !presentation.slides[slideIndex]) return null;
    return SvgExporter.exportSlide(
      presentation.slides[slideIndex],
      presentation.width,
      presentation.height,
    );
  }, [presentation, slideIndex]);

  const highlightedSlideSvg = useMemo(() => {
    const slide = presentation?.slides[slideIndex];
    if (!slide || !slideSvg) return null;

    const highlightedRuns: Array<{ text: string; color: string }> = [];
    const collectRuns = (elements: typeof slide.elements) => {
      for (const element of elements) {
        if ('textSegments' in element) {
          for (const segment of element.textSegments ?? []) {
            if (segment.style.highlightColor) {
              highlightedRuns.push({ text: segment.text, color: segment.style.highlightColor });
            }
          }
        }
        if (element.type === 'group') collectRuns(element.children);
      }
    };
    collectRuns(slide.elements);

    const document = new DOMParser().parseFromString(slideSvg, 'image/svg+xml');
    const tspans = Array.from(document.querySelectorAll<SVGGraphicsElement>('tspan'));
    let cursor = 0;
    const normalizeText = (text: string) => text.replace(/\s+/g, '');

    for (const run of highlightedRuns) {
      const target = normalizeText(run.text);
      if (!target) continue;

      for (let start = cursor; start < tspans.length; start += 1) {
        let combined = '';
        for (let end = start; end < tspans.length; end += 1) {
          combined += normalizeText(tspans[end].textContent ?? '');
          if (combined === target) {
            for (let index = start; index <= end; index += 1) {
              tspans[index].setAttribute('data-highlight-color', run.color);
            }
            cursor = end + 1;
            break;
          }
          if (combined.length >= target.length) break;
        }
        if (cursor > start) break;
      }
    }

    return new XMLSerializer().serializeToString(document.documentElement);
  }, [presentation, slideIndex, slideSvg]);

  useEffect(() => {
    const svg = slideContainer.current?.querySelector('svg');
    if (!svg) return;

    const namespace = 'http://www.w3.org/2000/svg';
    svg.querySelectorAll('tspan[data-highlight-color]').forEach((tspan) => {
      const bounds = (tspan as SVGGraphicsElement).getBBox();
      if (!bounds.width || !bounds.height) return;

      const padding = bounds.height * 0.08;
      const highlight = document.createElementNS(namespace, 'rect');
      highlight.setAttribute('x', String(bounds.x - padding));
      highlight.setAttribute('y', String(bounds.y - padding));
      highlight.setAttribute('width', String(bounds.width + padding * 2));
      highlight.setAttribute('height', String(bounds.height + padding * 2));
      highlight.setAttribute('rx', String(Math.min(2, padding)));
      highlight.setAttribute('fill', tspan.getAttribute('data-highlight-color') ?? '#FFFF00');
      const textElement = tspan.closest('text');
      textElement?.parentNode?.insertBefore(highlight, textElement);
    });
  }, [highlightedSlideSvg]);

  useEffect(() => {
    const svg = slideContainer.current?.querySelector('svg');
    if (!svg) return;

    svg.querySelectorAll('[data-search-highlight]').forEach((highlight) => highlight.remove());
    const searchTerm = query.trim();
    if (!searchTerm) return;

    const namespace = 'http://www.w3.org/2000/svg';
    const searchPattern = new RegExp(escapeRegExp(searchTerm), 'gi');
    let slideMatchIndex = 0;
    svg.querySelectorAll<SVGTextContentElement>('text').forEach((textElement) => {
      const text = textElement.textContent ?? '';
      let match: RegExpExecArray | null;

      while ((match = searchPattern.exec(text)) !== null) {
        const isActiveMatch = slideMatchIndex === activeSlideMatchIndex;
        slideMatchIndex += 1;
        const start = Array.from(text.slice(0, match.index)).length;
        const length = Array.from(match[0]).length;
        let left = Number.POSITIVE_INFINITY;
        let top = Number.POSITIVE_INFINITY;
        let right = Number.NEGATIVE_INFINITY;
        let bottom = Number.NEGATIVE_INFINITY;

        for (let index = start; index < start + length; index += 1) {
          const bounds = textElement.getExtentOfChar(index);
          if (!bounds.width && !bounds.height) continue;
          left = Math.min(left, bounds.x);
          top = Math.min(top, bounds.y);
          right = Math.max(right, bounds.x + bounds.width);
          bottom = Math.max(bottom, bounds.y + bounds.height);
        }

        if (!Number.isFinite(left) || right <= left || bottom <= top) continue;

        const padding = (bottom - top) * 0.08;
        const highlight = document.createElementNS(namespace, 'rect');
        highlight.setAttribute('x', String(left - padding));
        highlight.setAttribute('y', String(top - padding));
        highlight.setAttribute('width', String(right - left + padding * 2));
        highlight.setAttribute('height', String(bottom - top + padding * 2));
        highlight.setAttribute('rx', String(Math.min(2, padding)));
        highlight.setAttribute('fill', isActiveMatch ? '#4DAAFF' : '#168BFF');
        highlight.setAttribute('fill-opacity', isActiveMatch ? '0.4' : '0.35');
        highlight.setAttribute('data-search-highlight', 'true');
        textElement.parentNode?.insertBefore(highlight, textElement);
      }
    });
  }, [activeSlideMatchIndex, highlightedSlideSvg, query]);

  useEffect(() => {
    const handleFindShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchInput.current?.focus();
        searchInput.current?.select();
      }
    };

    window.addEventListener('keydown', handleFindShortcut);
    return () => window.removeEventListener('keydown', handleFindShortcut);
  }, []);

  const navigateMatch = (direction: number) => {
    if (matches.length === 0) return;
    setCurrentMatch((index) => (index + direction + matches.length) % matches.length);
  };

  const navigateSlide = (direction: number) => {
    if (!presentation) return;
    setCurrentSlide((index) =>
      Math.min(presentation.slides.length - 1, Math.max(0, index + direction)),
    );
    setQuery('');
    setCurrentMatch(0);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      navigateMatch(event.shiftKey ? -1 : 1);
    } else if (event.key === 'Escape') {
      setQuery('');
      setCurrentMatch(0);
    }
  };

  const visibleRecapFiles = listQuery.trim()
    ? recapFiles.filter((file) => (listCounts[file.url] ?? 0) > 0)
    : recapFiles;
  const listResultCount = Object.values(listCounts).reduce((total, count) => total + count, 0);

  if (!selectedFile) {
    return (
      <main className="subpage recaps-page">
        <h1 className="subpage-title">Recaps</h1>
        <div className={`recap-library-search${listQuery ? ' has-query' : ''}`} role="search">
          {listSearchInProgress && (
            <div
              aria-label="Presentation search progress"
              aria-valuemax={recapFiles.length || 1}
              aria-valuenow={listSearchProgress}
              className="recap-library-progress"
              role="progressbar"
            >
              <span
                style={{
                  width: `${recapFiles.length ? (listSearchProgress / recapFiles.length) * 100 : 100}%`,
                }}
              />
            </div>
          )}
          <input
            aria-label="Search all presentations"
            autoComplete="off"
            onChange={(event) => {
              setListCounts({});
              setListSearchProgress(0);
              setListQuery(event.target.value);
            }}
            placeholder="Search all presentations"
            type="search"
            value={listQuery}
          />
          <span aria-live="polite" className="recap-library-result-total">
            {listResultCount} {listQuery.trim() && listSearchInProgress ? 'found' : 'results'}
          </span>
          {listQuery && (
            <button
              aria-label="Clear search"
              className="recap-library-clear"
              onClick={() => {
                setListCounts({});
                setListSearchProgress(0);
                setListQuery('');
              }}
              type="button"
            >
              ×
            </button>
          )}
        </div>
        {listSearchError && <p className="recap-library-search-error" role="status">{listSearchError}</p>}
        <div className="recap-list" aria-label="PowerPoint recaps">
          {visibleRecapFiles.map((file) => (
            <button
              className="main-button recap-file-button"
              key={file.url}
              onClick={() => setSelectedFile(file)}
              type="button"
            >
              {file.name.replace(/\.pptx$/i, '')}
              {listQuery.trim() && (
                <span
                  aria-label={`${listCounts[file.url]} matches`}
                  className="recap-result-count"
                  title={`${listCounts[file.url]} matches`}
                >
                  {listCounts[file.url]}
                </span>
              )}
            </button>
          ))}
          {recapFiles.length === 0 && <p>No PowerPoint files were found in assets/slides.</p>}
          {listQuery.trim() && !listSearchInProgress && visibleRecapFiles.length === 0 && recapFiles.length > 0 && (
            <p>No presentations matched that search.</p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="subpage recaps-page recap-viewer">
      <header className="recap-viewer-header">
        <button
          aria-label="Back to recaps list"
          className="recap-back-button"
          onClick={() => setSelectedFile(null)}
          title="Back to recaps list"
          type="button"
        >
          <img alt="" src={returnIcon} />
        </button>
        <h1 className="recap-deck-title">{selectedFile.name.replace(/\.pptx$/i, '')}</h1>
        <span className="recap-slide-count">
          {presentation ? `${slideIndex + 1} / ${presentation.slides.length}` : ''}
        </span>
      </header>

      <div className={`recap-search${query ? ' has-query' : ''}`} role="search">
        <input
          aria-label="Find text in presentation"
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
            setCurrentMatch(0);
          }}
          onKeyDown={handleSearchKeyDown}
          placeholder="Find in presentation"
          ref={searchInput}
          type="search"
          value={query}
        />
        <span aria-live="polite" className="recap-match-count">
          {query ? (matches.length ? `${currentMatch + 1} of ${matches.length}` : 'No results') : ''}
        </span>
        <button
          aria-label="Previous match"
          disabled={!matches.length}
          onClick={() => navigateMatch(-1)}
          title="Previous match (Shift+Enter)"
          type="button"
        >
          &#8249;
        </button>
        <button
          aria-label="Next match"
          disabled={!matches.length}
          onClick={() => navigateMatch(1)}
          title="Next match (Enter)"
          type="button"
        >
          &#8250;
        </button>
        {query && (
          <button
            aria-label="Clear presentation search"
            className="recap-search-clear"
            onClick={() => {
              setQuery('');
              setCurrentMatch(0);
            }}
            title="Clear search"
            type="button"
          >
            ×
          </button>
        )}
      </div>

      {activeMatch && (
        <p className="recap-match-location" aria-live="polite">
          Slide {activeMatch.slideIndex + 1}: “{activeMatch.text}”
        </p>
      )}

      <section className="recap-slide-area" aria-label="Presentation slide">
        {loading && <p>Loading presentation...</p>}
        {error && <p className="recap-error" role="alert">{error}</p>}
        {highlightedSlideSvg && (
          <div
            aria-label={`Slide ${slideIndex + 1}`}
            className="recap-slide-svg"
            ref={slideContainer}
            role="img"
            dangerouslySetInnerHTML={{ __html: highlightedSlideSvg }}
          />
        )}
      </section>

      {presentation && (
        <nav className="recap-slide-navigation" aria-label="Slide navigation">
          <button
            disabled={slideIndex === 0}
            onClick={() => navigateSlide(-1)}
            type="button"
          >
            Previous slide
          </button>
          <span>Slide {slideIndex + 1} of {presentation.slides.length}</span>
          <button
            disabled={slideIndex >= presentation.slides.length - 1}
            onClick={() => navigateSlide(1)}
            type="button"
          >
            Next slide
          </button>
        </nav>
      )}
    </main>
  );
}
