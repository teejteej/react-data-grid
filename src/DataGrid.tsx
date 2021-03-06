import React, {
  forwardRef,
  useState,
  useRef,
  useLayoutEffect,
  useMemo,
  createElement
} from 'react';

import HeaderRow from './HeaderRow';
import FilterRow from './FilterRow';
import Canvas, { CanvasHandle as DataGridHandle } from './Canvas';
import { ValueFormatter } from './formatters';
import { getColumnMetrics, getHorizontalRangeToRender, isPositionStickySupported, getViewportColumns, getScrollbarSize } from './utils';
import { CellNavigationMode, SortDirection } from './common/enums';
import {
  CalculatedColumn,
  CheckCellIsEditableEvent,
  Column,
  RowsUpdateEvent,
  Position,
  RowExpandToggleEvent,
  SelectedRange,
  RowRendererProps,
  ScrollPosition,
  Filters,
  FormatterProps
} from './common/types';

export { DataGridHandle };

export interface DataGridProps<R, K extends keyof R, SR = unknown> {
  /**
   * Grid and data Props
   */
  /** An array of objects representing each column on the grid */
  columns: readonly Column<R, SR>[];
  /** A function called for each rendered row that should return a plain key/value pair object */
  rows: readonly R[];
  /**
   * Rows to be pinned at the bottom of the rows view for summary, the vertical scroll bar will not scroll these rows.
   * Bottom horizontal scroll bar can move the row left / right. Or a customized row renderer can be used to disabled the scrolling support.
   */
  summaryRows?: readonly SR[];
  /** The primary key property of each row */
  rowKey?: K;
  /**
   * Callback called whenever row data is updated
   * When editing is enabled, this callback will be called for the following scenarios
   * 1. Using the supplied editor of the column. The default editor is the SimpleTextEditor.
   * 2. Copy/pasting the value from one cell to another <kbd>CTRL</kbd>+<kbd>C</kbd>, <kbd>CTRL</kbd>+<kbd>V</kbd>
   * 3. Update multiple cells by dragging the fill handle of a cell up or down to a destination cell.
   * 4. Update all cells under a given cell by double clicking the cell's fill handle.
   */
  onRowsUpdate?: <E extends RowsUpdateEvent>(event: E) => void;

  /**
   * Dimensions props
   */
  /** The width of the grid in pixels */
  width?: number;
  /** The height of the grid in pixels */
  height?: number;
  /** Minimum column width in pixels */
  minColumnWidth?: number;
  /** The height of each row in pixels */
  rowHeight?: number;
  /** The height of the header row in pixels */
  headerRowHeight?: number;
  /** The height of the header filter row in pixels */
  headerFiltersHeight?: number;

  /**
   * Feature props
   */
  /** Set of selected row keys */
  selectedRows?: ReadonlySet<R[K]>;
  /** Function called whenever row selection is changed */
  onSelectedRowsChange?: (selectedRows: Set<R[K]>) => void;
  /** The key of the column which is currently being sorted */
  sortColumn?: string;
  /** The direction to sort the sortColumn*/
  sortDirection?: SortDirection;
  /** Function called whenever grid is sorted*/
  onSort?: (columnKey: string, direction: SortDirection) => void;
  filters?: Filters;
  onFiltersChange?: (filters: Filters) => void;

  /**
   * Custom renderers
   */
  defaultFormatter?: React.ComponentType<FormatterProps<R, SR>>;
  rowRenderer?: React.ComponentType<RowRendererProps<R, SR>>;
  rowGroupRenderer?: React.ComponentType;
  emptyRowsView?: React.ComponentType<{}>;
  /** Component used to render a draggable header cell */
  draggableHeaderCell?: React.ComponentType<{ column: CalculatedColumn<R, SR>; onHeaderDrop: () => void }>;

  /**
   * Event props
   */
  /** Function called whenever a row is clicked */
  onRowClick?: (rowIdx: number, row: R, column: CalculatedColumn<R, SR>) => void;
  /** Called when the grid is scrolled */
  onScroll?: (scrollPosition: ScrollPosition) => void;
  /** Called when a column is resized */
  onColumnResize?: (idx: number, width: number) => void;
  onHeaderDrop?: () => void;
  onRowExpandToggle?: (event: RowExpandToggleEvent) => void;
  /** Function called whenever selected cell is changed */
  onSelectedCellChange?: (position: Position) => void;
  /** Function called whenever selected cell range is changed */
  onSelectedCellRangeChange?: (selectedRange: SelectedRange) => void;
  /** called before cell is set active, returns a boolean to determine whether cell is editable */
  onCheckCellIsEditable?: (event: CheckCellIsEditableEvent<R, SR>) => boolean;

  /**
   * Toggles and modes
   */
  /** Toggles whether filters row is displayed or not */
  enableFilters?: boolean;
  /** Toggles whether cells should be autofocused */
  enableCellAutoFocus?: boolean;
  enableCellCopyPaste?: boolean;
  enableCellDragAndDrop?: boolean;
  cellNavigationMode?: CellNavigationMode;

  /**
   * Miscellaneous
   */
  /** The node where the editor portal should mount. */
  editorPortalTarget?: Element;
}

/**
 * Main API Component to render a data grid of rows and columns
 *
 * @example
 *
 * <DataGrid columns={columns} rows={rows} />
*/
function DataGrid<R, K extends keyof R, SR>({
  rowKey,
  rowHeight = 35,
  headerRowHeight = rowHeight,
  headerFiltersHeight = 45,
  minColumnWidth = 80,
  height = 350,
  width,
  enableCellAutoFocus = true,
  enableFilters = false,
  enableCellCopyPaste = false,
  enableCellDragAndDrop = false,
  cellNavigationMode = CellNavigationMode.NONE,
  editorPortalTarget = document.body,
  defaultFormatter = ValueFormatter,
  columns,
  rows,
  selectedRows,
  onSelectedRowsChange,
  ...props
}: DataGridProps<R, K, SR>, ref: React.Ref<DataGridHandle>) {
  const [columnWidths, setColumnWidths] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [scrollLeft, setScrollLeft] = useState(0);
  const [gridWidth, setGridWidth] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const viewportWidth = (width || gridWidth) - 2; // 2 for border width;
  const nonStickyScrollLeft = isPositionStickySupported() ? undefined : scrollLeft;

  const columnMetrics = useMemo(() => {
    if (viewportWidth <= 0) return null;

    return getColumnMetrics<R, SR>({
      columns,
      minColumnWidth,
      viewportWidth,
      columnWidths,
      defaultFormatter
    });
  }, [columnWidths, columns, defaultFormatter, minColumnWidth, viewportWidth]);

  const [colOverscanStartIdx, colOverscanEndIdx] = useMemo((): [number, number] => {
    if (!columnMetrics) {
      return [0, 0];
    }

    return getHorizontalRangeToRender({
      columnMetrics,
      scrollLeft
    });
  }, [columnMetrics, scrollLeft]);

  const viewportColumns = useMemo((): readonly CalculatedColumn<R, SR>[] => {
    if (!columnMetrics) return [];

    return getViewportColumns(
      columnMetrics.columns,
      colOverscanStartIdx,
      colOverscanEndIdx
    );
  }, [colOverscanEndIdx, colOverscanStartIdx, columnMetrics]);

  useLayoutEffect(() => {
    // Do not calculate the width if width is provided
    if (width) return;
    function onResize() {
      // Immediately re-render when the component is mounted to get valid columnMetrics.
      setGridWidth(gridRef.current!.getBoundingClientRect().width);
    }
    onResize();

    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, [width]);

  function handleColumnResize(column: CalculatedColumn<R, SR>, width: number) {
    const newColumnWidths = new Map(columnWidths);
    newColumnWidths.set(column.key, width);
    setColumnWidths(newColumnWidths);

    props.onColumnResize?.(column.idx, width);
  }

  function handleScroll(scrollPosition: ScrollPosition) {
    if (headerRef.current) {
      headerRef.current.scrollLeft = scrollPosition.scrollLeft;
    }
    setScrollLeft(scrollPosition.scrollLeft);
    props.onScroll?.(scrollPosition);
  }

  function handleRowUpdate(event: RowsUpdateEvent) {
    props.onRowsUpdate?.(event);
  }

  const rowOffsetHeight = headerRowHeight + (enableFilters ? headerFiltersHeight : 0);

  return (
    <div
      className="rdg-root"
      style={{ width, lineHeight: `${rowHeight}px` }}
      ref={gridRef}
    >
      {columnMetrics && (
        <>
          <div
            ref={headerRef}
            className="rdg-header"
          >
            <HeaderRow<R, K, SR>
              rowKey={rowKey}
              rows={rows}
              height={headerRowHeight}
              width={columnMetrics.totalColumnWidth + getScrollbarSize()}
              columns={viewportColumns}
              onColumnResize={handleColumnResize}
              lastFrozenColumnIndex={columnMetrics.lastFrozenColumnIndex}
              draggableHeaderCell={props.draggableHeaderCell}
              onHeaderDrop={props.onHeaderDrop}
              allRowsSelected={selectedRows?.size === rows.length}
              onSelectedRowsChange={onSelectedRowsChange}
              sortColumn={props.sortColumn}
              sortDirection={props.sortDirection}
              onSort={props.onSort}
              scrollLeft={nonStickyScrollLeft}
            />
            {enableFilters && (
              <FilterRow<R, SR>
                height={headerFiltersHeight}
                width={columnMetrics.totalColumnWidth + getScrollbarSize()}
                lastFrozenColumnIndex={columnMetrics.lastFrozenColumnIndex}
                columns={viewportColumns}
                scrollLeft={nonStickyScrollLeft}
                filters={props.filters}
                onFiltersChange={props.onFiltersChange}
              />
            )}
          </div>
          {rows.length === 0 && props.emptyRowsView ? createElement(props.emptyRowsView) : (
            <Canvas<R, K, SR>
              ref={ref}
              rowKey={rowKey}
              rowHeight={rowHeight}
              rowRenderer={props.rowRenderer}
              rows={rows}
              selectedRows={selectedRows}
              onSelectedRowsChange={onSelectedRowsChange}
              columnMetrics={columnMetrics}
              viewportColumns={viewportColumns}
              onScroll={handleScroll}
              height={height - rowOffsetHeight}
              rowGroupRenderer={props.rowGroupRenderer}
              enableCellAutoFocus={enableCellAutoFocus}
              enableCellCopyPaste={enableCellCopyPaste}
              enableCellDragAndDrop={enableCellDragAndDrop}
              cellNavigationMode={cellNavigationMode}
              scrollLeft={scrollLeft}
              editorPortalTarget={editorPortalTarget}
              summaryRows={props.summaryRows}
              onCheckCellIsEditable={props.onCheckCellIsEditable}
              onRowsUpdate={handleRowUpdate}
              onSelectedCellChange={props.onSelectedCellChange}
              onSelectedCellRangeChange={props.onSelectedCellRangeChange}
              onRowClick={props.onRowClick}
              onRowExpandToggle={props.onRowExpandToggle}
            />
          )}
        </>
      )}
    </div>
  );
}

export default forwardRef(
  DataGrid as React.RefForwardingComponent<DataGridHandle>
) as <R, K extends keyof R, SR = unknown>(props: DataGridProps<R, K, SR> & { ref?: React.Ref<DataGridHandle> }) => JSX.Element;
