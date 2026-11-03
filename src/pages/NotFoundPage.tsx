import { Link } from '../router'
import { EmptyState } from '../components/ui'

export function NotFoundPage() {
  return (
    <EmptyState title="Halaman tidak ditemukan">
      <Link to="/" className="font-semibold text-indigo-600 dark:text-indigo-400">
        Kembali ke beranda
      </Link>
    </EmptyState>
  )
}
