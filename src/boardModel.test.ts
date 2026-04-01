import { describe, expect, it } from 'vitest'
import { moveTask, normalizeTaskOrder, tasksForStatus } from './boardModel'
import type { Task } from './types'

const BASE_TASKS: Task[] = [
  {
    id: '1',
    title: 'A',
    description: null,
    status: 'todo',
    priority: 'low',
    due_date: null,
    assignee_id: null,
    user_id: 'u1',
    created_at: '2026-04-01T00:00:00.000Z',
  },
  {
    id: '2',
    title: 'B',
    description: null,
    status: 'todo',
    priority: 'high',
    due_date: null,
    assignee_id: null,
    user_id: 'u1',
    created_at: '2026-04-01T00:01:00.000Z',
  },
  {
    id: '3',
    title: 'C',
    description: null,
    status: 'in_progress',
    priority: 'normal',
    due_date: null,
    assignee_id: null,
    user_id: 'u1',
    created_at: '2026-04-01T00:02:00.000Z',
  },
]

describe('boardModel', () => {
  it('moves tasks across columns and reorders them', () => {
    const result = moveTask(BASE_TASKS, '2', 'in_progress', 0)
    const progress = tasksForStatus(result.nextTasks, 'in_progress')
    expect(progress.map((task) => task.id)).toEqual(['2', '3'])
    expect(result.changed.some((task) => task.id === '2' && task.status === 'in_progress')).toBe(true)
  })

  it('keeps columns ordered by priority after a move', () => {
    const result = moveTask(BASE_TASKS, '2', 'todo', 0)
    const todo = tasksForStatus(result.nextTasks, 'todo')
    expect(todo.map((task) => task.id)).toEqual(['2', '1'])
  })

  it('normalizes existing tasks so high priority appears before low priority', () => {
    const result = normalizeTaskOrder(BASE_TASKS)
    const todo = tasksForStatus(result.nextTasks, 'todo')
    expect(todo.map((task) => task.id)).toEqual(['2', '1'])
    expect(result.changed.some((task) => task.id === '2')).toBe(true)
  })
})
