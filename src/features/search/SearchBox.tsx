import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock, Hash, Search } from 'lucide-react';
import Avatar from '../../components/ui/Avatar';
import VerifiedBadge from '../../components/VerifiedBadge';
import { addRecentSearch, clearRecentSearches, getRecentSearches, searchPeople, searchTopics } from './api';

type Option =
  | { kind: 'query'; label: string }
  | { kind: 'recent'; label: string }
  | { kind: 'topic'; tag: string; count: number }
  | { kind: 'person'; id: string; name: string; username: string; photo: string; verified: boolean };

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Search field with suggestions: recent searches when empty, then matching topics and people. */
export default function SearchBox({ autoFocus = false }: { autoFocus?: boolean }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const listId = useId();
  const rootRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(searchParams.get('search') ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => setValue(searchParams.get('search') ?? ''), [searchParams]);

  const term = useDebounced(value.trim(), 200);
  const enabled = open && term.length >= 2;
  const { data: people = [] } = useQuery({
    queryKey: ['search-people', term.toLowerCase()],
    queryFn: () => searchPeople(term, 4),
    enabled,
    staleTime: 60_000,
  });
  const { data: topics = [] } = useQuery({
    queryKey: ['search-topics', term.toLowerCase()],
    queryFn: () => searchTopics(term, 3),
    enabled,
    staleTime: 60_000,
  });

  const typed = value.trim();
  const options: Option[] = typed
    ? [
        { kind: 'query', label: typed },
        ...(enabled ? topics.map(t => ({ kind: 'topic' as const, tag: t.tag, count: t.count })) : []),
        ...(enabled ? people.map(p => ({ kind: 'person' as const, id: p.id, name: p.displayName, username: p.username, photo: p.photo, verified: p.verified })) : []),
      ]
    : recent.map(label => ({ kind: 'recent' as const, label }));

  useEffect(() => setActive(-1), [typed, open]);

  // Close when clicking anywhere outside the box.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const choose = (option: Option) => {
    setOpen(false);
    inputRef.current?.blur();
    switch (option.kind) {
      case 'query':
      case 'recent':
        addRecentSearch(option.label);
        setValue(option.label);
        navigate(`/feed?search=${encodeURIComponent(option.label)}`);
        break;
      case 'topic':
        navigate(`/feed?hashtag=${encodeURIComponent(option.tag)}`);
        break;
      case 'person':
        navigate(`/creators/${option.id}`);
        break;
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!options.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(i => (i + 1) % options.length); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i <= 0 ? options.length - 1 : i - 1)); }
  };

  const showList = open && options.length > 0;

  return (
    <form
      ref={rootRef}
      role="search"
      onSubmit={e => {
        e.preventDefault();
        if (active >= 0 && options[active]) return choose(options[active]);
        if (typed) choose({ kind: 'query', label: typed });
        else navigate('/feed');
      }}
      className="relative"
    >
      <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40 pointer-events-none" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={e => { setValue(e.target.value); setOpen(true); }}
        onFocus={() => { setRecent(getRecentSearches()); setOpen(true); }}
        onKeyDown={onKeyDown}
        placeholder="Search posts, people, topics"
        aria-label="Search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className="w-full pl-10 pr-4 py-2.5 rounded-full bg-black/5 dark:bg-white/6 border border-transparent text-sm outline-none focus:border-primary focus:bg-transparent transition-colors [&::-webkit-search-cancel-button]:hidden"
      />

      {showList && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full mt-2 z-50 py-1.5 rounded-2xl bg-background border border-black/10 dark:border-white/10 shadow-xl overflow-hidden"
        >
          {!typed && (
            <div className="flex items-center justify-between px-4 pt-1 pb-1.5">
              <span className="text-xs font-semibold text-black/50 dark:text-white/50">Recent</span>
              <button
                type="button"
                onClick={() => { clearRecentSearches(); setRecent([]); }}
                className="text-xs text-primary hover:underline"
              >
                Clear
              </button>
            </div>
          )}
          {options.map((option, i) => (
            <button
              key={`${option.kind}-${'id' in option ? option.id : 'tag' in option ? option.tag : option.label}`}
              id={`${listId}-${i}`}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(option)}
              className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${i === active ? 'bg-black/5 dark:bg-white/8' : ''}`}
            >
              <OptionRow option={option} />
            </button>
          ))}
        </div>
      )}
    </form>
  );
}

function OptionRow({ option }: { option: Option }) {
  const icon = 'w-8 h-8 shrink-0 rounded-full bg-black/5 dark:bg-white/8 flex items-center justify-center text-black/50 dark:text-white/50';
  switch (option.kind) {
    case 'query':
      return (<><span className={icon}><Search size={15} /></span><span className="truncate">Search for “<span className="font-semibold">{option.label}</span>”</span></>);
    case 'recent':
      return (<><span className={icon}><Clock size={15} /></span><span className="truncate">{option.label}</span></>);
    case 'topic':
      return (
        <>
          <span className={icon}><Hash size={15} /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium truncate">#{option.tag}</span>
            <span className="block text-xs text-black/50 dark:text-white/50">{option.count} {option.count === 1 ? 'post' : 'posts'}</span>
          </span>
        </>
      );
    case 'person':
      return (
        <>
          <Avatar src={option.photo} seed={option.id} size={32} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 font-medium truncate">{option.name}<VerifiedBadge verified={option.verified} /></span>
            {option.username && <span className="block text-xs text-black/50 dark:text-white/50 truncate">@{option.username}</span>}
          </span>
        </>
      );
  }
}
