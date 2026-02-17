import * as React from 'react';
import { cn } from '../../lib/utils';
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

/**
 * Table Component
 *
 * An accessible table component with sorting, pagination, and responsive design.
 * Follows WCAG 2.1 AA guidelines for data tables.
 *
 * @example
 * <Table>
 *   <TableHeader>
 *     <TableRow>
 *       <TableHead sortable onSort={() => {}} sortDirection="asc">ID</TableHead>
 *       <TableHead>Amount</TableHead>
 *       <TableHead>Status</TableHead>
 *     </TableRow>
 *   </TableHeader>
 *   <TableBody>
 *     <TableRow>
 *       <TableCell>TXN-001</TableCell>
 *       <TableCell>$1,234.56</TableCell>
 *       <TableCell><Badge variant="success">Completed</Badge></TableCell>
 *     </TableRow>
 *   </TableBody>
 * </Table>
 */

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn('w-full caption-bottom text-sm', className)}
      {...props}
    />
  </div>
));
Table.displayName = 'Table';

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn('[&_tr]:border-b', className)}
    {...props}
  />
));
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn('[&_tr:last-child]:border-0', className)}
    {...props}
  />
));
TableBody.displayName = 'TableBody';

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
    {...props}
  />
));
TableFooter.displayName = 'TableFooter';

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      'border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
      className
    )}
    {...props}
  />
));
TableRow.displayName = 'TableRow';

export interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  /**
   * Whether this column is sortable
   */
  sortable?: boolean;
  /**
   * Current sort direction
   */
  sortDirection?: 'asc' | 'desc' | null;
  /**
   * Callback when sort is triggered
   */
  onSort?: () => void;
}

const TableHead = React.forwardRef<HTMLTableCellElement, TableHeadProps>(
  ({ className, sortable, sortDirection, onSort, children, ...props }, ref) => {
    const SortIcon =
      sortDirection === 'asc'
        ? ChevronUp
        : sortDirection === 'desc'
        ? ChevronDown
        : ChevronsUpDown;

    const content = sortable ? (
      <button
        type="button"
        onClick={onSort}
        className={cn(
          'flex items-center gap-1 hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'rounded px-1 -mx-1'
        )}
        aria-label={`Sort by ${children}${
          sortDirection === 'asc' ? ', currently ascending' : sortDirection === 'desc' ? ', currently descending' : ''
        }`}
      >
        {children}
        <SortIcon className="h-4 w-4" aria-hidden="true" />
      </button>
    ) : (
      children
    );

    return (
      <th
        ref={ref}
        scope="col"
        className={cn(
          'h-12 px-4 text-left align-middle font-medium text-muted-foreground',
          '[&:has([role=checkbox])]:pr-0',
          className
        )}
        aria-sort={
          sortDirection === 'asc'
            ? 'ascending'
            : sortDirection === 'desc'
            ? 'descending'
            : undefined
        }
        {...props}
      >
        {content}
      </th>
    );
  }
);
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      'p-4 align-middle [&:has([role=checkbox])]:pr-0',
      className
    )}
    {...props}
  />
));
TableCell.displayName = 'TableCell';

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn('mt-4 text-sm text-muted-foreground', className)}
    {...props}
  />
));
TableCaption.displayName = 'TableCaption';

// ============================================================================
// Table Pagination
// ============================================================================

export interface TablePaginationProps {
  /**
   * Current page number (1-indexed)
   */
  page: number;
  /**
   * Total number of pages
   */
  totalPages: number;
  /**
   * Total number of items
   */
  totalItems?: number;
  /**
   * Items per page
   */
  pageSize: number;
  /**
   * Callback when page changes
   */
  onPageChange: (page: number) => void;
  /**
   * Callback when page size changes
   */
  onPageSizeChange?: (pageSize: number) => void;
  /**
   * Available page size options
   */
  pageSizeOptions?: number[];
  /**
   * Whether pagination is disabled
   */
  disabled?: boolean;
}

const TablePagination = React.forwardRef<HTMLDivElement, TablePaginationProps>(
  (
    {
      page,
      totalPages,
      totalItems,
      pageSize,
      onPageChange,
      onPageSizeChange,
      pageSizeOptions = [10, 25, 50, 100],
      disabled = false,
    },
    ref
  ) => {
    const startItem = (page - 1) * pageSize + 1;
    const endItem = Math.min(page * pageSize, totalItems || page * pageSize);

    return (
      <div
        ref={ref}
        className="flex items-center justify-between px-4 py-3 border-t bg-card"
        role="navigation"
        aria-label="Pagination"
      >
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {totalItems !== undefined && (
            <span>
              Showing {startItem} to {endItem} of {totalItems} results
            </span>
          )}
          {onPageSizeChange && (
            <div className="flex items-center gap-2">
              <label htmlFor="page-size" className="sr-only">
                Rows per page
              </label>
              <select
                id="page-size"
                value={pageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                disabled={disabled}
                className={cn(
                  'h-8 rounded-md border bg-transparent px-2 text-sm',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'disabled:cursor-not-allowed disabled:opacity-50'
                )}
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size} per page
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={disabled || page <= 1}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-md border',
                'hover:bg-muted',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:pointer-events-none disabled:opacity-50'
              )}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={disabled || page >= totalPages}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-md border',
                'hover:bg-muted',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:pointer-events-none disabled:opacity-50'
              )}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    );
  }
);
TablePagination.displayName = 'TablePagination';

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  TablePagination,
};
