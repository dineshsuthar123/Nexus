'use client';

import * as React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

/* -----------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------- */

export type SortDirection = 'asc' | 'desc' | null;

export interface Column<T> {
  /** Unique column key */
  key: string;
  /** Column header text */
  header: string;
  /** Column width (px or flex) */
  width?: number | string;
  /** Min width */
  minWidth?: number;
  /** Max width */
  maxWidth?: number;
  /** Whether column is sortable */
  sortable?: boolean;
  /** Whether column is resizable */
  resizable?: boolean;
  /** Custom cell renderer */
  cell?: (row: T, index: number) => React.ReactNode;
  /** Custom header renderer */
  headerCell?: () => React.ReactNode;
  /** Accessor function or key path */
  accessor?: keyof T | ((row: T) => unknown);
  /** Alignment */
  align?: 'left' | 'center' | 'right';
  /** Frozen column (left or right) */
  frozen?: 'left' | 'right';
  /** Column class */
  className?: string;
}

export interface DataGridProps<T> {
  /** Data rows */
  data: T[];
  /** Column definitions */
  columns: Column<T>[];
  /** Row height in pixels */
  rowHeight?: number;
  /** Header height in pixels */
  headerHeight?: number;
  /** Height of the grid */
  height?: number | string;
  /** Loading state */
  loading?: boolean;
  /** Empty state content */
  emptyContent?: React.ReactNode;
  /** Row key accessor */
  getRowKey?: (row: T, index: number) => string | number;
  /** On row click */
  onRowClick?: (row: T, index: number) => void;
  /** Selected row keys */
  selectedKeys?: Set<string | number>;
  /** On selection change */
  onSelectionChange?: (keys: Set<string | number>) => void;
  /** Sort state */
  sortColumn?: string;
  sortDirection?: SortDirection;
  /** On sort change */
  onSortChange?: (column: string, direction: SortDirection) => void;
  /** Striped rows */
  striped?: boolean;
  /** Hover effect */
  hoverable?: boolean;
  /** Border between rows */
  bordered?: boolean;
  /** Sticky header */
  stickyHeader?: boolean;
  /** Additional class */
  className?: string;
  /** Overscan count for virtualization */
  overscan?: number;
}

/* -----------------------------------------------------------------------------
 * DataGrid Component
 * -------------------------------------------------------------------------- */

function DataGridInner<T>(
  {
    data,
    columns,
    rowHeight = 48,
    headerHeight = 44,
    height = 400,
    loading = false,
    emptyContent,
    getRowKey,
    onRowClick,
    selectedKeys,
    onSelectionChange,
    sortColumn,
    sortDirection,
    onSortChange,
    striped = false,
    hoverable = true,
    bordered = true,
    stickyHeader = true,
    className,
    overscan = 5,
  }: DataGridProps<T>,
  ref: React.Ref<HTMLDivElement>
) {
  const parentRef = React.useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();

  const getCellValue = (row: T, column: Column<T>): React.ReactNode => {
    if (column.cell) {
      return column.cell(row, 0);
    }
    if (column.accessor) {
      if (typeof column.accessor === 'function') {
        const value = column.accessor(row);
        return value != null ? String(value) : '';
      }
      const value = row[column.accessor];
      return value != null ? String(value) : '';
    }
    const value = (row as Record<string, unknown>)[column.key];
    return value != null ? String(value) : '';
  };

  const handleSort = (column: Column<T>) => {
    if (!column.sortable || !onSortChange) return;

    let newDirection: SortDirection = 'asc';
    if (sortColumn === column.key) {
      if (sortDirection === 'asc') {
        newDirection = 'desc';
      } else if (sortDirection === 'desc') {
        newDirection = null;
      }
    }
    onSortChange(column.key, newDirection);
  };

  const getRowKeyFn = getRowKey || ((_, index) => index);

  const handleRowClick = (row: T, index: number) => {
    if (onRowClick) {
      onRowClick(row, index);
    }
    if (onSelectionChange) {
      const key = getRowKeyFn(row, index);
      const newKeys = new Set(selectedKeys);
      if (newKeys.has(key)) {
        newKeys.delete(key);
      } else {
        newKeys.add(key);
      }
      onSelectionChange(newKeys);
    }
  };

  const gridHeight = typeof height === 'number' ? height : undefined;
  const gridHeightStyle = typeof height === 'string' ? height : `${height}px`;

  return (
    <div
      ref={ref}
      className={cn(
        'relative overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900',
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex border-b border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800',
          stickyHeader && 'sticky top-0 z-10'
        )}
        style={{ height: headerHeight }}
      >
        {columns.map((column) => (
          <div
            key={column.key}
            className={cn(
              'flex items-center px-4 text-sm font-medium text-neutral-700 dark:text-neutral-300',
              column.sortable && 'cursor-pointer select-none hover:bg-neutral-100 dark:hover:bg-neutral-700',
              column.align === 'center' && 'justify-center',
              column.align === 'right' && 'justify-end',
              column.className
            )}
            style={{
              width: column.width || 'auto',
              minWidth: column.minWidth,
              maxWidth: column.maxWidth,
              flex: !column.width ? 1 : undefined,
            }}
            onClick={() => handleSort(column)}
            role={column.sortable ? 'button' : undefined}
            tabIndex={column.sortable ? 0 : undefined}
            aria-sort={
              sortColumn === column.key
                ? sortDirection === 'asc'
                  ? 'ascending'
                  : sortDirection === 'desc'
                  ? 'descending'
                  : undefined
                : undefined
            }
          >
            {column.headerCell ? column.headerCell() : column.header}
            {column.sortable && (
              <span className="ml-2">
                {sortColumn === column.key ? (
                  sortDirection === 'asc' ? (
                    <ArrowUp className="h-4 w-4" />
                  ) : sortDirection === 'desc' ? (
                    <ArrowDown className="h-4 w-4" />
                  ) : (
                    <ArrowUpDown className="h-4 w-4 opacity-50" />
                  )
                ) : (
                  <ArrowUpDown className="h-4 w-4 opacity-50" />
                )}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Virtualized Body */}
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ height: gridHeight ? gridHeight - headerHeight : `calc(${gridHeightStyle} - ${headerHeight}px)` }}
      >
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-neutral-500 dark:text-neutral-400">
            {emptyContent || 'No data available'}
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualRows.map((virtualRow) => {
              const row = data[virtualRow.index];
              const rowKey = getRowKeyFn(row, virtualRow.index);
              const isSelected = selectedKeys?.has(rowKey);

              return (
                <div
                  key={rowKey}
                  className={cn(
                    'absolute left-0 top-0 flex w-full',
                    bordered && 'border-b border-neutral-100 dark:border-neutral-800',
                    striped && virtualRow.index % 2 === 1 && 'bg-neutral-50/50 dark:bg-neutral-800/50',
                    hoverable && 'hover:bg-neutral-50 dark:hover:bg-neutral-800',
                    isSelected && 'bg-primary-50 dark:bg-primary-900/20',
                    onRowClick && 'cursor-pointer'
                  )}
                  style={{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  onClick={() => handleRowClick(row, virtualRow.index)}
                >
                  {columns.map((column) => (
                    <div
                      key={column.key}
                      className={cn(
                        'flex items-center overflow-hidden text-ellipsis whitespace-nowrap px-4 text-sm text-neutral-900 dark:text-neutral-100',
                        column.align === 'center' && 'justify-center',
                        column.align === 'right' && 'justify-end',
                        column.className
                      )}
                      style={{
                        width: column.width || 'auto',
                        minWidth: column.minWidth,
                        maxWidth: column.maxWidth,
                        flex: !column.width ? 1 : undefined,
                      }}
                    >
                      {getCellValue(row, column)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Forward ref with generics
const DataGrid = React.forwardRef(DataGridInner) as <T>(
  props: DataGridProps<T> & { ref?: React.Ref<HTMLDivElement> }
) => React.ReactElement;

/* -----------------------------------------------------------------------------
 * DataGrid Pagination
 * -------------------------------------------------------------------------- */

export interface DataGridPaginationProps {
  /** Current page (1-based) */
  page: number;
  /** Total number of pages */
  totalPages: number;
  /** Page size */
  pageSize: number;
  /** Total items count */
  totalItems: number;
  /** Page size options */
  pageSizeOptions?: number[];
  /** On page change */
  onPageChange: (page: number) => void;
  /** On page size change */
  onPageSizeChange?: (size: number) => void;
  /** Additional class */
  className?: string;
}

const DataGridPagination: React.FC<DataGridPaginationProps> = ({
  page,
  totalPages,
  pageSize,
  totalItems,
  pageSizeOptions = [10, 25, 50, 100],
  onPageChange,
  onPageSizeChange,
  className,
}) => {
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalItems);

  return (
    <div
      className={cn(
        'flex items-center justify-between border-t border-neutral-200 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900',
        className
      )}
    >
      <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
        <span>Rows per page:</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
          className="rounded border border-neutral-200 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm text-neutral-600 dark:text-neutral-400">
          {startItem}–{endItem} of {totalItems}
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="rounded p-1 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-neutral-800"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="rounded p-1 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-neutral-800"
            aria-label="Next page"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export { DataGrid, DataGridPagination };
