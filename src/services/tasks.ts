import { ensureGuestSession } from '../auth/guestAuth'
import { supabase } from '../lib/supabaseClient'
import type { Task, TaskDraft, TaskPriority, TaskStatus } from '../types'

type TaskUpdate = Partial<{
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  dueDate: string | null
  createdAt: string
}>

export async function getCurrentUserId() {
  await ensureGuestSession()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    throw error
  }

  if (!user) {
    throw new Error('No Supabase user is available for this session.')
  }

  return user.id
}

export async function listTasks() {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []) as Task[]
}

export async function createTask(task: TaskDraft) {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('tasks')
    .insert([
      {
        title: task.title,
        description: task.description || null,
        status: task.status,
        priority: task.priority,
        due_date: task.dueDate || null,
        user_id: userId,
      },
    ])
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as Task
}

export async function updateTask(id: string, updates: TaskUpdate) {
  const payload: Record<string, string | null> = {}
  if (updates.title !== undefined) payload.title = updates.title
  if (updates.description !== undefined) payload.description = updates.description || null
  if (updates.status !== undefined) payload.status = updates.status
  if (updates.priority !== undefined) payload.priority = updates.priority
  if (updates.dueDate !== undefined) payload.due_date = updates.dueDate
  if (updates.createdAt !== undefined) payload.created_at = updates.createdAt

  const { data, error } = await supabase.from('tasks').update(payload).eq('id', id).select().single()

  if (error) {
    throw error
  }

  return data as Task
}

export async function deleteTask(id: string) {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) {
    throw error
  }
}

export async function reorderTasks(updates: Array<{ id: string; status: TaskStatus; createdAt: string }>) {
  await Promise.all(
    updates.map((task) =>
      supabase
        .from('tasks')
        .update({ status: task.status, created_at: task.createdAt })
        .eq('id', task.id),
    ),
  )
}
