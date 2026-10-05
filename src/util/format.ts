export function formatNumber(value: number): string {
  const suffixes = ['', 'K', 'M', 'B', 'T']
  let number = Math.abs(value)
  let index = 0

  if (number === 0) return '0'
  if (number < 0.01) return '< 0.01'

  while (number >= 1000 && index < suffixes.length - 1) {
    number /= 1000
    index++
  }

  return number.toFixed(2) + suffixes[index]
}

export function addCommas(value: number): string {
  const parts = value.toString().split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts.join('.')
}

export function formatUUIDWithDashes(uuid: string): string {
  const clean = uuid.replace(/-/g, '')
  if (clean.length !== 32) return uuid
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`
}
