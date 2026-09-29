import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const integer = new Intl.NumberFormat('pt-BR')
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 })

export const formatMoney = (value: number) => brl.format(value)
export const formatNumber = (value: number) => integer.format(value)
export const formatPercent = (fraction: number) => percent.format(fraction)

// timestamptz arrives from a handler as an ISO string.
export const formatDate = (iso: string) => format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR })
export const formatDateTime = (iso: string) => format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
export const formatMonth = (iso: string) => format(parseISO(iso), 'MMM/yy', { locale: ptBR })
