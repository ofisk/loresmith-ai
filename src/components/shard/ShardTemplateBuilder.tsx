import { useState, useEffect } from "react";
import { Save, Eye, Code, X, Plus, Trash2 } from "lucide-react";
import type { FlexibleShard } from "./ShardTypeDetector";
import { getEditableProperties } from "./ShardTypeDetector";

interface ShardTemplate {
  id: string;
  name: string;
  type: string;
  description: string;
  fields: string[];
  fieldTypes: { [key: string]: "string" | "number" | "array" | "object" };
  sampleData: any;
  created: string;
  updated: string;
}

interface ShardTemplateBuilderProps {
  shard?: FlexibleShard;
  onSaveTemplate?: (template: ShardTemplate) => void;
  onClose?: () => void;
  className?: string;
}

export function ShardTemplateBuilder({
  shard,
  onSaveTemplate,
  onClose,
  className = "",
}: ShardTemplateBuilderProps) {
  const [template, setTemplate] = useState<Partial<ShardTemplate>>({
    name: shard ? `${shard.type}_template` : "",
    type: shard?.type || "",
    description: "",
    fields: [],
    fieldTypes: {},
    sampleData: shard || {},
  });

  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<
    "string" | "number" | "array" | "object"
  >("string");
  const [previewMode, setPreviewMode] = useState<"form" | "json">("form");

  // Initialize template from shard if provided
  useEffect(() => {
    if (shard) {
      const properties = getEditableProperties(shard);
      const fieldTypes: {
        [key: string]: "string" | "number" | "array" | "object";
      } = {};

      properties.forEach(({ key, type }) => {
        fieldTypes[key] = type;
      });

      setTemplate((prev) => ({
        ...prev,
        name: `${shard.type}_template`,
        type: shard.type,
        description: `Template for ${shard.type} shards`,
        fields: properties.map(({ key }) => key),
        fieldTypes,
        sampleData: shard,
      }));
    }
  }, [shard]);

  const handleAddField = () => {
    if (!newFieldName.trim()) return;

    const fieldName = newFieldName.trim();

    setTemplate((prev) => ({
      ...prev,
      fields: [...(prev.fields || []), fieldName],
      fieldTypes: {
        ...prev.fieldTypes,
        [fieldName]: newFieldType,
      },
    }));

    setNewFieldName("");
  };

  const handleRemoveField = (fieldName: string) => {
    setTemplate((prev) => {
      const newFieldTypes = { ...prev.fieldTypes };
      delete newFieldTypes[fieldName];

      return {
        ...prev,
        fields: (prev.fields || []).filter((field) => field !== fieldName),
        fieldTypes: newFieldTypes,
      };
    });
  };

  const handleSaveTemplate = () => {
    if (!template.name || !template.type) {
      alert("Please provide a template name and type");
      return;
    }

    const finalTemplate: ShardTemplate = {
      id: `template_${Date.now()}`,
      name: template.name,
      type: template.type,
      description: template.description || "",
      fields: template.fields || [],
      fieldTypes: template.fieldTypes || {},
      sampleData: template.sampleData || {},
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    if (onSaveTemplate) {
      onSaveTemplate(finalTemplate);
    }
  };

  const renderFieldList = () => {
    const fields = template.fields || [];

    return (
      <div className="space-y-2">
        <h4 className="font-medium text-gray-900 flex items-center gap-2">
          Fields
          <span className="text-xs text-gray-500">({fields.length})</span>
        </h4>
        {fields.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No fields added yet</p>
        ) : (
          <div className="space-y-1">
            {fields.map((field) => (
              <div
                key={field}
                className="flex items-center justify-between p-2 bg-gray-50 rounded"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">
                    {field}
                  </span>
                  <span className="text-xs text-gray-500">
                    ({template.fieldTypes?.[field] || "string"})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveField(field)}
                  className="text-xs text-red-600 hover:text-red-800"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderSampleForm = () => (
    <div className="space-y-4">
      <h4 className="font-medium text-gray-900">Sample Form Preview</h4>
      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
        <div className="space-y-3">
          {(template.fields || []).map((field) => {
            const fieldType = template.fieldTypes?.[field] || "string";

            return (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {field}
                </label>
                {fieldType === "string" && (
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    placeholder={`Enter ${field}...`}
                    disabled
                  />
                )}
                {fieldType === "number" && (
                  <input
                    type="number"
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    placeholder="Enter number..."
                    disabled
                  />
                )}
                {fieldType === "array" && (
                  <div className="space-y-1">
                    <div className="flex flex-wrap gap-1">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                        Sample Item
                      </span>
                    </div>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="Add new item..."
                      disabled
                    />
                  </div>
                )}
                {fieldType === "object" && (
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono"
                    rows={3}
                    placeholder='{"key": "value"}'
                    disabled
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className={`bg-white border border-gray-200 rounded-lg ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            Create Shard Template
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setPreviewMode(previewMode === "form" ? "json" : "form")
              }
              className="flex items-center gap-1 px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50"
            >
              {previewMode === "form" ? <Code size={14} /> : <Eye size={14} />}
              {previewMode === "form" ? "JSON" : "Form"}
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Basic Info */}
        <div className="space-y-3">
          <h4 className="font-medium text-gray-900">Template Information</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Template Name *
              </label>
              <input
                type="text"
                value={template.name || ""}
                onChange={(e) =>
                  setTemplate((prev) => ({ ...prev, name: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                placeholder="e.g., custom_spell_template"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Shard Type *
              </label>
              <input
                type="text"
                value={template.type || ""}
                onChange={(e) =>
                  setTemplate((prev) => ({ ...prev, type: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                placeholder="e.g., custom_spell"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={template.description || ""}
              onChange={(e) =>
                setTemplate((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              rows={2}
              placeholder="Describe this template..."
            />
          </div>
        </div>

        {/* Add New Field */}
        <div className="space-y-3">
          <h4 className="font-medium text-gray-900">Add Field</h4>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Field name"
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
            />
            <select
              value={newFieldType}
              onChange={(e) => setNewFieldType(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded text-sm"
            >
              <option value="string">String</option>
              <option value="number">Number</option>
              <option value="array">Array</option>
              <option value="object">Object</option>
            </select>
            <button
              type="button"
              onClick={handleAddField}
              disabled={!newFieldName.trim()}
              className="px-3 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:bg-gray-300"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* Field List */}
        <div>{renderFieldList()}</div>

        {/* Preview */}
        {previewMode === "form" ? (
          renderSampleForm()
        ) : (
          <div className="space-y-2">
            <h4 className="font-medium text-gray-900">JSON Preview</h4>
            <pre className="bg-gray-100 p-4 rounded text-sm overflow-x-auto">
              {JSON.stringify(
                {
                  id: "sample_id",
                  type: template.type,
                  ...Object.fromEntries(
                    (template.fields || []).map((field) => [
                      field,
                      template.fieldTypes?.[field] === "array"
                        ? []
                        : template.fieldTypes?.[field] === "object"
                          ? {}
                          : template.fieldTypes?.[field] === "number"
                            ? 0
                            : `sample_${field}`,
                    ])
                  ),
                },
                null,
                2
              )}
            </pre>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <div className="text-sm text-gray-500">
            Template will be saved for future use with {template.type} shards
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveTemplate}
              className="flex items-center gap-1 px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
            >
              <Save size={14} />
              Save Template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
