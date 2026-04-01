export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done'
export type TaskPriority = 'low' | 'normal' | 'high'

export type Task = {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  assignee_id: string | null
  user_id: string
  created_at: string
}

export type TeamMember = {
  id: string
  user_id: string
  name: string
  color: string
  avatar_emoji: string | null
  created_at: string
}

export type Label = {
  id: string
  user_id: string
  name: string
  color: string
  created_at: string
}

export type TaskAssignee = {
  task_id: string
  member_id: string
  user_id: string
  created_at: string
}

export type TaskLabel = {
  task_id: string
  label_id: string
  user_id: string
  created_at: string
}

export type TaskComment = {
  id: string
  task_id: string
  user_id: string
  body: string
  created_at: string
}

export type TaskActivity = {
  id: string
  task_id: string
  user_id: string
  message: string
  created_at: string
}

export type BoardData = {
  tasks: Task[]
  members: TeamMember[]
  labels: Label[]
  taskAssignees: TaskAssignee[]
  taskLabels: TaskLabel[]
  comments: TaskComment[]
  activity: TaskActivity[]
}

export type TaskDraft = {
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  dueDate: string
}
