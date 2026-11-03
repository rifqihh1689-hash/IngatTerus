import { Fragment, useMemo, type ReactNode } from 'react'
import { parseRich, type RichNode } from '../lib/richtext'
import { cx } from './ui'

function render(nodes: RichNode[], keyPrefix = ''): ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyPrefix}${i}`
    switch (n.type) {
      case 'text':
        return <Fragment key={key}>{n.value}</Fragment>
      case 'br':
        return <br key={key} />
      case 'bold':
        return <strong key={key} className="font-bold">{render(n.children, `${key}-`)}</strong>
      case 'italic':
        return <em key={key}>{render(n.children, `${key}-`)}</em>
      case 'sup':
        return <sup key={key}>{render(n.children, `${key}-`)}</sup>
      case 'sub':
        return <sub key={key}>{render(n.children, `${key}-`)}</sub>
      case 'code':
        return <code key={key}>{render(n.children, `${key}-`)}</code>
    }
  })
}

/** Tampilkan teks kartu berformat (aman: tidak pernah menyisipkan HTML mentah). */
export function RichText({ text, className }: { text: string; className?: string }) {
  const nodes = useMemo(() => parseRich(text), [text])
  return <span className={cx('rich break-words', className)}>{render(nodes)}</span>
}

export function CardFace({
  text,
  image,
  className,
  imageClassName,
}: {
  text: string
  image?: string
  className?: string
  imageClassName?: string
}) {
  return (
    <div className={cx('flex flex-col items-center gap-3', className)}>
      {image && (
        <img
          src={image}
          alt=""
          className={cx('max-h-56 w-auto max-w-full rounded-xl object-contain', imageClassName)}
          loading="lazy"
        />
      )}
      {text && <RichText text={text} />}
    </div>
  )
}
