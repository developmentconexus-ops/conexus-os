import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'

export function Home() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>Este app ainda está vazio</EmptyTitle>
        <EmptyDescription>Peça no chat o que este app deve fazer e as telas aparecem aqui.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
