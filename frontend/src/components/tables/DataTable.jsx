import { useEffect, useMemo, useState } from "react";

function normalizeFilterValue(value) {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map((item) => normalizeFilterValue(item)).filter(Boolean).join(", ");
  return String(value).trim();
}

export function DataTable({
  columns,
  rows,
  pageSize = 10,
  enableSearch = false,
  enableFilters = false,
  emptyTitle = "No records yet",
  emptyHint = "Actions here will appear once this view has data."
}) {
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterValues, setFilterValues] = useState({});
  const safeRows = rows || [];
  const searchColumn = columns[0] || null;
  const filterColumns = enableFilters ? columns.slice(1).filter((column) => !column.disableFilter) : [];

  const filterConfigs = useMemo(
    () =>
      filterColumns.map((column) => {
        const options = [...new Set(safeRows.map((row) => normalizeFilterValue(row?.[column.key])).filter(Boolean))].sort((left, right) =>
          left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })
        );
        const useSelect = options.length > 0 && options.length <= 12 && options.every((option) => option.length <= 28);
        return {
          ...column,
          options,
          controlType: useSelect ? "select" : "text"
        };
      }),
    [filterColumns, safeRows]
  );

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return safeRows.filter((row) => {
      if (enableSearch && searchColumn) {
        const firstColumnValue = normalizeFilterValue(row?.[searchColumn.key]).toLowerCase();
        if (normalizedSearch && !firstColumnValue.includes(normalizedSearch)) {
          return false;
        }
      }

      for (const column of filterConfigs) {
        const activeFilter = (filterValues[column.key] || "").trim().toLowerCase();
        if (!activeFilter) continue;

        const cellValue = normalizeFilterValue(row?.[column.key]).toLowerCase();
        if (column.controlType === "select") {
          if (cellValue !== activeFilter) {
            return false;
          }
        } else if (!cellValue.includes(activeFilter)) {
          return false;
        }
      }

      return true;
    });
  }, [enableSearch, filterConfigs, filterValues, safeRows, searchColumn, searchTerm]);

  const pages = Math.max(1, Math.ceil(filteredRows.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [safeRows.length, pageSize, searchTerm, filterValues]);

  useEffect(() => {
    if (page > pages) {
      setPage(pages);
    }
  }, [page, pages]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const hasControls = enableSearch || filterConfigs.length > 0;
  const hasActiveFilters = Boolean(searchTerm.trim()) || Object.values(filterValues).some((value) => String(value || "").trim());

  function clearFilters() {
    setSearchTerm("");
    setFilterValues({});
  }

  function updateFilter(columnKey, value) {
    setFilterValues((current) => ({
      ...current,
      [columnKey]: value
    }));
  }

  if (!safeRows.length) {
    return (
      <div className="table-empty">
        <div className="table-empty-icon" aria-hidden>
          <span />
        </div>
        <p className="table-empty-title">{emptyTitle}</p>
        <p className="table-empty-hint">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="table-shell">
      {hasControls ? (
        <div className="table-controls">
          {enableSearch && searchColumn ? (
            <label className="table-control table-control-search">
              <span>Search {searchColumn.label}</span>
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={`Search by ${String(searchColumn.label || "").toLowerCase()}`}
              />
            </label>
          ) : null}
          {filterConfigs.length ? (
            <div className="table-filter-grid">
              {filterConfigs.map((column) => (
                <label key={column.key} className="table-control">
                  <span>Filter {column.label}</span>
                  {column.controlType === "select" ? (
                    <select value={filterValues[column.key] || ""} onChange={(event) => updateFilter(column.key, event.target.value)}>
                      <option value="">All</option>
                      {column.options.map((option) => (
                        <option key={`${column.key}-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="search"
                      value={filterValues[column.key] || ""}
                      onChange={(event) => updateFilter(column.key, event.target.value)}
                      placeholder={`Filter ${String(column.label || "").toLowerCase()}`}
                    />
                  )}
                </label>
              ))}
            </div>
          ) : null}
          <div className="table-controls-summary">
            <span>
              Showing {filteredRows.length} of {safeRows.length}
            </span>
            {hasActiveFilters ? (
              <button type="button" className="btn-ghost btn-small" onClick={clearFilters}>
                Clear filters
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!filteredRows.length ? (
        <div className="table-empty table-empty-filtered">
          <div className="table-empty-icon" aria-hidden>
            <span />
          </div>
          <p className="table-empty-title">No matching records</p>
          <p className="table-empty-hint">Try changing the search term or clearing one of the filters.</p>
        </div>
      ) : null}

      {filteredRows.length ? (
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, index) => (
              <tr key={row.id || row.code || row.name || `row-${index}`} data-walk-id={row.id || row.code || undefined}>
                {columns.map((column) => (
                  <td key={`${row.id || row.code || row.name || index}-${column.key}`}>
                    {column.render ? column.render(row[column.key], row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      ) : null}
      {filteredRows.length > pageSize ? (
        <div className="table-pagination">
          <span>
            Page {page} of {pages}
          </span>
          <div className="table-pagination-actions">
            <button type="button" className="btn-ghost btn-small" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>
              Previous
            </button>
            <button type="button" className="btn-ghost btn-small" onClick={() => setPage((value) => Math.min(pages, value + 1))} disabled={page === pages}>
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
