import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'

type Status = 'To Do' | 'In Progress' | 'In Review' | 'Done'
type Priority = 'Low' | 'Medium' | 'High'

type Task = {
  id: string
  title: string
  description: string
  status: Status
  priority: Priority
  dueDate: string
  labels: string[]
  assignees: string[]
}

type TeamMember = {
  id: string
  name: string
  initials: string
  tone: string
}

const COLUMN_ORDER: Status[] = ['To Do', 'In Progress', 'In Review', 'Done']
const PRIORITY_ORDER: Priority[] = ['Low', 'Medium', 'High']
const STORAGE_KEY = 'nextplay-board-demo'

const TEAM: TeamMember[] = [
  { id: 'mila', name: 'Mila Torres', initials: 'MT', tone: 'sunrise' },
  { id: 'omar', name: 'Omar Chen', initials: 'OC', tone: 'ocean' },
  { id: 'rhea', name: 'Rhea Singh', initials: 'RS', tone: 'violet' },
]

const SEED_TASKS: Task[] = [
  {
    id: 'task-1',
    title: 'Refine guest onboarding copy',
    description:
      'Clarify privacy expectations for anonymous sessions and tighten the first-run empty state.',
    status: 'To Do',
    priority: 'Medium',
    dueDate: shiftDate(4),
    labels: ['UX', 'Copy'],
    assignees: ['mila'],
  },
  {
    id: 'task-2',
    title: 'Ship board analytics header',
    description:
      'Add task totals, completion pace, and overdue visibility in the top summary row.',
    status: 'In Progress',
    priority: 'High',
    dueDate: shiftDate(1),
    labels: ['Frontend', 'Metrics'],
    assignees: ['omar', 'rhea'],
  },
  {
    id: 'task-3',
    title: 'Design review for task card states',
    description:
      'Polish hover, drag, and selected states so the board feels product-grade on tablet and desktop.',
    status: 'In Review',
    priority: 'High',
    dueDate: shiftDate(0),
    labels: ['Design'],
    assignees: ['mila', 'rhea'],
  },
  {
    id: 'task-4',
    title: 'Persist label filters',
    description:
      'Save the user filter state locally so the workspace feels sticky before Supabase is connected.',
    status: 'Done',
    priority: 'Low',
    dueDate: shiftDate(-2),
    labels: ['State', 'Polish'],
    assignees: ['omar'],
  },
]

function shiftDate(offset: number) {
  const value = new Date()
  value.setDate(value.getDate() + offset)
  return value.toISOString().slice(0, 10)
}

function createTaskId() {
  return `task-${Math.random().toString(36).slice(2, 10)}`
}

function formatDueDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

function dueDateTone(value: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${value}T00:00:00`)
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000)

  if (diff < 0) return { label: 'Overdue', tone: 'overdue' as const }
  if (diff <= 1) return { label: 'Due soon', tone: 'soon' as const }
  return { label: 'Planned', tone: 'planned' as const }
}

function App() {
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) return SEED_TASKS

    try {
      return JSON.parse(saved) as Task[]
    } catch {
      return SEED_TASKS
    }
  })
  const [search, setSearch] = useState('')
  const [selectedLabel, setSelectedLabel] = useState<string>('All labels')
  const [selectedPriority, setSelectedPriority] = useState<'All priorities' | Priority>('All priorities')
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [isComposerOpen, setIsComposerOpen] = useState(false)
  const [draft, setDraft] = useState({
    title: '',
    description: '',
    status: 'To Do' as Status,
    priority: 'Medium' as Priority,
    dueDate: shiftDate(3),
    labels: 'Feature, UI',
    assignees: ['mila'] as string[],
  })

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  }, [tasks])

  const labels = useMemo(() => {
    const allLabels = new Set<string>()
    tasks.forEach((task) => task.labels.forEach((label) => allLabels.add(label)))
    return ['All labels', ...Array.from(allLabels).sort()]
  }, [tasks])

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase()

    return tasks.filter((task) => {
      const matchesSearch =
        query.length === 0 ||
        task.title.toLowerCase().includes(query) ||
        task.description.toLowerCase().includes(query)
      const matchesLabel = selectedLabel === 'All labels' || task.labels.includes(selectedLabel)
      const matchesPriority =
        selectedPriority === 'All priorities' || task.priority === selectedPriority

      return matchesSearch && matchesLabel && matchesPriority
    })
  }, [search, selectedLabel, selectedPriority, tasks])

  const stats = useMemo(() => {
    const total = tasks.length
    const completed = tasks.filter((task) => task.status === 'Done').length
    const overdue = tasks.filter((task) => dueDateTone(task.dueDate).tone === 'overdue').length
    const highPriority = tasks.filter((task) => task.priority === 'High').length

    return { total, completed, overdue, highPriority }
  }, [tasks])

  function handleDrop(nextStatus: Status) {
    if (!draggedTaskId) return

    setTasks((current) =>
      current.map((task) =>
        task.id === draggedTaskId ? { ...task, status: nextStatus } : task,
      ),
    )
    setDraggedTaskId(null)
  }

  function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalizedTitle = draft.title.trim()
    if (!normalizedTitle) return

    const nextTask: Task = {
      id: createTaskId(),
      title: normalizedTitle,
      description: draft.description.trim(),
      status: draft.status,
      priority: draft.priority,
      dueDate: draft.dueDate,
      labels: draft.labels
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      assignees: draft.assignees,
    }

    setTasks((current) => [nextTask, ...current])
    setDraft({
      title: '',
      description: '',
      status: 'To Do',
      priority: 'Medium',
      dueDate: shiftDate(3),
      labels: 'Feature, UI',
      assignees: ['mila'],
    })
    setIsComposerOpen(false)
  }

  return (
    <div className="page-shell">
      <div className="page-glow page-glow-left" />
      <div className="page-glow page-glow-right" />

      <main className="app-shell">
        <section className="hero-panel">
          <div>
            <p className="eyebrow">NextPlay Assessment Frontend</p>
            <h1>Build a board that feels ready for a real team, not just a demo.</h1>
            <p className="hero-copy">
              This frontend is built around reviewer-facing polish first: strong hierarchy,
              quick board scanning, visible task health, and a clean seam for Supabase-backed
              persistence once your schema is live.
            </p>
          </div>

          <div className="hero-actions">
            <button className="primary-button" type="button" onClick={() => setIsComposerOpen(true)}>
              Create task
            </button>
            <div className="status-pill">
              <span className="status-dot" />
              Local mode until Supabase is connected
            </div>
          </div>
        </section>

        <section className="stats-grid" aria-label="Board summary">
          <StatCard label="Total tasks" value={stats.total.toString().padStart(2, '0')} detail="Across all workflow stages" />
          <StatCard label="Completed" value={`${stats.completed}`} detail="Tasks that reached Done" accent="mint" />
          <StatCard label="Overdue" value={`${stats.overdue}`} detail="Cards needing attention now" accent="coral" />
          <StatCard label="High priority" value={`${stats.highPriority}`} detail="Useful for a summary ribbon" accent="gold" />
        </section>

        <section className="toolbar">
          <label className="search-field">
            <span>Search</span>
            <input
              type="search"
              placeholder="Search task title or description"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <label className="filter-field">
            <span>Label</span>
            <select value={selectedLabel} onChange={(event) => setSelectedLabel(event.target.value)}>
              {labels.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span>Priority</span>
            <select
              value={selectedPriority}
              onChange={(event) =>
                setSelectedPriority(event.target.value as 'All priorities' | Priority)
              }
            >
              <option value="All priorities">All priorities</option>
              {PRIORITY_ORDER.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="board-grid" aria-label="Kanban board">
          {COLUMN_ORDER.map((column) => {
            const columnTasks = filteredTasks.filter((task) => task.status === column)

            return (
              <section
                key={column}
                className={`board-column ${draggedTaskId ? 'board-column-droppable' : ''}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => handleDrop(column)}
              >
                <header className="column-header">
                  <div>
                    <p className="column-kicker">{column}</p>
                    <h2>{columnTasks.length} tasks</h2>
                  </div>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => {
                      setDraft((current) => ({ ...current, status: column }))
                      setIsComposerOpen(true)
                    }}
                  >
                    New
                  </button>
                </header>

                <div className="column-cards">
                  {columnTasks.length === 0 ? (
                    <div className="empty-state">
                      <p>No tasks here yet.</p>
                      <span>Drop a card here or create a new task for this stage.</span>
                    </div>
                  ) : (
                    columnTasks.map((task) => (
                      <article
                        key={task.id}
                        className="task-card"
                        draggable
                        onDragStart={() => setDraggedTaskId(task.id)}
                        onDragEnd={() => setDraggedTaskId(null)}
                      >
                        <div className="task-card-top">
                          <span className={`priority-chip priority-${task.priority.toLowerCase()}`}>
                            {task.priority}
                          </span>
                          <span className={`due-chip due-${dueDateTone(task.dueDate).tone}`}>
                            {dueDateTone(task.dueDate).label}
                          </span>
                        </div>

                        <h3>{task.title}</h3>
                        <p>{task.description}</p>

                        <div className="label-row">
                          {task.labels.map((label) => (
                            <span key={label} className="label-chip">
                              {label}
                            </span>
                          ))}
                        </div>

                        <footer className="task-card-footer">
                          <div className="assignee-stack" aria-label="Assigned team members">
                            {task.assignees.map((assigneeId) => {
                              const member = TEAM.find((entry) => entry.id === assigneeId)
                              if (!member) return null

                              return (
                                <span
                                  key={member.id}
                                  className={`avatar avatar-${member.tone}`}
                                  title={member.name}
                                >
                                  {member.initials}
                                </span>
                              )
                            })}
                          </div>
                          <span className="date-copy">{formatDueDate(task.dueDate)}</span>
                        </footer>
                      </article>
                    ))
                  )}
                </div>
              </section>
            )
          })}
        </section>
      </main>

      {isComposerOpen ? (
        <div className="composer-backdrop" role="presentation" onClick={() => setIsComposerOpen(false)}>
          <section
            className="composer-panel"
            aria-modal="true"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="composer-header">
              <div>
                <p className="eyebrow">Task composer</p>
                <h2>Create a polished demo task</h2>
              </div>
              <button className="ghost-button" type="button" onClick={() => setIsComposerOpen(false)}>
                Close
              </button>
            </header>

            <form className="composer-form" onSubmit={handleCreateTask}>
              <label>
                <span>Title</span>
                <input
                  type="text"
                  placeholder="Ex. Connect Supabase task persistence"
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                />
              </label>

              <label>
                <span>Description</span>
                <textarea
                  rows={4}
                  placeholder="A short summary that feels useful in a board card."
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, description: event.target.value }))
                  }
                />
              </label>

              <div className="composer-grid">
                <label>
                  <span>Status</span>
                  <select
                    value={draft.status}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, status: event.target.value as Status }))
                    }
                  >
                    {COLUMN_ORDER.map((column) => (
                      <option key={column} value={column}>
                        {column}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Priority</span>
                  <select
                    value={draft.priority}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        priority: event.target.value as Priority,
                      }))
                    }
                  >
                    {PRIORITY_ORDER.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Due date</span>
                  <input
                    type="date"
                    value={draft.dueDate}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, dueDate: event.target.value }))
                    }
                  />
                </label>

                <label>
                  <span>Labels</span>
                  <input
                    type="text"
                    value={draft.labels}
                    onChange={(event) => setDraft((current) => ({ ...current, labels: event.target.value }))}
                  />
                </label>
              </div>

              <fieldset className="assignee-fieldset">
                <legend>Assignees</legend>
                <div className="assignee-picker">
                  {TEAM.map((member) => {
                    const selected = draft.assignees.includes(member.id)

                    return (
                      <button
                        key={member.id}
                        type="button"
                        className={`assignee-option ${selected ? 'assignee-selected' : ''}`}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            assignees: selected
                              ? current.assignees.filter((entry) => entry !== member.id)
                              : [...current.assignees, member.id],
                          }))
                        }
                      >
                        <span className={`avatar avatar-${member.tone}`}>{member.initials}</span>
                        {member.name}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              <footer className="composer-footer">
                <p>Ready for Supabase: map this form directly to your tasks table once auth is live.</p>
                <button className="primary-button" type="submit">
                  Save task
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  )
}

function StatCard({
  label,
  value,
  detail,
  accent = 'blue',
}: {
  label: string
  value: string
  detail: string
  accent?: 'blue' | 'mint' | 'coral' | 'gold'
}) {
  return (
    <article className={`stat-card stat-${accent}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  )
}

export default App
