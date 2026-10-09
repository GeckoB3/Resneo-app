/**
 * The ResNeo fields an imported column can go to, per file type. Port of the web's
 * `CLIENT_FIELDS`, `BOOKING_FIELDS`, `STAFF_FIELDS` and `targetFieldsForFileType`
 * (`src/lib/import/constants.ts`). The keys are the server's and must stay identical; the
 * labels are the web's, except that money fields do not name a currency here (the venue's
 * own currency applies) so the app reads the same in every country it is sold in.
 */

export type FieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'date'
  | 'time'
  | 'number'
  | 'boolean'
  | 'currency'
  | 'tags';

export interface SchemaField {
  key: string;
  label: string;
  required: boolean;
  type: FieldType;
}

export const CLIENT_FIELDS: SchemaField[] = [
  { key: 'first_name', label: 'First Name', required: true, type: 'text' },
  { key: 'last_name', label: 'Surname', required: true, type: 'text' },
  { key: 'full_name', label: 'Full Name', required: false, type: 'text' },
  { key: 'external_client_id', label: 'External client ID (from your previous system)', required: false, type: 'text' },
  { key: 'external_system_id', label: 'External system ID', required: false, type: 'text' },
  { key: 'email', label: 'Email Address', required: false, type: 'email' },
  { key: 'phone', label: 'Phone Number', required: false, type: 'phone' },
  { key: 'landline', label: 'Landline', required: false, type: 'phone' },
  { key: 'address', label: 'Address', required: false, type: 'text' },
  { key: 'postcode', label: 'Postcode', required: false, type: 'text' },
  { key: 'date_of_birth', label: 'Date of Birth', required: false, type: 'date' },
  { key: 'gender', label: 'Gender', required: false, type: 'text' },
  { key: 'marketing_consent', label: 'Marketing Consent', required: false, type: 'boolean' },
  { key: 'marketing_opt_out', label: 'Opted out of marketing', required: false, type: 'boolean' },
  { key: 'sms_marketing_consent', label: 'SMS marketing consent', required: false, type: 'boolean' },
  { key: 'email_marketing_consent', label: 'Email marketing consent', required: false, type: 'boolean' },
  { key: 'sms_reminder_consent', label: 'SMS reminder consent', required: false, type: 'boolean' },
  { key: 'email_reminder_consent', label: 'Email reminder consent', required: false, type: 'boolean' },
  { key: 'preferred_staff', label: 'Preferred staff', required: false, type: 'text' },
  { key: 'client_since', label: 'Client since', required: false, type: 'date' },
  { key: 'archived', label: 'Archived', required: false, type: 'boolean' },
  { key: 'banned', label: 'Banned', required: false, type: 'boolean' },
  { key: 'loyalty_points', label: 'Loyalty points', required: false, type: 'number' },
  { key: 'credit_balance', label: 'Credit balance', required: false, type: 'currency' },
  { key: 'first_visit_date', label: 'First Visit Date', required: false, type: 'date' },
  { key: 'last_visit_date', label: 'Last Visit Date', required: false, type: 'date' },
  { key: 'total_visits', label: 'Total Visits', required: false, type: 'number' },
  { key: 'total_spent', label: 'Total Spent', required: false, type: 'currency' },
  { key: 'notes', label: 'Client Notes', required: false, type: 'text' },
  { key: 'tags', label: 'Tags', required: false, type: 'tags' },
];

export const BOOKING_FIELDS: SchemaField[] = [
  { key: 'client_email', label: 'Client Email', required: false, type: 'email' },
  { key: 'client_external_id', label: 'Client ID (external)', required: false, type: 'text' },
  { key: 'party_size', label: 'Party size / covers', required: false, type: 'number' },
  { key: 'client_phone', label: 'Client Phone', required: false, type: 'phone' },
  { key: 'guest_first_name', label: 'Guest First Name', required: false, type: 'text' },
  { key: 'guest_last_name', label: 'Guest Surname', required: false, type: 'text' },
  { key: 'guest_full_name', label: 'Guest Full Name', required: false, type: 'text' },
  { key: 'external_appointment_id', label: 'Appointment ID (external)', required: false, type: 'text' },
  { key: 'external_booking_id', label: 'Booking ID (external)', required: false, type: 'text' },
  { key: 'group_booking_id', label: 'Group booking ID', required: false, type: 'text' },
  { key: 'service_name', label: 'Service Name', required: false, type: 'text' },
  { key: 'staff_name', label: 'Staff Member', required: false, type: 'text' },
  { key: 'booking_date', label: 'Booking Date', required: true, type: 'date' },
  { key: 'booking_time', label: 'Booking Time', required: true, type: 'time' },
  { key: 'booking_end_time', label: 'End Time', required: false, type: 'time' },
  { key: 'duration_minutes', label: 'Duration (minutes)', required: false, type: 'number' },
  { key: 'status', label: 'Booking Status', required: false, type: 'text' },
  { key: 'activation_state', label: 'Activation state', required: false, type: 'text' },
  { key: 'confirmed', label: 'Confirmed', required: false, type: 'boolean' },
  { key: 'appointment_source', label: 'Appointment source', required: false, type: 'text' },
  { key: 'room_id', label: 'Room ID', required: false, type: 'text' },
  { key: 'machine_id', label: 'Machine ID', required: false, type: 'text' },
  { key: 'course_name', label: 'Course name', required: false, type: 'text' },
  { key: 'colour_notes', label: 'Colour notes', required: false, type: 'text' },
  { key: 'service_notes', label: 'Service notes', required: false, type: 'text' },
  { key: 'price', label: 'Price', required: false, type: 'currency' },
  { key: 'deposit_amount', label: 'Deposit amount', required: false, type: 'currency' },
  { key: 'deposit_paid', label: 'Deposit paid', required: false, type: 'boolean' },
  { key: 'deposit_status', label: 'Deposit status', required: false, type: 'text' },
  { key: 'notes', label: 'Booking Notes', required: false, type: 'text' },
  { key: 'deleted', label: 'Deleted row', required: false, type: 'boolean' },
  { key: 'table_ref', label: 'Table', required: false, type: 'text' },
  { key: 'event_name', label: 'Event name', required: false, type: 'text' },
  { key: 'class_name', label: 'Class name', required: false, type: 'text' },
  { key: 'resource_name', label: 'Resource', required: false, type: 'text' },
];

export const STAFF_FIELDS: SchemaField[] = [
  { key: 'staff_name', label: 'Staff Member Name', required: true, type: 'text' },
  { key: 'staff_first_name', label: 'Staff First Name', required: false, type: 'text' },
  { key: 'staff_last_name', label: 'Staff Surname', required: false, type: 'text' },
  { key: 'staff_email', label: 'Staff Email', required: false, type: 'email' },
  { key: 'staff_phone', label: 'Staff Phone', required: false, type: 'phone' },
  { key: 'staff_role', label: 'Role / Job Title', required: false, type: 'text' },
];

/** Mapping target schema for a file type ('unknown' maps like a client list, as on the web). */
export function targetFieldsForFileType(fileType: string): SchemaField[] {
  if (fileType === 'bookings') return BOOKING_FIELDS;
  if (fileType === 'staff') return STAFF_FIELDS;
  return CLIENT_FIELDS;
}

/**
 * A field's label with the venue's word for a client, as the web's map view shows it
 * ("Client Email" reads "Member Email" at a class venue).
 */
export function fieldDisplayLabel(field: SchemaField, clientLabel: string): string {
  const personal =
    field.key.includes('client') ||
    field.key.startsWith('guest_') ||
    field.key === 'first_name' ||
    field.key === 'last_name' ||
    field.key === 'full_name';
  return personal ? field.label.replace(/\bClient\b/gi, clientLabel) : field.label;
}

/** A field key's label for a file type, or the key itself when it is not one of them. */
export function labelForFieldKey(key: string | null | undefined, fileType: string): string {
  if (!key) return 'Not set';
  return targetFieldsForFileType(fileType).find((f) => f.key === key)?.label ?? key;
}

/** Plain words for a field's type, shown under its name. */
export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Text',
  email: 'Email',
  phone: 'Phone',
  date: 'Date',
  time: 'Time',
  number: 'Number',
  boolean: 'Yes or no',
  currency: 'Amount',
  tags: 'Tags',
};
