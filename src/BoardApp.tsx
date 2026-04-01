import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ensureGuestSession } from './auth/guestAuth'
import { supabase } from './lib/supabaseClient'
import { createTask, deleteTask, listTasks, updateTask } from './services/tasks'
import type { Task, TaskDraft, TaskPriority, TaskStatus } from './types'

const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done']
const PRIORITY_ORDER: TaskPriority[] = ['low', 'normal', 'high']

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
}

const EMPTY_DRAFT: TaskDraft = {
  title: '',
  description: '',
  status: 'todo',
  priority: 'normal',
  dueDate: '',
}

function BoardApp() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [search, setSearch] = useState('')
  const [selectedPriority, setSelectedPriority] = useState<'all' | TaskPriority>('all')
  const [selectedStatus, setSelectedStatus] = useState<'all' | TaskStatus>('all')
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [isComposerOpen, setIsComposerOpen] = useState(false)
  const [draft, setDraft] = useState<TaskDraft>(EMPTY_DRAFT)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function bootstrap() {
      try {
        await ensureGuestSession()
        const items = await listTasks()
        if (active) {
          setTasks(items)
        }
      } catch (err) {
        if (active) {
          setError(asMessage(err))
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void bootstrap()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        return
      }

      void listTasks()
        .then((items) => {
          if (active) {
            setTasks(items)
          }
        })
        .catch((err) => {
          if (active) {
            setError(asMessage(err))
          }
        })
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase()

    return tasks.filter((task) => {
      const matchesSearch =
        query.length === 0 ||
        task.title.toLowerCase().includes(query) ||
        (task.description ?? '').toLowerCase().includes(query)
      const matchesPriority = selectedPriority === 'all' || task.priority === selectedPriority
      const matchesStatus = selectedStatus === 'all' || task.status === selectedStatus

      return matchesSearch && matchesPriority && matchesStatus
    })
  }, [search, selectedPriority, selectedStatus, tasks])

  const stats = useMemo(() => {
    const total = tasks.length
    const completed = tasks.filter((task) => task.status === 'done').length
    const overdue = tasks.filter((task) => task.due_date && dueDateTone(task.due_date).tone === 'overdue').length
    const highPriority = tasks.filter((task) => task.priority === 'high').length
    return { total, completed, overdue, highPriority }
  }, [tasks])

  async function refreshTasks() {
    const items = await listTasks()
    setTasks(items)
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const created = await createTask({
        ...draft,
        title: draft.title.trim(),
        description: draft.description.trim(),
      })
      setTasks((current) => [created, ...current])
      setDraft(EMPTY_DRAFT)
      setIsComposerOpen(false)
    } catch (err) {
      setError(asMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingTask) {
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const updated = await updateTask(editingTask.id, {
        title: draft.title.trim(),
        description: draft.description.trim(),
        status: draft.status,
        priority: draft.priority,
        dueDate: draft.dueDate || null,
      })

      setTasks((current) => current.map((task) => (task.id === updated.id ? updated : task)))
      setEditingTask(null)
      setDraft(EMPTY_DRAFT)
    } catch (err) {
      setError(asMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteTask(id: string) {
    setSubmitting(true)
    setError(null)

    try {
      await deleteTask(id)
      setTasks((current) => current.filter((task) => task.id !== id))
      if (editingTask?.id === id) {
        setEditingTask(null)
        setDraft(EMPTY_DRAFT)
      }
    } catch (err) {
      setError(asMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDrop(nextStatus: TaskStatus) {
    if (!draggedTaskId) {
      return
    }

    const task = tasks.find((entry) => entry.id === draggedTaskId)
    setDraggedTaskId(null)

    if (!task || task.status === nextStatus) {
      return
    }

    const previous = tasks
    setTasks((current) =>
      current.map((entry) => (entry.id === task.id ? { ...entry, status: nextStatus } : entry)),
    )

    try {
      const updated = await updateTask(task.id, { status: nextStatus })
      setTasks((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)))
    } catch (err) {
      setTasks(previous)
      setError(asMessage(err))
    }
  }

  function openComposer(status?: TaskStatus) {
    setDraft({ ...EMPTY_DRAFT, status: status ?? 'todo', dueDate: suggestDueDate(status ?? 'todo') })
    setEditingTask(null)
    setIsComposerOpen(true)
  }

  function openEditor(task: Task) {
    setDraft({
      title: task.title,
      description: task.description ?? '',
      status: task.status,
      priority: task.priority,
      dueDate: task.due_date ?? '',
    })
    setIsComposerOpen(false)
    setEditingTask(task)
  }

  return (
    <div className="page-shell">
      <div className="page-glow page-glow-left" />
      <div className="page-glow page-glow-right" />

      <main className="app-shell">
        <section className="hero-panel">
          <div>
            <p className="eyebrow">NextPlay Assessment Frontend + Go API</p>
            <h1>Guest users land in a real board, not a placeholder workflow.</h1>
            <p className="hero-copy">
              Anonymous auth is handled through Supabase, task reads and writes flow through the Go API,
              and the board now matches the live schema instead of a local-only demo model.
            </p>
          </div>

          <div className="hero-actions">
            <button className="primary-button" type="button" onClick={() => openComposer()}>
              Create task
            </button>
            <div className="status-pill">
              <span className="status-dot" />
              Guest auth + Go API + Supabase wired together
            </div>
          </div>
        </section>

        {error ? (
          <section className="error-banner">
            <strong>Connection issue</strong>
            <span>{error}</span>
            <button className="ghost-button" type="button" onClick={() => void refreshTasks()}>
              Retry
            </button>
          </section>
        ) : null}

        <section className="stats-grid" aria-label="Board summary">
          <StatCard label="Total tasks" value={stats.total.toString().padStart(2, '0')} detail="Persisted for this guest session" />
          <StatCard label="Completed" value={`${stats.completed}`} detail="Cards in the done column" accent="mint" />
          <StatCard label="Overdue" value={`${stats.overdue}`} detail="Tasks that need immediate attention" accent="coral" />
          <StatCard label="High priority" value={`${stats.highPriority}`} detail="Urgent items worth surfacing first" accent="gold" />
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
            <span>Status</span>
            <select
              value={selectedStatus}
              onChange={(event) => setSelectedStatus(event.target.value as 'all' | TaskStatus)}
            >
              <option value="all">All statuses</option>
              {STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span>Priority</span>
            <select
              value={selectedPriority}
              onChange={(event) => setSelectedPriority(event.target.value as 'all' | TaskPriority)}
            >
              <option value="all">All priorities</option>
              {PRIORITY_ORDER.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABELS[priority]}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="board-grid" aria-label="Kanban board">
          {STATUS_ORDER.map((status) => {
            const columnTasks = filteredTasks.filter((task) => task.status === status)

            return (
              <section
                key={status}
                className={`board-column ${draggedTaskId ? 'board-column-droppable' : ''}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => void handleDrop(status)}
              >
                <header className="column-header">
                  <div>
                    <p className="column-kicker">{STATUS_LABELS[status]}</p>
                    <h2>{columnTasks.length} tasks</h2>
                  </div>
                  <button className="ghost-button" type="button" onClick={() => openComposer(status)}>
                    New
                  </button>
                </header>

                <div className="column-cards">
                  {loading ? (
                    <>
                      <div className="skeleton-card" />
                      <div className="skeleton-card" />
                    </>
                  ) : columnTasks.length === 0 ? (
                    <div className="empty-state">
                      <p>No tasks here yet.</p>
                      <span>Create a task or drag one into this stage.</span>
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
                          <span className={`priority-chip priority-${task.priority}`}>
                            {PRIORITY_LABELS[task.priority]}
                          </span>
                          {task.due_date ? (
                            <span className={`due-chip due-${dueDateTone(task.due_date).tone}`}>
                              {dueDateTone(task.due_date).label}
                            </span>
                          ) : (
                            <span className="due-chip due-planned">No due date</span>
                          )}
                        </div>

                        <div className="task-card-heading">
                          <h3>{task.title}</h3>
                          <button className="card-link" type="button" onClick={() => openEditor(task)}>
                            Edit
                          </button>
                        </div>

                        <p>{task.description || 'Add more detail to make handoffs cleaner for reviewers and teammates.'}</p>

                        <footer className="task-card-footer">
                          <span className="date-copy">
                            {task.due_date ? formatDueDate(task.due_date) : 'No deadline'}
                          </span>
                          <button className="card-link card-link-danger" type="button" onClick={() => void handleDeleteTask(task.id)}>
                            Delete
                          </button>
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
        <TaskDialog
          title="Create a task"
          draft={draft}
          submitting={submitting}
          onChange={setDraft}
          onClose={() => setIsComposerOpen(false)}
          onSubmit={handleCreateTask}
        />
      ) : null}

      {editingTask ? (
        <TaskDialog
          title="Edit task"
          draft={draft}
          submitting={submitting}
          onChange={setDraft}
          onClose={() => setEditingTask(null)}
          onSubmit={handleUpdateTask}
        />
      ) : null}
    </div>
  )
}

function TaskDialog({
  title,
  draft,
  submitting,
  onChange,
  onClose,
  onSubmit,
}: {
  title: string
  draft: TaskDraft
  submitting: boolean
  onChange: (next: TaskDraft) => void
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void> | void
}) {
  return (
    <div className="composer-backdrop" role="presentation" onClick={onClose}>
      <section className="composer-panel" aria-modal="true" role="dialog" onClick={(event) => event.stopPropagation()}>
        <header className="composer-header">
          <div>
            <p className="eyebrow">Task details</p>
            <h2>{title}</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>
            Close
          </button>
        </header>

        <form className="composer-form" onSubmit={onSubmit}>
          <label>
            <span>Title</span>
            <input
              type="text"
              placeholder="Ex. Connect Supabase task persistence"
              value={draft.title}
              onChange={(event) => onChange({ ...draft, title: event.target.value })}
            />
          </label>

          <label>
            <span>Description</span>
            <textarea
              rows={4}
              placeholder="Add enough detail for a clear handoff."
              value={draft.description}
              onChange={(event) => onChange({ ...draft, description: event.target.value })}
            />
          </label>

          <div className="composer-grid">
            <label>
              <span>Status</span>
              <select
                value={draft.status}
                onChange={(event) => onChange({ ...draft, status: event.target.value as TaskStatus })}
              >
                {STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Priority</span>
              <select
                value={draft.priority}
                onChange={(event) =>
                  onChange({ ...draft, priority: event.target.value as TaskPriority })
                }
              >
                {PRIORITY_ORDER.map((priority) => (
                  <option key={priority} value={priority}>
                    {PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Due date</span>
              <input
                type="date"
                value={draft.dueDate}
                onChange={(event) => onChange({ ...draft, dueDate: event.target.value })}
              />
            </label>
          </div>

          <footer className="composer-footer">
            <p>Fields map directly to the live Supabase `tasks` table through the Go API.</p>
            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save task'}
            </button>
          </footer>
        </form>
      </section>
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

function suggestDueDate(status: TaskStatus) {
  const date = new Date()
  const offset = status === 'done' ? 0 : status === 'in_review' ? 1 : status === 'in_progress' ? 2 : 4
  date.setDate(date.getDate() + offset)
  return date.toISOString().slice(0, 10)
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

function asMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong while talking to the API.'
}

export default BoardApp
