import React from "react";
import type { AdminFormField } from "./table-configs";

export function RecordEditor(props: {
  title: string;
  fields: AdminFormField[];
  form: Record<string, unknown>;
  isEditing: boolean;
  canSave: boolean;
  canDelete: boolean;
  deleteLabel?: string;
  onChange: (key: string, value: unknown) => void;
  onSave: () => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="panel adminEditor">
      <div className="panelHeader">
        <div>
          <h3>{props.title}</h3>
          <p className="helperText">{props.isEditing ? "Edit the selected record." : "Create a new record."}</p>
        </div>
      </div>

      <div className="adminEditorFields">
        {props.fields.map((field) => {
          const value = props.form[field.key];
          const disabled = Boolean(props.isEditing && field.disabledOnEdit);

          if (field.type === "readonly") {
            return (
              <label key={field.key} className="field">
                <span>{field.label}</span>
                <div className="adminReadonly">{value ? String(value) : "-"}</div>
              </label>
            );
          }

          if (field.type === "textarea") {
            return (
              <label key={field.key} className="field">
                <span>{field.label}</span>
                <textarea
                  value={String(value ?? "")}
                  placeholder={field.placeholder}
                  disabled={disabled}
                  onChange={(event) => props.onChange(field.key, event.target.value)}
                />
              </label>
            );
          }

          if (field.type === "select") {
            return (
              <label key={field.key} className="field">
                <span>{field.label}</span>
                <select
                  className="filterSelect"
                  value={String(value ?? "")}
                  disabled={disabled}
                  onChange={(event) => props.onChange(field.key, event.target.value)}
                >
                  <option value="">Select</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            );
          }

          if (field.type === "tags") {
            const selected = Array.isArray(value) ? value.map(String) : [];
            return (
              <label key={field.key} className="field">
                <span>{field.label}</span>
                <div className="adminTagField">
                  {(field.options ?? []).map((option) => {
                    const active = selected.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={active ? "pill active" : "pill"}
                        onClick={() =>
                          props.onChange(
                            field.key,
                            active ? selected.filter((item) => item !== option.value) : [...selected, option.value]
                          )
                        }
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </label>
            );
          }

          if (field.type === "boolean") {
            return (
              <label key={field.key} className="field">
                <span>{field.label}</span>
                <select
                  className="filterSelect"
                  value={String(Boolean(value))}
                  onChange={(event) => props.onChange(field.key, event.target.value === "true")}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              </label>
            );
          }

          return (
            <label key={field.key} className="field">
              <span>{field.label}</span>
              <input
                type={field.type === "number" || field.type === "date" || field.type === "password" ? field.type : "text"}
                value={String(value ?? "")}
                placeholder={field.placeholder}
                disabled={disabled}
                onChange={(event) => props.onChange(field.key, event.target.value)}
              />
            </label>
          );
        })}
      </div>

      <div className="adminEditorActions">
        <button className="submitButton" type="button" onClick={props.onSave} disabled={!props.canSave}>
          Save
        </button>
        {props.canDelete && props.onDelete ? (
          <button className="pill" type="button" onClick={props.onDelete}>
            {props.deleteLabel ?? "Delete"}
          </button>
        ) : null}
        <button className="pill" type="button" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}
