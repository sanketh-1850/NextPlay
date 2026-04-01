import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTask, deleteTask, listTasks, reorderTasks, updateTask } from './tasks'

const mocks = vi.hoisted(() => {
  const chain: {
    select: ReturnType<typeof vi.fn>
    eq: ReturnType<typeof vi.fn>
    order: ReturnType<typeof vi.fn>
    insert: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
    single: ReturnType<typeof vi.fn>
  } = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    single: vi.fn(),
  }

  chain.select.mockImplementation(() => chain)
  chain.eq.mockImplementation(() => chain)
  chain.insert.mockImplementation(() => chain)
  chain.update.mockImplementation(() => chain)
  chain.delete.mockImplementation(() => chain)

  return {
    authMock: vi.fn(async () => {}),
    getUserMock: vi.fn(async () => ({ data: { user: { id: 'guest-1' } }, error: null })),
    chain,
  }
})

vi.mock('../auth/guestAuth', () => ({
  ensureGuestSession: mocks.authMock,
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: mocks.getUserMock,
    },
    from: vi.fn(() => mocks.chain),
  },
}))

describe('task service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.chain.order.mockResolvedValue({ data: [], error: null })
    mocks.chain.single.mockResolvedValue({ data: { id: '1' }, error: null })
  })

  it('lists tasks for the current guest user ordered by created_at', async () => {
    await listTasks()
    expect(mocks.authMock).toHaveBeenCalled()
    expect(mocks.chain.eq).toHaveBeenCalledWith('user_id', 'guest-1')
    expect(mocks.chain.order).toHaveBeenCalledWith('created_at', { ascending: true })
  })

  it('creates and updates tasks with Supabase field names', async () => {
    await createTask({
      title: 'Task',
      description: 'Desc',
      status: 'todo',
      priority: 'normal',
      dueDate: '2026-04-02',
    })
    await updateTask('1', { dueDate: null, status: 'done', createdAt: '2026-04-01T00:00:00.000Z' })
    await deleteTask('1')

    expect(mocks.chain.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        title: 'Task',
        description: 'Desc',
        status: 'todo',
        priority: 'normal',
        due_date: '2026-04-02',
        user_id: 'guest-1',
      }),
    ])

    expect(mocks.chain.update).toHaveBeenCalledWith({
      status: 'done',
      due_date: null,
      created_at: '2026-04-01T00:00:00.000Z',
    })

    expect(mocks.chain.delete).toHaveBeenCalled()
  })

  it('reorders multiple tasks by updating status and created_at', async () => {
    await reorderTasks([
      { id: '1', status: 'todo', createdAt: '2026-04-01T00:00:00.000Z' },
      { id: '2', status: 'in_progress', createdAt: '2026-04-01T00:01:00.000Z' },
    ])

    expect(mocks.chain.update).toHaveBeenCalledWith({
      status: 'todo',
      created_at: '2026-04-01T00:00:00.000Z',
    })
    expect(mocks.chain.eq).toHaveBeenCalledWith('id', '2')
  })
})
