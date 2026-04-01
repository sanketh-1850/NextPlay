import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, DragEvent, FormEvent } from 'react'
import tapIcon from './assets/tap.png'
import { ensureGuestSession } from './auth/guestAuth'
import { moveTask, normalizeTaskOrder, STATUS_LABELS, STATUS_ORDER, tasksForStatus } from './boardModel'
import {
  EMPTY_BOARD_DATA,
  addTaskActivity,
  addTaskComment,
  createLabel,
  createTeamMember,
  loadBoardData,
  replaceTaskAssignees,
  replaceTaskLabels,
} from './services/boardData'
import { createTask, deleteTask, reorderTasks, updateTask } from './services/tasks'
import type {
  BoardData,
  Label,
  Task,
  TaskActivity,
  TaskComment,
  TaskDraft,
  TaskPriority,
  TaskStatus,
  TeamMember,
} from './types'

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  normal: 'Medium',
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
const CARD_HEIGHT = 248
const BOARD_PADDING = 20
const MEMBER_COLORS = ['#89afd7', '#d8bf5c', '#97b85b', '#cf8ea0', '#c188e6']
const LABEL_COLORS = ['#f8d978', '#c4e88e', '#ffbfd0', '#b9d7ff', '#d7c4ff']

type FilterState = {
  query: string
  priority: 'all' | TaskPriority
  memberId: 'all' | string
  labelId: 'all' | string
}

function KanbanAdvancedApp() {
  const [board, setBoard] = useState<BoardData>({ tasks: [], ...EMPTY_BOARD_DATA })
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [hoveredColumn, setHoveredColumn] = useState<TaskStatus | null>(null)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [draft, setDraft] = useState<TaskDraft>(EMPTY_DRAFT)
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([])
  const [newMemberName, setNewMemberName] = useState('')
  const [newMemberEmoji, setNewMemberEmoji] = useState('🙂')
  const [newLabelName, setNewLabelName] = useState('')
  const [commentDraft, setCommentDraft] = useState('')
  const [filters, setFilters] = useState<FilterState>({
    query: '',
    priority: 'all',
    memberId: 'all',
    labelId: 'all',
  })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mutationCount, setMutationCount] = useState(0)
  const columnRefs = useRef<Record<TaskStatus, HTMLDivElement | null>>({
    todo: null,
    in_progress: null,
    in_review: null,
    done: null,
  })

  const tasks = board.tasks
  const members = board.members
  const labels = board.labels
  const taskAssignees = board.taskAssignees
  const taskLabels = board.taskLabels
  const comments = board.comments
  const activity = board.activity
  const editingTask = editingTaskId ? tasks.find((task) => task.id === editingTaskId) ?? null : null

  useEffect(() => {
    let active = true

    async function bootstrap() {
      try {
        await ensureGuestSession()
        const nextBoard = await loadBoardData()
        const normalized = normalizeTaskOrder(nextBoard.tasks)
        if (normalized.changed.length > 0) {
          await persistTaskOrder(normalized.changed)
        }
        if (active) {
          setBoard({ ...nextBoard, tasks: normalized.nextTasks })
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
  }, [mutationCount])

  const filteredTasks = useMemo(() => {
    const query = filters.query.trim().toLowerCase()
    return tasks.filter((task) => {
      if (filters.priority !== 'all' && task.priority !== filters.priority) return false
      const memberIds = assigneeIdsForTask(taskAssignees, task.id)
      const labelIds = labelIdsForTask(taskLabels, task.id)
      if (filters.memberId !== 'all' && !memberIds.includes(filters.memberId)) return false
      if (filters.labelId !== 'all' && !labelIds.includes(filters.labelId)) return false
      if (!query) return true

      const searchHaystack = [
        task.title,
        task.description ?? '',
        ...labelsForTask(labels, taskLabels, task.id).map((label) => label.name),
        ...membersForTask(members, taskAssignees, task.id).map((member) => member.name),
      ]
        .join(' ')
        .toLowerCase()

      return searchHaystack.includes(query)
    })
  }, [filters, labels, members, taskAssignees, taskLabels, tasks])

  const columns = useMemo(
    () =>
      Object.fromEntries(
        STATUS_ORDER.map((status) => [status, tasksForStatus(filteredTasks, status)]),
      ) as Record<TaskStatus, Task[]>,
    [filteredTasks],
  )

  const stats = useMemo(() => {
    const overdue = tasks.filter((task) => task.due_date && dueDateTone(task.due_date).tone === 'overdue').length
    const done = tasks.filter((task) => task.status === 'done').length
    const high = tasks.filter((task) => task.priority === 'high').length
    return [
      { label: 'Total notes', value: tasks.length, className: 'summary-chip yellow' },
      { label: 'Completed', value: done, className: 'summary-chip green' },
      { label: 'Overdue', value: overdue, className: 'summary-chip rose' },
      { label: 'High priority', value: high, className: 'summary-chip blue' },
    ]
  }, [tasks])

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
    setSelectedMemberIds([])
    setSelectedLabelIds([])
    setCommentDraft('')
    setEditingTaskId(null)
    setDialogMode('create')
  }

  function openEditor(task: Task) {
    setDraft({
      title: task.title,
      description: task.description ?? '',
      status: task.status,
      priority: task.priority,
      dueDate: task.due_date ?? '',
    })
    setSelectedMemberIds(assigneeIdsForTask(taskAssignees, task.id))
    setSelectedLabelIds(labelIdsForTask(taskLabels, task.id))
    setCommentDraft('')
    setEditingTaskId(task.id)
    setDialogMode('edit')
  }

  function closeDialog() {
    setDialogMode(null)
    setEditingTaskId(null)
    setDraft(EMPTY_DRAFT)
    setSelectedMemberIds([])
    setSelectedLabelIds([])
    setCommentDraft('')
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
      await persistTaskOrder(normalized.changed)

      setBoard((current) => ({
        ...current,
        tasks: normalized.nextTasks,
      }))
      closeDialog()

      let nextAssignees = taskAssignees
      let nextLabels = taskLabels
      let nextActivity = activity

      nextActivity = await appendActivityEntry(nextActivity, created.id, 'Created this note.')

      if (selectedMemberIds.length > 0) {
        nextAssignees = mergeTaskAssignees(taskAssignees, created.id, await replaceTaskAssignees(created.id, selectedMemberIds))
        nextActivity = await appendActivityEntry(
          nextActivity,
          created.id,
          `Assigned ${selectedMemberIds
            .map((memberId) => members.find((member) => member.id === memberId)?.name)
            .filter(Boolean)
            .join(', ')}.`,
        )
      }

      if (selectedLabelIds.length > 0) {
        nextLabels = mergeTaskLabels(taskLabels, created.id, await replaceTaskLabels(created.id, selectedLabelIds))
        nextActivity = await appendActivityEntry(
          nextActivity,
          created.id,
          `Tagged ${selectedLabelIds
            .map((labelId) => labels.find((label) => label.id === labelId)?.name)
            .filter(Boolean)
            .join(', ')}.`,
        )
      }

      setBoard((current) => ({
        ...current,
        taskAssignees: nextAssignees,
        taskLabels: nextLabels,
        activity: nextActivity,
      }))
    } catch (err) {
      setError(asMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingTask) return

    const nextDraft = readDraftFromForm(event.currentTarget)
    const previousMemberIds = assigneeIdsForTask(taskAssignees, editingTask.id)
    const previousLabelIds = labelIdsForTask(taskLabels, editingTask.id)
    setSubmitting(true)
    setError(null)

    try {
      const updated = await updateTask(editingTask.id, {
        title: nextDraft.title.trim(),
        description: nextDraft.description.trim(),
        status: nextDraft.status,
        priority: nextDraft.priority,
        dueDate: nextDraft.dueDate || null,
      })

      const normalized = normalizeTaskOrder(tasks.map((task) => (task.id === updated.id ? updated : task)))
      await persistTaskOrder(normalized.changed)

      setBoard((current) => ({
        ...current,
        tasks: normalized.nextTasks,
      }))
      closeDialog()

      let nextAssignees = taskAssignees
      let nextLabels = taskLabels
      let nextActivity = activity

      if (!sameIds(previousMemberIds, selectedMemberIds)) {
        nextAssignees = mergeTaskAssignees(taskAssignees, updated.id, await replaceTaskAssignees(updated.id, selectedMemberIds))
      }

      if (!sameIds(previousLabelIds, selectedLabelIds)) {
        nextLabels = mergeTaskLabels(taskLabels, updated.id, await replaceTaskLabels(updated.id, selectedLabelIds))
      }

      const messages = describeTaskChanges(
        editingTask,
        updated,
        previousMemberIds,
        selectedMemberIds,
        previousLabelIds,
        selectedLabelIds,
        members,
        labels,
      )

      for (const message of messages) {
        nextActivity = await appendActivityEntry(nextActivity, updated.id, message)
      }

      setBoard((current) => ({
        ...current,
        taskAssignees: nextAssignees,
        taskLabels: nextLabels,
        activity: nextActivity,
      }))
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
      setBoard((current) => ({
        ...current,
        tasks: current.tasks.filter((task) => task.id !== id),
        taskAssignees: current.taskAssignees.filter((entry) => entry.task_id !== id),
        taskLabels: current.taskLabels.filter((entry) => entry.task_id !== id),
        comments: current.comments.filter((entry) => entry.task_id !== id),
        activity: current.activity.filter((entry) => entry.task_id !== id),
      }))
      closeDialog()
    } catch (err) {
      setError(asMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCommentSubmit() {
    if (!editingTask || !commentDraft.trim()) return
    setSubmitting(true)
    setError(null)

    try {
      const comment = await addTaskComment(editingTask.id, commentDraft.trim())
      const log = await addTaskActivity(editingTask.id, 'Added a comment.')
      setBoard((current) => ({
        ...current,
        comments: [...current.comments, comment],
        activity: [...current.activity, log],
      }))
      setCommentDraft('')
    } catch (err) {
      setError(asMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAddMember() {
    if (!newMemberName.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const member = await createTeamMember({
        name: newMemberName.trim(),
        color: MEMBER_COLORS[members.length % MEMBER_COLORS.length],
        avatarEmoji: newMemberEmoji.trim() || null,
      })
      setBoard((current) => ({ ...current, members: [...current.members, member] }))
      setSelectedMemberIds((current) => (current.includes(member.id) ? current : [...current, member.id]))
      setNewMemberName('')
      setNewMemberEmoji('🙂')
    } catch (err) {
      setError(asMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAddLabel() {
    if (!newLabelName.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const label = await createLabel({
        name: newLabelName.trim(),
        color: LABEL_COLORS[labels.length % LABEL_COLORS.length],
      })
      setBoard((current) => ({ ...current, labels: [...current.labels, label] }))
      setSelectedLabelIds((current) => (current.includes(label.id) ? current : [...current, label.id]))
      setNewLabelName('')
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

    const previousTasks = tasks
    const movingTask = tasks.find((task) => task.id === draggedTaskId) ?? null
    const nextIndex = getDropIndex(status, event)
    const { nextTasks, changed } = moveTask(tasks, draggedTaskId, status, nextIndex)
    setDraggedTaskId(null)
    setBoard((current) => ({ ...current, tasks: nextTasks }))

    try {
      await persistTaskOrder(changed)
    } catch (err) {
      setBoard((current) => ({ ...current, tasks: previousTasks }))
      setError(asMessage(err))
      return
    }

    if (movingTask && movingTask.status !== status) {
      try {
        const log = await addTaskActivity(
          movingTask.id,
          `Moved from ${STATUS_LABELS[movingTask.status]} to ${STATUS_LABELS[status]}.`,
        )
        setBoard((current) => ({ ...current, activity: [...current.activity, log] }))
      } catch (err) {
        if (!isAdvancedTablesMissingError(err)) {
          setError(asMessage(err))
        }
      }
    }
  }

  return (
    <div className="board-page">
      <div className="board-title-row">
        <div>
          <h1 className="board-title">NextPlay Board</h1>
          <p className="board-subtitle">Sticky-note workflow with assignees, labels, comments, search, and activity.</p>
        </div>
        <div className="board-actions">
          <button className="ghost-pill" type="button" onClick={() => setMutationCount((count) => count + 1)}>
            Refresh
          </button>
          <button className="board-add-button" type="button" onClick={() => openComposer('todo')}>
            Add post-it
          </button>
        </div>
      </div>

      <section className="board-toolbar">
        <label className="board-search">
          <span>Search</span>
          <input
            value={filters.query}
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
            placeholder="Search title, assignee, or label"
          />
        </label>
        <label className="board-filter">
          <span>Priority</span>
          <select
            value={filters.priority}
            onChange={(event) =>
              setFilters((current) => ({ ...current, priority: event.target.value as FilterState['priority'] }))
            }
          >
            <option value="all">All priorities</option>
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="board-filter">
          <span>Assignee</span>
          <select value={filters.memberId} onChange={(event) => setFilters((current) => ({ ...current, memberId: event.target.value }))}>
            <option value="all">Everyone</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <label className="board-filter">
          <span>Label</span>
          <select value={filters.labelId} onChange={(event) => setFilters((current) => ({ ...current, labelId: event.target.value }))}>
            <option value="all">All labels</option>
            {labels.map((label) => (
              <option key={label.id} value={label.id}>
                {label.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="summary-strip">
        {stats.map((stat) => (
          <article key={stat.label} className={stat.className}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </article>
        ))}
      </section>

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
                    columnTasks.map((task, index) => {
                      const taskMembers = membersForTask(members, taskAssignees, task.id)
                      const taskTagList = labelsForTask(labels, taskLabels, task.id)
                      const tone = dueDateTone(task.due_date)
                      return (
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
                          <div className="sticky-label-row">
                            {taskTagList.slice(0, 2).map((label) => (
                              <span key={label.id} className="tiny-label" style={{ backgroundColor: label.color }}>
                                {label.name}
                              </span>
                            ))}
                          </div>
                          <div className="sticky-meta">
                            <span>{task.due_date ? formatDueDate(task.due_date) : 'No due date'}</span>
                            {task.due_date ? <span className={`sticky-badge badge-${tone.tone}`}>{tone.label}</span> : null}
                          </div>
                          <div className="sticky-footer">
                            <div className="sticky-avatar-row">
                              {taskMembers.slice(0, 3).map((member) => (
                                <span key={member.id} className="member-avatar" style={{ backgroundColor: member.color }} title={member.name}>
                                  {member.avatar_emoji || initialsFor(member.name)}
                                </span>
                              ))}
                            </div>
                            <span className="sticky-mini">{comments.filter((comment) => comment.task_id === task.id).length} comments</span>
                          </div>
                        </article>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {dialogMode ? (
        <TaskDialog
          mode={dialogMode}
          draft={draft}
          submitting={submitting}
          members={members}
          labels={labels}
          selectedMemberIds={selectedMemberIds}
          selectedLabelIds={selectedLabelIds}
          newMemberName={newMemberName}
          newMemberEmoji={newMemberEmoji}
          newLabelName={newLabelName}
          comments={editingTask ? commentsForTask(comments, editingTask.id) : []}
          activity={editingTask ? activityForTask(activity, editingTask.id) : []}
          commentDraft={commentDraft}
          onChange={setDraft}
          onToggleMember={(memberId) =>
            setSelectedMemberIds((current) =>
              current.includes(memberId) ? current.filter((value) => value !== memberId) : [...current, memberId],
            )
          }
          onToggleLabel={(labelId) =>
            setSelectedLabelIds((current) =>
              current.includes(labelId) ? current.filter((value) => value !== labelId) : [...current, labelId],
            )
          }
          onNewMemberNameChange={setNewMemberName}
          onNewMemberEmojiChange={setNewMemberEmoji}
          onAddMember={() => void handleAddMember()}
          onNewLabelNameChange={setNewLabelName}
          onAddLabel={() => void handleAddLabel()}
          onCommentDraftChange={setCommentDraft}
          onCommentSubmit={() => void handleCommentSubmit()}
          onClose={closeDialog}
          onDelete={editingTask ? () => void handleDelete(editingTask.id) : null}
          onSubmit={dialogMode === 'create' ? handleCreate : handleUpdate}
        />
      ) : null}
    </div>
  )

  async function persistTaskOrder(changed: Task[]) {
    if (changed.length === 0) return
    await reorderTasks(
      changed.map((task) => ({
        id: task.id,
        status: task.status,
        createdAt: task.created_at,
      })),
    )
  }

  async function appendActivityEntry(current: TaskActivity[], taskId: string, message: string) {
    if (!message.trim()) {
      return current
    }
    try {
      const entry = await addTaskActivity(taskId, message)
      return [...current, entry]
    } catch (err) {
      if (isAdvancedTablesMissingError(err)) {
        return current
      }
      throw err
    }
  }
}

function TaskDialog({
  mode,
  draft,
  submitting,
  members,
  labels,
  selectedMemberIds,
  selectedLabelIds,
  newMemberName,
  newMemberEmoji,
  newLabelName,
  comments,
  activity,
  commentDraft,
  onChange,
  onToggleMember,
  onToggleLabel,
  onNewMemberNameChange,
  onNewMemberEmojiChange,
  onAddMember,
  onNewLabelNameChange,
  onAddLabel,
  onCommentDraftChange,
  onCommentSubmit,
  onClose,
  onDelete,
  onSubmit,
}: {
  mode: 'create' | 'edit'
  draft: TaskDraft
  submitting: boolean
  members: TeamMember[]
  labels: Label[]
  selectedMemberIds: string[]
  selectedLabelIds: string[]
  newMemberName: string
  newMemberEmoji: string
  newLabelName: string
  comments: TaskComment[]
  activity: TaskActivity[]
  commentDraft: string
  onChange: (next: TaskDraft) => void
  onToggleMember: (memberId: string) => void
  onToggleLabel: (labelId: string) => void
  onNewMemberNameChange: (value: string) => void
  onNewMemberEmojiChange: (value: string) => void
  onAddMember: () => void
  onNewLabelNameChange: (value: string) => void
  onAddLabel: () => void
  onCommentDraftChange: (value: string) => void
  onCommentSubmit: () => void
  onClose: () => void
  onDelete: (() => void) | null
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <div className="composer-backdrop" role="presentation" onClick={onClose}>
      <section className="composer-panel sticky-dialog advanced-dialog" onClick={(event) => event.stopPropagation()}>
        <header className="composer-header">
          <div>
            <p className="eyebrow">Sticky note</p>
            <h2>{mode === 'create' ? 'Create sticky note' : 'Task detail'}</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <form className="composer-form" onSubmit={onSubmit}>
          <div className="advanced-grid">
            <section className="advanced-main">
              <label>
                <span>Title</span>
                <input name="title" value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} />
              </label>
              <label>
                <span>Description</span>
                <textarea
                  name="description"
                  rows={5}
                  value={draft.description}
                  onChange={(event) => onChange({ ...draft, description: event.target.value })}
                />
              </label>
              <div className="composer-grid">
                <label>
                  <span>Column</span>
                  <select name="status" value={draft.status} onChange={(event) => onChange({ ...draft, status: event.target.value as TaskStatus })}>
                    {STATUS_ORDER.map((status) => (
                      <option key={status} value={status}>
                        {STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Priority</span>
                  <select name="priority" value={draft.priority} onChange={(event) => onChange({ ...draft, priority: event.target.value as TaskPriority })}>
                    {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Due date</span>
                  <input name="dueDate" type="date" value={draft.dueDate} onChange={(event) => onChange({ ...draft, dueDate: event.target.value })} />
                </label>
              </div>
              <section className="panel-card">
                <div className="panel-card-header">
                  <strong>Assignees</strong>
                  <span>{selectedMemberIds.length} selected</span>
                </div>
                <div className="toggle-list">
                  {members.map((member) => (
                    <button
                      key={member.id}
                      className={`toggle-chip ${selectedMemberIds.includes(member.id) ? 'active' : ''}`}
                      type="button"
                      onClick={() => onToggleMember(member.id)}
                    >
                      <span className="member-avatar" style={{ backgroundColor: member.color }}>
                        {member.avatar_emoji || initialsFor(member.name)}
                      </span>
                      {member.name}
                    </button>
                  ))}
                </div>
                <div className="quick-create-row">
                  <input value={newMemberEmoji} onChange={(event) => onNewMemberEmojiChange(event.target.value)} maxLength={2} placeholder="🙂" />
                  <input value={newMemberName} onChange={(event) => onNewMemberNameChange(event.target.value)} placeholder="Add teammate" />
                  <button className="ghost-pill" type="button" onClick={onAddMember}>
                    Add member
                  </button>
                </div>
              </section>

              <section className="panel-card">
                <div className="panel-card-header">
                  <strong>Labels</strong>
                  <span>{selectedLabelIds.length} selected</span>
                </div>
                <div className="toggle-list">
                  {labels.map((label) => (
                    <button
                      key={label.id}
                      className={`toggle-chip ${selectedLabelIds.includes(label.id) ? 'active' : ''}`}
                      type="button"
                      onClick={() => onToggleLabel(label.id)}
                    >
                      <span className="tiny-label" style={{ backgroundColor: label.color }}>
                        {label.name}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="quick-create-row">
                  <input value={newLabelName} onChange={(event) => onNewLabelNameChange(event.target.value)} placeholder="Add label" />
                  <button className="ghost-pill" type="button" onClick={onAddLabel}>
                    Add label
                  </button>
                </div>
              </section>
            </section>

            <aside className="advanced-side">
              <section className="panel-card">
                <div className="panel-card-header">
                  <strong>Comments</strong>
                  <span>{comments.length}</span>
                </div>
                <div className="comment-feed">
                  {comments.length === 0 ? <p className="muted-copy">No comments yet.</p> : null}
                  {comments.map((comment) => (
                    <article key={comment.id} className="timeline-entry">
                      <p>{comment.body}</p>
                      <span>{formatTimestamp(comment.created_at)}</span>
                    </article>
                  ))}
                </div>
                {mode === 'edit' ? (
                  <div className="comment-composer">
                    <textarea rows={3} value={commentDraft} onChange={(event) => onCommentDraftChange(event.target.value)} placeholder="Write a comment" />
                    <button className="ghost-pill" type="button" onClick={onCommentSubmit}>
                      Add comment
                    </button>
                  </div>
                ) : (
                  <p className="muted-copy">Save the note first to add comments.</p>
                )}
              </section>

              <section className="panel-card">
                <div className="panel-card-header">
                  <strong>Activity</strong>
                  <span>{activity.length}</span>
                </div>
                <div className="timeline-feed">
                  {activity.length === 0 ? <p className="muted-copy">No activity yet.</p> : null}
                  {activity.map((entry) => (
                    <article key={entry.id} className="timeline-entry">
                      <p>{entry.message}</p>
                      <span>{formatRelativeTime(entry.created_at)}</span>
                    </article>
                  ))}
                </div>
              </section>
            </aside>
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
                {submitting ? 'Saving...' : mode === 'create' ? 'Create note' : 'Save changes'}
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
  } as CSSProperties
}

function columnHeaderLabel(status: TaskStatus, index: number) {
  if (index === 1 && status === 'in_progress') return 'Doing'
  if (index === 3 && status === 'done') return 'Done'
  return STATUS_LABELS[status]
}

function labelsForTask(labels: Label[], taskLabels: BoardData['taskLabels'], taskId: string) {
  const labelIds = labelIdsForTask(taskLabels, taskId)
  return labels.filter((label) => labelIds.includes(label.id))
}

function membersForTask(members: TeamMember[], taskAssignees: BoardData['taskAssignees'], taskId: string) {
  const memberIds = assigneeIdsForTask(taskAssignees, taskId)
  return members.filter((member) => memberIds.includes(member.id))
}

function commentsForTask(comments: TaskComment[], taskId: string) {
  return comments.filter((comment) => comment.task_id === taskId)
}

function activityForTask(activity: TaskActivity[], taskId: string) {
  return activity
    .filter((entry) => entry.task_id === taskId)
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
}

function assigneeIdsForTask(taskAssignees: BoardData['taskAssignees'], taskId: string) {
  return taskAssignees.filter((entry) => entry.task_id === taskId).map((entry) => entry.member_id)
}

function labelIdsForTask(taskLabels: BoardData['taskLabels'], taskId: string) {
  return taskLabels.filter((entry) => entry.task_id === taskId).map((entry) => entry.label_id)
}

function mergeTaskAssignees(existing: BoardData['taskAssignees'], taskId: string, nextEntries: BoardData['taskAssignees']) {
  return [...existing.filter((entry) => entry.task_id !== taskId), ...nextEntries]
}

function mergeTaskLabels(existing: BoardData['taskLabels'], taskId: string, nextEntries: BoardData['taskLabels']) {
  return [...existing.filter((entry) => entry.task_id !== taskId), ...nextEntries]
}

function sameIds(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()
  return sortedLeft.every((value, index) => value === sortedRight[index])
}

function describeTaskChanges(
  previous: Task,
  next: Task,
  previousMemberIds: string[],
  nextMemberIds: string[],
  previousLabelIds: string[],
  nextLabelIds: string[],
  members: TeamMember[],
  labels: Label[],
) {
  const messages: string[] = []
  if (previous.status !== next.status) {
    messages.push(`Moved from ${STATUS_LABELS[previous.status]} to ${STATUS_LABELS[next.status]}.`)
  }
  if (previous.priority !== next.priority) {
    messages.push(`Priority changed from ${PRIORITY_LABELS[previous.priority]} to ${PRIORITY_LABELS[next.priority]}.`)
  }
  if (previous.title !== next.title || previous.description !== next.description) {
    messages.push('Updated the task details.')
  }
  if (previous.due_date !== next.due_date) {
    messages.push(`Due date changed to ${next.due_date ? formatDueDate(next.due_date) : 'none'}.`)
  }
  if (!sameIds(previousMemberIds, nextMemberIds)) {
    messages.push(
      nextMemberIds.length > 0
        ? `Assigned ${nextMemberIds
            .map((memberId) => members.find((member) => member.id === memberId)?.name)
            .filter(Boolean)
            .join(', ')}.`
        : 'Cleared assignees.',
    )
  }
  if (!sameIds(previousLabelIds, nextLabelIds)) {
    messages.push(
      nextLabelIds.length > 0
        ? `Updated labels: ${nextLabelIds
            .map((labelId) => labels.find((label) => label.id === labelId)?.name)
            .filter(Boolean)
            .join(', ')}.`
        : 'Removed all labels.',
    )
  }
  return messages
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
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${value}T00:00:00`))
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatRelativeTime(value: string) {
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const diffMs = new Date(value).getTime() - Date.now()
  const minutes = Math.round(diffMs / 60000)
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour')
  const days = Math.round(hours / 24)
  return formatter.format(days, 'day')
}

function dueDateTone(value: string | null) {
  if (!value) return { label: 'No due date', tone: 'planned' as const }
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

function initialsFor(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
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

function isAdvancedTablesMissingError(error: unknown) {
  return asMessage(error).includes('Advanced board tables are missing')
}

export default KanbanAdvancedApp
