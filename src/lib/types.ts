export type Organization = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
};

export type OrganizationMembership = {
  id: string;
  organization_id: string;
  user_id: string;
  role: "owner" | "manager" | "receptionist" | "professional";
  is_active: boolean;
};

export type Location = {
  id: string;
  organization_id: string;
  name: string;
  public_slug: string;
  time_zone: string;
  is_active: boolean;
  default_professional_id: string | null;
  customer_cancel_minimum_minutes?: number;
};

export type Professional = {
  id: string;
  organization_id: string;
  user_id: string | null;
  display_name: string;
  is_active: boolean;
};

export type Workspace = {
  organization: Organization;
  membership: OrganizationMembership;
  location: Location;
};

export type Service = {
  id: string;
  business_id: string | null;
  organization_id: string;
  name: string;
  duration_minutes: number;
  price_cents: number;
  is_active: boolean;
};

export type PublicService = Pick<Service, "id" | "name" | "duration_minutes" | "price_cents">;

export type LocationHour = {
  id: string;
  organization_id: string;
  location_id: string;
  week_day: number;
  start_time: string;
  end_time: string;
};

export type CalendarEvent = {
  id: string;
  organization_id: string;
  location_id: string;
  professional_id: string;
  event_type: "booking" | "block";
  starts_at: string;
  ends_at: string;
  status: "confirmed" | "cancelled";
  title: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  service_name: string | null;
  service_duration_minutes: number | null;
  service_price_cents: number | null;
  cancelled_at?: string | null;
  cancelled_by?: "customer" | "staff" | "system" | null;
  cancellation_reason?: string | null;
  series_id?: string | null;
};

export type AvailabilityBlock = {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  week_days: number[] | null;
  start_time: string | null;
  end_time: string | null;
  is_all_day: boolean;
};

export type Customer = {
  id: string;
  organization_id: string;
  name: string;
  phone: string;
  is_fixed: boolean;
  notes?: string | null;
};
