import { supabase } from '../lib/supabaseClient'
import type {
  BoardData,
  Label,
  TaskActivity,
  TaskAssignee,
  TaskComment,
  TaskLabel,
  TeamMember,
} from '../types'
import { getCurrentUserId, listTasks } from './tasks'

const EMPTY_BOARD_DATA: Omit<BoardData, 'tasks'> = {
  members: [],
  labels: [],
  taskAssignees: [],
  taskLabels: [],
  comments: [],
  activity: [],
}

export async function loadBoardData(): Promise<BoardData> {
  const userId = await getCurrentUserId()
  const [tasks, members, labels, taskAssignees, taskLabels, comments, activity] = await Promise.all([
    listTasks(),
    safeSelect<TeamMember>('team_members', userId),
    safeSelect<Label>('labels', userId),
    safeSelect<TaskAssignee>('task_assignees', userId),
    safeSelect<TaskLabel>('task_labels', userId),
    safeSelect<TaskComment>('task_comments', userId),
    safeSelect<TaskActivity>('task_activity', userId),
  ])

  return {
    tasks,
    members,
    labels,
    taskAssignees,
    taskLabels,
    comments,
    activity,
  }
}

export async function createTeamMember(input: {
  name: string
  color: string
  avatarEmoji?: string | null
}) {
  const userId = await getCurrentUserId()
  const payload = {
    user_id: userId,
    name: input.name,
    color: input.color,
    avatar_emoji: input.avatarEmoji?.trim() || null,
  }

  const { data, error } = await supabase.from('team_members').insert([payload]).select().single()
  if (error) {
    throw asAdvancedError(error)
  }
  return data as TeamMember
}

export async function createLabel(input: { name: string; color: string }) {
  const userId = await getCurrentUserId()
  const payload = {
    user_id: userId,
    name: input.name,
    color: input.color,
  }

  const { data, error } = await supabase.from('labels').insert([payload]).select().single()
  if (error) {
    throw asAdvancedError(error)
  }
  return data as Label
}

export async function replaceTaskAssignees(taskId: string, memberIds: string[]) {
  const userId = await getCurrentUserId()
  const nextIds = Array.from(new Set(memberIds))

  const deleteQuery = supabase.from('task_assignees').delete().eq('task_id', taskId)
  const { error: deleteError } = await deleteQuery
  if (deleteError) {
    throw asAdvancedError(deleteError)
  }

  if (nextIds.length === 0) {
    return [] as TaskAssignee[]
  }

  const { data, error } = await supabase
    .from('task_assignees')
    .insert(nextIds.map((memberId) => ({ task_id: taskId, member_id: memberId, user_id: userId })))
    .select()

  if (error) {
    throw asAdvancedError(error)
  }

  return (data ?? []) as TaskAssignee[]
}

export async function replaceTaskLabels(taskId: string, labelIds: string[]) {
  const userId = await getCurrentUserId()
  const nextIds = Array.from(new Set(labelIds))

  const { error: deleteError } = await supabase.from('task_labels').delete().eq('task_id', taskId)
  if (deleteError) {
    throw asAdvancedError(deleteError)
  }

  if (nextIds.length === 0) {
    return [] as TaskLabel[]
  }

  const { data, error } = await supabase
    .from('task_labels')
    .insert(nextIds.map((labelId) => ({ task_id: taskId, label_id: labelId, user_id: userId })))
    .select()

  if (error) {
    throw asAdvancedError(error)
  }

  return (data ?? []) as TaskLabel[]
}

export async function addTaskComment(taskId: string, body: string) {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('task_comments')
    .insert([{ task_id: taskId, user_id: userId, body }])
    .select()
    .single()

  if (error) {
    throw asAdvancedError(error)
  }

  return data as TaskComment
}

export async function addTaskActivity(taskId: string, message: string) {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('task_activity')
    .insert([{ task_id: taskId, user_id: userId, message }])
    .select()
    .single()

  if (error) {
    throw asAdvancedError(error)
  }

  return data as TaskActivity
}

async function safeSelect<T>(table: string, userId: string): Promise<T[]> {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) {
    if (isMissingAdvancedTable(error)) {
      return []
    }
    throw error
  }

  return (data ?? []) as T[]
}

function isMissingAdvancedTable(error: { code?: string; message?: string }) {
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    error.message?.toLowerCase().includes('could not find the table') ||
    (error.message?.toLowerCase().includes('relation') &&
      error.message?.toLowerCase().includes('does not exist'))
  )
}

function asAdvancedError(error: { message?: string; code?: string }) {
  if (isMissingAdvancedTable(error)) {
    return new Error(
      'Advanced board tables are missing in Supabase. Run the SQL in supabase/advanced_features.sql and reload the app.',
    )
  }
  return error instanceof Error ? error : new Error(error.message ?? 'Unable to save advanced board data.')
}

export { EMPTY_BOARD_DATA }
