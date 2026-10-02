/*
 * shadcn/ui (https://github.com/shadcn-ui/ui), MIT License, Copyright (c) 2023 shadcn.
 * Generated with shadcn 4.21.0, style "base-nova". The license text is in LICENSE-shadcn-ui.txt.
 */
import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
