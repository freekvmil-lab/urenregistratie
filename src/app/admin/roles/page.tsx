"use client"

import UserManagement from '@/components/UserManagement'

export default function RolesPage() {
  return (
    <main className="p-6">
      <nav className="flex gap-3 items-center mb-4">
        <div className="inline-flex gap-2 items-center bg-gray-100 dark:bg-gray-800 rounded px-2 py-1">
          <a href="/" className="text-sm text-gray-900 dark:text-white px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700">Home</a>
          <a href="/admin" className="text-sm text-gray-900 dark:text-white px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700">Admin</a>
          <a href="/admin/roles" className="text-sm font-semibold text-gray-900 dark:text-white px-2 py-1 rounded bg-gray-200 dark:bg-gray-700">Rolbeheer</a>
        </div>
      </nav>

      <h1 className="text-2xl font-bold mb-4">Rolbeheer</h1>
      <UserManagement />
    </main>
  )
}
