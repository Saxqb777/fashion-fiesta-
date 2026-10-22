import { getMeasurementFields, getMeasurementTemplates } from "@/lib/measurements";
import { SettingsSection } from "../settings-section";
import { FieldList } from "./field-list";
import { TemplateList } from "./template-list";

export default async function MeasurementSettings() {
  const [templates, fields] = await Promise.all([getMeasurementTemplates(), getMeasurementFields()]);
  return (
    <div className="flex flex-col gap-4">
      <SettingsSection
        title="Garment templates"
        description="Which measurements to take for each garment, in order. Link a template to a product category in Categories, and only those fields show when you measure for that product."
      >
        <TemplateList templates={templates} fields={fields.map((f) => ({ id: f.id, name: f.name }))} />
      </SettingsSection>
      <SettingsSection title="All measurements" description="The master list. Templates pick from it.">
        <FieldList fields={fields.map((f) => ({ id: f.id, name: f.name }))} />
      </SettingsSection>
    </div>
  );
}
