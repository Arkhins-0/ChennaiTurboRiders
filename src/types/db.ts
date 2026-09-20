/**
 * Row types, generated from the database. Do not edit.
 *
 *   npm run db:types
 *
 * One type per table in the `ctr` schema, in the shape the Neon driver hands
 * back — which is not always the shape the domain types use. A `timestamptz`
 * arrives as a `Date` and every repo converts it at the boundary; a `jsonb`
 * column is `unknown` until something normalises it, which is the honest
 * answer for a column whose shape the database does not police.
 *
 * These describe a ROW. The domain types in src/lib describe what the
 * application means by one, and the two are different on purpose — a `Deck`
 * has `pages`, and no row does.
 */

export type AchievementsRow = {
  id: string;
  site_id: string;
  year: string;
  title: string;
  description: string;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
};

export type AdminGrantsRow = {
  admin_id: string;
  site_id: string;
  module: string;
};

export type AdminsRow = {
  id: string;
  username: string;
  password_hash: string;
  role: string;
  created_at: Date;
};

export type ArticlesRow = {
  id: string;
  title: string;
  subtext: string;
  cover_image: string;
  body: unknown;
  status: string;
  published_at: string | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
  site_id: string;
  category: string;
  author: string;
  tags: unknown;
};

export type CarRow = {
  site_id: string;
  name: string;
  tagline: string;
  year: number;
  description: string;
  image: string;
  image_2: string;
  image_3: string;
  updated_at: Date;
};

export type CarSpecsRow = {
  site_id: string;
  position: number;
  label: string;
  value: string;
};

export type DriverHighlightsRow = {
  driver_id: string;
  position: number;
  text: string;
};

export type DriversRow = {
  id: string;
  site_id: string;
  slug: string;
  first_name: string;
  last_name: string;
  nationality: string;
  country_code: string;
  flag_emoji: string;
  championship: string;
  car: string;
  number: number;
  date_of_birth: string | null;
  height: string;
  weight: string;
  image: string;
  hero_image: string;
  quote: string;
  biography: string;
  race_wins: number;
  pole_positions: number;
  grands_prix: number;
  podiums: number;
  fastest_laps: number;
  points: number;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
};

export type EventsRow = {
  id: string;
  site_id: string;
  round: string;
  title: string;
  subtitle: string;
  venue: string;
  city: string;
  track_id: string | null;
  date_from: string | null;
  date_to: string | null;
  dates: string;
  badge: string;
  status: string;
  cover_image: string;
  body: unknown;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
  season_id: string;
};

export type SchemaMigrationsRow = {
  version: string;
  name: string;
  checksum: string;
  applied_at: Date;
};

export type SeasonsRow = {
  id: string;
  site_id: string;
  name: string;
  subtitle: string;
  status: string;
  cover_image: string;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
};

export type SessionsRow = {
  token_hash: string;
  admin_id: string;
  expires_at: Date;
  created_at: Date;
};

export type SiteModulesRow = {
  site_id: string;
  module: string;
};

export type SitesRow = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  status: string;
  accent: string;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
};

export type SlugsRow = {
  entity_type: string;
  slug: string;
  entity_id: string;
  is_current: boolean;
  created_at: Date;
  site_id: string;
};

export type SponsorsRow = {
  id: string;
  site_id: string;
  tier: string;
  slug: string;
  name: string;
  logo: string;
  full_logo: string;
  website: string;
  description: string;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
};

export type TeamProfileRow = {
  site_id: string;
  name: string;
  abbreviation: string;
  tagline: string;
  description: string;
  founded: number;
  current_season: number;
  headquarters: string;
  championship: string;
  official_website: string;
  contact_email: string;
  contact_phone: string;
  contact_address: string;
  contact_map_embed: string;
  instagram_url: string;
  facebook_url: string;
  twitter_url: string;
  youtube_url: string;
  principal_name: string;
  principal_title: string;
  principal_image: string;
  hero_title: string;
  hero_subtitle: string;
  hero_description: string;
  hero_video: string;
  about_title: string;
  about_subtitle: string;
  about_body_1: string;
  about_body_2: string;
  about_image: string;
  updated_at: Date;
};

export type TeamStatsRow = {
  site_id: string;
  placement: string;
  position: number;
  value: string;
  label: string;
};

export type TrackLinksRow = {
  track_id: string;
  position: number;
  label: string;
  href: string;
};

export type TracksRow = {
  id: string;
  name: string;
  location: string;
  photo_url: string;
  map_url: string;
  svg_path: string;
  svg_view_box: string;
  length: string;
  turns: string;
  direction: string;
  opened: string;
  broke_ground: string;
  former_names: string;
  owner: string;
  fia_grade: string;
  coordinates: string;
  capacity: string;
  major_events: string;
  lap_record_time: string;
  lap_record_year: string;
  races_held: number;
  note: string;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
  slug: string;
  site_id: string;
};

/** Every table in the schema, by name. */
export type CtrTables = {
  achievements: AchievementsRow;
  admin_grants: AdminGrantsRow;
  admins: AdminsRow;
  articles: ArticlesRow;
  car: CarRow;
  car_specs: CarSpecsRow;
  driver_highlights: DriverHighlightsRow;
  drivers: DriversRow;
  events: EventsRow;
  schema_migrations: SchemaMigrationsRow;
  seasons: SeasonsRow;
  sessions: SessionsRow;
  site_modules: SiteModulesRow;
  sites: SitesRow;
  slugs: SlugsRow;
  sponsors: SponsorsRow;
  team_profile: TeamProfileRow;
  team_stats: TeamStatsRow;
  track_links: TrackLinksRow;
  tracks: TracksRow;
};
