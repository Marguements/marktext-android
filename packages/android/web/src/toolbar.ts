import { isSourceMode, muya } from './editor'
import { icon } from './icons'
import { $, openSheet } from './ui'

interface IToolbarItem {
  label: string
  icon?: string
  text?: string
  className?: string
  run: () => void
}

function dispatchTab(shiftKey: boolean): void {
  // Soft keyboards have no Tab key; Muya indents list items on a Tab keydown.
  muya.domNode.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Tab',
      code: 'Tab',
      shiftKey,
      bubbles: true,
      cancelable: true
    })
  )
}

function chooseHeading(): void {
  const options: Array<[string, string]> = [
    ['Paragraph', 'paragraph'],
    ['Heading 1', 'heading 1'],
    ['Heading 2', 'heading 2'],
    ['Heading 3', 'heading 3'],
    ['Heading 4', 'heading 4'],
    ['Heading 5', 'heading 5'],
    ['Heading 6', 'heading 6']
  ]
  openSheet(
    'Block type',
    options.map(([label, type]) => ({ label, run: () => muya.updateParagraph(type) }))
  )
}

function chooseInsert(): void {
  openSheet('Insert', [
    { label: 'Table (3 × 3)', run: () => muya.createTable({ rows: 3, columns: 3 }) },
    { label: 'Code block', run: () => muya.updateParagraph('pre') },
    { label: 'Math block', run: () => muya.updateParagraph('mathblock') },
    { label: 'Mermaid diagram', run: () => muya.updateParagraph('mermaid') },
    { label: 'HTML block', run: () => muya.updateParagraph('html') },
    { label: 'Front matter', run: () => muya.updateParagraph('front-matter') },
    { label: 'Horizontal rule', run: () => muya.updateParagraph('hr') },
    { label: 'Image', run: () => muya.format('image') }
  ])
}

const TOOLBAR: IToolbarItem[] = [
  { label: 'Block type', text: 'H', className: 'tool-heading', run: chooseHeading },
  { label: 'Bold', text: 'B', className: 'tool-bold', run: () => muya.format('strong') },
  { label: 'Italic', text: 'I', className: 'tool-italic', run: () => muya.format('em') },
  { label: 'Strikethrough', text: 'S', className: 'tool-strike', run: () => muya.format('del') },
  { label: 'Highlight', text: '==', className: 'tool-mark', run: () => muya.format('mark') },
  {
    label: 'Inline code',
    text: '`',
    className: 'tool-code',
    run: () => muya.format('inline_code')
  },
  { label: 'Link', icon: 'link', run: () => muya.format('link') },
  { label: 'Bulleted list', icon: 'list-bullet', run: () => muya.updateParagraph('ul-bullet') },
  { label: 'Numbered list', icon: 'list-number', run: () => muya.updateParagraph('ol-order') },
  { label: 'Task list', icon: 'list-task', run: () => muya.updateParagraph('ul-task') },
  { label: 'Outdent', icon: 'outdent', run: () => dispatchTab(true) },
  { label: 'Indent', icon: 'indent', run: () => dispatchTab(false) },
  { label: 'Quote', icon: 'quote', run: () => muya.updateParagraph('blockquote') },
  { label: 'Code block', icon: 'code-block', run: () => muya.updateParagraph('pre') },
  { label: 'Inline math', icon: 'math', run: () => muya.format('inline_math') },
  { label: 'Table', icon: 'table', run: () => muya.createTable({ rows: 3, columns: 3 }) },
  { label: 'Insert…', text: '+', className: 'tool-insert', run: chooseInsert }
]

export function buildToolbar(): void {
  const bar = $('#toolbar')
  for (const item of TOOLBAR) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'tool-btn'
    btn.setAttribute('aria-label', item.label)
    btn.title = item.label
    if (item.icon) btn.innerHTML = icon(item.icon)
    else {
      btn.textContent = item.text ?? ''
      if (item.className) btn.classList.add(item.className)
    }
    btn.addEventListener('click', () => {
      if (!isSourceMode()) item.run()
    })
    bar.appendChild(btn)
  }
}
