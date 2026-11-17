import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, ChevronDown, Compass, Lightbulb, Search, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { useAuthStore } from '../../store/authStore';
import { sidebarApi } from '../../services/http/sidebarApi';
import { useTourStore } from '../../store/useTourStore';
import { basePath } from '../settings/settingsMenu';
import { ARTICLES, CATEGORIES, audiencesFor, bodyFor, type CategoryId, type HelpArticle } from './helpContent';

const FEEDBACK_KEY = 'tm-help-feedback';
type Vote = 'yes' | 'no';

/** "Was this helpful?" answers are only remembered in this browser; nothing is sent anywhere. */
const readVotes = (): Record<string, Vote> => {
  try {
    return JSON.parse(localStorage.getItem(FEEDBACK_KEY) ?? '{}') as Record<string, Vote>;
  } catch {
    return {};
  }
};
const writeVotes = (votes: Record<string, Vote>) => {
  try {
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(votes));
  } catch {
    /* private window: the thanks still shows */
  }
};

const norm = (s: string) => s.toLowerCase();

/** One article as a searchable string. */
const haystackOf = (a: HelpArticle, body: ReturnType<typeof bodyFor>, categoryLabel: string) =>
  norm([body.q, body.text ?? '', ...(body.steps ?? []), body.note ?? '', a.keywords ?? '', categoryLabel].join(' '));

/** The help centre: search, categories, accordion answers with "Take me there" and related questions. What is shown depends on the role. */
export const HelpCenter: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const role = user?.role;
  const prefix = basePath(role);

  // Heads (of any subfolder) see the employee answers plus the head ones.
  const [isHead, setIsHead] = useState(false);
  useEffect(() => {
    if (role !== 'employee') return;
    let live = true;
    sidebarApi
      .tree()
      .then((t) => live && setIsHead(t.projects.some((p) => p.subfolders.some((s) => s.is_head))))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [role]);

  const audiences = useMemo(() => audiencesFor(role, isHead), [role, isHead]);
  const categoryLabel = useMemo(() => new Map(CATEGORIES.map((c) => [c.id, c.label])), []);

  /** The articles this person may read, worded for their role. */
  const mine = useMemo(
    () =>
      ARTICLES.filter((a) => a.for.some((x) => audiences.includes(x))).map((a) => {
        const body = bodyFor(a, role);
        return { article: a, body, hay: haystackOf(a, body, categoryLabel.get(a.category) ?? '') };
      }),
    [audiences, role, categoryLabel]
  );
  const byId = useMemo(() => new Map(mine.map((m) => [m.article.id, m])), [mine]);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | CategoryId>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [votes, setVotes] = useState<Record<string, Vote>>(readVotes);
  const openRef = useRef<HTMLLIElement | null>(null);

  // "Learn more" on an info icon arrives here with ?article=<id>: open that answer once.
  const [params] = useSearchParams();
  const wanted = params.get('article');
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (wanted && handled.current !== wanted && byId.has(wanted)) {
      handled.current = wanted;
      setQuery('');
      setCategory('all');
      setOpenId(wanted);
    }
  }, [wanted, byId]);

  const tokens = norm(query).split(/\s+/).filter(Boolean);
  const shown = useMemo(
    () => mine.filter((m) => (category === 'all' || m.article.category === category) && tokens.every((t) => m.hay.includes(t))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mine, category, query]
  );

  const categories = useMemo(
    () => CATEGORIES.filter((c) => (!c.only || c.only.some((x) => audiences.includes(x))) && mine.some((m) => m.article.category === c.id)),
    [audiences, mine]
  );
  const groups = categories.map((c) => ({ category: c, items: shown.filter((m) => m.article.category === c.id) })).filter((g) => g.items.length > 0);

  // An answer that was opened from "Related questions" scrolls into view once it is on screen.
  useEffect(() => {
    if (openId) openRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [openId]);

  const openRelated = useCallback((id: string) => {
    setQuery('');
    setCategory('all');
    setOpenId(id);
  }, []);

  const vote = (id: string, v: Vote) => {
    const next = { ...votes, [id]: v };
    setVotes(next);
    writeVotes(next);
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Help</CardTitle>
          <CardDescription>
            {role === 'admin'
              ? 'How to run things as an admin, step by step.'
              : role === 'client'
                ? 'How to use your portal, step by step.'
                : 'How things work, step by step. Not covered? Ask an admin.'}
          </CardDescription>
        </div>
        {(role === 'admin' || role === 'employee') && (
          <Button variant="outline" size="sm" onClick={() => useTourStore.getState().start()} leftIcon={<Compass className="h-4 w-4" />}>
            Replay the tour
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        <label className="flex h-11 items-center gap-2 rounded-full border border-[var(--tm-border)] bg-[var(--tm-card)] px-4 text-[var(--tm-ink-muted)] transition-[border-color,box-shadow] focus-within:border-[var(--tm-primary-light)] focus-within:shadow-glow">
          <Search className="h-4 w-4 shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the help, for example “timer” or “leave”"
            aria-label="Search the help"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] font-medium text-[var(--tm-ink)] outline-none placeholder:text-[var(--tm-ink-muted)]"
          />
        </label>

        <div className="-mx-1 flex flex-wrap gap-1.5" role="tablist" aria-label="Help topics">
          {[{ id: 'all' as const, label: 'All topics' }, ...categories.map((c) => ({ id: c.id, label: c.label }))].map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={category === c.id}
              onClick={() => setCategory(c.id)}
              className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                category === c.id ? 'bg-[var(--tm-ink)] text-[var(--tm-card)]' : 'bg-[var(--tm-card-muted)] text-[var(--tm-ink-soft)] hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <p className="text-[12px] font-semibold text-[var(--tm-ink-muted)]" aria-live="polite">
          {shown.length} {shown.length === 1 ? 'answer' : 'answers'}
          {tokens.length > 0 ? ` for “${query.trim()}”` : ''}
        </p>

        {groups.length === 0 ? (
          <div className="rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] p-5 text-center">
            <p className="text-[14px] font-bold text-[var(--tm-ink)]">Nothing matches that</p>
            <p className="mt-1 text-[13px] text-[var(--tm-ink-soft)]">Try fewer or different words, or pick All topics. Still stuck? Ask an admin.</p>
          </div>
        ) : (
          groups.map(({ category: c, items }) => (
            <section key={c.id} aria-label={c.label} className="space-y-2">
              <div>
                <h3 className="text-[13px] font-extrabold uppercase tracking-wider text-[var(--tm-ink-muted)]">{c.label}</h3>
                <p className="text-[12px] text-[var(--tm-ink-muted)]">{c.blurb}</p>
              </div>
              <ul className="space-y-2">
                {items.map(({ article, body }) => {
                  const open = openId === article.id;
                  const related = (article.related ?? []).map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
                  return (
                    <li
                      key={article.id}
                      ref={open ? openRef : undefined}
                      className={`rounded-[var(--tm-radius-md)] border transition-colors ${open ? 'border-[var(--tm-primary-light)] bg-[var(--tm-card)]' : 'border-[var(--tm-border)] bg-[var(--tm-card)]'}`}
                    >
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={`help-${article.id}`}
                        onClick={() => setOpenId(open ? null : article.id)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left"
                      >
                        <span className="flex-1 text-[14px] font-bold text-[var(--tm-ink)]">{body.q}</span>
                        <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--tm-ink-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
                      </button>

                      {open && (
                        <div id={`help-${article.id}`} role="region" aria-label={body.q} className="space-y-3 border-t border-[var(--tm-border)] px-4 pb-4 pt-3">
                          {body.text && <p className="text-[13.5px] leading-relaxed text-[var(--tm-ink-soft)]">{body.text}</p>}
                          {body.steps && body.steps.length > 0 && (
                            <ol className="space-y-1.5">
                              {body.steps.map((step, i) => (
                                <li key={step} className="flex gap-3 text-[13.5px] leading-relaxed text-[var(--tm-ink)]">
                                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--tm-primary-soft)] text-[11px] font-extrabold text-[var(--tm-primary-dark)]">
                                    {i + 1}
                                  </span>
                                  <span>{step}</span>
                                </li>
                              ))}
                            </ol>
                          )}
                          {body.note && (
                            <p className="flex gap-2 rounded-[var(--tm-radius-sm)] bg-[var(--tm-card-muted)] px-3 py-2 text-[12.5px] leading-relaxed text-[var(--tm-ink-soft)]">
                              <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--tm-primary-dark)]" />
                              <span>{body.note}</span>
                            </p>
                          )}

                          {body.goTo && (
                            <Button
                              size="sm"
                              title={body.goTo.label}
                              aria-label={body.goTo.label ? `Take me there: ${body.goTo.label}` : 'Take me there'}
                              onClick={() => navigate(body.goTo!.to({ prefix }))}
                              rightIcon={<ArrowRight className="h-4 w-4" />}
                            >
                              Take me there
                            </Button>
                          )}

                          {related.length > 0 && (
                            <div>
                              <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-[var(--tm-ink-muted)]">Related questions</p>
                              <ul className="flex flex-wrap gap-1.5">
                                {related.map((r) => (
                                  <li key={r.article.id}>
                                    <button
                                      type="button"
                                      onClick={() => openRelated(r.article.id)}
                                      className="rounded-full bg-[var(--tm-primary-soft)] px-3 py-1 text-left text-[12px] font-semibold text-[var(--tm-primary-dark)] transition-colors hover:brightness-95"
                                    >
                                      {r.body.q}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div className="flex items-center gap-2 border-t border-[var(--tm-border)] pt-3 text-[12.5px] text-[var(--tm-ink-muted)]">
                            {votes[article.id] ? (
                              <span role="status">Thanks for letting us know.</span>
                            ) : (
                              <>
                                <span>Was this helpful?</span>
                                <button
                                  type="button"
                                  aria-label="Yes, this helped"
                                  onClick={() => vote(article.id, 'yes')}
                                  className="grid h-7 w-7 place-items-center rounded-full hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)]"
                                >
                                  <ThumbsUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  aria-label="No, this did not help"
                                  onClick={() => vote(article.id, 'no')}
                                  className="grid h-7 w-7 place-items-center rounded-full hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)]"
                                >
                                  <ThumbsDown className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </CardContent>
    </Card>
  );
};
