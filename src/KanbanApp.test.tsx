import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import KanbanAdvancedApp from './KanbanAdvancedApp'

const mocks = vi.hoisted(() => ({
  ensureGuestSession: vi.fn(async () => {}),
  loadBoardData: vi.fn(async () => ({
    tasks: [],
    members: [],
    labels: [],
    taskAssignees: [],
    taskLabels: [],
    comments: [],
    activity: [],
  })),
  createTask: vi.fn(async (draft) => ({
    id: 'new-task',
    title: draft.title,
    description: draft.description || null,
    status: draft.status,
    priority: draft.priority,
    due_date: draft.dueDate || null,
    assignee_id: null,
    user_id: 'guest-1',
    created_at: '2026-04-01T00:00:00.000Z',
  })),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  reorderTasks: vi.fn(async () => {}),
  addTaskActivity: vi.fn(async () => ({ id: 'a1', task_id: 'new-task', user_id: 'guest-1', message: 'Created', created_at: '2026-04-01T00:00:00.000Z' })),
  addTaskComment: vi.fn(),
  createLabel: vi.fn(),
  createTeamMember: vi.fn(),
  replaceTaskAssignees: vi.fn(async () => []),
  replaceTaskLabels: vi.fn(async () => []),
}))

vi.mock('./auth/guestAuth', () => ({
  ensureGuestSession: mocks.ensureGuestSession,
}))

vi.mock('./services/tasks', () => ({
  createTask: mocks.createTask,
  updateTask: mocks.updateTask,
  deleteTask: mocks.deleteTask,
  reorderTasks: mocks.reorderTasks,
}))

vi.mock('./services/boardData', () => ({
  EMPTY_BOARD_DATA: {
    members: [],
    labels: [],
    taskAssignees: [],
    taskLabels: [],
    comments: [],
    activity: [],
  },
  loadBoardData: mocks.loadBoardData,
  addTaskActivity: mocks.addTaskActivity,
  addTaskComment: mocks.addTaskComment,
  createLabel: mocks.createLabel,
  createTeamMember: mocks.createTeamMember,
  replaceTaskAssignees: mocks.replaceTaskAssignees,
  replaceTaskLabels: mocks.replaceTaskLabels,
}))

describe('KanbanAdvancedApp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.loadBoardData.mockResolvedValue({
      tasks: [],
      members: [],
      labels: [],
      taskAssignees: [],
      taskLabels: [],
      comments: [],
      activity: [],
    })
    mocks.createTask.mockImplementation(async (draft) => ({
      id: 'new-task',
      title: draft.title,
      description: draft.description || null,
      status: draft.status,
      priority: draft.priority,
      due_date: draft.dueDate || null,
      assignee_id: null,
      user_id: 'guest-1',
      created_at: '2026-04-01T00:00:00.000Z',
    }))
  })

  it('sends the selected high priority when creating a note', async () => {
    const user = userEvent.setup()
    render(<KanbanAdvancedApp />)

    await waitFor(() => expect(mocks.loadBoardData).toHaveBeenCalled())

    await user.click(screen.getByRole('button', { name: /add post-it/i }))
    const dialog = screen.getByText(/create sticky note/i).closest('section')
    if (!dialog) throw new Error('Expected create dialog to be open')

    await user.type(within(dialog).getByRole('textbox', { name: /title/i }), 'Important note')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /priority/i }), 'high')
    await user.click(within(dialog).getByRole('button', { name: /create note/i }))

    await waitFor(() =>
      expect(mocks.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Important note',
          priority: 'high',
        }),
      ),
    )
  })
})
