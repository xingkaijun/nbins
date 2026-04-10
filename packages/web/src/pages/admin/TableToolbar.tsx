import React from "react";
import type { AdminFilter } from "./table-configs";

export function TableToolbar(props: {
  title: string;
  description: string;
  searchValue: string;
  filters?: AdminFilter[];
  filterValues: Record<string, string>;
  canCreate: boolean;
  canExport: boolean;
  onSearchChange: (value: string) => void;
  onFilterChange: (key: string, value: string) => void;
  onApplyFilters?: () => void;
  onCreate: () => void;
  onExport: () => void;
}) {
  return (
    <section className="panel adminPanel">
      <div className="panelHeader">
        <div>
          <h3>{props.title}</h3>
          <p className="helperText">{props.description}</p>
        </div>
        <div className="adminToolbarActions">
          <button className="pill active" type="button" onClick={props.onExport} disabled={!props.canExport}>
            Export JSON
          </button>
          {props.canCreate ? (
            <button className="submitButton" type="button" onClick={props.onCreate}>
              New Record
            </button>
          ) : null}
        </div>
      </div>

      <div className="adminToolbarFilters">
        <input
          className="adminSearch"
          placeholder="Search current table"
          value={props.searchValue}
          onChange={(event) => props.onSearchChange(event.target.value)}
        />
        {(props.filters ?? []).map((filter) => {
          if (filter.type === "date") {
            return (
              <input
                key={filter.key}
                type="date"
                className="filterSelect"
                value={props.filterValues[filter.key] ?? ""}
                onChange={(event) => props.onFilterChange(filter.key, event.target.value)}
                placeholder={filter.label}
              />
            );
          }
          return (
            <select
              key={filter.key}
              className="filterSelect"
              value={props.filterValues[filter.key] ?? ""}
              onChange={(event) => props.onFilterChange(filter.key, event.target.value)}
            >
              <option value="">{filter.label}</option>
              {(filter.options ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          );
        })}
        {props.onApplyFilters && (
          <button type="button" className="pill active" style={{ marginLeft: "8px" }} onClick={props.onApplyFilters}>
            Filter
          </button>
        )}
      </div>
    </section>
  );
}
