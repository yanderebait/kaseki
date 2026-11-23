import { useEffect, useState } from 'react'
import {
  BOOKMARKS_MAX,
  normalizeBookmarkUrl,
  normalizeBookmarks,
  type WidgetBookmark
} from '../../../../shared/widgets'
import { LinkIcon, Plus, X } from '../../icons'

// Bookmarks: a short list of web links that open in your own browser. A
// bookmark is only ever an http(s) URL — the main process refuses to hand
// anything else to the OS, and the list is validated the same way on every
// read, so a hand-edited preference can't smuggle in a file:// link.
export default function BookmarksWidget({ editing }: { editing: boolean }): React.JSX.Element {
  const [bookmarks, setBookmarks] = useState<WidgetBookmark[] | null>(null)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.kaseki.prefs.get().then((p) => setBookmarks(normalizeBookmarks(p.widgetBookmarks)))
  }, [])

  function save(next: WidgetBookmark[]): void {
    setBookmarks(next)
    window.kaseki.prefs.set({ widgetBookmarks: next })
  }

  function add(): void {
    if (!bookmarks) return
    const normalized = normalizeBookmarkUrl(url)
    if (!normalized) {
      setError('Enter a web address, e.g. example.com.')
      return
    }
    const label = name.trim() || new URL(normalized).hostname.replace(/^www\./, '')
    save([...bookmarks, { name: label.slice(0, 60), url: normalized }])
    setName('')
    setUrl('')
    setError(null)
  }

  if (bookmarks === null) return <p className="widget-empty">&nbsp;</p>

  return (
    <div className="widget-bookmarks">
      {bookmarks.length === 0 && !editing && (
        <p className="widget-empty">No bookmarks. Press Edit to add one.</p>
      )}
      <ul className="widget-bookmark-list">
        {bookmarks.map((b, i) => (
          <li key={`${b.url}-${i}`} className="widget-bookmark">
            <button
              type="button"
              className="widget-bookmark-open"
              title={b.url}
              // Routed by the main process's window-open handler to the OS
              // browser; Kaseki never opens a web page inside itself.
              onClick={() => window.open(b.url, '_blank', 'noopener')}
            >
              <LinkIcon size={14} />
              <span>{b.name}</span>
            </button>
            {editing && (
              <button
                type="button"
                className="widget-row-remove"
                aria-label={`Remove ${b.name}`}
                onClick={() => save(bookmarks.filter((_, j) => j !== i))}
              >
                <X size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {editing && bookmarks.length < BOOKMARKS_MAX && (
        <form
          className="widget-inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <input
            className="settings-input widget-bookmark-name"
            placeholder="Name"
            aria-label="Bookmark name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="settings-input"
            placeholder="example.com"
            aria-label="Bookmark address"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setError(null)
            }}
          />
          <button type="submit" className="widget-inline-add" aria-label="Add bookmark">
            <Plus size={16} />
          </button>
        </form>
      )}
      {editing && error && <p className="form-error">{error}</p>}
    </div>
  )
}
