'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

/* -----------------------------------------------------------------------------
 * DataTable Types
 * -------------------------------------------------------------------------- */

export interface DataTableColumn<T> {
  id: string;
  header: string | React.ReactNode;
  cell?: (row: T) => React.ReactNode;
  accessorKey?: keyof T;
  className?: string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  className?: string;
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}

/* -----------------------------------------------------------------------------
 * DataTable Component
 * -------------------------------------------------------------------------- */

export function DataTable<T extends { id?: string | number }>({
  data,
  columns,
  className,
  loading = false,
  emptyMessage = 'No data available',
  onRowClick,
}: DataTableProps<T>) {
  const getCellValue = (row: T, column: DataTableColumn<T>) => {
    if (column.cell) {
      return column.cell(row);
    }
    if (column.accessorKey) {
      return String(row[column.accessorKey] ?? '');
    }
    return null;
  };

  if (loading) {
    return (
      <div className={cn('rounded-lg border border-neutral-200 dark:border-neutral-800', className)}>
        <div className="animate-pulse p-4 space-y-3">
          <div className="h-8 bg-neutral-100 dark:bg-neutral-800 rounded" />
          <div className="h-8 bg-neutral-100 dark:bg-neutral-800 rounded" />
          <div className="h-8 bg-neutral-100 dark:bg-neutral-800 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800', className)}>
      <table className="w-full">
        <thead className="bg-neutral-50 dark:bg-neutral-800/50">
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                className={cn(
                  'px-4 py-3 text-left text-sm font-medium text-neutral-500 dark:text-neutral-400',
                  column.className
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, index) => (
              <tr
                key={row.id ?? index}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  'bg-white dark:bg-neutral-900',
                  onRowClick && 'cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50',
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={cn(
                      'px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100',
                      column.className
                    )}
                  >
                    {getCellValue(row, column)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
