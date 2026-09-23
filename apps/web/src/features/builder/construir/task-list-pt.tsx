import { useState } from 'react'
import type { ComponentProps, ReactNode, Ref } from 'react'
import { ChevronRight, ListChecks } from 'lucide-react'
import {
  TaskListContainer, TaskListHeader, TaskListProgress, TaskListStatusIcon, type TaskListItem,
} from '@mastra/playground-ui/components/ai/task-list'
import { Collapsible, CollapsibleContent } from '@mastra/playground-ui/components/Collapsible'
import { ScrollArea } from '@mastra/playground-ui/components/ScrollArea'
import { builderCopy } from './builder-copy'

const copy = builderCopy.taskList
const textClasses: Record<TaskListItem['status'], string> = {
  completed: 'text-neutral4 line-through',
  in_progress: 'font-medium text-warning1',
  pending: 'text-neutral5',
}
const taskLabel = (task: TaskListItem): string => task.status === 'in_progress' ? task.activeForm : task.content
const scrollTaskIntoView = (node: HTMLLIElement | null) => { if (typeof node?.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest' }) }

const TaskListPtSummary = ({ task }: { task: TaskListItem }) => <span className="flex min-w-0 flex-1 items-center gap-2">
  <TaskListStatusIcon status={task.status} aria-label={copy.status[task.status]} className="pt-0" />
  <span className={`truncate text-ui-sm leading-ui-sm ${textClasses[task.status]}`}>{taskLabel(task)}</span>
</span>

const TaskListPtTitle = ({ title }: { title: ReactNode }) => <span className="flex min-w-0 flex-1 items-center gap-2">
  <ListChecks className="text-accent6 size-4 shrink-0" />
  <span className="text-ui-sm leading-ui-sm text-neutral6 truncate font-medium">{title}</span>
</span>

// TaskListRow's own children are hardcoded past its ...props spread and it has no aria-label prop
// for the status icon, so the row is reproduced here instead of reused.
const TaskListPtRow = ({ task, rowRef }: { task: TaskListItem; rowRef?: Ref<HTMLLIElement> | undefined }) => <li ref={rowRef} className="flex items-start gap-2 py-0.5">
  <TaskListStatusIcon status={task.status} aria-label={copy.status[task.status]} className="pt-0.5" />
  <span className={`text-ui-sm leading-ui-sm ${textClasses[task.status]}`}>{taskLabel(task)}</span>
</li>

export interface TaskListPtProps extends Omit<ComponentProps<typeof TaskListContainer>, 'children' | 'title'> {
  tasks: TaskListItem[]
  title?: ReactNode
  hideWhenEmpty?: boolean
  hideWhenComplete?: boolean
  scrollActiveIntoView?: boolean
  defaultOpen?: boolean
}

/**
 * pt-BR drop-in for playground-ui's TaskList (see builder-copy.ts for why).
 */
export function TaskListPt({
  tasks, title = 'Tarefas', hideWhenEmpty = true, hideWhenComplete = true, scrollActiveIntoView = true, defaultOpen = true, ...props
}: TaskListPtProps) {
  const [open, setOpen] = useState(defaultOpen)
  const activeTask = tasks.find((task) => task.status === 'in_progress')
  const summaryTask = activeTask ?? tasks.find((task) => task.status === 'pending')
  const completed = tasks.filter((task) => task.status === 'completed').length
  const total = tasks.length
  if ((hideWhenEmpty && total === 0) || (hideWhenComplete && total > 0 && completed === total)) return null
  return <TaskListContainer aria-label={copy.listLabel} data-testid="task-list" {...props}>
    <Collapsible open={open} onOpenChange={setOpen}>
      <TaskListHeader>
        <ChevronRight className="size-3.5 shrink-0" />
        {open || !summaryTask ? <TaskListPtTitle title={title} /> : <TaskListPtSummary task={summaryTask} />}
        <TaskListProgress tasks={tasks} aria-label={copy.progressLabel} />
      </TaskListHeader>
      <CollapsibleContent>
        <ScrollArea maxHeight="8rem" viewPortClassName="pr-1" className="mt-1">
          <ul className="space-y-1">
            {tasks.map((task) => <TaskListPtRow key={task.id} task={task} rowRef={scrollActiveIntoView && task.id === activeTask?.id ? scrollTaskIntoView : undefined} />)}
          </ul>
        </ScrollArea>
      </CollapsibleContent>
    </Collapsible>
  </TaskListContainer>
}
