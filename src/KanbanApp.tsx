import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, FormEvent } from 'react'
import tapIcon from './assets/tap.png'
import { ensureGuestSession } from './auth/guestAuth'
import { moveTask, normalizeTaskOrder, STATUS_LABELS, STATUS_ORDER, tasksForStatus } from './boardModel'
import { createTask, deleteTask, listTasks, reorderTasks, updateTask } from './services/tasks'
import type { Task, TaskDraft, TaskPriority, TaskStatus } from './types'

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

const COLUMN_HEADER_HEIGHT = 84
const CARD_GAP = 16
const CARD_HEIGHT = 196
const BOARD_PADDING = 20
function KanbanApp() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [hoveredColumn, setHoveredColumn] = useState<TaskStatus | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [editorTask, setEditorTask] = useState<Task | null>(null)
  const [draft, setDraft] = useState<TaskDraft>(EMPTY_DRAFT)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const columnRefs = useRef<Record<TaskStatus, HTMLDivElement | null>>({
    todo: null,
    in_progress: null,
    in_review: null,
    done: null,
  })

  useEffect(() => {
    let active = true

    async function bootstrap() {
      try {
        await ensureGuestSession()
        const nextTasks = await listTasks()
        const normalized = normalizeTaskOrder(nextTasks)
        if (normalized.changed.length > 0) {
          await reorderTasks(
            normalized.changed.map((task) => ({
              id: task.id,
              status: task.status,
              createdAt: task.created_at,
            })),
          )
        }
        if (active) {
          setTasks(normalized.nextTasks)
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
    return () => {
      active = false
    }
  }, [])

  const columns = useMemo(
    () =>
      Object.fromEntries(
        STATUS_ORDER.map((status) => [status, tasksForStatus(tasks, status)]),
      ) as Record<TaskStatus, Task[]>,
    [tasks],
  )

  const boardHeight = useMemo(() => {
    const maxRows = Math.max(
      ...STATUS_ORDER.map((status) => Math.max(Math.ceil(columns[status].length / 2), 2)),
      2,
    )
    return COLUMN_HEADER_HEIGHT + BOARD_PADDING * 2 + maxRows * (CARD_HEIGHT + CARD_GAP)
  }, [columns])

  function openComposer(status: TaskStatus) {
    setDraft({
      ...EMPTY_DRAFT,
      status,
      dueDate: suggestDueDate(status),
    })
    setComposerOpen(true)
    setEditorTask(null)
  }

  function openEditor(task: Task) {
    setDraft({
      title: task.title,
      description: task.description ?? '',
      status: task.status,
      priority: task.priority,
      dueDate: task.due_date ?? '',
    })
    setEditorTask(task)
    setComposerOpen(false)
  }

async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextDraft = readDraftFromForm(event.currentTarget)
    setSubmitting(true)
    setError(null)

    try {
      const created = await createTask({
        ...nextDraft,
        title: nextDraft.title.trim(),
        description: nextDraft.description.trim(),
      })
      const normalized = normalizeTaskOrder([...tasks, created])
      setTasks(normalized.nextTasks)
      if (normalized.changed.length > 0) {
        await reorderTasks(
          normalized.changed.map((task) => ({
            id: task.id,
            status: task.status,
            createdAt: task.created_at,
          })),
        )
      }
      setDraft(EMPTY_DRAFT)
      setComposerOpen(false)
    } catch (err) {
      setError(asMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editorTask) return

    const nextDraft = readDraftFromForm(event.currentTarget)
    setSubmitting(true)
    setError(null)

    try {
      const updated = await updateTask(editorTask.id, {
        title: nextDraft.title.trim(),
        description: nextDraft.description.trim(),
        status: nextDraft.status,
        priority: nextDraft.priority,
        dueDate: nextDraft.dueDate || null,
      })
      const normalized = normalizeTaskOrder(tasks.map((task) => (task.id === updated.id ? updated : task)))
      setTasks(normalized.nextTasks)
      if (normalized.changed.length > 0) {
        await reorderTasks(
          normalized.changed.map((task) => ({
            id: task.id,
            status: task.status,
            createdAt: task.created_at,
          })),
        )
      }
      setEditorTask(null)
      setDraft(EMPTY_DRAFT)
    } catch (err) {
      setError(asMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    setSubmitting(true)
    setError(null)
    try {
      await deleteTask(id)
      setTasks((current) => current.filter((task) => task.id !== id))
      if (editorTask?.id === id) {
        setEditorTask(null)
      }
    } catch (err) {
      setError(asMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  function getDropIndex(status: TaskStatus, event: DragEvent<HTMLDivElement>) {
    const node = columnRefs.current[status]
    if (!node) {
      return columns[status].length
    }

    const rect = node.getBoundingClientRect()
    const relativeY = event.clientY - rect.top - COLUMN_HEADER_HEIGHT - BOARD_PADDING
    const relativeX = event.clientX - rect.left - BOARD_PADDING
    const row = clamp(Math.floor(relativeY / (CARD_HEIGHT + CARD_GAP)), 0, Math.ceil(columns[status].length / 2) + 1)
    const column = relativeX > rect.width / 2 ? 1 : 0
    return clamp(row * 2 + column, 0, columns[status].length)
  }

  async function handleDrop(status: TaskStatus, event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setHoveredColumn(null)

    if (!draggedTaskId) return

    const previous = tasks
    const nextIndex = getDropIndex(status, event)
    const { nextTasks, changed } = moveTask(tasks, draggedTaskId, status, nextIndex)
    setDraggedTaskId(null)
    setTasks(nextTasks)

    try {
      await reorderTasks(
        changed.map((task: Task) => ({
          id: task.id,
          status: task.status,
          createdAt: task.created_at,
        })),
      )
    } catch (err) {
      setTasks(previous)
      setError(asMessage(err))
    }
  }

  return (
    <div className="board-page">
      <div className="board-title-row">
        <h1 className="board-title">NextPlay Board</h1>
        <button className="board-add-button" type="button" onClick={() => openComposer('todo')}>
          Add post-it
        </button>
      </div>

      {error ? <div className="board-inline-error">{error}</div> : null}

      <section className="whiteboard-frame">
        <div className="whiteboard-surface" style={{ height: `${boardHeight}px` }}>
          {STATUS_ORDER.map((status, columnIndex) => {
            const columnTasks = columns[status]

            return (
              <div
                key={status}
                className={`free-column ${hoveredColumn === status ? 'free-column-hovered' : ''}`}
                ref={(node) => {
                  columnRefs.current[status] = node
                }}
                onDoubleClick={() => openComposer(status)}
                onDragOver={(event) => {
                  event.preventDefault()
                  setHoveredColumn(status)
                }}
                onDragLeave={() => setHoveredColumn((current) => (current === status ? null : current))}
                onDrop={(event) => void handleDrop(status, event)}
              >
                <header className="free-column-header">
                  <span>{columnHeaderLabel(status, columnIndex)}</span>
                </header>

                <div className="free-column-body">
                  {loading ? (
                    <div className="sticky-card sticky-skeleton free-card" style={cardStyle(0, 'normal')} />
                  ) : (
                    columnTasks.map((task, index) => (
                      <article
                        key={task.id}
                        className={`sticky-card sticky-tone-${stickyToneForTask(task)} priority-${task.priority} free-card`}
                        style={cardStyle(index, task.priority)}
                        draggable
                        onDragStart={() => setDraggedTaskId(task.id)}
                        onDragEnd={() => {
                          setDraggedTaskId(null)
                          setHoveredColumn(null)
                        }}
                        onClick={() => openEditor(task)}
                      >
                        <div className="sticky-top">
                          <span className="sticky-priority">{PRIORITY_LABELS[task.priority]}</span>
                          <img className="sticky-edit-hint" src={tapIcon} alt="Tap to edit" title="Click to edit" />
                        </div>
                        <h3>{task.title}</h3>
                        <p>{task.description || 'Tap to edit this note.'}</p>
                        <div className="sticky-meta">
                          <span>{task.due_date ? formatDueDate(task.due_date) : 'No due date'}</span>
                          {task.due_date ? (
                            <span className={`sticky-badge badge-${dueDateTone(task.due_date).tone}`}>
                              {dueDateTone(task.due_date).label}
                            </span>
                          ) : null}
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {composerOpen ? (
        <TaskDialog
          title="Create sticky note"
          draft={draft}
          submitting={submitting}
          onChange={setDraft}
          onClose={() => setComposerOpen(false)}
          onDelete={null}
          onSubmit={handleCreate}
        />
      ) : null}

      {editorTask ? (
        <TaskDialog
          title="Edit sticky note"
          draft={draft}
          submitting={submitting}
          onChange={setDraft}
          onClose={() => setEditorTask(null)}
          onDelete={() => void handleDelete(editorTask.id)}
          onSubmit={handleUpdate}
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
  onDelete,
  onSubmit,
}: {
  title: string
  draft: TaskDraft
  submitting: boolean
  onChange: (next: TaskDraft) => void
  onClose: () => void
  onDelete: (() => void) | null
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <div className="composer-backdrop" role="presentation" onClick={onClose}>
      <section className="composer-panel sticky-dialog" onClick={(event) => event.stopPropagation()}>
        <header className="composer-header">
          <div>
            <p className="eyebrow">Sticky note</p>
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
              name="title"
              value={draft.title}
              onChange={(event) => onChange({ ...draft, title: event.target.value })}
            />
          </label>
          <label>
            <span>Description</span>
            <textarea
              name="description"
              rows={4}
              value={draft.description}
              onChange={(event) => onChange({ ...draft, description: event.target.value })}
            />
          </label>
          <div className="composer-grid">
            <label>
              <span>Column</span>
              <select
                name="status"
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
                name="priority"
                value={draft.priority}
                onChange={(event) => onChange({ ...draft, priority: event.target.value as TaskPriority })}
              >
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Due date</span>
              <input
                name="dueDate"
                type="date"
                value={draft.dueDate}
                onChange={(event) => onChange({ ...draft, dueDate: event.target.value })}
              />
            </label>
          </div>
          <footer className="composer-footer">
            <p>Double-click a column to create a note there.</p>
            <div className="dialog-actions">
              {onDelete ? (
                <button className="ghost-button delete-button" type="button" onClick={onDelete}>
                  Delete
                </button>
              ) : null}
              <button className="primary-button" type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : 'Save note'}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  )
}

function cardStyle(index: number, priority: TaskPriority) {
  const rotateCycle = [-4, 3, -2, 5, -3]
  const rotate = `${rotateCycle[index % rotateCycle.length]}deg`
  const column = index % 2
  const row = Math.floor(index / 2)
  const width = `calc((100% - ${(BOARD_PADDING * 2) + CARD_GAP}px) / 2)`
  const left =
    column === 0
      ? `${BOARD_PADDING}px`
      : `calc(${BOARD_PADDING}px + ((100% - ${(BOARD_PADDING * 2) + CARD_GAP}px) / 2) + ${CARD_GAP}px)`
  return {
    top: `${BOARD_PADDING + row * (CARD_HEIGHT + CARD_GAP)}px`,
    left,
    width,
    '--card-rotate': rotate,
    transform: `rotate(${rotate})`,
    zIndex: index + 1,
    boxShadow:
      priority === 'high'
        ? '0 18px 28px rgba(165, 96, 49, 0.18), inset 0 -14px 18px rgba(0, 0, 0, 0.05)'
        : '0 16px 24px rgba(101, 82, 48, 0.14), inset 0 -14px 18px rgba(0, 0, 0, 0.04)',
  }
}

function columnHeaderLabel(status: TaskStatus, index: number) {
  if (index === 1 && status === 'in_progress') return 'Doing'
  if (index === 3 && status === 'done') return 'Done'
  return STATUS_LABELS[status]
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function suggestDueDate(status: TaskStatus) {
  const date = new Date()
  const offset = status === 'done' ? 0 : status === 'in_review' ? 1 : status === 'in_progress' ? 2 : 4
  date.setDate(date.getDate() + offset)
  return date.toISOString().slice(0, 10)
}

function formatDueDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(`${value}T00:00:00`),
  )
}

function dueDateTone(value: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${value}T00:00:00`)
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000)
  if (diff < 0) return { label: 'Overdue', tone: 'overdue' as const }
  if (diff <= 1) return { label: 'Due soon', tone: 'soon' as const }
  return { label: 'Upcoming', tone: 'planned' as const }
}

function stickyToneForTask(task: Task) {
  const source = task.id
  let hash = 0
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0
  }
  return hash % 4
}

function readDraftFromForm(form: HTMLFormElement): TaskDraft {
  const data = new FormData(form)
  return {
    title: String(data.get('title') ?? ''),
    description: String(data.get('description') ?? ''),
    status: coerceStatus(String(data.get('status') ?? 'todo')),
    priority: coercePriority(String(data.get('priority') ?? 'normal')),
    dueDate: String(data.get('dueDate') ?? ''),
  }
}

function coerceStatus(value: string): TaskStatus {
  return STATUS_ORDER.includes(value as TaskStatus) ? (value as TaskStatus) : 'todo'
}

function coercePriority(value: string): TaskPriority {
  if (value === 'high' || value === 'normal' || value === 'low') {
    return value
  }
  return 'normal'
}

function asMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong while talking to Supabase.'
}

export default KanbanApp
