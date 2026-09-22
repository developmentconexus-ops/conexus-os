import { Button } from '@mastra/playground-ui/components/Button'
import { Skeleton } from '@mastra/playground-ui/components/Skeleton'
import { Tree } from '@mastra/playground-ui/components/Tree'
import { useQuery } from '@tanstack/react-query'
import { FileText, Folder } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { getProjectSourceFile, listProjectSourceTree, type SourceTree } from '../api'

const CodeView = lazy(() => import('./code-surfaces').then((module) => ({ default: module.CodeView })))

type Node = Readonly<{ name: string; path: string; children: Node[] | null }>

// The Hub lists a revision as flat paths with their kind; the tree nests them once, folders first.
const nest = (entries: SourceTree['entries']): Node[] => {
  const root: Node[] = []
  const folders = new Map<string, Node[]>([['', root]])
  for (const entry of entries) {
    const slash = entry.path.lastIndexOf('/')
    const parent = folders.get(slash === -1 ? '' : entry.path.slice(0, slash))
    if (!parent) continue
    const node: Node = { name: entry.path.slice(slash + 1), path: entry.path, children: entry.kind === 'DIRECTORY' ? [] : null }
    if (node.children) folders.set(entry.path, node.children)
    parent.push(node)
  }
  const order = (nodes: Node[]): Node[] => nodes
    .sort((left, right) => Number(right.children !== null) - Number(left.children !== null) || left.name.localeCompare(right.name))
    .map((node) => node.children ? { ...node, children: order(node.children) } : node)
  return order(root)
}

function Branch({ nodes, open }: Readonly<{ nodes: readonly Node[]; open: ReadonlySet<string> }>) {
  return <>{nodes.map((node) => node.children
    ? <Tree.Folder key={node.path} defaultOpen={open.has(node.path)}>
      <Tree.FolderTrigger><Tree.Icon><Folder size={14} /></Tree.Icon><Tree.Label>{node.name}</Tree.Label></Tree.FolderTrigger>
      <Tree.FolderContent><Branch nodes={node.children} open={open} /></Tree.FolderContent>
    </Tree.Folder>
    : <Tree.File key={node.path} id={node.path}><Tree.Icon><FileText size={14} /></Tree.Icon><Tree.Label>{node.name}</Tree.Label></Tree.File>)}</>
}

const ancestors = (path: string): Set<string> => new Set(path.split('/').slice(0, -1).map((_, index, parts) => parts.slice(0, index + 1).join('/')))

export function LensCode({ projectId, sourceRevision }: Readonly<{ projectId: string; sourceRevision: string | null }>) {
  const [chosenPath, setChosenPath] = useState<string | null>(null)
  const tree = useQuery({
    queryKey: ['builder-source-tree', projectId, sourceRevision],
    queryFn: () => listProjectSourceTree(projectId, sourceRevision ?? ''),
    enabled: Boolean(sourceRevision),
  })
  const files = tree.data?.entries.filter((entry) => entry.kind === 'FILE') ?? []
  const path = files.some((entry) => entry.path === chosenPath) ? chosenPath : files.at(0)?.path ?? null
  const file = useQuery({
    queryKey: ['builder-source-file', projectId, sourceRevision, path],
    queryFn: () => getProjectSourceFile(projectId, sourceRevision ?? '', path ?? ''),
    enabled: Boolean(sourceRevision && path),
  })

  if (!sourceRevision) return <p className="cx-lens-empty">O Project ainda não tem código. Ele aparece aqui depois da primeira alteração.</p>
  if (tree.isPending) return <div className="cx-lens-split"><Skeleton className="cx-skeleton" /><Skeleton className="cx-skeleton" /></div>
  if (tree.isError) return <div className="cx-note" role="alert"><p>Não foi possível ler os arquivos do Project.</p><Button size="sm" onClick={() => void tree.refetch()}>Tentar novamente</Button></div>
  if (!files.length) return <p className="cx-lens-empty">Esta versão não tem arquivos.</p>

  return <div className="cx-lens-split">
    <nav className="cx-files" aria-label="Arquivos do Project">
      <Tree {...(path ? { selectedId: path } : {})} onSelect={setChosenPath}>
        <Branch nodes={nest(tree.data.entries)} open={ancestors(path ?? '')} />
      </Tree>
    </nav>
    <section className="cx-file" aria-label={path ?? 'Arquivo'}>
      <header className="cx-file-head"><code>{path}</code><span className="cx-revision">versão {sourceRevision.slice(0, 7)}</span></header>
      {file.isPending && <Skeleton className="cx-skeleton" />}
      {file.isError && <div className="cx-note" role="alert"><p>Não foi possível ler este arquivo.</p><Button size="sm" onClick={() => void file.refetch()}>Tentar novamente</Button></div>}
      {file.data && path && <Suspense fallback={<Skeleton className="cx-skeleton" />}><CodeView path={path} content={file.data.content} /></Suspense>}
    </section>
  </div>
}
