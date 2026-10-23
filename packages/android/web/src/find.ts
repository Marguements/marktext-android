import { isSourceMode, muya, setSourceMode } from './editor'
import { $ } from './ui'

const findInput = (): HTMLInputElement => $<HTMLInputElement>('#find-input')

function searchOptions() {
  return {
    isCaseSensitive: $<HTMLInputElement>('#find-case').checked,
    isWholeWord: $<HTMLInputElement>('#find-word').checked,
    isRegexp: $<HTMLInputElement>('#find-regexp').checked
  }
}

function showMatches(result: { matches: unknown[]; index: number }): void {
  const count = result.matches.length
  $('#find-count').textContent = findInput().value
    ? count
      ? `${result.index + 1}/${count}`
      : '0/0'
    : ''
  requestAnimationFrame(() =>
    document.querySelector('.mu-highlight')?.scrollIntoView({ block: 'center' })
  )
}

function runSearch(): void {
  if (isSourceMode()) setSourceMode(false)
  showMatches(muya.search(findInput().value, { ...searchOptions(), highlightIndex: 0 }))
}

export function isFindOpen(): boolean {
  return !$('#findbar').hidden
}

export function openFind(): void {
  if (isSourceMode()) setSourceMode(false)
  $('#findbar').hidden = false
  const input = findInput()
  input.focus()
  input.select()
  if (input.value) runSearch()
}

export function closeFind(): void {
  $('#findbar').hidden = true
  muya.search('')
  $('#find-count').textContent = ''
}

export function initFind(): void {
  const input = findInput()
  const replaceInput = $<HTMLInputElement>('#replace-input')
  input.addEventListener('input', runSearch)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      showMatches(muya.find(e.shiftKey ? 'previous' : 'next'))
    }
  })
  for (const id of ['#find-case', '#find-word', '#find-regexp']) { $(id).addEventListener('change', runSearch) }
  $('#find-prev').addEventListener('click', () => showMatches(muya.find('previous')))
  $('#find-next').addEventListener('click', () => showMatches(muya.find('next')))
  $('#find-close').addEventListener('click', closeFind)
  $('#replace-one').addEventListener('click', () =>
    showMatches(muya.replace(replaceInput.value, { ...searchOptions(), isSingle: true }))
  )
  $('#replace-all').addEventListener('click', () =>
    showMatches(muya.replace(replaceInput.value, { ...searchOptions(), isSingle: false }))
  )
}
