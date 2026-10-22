import { getMeasurementFields } from "@/lib/measurements";
import { SettingsSection } from "../settings-section";
import { FieldList } from "./field-list";

export default async function MeasurementSettings() {
  const fields = await getMeasurementFields();
  return (
    <SettingsSection title="Measurements" description="The measurements you take. They appear in this order when you measure a customer.">
      <FieldList fields={fields.map((f) => ({ id: f.id, name: f.name }))} />
    </SettingsSection>
  );
}
