export function PageHeader({ title, lead }: Readonly<{ title: string; lead?: string }>) {
  return <div className="cxs-page-header">
    <h1>{title}</h1>
    {lead && <p>{lead}</p>}
  </div>
}
