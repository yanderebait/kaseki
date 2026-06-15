import { useEffect, useState } from 'react'
import ProfessionCards from '../components/ProfessionCards'
import CalendarStrip from '../components/CalendarStrip'
import WidgetArea from '../components/WidgetArea'
import ActivityFeed from '../components/ActivityFeed'
import { Book } from '../icons'

// The home screen is a chooser, not a working surface (Part 5): a centered,
// max-1400px, symmetric 50/50 grid. The Orb lives in the app shell so it
// persists onto the dashboard too.
export default function Home({
  onOpenSpace,
  onOpenKnowledge
}: {
  onOpenSpace: (spaceId: number) => void
  onOpenKnowledge: () => void
}): React.JSX.Element {
  const [name, setName] = useState('')

  useEffect(() => {
    window.kaseki.user.get().then((u) => setName(u.name))
  }, [])

  return (
    <div className="home">
      <main className="home-container" id="main" tabIndex={-1}>
        <div className="home-col">
          <header className="home-greeting">
            <span>Hi, {name}</span>
            <button type="button" className="home-knowledge" onClick={onOpenKnowledge}>
              <Book size={16} />
              Knowledge
            </button>
          </header>
          <ProfessionCards onOpenSpace={onOpenSpace} />
          <ActivityFeed />
        </div>
        <div className="home-col">
          <CalendarStrip />
          <WidgetArea />
        </div>
      </main>
    </div>
  )
}
