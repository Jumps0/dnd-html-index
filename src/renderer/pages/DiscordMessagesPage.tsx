import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'react-router-dom';
import type {
  DiscordChannel,
  DiscordMessageResult,
  DiscordSearchResponse,
} from '../../main/preload';
import './DiscordMessagesPage.css';

import discordLogoImage from '../../../assets/icons/discord-server-logo-icon.png';

export default function DiscordMessagesPage() {
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [authors, setAuthors] = useState<string[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [channelHtml, setChannelHtml] = useState('');
  const [query, setQuery] = useState('');
  const [authorFilters, setAuthorFilters] = useState<string[]>([]);
  const [channelFilters, setChannelFilters] = useState<string[]>([]);
  const [afterDate, setAfterDate] = useState('');
  const [beforeDate, setBeforeDate] = useState('');
  const [searchResponse, setSearchResponse] = useState<DiscordSearchResponse>({ results: [], total: 0 });
  const [indexing, setIndexing] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [messageToReveal, setMessageToReveal] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const searchRequestId = useRef(0);

  useEffect(() => {
    document.title = 'Discord Server Logs';
    let active = true;
    window.electron.discord.getIndex()
      .then((index) => {
        if (!active) return;
        setChannels(index.channels);
        setAuthors(index.authors);
        setSelectedChannelId(index.channels[0]?.id || '');
        setIndexing(false);
      })
      .catch(() => {
        if (!active) return;
        setError('Could not read the Discord export folder.');
        setIndexing(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedChannelId) return undefined;
    let active = true;
    setChannelHtml('');
    window.electron.discord.getChannel(selectedChannelId)
      .then((html) => {
        if (active) setChannelHtml(html);
      })
      .catch(() => {
        if (active) setError('Could not open this channel export.');
      });

    return () => {
      active = false;
    };
  }, [selectedChannelId]);

  const searchActive = Boolean(
    query.trim() || authorFilters.length || channelFilters.length || afterDate || beforeDate,
  );

  useEffect(() => {
    const requestId = ++searchRequestId.current;
    if (!searchActive || indexing) {
      setSearching(false);
      return undefined;
    }

    setSearching(true);
    const timer = window.setTimeout(() => {
      const after = afterDate ? new Date(`${afterDate}T00:00:00Z`).getTime() : null;
      const before = beforeDate ? new Date(`${beforeDate}T23:59:59.999Z`).getTime() : null;
      window.electron.discord.search({
        query,
        authors: authorFilters,
        channelIds: channelFilters,
        after: after !== null && Number.isFinite(after) ? after : null,
        before: before !== null && Number.isFinite(before) ? before : null,
        limit: 75,
      }).then((response) => {
        if (requestId === searchRequestId.current) {
          setSearchResponse(response);
          setSearching(false);
        }
      }).catch(() => {
        if (requestId === searchRequestId.current) {
          setError('Search could not be completed.');
          setSearching(false);
        }
      });
    }, 180);

    return () => {
      window.clearTimeout(timer);
      if (requestId === searchRequestId.current) searchRequestId.current += 1;
    };
  }, [afterDate, authorFilters, beforeDate, channelFilters, indexing, query, searchActive]);

  const channelGroups = useMemo(() => {
    return channels.reduce<Record<string, DiscordChannel[]>>((groups, channel) => {
      (groups[channel.category] ||= []).push(channel);
      return groups;
    }, {});
  }, [channels]);

  const selectedChannel = channels.find(({ id }) => id === selectedChannelId);

  const selectValues = (event: React.ChangeEvent<HTMLSelectElement>) =>
    Array.from(event.currentTarget.selectedOptions, (option) => option.value);

  const openResult = (message: DiscordMessageResult) => {
    setMessageToReveal(message.id);
    setSelectedChannelId(message.channelId);
    setQuery('');
    setAuthorFilters([]);
    setChannelFilters([]);
    setAfterDate('');
    setBeforeDate('');
  };

  const clearSearchFilters = () => {
    setQuery('');
    setAuthorFilters([]);
    setChannelFilters([]);
    setAfterDate('');
    setBeforeDate('');
  };

  const revealMessage = () => {
    if (!messageToReveal || !iframeRef.current?.contentDocument) return;
    const element = iframeRef.current.contentDocument.getElementById(
      `chatlog__message-container-${messageToReveal}`,
    );
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element?.classList.add('chatlog__message-container--highlighted');
    window.setTimeout(() => element?.classList.remove('chatlog__message-container--highlighted'), 2200);
    setMessageToReveal('');
  };

  return (
    <main className="subpage discord-messages-page">
      <aside className="discord-sidebar">
        <div className="discord-sidebar-heading">
          <img src={discordLogoImage} width="35" height="35" className='discord-brand-mark'></img>
          <div className="discord-brand-title">Discord Server Logs</div>
        </div>
        <label className="discord-search-box">
          <span className="discord-search-icon" aria-hidden="true">⌕</span>
          <input
            aria-label="Search Discord messages"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search messages"
          />
          {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>×</button>}
        </label>
        <div className="discord-channel-heading">
          <span>CHANNELS</span>
          <span className="discord-channel-count">{channels.length}</span>
        </div>
        <nav className="discord-channel-list" aria-label="Discord channels">
          {Object.entries(channelGroups).map(([category, items]) => (
            <section className="discord-channel-category" key={category}>
              <h2>{category}</h2>
              {items.map((channel) => (
                <button
                  className={`discord-channel-button${selectedChannelId === channel.id ? ' is-active' : ''}`}
                  key={channel.id}
                  onClick={() => {
                    setSelectedChannelId(channel.id);
                    setMessageToReveal('');
                    clearSearchFilters();
                  }}
                  type="button"
                  title={`${channel.name} · ${channel.messageCount.toLocaleString()} messages`}
                >
                  <span className="discord-hash" aria-hidden="true">#</span>
                  <span className="discord-channel-name">{channel.name}</span>
                  <span className="discord-channel-message-count">{channel.messageCount.toLocaleString()}</span>
                </button>
              ))}
            </section>
          ))}
          {indexing && <p className="discord-muted discord-sidebar-status">Preparing local message index…</p>}
          {!indexing && !channels.length && <p className="discord-muted discord-sidebar-status">No channel exports found.</p>}
        </nav>
        <div className="discord-sidebar-footer">
          <span className="discord-status-dot" />
          <span>{indexing ? 'Building search index' : `${authors.length} members indexed`}</span>
        </div>
      </aside>

      <section className="discord-main-panel">
        <header className="discord-channel-header">
          <span className="discord-header-hash" aria-hidden="true">#</span>
          <div className="discord-header-channel">
            <strong>{searchActive ? 'Search results' : selectedChannel?.name || 'Loading channels'}</strong>
            <span>{searchActive ? 'Across server logs' : selectedChannel?.category || 'The Broken Islands'}</span>
          </div>
          <div className="discord-header-count">
            {searchActive
              ? `${searchResponse.total.toLocaleString()} match${searchResponse.total === 1 ? '' : 'es'}`
              : `${selectedChannel?.messageCount.toLocaleString() || '—'} messages`}
          </div>
        </header>

        {error && <div className="discord-error" role="alert">{error}</div>}

        {searchActive ? (
          <div className="discord-results" aria-live="polite">
            {searching ? (
              <div className="discord-empty-state">Searching indexed messages…</div>
            ) : searchResponse.results.length ? (
              <>
                <div className="discord-results-caption">
                  Showing {searchResponse.results.length} of {searchResponse.total.toLocaleString()} matches
                </div>
                {searchResponse.results.map((message) => (
                  <button className="discord-result" key={`${message.channelId}-${message.id}`} onClick={() => openResult(message)} type="button">
                    <span className="discord-result-avatar" aria-hidden="true">{message.author.charAt(0).toUpperCase()}</span>
                    <span className="discord-result-body">
                      <span className="discord-result-meta">
                        <strong>{message.author}</strong>
                        <span>in #{message.channelName}</span>
                        <time>{message.timestamp ? `${new Date(message.timestamp).toLocaleString(undefined, { timeZone: 'UTC' })} UTC` : 'Time unavailable'}</time>
                      </span>
                      <span className="discord-result-content">{message.content || 'Attachment or embed'}</span>
                    </span>
                    <span className="discord-result-arrow" aria-hidden="true">↗</span>
                  </button>
                ))}
              </>
            ) : (
              <div className="discord-empty-state">
                <span className="discord-empty-symbol" aria-hidden="true">⌕</span>
                <strong>No messages found</strong>
                <span>Try a different phrase or loosen a filter.</span>
              </div>
            )}
          </div>
        ) : channelHtml ? (
          <iframe
            className="discord-log-frame"
            ref={iframeRef}
            onLoad={revealMessage}
            sandbox="allow-same-origin"
            title={`${selectedChannel?.name || 'Discord'} message history`}
            srcDoc={channelHtml}
          />
        ) : (
          <div className="discord-empty-state">{indexing ? 'Loading server logs…' : 'Select a channel to view its messages.'}</div>
        )}
      </section>

      <aside className="discord-filter-panel" aria-label="Search filters">
        <div className="discord-filter-heading">
          <span className="discord-filter-icon" aria-hidden="true">≡</span>
          <strong>Search filters</strong>
        </div>
        <label className="discord-filter-label" htmlFor="discord-author-filter">FROM USERS</label>
        <select
          id="discord-author-filter"
          className="discord-filter-select"
          multiple
          size={Math.min(6, Math.max(3, authors.length))}
          value={authorFilters}
          onChange={(event) => setAuthorFilters(selectValues(event))}
          disabled={!authors.length}
        >
          {authors.map((author) => <option key={author} value={author}>{author}</option>)}
        </select>
        <label className="discord-filter-label" htmlFor="discord-channel-filter">IN CHANNELS</label>
        <select
          id="discord-channel-filter"
          className="discord-filter-select discord-filter-channel-select"
          multiple
          size={7}
          value={channelFilters}
          onChange={(event) => setChannelFilters(selectValues(event))}
          disabled={!channels.length}
        >
          {channels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
        </select>
        <div className="discord-filter-label discord-date-heading">DURING</div>
        <label className="discord-date-label" htmlFor="discord-after-date">After</label>
        <input id="discord-after-date" className="discord-date-input" type="date" value={afterDate} onChange={(event) => setAfterDate(event.target.value)} />
        <label className="discord-date-label" htmlFor="discord-before-date">Before</label>
        <input id="discord-before-date" className="discord-date-input" type="date" value={beforeDate} onChange={(event) => setBeforeDate(event.target.value)} />
        {searchActive && (
          <button className="discord-clear-filters" type="button" onClick={clearSearchFilters}>
            Clear search & filters
          </button>
        )}
      </aside>
    </main>
  );
}
