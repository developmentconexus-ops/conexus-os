import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const integer = new Intl.NumberFormat('pt-BR')
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 })

// A decimal arrives as text ("1234.50") so that no sum loses precision. Converting it to a number
// only to print it is safe; adding such numbers is not.
export const formatMoney = (value: number | string) => brl.format(Number(value))
export const formatNumber = (value: number | string) => integer.format(Number(value))
export const formatPercent = (fraction: number | string) => percent.format(Number(fraction))

// A date arrives as ISO text: a Postgres timestamptz, or a date the handler's query formatted.
export const formatDate = (iso: string) => format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR })
export const formatDateTime = (iso: string) => format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
export const formatMonth = (iso: string) => format(parseISO(iso), 'MMM/yy', { locale: ptBR })
