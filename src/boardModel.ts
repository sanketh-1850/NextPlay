import type { Task, TaskPriority, TaskStatus } from './types'

export const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done']
export const PRIORITY_ORDER: TaskPriority[] = ['high', 'normal', 'low']

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
}

export function comparePriority(left: TaskPriority, right: TaskPriority) {
  return PRIORITY_ORDER.indexOf(left) - PRIORITY_ORDER.indexOf(right)
}

export function sortTasks(tasks: Task[]) {
  return [...tasks].sort((left, right) => {
    const statusDelta = STATUS_ORDER.indexOf(left.status) - STATUS_ORDER.indexOf(right.status)
    if (statusDelta !== 0) {
      return statusDelta
    }
    const priorityDelta = comparePriority(left.priority, right.priority)
    if (priorityDelta !== 0) {
      return priorityDelta
    }
    return new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
  })
}

export function tasksForStatus(tasks: Task[], status: TaskStatus) {
  return sortTasks(tasks).filter((task) => task.status === status)
}

export function normalizeTaskOrder(tasks: Task[]) {
  const now = Date.now()
  const baseline = new Map(tasks.map((task) => [task.id, task]))
  const nextTasks = tasks.map((task) => ({ ...task }))

  for (const status of STATUS_ORDER) {
    const ordered = nextTasks
      .filter((task) => task.status === status)
      .sort((left, right) => {
        const priorityDelta = comparePriority(left.priority, right.priority)
        if (priorityDelta !== 0) {
          return priorityDelta
        }
        return new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
      })

    ordered.forEach((task, index) => {
      const nextCreatedAt = new Date(now + STATUS_ORDER.indexOf(status) * 100000 + index * 60000).toISOString()
      task.created_at = nextCreatedAt
    })
  }

  const sortedTasks = sortTasks(nextTasks)
  const changed = sortedTasks.filter((task) => {
    const previous = baseline.get(task.id)
    return !previous || previous.status !== task.status || previous.created_at !== task.created_at
  })

  return { nextTasks: sortedTasks, changed }
}

export function moveTask(
  tasks: Task[],
  taskId: string,
  destinationStatus: TaskStatus,
  destinationIndex: number,
) {
  const sourceTask = tasks.find((task) => task.id === taskId)
  if (!sourceTask) {
    return { nextTasks: tasks, changed: [] as Task[] }
  }

  const grouped = Object.fromEntries(
    STATUS_ORDER.map((status) => [status, tasksForStatus(tasks, status)]),
  ) as Record<TaskStatus, Task[]>

  const sourceList = grouped[sourceTask.status].filter((task) => task.id !== taskId)
  const movedTask: Task = { ...sourceTask, status: destinationStatus }
  const destinationBase =
    sourceTask.status === destinationStatus ? sourceList : grouped[destinationStatus]

  const clampedIndex = Math.max(0, Math.min(destinationIndex, destinationBase.length))
  const destinationList = [...destinationBase]
  destinationList.splice(clampedIndex, 0, movedTask)

  grouped[sourceTask.status] = sourceTask.status === destinationStatus ? destinationList : sourceList
  grouped[destinationStatus] = destinationList

  const flattened = STATUS_ORDER.flatMap((status) => grouped[status])
  return normalizeTaskOrder(flattened)
}
